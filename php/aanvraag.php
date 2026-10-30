<?php
// Request form handler ("Start met je idee").
//
// 1. Validates the form and blocks obvious spam (honeypot, too-fast submit,
//    same-origin check, simple per-IP rate limit).
// 2. Posts the request to the admin app as a CUSTOM intake
//    (POST /api/orders/intake, see administration/docs/04 + 08).
// 3. Always e-mails the request with its attachments to Creafluxe, so nothing
//    is lost when the admin app is unreachable ("belt and braces", doc 08).
// 4. Sends the customer a short confirmation.
//
// Answers JSON when the browser asks for it (fetch), otherwise redirects to
// bedankt.html or back to the form, so it also works without JavaScript.

declare(strict_types=1);

// Settings come from private/config.php (EasyHost) or, when that file is
// absent, from environment variables (Railway test site).
$configFile = __DIR__ . '/../private/config.php';
$config = is_file($configFile) ? require $configFile : [
    'intake_url' => getenv('INTAKE_URL') ?: 'https://admin.creafluxe.be/api/orders/intake',
    'intake_key' => getenv('INTAKE_KEY') ?: '',
    'notify_to' => getenv('NOTIFY_TO') ?: 'offerte@creafluxe.be',
    'mail_from' => getenv('MAIL_FROM') ?: 'noreply@creafluxe.be',
    'allowed_origins' => array_filter(array_map('trim', explode(',', getenv('ALLOWED_ORIGINS') ?: 'https://test.creafluxe.be'))),
];

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'pdf', 'svg', 'dxf', 'ai', 'eps'];

$wantsJson = str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json');

function respond(bool $ok, string $error = '', int $status = 200): never
{
    global $wantsJson;
    if ($wantsJson) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($ok ? ['ok' => true] : ['ok' => false, 'error' => $error], JSON_UNESCAPED_UNICODE);
    } else {
        header('Location: ' . ($ok ? '../bedankt.html' : '../index.html?fout=1#aanvraag'), true, 303);
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

if ($name === '') respond(false, 'Vul je naam in.', 422);
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) respond(false, 'Vul een geldig e-mailadres in.', 422);
if (mb_strlen($brief) < 10) respond(false, 'Beschrijf je idee in minstens een paar woorden.', 422);
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

// --- Build the request text ----------------------------------------------------

$fileList = $files ? implode(', ', array_column($files, 'name')) : 'geen';
$designBrief = $brief
    . "\n\nTechniek: $technique"
    . ($material !== '' ? "\nMateriaal: $material" : '')
    . "\nBijlagen: $fileList";

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
        'designBrief' => $designBrief,
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
    . "$designBrief\n\n$adminLine\n";

$mailOk = sendMail(
    $config['notify_to'],
    $config['mail_from'],
    "Nieuwe aanvraag: $name",
    $notifyBody,
    $email,
    $files
);

if (!$intakeOk && !$mailOk) {
    error_log('Creafluxe request lost: intake and mail both failed for ' . $email);
    respond(false, 'Versturen is niet gelukt. Mail je idee naar ' . $config['notify_to'] . ', dan bekijk ik het meteen.', 502);
}

// --- 3. Confirmation to the customer -----------------------------------------

$firstName = explode(' ', $name)[0];
$confirmBody = "Dag $firstName,\n\n"
    . "Bedankt voor je aanvraag bij Creafluxe. Ik heb ze goed ontvangen en bekijk ze zo snel mogelijk. "
    . "Je hoort binnen twee werkdagen van me met een voorstel en een prijs.\n\n"
    . "Wat je me stuurde:\n\n$designBrief\n\n"
    . "Wil je nog iets toevoegen? Antwoord gewoon op deze e-mail.\n\n"
    . "Tot snel,\nCreafluxe\nBring your design to life\n";

sendMail($email, $config['mail_from'], 'We hebben je aanvraag ontvangen', $confirmBody, $config['notify_to']);

respond(true);
