<?php
/**
 * Extension API
 *
 * POST /api/health-checks/{id}/import-url
 *   Fetches a PDF from a remote URL, uploads it to Adobe PDF Services,
 *   runs properties + accessibility analysis, stores results, and
 *   returns the completed document record.
 *
 *   Body: { url: string, filename?: string }
 *
 * Called by the Chrome extension for each discovered PDF URL.
 * One URL per request — the extension handles sequencing and progress.
 */

require_once __DIR__ . '/../lib/Crawler.php';
require_once __DIR__ . '/../lib/Scoring.php';

set_time_limit(120);   // Adobe API polling takes ~30 s per step

$enc = new Encryption(ENCRYPTION_KEY);
$db  = getDB();

// ─── Validate ─────────────────────────────────────────────────────────────────
$body     = json_decode(file_get_contents('php://input'), true) ?? [];
$hcId     = (int)($_ROUTE_ID ?? 0);
$pdfUrl   = trim($body['url'] ?? '');
$filename = trim($body['filename'] ?? '');

if (!$hcId)   Response::error('health_check_id is required');
if (!$pdfUrl) Response::error('url is required');
if (!preg_match('#^https?://#i', $pdfUrl)) Response::error('url must start with http:// or https://');

// Derive filename from URL if not supplied
if (!$filename) {
    try { $filename = rawurldecode(basename(parse_url($pdfUrl, PHP_URL_PATH))); } catch (\Throwable $e) {}
    if (!$filename) $filename = 'document.pdf';
    if (!preg_match('/\.pdf$/i', $filename)) $filename .= '.pdf';
}

// Verify HC exists
$hcCheck = $db->prepare("SELECT id FROM health_checks WHERE id = ?");
$hcCheck->execute([$hcId]);
if (!$hcCheck->fetch()) Response::notFound('Health check not found');

// ─── Step 1: fetch the PDF ─────────────────────────────────────────────────────
$crawler = new Crawler();
try {
    $pdfData = $crawler->fetchPdf($pdfUrl);   // { data: base64, name, size }
} catch (\Throwable $e) {
    Response::error('Failed to download PDF: ' . $e->getMessage(), 422);
}

// Write to temp file for Adobe upload
$tmpFile = sys_get_temp_dir() . '/hcapp_import_' . uniqid('', true) . '.pdf';
file_put_contents($tmpFile, base64_decode($pdfData['data']));
$fileSize = filesize($tmpFile);

// ─── Step 2: upload to Adobe PDF Services ─────────────────────────────────────
[$adobeId, $adobeSecret] = getAdobeCredentials($db);
if (!$adobeId || !$adobeSecret) {
    @unlink($tmpFile);
    Response::error('Adobe PDF Services credentials are not configured. Please set them in the Admin Panel.', 503);
}

$adobe   = new AdobeApiClient($adobeId, $adobeSecret);
try {
    $assetId = $adobe->uploadAsset($tmpFile);
} catch (\Throwable $e) {
    @unlink($tmpFile);
    Response::error('Adobe upload failed: ' . $e->getMessage(), 502);
}
@unlink($tmpFile);

// ─── Step 3: register document ────────────────────────────────────────────────
$fileHash = bin2hex(random_bytes(16));   // URL-sourced files get a random hash
$ins = $db->prepare("
    INSERT INTO pdf_documents (health_check_id, filename_encrypted, file_hash, file_size, adobe_asset_id, status)
    VALUES (?, ?, ?, ?, ?, 'processing')
");
$ins->execute([$hcId, $enc->encrypt($filename), $fileHash, $fileSize, $assetId]);
$docId = (int)$db->lastInsertId();
$db->prepare("UPDATE health_checks SET status = 'processing' WHERE id = ?")->execute([$hcId]);

// ─── Step 4: PDF properties ────────────────────────────────────────────────────
try {
    $propsRaw = $adobe->getPdfProperties($assetId);
    $props    = parsePropertiesExt($propsRaw);
    storePropertiesExt($db, $enc, $docId, $props, $propsRaw);
} catch (\Throwable $e) {
    markFailed($db, $docId, $hcId, 'properties', $e->getMessage());
    Response::error('Properties step failed: ' . $e->getMessage(), 502);
}

// ─── Step 5: accessibility ─────────────────────────────────────────────────────
try {
    $accessRaw = $adobe->getAccessibilityResults($assetId);
    $access    = parseAccessibilityExt($accessRaw);
    storeAccessibilityExt($db, $docId, $access, $accessRaw);
} catch (\Throwable $e) {
    markFailed($db, $docId, $hcId, 'accessibility', $e->getMessage());
    Response::error('Accessibility step failed: ' . $e->getMessage(), 502);
}

// ─── Step 6: score ────────────────────────────────────────────────────────────
$propRow = $db->prepare("SELECT * FROM pdf_properties WHERE document_id = ?");
$propRow->execute([$docId]);
$storedProps = $propRow->fetch() ?: [];

$scoreProps = [
    'is_tagged'              => (bool)($storedProps['is_tagged']              ?? false),
    'is_linearized'          => (bool)($storedProps['is_linearized']          ?? false),
    'is_encrypted'           => (bool)($storedProps['is_encrypted']           ?? false),
    'has_xfa'                => (bool)($storedProps['has_xfa']                ?? false),
    'has_acroform'           => (bool)($storedProps['has_acroform']           ?? false),
    'has_embedded_files'     => (bool)($storedProps['has_embedded_files']     ?? false),
    'is_certified'           => (bool)($storedProps['is_certified']           ?? false),
    'is_signed'              => (bool)($storedProps['is_signed']              ?? false),
    'pii_author'             => (bool)($storedProps['pii_author']             ?? false),
    'pdf_version'            => $storedProps['pdf_version']                   ?? null,
    'page_count'             => (int)($storedProps['page_count']              ?? 0),
    'content_type'           => $storedProps['content_type']                  ?? null,
    'permissions_allow_copy' => $storedProps['permissions_allow_copy'] !== null ? (bool)$storedProps['permissions_allow_copy'] : null,
    'permissions_assistive_tech' => $storedProps['permissions_assistive_tech'] !== null ? (bool)$storedProps['permissions_assistive_tech'] : null,
    'has_author'             => !empty($storedProps['author_encrypted']),
];

$rawChecks = $accessRaw['checks'] ?? $accessRaw['checkResults'] ?? [];
$score = computeScore($scoreProps, $access, getScoringConfig($db), $rawChecks);

$db->prepare("UPDATE pdf_documents SET status = 'completed', overall_score = ? WHERE id = ?")
   ->execute([$score, $docId]);

// Update HC status
$pending = $db->prepare("SELECT COUNT(*) FROM pdf_documents WHERE health_check_id = ? AND status IN ('pending','processing')");
$pending->execute([$hcId]);
if ($pending->fetchColumn() == 0) {
    $db->prepare("UPDATE health_checks SET status = 'completed' WHERE id = ?")->execute([$hcId]);
}

Response::success([
    'document_id'   => $docId,
    'filename'      => $filename,
    'overall_score' => $score,
    'status'        => 'completed',
    'accessibility' => $access,
], 'PDF imported and analysed successfully', 201);

// ─── Helper functions ──────────────────────────────────────────────────────────

/**
 * Parse a PDF date string (D:YYYYMMDDHHmmSS[+/-HH'mm']) or any strtotime-compatible
 * date string into a MySQL DATETIME "YYYY-MM-DD HH:mm:ss". Returns null on failure.
 */
function parsePdfDate(?string $raw): ?string {
    if ($raw === null || trim($raw) === '') return null;
    $s = trim($raw);

    if (preg_match(
        "/^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?([+\-Z])?(\d{2})?'?(\d{2})?/i",
        $s, $m
    )) {
        $yr  = $m[1]; $mo = $m[2]; $dy = $m[3];
        $hh  = $m[4] ?? '00'; $mm = $m[5] ?? '00'; $ss = $m[6] ?? '00';
        $tsg = $m[7] ?? 'Z';
        $tzh = str_pad($m[8] ?? '00', 2, '0', STR_PAD_LEFT);
        $tzm = str_pad($m[9] ?? '00', 2, '0', STR_PAD_LEFT);
        $iso = ($tsg === 'Z' || $tsg === '')
            ? "{$yr}-{$mo}-{$dy}T{$hh}:{$mm}:{$ss}Z"
            : "{$yr}-{$mo}-{$dy}T{$hh}:{$mm}:{$ss}{$tsg}{$tzh}:{$tzm}";
        $ts = strtotime($iso);
        return ($ts !== false) ? date('Y-m-d H:i:s', $ts) : "{$yr}-{$mo}-{$dy} {$hh}:{$mm}:{$ss}";
    }

    $ts = strtotime($s);
    return ($ts !== false) ? date('Y-m-d H:i:s', $ts) : null;
}

function getAdobeCredentials(PDO $db): array {
    try {
        $stmt = $db->query("SELECT `key`, `value` FROM app_settings WHERE `key` IN ('adobe_client_id','adobe_client_secret')");
        $rows = $stmt->fetchAll();
        $map  = array_column($rows, 'value', 'key');
        $id     = $map['adobe_client_id']     ?? ADOBE_CLIENT_ID;
        $secret = $map['adobe_client_secret'] ?? ADOBE_CLIENT_SECRET;
        return [$id, $secret];
    } catch (\Throwable $e) {
        return [ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET];
    }
}

function markFailed(PDO $db, int $docId, int $hcId, string $step, string $msg): void {
    $db->prepare("UPDATE pdf_documents SET status = 'failed', error_message = ? WHERE id = ?")
       ->execute(["[{$step}] " . substr($msg, 0, 500), $docId]);
    $db->prepare("UPDATE health_checks SET status = 'completed' WHERE id = ? AND NOT EXISTS (SELECT 1 FROM pdf_documents WHERE health_check_id = ? AND status IN ('pending','processing'))")
       ->execute([$hcId, $hcId]);
}

function parsePropertiesExt(array $result): array {
    $doc = $result['properties'] ?? $result['pdfProperties'] ?? $result;
    return [
        'pdf_version'   => $doc['PDFVersion']     ?? $doc['pdf_version']    ?? null,
        'page_count'    => (int)($doc['PageCount']    ?? $doc['page_count']   ?? 0),
        'is_tagged'     => (bool)($doc['IsTagged']     ?? $doc['isTagged']    ?? false),
        'is_linearized' => (bool)($doc['IsLinearized'] ?? $doc['isLinearized'] ?? false),
        'is_encrypted'  => (bool)($doc['IsEncrypted']  ?? $doc['isEncrypted'] ?? false),
        'has_acroform'  => (bool)($doc['HasAcroForm']  ?? $doc['hasAcroForm'] ?? false),
        'has_xfa'       => (bool)($doc['HasXFA']       ?? $doc['hasXFA']      ?? false),
        'content_type'  => $doc['ContentType']    ?? $doc['content_type']   ?? null,
        'author'        => $doc['Author']         ?? $doc['author']         ?? null,
        'creator'       => $doc['Creator']        ?? $doc['creator']        ?? null,
        'producer'      => $doc['Producer']       ?? $doc['producer']       ?? null,
        'has_embedded_files'  => (bool)($doc['HasEmbeddedFiles'] ?? $doc['has_embedded_files'] ?? false),
        'is_certified'        => (bool)($doc['IsCertified']      ?? $doc['is_certified']       ?? false),
        'is_signed'           => (bool)($doc['IsSigned']         ?? $doc['is_signed']          ?? false),
        'pdfa_compliance'     => $doc['PDFACompliance']  ?? $doc['pdfa_compliance']  ?? null,
        'pdfua_compliance'    => $doc['PDFUACompliance'] ?? $doc['pdfua_compliance'] ?? null,
        'info_title'          => $doc['Title']      ?? $doc['info_title']      ?? null,
        'info_subject'        => $doc['Subject']    ?? $doc['info_subject']    ?? null,
        'info_keywords'       => $doc['Keywords']   ?? $doc['info_keywords']   ?? null,
        'info_creation_date'  => $doc['CreationDate'] ?? $doc['info_creation_date'] ?? null,
    ];
}

function parseAccessibilityExt(array $result): array {
    $passed = 0; $failed = 0; $warnings = 0;
    $checks = $result['checks'] ?? $result['checkResults'] ?? $result['results'] ?? [];
    foreach ($checks as $check) {
        $s = strtolower($check['status'] ?? $check['result'] ?? '');
        if (str_contains($s, 'pass'))      $passed++;
        elseif (str_contains($s, 'fail'))  $failed++;
        else                               $warnings++;
    }
    if (empty($checks) && isset($result['summary'])) {
        $passed   = (int)($result['summary']['passed']   ?? 0);
        $failed   = (int)($result['summary']['failed']   ?? 0);
        $warnings = (int)($result['summary']['warnings'] ?? 0);
    }
    return ['passed_checks' => $passed, 'failed_checks' => $failed, 'warning_checks' => $warnings];
}

function storePropertiesExt(PDO $db, Encryption $enc, int $docId, array $p, array $raw): void {
    // Derive creator app
    $creator  = $p['creator']  ?? null;
    $producer = $p['producer'] ?? null;
    $creatorApp = extractCreatorApp($creator, $producer);

    // PII detection
    $author    = $p['author'] ?? null;
    $piiAuthor = $author !== null && isProbablyPersonName($db, $author) ? 1 : 0;
    $authorEnc = null;
    if ($author !== null) {
        try { $authorEnc = $enc->encrypt($author); } catch (\Throwable $e) {}
    }

    $rawJson = json_encode($raw);

    $stmt = $db->prepare("
        INSERT INTO pdf_properties (
            document_id, pdf_version, page_count, is_tagged, is_linearized, is_encrypted,
            has_acroform, has_xfa, content_type, author_encrypted, creator_app, pii_author,
            has_embedded_files, is_certified, is_signed,
            pdfa_compliance, pdfua_compliance,
            info_title, info_subject, info_keywords, info_creation_date,
            raw_properties
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
            pdf_version=VALUES(pdf_version), page_count=VALUES(page_count),
            is_tagged=VALUES(is_tagged), is_linearized=VALUES(is_linearized),
            is_encrypted=VALUES(is_encrypted), has_acroform=VALUES(has_acroform),
            has_xfa=VALUES(has_xfa), content_type=VALUES(content_type),
            author_encrypted=VALUES(author_encrypted), creator_app=VALUES(creator_app),
            pii_author=VALUES(pii_author), has_embedded_files=VALUES(has_embedded_files),
            is_certified=VALUES(is_certified), is_signed=VALUES(is_signed),
            pdfa_compliance=VALUES(pdfa_compliance), pdfua_compliance=VALUES(pdfua_compliance),
            info_title=VALUES(info_title), info_subject=VALUES(info_subject),
            info_keywords=VALUES(info_keywords), info_creation_date=VALUES(info_creation_date),
            raw_properties=VALUES(raw_properties)
    ");
    $stmt->execute([
        $docId,
        $p['pdf_version']   ?? null,
        $p['page_count']    ?? 0,
        (int)($p['is_tagged']    ?? false),
        (int)($p['is_linearized'] ?? false),
        (int)($p['is_encrypted']  ?? false),
        (int)($p['has_acroform']  ?? false),
        (int)($p['has_xfa']       ?? false),
        $p['content_type']  ?? null,
        $authorEnc,
        $creatorApp,
        $piiAuthor,
        (int)($p['has_embedded_files'] ?? false),
        (int)($p['is_certified']        ?? false),
        (int)($p['is_signed']           ?? false),
        ($p['pdfa_compliance']  ?? '') ?: null,
        ($p['pdfua_compliance'] ?? '') ?: null,
        ($p['info_title']    ?? '') ?: null,
        ($p['info_subject']  ?? '') ?: null,
        ($p['info_keywords'] ?? '') ?: null,
        parsePdfDate($p['info_creation_date'] ?? null),
        $rawJson,
    ]);
    $db->prepare("UPDATE pdf_documents SET status = 'processing' WHERE id = ?")->execute([$docId]);
}

function storeAccessibilityExt(PDO $db, int $docId, array $a, array $raw): void {
    $rawJson = json_encode($raw);
    $checks  = $raw['checks'] ?? $raw['checkResults'] ?? $raw['results'] ?? [];
    $checksJson = json_encode($checks);

    $stmt = $db->prepare("
        INSERT INTO pdf_accessibility (document_id, passed_checks, failed_checks, warning_checks, raw_results, check_details)
        VALUES (?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
            passed_checks=VALUES(passed_checks), failed_checks=VALUES(failed_checks),
            warning_checks=VALUES(warning_checks), raw_results=VALUES(raw_results),
            check_details=VALUES(check_details)
    ");
    $stmt->execute([
        $docId,
        $a['passed_checks'],
        $a['failed_checks'],
        $a['warning_checks'],
        $rawJson,
        $checksJson,
    ]);
}
