<?php
/** App settings endpoint — GET (API key) / POST (admin token) */
$db   = getDB();
$body = ($method === 'POST') ? (json_decode(file_get_contents('php://input'), true) ?? []) : [];

// Ensure app_settings table exists
$db->exec("CREATE TABLE IF NOT EXISTS app_settings (
    `key`        VARCHAR(100) PRIMARY KEY,
    `value`      TEXT         NOT NULL,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

// ── Helper: read a single setting ────────────────────────────────────────────
function settingsGet(PDO $db, string $key): string {
    $stmt = $db->prepare("SELECT `value` FROM app_settings WHERE `key` = ?");
    $stmt->execute([$key]);
    return (string)($stmt->fetchColumn() ?: '');
}

// ── Helper: write a single setting ───────────────────────────────────────────
function settingsSet(PDO $db, string $key, string $value): void {
    $db->prepare("INSERT INTO app_settings (`key`,`value`) VALUES (?,?)
                  ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)")->execute([$key, $value]);
}


// ── GET /api/settings ─────────────────────────────────────────────────────────
if ($method === 'GET') {
    // Check if caller has valid admin session (for showing secrets)
    $isAdmin = false;
    try {
        $tok = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
        if ($tok) {
            $s = $db->prepare("SELECT token FROM admin_sessions WHERE token=? AND expires_at > NOW()");
            $s->execute([$tok]);
            $isAdmin = (bool)$s->fetch();
        }
    } catch (\Throwable $e) {}

    $scRaw = settingsGet($db, 'scoring_config');
    $scoringConfig = $scRaw !== '' ? (json_decode($scRaw, true) ?? null) : null;

    $data = [
        'crawler_max_pdfs'     => (int)(settingsGet($db, 'crawler_max_pdfs')  ?: 20),
        'crawler_max_depth'    => (int)(settingsGet($db, 'crawler_max_depth') ?: 3),
        'crawler_timeout'      => (int)(settingsGet($db, 'crawler_timeout')   ?: 8),
        'scoring_config'       => $scoringConfig, // null = use backend defaults
        'adobe_client_id'      => settingsGet($db, 'adobe_client_id'),
        'yukon_base_url'       => settingsGet($db, 'yukon_base_url'),
        'yukon_collection_id'  => settingsGet($db, 'yukon_collection_id'),
        'yukon_inference_mode' => settingsGet($db, 'yukon_inference_mode') ?: 'STANDARD',
        'yukon_response_format'=> settingsGet($db, 'yukon_response_format') ?: 'PARAGRAPH',
        'yukon_response_style' => settingsGet($db, 'yukon_response_style') ?: 'DESCRIPTIVE',
        'yukon_response_tone'  => settingsGet($db, 'yukon_response_tone') ?: 'DIRECT',
    ];

    // Sensitive fields — always return masked placeholder so the client knows they are set
    $yukonTok    = settingsGet($db, 'yukon_token');
    $yukonApiKey = settingsGet($db, 'yukon_api_key');
    $data['yukon_token']   = $yukonTok    !== '' ? '••••••••' : '';
    $data['yukon_api_key'] = $yukonApiKey !== '' ? '••••••••' : '';

    if ($isAdmin) {
        $secret = settingsGet($db, 'adobe_client_secret');
        $data['adobe_client_secret'] = $secret !== '' ? '••••••••' : '';
    }

    Response::success($data);
    exit;
}

// ── POST /api/settings ────────────────────────────────────────────────────────
if ($method === 'POST') {
    // Admin token required for writes
    (function() use ($db) {
        try {
            $tok = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
            if (!$tok) Response::error('Admin authentication required', 401);
            $s = $db->prepare("SELECT token FROM admin_sessions WHERE token=? AND expires_at > NOW()");
            $s->execute([$tok]);
            if (!$s->fetch()) Response::error('Admin authentication required', 401);
        } catch (\Throwable $e) { Response::error('Admin authentication required', 401); }
    })();

    $saved = [];

    if (isset($body['adobe_client_id']) && $body['adobe_client_id'] !== '') {
        settingsSet($db, 'adobe_client_id', trim($body['adobe_client_id']));
        $saved[] = 'adobe_client_id';
    }

    // Ignore the masked placeholder value
    if (isset($body['adobe_client_secret']) && $body['adobe_client_secret'] !== '' && $body['adobe_client_secret'] !== '••••••••') {
        settingsSet($db, 'adobe_client_secret', trim($body['adobe_client_secret']));
        $saved[] = 'adobe_client_secret';
    }

    // Yukon settings
    if (isset($body['yukon_base_url'])) {
        settingsSet($db, 'yukon_base_url', trim($body['yukon_base_url']));
        $saved[] = 'yukon_base_url';
    }
    if (isset($body['yukon_collection_id'])) {
        settingsSet($db, 'yukon_collection_id', trim($body['yukon_collection_id']));
        $saved[] = 'yukon_collection_id';
    }
    // Token and API key: ignore masked placeholder, allow explicit empty string to clear
    if (isset($body['yukon_token']) && $body['yukon_token'] !== '••••••••') {
        settingsSet($db, 'yukon_token', trim($body['yukon_token']));
        $saved[] = 'yukon_token';
    }
    if (isset($body['yukon_api_key']) && $body['yukon_api_key'] !== '••••••••') {
        settingsSet($db, 'yukon_api_key', trim($body['yukon_api_key']));
        $saved[] = 'yukon_api_key';
    }
    $validModes   = ['LITE','STANDARD','FAST_REASONING','ADVANCED'];
    $validFormats = ['AUTO','PARAGRAPH','BULLETS','NUMBERED','TABLE'];
    $validStyles  = ['AUTO','DESCRIPTIVE','CONCISE','BULLET_POINTS'];
    $validTones   = ['AUTO','NARRATIVE','EMPATHETIC','DIRECT','SBF'];
    if (isset($body['yukon_inference_mode']) && in_array($body['yukon_inference_mode'], $validModes, true)) {
        settingsSet($db, 'yukon_inference_mode', $body['yukon_inference_mode']);
        $saved[] = 'yukon_inference_mode';
    }
    if (isset($body['yukon_response_format']) && in_array($body['yukon_response_format'], $validFormats, true)) {
        settingsSet($db, 'yukon_response_format', $body['yukon_response_format']);
        $saved[] = 'yukon_response_format';
    }
    if (isset($body['yukon_response_style']) && in_array($body['yukon_response_style'], $validStyles, true)) {
        settingsSet($db, 'yukon_response_style', $body['yukon_response_style']);
        $saved[] = 'yukon_response_style';
    }
    if (isset($body['yukon_response_tone']) && in_array($body['yukon_response_tone'], $validTones, true)) {
        settingsSet($db, 'yukon_response_tone', $body['yukon_response_tone']);
        $saved[] = 'yukon_response_tone';
    }

    if (isset($body['scoring_config']) && is_array($body['scoring_config'])) {
        $sc    = $body['scoring_config'];
        $clean = ['properties' => [], 'accessibility' => []];

        // category_multi_bonus — top-level scalar (0.0–2.0)
        if (isset($sc['category_multi_bonus'])) {
            $clean['category_multi_bonus'] = max(0.0, min(2.0, (float)$sc['category_multi_bonus']));
        }

        // Per-property entries
        $validCats = ['security', 'accessibility', 'usability'];
        foreach (['properties', 'accessibility'] as $section) {
            if (!empty($sc[$section]) && is_array($sc[$section])) {
                foreach ($sc[$section] as $key => $cfg) {
                    if (!is_string($key) || !is_array($cfg)) continue;
                    $entry = [
                        'weight'  => max(0, min(999, (int)($cfg['weight'] ?? 0))),
                        'enabled' => !empty($cfg['enabled']),
                    ];
                    if ($section === 'properties') {
                        $entry['good_when'] = !empty($cfg['good_when']);
                    }
                    // categories — whitelist
                    if (!empty($cfg['categories']) && is_array($cfg['categories'])) {
                        $entry['categories'] = array_values(array_intersect((array)$cfg['categories'], $validCats));
                    }
                    $clean[$section][$key] = $entry;
                }
            }
        }
        settingsSet($db, 'scoring_config', json_encode($clean));
        $saved[] = 'scoring_config';
    }

    if (isset($body['crawler_max_pdfs'])) {
        $v = (int)$body['crawler_max_pdfs'];
        if ($v < 1 || $v > 200) Response::error('crawler_max_pdfs must be between 1 and 200', 400);
        settingsSet($db, 'crawler_max_pdfs', (string)$v);
        $saved[] = 'crawler_max_pdfs';
    }

    if (isset($body['crawler_max_depth'])) {
        $v = (int)$body['crawler_max_depth'];
        if ($v < 1 || $v > 10) Response::error('crawler_max_depth must be between 1 and 10', 400);
        settingsSet($db, 'crawler_max_depth', (string)$v);
        $saved[] = 'crawler_max_depth';
    }

    if (isset($body['crawler_timeout'])) {
        $v = (int)$body['crawler_timeout'];
        if ($v < 3 || $v > 30) Response::error('crawler_timeout must be between 3 and 30', 400);
        settingsSet($db, 'crawler_timeout', (string)$v);
        $saved[] = 'crawler_timeout';
    }

    if (empty($saved)) {
        Response::error('No valid settings provided', 400);
    }

    Response::success(['saved' => $saved], 'Settings saved');
    exit;
}

Response::error('Method not allowed', 405);
