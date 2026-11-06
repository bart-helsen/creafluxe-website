<?php
// Memory box configurator: check the JSON the page sends and describe it in
// words for the e-mails. The admin app checks it again (src/lib/product-config.ts)
// and the generator reads the same shape (product-tools/memory-box, --config).
// Keep the limits here in step with those two.

declare(strict_types=1);

const MB_LIMITS = ['w' => [120, 340], 'd' => [100, 250], 'h' => [50, 150]];
const MB_LIDS = ['lift' => 'Opliggend deksel', 'slide' => 'Schuifdeksel', 'hinge' => 'Scharnierdeksel'];
const MB_FEET = ['arch' => 'Pootjes', 'flat' => 'Vlakke onderkant'];
const MB_BORDERS = ['vine' => 'Rank', 'hearts' => 'Hartjes', 'stars' => 'Sterren', 'dots' => 'Stippen',
    'scallop' => 'Golfrand', 'double' => 'Dubbele lijn', 'none' => 'Geen rand'];
const MB_ORNAMENTS = ['heart' => 'Hart', 'hearts' => 'Hartjes', 'star' => 'Ster', 'none' => 'Geen'];

function mbText(mixed $v, int $max): ?string
{
    if (!is_string($v)) return null;
    $v = trim(preg_replace('/[^\P{C}]/u', '', $v) ?? '');
    return mb_strlen($v) <= $max ? $v : null;
}

/** @return list<float>|null */
function mbFractions(mixed $v): ?array
{
    if (!is_array($v) || count($v) > 3) return null;
    $out = [];
    foreach ($v as $f) {
        if (!is_int($f) && !is_float($f)) return null;
        if ($f <= 0 || $f >= 1) return null;
        $out[] = (float) $f;
    }
    sort($out);
    return $out;
}

/** Validated configuration (rebuilt from known fields only), or null when it is not acceptable. */
function memoryBoxConfiguration(string $json): ?array
{
    $c = json_decode($json, true);
    if (!is_array($c) || ($c['product'] ?? null) !== 'memory-box' || ($c['version'] ?? null) !== 1) return null;
    $o = $c['options'] ?? null;
    if (!is_array($o)) return null;

    $qty = $c['quantity'] ?? 1;
    if (!is_int($qty) || $qty < 1 || $qty > 50) return null;

    $inner = [];
    foreach (MB_LIMITS as $k => [$min, $max]) {
        $v = $o['inner'][$k] ?? null;
        if ((!is_int($v) && !is_float($v)) || $v < $min || $v > $max) return null;
        $inner[$k] = $v;
    }
    $lid = $o['lid'] ?? null;
    $feet = $o['feet'] ?? null;
    $border = $o['border'] ?? null;
    $ornament = $o['ornament'] ?? null;
    if (!is_string($lid) || !isset(MB_LIDS[$lid])) return null;
    if (!is_string($feet) || !isset(MB_FEET[$feet])) return null;
    if (!is_string($border) || !isset(MB_BORDERS[$border])) return null;
    if (!is_string($ornament) || !isset(MB_ORNAMENTS[$ornament])) return null;

    $dividers = mbFractions($o['dividers'] ?? []);
    $dividersY = mbFractions($o['dividersY'] ?? []);
    if ($dividers === null || $dividersY === null) return null;
    // Compartments of at least 15 mm, like the generator (a sliding lid has 2 x 3 mm liners).
    foreach ([[$dividers, $lid === 'slide' ? $inner['w'] - 6 : $inner['w']], [$dividersY, $inner['d']]] as [$fr, $size]) {
        $edges = array_merge([0], array_map(fn($f) => $f * $size, $fr), [$size]);
        for ($i = 1; $i < count($edges); $i++) {
            if ($edges[$i] - $edges[$i - 1] - 3 < 15) return null;
        }
    }

    $name = mbText($o['name'] ?? '', 40);
    $date = mbText($o['date'] ?? '', 30);
    if ($name === null || $date === null) return null;

    $photo = null;
    if (!empty($o['photoWindow'])) {
        $pw = $o['photoWindow']['w'] ?? null;
        $ph = $o['photoWindow']['h'] ?? null;
        if ((!is_int($pw) && !is_float($pw)) || (!is_int($ph) && !is_float($ph))) return null;
        // Room around the window for the border and the name (same margins as the page).
        if ($lid !== 'lift' || $pw <= 0 || $ph <= 0 || $pw > $inner['w'] - 30 || $ph > $inner['d'] - 63) return null;
        $photo = ['w' => $pw, 'h' => $ph];
    }
    // The real file name is filled in from the upload; here only "wants artwork".
    $artwork = !empty($o['artwork']) ? 'pending' : null;
    if ($photo !== null && $artwork !== null) return null;

    return [
        'product' => 'memory-box',
        'version' => 1,
        'quantity' => $qty,
        'options' => [
            'lid' => $lid,
            'inner' => $inner,
            'dividers' => $dividers,
            'dividersY' => $dividersY,
            'feet' => $feet,
            'border' => $border,
            'ornament' => $ornament,
            'name' => $name,
            'date' => $date,
            'photoWindow' => $photo,
            'artwork' => $artwork,
        ],
    ];
}

function mbCompartments(array $fr): string
{
    if (!$fr) return 'geen';
    return (count($fr) + 1) . ' vakken';
}

/** The choices as text lines, for the e-mails. */
function memoryBoxSummary(array $c): string
{
    $o = $c['options'];
    $lines = [
        'Product: Herinneringsdoos',
        'Aantal: ' . $c['quantity'],
        "Binnenmaat: {$o['inner']['w']} x {$o['inner']['d']} x {$o['inner']['h']} mm (b x d x h)",
        'Deksel: ' . MB_LIDS[$o['lid']],
        'Vakken links-rechts: ' . mbCompartments($o['dividers']),
        'Vakken voor-achter: ' . mbCompartments($o['dividersY']),
        'Onderkant: ' . MB_FEET[$o['feet']],
        'Rand: ' . MB_BORDERS[$o['border']],
        'Ornament: ' . MB_ORNAMENTS[$o['ornament']],
        'Naam: ' . ($o['name'] !== '' ? $o['name'] : '-'),
        'Datum: ' . ($o['date'] !== '' ? $o['date'] : '-'),
    ];
    if ($o['photoWindow']) $lines[] = "Fotovenster: {$o['photoWindow']['w']} x {$o['photoWindow']['h']} mm";
    if ($o['artwork']) $lines[] = "Eigen tekening: {$o['artwork']} (in bijlage)";
    return implode("\n", $lines);
}
