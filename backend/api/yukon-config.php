<?php
/**
 * GET /api/yukon/config
 *
 * Returns the Yukon runtime credentials (unmasked) so the frontend can make
 * Yukon API calls without storing the token locally.
 *
 * Protected by X-API-Key (same as all other app endpoints).
 * Never requires admin token — it is a read-only service endpoint.
 */
$db = getDB();

if ($method !== 'GET') {
    Response::error('Method not allowed', 405);
    exit;
}

function yukonConfigGet(PDO $db, string $key): string {
    $stmt = $db->prepare("SELECT `value` FROM app_settings WHERE `key` = ?");
    $stmt->execute([$key]);
    return (string)($stmt->fetchColumn() ?: '');
}

Response::success([
    'yukon_base_url'       => yukonConfigGet($db, 'yukon_base_url'),
    'yukon_token'          => yukonConfigGet($db, 'yukon_token'),
    'yukon_collection_id'  => yukonConfigGet($db, 'yukon_collection_id'),
    'yukon_api_key'        => yukonConfigGet($db, 'yukon_api_key'),
    'yukon_inference_mode' => yukonConfigGet($db, 'yukon_inference_mode') ?: 'STANDARD',
    'yukon_response_format'=> yukonConfigGet($db, 'yukon_response_format') ?: 'PARAGRAPH',
    'yukon_response_style' => yukonConfigGet($db, 'yukon_response_style') ?: 'DESCRIPTIVE',
    'yukon_response_tone'  => yukonConfigGet($db, 'yukon_response_tone') ?: 'DIRECT',
]);
