<?php
// JSON feed for the Materialen page (materialen.html).
//
// Reads the published material samples from the admin app
// (GET /api/public/materials) and hands them to the page with image paths that
// point at php/materiaal-foto.php. The answer is cached for 5 minutes in the
// temp folder; when the admin app is down the last good copy is served instead,
// so the page keeps working.

declare(strict_types=1);

require_once __DIR__ . '/materialen-common.php';

const FEED_TTL = 300;          // seconds a fresh copy is used without asking the admin app
const FEED_STALE_MAX = 604800; // a week: how old a copy may be when the admin app is down

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$cacheFile = materials_cache_dir() . '/feed.json';
$age = is_file($cacheFile) ? time() - (int) filemtime($cacheFile) : PHP_INT_MAX;

$json = null;
if ($age < FEED_TTL) {
    $json = file_get_contents($cacheFile) ?: null;
}

if ($json === null) {
    [$status, $body] = materials_http_get(materials_admin_url() . '/api/public/materials');
    $data = $status === 200 ? json_decode($body, true) : null;
    if (is_array($data) && ($data['ok'] ?? false) === true && is_array($data['materials'] ?? null)) {
        foreach ($data['materials'] as &$material) {
            foreach ($material['operations'] as &$operation) {
                foreach ($operation['samples'] as &$sample) {
                    // /api/public/materials/image/<id>?v=<version>  ->  local proxy
                    $version = '0';
                    if (preg_match('/[?&]v=(\d+)/', (string) ($sample['image'] ?? ''), $m)) {
                        $version = $m[1];
                    }
                    $id = rawurlencode((string) $sample['id']);
                    $sample['thumb'] = "php/materiaal-foto.php?id={$id}&v={$version}&w=520";
                    $sample['image'] = "php/materiaal-foto.php?id={$id}&v={$version}&w=1400";
                }
                unset($sample);
            }
            unset($operation);
        }
        unset($material);
        $json = json_encode(['ok' => true, 'materials' => $data['materials']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        @file_put_contents($cacheFile, $json, LOCK_EX);
    } elseif ($age < FEED_STALE_MAX) {
        $json = file_get_contents($cacheFile) ?: null;
    }
}

if ($json === null) {
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'De materialen zijn tijdelijk niet beschikbaar.']);
    exit;
}

header('Cache-Control: public, max-age=60');
echo $json;
