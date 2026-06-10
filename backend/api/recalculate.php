<?php
/**
 * POST /api/admin/recalculate-scores
 *
 * Re-scores all completed documents using the current scoring configuration.
 * Returns { updated: N, skipped: N, errors: N }
 */

$db     = getDB();
$method = $_SERVER['REQUEST_METHOD'];

require_once __DIR__ . '/../lib/Scoring.php';

// Require valid admin session
(function() use ($db) {
    try {
        $tok = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
        if (!$tok) { Response::error('Admin authentication required', 401); exit; }
        $s = $db->prepare("SELECT token FROM admin_sessions WHERE token=? AND expires_at > NOW()");
        $s->execute([$tok]);
        if (!$s->fetch()) { Response::error('Admin authentication required', 401); exit; }
    } catch (\Throwable $e) { Response::error('Admin authentication required', 401); exit; }
})();

if ($method !== 'POST') {
    Response::error('Method not allowed', 405);
    exit;
}

// Load current scoring config once
$config = getScoringConfig($db);

// Fetch all completed documents with their properties and accessibility data
$stmt = $db->prepare("
    SELECT
        d.id,
        pp.pdf_version,
        pp.is_tagged,
        pp.is_encrypted,
        pp.has_xfa,
        pp.is_linearized,
        pp.page_count,
        pp.content_type,
        pp.has_acroform,
        pp.has_embedded_files,
        pp.is_certified,
        pp.is_signed,
        pp.pdfa_compliance,
        pp.pdfe_compliance,
        pp.pdfua_compliance,
        pp.pdfvt_compliance,
        pp.pdfx_compliance,
        pp.info_title,
        pp.info_subject,
        pp.info_keywords,
        pp.info_creation_date,
        pp.pii_author,
        pp.permissions_allow_copy,
        pp.permissions_assistive_tech,
        pp.permissions_form_filling,
        pp.permissions_page_extraction,
        pp.permissions_doc_assembly,
        pp.permissions_commenting,
        pp.permissions_printing,
        pp.permissions_editing,
        pp.author_encrypted,
        pa.passed_checks,
        pa.failed_checks,
        pa.warning_checks,
        pa.raw_results
    FROM pdf_documents d
    LEFT JOIN pdf_properties    pp ON pp.document_id = d.id
    LEFT JOIN pdf_accessibility pa ON pa.document_id = d.id
    WHERE d.status = 'completed'
");
$stmt->execute();
$docs = $stmt->fetchAll(PDO::FETCH_ASSOC);

$updated = 0;
$skipped = 0;
$errors  = 0;

$upd = $db->prepare("UPDATE pdf_documents SET overall_score = ? WHERE id = ?");

foreach ($docs as $doc) {
    try {
        // Skip documents with no property data at all
        if ($doc['pdf_version'] === null && $doc['is_tagged'] === null) {
            $skipped++;
            continue;
        }

        $props = [
            'pdf_version'           => $doc['pdf_version'],
            'is_tagged'             => (bool)$doc['is_tagged'],
            'is_encrypted'          => (bool)$doc['is_encrypted'],
            'has_xfa'               => (bool)$doc['has_xfa'],
            'is_linearized'         => (bool)$doc['is_linearized'],
            'page_count'            => (int)($doc['page_count'] ?? 0),
            'content_type'          => $doc['content_type'],
            'has_acroform'          => (bool)$doc['has_acroform'],
            'has_embedded_files'    => (bool)$doc['has_embedded_files'],
            'is_certified'          => (bool)$doc['is_certified'],
            'is_signed'             => (bool)$doc['is_signed'],
            'pdfa_compliance'       => $doc['pdfa_compliance'],
            'pdfe_compliance'       => $doc['pdfe_compliance'],
            'pdfua_compliance'      => $doc['pdfua_compliance'],
            'pdfvt_compliance'      => $doc['pdfvt_compliance'],
            'pdfx_compliance'       => $doc['pdfx_compliance'],
            'info_title'            => $doc['info_title'],
            'info_subject'          => $doc['info_subject'],
            'info_keywords'         => $doc['info_keywords'],
            'info_creation_date'    => $doc['info_creation_date'] ?? null,
            'pii_author'            => (bool)($doc['pii_author'] ?? false),
            'permissions_allow_copy'      => $doc['permissions_allow_copy']      !== null ? (bool)$doc['permissions_allow_copy']      : null,
            'permissions_assistive_tech'  => $doc['permissions_assistive_tech']  !== null ? (bool)$doc['permissions_assistive_tech']  : null,
            'permissions_form_filling'    => $doc['permissions_form_filling']    !== null ? (bool)$doc['permissions_form_filling']    : null,
            'permissions_page_extraction' => $doc['permissions_page_extraction'] !== null ? (bool)$doc['permissions_page_extraction'] : null,
            'permissions_doc_assembly'    => $doc['permissions_doc_assembly']    !== null ? (bool)$doc['permissions_doc_assembly']    : null,
            'permissions_commenting'      => $doc['permissions_commenting']      !== null ? (bool)$doc['permissions_commenting']      : null,
            'permissions_printing'        => $doc['permissions_printing']        ?? null,
            'permissions_editing'         => $doc['permissions_editing']         !== null ? (bool)$doc['permissions_editing']         : null,
            'has_author'            => !empty($doc['author_encrypted']),
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
    } catch (\Throwable $e) {
        error_log('recalculate: doc ' . $doc['id'] . ': ' . $e->getMessage());
        $errors++;
    }
}

Response::success([
    'updated' => $updated,
    'skipped' => $skipped,
    'errors'  => $errors,
]);
