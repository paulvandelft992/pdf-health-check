<?php
/**
 * Documents API
 *
 * Step 1  POST /api/documents/upload             → validate, store, upload asset to Adobe
 * Step 2  POST /api/documents/:id/properties     → run PDF Properties API
 * Step 3  POST /api/documents/:id/accessibility  → run Accessibility Checker, compute score
 *
 * GET  /api/documents?health_check_id=X          → list docs for a health check
 * GET  /api/documents/:id/result                 → full detail with raw API results
 */

// Scoring functions (getScoringConfig, computeScore, helpers) live in the shared lib.
require_once __DIR__ . '/../lib/Scoring.php';
$enc    = new Encryption(ENCRYPTION_KEY);
$db     = getDB();
$id     = $_ROUTE_ID     ?? null;
$action = $_ROUTE_ACTION ?? 'list';

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/documents?health_check_id=X  — list
// ═══════════════════════════════════════════════════════════════════════════
if ($action === 'list') {
    $hcId = (int)($_GET['health_check_id'] ?? 0);
    if (!$hcId) Response::error('health_check_id is required');

    $stmt = $db->prepare("
        SELECT d.id, d.health_check_id, d.filename_encrypted, d.file_size,
               d.status, d.error_message, d.created_at, d.overall_score,
               pp.pdf_version, pp.page_count, pp.is_tagged, pp.is_linearized,
               pp.is_encrypted, pp.has_acroform, pp.has_xfa, pp.content_type,
               pp.has_embedded_files, pp.is_signed, pp.is_certified,
               pp.pdfa_compliance, pp.pdfua_compliance,
               pp.info_title, pp.info_subject, pp.info_keywords,
               pp.permissions_allow_copy, pp.permissions_assistive_tech, pp.permissions_form_filling,
               pp.permissions_page_extraction, pp.permissions_doc_assembly, pp.permissions_commenting,
               pp.permissions_printing, pp.permissions_editing,
               pp.author_encrypted, pp.creator_app, pp.pii_author,
               ac.passed_checks, ac.failed_checks, ac.warning_checks
        FROM pdf_documents d
        LEFT JOIN pdf_properties    pp ON pp.document_id = d.id
        LEFT JOIN pdf_accessibility ac ON ac.document_id = d.id
        WHERE d.health_check_id = ?
        ORDER BY d.created_at ASC
    ");
    $stmt->execute([$hcId]);
    $rows = $stmt->fetchAll();

    foreach ($rows as &$row) {
        try { $row['original_filename'] = $enc->decrypt($row['filename_encrypted']); }
        catch (\Throwable $e) { $row['original_filename'] = 'document_' . $row['id'] . '.pdf'; }
        unset($row['filename_encrypted']);

        $row['is_tagged']     = (bool)$row['is_tagged'];
        $row['is_linearized'] = (bool)$row['is_linearized'];
        $row['is_encrypted']  = (bool)$row['is_encrypted'];
        $row['has_acroform']  = (bool)$row['has_acroform'];
        $row['has_xfa']       = (bool)$row['has_xfa'];
        // Decrypt author for list view
        $listAuthor = null;
        if (!empty($row['author_encrypted'])) {
            try { $listAuthor = $enc->decrypt($row['author_encrypted']); } catch (\Throwable $e) {}
        }
        unset($row['author_encrypted']);
        $row['properties']    = [
            'pdf_version'   => $row['pdf_version'],
            'page_count'    => $row['page_count'],
            'is_tagged'     => $row['is_tagged'],
            'is_linearized' => $row['is_linearized'],
            'is_encrypted'  => $row['is_encrypted'],
            'has_acroform'  => $row['has_acroform'],
            'has_xfa'       => $row['has_xfa'],
            'content_type'  => $row['content_type'],
            'author'                 => $listAuthor,
            'creator_app'            => $row['creator_app'],
            'pii_author'             => (bool)$row['pii_author'],
            'has_embedded_files'     => (bool)$row['has_embedded_files'],
            'is_certified'           => (bool)$row['is_certified'],
            'is_signed'              => (bool)$row['is_signed'],
            'pdfa_compliance'        => $row['pdfa_compliance'],
            'pdfua_compliance'       => $row['pdfua_compliance'],
            'info_title'             => $row['info_title'],
            'info_subject'           => $row['info_subject'],
            'info_keywords'          => $row['info_keywords'],
            'permissions_allow_copy'      => $row['permissions_allow_copy']      !== null ? (bool)$row['permissions_allow_copy']      : null,
            'permissions_assistive_tech'  => $row['permissions_assistive_tech']  !== null ? (bool)$row['permissions_assistive_tech']  : null,
            'permissions_form_filling'    => $row['permissions_form_filling']    !== null ? (bool)$row['permissions_form_filling']    : null,
            'permissions_page_extraction' => $row['permissions_page_extraction'] !== null ? (bool)$row['permissions_page_extraction'] : null,
            'permissions_doc_assembly'    => $row['permissions_doc_assembly']    !== null ? (bool)$row['permissions_doc_assembly']    : null,
            'permissions_commenting'      => $row['permissions_commenting']      !== null ? (bool)$row['permissions_commenting']      : null,
            'permissions_printing'        => $row['permissions_printing']        ?? null,
            'permissions_editing'         => $row['permissions_editing']         !== null ? (bool)$row['permissions_editing']         : null,
        ];
        $row['accessibility'] = [
            'passed_checks'  => $row['passed_checks'],
            'failed_checks'  => $row['failed_checks'],
            'warning_checks' => $row['warning_checks'],
        ];
    }
    unset($row);
    Response::success($rows);
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/documents/:id/result  — full detail
// ═══════════════════════════════════════════════════════════════════════════
if ($action === 'result') {
    $stmt = $db->prepare("
        SELECT d.id, d.health_check_id, d.filename_encrypted, d.file_size,
               d.status, d.error_message, d.created_at, d.overall_score,
               pp.pdf_version, pp.page_count, pp.is_tagged, pp.is_linearized,
               pp.is_encrypted, pp.has_acroform, pp.has_xfa, pp.content_type,
               pp.raw_properties, pp.author_encrypted, pp.creator_app, pp.pii_author,
               pp.has_embedded_files, pp.is_certified, pp.is_signed,
               pp.pdfa_compliance, pp.pdfe_compliance, pp.pdfua_compliance, pp.pdfvt_compliance, pp.pdfx_compliance,
               pp.info_title, pp.info_subject, pp.info_keywords, pp.info_creation_date,
               pp.permissions, pp.permissions_allow_copy,
               pp.permissions_assistive_tech, pp.permissions_form_filling,
               pp.permissions_page_extraction, pp.permissions_doc_assembly,
               pp.permissions_commenting, pp.permissions_printing, pp.permissions_editing,
               ac.passed_checks, ac.failed_checks, ac.warning_checks, ac.raw_results
        FROM pdf_documents d
        LEFT JOIN pdf_properties    pp ON pp.document_id = d.id
        LEFT JOIN pdf_accessibility ac ON ac.document_id = d.id
        WHERE d.id = ?
    ");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) Response::notFound('Document not found');

    try { $row['original_filename'] = $enc->decrypt($row['filename_encrypted']); }
    catch (\Throwable $e) { $row['original_filename'] = 'document.pdf'; }
    unset($row['filename_encrypted']);

    // Decrypt author
    $authorPlain = null;
    if (!empty($row['author_encrypted'])) {
        try { $authorPlain = $enc->decrypt($row['author_encrypted']); } catch (\Throwable $e) {}
    }

    $row['properties'] = [
        'pdf_version'    => $row['pdf_version'],
        'page_count'     => (int)$row['page_count'],
        'is_tagged'      => (bool)$row['is_tagged'],
        'is_linearized'  => (bool)$row['is_linearized'],
        'is_encrypted'   => (bool)$row['is_encrypted'],
        'has_acroform'   => (bool)$row['has_acroform'],
        'has_xfa'        => (bool)$row['has_xfa'],
        'content_type'   => $row['content_type'],
        'raw_properties' => $row['raw_properties'],
        'author'         => $authorPlain,
        'creator_app'    => $row['creator_app'],
        'pii_author'     => (bool)$row['pii_author'],
        'has_embedded_files'     => (bool)$row['has_embedded_files'],
        'is_certified'           => (bool)$row['is_certified'],
        'is_signed'              => (bool)$row['is_signed'],
        'pdfa_compliance'        => $row['pdfa_compliance'],
        'pdfe_compliance'        => $row['pdfe_compliance'],
        'pdfua_compliance'       => $row['pdfua_compliance'],
        'pdfvt_compliance'       => $row['pdfvt_compliance'],
        'pdfx_compliance'        => $row['pdfx_compliance'],
        'info_title'             => $row['info_title'],
        'info_subject'           => $row['info_subject'],
        'info_keywords'          => $row['info_keywords'],
        'info_creation_date'     => $row['info_creation_date'],
        'permissions'                 => $row['permissions'] ? json_decode($row['permissions'], true) : null,
        'permissions_allow_copy'      => $row['permissions_allow_copy']      !== null ? (bool)$row['permissions_allow_copy']      : null,
        'permissions_assistive_tech'  => $row['permissions_assistive_tech']  !== null ? (bool)$row['permissions_assistive_tech']  : null,
        'permissions_form_filling'    => $row['permissions_form_filling']    !== null ? (bool)$row['permissions_form_filling']    : null,
        'permissions_page_extraction' => $row['permissions_page_extraction'] !== null ? (bool)$row['permissions_page_extraction'] : null,
        'permissions_doc_assembly'    => $row['permissions_doc_assembly']    !== null ? (bool)$row['permissions_doc_assembly']    : null,
        'permissions_commenting'      => $row['permissions_commenting']      !== null ? (bool)$row['permissions_commenting']      : null,
        'permissions_printing'        => $row['permissions_printing']        ?? null,
        'permissions_editing'         => $row['permissions_editing']         !== null ? (bool)$row['permissions_editing']         : null,
    ];
    $row['accessibility'] = [
        'passed_checks'  => (int)($row['passed_checks'] ?? 0),
        'failed_checks'  => (int)($row['failed_checks'] ?? 0),
        'warning_checks' => (int)($row['warning_checks'] ?? 0),
        'raw_results'    => $row['raw_results'],
    ];
    Response::success($row);
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1 — POST /api/documents/register
// Stores document metadata + adobe_asset_id (Adobe upload done by Electron).
// Returns { document_id }.
// ═══════════════════════════════════════════════════════════════════════════
if ($action === 'register') {
    $body     = json_decode(file_get_contents('php://input'), true) ?? [];
    $hcId     = (int)($body['health_check_id'] ?? 0);
    $origName = trim($body['filename'] ?? '');
    $fileSize = (int)($body['file_size'] ?? 0);
    $fileHash = trim($body['file_hash'] ?? '');
    $assetId  = trim($body['adobe_asset_id'] ?? '');

    if (!$hcId)     Response::error('health_check_id is required');
    if (!$origName) Response::error('filename is required');
    if (!$assetId)  Response::error('adobe_asset_id is required');

    $hcCheck = $db->prepare("SELECT id FROM health_checks WHERE id = ?");
    $hcCheck->execute([$hcId]);
    if (!$hcCheck->fetch()) Response::notFound('Health check not found');

    // Deduplication within this health check
    if ($fileHash) {
        $dup = $db->prepare("SELECT id FROM pdf_documents WHERE health_check_id = ? AND file_hash = ?");
        $dup->execute([$hcId, $fileHash]);
        if ($dup->fetch()) Response::error('This exact file has already been uploaded to this health check', 409);
    }

    // If the client couldn't compute a hash (crypto.subtle failure), generate a
    // random fallback so the NOT NULL + UNIQUE (hc, file_hash) constraint is met.
    if (!$fileHash) {
        $fileHash = bin2hex(random_bytes(32));
    }

    $ins = $db->prepare("
        INSERT INTO pdf_documents (health_check_id, filename_encrypted, file_hash, file_size, adobe_asset_id, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
    ");
    $ins->execute([$hcId, $enc->encrypt($origName), $fileHash, $fileSize, $assetId]);
    $docId = (int)$db->lastInsertId();

    $db->prepare("UPDATE health_checks SET status = 'processing' WHERE id = ?")->execute([$hcId]);

    Response::success(['document_id' => $docId], 'Document registered', 201);
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2 — POST /api/documents/:id/properties
// Stores pre-fetched PDF properties (analysis done by Electron).
// ═══════════════════════════════════════════════════════════════════════════
if ($action === 'properties') {
    $doc  = fetchDoc($db, $id);
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $props = [
        'pdf_version'   => $body['pdf_version']    ?? null,
        'page_count'    => (int)($body['page_count']    ?? 0),
        'is_tagged'     => (bool)($body['is_tagged']    ?? false),
        'is_linearized' => (bool)($body['is_linearized'] ?? false),
        'is_encrypted'  => (bool)($body['is_encrypted']  ?? false),
        'has_acroform'  => (bool)($body['has_acroform']  ?? false),
        'has_xfa'       => (bool)($body['has_xfa']       ?? false),
        'content_type'  => $body['content_type']   ?? null,
        'author'        => $body['author']         ?? null,
        'creator'       => $body['creator']        ?? null,
        'producer'      => $body['producer']       ?? null,
        // Extended properties
        'has_embedded_files'    => (bool)($body['has_embedded_files']    ?? false),
        'is_certified'          => (bool)($body['is_certified']           ?? false),
        'is_signed'             => (bool)($body['is_signed']              ?? false),
        'pdfa_compliance'       => ($body['pdfa_compliance']  ?? '') ?: null,
        'pdfe_compliance'       => ($body['pdfe_compliance']  ?? '') ?: null,
        'pdfua_compliance'      => ($body['pdfua_compliance'] ?? '') ?: null,
        'pdfvt_compliance'      => ($body['pdfvt_compliance'] ?? '') ?: null,
        'pdfx_compliance'       => ($body['pdfx_compliance']  ?? '') ?: null,
        'info_title'            => ($body['info_title']    ?? '') ?: null,
        'info_subject'          => ($body['info_subject']  ?? '') ?: null,
        'info_keywords'         => ($body['info_keywords'] ?? '') ?: null,
        'info_creation_date'    => parsePdfDate($body['info_creation_date'] ?? null),
        'permissions'                => is_array($body['permissions']) ? $body['permissions'] : null,
        'permissions_allow_copy'     => isset($body['permissions_copying'])
            ? (bool)$body['permissions_copying']
            : (!empty($body['permissions'])
                ? (bool)(
                    $body['permissions']['AllowCopy']    ??
                    $body['permissions']['copy_content'] ??
                    $body['permissions']['copy']         ??
                    $body['permissions']['allowCopy']    ??
                    true)
                : null),
        'permissions_assistive_tech'  => isset($body['permissions_assistive_tech'])  ? (bool)$body['permissions_assistive_tech']  : null,
        'permissions_form_filling'    => isset($body['permissions_form_filling'])    ? (bool)$body['permissions_form_filling']    : null,
        'permissions_page_extraction' => isset($body['permissions_page_extraction']) ? (bool)$body['permissions_page_extraction'] : null,
        'permissions_doc_assembly'    => isset($body['permissions_doc_assembly'])    ? (bool)$body['permissions_doc_assembly']    : null,
        'permissions_commenting'      => isset($body['permissions_commenting'])      ? (bool)$body['permissions_commenting']      : null,
        'permissions_printing'        => !empty($body['permissions_printing'])       ? strtolower(substr($body['permissions_printing'], 0, 20)) : null,
        'permissions_editing'         => isset($body['permissions_editing'])         ? (bool)$body['permissions_editing']         : null,
    ];
    storeProperties($db, $id, $props, $body);

    // Compute a preliminary score from properties alone so the document is
    // never left without a score even if the accessibility step fails later.
    // Step 3 (accessibility) will overwrite this with the final full score.
    $prelimScore = computeScore($props, ['passed_checks'=>0,'failed_checks'=>0,'warning_checks'=>0], getScoringConfig($db), []);
    $db->prepare("UPDATE pdf_documents SET status = 'processing', overall_score = ? WHERE id = ?")
       ->execute([$prelimScore, $id]);

    Response::success(['document_id' => $id, 'properties' => $props]);
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3 — POST /api/documents/:id/accessibility
// Stores pre-fetched accessibility results, computes score, marks done.
// ═══════════════════════════════════════════════════════════════════════════
if ($action === 'accessibility') {
    $doc  = fetchDoc($db, $id);
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $access = [
        'passed_checks'  => (int)($body['passed_checks']  ?? 0),
        'failed_checks'  => (int)($body['failed_checks']  ?? 0),
        'warning_checks' => (int)($body['warning_checks'] ?? 0),
    ];
    storeAccessibility($db, $id, $access, $body);

    $propRow = $db->prepare("SELECT * FROM pdf_properties WHERE document_id = ?");
    $propRow->execute([$id]);
    $storedProps = $propRow->fetch() ?: [];
    $props = [
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
        'pdfa_compliance'        => $storedProps['pdfa_compliance']               ?? null,
        'pdfe_compliance'        => $storedProps['pdfe_compliance']               ?? null,
        'pdfua_compliance'       => $storedProps['pdfua_compliance']              ?? null,
        'pdfvt_compliance'       => $storedProps['pdfvt_compliance']              ?? null,
        'pdfx_compliance'        => $storedProps['pdfx_compliance']               ?? null,
        'info_title'             => $storedProps['info_title']                    ?? null,
        'info_subject'           => $storedProps['info_subject']                  ?? null,
        'info_keywords'          => $storedProps['info_keywords']                 ?? null,
        'info_creation_date'     => $storedProps['info_creation_date']            ?? null,
        'permissions_allow_copy'      => $storedProps['permissions_allow_copy']      !== null ? (bool)$storedProps['permissions_allow_copy']      : null,
        'permissions_assistive_tech'  => $storedProps['permissions_assistive_tech']  !== null ? (bool)$storedProps['permissions_assistive_tech']  : null,
        'permissions_form_filling'    => $storedProps['permissions_form_filling']    !== null ? (bool)$storedProps['permissions_form_filling']    : null,
        'permissions_page_extraction' => $storedProps['permissions_page_extraction'] !== null ? (bool)$storedProps['permissions_page_extraction'] : null,
        'permissions_doc_assembly'    => $storedProps['permissions_doc_assembly']    !== null ? (bool)$storedProps['permissions_doc_assembly']    : null,
        'permissions_commenting'      => $storedProps['permissions_commenting']      !== null ? (bool)$storedProps['permissions_commenting']      : null,
        'permissions_printing'        => $storedProps['permissions_printing']        ?? null,
        'permissions_editing'         => $storedProps['permissions_editing']         !== null ? (bool)$storedProps['permissions_editing']         : null,
        // derived booleans for scoring
        'has_author'             => !empty($storedProps['author_encrypted']),
    ];
    $rawChecks = $body['checks'] ?? [];
    $score = computeScore($props, $access, getScoringConfig($db), $rawChecks);

    $db->prepare("UPDATE pdf_documents SET status = 'completed', overall_score = ? WHERE id = ?")
       ->execute([$score, $id]);
    updateHealthCheckStatus($db, $doc['health_check_id']);
    Response::success(['document_id' => $id, 'overall_score' => $score, 'accessibility' => $access]);
}

// ═══════════════════════════════════════════════════════════════════════════
// RECALCULATE — POST /api/documents/backfill-scores
// Re-scores every completed document using the current scoring configuration.
// Previously only filled NULL scores; now re-scores all completed docs so
// scoring-config changes made in the admin panel take effect immediately.
// ═══════════════════════════════════════════════════════════════════════════
if ($action === 'backfill-scores') {
    $config = getScoringConfig($db);

    $stmt = $db->query("
        SELECT
            d.id,
            pp.pdf_version, pp.is_tagged, pp.is_encrypted, pp.has_xfa,
            pp.is_linearized, pp.page_count, pp.content_type, pp.has_acroform,
            pp.has_embedded_files, pp.is_certified, pp.is_signed, pp.pii_author,
            pp.pdfa_compliance, pp.pdfe_compliance, pp.pdfua_compliance,
            pp.pdfvt_compliance, pp.pdfx_compliance,
            pp.info_title, pp.info_subject, pp.info_keywords, pp.info_creation_date,
            pp.permissions_allow_copy, pp.permissions_assistive_tech,
            pp.permissions_form_filling, pp.permissions_page_extraction,
            pp.permissions_doc_assembly, pp.permissions_commenting,
            pp.permissions_printing, pp.permissions_editing,
            pp.author_encrypted,
            pa.passed_checks, pa.failed_checks, pa.warning_checks, pa.raw_results
        FROM pdf_documents d
        JOIN pdf_properties pp ON pp.document_id = d.id
        LEFT JOIN pdf_accessibility pa ON pa.document_id = d.id
        WHERE d.status = 'completed'
    ");
    $docs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $updated = 0;
    $upd = $db->prepare("UPDATE pdf_documents SET overall_score = ? WHERE id = ?");

    foreach ($docs as $doc) {
        $props = [
            'is_tagged'                   => (bool)($doc['is_tagged']          ?? false),
            'is_linearized'               => (bool)($doc['is_linearized']      ?? false),
            'is_encrypted'                => (bool)($doc['is_encrypted']       ?? false),
            'has_xfa'                     => (bool)($doc['has_xfa']            ?? false),
            'has_acroform'                => (bool)($doc['has_acroform']       ?? false),
            'has_embedded_files'          => (bool)($doc['has_embedded_files'] ?? false),
            'is_certified'                => (bool)($doc['is_certified']       ?? false),
            'is_signed'                   => (bool)($doc['is_signed']          ?? false),
            'pii_author'                  => (bool)($doc['pii_author']         ?? false),
            'pdf_version'                 => $doc['pdf_version']               ?? null,
            'page_count'                  => (int)($doc['page_count']          ?? 0),
            'content_type'                => $doc['content_type']              ?? null,
            'pdfa_compliance'             => $doc['pdfa_compliance']           ?? null,
            'pdfe_compliance'             => $doc['pdfe_compliance']           ?? null,
            'pdfua_compliance'            => $doc['pdfua_compliance']          ?? null,
            'pdfvt_compliance'            => $doc['pdfvt_compliance']          ?? null,
            'pdfx_compliance'             => $doc['pdfx_compliance']           ?? null,
            'info_title'                  => $doc['info_title']                ?? null,
            'info_subject'                => $doc['info_subject']              ?? null,
            'info_keywords'               => $doc['info_keywords']             ?? null,
            'info_creation_date'          => $doc['info_creation_date']        ?? null,
            'permissions_allow_copy'      => $doc['permissions_allow_copy']      !== null ? (bool)$doc['permissions_allow_copy']      : null,
            'permissions_assistive_tech'  => $doc['permissions_assistive_tech']  !== null ? (bool)$doc['permissions_assistive_tech']  : null,
            'permissions_form_filling'    => $doc['permissions_form_filling']    !== null ? (bool)$doc['permissions_form_filling']    : null,
            'permissions_page_extraction' => $doc['permissions_page_extraction'] !== null ? (bool)$doc['permissions_page_extraction'] : null,
            'permissions_doc_assembly'    => $doc['permissions_doc_assembly']    !== null ? (bool)$doc['permissions_doc_assembly']    : null,
            'permissions_commenting'      => $doc['permissions_commenting']      !== null ? (bool)$doc['permissions_commenting']      : null,
            'permissions_printing'        => $doc['permissions_printing']        ?? null,
            'permissions_editing'         => $doc['permissions_editing']         !== null ? (bool)$doc['permissions_editing']         : null,
            'has_author'                  => !empty($doc['author_encrypted']),
        ];
        $access = [
            'passed_checks'  => (int)($doc['passed_checks']  ?? 0),
            'failed_checks'  => (int)($doc['failed_checks']  ?? 0),
            'warning_checks' => (int)($doc['warning_checks'] ?? 0),
        ];
        $rawChecks = parseRawChecks($doc['raw_results'] ?? null);
        $score = computeScore($props, $access, $config, $rawChecks);
        $upd->execute([$score, $doc['id']]);
        $updated++;
    }

    Response::success(['backfilled' => $updated]);
}

// FAIL — POST /api/documents/:id/fail
// Called by the client when a processing step fails after the document has been
// registered.  Stores the failing step name + error message so the UI can show
// a meaningful reason instead of "Unknown error".
// ═══════════════════════════════════════════════════════════════════════════
if ($action === 'fail') {
    $doc    = fetchDoc($db, $id);
    $body   = json_decode(file_get_contents('php://input'), true) ?? [];
    $step   = substr(trim($body['step']          ?? ''), 0, 100);
    $errMsg = substr(trim($body['error_message'] ?? 'Processing failed'), 0, 500);

    // Store as "[Step Name] error detail" so the frontend can parse both parts
    $stored = $step ? "[{$step}] {$errMsg}" : $errMsg;

    $db->prepare("UPDATE pdf_documents SET status = 'failed', error_message = ? WHERE id = ?")
       ->execute([$stored, $id]);
    updateHealthCheckStatus($db, $doc['health_check_id']);
    Response::success(['document_id' => $id, 'status' => 'failed']);
}

Response::error('Method not allowed', 405);

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Parse a PDF date string (D:YYYYMMDDHHmmSS[+/-HH'mm']) or any date string
 * recognisable by strtotime() into a MySQL DATETIME string "YYYY-MM-DD HH:mm:ss".
 * Returns null when the value is absent or unparseable.
 */
function parsePdfDate(?string $raw): ?string {
    if ($raw === null || trim($raw) === '') return null;
    $s = trim($raw);

    // PDF date format: D:YYYYMMDDHHmmSS[Z | +HH'mm' | -HH'mm']
    if (preg_match(
        "/^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?([+\-Z])?(\d{2})?'?(\d{2})?/i",
        $s, $m
    )) {
        $yr  = $m[1];
        $mo  = $m[2];
        $dy  = $m[3];
        $hh  = $m[4] ?? '00';
        $mm  = $m[5] ?? '00';
        $ss  = $m[6] ?? '00';
        $tsg = $m[7] ?? 'Z';   // +, -, or Z
        $tzh = str_pad($m[8] ?? '00', 2, '0', STR_PAD_LEFT);
        $tzm = str_pad($m[9] ?? '00', 2, '0', STR_PAD_LEFT);

        if ($tsg === 'Z' || $tsg === '') {
            $iso = "{$yr}-{$mo}-{$dy}T{$hh}:{$mm}:{$ss}Z";
        } else {
            $iso = "{$yr}-{$mo}-{$dy}T{$hh}:{$mm}:{$ss}{$tsg}{$tzh}:{$tzm}";
        }

        $ts = strtotime($iso);
        if ($ts !== false) return date('Y-m-d H:i:s', $ts);

        // Timezone part failed — use the naive datetime directly
        return "{$yr}-{$mo}-{$dy} {$hh}:{$mm}:{$ss}";
    }

    // Fall back to strtotime for ISO 8601 / RFC 2822 / natural language dates
    $ts = strtotime($s);
    return ($ts !== false) ? date('Y-m-d H:i:s', $ts) : null;
}

function getAdobeCredentials(PDO $db): array {
    try {
        $db->exec("CREATE TABLE IF NOT EXISTS app_settings (
            `key` VARCHAR(100) PRIMARY KEY,
            `value` TEXT NOT NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
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

function fetchDoc(PDO $db, int $id): array {
    $stmt = $db->prepare("SELECT id, health_check_id, status, adobe_asset_id FROM pdf_documents WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) Response::notFound('Document not found');
    return $row;
}

function parseProperties(array $result): array {
    $doc = $result['properties'] ?? $result['pdfProperties'] ?? $result;
    return [
        'pdf_version'   => $doc['PDFVersion']    ?? $doc['pdf_version']   ?? null,
        'page_count'    => (int)($doc['PageCount']   ?? $doc['page_count']  ?? 0),
        'is_tagged'     => (bool)($doc['IsTagged']    ?? $doc['isTagged']   ?? false),
        'is_linearized' => (bool)($doc['IsLinearized']?? $doc['isLinearized'] ?? false),
        'is_encrypted'  => (bool)($doc['IsEncrypted'] ?? $doc['isEncrypted'] ?? false),
        'has_acroform'  => (bool)($doc['HasAcroForm'] ?? $doc['hasAcroForm'] ?? false),
        'has_xfa'       => (bool)($doc['HasXFA']      ?? $doc['hasXFA']     ?? false),
        'content_type'  => $doc['ContentType']   ?? $doc['content_type']  ?? null,
    ];
}

function parseAccessibility(array $result): array {
    $passed = 0; $failed = 0; $warnings = 0;
    $checks = $result['checks'] ?? $result['checkResults'] ?? $result['results'] ?? [];
    foreach ($checks as $check) {
        $s = strtolower($check['status'] ?? $check['result'] ?? '');
        if (str_contains($s, 'pass'))    $passed++;
        elseif (str_contains($s, 'fail')) $failed++;
        else                              $warnings++;
    }
    if (empty($checks) && isset($result['summary'])) {
        $passed   = (int)($result['summary']['passed']   ?? 0);
        $failed   = (int)($result['summary']['failed']   ?? 0);
        $warnings = (int)($result['summary']['warnings'] ?? 0);
    }
    return ['passed_checks' => $passed, 'failed_checks' => $failed, 'warning_checks' => $warnings];
}

function storeProperties(PDO $db, int $docId, array $p, array $raw): void {
    global $enc;

    // Derive creator app from Creator / Producer fields
    $creatorApp = extractCreatorApp($p['creator'] ?? null, $p['producer'] ?? null);

    // PII detection: is Author field a person's name?
    $author    = $p['author'] ?? null;
    $piiAuthor = $author !== null && isProbablyPersonName($db, $author) ? 1 : 0;

    // Encrypt author for storage (may contain PII)
    $authorEnc = null;
    if ($author !== null) {
        try { $authorEnc = $enc->encrypt($author); } catch (\Throwable $e) { $authorEnc = null; }
    }

    // Helper: cast nullable bool to int|null for DB storage
    $nb = static fn(?bool $v) => $v !== null ? (int)$v : null;

    $db->prepare("
        INSERT INTO pdf_properties
            (document_id, pdf_version, page_count, is_tagged, is_linearized,
             is_encrypted, has_acroform, has_xfa, content_type, raw_properties,
             author_encrypted, creator_app, pii_author,
             has_embedded_files, is_certified, is_signed,
             pdfa_compliance, pdfe_compliance, pdfua_compliance, pdfvt_compliance, pdfx_compliance,
             info_title, info_subject, info_keywords, info_creation_date,
             permissions, permissions_allow_copy,
             permissions_assistive_tech, permissions_form_filling, permissions_page_extraction,
             permissions_doc_assembly, permissions_commenting, permissions_printing, permissions_editing)
        VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?, ?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?, ?,?,?, ?,?,?,?)
        ON DUPLICATE KEY UPDATE
            pdf_version=VALUES(pdf_version), page_count=VALUES(page_count),
            is_tagged=VALUES(is_tagged), is_linearized=VALUES(is_linearized),
            is_encrypted=VALUES(is_encrypted), has_acroform=VALUES(has_acroform),
            has_xfa=VALUES(has_xfa), content_type=VALUES(content_type),
            raw_properties=VALUES(raw_properties),
            author_encrypted=VALUES(author_encrypted), creator_app=VALUES(creator_app),
            pii_author=VALUES(pii_author),
            has_embedded_files=VALUES(has_embedded_files), is_certified=VALUES(is_certified),
            is_signed=VALUES(is_signed),
            pdfa_compliance=VALUES(pdfa_compliance), pdfe_compliance=VALUES(pdfe_compliance),
            pdfua_compliance=VALUES(pdfua_compliance), pdfvt_compliance=VALUES(pdfvt_compliance),
            pdfx_compliance=VALUES(pdfx_compliance),
            info_title=VALUES(info_title), info_subject=VALUES(info_subject),
            info_keywords=VALUES(info_keywords), info_creation_date=VALUES(info_creation_date),
            permissions=VALUES(permissions), permissions_allow_copy=VALUES(permissions_allow_copy),
            permissions_assistive_tech=VALUES(permissions_assistive_tech),
            permissions_form_filling=VALUES(permissions_form_filling),
            permissions_page_extraction=VALUES(permissions_page_extraction),
            permissions_doc_assembly=VALUES(permissions_doc_assembly),
            permissions_commenting=VALUES(permissions_commenting),
            permissions_printing=VALUES(permissions_printing),
            permissions_editing=VALUES(permissions_editing)
    ")->execute([
        $docId,
        $p['pdf_version'], (int)$p['page_count'],
        (int)$p['is_tagged'], (int)$p['is_linearized'],
        (int)$p['is_encrypted'], (int)$p['has_acroform'], (int)$p['has_xfa'],
        $p['content_type'], json_encode($raw),
        $authorEnc, $creatorApp, (int)$piiAuthor,
        (int)$p['has_embedded_files'], (int)$p['is_certified'], (int)$p['is_signed'],
        $p['pdfa_compliance'], $p['pdfe_compliance'], $p['pdfua_compliance'],
        $p['pdfvt_compliance'], $p['pdfx_compliance'],
        $p['info_title'], $p['info_subject'], $p['info_keywords'],
        $p['info_creation_date'],
        $p['permissions'] !== null ? json_encode($p['permissions']) : null,
        $nb($p['permissions_allow_copy'] ?? null),
        $nb($p['permissions_assistive_tech']  ?? null),
        $nb($p['permissions_form_filling']    ?? null),
        $nb($p['permissions_page_extraction'] ?? null),
        $nb($p['permissions_doc_assembly']    ?? null),
        $nb($p['permissions_commenting']      ?? null),
        $p['permissions_printing'] ?? null,
        $nb($p['permissions_editing']         ?? null),
    ]);
}

// ─── Creator app normalisation ─────────────────────────────────────────────

function extractCreatorApp(?string $creator, ?string $producer): ?string {
    // Prefer Creator field; fall back to Producer
    $raw = $creator ?: $producer;
    if (!$raw) return null;
    $l = strtolower($raw);

    // Known app patterns (order matters — check specific before generic)
    $patterns = [
        'indesign'         => 'Adobe InDesign',
        'illustrator'      => 'Adobe Illustrator',
        'acrobat distiller'=> 'Adobe Acrobat Distiller',
        'pdfmaker'         => 'Adobe Acrobat',
        'acrobat'          => 'Adobe Acrobat',
        'libreoffice'      => 'LibreOffice',
        'openoffice'       => 'OpenOffice',
        'microsoft word'   => 'Microsoft Word',
        'microsoft excel'  => 'Microsoft Excel',
        'microsoft powerpoint'=> 'Microsoft PowerPoint',
        'microsoft'        => 'Microsoft Office',
        'word'             => 'Microsoft Word',
        'excel'            => 'Microsoft Excel',
        'powerpoint'       => 'Microsoft PowerPoint',
        'foxit'            => 'Foxit',
        'nitro'            => 'Nitro PDF',
        'pdfium'           => 'Chromium / PDFium',
        'chromium'         => 'Chromium',
        'chrome'           => 'Google Chrome',
        'wkhtmltopdf'      => 'wkhtmltopdf',
        'ghostscript'      => 'Ghostscript',
        'itext'            => 'iText',
        'reportlab'        => 'ReportLab',
        'fpdf'             => 'FPDF',
        'latex'            => 'LaTeX',
        'tex'              => 'LaTeX',
        'quark'            => 'QuarkXPress',
        'framemaker'       => 'Adobe FrameMaker',
        'pages'            => 'Apple Pages',
        'keynote'          => 'Apple Keynote',
        'numbers'          => 'Apple Numbers',
    ];

    foreach ($patterns as $keyword => $name) {
        if (str_contains($l, $keyword)) return $name;
    }

    // Generic fallback: take first two words (strip version numbers)
    $words = preg_split('/[\s\/\(\)\[\],;]+/', trim($raw));
    $words = array_filter($words, fn($w) => $w && !preg_match('/^\d/', $w));
    $words = array_slice(array_values($words), 0, 2);
    return $words ? implode(' ', $words) : null;
}

// ─── Person-name detection ────────────────────────────────────────────────────
// isProbablyPersonName(), personNameConfidence(), personNameScore() live in
// backend/lib/PiiDetector.php and are loaded globally via index.php.

function storeAccessibility(PDO $db, int $docId, array $a, array $raw): void {
    $total = $a['passed_checks'] + $a['failed_checks'] + $a['warning_checks'];
    $score = $total > 0 ? (int)round(($a['passed_checks'] / $total) * 100) : 0;
    $db->prepare("
        INSERT INTO pdf_accessibility
            (document_id, overall_score, passed_checks, failed_checks, warning_checks, raw_results)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            overall_score=VALUES(overall_score), passed_checks=VALUES(passed_checks),
            failed_checks=VALUES(failed_checks), warning_checks=VALUES(warning_checks),
            raw_results=VALUES(raw_results)
    ")->execute([
        $docId, $score,
        $a['passed_checks'], $a['failed_checks'], $a['warning_checks'],
        json_encode($raw)
    ]);
}


function updateHealthCheckStatus(PDO $db, int $hcId): void {
    $stmt = $db->prepare("
        SELECT
            SUM(status NOT IN ('completed','failed')) AS pending,
            COUNT(*) AS total
        FROM pdf_documents WHERE health_check_id = ?
    ");
    $stmt->execute([$hcId]);
    $c = $stmt->fetch();
    if ((int)$c['total'] === 0 || (int)$c['pending'] > 0) {
        $new = (int)$c['total'] === 0 ? 'failed' : 'processing';
        $db->prepare("UPDATE health_checks SET status = ? WHERE id = ?")->execute([$new, $hcId]);
    } else {
        // All docs done (completed or failed) — always mark health check as completed
        $db->prepare("UPDATE health_checks SET status = 'completed', completed_at = NOW() WHERE id = ?")->execute([$hcId]);
    }
}
