<?php
// Shared helpers for the Materialen page: where the admin app lives, a small
// HTTP GET, and a file cache in the temp folder. The material photos are managed
// once in the admin app (admin.creafluxe.be) and read from there; nothing is
// stored in this repo.

declare(strict_types=1);

function materials_admin_url(): string
{
    $configFile = __DIR__ . '/../private/config.php';
    $config = is_file($configFile) ? (require $configFile) : [];
    $url = $config['admin_url'] ?? (getenv('ADMIN_URL') ?: 'https://admin.creafluxe.be');
    return rtrim((string) $url, '/');
}

function materials_cache_dir(): string
{
    $dir = rtrim(sys_get_temp_dir(), '/\\') . '/creafluxe-materials';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    return $dir;
}

/** GET a URL; returns [status, body] or [0, ''] when the admin app is unreachable. */
function materials_http_get(string $url, int $timeout = 8): array
{
    if (!function_exists('curl_init')) {
        $ctx = stream_context_create(['http' => ['timeout' => $timeout, 'ignore_errors' => true]]);
        $body = @file_get_contents($url, false, $ctx);
        if ($body === false) {
            return [0, ''];
        }
        $status = 200;
        foreach ($http_response_header ?? [] as $h) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) {
                $status = (int) $m[1];
            }
        }
        return [$status, $body];
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HTTPHEADER => ['Accept: application/json, image/*'],
    ]);
    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return $body === false ? [0, ''] : [$status, (string) $body];
}
