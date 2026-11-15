<?php
// Organizer wall configurator (organizer-wand.html): check the JSON the page sends,
// describe it in words for the e-mails, and write the lines for the generator
// (product-tools/organizing-wall/generator/config.py).
//
// The sizes follow the generator's defaults: 3 mm material, a keyhole every 32 mm.
// Keep the limits here in step with assets/js/configurator-organizer.js.

declare(strict_types=1);

const OW_WALL = ['w' => [300, 2400], 'h' => [300, 1500]];
const OW_BOX = ['inner_w' => [30, 400], 'inner_d' => [20, 150], 'h_back' => [20, 200], 'h_front' => [15, 200]];
const OW_MAX_TYPES = 12;
const OW_MAX_PER_TYPE = 40;
const OW_MAX_BOXES = 80;
const OW_T = 3.0;              // material thickness (T_BOX)
const OW_MIN_COMPARTMENT = 15; // mm between two dividers
const OW_TWO_PEGS = 38;        // inner width or back height from which two pegs fit (one peg lets a box swing)

function owNumber(mixed $v, array $range): int|float|null
{
    if (!is_int($v) && !is_float($v)) return null;
    return ($v >= $range[0] && $v <= $range[1]) ? $v : null;
}

/** Validated configuration (rebuilt from known fields only), or null when it is not acceptable. */
function organizingWallConfiguration(string $json): ?array
{
    $c = json_decode($json, true);
    if (!is_array($c) || ($c['product'] ?? null) !== 'organizing-wall' || ($c['version'] ?? null) !== 1) return null;
    $o = $c['options'] ?? null;
    if (!is_array($o)) return null;

    $w = owNumber($o['wall']['w'] ?? null, OW_WALL['w']);
    $h = owNumber($o['wall']['h'] ?? null, OW_WALL['h']);
    if ($w === null || $h === null) return null;

    $in = $o['boxes'] ?? null;
    if (!is_array($in) || count($in) < 1 || count($in) > OW_MAX_TYPES) return null;

    $boxes = [];
    $total = 0;
    foreach (array_values($in) as $i => $b) {
        if (!is_array($b)) return null;
        $box = ['id' => 'bak' . ($i + 1)];
        foreach (OW_BOX as $key => $range) {
            $v = owNumber($b[$key] ?? null, $range);
            if ($v === null) return null;
            $box[$key] = $v;
        }
        if ($box['h_front'] > $box['h_back']) return null;
        if ($box['inner_w'] < OW_TWO_PEGS && $box['h_back'] < OW_TWO_PEGS) return null;

        $dividers = $b['dividers'] ?? 0;
        if (!is_int($dividers) || $dividers < 0 || $dividers > 8) return null;
        if (($box['inner_w'] - $dividers * OW_T) / ($dividers + 1) < OW_MIN_COMPARTMENT) return null;
        $box['dividers'] = $dividers;

        // A finger scoop needs a front plate that is wide and high enough.
        $scoop = !empty($b['scoop']);
        if ($scoop && ($box['inner_w'] < 50 || $box['h_front'] < 25)) return null;
        $box['scoop'] = $scoop;

        $qty = $b['qty'] ?? null;
        if (!is_int($qty) || $qty < 1 || $qty > OW_MAX_PER_TYPE) return null;
        $box['qty'] = $qty;
        $total += $qty;

        $label = $b['label'] ?? '';
        if (!is_string($label)) return null;
        $label = trim(preg_replace('/[^\P{C}]/u', '', $label) ?? '');
        $box['label'] = mb_substr($label, 0, 40);
        $boxes[] = $box;
    }
    if ($total > OW_MAX_BOXES) return null;

    // Where the page hung every box: [box id, column, row] of its top-left peg. Only kept
    // when it is complete; the generator checks it again.
    $layout = [];
    $ids = array_column($boxes, 'qty', 'id');
    $seen = array_fill_keys(array_keys($ids), 0);
    foreach ((array) ($o['layout'] ?? []) as $item) {
        if (!is_array($item) || count($item) !== 3) return null;
        [$id, $col, $row] = array_values($item);
        if (!is_string($id) || !isset($ids[$id]) || !is_int($col) || !is_int($row) || $col < 1 || $row < 1 || $col > 200 || $row > 200) return null;
        $seen[$id]++;
        $layout[] = [$id, $col, $row];
    }
    if ($seen !== $ids) $layout = [];

    return [
        'product' => 'organizing-wall',
        'version' => 1,
        'quantity' => 1,
        'options' => ['wall' => ['w' => $w, 'h' => $h], 'boxes' => $boxes, 'layout' => $layout],
    ];
}

/** The choices as text lines, for the e-mails. */
function organizingWallSummary(array $c): string
{
    $o = $c['options'];
    $lines = [
        'Product: Organizer-wand',
        "Wand: {$o['wall']['w']} x {$o['wall']['h']} mm (b x h)",
        'Bakjes:',
    ];
    foreach ($o['boxes'] as $b) {
        $name = $b['label'] !== '' ? $b['label'] : $b['id'];
        $extra = [];
        if ($b['dividers'] > 0) $extra[] = ($b['dividers'] + 1) . ' vakken';
        if ($b['scoop']) $extra[] = 'met greep';
        $lines[] = "- {$b['qty']} x $name: {$b['inner_w']} x {$b['inner_d']} mm binnenmaat (b x d), "
            . "{$b['h_back']} mm hoog achteraan, {$b['h_front']} mm vooraan"
            . ($extra ? ' (' . implode(', ', $extra) . ')' : '');
    }
    return implode("\n", $lines);
}

/** Lines to paste into generator/config.py (WALL_W, WALL_H, BOXES, LAYOUT). */
function organizingWallGeneratorConfig(array $c): string
{
    $o = $c['options'];
    $py = "# Organizer-wand van de website: plak dit in generator/config.py\n"
        . "WALL_W = {$o['wall']['w']}\nWALL_H = {$o['wall']['h']}\n\nBOXES = {\n";
    foreach ($o['boxes'] as $b) {
        $notch = $b['scoop'] ? '(30, 15)' : 'None';
        $comment = $b['label'] !== '' ? '    # ' . str_replace(["\r", "\n"], ' ', $b['label']) . "\n" : '';
        $py .= $comment . "    \"{$b['id']}\": dict(inner_w={$b['inner_w']}, inner_d={$b['inner_d']}, h_back={$b['h_back']}, "
            . "h_front={$b['h_front']}, qty={$b['qty']}, dividers={$b['dividers']},\n"
            . "                 front_notch=$notch, peg_cols=\"auto\", peg_rows=\"auto\"),\n";
    }
    $py .= "}\n\nLAYOUT = [\n";
    foreach ($o['layout'] as [$id, $col, $row]) {
        $py .= "    (\"$id\", $col, $row),\n";
    }
    return $py . "]\n";
}
