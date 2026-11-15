<?php
// Handler for every request form on the site:
//   - Atelier (atelier.html): an idea, with files and an optional delivery address.
//   - Webshop (webshop.html): an existing product with the customer's text and file.
//   - Configurators (herinneringsdoos.html, organizer-wand.html): "product" and a
//     "configuration" JSON; see memory-box.php and organizing-wall.php.
//
// 1. Validates the form and blocks obvious spam (honeypot, too-fast submit,
//    same-origin check, simple per-IP rate limit).
// 2. Posts the request to the admin app as a CUSTOM intake
//    (POST /api/orders/intake, see administration/docs/04 + 08), when intake_key is set.
// 3. Always e-mails the request to offer@creafluxe.be with the customer's files and
//    an aanvraag.json that holds the same request in a fixed shape, so the admin
//    app can pick it up from that mailbox and nothing is lost when the admin app is
//    unreachable ("belt and braces", doc 08).
// 4. Sends the customer a short confirmation.
//
// Answers JSON when the browser asks for it (fetch), otherwise redirects to
// bedankt.html or back to the form, so it also works without JavaScript.

declare(strict_types=1);

require_once __DIR__ . '/memory-box.php';
require_once __DIR__ . '/organizing-wall.php';

// Settings come from private/config.php (EasyHost) or, when that file is
// absent, from environment variables (Railway test site).
$configFile = __DIR__ . '/../private/config.php';
$config = is_file($configFile) ? require $configFile : [
    'intake_url' => getenv('INTAKE_URL') ?: 'https://admin.creafluxe.be/api/orders/intake',
    'intake_key' => getenv('INTAKE_KEY') ?: '',
    'notify_to' => getenv('NOTIFY_TO') ?: 'offer@creafluxe.be',
    'mail_from' => getenv('MAIL_FROM') ?: 'noreply@creafluxe.be',
    'allowed_origins' => array_filter(array_map('trim', explode(',', getenv('ALLOWED_ORIGINS') ?: 'https://test.creafluxe.be'))),
];

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'pdf', 'svg', 'dxf', 'dwg', 'ai', 'eps'];
// Where a failed request without JavaScript goes back to.
const RETURN_PAGES = [
    'atelier' => 'atelier.html?fout=1#aanvraag',
    'webshop' => 'webshop.html?fout=1',
    'memory-box' => 'herinneringsdoos.html?fout=1',
    'organizing-wall' => 'organizer-wand.html?fout=1',
];

$wantsJson = str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json');

function respond(bool $ok, string $error = '', int $status = 200): never
{
    global $wantsJson;
    if ($wantsJson) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($ok ? ['ok' => true] : ['ok' => false, 'error' => $error], JSON_UNESCAPED_UNICODE);
    } else {
        global $returnPage;
        header('Location: ../' . ($ok ? 'bedankt.html' : $returnPage), true, 303);
    }
    exit;
}

function field(string $key, int $max): string
{
    $v = trim((string) ($_POST[$key] ?? ''));
    // Drop control characters (keeps newlines and tabs), cap the length.
    $v = preg_replace('/[^\P{C}\n\t]/u', '', $v) ?? '';
    return mb_substr($v, 0, $max);
}

/** The webshop products (assets/data/producten.json), by id. */
function shopProducts(): array
{
    $data = json_decode((string) @file_get_contents(__DIR__ . '/../assets/data/producten.json'), true);
    $out = [];
    foreach ((array) ($data['products'] ?? []) as $p) {
        if (is_array($p) && isset($p['id'], $p['name']) && empty($p['configurator'])) $out[(string) $p['id']] = $p;
    }
    return $out;
}

// Which form this is: a configurator sends "product", the others send "kind".
$product = field('product', 40);
$kind = $product !== '' ? 'configurator' : (field('kind', 20) === 'webshop' ? 'webshop' : 'atelier');
$returnPage = RETURN_PAGES[$kind === 'configurator' ? $product : $kind] ?? RETURN_PAGES['atelier'];

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, 'Ongeldige aanvraag.', 405);
}

// --- Spam and abuse checks ---------------------------------------------------

// Same-origin: browsers send Origin on POST; reject other sites posting here.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && !in_array($origin, $config['allowed_origins'], true)) {
    respond(false, 'Ongeldige aanvraag.', 403);
}

// Honeypot filled in, or the form was sent within 3 seconds of loading: a bot.
// Pretend it worked so the bot learns nothing.
$started = (int) ($_POST['started'] ?? 0);
if (field('website', 200) !== '' || ($started > 0 && time() - $started < 3)) {
    respond(true);
}

// Rate limit: at most 5 requests per IP per hour, tracked in a temp file.
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$rateFile = sys_get_temp_dir() . '/creafluxe-rate-' . hash('sha256', $ip);
$hits = array_filter(
    is_file($rateFile) ? (array) json_decode((string) file_get_contents($rateFile), true) : [],
    fn($t) => is_int($t) && $t > time() - 3600
);
if (count($hits) >= 5) {
    respond(false, 'Je hebt al enkele aanvragen verstuurd. Probeer het later opnieuw of mail naar ' . $config['notify_to'] . '.', 429);
}
$hits[] = time();
@file_put_contents($rateFile, json_encode(array_values($hits)), LOCK_EX);

// --- Validate ----------------------------------------------------------------

$name      = field('name', 120);
$email     = field('email', 200);
$phone     = field('phone', 40);
$technique = field('technique', 40);
$material  = field('material', 120);
$brief     = field('brief', 4000);

// A configurator page sends its choices as JSON.
$configuration = null;
if ($kind === 'configurator') {
    $json = (string) ($_POST['configuration'] ?? '');
    $configuration = match ($product) {
        'memory-box' => memoryBoxConfiguration($json),
        'organizing-wall' => organizingWallConfiguration($json),
        default => null,
    };
    if ($configuration === null) respond(false, 'Je keuzes konden niet worden gelezen. Herlaad de pagina en probeer opnieuw.', 422);
}

// A webshop request names a product from assets/data/producten.json.
$shopItem = null;
$shopQty = 1;
$shopText = '';
if ($kind === 'webshop') {
    $shopItem = shopProducts()[field('product_id', 60)] ?? null;
    if ($shopItem === null) respond(false, 'Dit product werd niet gevonden. Herlaad de pagina en probeer opnieuw.', 422);
    $shopQty = max(1, min(50, (int) ($_POST['quantity'] ?? 1)));
    $shopText = field('personal_text', 300);
}

// Delivery: an address is only needed when the customer asks for delivery.
$delivery = null;
if (($_POST['delivery'] ?? '') === '1') {
    $delivery = [
        'street' => field('street', 160),
        'postcode' => field('postcode', 12),
        'city' => field('city', 80),
        'country' => field('country', 60) ?: 'België',
        'notes' => field('delivery_notes', 300),
    ];
    if ($delivery['street'] === '' || $delivery['postcode'] === '' || $delivery['city'] === '') {
        respond(false, 'Vul het leveringsadres volledig in, of vink leveren uit.', 422);
    }
}

if ($name === '') respond(false, 'Vul je naam in.', 422);
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) respond(false, 'Vul een geldig e-mailadres in.', 422);
if ($kind === 'atelier' && mb_strlen($brief) < 10) respond(false, 'Beschrijf je idee in minstens een paar woorden.', 422);
if (($_POST['privacy'] ?? '') !== '1') respond(false, 'Vink aan dat je akkoord gaat met de privacyverklaring.', 422);
if (!in_array($technique, ['Weet ik nog niet', 'Snijden', 'Graveren', 'Snijden en graveren'], true)) {
    $technique = 'Weet ik nog niet';
}

// Uploaded files: check count, size and extension; keep them in PHP's temp dir.
$files = [];
if (!empty($_FILES['files']['name'][0])) {
    $count = count($_FILES['files']['name']);
    if ($count > MAX_FILES) respond(false, 'Je kunt maximaal ' . MAX_FILES . ' bestanden meesturen.', 422);
    for ($i = 0; $i < $count; $i++) {
        $err = $_FILES['files']['error'][$i];
        if ($err === UPLOAD_ERR_NO_FILE) continue;
        $orig = basename((string) $_FILES['files']['name'][$i]);
        if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE || $_FILES['files']['size'][$i] > MAX_FILE_BYTES) {
            respond(false, "\u{201C}$orig\u{201D} is groter dan 10 MB.", 422);
        }
        if ($err !== UPLOAD_ERR_OK || !is_uploaded_file($_FILES['files']['tmp_name'][$i])) {
            respond(false, "\u{201C}$orig\u{201D} kon niet worden opgeladen. Probeer het opnieuw.", 422);
        }
        $ext = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
        if (!in_array($ext, ALLOWED_EXT, true)) {
            respond(false, "\u{201C}$orig\u{201D} is geen ondersteund bestandstype. Gebruik een foto, PDF, SVG, DXF, AI of EPS.", 422);
        }
        $files[] = [
            'name' => preg_replace('/[^A-Za-z0-9._-]+/', '_', $orig),
            'path' => $_FILES['files']['tmp_name'][$i],
            'mime' => mime_content_type($_FILES['files']['tmp_name'][$i]) ?: 'application/octet-stream',
        ];
    }
}

// The memory box only sends a file when the customer chose their own artwork.
if ($configuration !== null && $product === 'organizing-wall') {
    $files = [];
} elseif ($configuration !== null) {
    if ($configuration['options']['artwork'] !== null) {
        if (!$files) respond(false, 'Kies het bestand met je tekening, of kies een versiering.', 422);
        $configuration['options']['artwork'] = $files[0]['name'];
    } elseif ($files) {
        $files = [];
    }
}

// --- Build the request text ----------------------------------------------------

$fileList = $files ? implode(', ', array_column($files, 'name')) : 'geen';
$deliveryText = $delivery === null ? 'Levering: ophalen'
    : "Levering: aan huis\n{$delivery['street']}\n{$delivery['postcode']} {$delivery['city']}\n{$delivery['country']}"
        . ($delivery['notes'] !== '' ? "\nOpmerking: {$delivery['notes']}" : '');
$subjectPrefix = 'Nieuwe aanvraag: ';
// Only the memory box has a shape the admin app knows (its schema is strict).
$intakeConfiguration = null;

if ($product === 'memory-box') {
    // The admin app lists the choices itself; the brief only carries the remarks.
    $designBrief = $brief !== '' ? "Opmerkingen: $brief" : '';
    $summary = memoryBoxSummary($configuration) . ($designBrief !== '' ? "\n\n$designBrief" : '');
    $subjectPrefix = 'Nieuwe aanvraag herinneringsdoos: ';
    $intakeConfiguration = $configuration;
} elseif ($product === 'organizing-wall') {
    $summary = organizingWallSummary($configuration) . ($brief !== '' ? "\n\nOpmerkingen: $brief" : '');
    $designBrief = $summary;
    $subjectPrefix = 'Nieuwe aanvraag organizer-wand: ';
} elseif ($kind === 'webshop') {
    $summary = "Product: {$shopItem['name']} (webshop, {$shopItem['id']})\nAantal: $shopQty"
        . (isset($shopItem['price']) ? "\nPrijs op de website: EUR {$shopItem['price']} per stuk" : "\nPrijs: op aanvraag")
        . "\nTekst voor de personalisatie: " . ($shopText !== '' ? $shopText : '-')
        . "\nBijlagen: $fileList"
        . ($brief !== '' ? "\n\nOpmerkingen: $brief" : '')
        . "\n\n$deliveryText";
    $designBrief = $summary;
    $subjectPrefix = 'Nieuwe webshop-aanvraag: ';
} else {
    $designBrief = $brief
        . "\n\nTechniek: $technique"
        . ($material !== '' ? "\nMateriaal: $material" : '')
        . "\nBijlagen: $fileList"
        . "\n\n$deliveryText";
    $summary = $designBrief;
}

// --- 1. Send to the admin app --------------------------------------------------

$intakeOk = false;
$requestNumber = null;
if (!empty($config['intake_url']) && !empty($config['intake_key'])) {
    $payload = [
        'type' => 'CUSTOM',
        'clientRef' => 'web-' . bin2hex(random_bytes(8)),
        'customer' => [
            'name' => $name,
            'email' => $email,
            'phone' => $phone !== '' ? $phone : null,
            'isBusiness' => false,
        ],
        'designBrief' => $designBrief !== '' ? $designBrief : null,
        'configuration' => $intakeConfiguration,
    ];
    $ch = curl_init($config['intake_url']);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Api-Key: ' . $config['intake_key']],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
    ]);
    $resp = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code === 200 || $code === 201) {
        $intakeOk = true;
        $requestNumber = json_decode((string) $resp, true)['requestNumber'] ?? null;
    } else {
        error_log("Creafluxe intake failed (HTTP $code): " . substr((string) $resp, 0, 500));
    }
}

// --- 2. E-mail to Creafluxe (always, with attachments) -------------------------

function encodeHeader(string $s): string
{
    return '=?UTF-8?B?' . base64_encode($s) . '?=';
}

function sendMail(string $to, string $from, string $subject, string $body, ?string $replyTo = null, array $attachments = []): bool
{
    $boundary = 'cfx-' . bin2hex(random_bytes(12));
    $headers = [
        'From: ' . encodeHeader('Creafluxe') . " <$from>",
        'MIME-Version: 1.0',
        "Content-Type: multipart/mixed; boundary=\"$boundary\"",
    ];
    if ($replyTo) $headers[] = "Reply-To: $replyTo";

    $msg = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($body)) . "\r\n";
    foreach ($attachments as $a) {
        $msg .= "--$boundary\r\nContent-Type: {$a['mime']}; name=\"{$a['name']}\"\r\n"
            . "Content-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"{$a['name']}\"\r\n\r\n"
            . chunk_split(base64_encode((string) file_get_contents($a['path']))) . "\r\n";
    }
    $msg .= "--$boundary--";

    return mail($to, encodeHeader($subject), $msg, implode("\r\n", $headers), '-f' . $from);
}

$adminLine = $intakeOk
    ? 'Staat in de admin-app' . ($requestNumber ? " als aanvraag $requestNumber" : '') . '.'
    : 'LET OP: niet in de admin-app geraakt. Voeg deze aanvraag manueel toe.';

$notifyBody = "Nieuwe aanvraag via creafluxe.be\n\n"
    . "Naam: $name\nE-mail: $email\nTelefoon: " . ($phone !== '' ? $phone : '-') . "\n\n"
    . "$summary\n\n$adminLine\n";

// Files for Creafluxe: what the customer sent, the request itself in a fixed shape
// (aanvraag.json, for the admin app reading this mailbox), and for a configurator
// the configuration for the generator.
$notifyFiles = $files;
$tempFiles = [];
$attach = function (string $name, string $content, string $mime) use (&$notifyFiles, &$tempFiles): void {
    $path = (string) tempnam(sys_get_temp_dir(), 'cfx-');
    file_put_contents($path, $content);
    $tempFiles[] = $path;
    $notifyFiles[] = ['name' => $name, 'path' => $path, 'mime' => $mime];
};
$jsonFlags = JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
$attach('aanvraag.json', json_encode([
    'source' => 'creafluxe.be',
    'version' => 1,
    'kind' => $kind === 'configurator' ? $product : $kind,
    'receivedAt' => date('c'),
    'requestNumber' => $requestNumber,
    'customer' => ['name' => $name, 'email' => $email, 'phone' => $phone !== '' ? $phone : null],
    'delivery' => $delivery,
    'technique' => $kind === 'atelier' ? $technique : null,
    'material' => $material !== '' ? $material : null,
    'brief' => $brief !== '' ? $brief : null,
    'product' => $shopItem === null ? null : [
        'id' => $shopItem['id'], 'name' => $shopItem['name'], 'price' => $shopItem['price'] ?? null,
        'quantity' => $shopQty, 'personalText' => $shopText !== '' ? $shopText : null,
    ],
    'configuration' => $configuration,
    'files' => array_column($files, 'name'),
], $jsonFlags) . "\n", 'application/json');
if ($product === 'memory-box') {
    $attach('configuratie-memory-box.json', json_encode($configuration, $jsonFlags) . "\n", 'application/json');
} elseif ($product === 'organizing-wall') {
    $attach('organizer-wand-config.py.txt', organizingWallGeneratorConfig($configuration), 'text/plain');
}

$mailOk = sendMail(
    $config['notify_to'],
    $config['mail_from'],
    $subjectPrefix . $name,
    $notifyBody,
    $email,
    $notifyFiles
);
foreach ($tempFiles as $path) @unlink($path);

if (!$intakeOk && !$mailOk) {
    error_log('Creafluxe request lost: intake and mail both failed for ' . $email);
    respond(false, 'Versturen is niet gelukt. Mail je idee naar ' . $config['notify_to'] . ', dan bekijk ik het meteen.', 502);
}

// --- 3. Confirmation to the customer -----------------------------------------

$firstName = explode(' ', $name)[0];
$confirmBody = "Dag $firstName,\n\n"
    . "Bedankt voor je aanvraag bij Creafluxe. Ik heb ze goed ontvangen en bekijk ze zo snel mogelijk. "
    . "Je hoort binnen twee werkdagen van me" . ($kind === 'webshop' ? " met een bevestiging en de betaalgegevens.\n\n" : " met een voorstel en een prijs.\n\n")
    . "Wat je me stuurde:\n\n$summary\n\n"
    . "Wil je nog iets toevoegen? Antwoord gewoon op deze e-mail.\n\n"
    . "Tot snel,\nCreafluxe\nBring your design to life\n";

sendMail($email, $config['mail_from'], 'We hebben je aanvraag ontvangen', $confirmBody, $config['notify_to']);

respond(true);
