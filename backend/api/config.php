<?php
/** Runtime config endpoint — stores Adobe credentials in the database */
$body = json_decode(file_get_contents('php://input'), true) ?? [];
$db   = getDB();

// Validate admin token against admin_sessions
(function() use ($db) {
    try {
        $tok = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
        if (!$tok) Response::error('Admin authentication required', 401);
        $s = $db->prepare("SELECT token FROM admin_sessions WHERE token=? AND expires_at > NOW()");
        $s->execute([$tok]);
        if (!$s->fetch()) Response::error('Admin authentication required', 401);
    } catch (\Throwable $e) { Response::error('Admin authentication required', 401); }
})();

// Lazy-create settings table
$db->exec("CREATE TABLE IF NOT EXISTS app_settings (
    `key`        VARCHAR(100) PRIMARY KEY,
    `value`      TEXT         NOT NULL,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$saved = [];

if (!empty($body['adobe_client_id'])) {
    $db->prepare("INSERT INTO app_settings (`key`, `value`) VALUES ('adobe_client_id', ?)
                  ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
       ->execute([trim($body['adobe_client_id'])]);
    $saved[] = 'adobe_client_id';
}

if (!empty($body['adobe_client_secret'])) {
    $db->prepare("INSERT INTO app_settings (`key`, `value`) VALUES ('adobe_client_secret', ?)
                  ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
       ->execute([trim($body['adobe_client_secret'])]);
    $saved[] = 'adobe_client_secret';
}

if (!empty($body['score_weights']) && is_array($body['score_weights'])) {
    $weights = array_map('intval', $body['score_weights']);
    $db->prepare("INSERT INTO app_settings (`key`, `value`) VALUES ('score_weights', ?)
                  ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
       ->execute([json_encode($weights)]);
    $saved[] = 'score_weights';
}

if (empty($saved)) {
    Response::error('No valid settings provided', 400);
}

Response::success(['saved' => $saved], 'Credentials saved');
