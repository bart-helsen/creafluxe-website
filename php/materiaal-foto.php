<?php
// Photo proxy for the Materialen page.
//
// Fetches a published sample photo from the admin app, scales it down (the
// originals are straight from the phone camera, over a megabyte each) and caches
// the result in the temp folder. The URL carries the photo's version (v), so
// browsers can keep it for a year. Without the GD extension the original is
// served as is.

declare(strict_types=1);

require_once __DIR__ . '/materialen-common.php';

function fail(int $status, string $message): never
{
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    echo $message;
    exit;
}

$id = (string) ($_GET['id'] ?? '');
$version = (string) ($_GET['v'] ?? '0');
$width = (int) ($_GET['w'] ?? 1400);

if (!preg_match('/^[A-Za-z0-9_-]{8,64}$/', $id) || !preg_match('/^\d{1,16}$/', $version)) {
    fail(400, 'Ongeldige aanvraag.');
}
// Only the two sizes the page uses, so the cache cannot be filled with variants.
$width = $width <= 520 ? 520 : 1400;

$canWebp = function_exists('imagewebp') && str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'image/webp');
$canResize = function_exists('imagecreatefromstring') && function_exists('imagecreatetruecolor');
$format = $canResize ? ($canWebp ? 'webp' : 'jpg') : 'orig';

$dir = materials_cache_dir();
$cached = "$dir/foto-{$id}-{$version}-{$width}.{$format}";
$mime = ['webp' => 'image/webp', 'jpg' => 'image/jpeg'][$format] ?? null;

if (!is_file($cached)) {
    [$status, $body] = materials_http_get(
        materials_admin_url() . '/api/public/materials/image/' . rawurlencode($id),
        15
    );
    if ($status === 404) {
        fail(404, 'Foto niet gevonden.');
    }
    if ($status !== 200 || $body === '') {
        fail(502, 'Foto tijdelijk niet beschikbaar.');
    }

    $out = $body;
    if ($canResize) {
        $src = @imagecreatefromstring($body);
        if ($src !== false) {
            $w = imagesx($src);
            $h = imagesy($src);
            $scale = min(1.0, $width / max(1, $w));
            $nw = max(1, (int) round($w * $scale));
            $nh = max(1, (int) round($h * $scale));
            $dst = imagecreatetruecolor($nw, $nh);
            imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
            ob_start();
            if ($format === 'webp') {
                imagewebp($dst, null, 82);
            } else {
                imagejpeg($dst, null, 84);
            }
            $out = (string) ob_get_clean();
            imagedestroy($src);
            imagedestroy($dst);
        } else {
            $format = 'orig';
            $mime = null;
        }
    }
    if ($format !== 'orig') {
        @file_put_contents($cached, $out, LOCK_EX);
    }
    $payload = $out;
} else {
    $payload = (string) file_get_contents($cached);
}

if ($mime === null) {
    // Original bytes: sniff the type (png/jpeg/webp only).
    $mime = str_starts_with($payload, "\x89PNG") ? 'image/png'
        : (str_starts_with($payload, "\xFF\xD8") ? 'image/jpeg' : 'image/webp');
}

header('Content-Type: ' . $mime);
header('Content-Length: ' . strlen($payload));
header('Cache-Control: public, max-age=31536000, immutable');
header('Vary: Accept');
header('X-Content-Type-Options: nosniff');
echo $payload;
