<?php
/**
 * Shared scoring functions — used by documents.php (live scoring) and
 * recalculate.php (bulk re-score existing documents).
 *
 * Included via require_once from any file that needs getScoringConfig() or computeScore().
 */

/**
 * Default scoring configuration.
 * Each property entry has:
 *   weight     int     — base scoring weight
 *   good_when  bool    — which outcome is positive (true = having this prop is good)
 *   enabled    bool    — whether this property contributes to the score
 *   categories string[] — which categories this belongs to: security, accessibility, usability
 */
function getScoringConfig(PDO $db): array {
    $defaults = [
        'category_multi_bonus' => 0.0, // per extra category: effective_weight = weight * (1 + extras * bonus)
        'properties' => [
            // ── Core structure ─────────────────────────────────────────────
            'is_tagged'             => ['weight' => 12, 'good_when' => true,  'enabled' => true,  'categories' => ['accessibility', 'usability']],
            'pdf_version'           => ['weight' => 8,  'good_when' => true,  'enabled' => true,  'categories' => ['usability', 'security']],
            'is_encrypted'          => ['weight' => 5,  'good_when' => false, 'enabled' => true,  'categories' => ['security']],
            'has_xfa'               => ['weight' => 5,  'good_when' => false, 'enabled' => true,  'categories' => ['security', 'usability']],
            'is_linearized'         => ['weight' => 4,  'good_when' => true,  'enabled' => true,  'categories' => ['usability']],
            'has_pages'             => ['weight' => 3,  'good_when' => true,  'enabled' => true,  'categories' => ['usability']],
            'native_content'        => ['weight' => 2,  'good_when' => true,  'enabled' => true,  'categories' => ['accessibility', 'usability']],
            'has_acroform'          => ['weight' => 0,  'good_when' => false, 'enabled' => false, 'categories' => ['usability']],
            // ── Security / permissions ─────────────────────────────────────
            'has_embedded_files'         => ['weight' => 2,  'good_when' => false, 'enabled' => true,  'categories' => ['security', 'usability']],
            'is_certified'               => ['weight' => 0,  'good_when' => true,  'enabled' => false, 'categories' => ['security', 'usability']],
            'is_signed'                  => ['weight' => 0,  'good_when' => true,  'enabled' => false, 'categories' => ['security']],
            'permissions_allow_copy'     => ['weight' => 3,  'good_when' => true,  'enabled' => true,  'categories' => ['security', 'usability']],
            'perm_assistive_tech'        => ['weight' => 3,  'good_when' => true,  'enabled' => true,  'categories' => ['accessibility']],
            'perm_form_filling'          => ['weight' => 2,  'good_when' => true,  'enabled' => false, 'categories' => ['usability']],
            'perm_page_extraction'       => ['weight' => 1,  'good_when' => true,  'enabled' => false, 'categories' => ['security']],
            'perm_doc_assembly'          => ['weight' => 1,  'good_when' => false, 'enabled' => false, 'categories' => ['security']],
            'perm_commenting'            => ['weight' => 1,  'good_when' => true,  'enabled' => false, 'categories' => ['usability']],
            'perm_printing'              => ['weight' => 2,  'good_when' => true,  'enabled' => true,  'categories' => ['usability']],
            'perm_editing'               => ['weight' => 1,  'good_when' => false, 'enabled' => false, 'categories' => ['security']],
            'pii_author'                 => ['weight' => 4,  'good_when' => false, 'enabled' => true,  'categories' => ['security']],
            // ── Compliance standards ───────────────────────────────────────
            'pdfua_compliance'      => ['weight' => 8,  'good_when' => true,  'enabled' => true,  'categories' => ['accessibility', 'usability']],
            'pdfa_compliance'       => ['weight' => 3,  'good_when' => true,  'enabled' => false, 'categories' => ['usability']],
            'pdfe_compliance'       => ['weight' => 0,  'good_when' => true,  'enabled' => false, 'categories' => ['usability']],
            'pdfvt_compliance'      => ['weight' => 0,  'good_when' => true,  'enabled' => false, 'categories' => ['usability']],
            'pdfx_compliance'       => ['weight' => 0,  'good_when' => true,  'enabled' => false, 'categories' => ['usability']],
            // ── Metadata completeness ──────────────────────────────────────
            'info_title'            => ['weight' => 3,  'good_when' => true,  'enabled' => true,  'categories' => ['usability', 'accessibility']],
            'info_subject'          => ['weight' => 2,  'good_when' => true,  'enabled' => true,  'categories' => ['usability']],
            'info_keywords'         => ['weight' => 2,  'good_when' => true,  'enabled' => true,  'categories' => ['usability']],
            'has_author'            => ['weight' => 2,  'good_when' => true,  'enabled' => true,  'categories' => ['usability']],
            'has_creation_date'     => ['weight' => 1,  'good_when' => true,  'enabled' => true,  'categories' => ['usability']],
        ],
        'accessibility' => [
            'overall_rate'         => ['weight' => 40, 'enabled' => true,  'categories' => ['accessibility']],
            'check_tagged'         => ['weight' => 6,  'enabled' => true,  'categories' => ['accessibility']],
            'check_language'       => ['weight' => 4,  'enabled' => true,  'categories' => ['accessibility']],
            'check_title'          => ['weight' => 3,  'enabled' => true,  'categories' => ['accessibility']],
            'check_alt_text'       => ['weight' => 4,  'enabled' => true,  'categories' => ['accessibility']],
            'check_reading_order'  => ['weight' => 3,  'enabled' => true,  'categories' => ['accessibility']],
            'check_bookmarks'      => ['weight' => 2,  'enabled' => true,  'categories' => ['accessibility', 'usability']],
            'check_color_contrast' => ['weight' => 2,  'enabled' => true,  'categories' => ['accessibility']],
            'check_form_labels'    => ['weight' => 2,  'enabled' => true,  'categories' => ['accessibility', 'usability']],
        ],
    ];
    try {
        $stmt = $db->prepare("SELECT `value` FROM app_settings WHERE `key` = 'scoring_config'");
        $stmt->execute();
        $row = $stmt->fetch();
        if ($row) {
            $saved = json_decode($row['value'], true);
            if (is_array($saved)) {
                // Top-level scalar settings
                if (isset($saved['category_multi_bonus'])) {
                    $defaults['category_multi_bonus'] = (float)$saved['category_multi_bonus'];
                }
                foreach (['properties', 'accessibility'] as $section) {
                    if (!empty($saved[$section]) && is_array($saved[$section])) {
                        foreach ($saved[$section] as $key => $cfg) {
                            if (isset($defaults[$section][$key])) {
                                $defaults[$section][$key] = array_merge($defaults[$section][$key], (array)$cfg);
                            }
                        }
                    }
                }
            }
        }
    } catch (\Throwable $e) {}
    return $defaults;
}

/**
 * Compute a 0–100 score for a document.
 *
 * The effective weight of each property is:
 *   effective_weight = base_weight × (1 + (n_extra_categories) × category_multi_bonus)
 * where n_extra_categories = max(0, count(categories) - 1).
 */
function computeScore(array $props, array $access, array $config = [], array $rawChecks = []): int {
    if (!isset($config['properties']) && !isset($config['accessibility'])) {
        $config = getScoringConfigFromWeights($config);
    }

    $propCfg  = $config['properties']    ?? [];
    $accCfg   = $config['accessibility'] ?? [];
    $catBonus = (float)($config['category_multi_bonus'] ?? 0.0);

    // Helper: effective weight given category bonus
    $eff = static function(array $c) use ($catBonus): float {
        $base = (float)($c['weight'] ?? 0);
        if ($catBonus <= 0 || $base <= 0) return $base;
        $nCats  = count((array)($c['categories'] ?? []));
        $extras = max(0, $nCats - 1);
        return $base * (1.0 + $extras * $catBonus);
    };

    $totalWeight = 0.0;
    foreach ($propCfg as $c) { if (!empty($c['enabled'])) $totalWeight += $eff($c); }
    foreach ($accCfg  as $c) { if (!empty($c['enabled'])) $totalWeight += $eff($c); }
    if ($totalWeight <= 0) $totalWeight = 100;

    $raw = 0.0;

    // ── Accessibility: aggregate pass rate ────────────────────────────────────
    $rateC = $accCfg['overall_rate'] ?? [];
    if (!empty($rateC['enabled'])) {
        $passed   = (int)($access['passed_checks']  ?? 0);
        $failed   = (int)($access['failed_checks']  ?? 0);
        $warnings = (int)($access['warning_checks'] ?? 0);
        $total    = $passed + $failed + $warnings;
        if ($total > 0) {
            $raw += (($passed + $warnings * 0.5) / $total) * $eff($rateC);
        }
    }

    // ── Accessibility: named checks ───────────────────────────────────────────
    if (!empty($rawChecks)) {
        $namedMap = [
            'tagged pdf'        => 'check_tagged',   'pdf tagged'       => 'check_tagged',
            'language'          => 'check_language',
            'title'             => 'check_title',
            'alt text'          => 'check_alt_text',  'alternate text'   => 'check_alt_text',
            'figure'            => 'check_alt_text',
            'reading order'     => 'check_reading_order', 'logical'      => 'check_reading_order',
            'bookmark'          => 'check_bookmarks',
            'color contrast'    => 'check_color_contrast', 'colour contrast' => 'check_color_contrast',
            'form field'        => 'check_form_labels', 'form description' => 'check_form_labels',
        ];
        $scored = [];
        foreach ($rawChecks as $check) {
            $name   = strtolower($check['checkName'] ?? $check['name'] ?? $check['rule'] ?? '');
            $status = strtolower($check['status']    ?? $check['result'] ?? '');
            foreach ($namedMap as $keyword => $cfgKey) {
                if (isset($scored[$cfgKey])) continue;
                if (str_contains($name, $keyword)) {
                    $c = $accCfg[$cfgKey] ?? [];
                    if (!empty($c['enabled']) && ($w = $eff($c)) > 0) {
                        if (str_contains($status, 'pass'))     $raw += $w;
                        elseif (str_contains($status, 'warn')) $raw += $w * 0.5;
                    }
                    $scored[$cfgKey] = true; break;
                }
            }
        }
    }

    // ── PDF properties: boolean ───────────────────────────────────────────────
    _scoreBoolEff($raw, $props, $propCfg, 'is_tagged',              'is_tagged',              $catBonus);
    _scoreBoolEff($raw, $props, $propCfg, 'is_encrypted',           'is_encrypted',           $catBonus);
    _scoreBoolEff($raw, $props, $propCfg, 'has_xfa',                'has_xfa',                $catBonus);
    _scoreBoolEff($raw, $props, $propCfg, 'is_linearized',          'is_linearized',          $catBonus);
    _scoreBoolEff($raw, $props, $propCfg, 'has_acroform',           'has_acroform',           $catBonus);
    _scoreBoolEff($raw, $props, $propCfg, 'has_embedded_files',     'has_embedded_files',     $catBonus);
    _scoreBoolEff($raw, $props, $propCfg, 'is_certified',           'is_certified',           $catBonus);
    _scoreBoolEff($raw, $props, $propCfg, 'is_signed',              'is_signed',              $catBonus);
    _scoreBoolEff($raw, $props, $propCfg, 'permissions_allow_copy', 'permissions_allow_copy', $catBonus);
    _scoreBoolEff($raw, $props, $propCfg, 'pii_author',             'pii_author',             $catBonus);

    // ── Permissions (null = unencrypted / not applicable — skip scoring) ──────
    foreach ([
        'permissions_assistive_tech'  => 'perm_assistive_tech',
        'permissions_form_filling'    => 'perm_form_filling',
        'permissions_page_extraction' => 'perm_page_extraction',
        'permissions_doc_assembly'    => 'perm_doc_assembly',
        'permissions_commenting'      => 'perm_commenting',
        'permissions_editing'         => 'perm_editing',
    ] as $propKey => $cfgKey) {
        $val = $props[$propKey] ?? null;
        if ($val === null) continue; // null = unencrypted PDF, permission doesn't apply
        $c = $propCfg[$cfgKey] ?? [];
        if (!empty($c['enabled']) && ($w = _eff($c, $catBonus)) > 0) {
            if ((bool)$val === (bool)($c['good_when'] ?? true)) $raw += $w;
        }
    }
    // perm_printing — string: 'high' = full credit, 'low' = half, 'none' = 0
    $printC = $propCfg['perm_printing'] ?? [];
    if (!empty($printC['enabled']) && ($pw = _eff($printC, $catBonus)) > 0) {
        $printing = $props['permissions_printing'] ?? null;
        if ($printing !== null) { // null = unencrypted, skip
            $goodWhen = (bool)($printC['good_when'] ?? true);
            if ($printing === 'high')        $raw += $goodWhen ? $pw        : 0;
            elseif ($printing === 'low')     $raw += $goodWhen ? $pw * 0.5  : $pw * 0.5;
            else /* 'none' */                $raw += $goodWhen ? 0          : $pw;
        }
    }

    // ── has_author — derived from author presence ─────────────────────────────
    $haC = $propCfg['has_author'] ?? [];
    if (!empty($haC['enabled']) && ($haw = _eff($haC, $catBonus)) > 0) {
        // $props['has_author'] is a bool, or we can derive from author being non-empty
        $hasAuthor = !empty($props['has_author']) || (!empty($props['author']) && $props['author'] !== '');
        if ($hasAuthor === (bool)($haC['good_when'] ?? true)) $raw += $haw;
    }

    // ── has_creation_date — derived ───────────────────────────────────────────
    $hcC = $propCfg['has_creation_date'] ?? [];
    if (!empty($hcC['enabled']) && ($hcw = _eff($hcC, $catBonus)) > 0) {
        $hasDate = !empty($props['info_creation_date']) && $props['info_creation_date'] !== '1970-01-01 00:00:00';
        if ($hasDate === (bool)($hcC['good_when'] ?? true)) $raw += $hcw;
    }

    // ── pdf_version — graduated ───────────────────────────────────────────────
    $vc = $propCfg['pdf_version'] ?? [];
    if (!empty($vc['enabled']) && ($vw = _eff($vc, $catBonus)) > 0) {
        $ver    = (float)($props['pdf_version'] ?? 0);
        $credit = $ver >= 1.7 ? 1.0 : ($ver >= 1.6 ? 0.80 : ($ver >= 1.5 ? 0.65 : ($ver >= 1.4 ? 0.50 : 0.0)));
        if (!($vc['good_when'] ?? true)) $credit = 1 - $credit;
        $raw += $vw * $credit;
    }

    // ── has_pages — derived ───────────────────────────────────────────────────
    $pc = $propCfg['has_pages'] ?? [];
    if (!empty($pc['enabled']) && ($pw = _eff($pc, $catBonus)) > 0) {
        if ((((int)($props['page_count'] ?? 0)) > 0) === (bool)($pc['good_when'] ?? true)) $raw += $pw;
    }

    // ── native_content — derived ──────────────────────────────────────────────
    $nc = $propCfg['native_content'] ?? [];
    if (!empty($nc['enabled']) && ($nw = _eff($nc, $catBonus)) > 0) {
        $ct = strtolower((string)($props['content_type'] ?? ''));
        $isNative = $ct !== '' && !str_contains($ct, 'scan') && !str_contains($ct, 'image');
        if ($isNative === (bool)($nc['good_when'] ?? true)) $raw += $nw;
    }

    // ── String-valued: compliance levels + metadata string fields ─────────────
    foreach (['pdfa_compliance','pdfe_compliance','pdfua_compliance','pdfvt_compliance','pdfx_compliance',
              'info_title', 'info_subject', 'info_keywords'] as $strKey) {
        $c = $propCfg[$strKey] ?? [];
        if (!empty($c['enabled']) && ($w = _eff($c, $catBonus)) > 0) {
            if (!empty($props[$strKey]) === (bool)($c['good_when'] ?? true)) $raw += $w;
        }
    }

    return min(100, max(0, (int)round($raw / $totalWeight * 100)));
}

/** Compute effective weight applying category multi-bonus. */
function _eff(array $c, float $catBonus): float {
    $base = (float)($c['weight'] ?? 0);
    if ($catBonus <= 0 || $base <= 0) return $base;
    $nCats  = count((array)($c['categories'] ?? []));
    $extras = max(0, $nCats - 1);
    return $base * (1.0 + $extras * $catBonus);
}

function _scoreBool(float &$raw, array $props, array $propCfg, string $propKey, string $cfgKey): void {
    $c = $propCfg[$cfgKey] ?? [];
    if (!empty($c['enabled']) && ($w = (float)($c['weight'] ?? 0)) > 0) {
        if (!empty($props[$propKey]) === (bool)($c['good_when'] ?? true)) $raw += $w;
    }
}

function _scoreBoolEff(float &$raw, array $props, array $propCfg, string $propKey, string $cfgKey, float $catBonus): void {
    $c = $propCfg[$cfgKey] ?? [];
    if (!empty($c['enabled']) && ($w = _eff($c, $catBonus)) > 0) {
        if (!empty($props[$propKey]) === (bool)($c['good_when'] ?? true)) $raw += $w;
    }
}

function getScoringConfigFromWeights(array $w): array {
    return [
        'category_multi_bonus' => 0.0,
        'accessibility' => [
            'overall_rate'         => ['weight' => $w['w_accessibility_rate']   ?? 40, 'enabled' => true,  'categories' => ['accessibility']],
            'check_tagged'         => ['weight' => $w['w_check_tagged']         ?? 6,  'enabled' => true,  'categories' => ['accessibility']],
            'check_language'       => ['weight' => $w['w_check_language']       ?? 4,  'enabled' => true,  'categories' => ['accessibility']],
            'check_title'          => ['weight' => $w['w_check_title']          ?? 3,  'enabled' => true,  'categories' => ['accessibility']],
            'check_alt_text'       => ['weight' => $w['w_check_alt_text']       ?? 4,  'enabled' => true,  'categories' => ['accessibility']],
            'check_reading_order'  => ['weight' => $w['w_check_reading_order']  ?? 3,  'enabled' => true,  'categories' => ['accessibility']],
            'check_bookmarks'      => ['weight' => $w['w_check_bookmarks']      ?? 2,  'enabled' => true,  'categories' => ['accessibility', 'usability']],
            'check_color_contrast' => ['weight' => $w['w_check_color_contrast'] ?? 2,  'enabled' => true,  'categories' => ['accessibility']],
            'check_form_labels'    => ['weight' => $w['w_check_form_labels']    ?? 2,  'enabled' => true,  'categories' => ['accessibility', 'usability']],
        ],
        'properties' => [
            'is_tagged'             => ['weight' => $w['w_tagged']         ?? 12, 'good_when' => true,  'enabled' => true,  'categories' => ['accessibility', 'usability']],
            'pdf_version'           => ['weight' => $w['w_pdf_version']    ?? 8,  'good_when' => true,  'enabled' => true,  'categories' => ['usability', 'security']],
            'is_encrypted'          => ['weight' => $w['w_unencrypted']    ?? 5,  'good_when' => false, 'enabled' => true,  'categories' => ['security']],
            'has_xfa'               => ['weight' => $w['w_no_xfa']         ?? 5,  'good_when' => false, 'enabled' => true,  'categories' => ['security', 'usability']],
            'is_linearized'         => ['weight' => $w['w_linearized']     ?? 4,  'good_when' => true,  'enabled' => true,  'categories' => ['usability']],
            'has_pages'             => ['weight' => $w['w_has_pages']      ?? 3,  'good_when' => true,  'enabled' => true,  'categories' => ['usability']],
            'native_content'        => ['weight' => $w['w_native_content'] ?? 2,  'good_when' => true,  'enabled' => true,  'categories' => ['accessibility', 'usability']],
            'has_acroform'          => ['weight' => 0, 'good_when' => false, 'enabled' => false, 'categories' => ['usability']],
            'has_embedded_files'    => ['weight' => 2, 'good_when' => false, 'enabled' => true,  'categories' => ['security', 'usability']],
            'is_certified'          => ['weight' => 0, 'good_when' => true,  'enabled' => false, 'categories' => ['security', 'usability']],
            'is_signed'             => ['weight' => 0, 'good_when' => true,  'enabled' => false, 'categories' => ['security']],
            'permissions_allow_copy'     => ['weight' => 3, 'good_when' => true,  'enabled' => true,  'categories' => ['security', 'usability']],
            'perm_assistive_tech'        => ['weight' => 3, 'good_when' => true,  'enabled' => true,  'categories' => ['accessibility']],
            'perm_form_filling'          => ['weight' => 2, 'good_when' => true,  'enabled' => false, 'categories' => ['usability']],
            'perm_page_extraction'       => ['weight' => 1, 'good_when' => true,  'enabled' => false, 'categories' => ['security']],
            'perm_doc_assembly'          => ['weight' => 1, 'good_when' => false, 'enabled' => false, 'categories' => ['security']],
            'perm_commenting'            => ['weight' => 1, 'good_when' => true,  'enabled' => false, 'categories' => ['usability']],
            'perm_printing'              => ['weight' => 2, 'good_when' => true,  'enabled' => true,  'categories' => ['usability']],
            'perm_editing'               => ['weight' => 1, 'good_when' => false, 'enabled' => false, 'categories' => ['security']],
            'pii_author'                 => ['weight' => 4, 'good_when' => false, 'enabled' => true,  'categories' => ['security']],
            'pdfua_compliance'      => ['weight' => 8, 'good_when' => true,  'enabled' => true,  'categories' => ['accessibility', 'usability']],
            'pdfa_compliance'       => ['weight' => 3, 'good_when' => true,  'enabled' => false, 'categories' => ['usability']],
            'pdfe_compliance'       => ['weight' => 0, 'good_when' => true,  'enabled' => false, 'categories' => ['usability']],
            'pdfvt_compliance'      => ['weight' => 0, 'good_when' => true,  'enabled' => false, 'categories' => ['usability']],
            'pdfx_compliance'       => ['weight' => 0, 'good_when' => true,  'enabled' => false, 'categories' => ['usability']],
            'info_title'            => ['weight' => 3, 'good_when' => true,  'enabled' => true,  'categories' => ['usability', 'accessibility']],
            'info_subject'          => ['weight' => 2, 'good_when' => true,  'enabled' => true,  'categories' => ['usability']],
            'info_keywords'         => ['weight' => 2, 'good_when' => true,  'enabled' => true,  'categories' => ['usability']],
            'has_author'            => ['weight' => 2, 'good_when' => true,  'enabled' => true,  'categories' => ['usability']],
            'has_creation_date'     => ['weight' => 1, 'good_when' => true,  'enabled' => true,  'categories' => ['usability']],
        ],
    ];
}

/** Parse raw accessibility JSON (stored in pdf_accessibility.raw_results) into a flat checks array. */
function parseRawChecks(?string $rawJson): array {
    if (!$rawJson) return [];
    $raw        = json_decode($rawJson, true) ?? [];
    $checks     = [];
    $categories = $raw['DetailedReport'] ?? $raw['detailedReport'] ?? [];
    if ($categories) {
        foreach ($categories as $cat) {
            foreach ($cat['Elements'] ?? $cat['elements'] ?? [] as $el) {
                $checks[] = [
                    'checkName' => $el['CheckName'] ?? $el['checkName'] ?? $el['name']   ?? '',
                    'status'    => $el['Status']    ?? $el['status']    ?? '',
                ];
            }
        }
    } else {
        foreach ($raw['checks'] ?? $raw['checkResults'] ?? [] as $ch) {
            $checks[] = [
                'checkName' => $ch['checkName'] ?? $ch['name']   ?? '',
                'status'    => $ch['status']    ?? $ch['result'] ?? '',
            ];
        }
    }
    return $checks;
}
