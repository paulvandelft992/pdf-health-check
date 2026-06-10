<?php
/** GET /api/health-checks/:id/report
 *
 * Returns all data required to render a customer-facing PDF report for a
 * single health check: health check metadata, customer info, every completed
 * document with its properties and per-accessibility-check breakdown, and a
 * pre-computed summary object ready for the front-end charts.
 */
$enc = new Encryption(ENCRYPTION_KEY);
$db  = getDB();
$id  = (int)$_ROUTE_ID;

if ($method !== 'GET') Response::error('Method not allowed', 405);

// ── Health check + customer info ──────────────────────────────────────────
$hcStmt = $db->prepare("
    SELECT hc.id, hc.name, hc.created_at, hc.status, hc.customer_id,
           c.name_encrypted AS customer_name_encrypted,
           c.region, c.country, c.vertical,
           COUNT(d.id)                                                    AS total_docs,
           ROUND(AVG(d.overall_score))                                    AS avg_score,
           SUM(d.overall_score >= 75)                                     AS score_good,
           SUM(d.overall_score BETWEEN 50 AND 74)                         AS score_fair,
           SUM(d.overall_score < 50 AND d.overall_score IS NOT NULL)      AS score_poor
    FROM health_checks hc
    LEFT JOIN customers     c ON c.id = hc.customer_id
    LEFT JOIN pdf_documents d ON d.health_check_id = hc.id AND d.status = 'completed'
    WHERE hc.id = ?
    GROUP BY hc.id
");
$hcStmt->execute([$id]);
$hc = $hcStmt->fetch();
if (!$hc) Response::notFound('Health check not found');

// Decrypt customer name
try   { $hc['customer_name'] = $enc->decrypt($hc['customer_name_encrypted']); }
catch (\Throwable $e) { $hc['customer_name'] = 'Customer #' . $hc['customer_id']; }
unset($hc['customer_name_encrypted']);

$hc['avg_score'] = $hc['avg_score'] !== null ? (int)$hc['avg_score'] : null;
foreach (['total_docs','score_good','score_fair','score_poor'] as $k) {
    $hc[$k] = (int)($hc[$k] ?? 0);
}

// ── Documents: properties + accessibility ─────────────────────────────────
$docStmt = $db->prepare("
    SELECT d.id, d.filename_encrypted, d.overall_score, d.file_size, d.created_at,
           pp.pdf_version, pp.page_count,
           pp.is_tagged, pp.is_linearized, pp.is_encrypted,
           pp.has_xfa, pp.has_acroform, pp.content_type, pp.creator_app,
           pp.author_encrypted, pp.pii_author,
           pp.has_embedded_files, pp.is_certified, pp.is_signed,
           pp.pdfa_compliance, pp.pdfua_compliance,
           pp.info_title, pp.info_subject, pp.info_keywords, pp.info_creation_date,
           pp.permissions_allow_copy, pp.permissions_assistive_tech,
           pp.permissions_form_filling, pp.permissions_printing,
           pp.permissions_commenting, pp.permissions_editing,
           pp.permissions_page_extraction, pp.permissions_doc_assembly,
           a.passed_checks, a.failed_checks, a.warning_checks, a.raw_results
    FROM pdf_documents d
    LEFT JOIN pdf_properties   pp ON pp.document_id = d.id
    LEFT JOIN pdf_accessibility a  ON a.document_id  = d.id
    WHERE d.health_check_id = ? AND d.status = 'completed'
    ORDER BY d.id ASC
");
$docStmt->execute([$id]);
$allDocs = $docStmt->fetchAll();

// ── Process each document ─────────────────────────────────────────────────
$totPages      = 0;
$totTagged     = 0;
$totLinearized = 0;
$totEncrypted  = 0;
$totXfa        = 0;
$totPii        = 0;
$totHasAuthor  = 0;
$totEmbedded    = 0;
$totCertified   = 0;
$totSigned      = 0;
$totPdfua       = 0;
$totPdfa        = 0;
$totHasTitle    = 0;
$totAllowCopy   = 0;
// Permission counters (only counted when permission data is present, i.e. encrypted PDFs)
$totPermData       = 0;  // PDFs that have permission data (encrypted)
$totAtBlocked      = 0;  // assistive_tech = false
$totCopyBlocked    = 0;  // allow_copy = false
$totPrintBlocked   = 0;  // printing = 'none'
$totFormFillBlocked= 0;  // form_filling = false
$totCommentBlocked = 0;  // commenting = false
$accessRates   = [];

foreach ($allDocs as &$doc) {
    // Decrypt filename
    try   { $doc['filename'] = $enc->decrypt($doc['filename_encrypted']); }
    catch (\Throwable $e) { $doc['filename'] = 'document.pdf'; }

    // Decrypt author
    $doc['author'] = null;
    if (!empty($doc['author_encrypted'])) {
        try { $doc['author'] = $enc->decrypt($doc['author_encrypted']); }
        catch (\Throwable $e) {}
    }
    unset($doc['filename_encrypted'], $doc['author_encrypted']);

    // Parse per-check accessibility breakdown
    $checks = [];
    if (!empty($doc['raw_results'])) {
        $raw        = json_decode($doc['raw_results'], true) ?? [];
        $categories = $raw['DetailedReport'] ?? $raw['detailedReport'] ?? [];
        if ($categories) {
            foreach ($categories as $cat) {
                foreach ($cat['Elements'] ?? $cat['elements'] ?? [] as $el) {
                    $checks[] = [
                        'checkName' => $el['CheckName']  ?? $el['checkName']  ?? $el['name']   ?? '',
                        'status'    => $el['Status']     ?? $el['status']     ?? '',
                        'category'  => $cat['Category']  ?? $cat['category']  ?? '',
                    ];
                }
            }
        } else {
            foreach ($raw['checks'] ?? $raw['checkResults'] ?? [] as $ch) {
                $checks[] = [
                    'checkName' => $ch['checkName'] ?? $ch['name']   ?? '',
                    'status'    => $ch['status']    ?? $ch['result'] ?? '',
                    'category'  => $ch['category']  ?? '',
                ];
            }
        }
    }
    unset($doc['raw_results']);
    $doc['checks'] = $checks;

    // Cast types
    $doc['overall_score']  = $doc['overall_score']  !== null ? (int)$doc['overall_score']  : null;
    $doc['page_count']     = (int)($doc['page_count']  ?? 0);
    $doc['file_size']      = (int)($doc['file_size']   ?? 0);
    $doc['is_tagged']      = (bool)($doc['is_tagged']      ?? false);
    $doc['is_linearized']  = (bool)($doc['is_linearized']  ?? false);
    $doc['is_encrypted']   = (bool)($doc['is_encrypted']   ?? false);
    $doc['has_xfa']        = (bool)($doc['has_xfa']        ?? false);
    $doc['has_acroform']   = (bool)($doc['has_acroform']   ?? false);
    $doc['pii_author']     = (bool)($doc['pii_author']     ?? false);
    $doc['has_embedded_files']     = (bool)($doc['has_embedded_files']  ?? false);
    $doc['is_certified']           = (bool)($doc['is_certified']        ?? false);
    $doc['is_signed']              = (bool)($doc['is_signed']           ?? false);
    $doc['pdfa_compliance']        = $doc['pdfa_compliance']  ?? null;
    $doc['pdfua_compliance']       = $doc['pdfua_compliance'] ?? null;
    $doc['info_title']             = $doc['info_title']       ?? null;
    $doc['info_subject']             = $doc['info_subject']   ?? null;
    $doc['info_keywords']            = $doc['info_keywords']  ?? null;
    $doc['info_creation_date']       = $doc['info_creation_date'] ?? null;
    $doc['permissions_allow_copy']       = $doc['permissions_allow_copy']       !== null ? (bool)$doc['permissions_allow_copy']       : null;
    $doc['permissions_assistive_tech']   = $doc['permissions_assistive_tech']   !== null ? (bool)$doc['permissions_assistive_tech']   : null;
    $doc['permissions_form_filling']     = $doc['permissions_form_filling']     !== null ? (bool)$doc['permissions_form_filling']     : null;
    $doc['permissions_printing']         = $doc['permissions_printing']         ?? null;
    $doc['permissions_commenting']       = $doc['permissions_commenting']       !== null ? (bool)$doc['permissions_commenting']       : null;
    $doc['permissions_editing']          = $doc['permissions_editing']          !== null ? (bool)$doc['permissions_editing']          : null;
    $doc['permissions_page_extraction']  = $doc['permissions_page_extraction']  !== null ? (bool)$doc['permissions_page_extraction']  : null;
    $doc['permissions_doc_assembly']     = $doc['permissions_doc_assembly']     !== null ? (bool)$doc['permissions_doc_assembly']     : null;
    $doc['passed_checks']  = (int)($doc['passed_checks']   ?? 0);
    $doc['failed_checks']  = (int)($doc['failed_checks']   ?? 0);
    $doc['warning_checks'] = (int)($doc['warning_checks']  ?? 0);

    $total = $doc['passed_checks'] + $doc['failed_checks'] + $doc['warning_checks'];
    $doc['access_pass_rate'] = $total > 0
        ? (int)round($doc['passed_checks'] / $total * 100) : null;

    // Accumulate summary counters
    $totPages += $doc['page_count'];
    if ($doc['is_tagged'])          $totTagged++;
    if ($doc['is_linearized'])      $totLinearized++;
    if ($doc['is_encrypted'])       $totEncrypted++;
    if ($doc['has_xfa'])            $totXfa++;
    if ($doc['pii_author'])         $totPii++;
    if ($doc['author'] !== null)    $totHasAuthor++;
    if ($doc['has_embedded_files'])               $totEmbedded++;
    if ($doc['is_certified'])                     $totCertified++;
    if ($doc['is_signed'])                        $totSigned++;
    if (!empty($doc['pdfua_compliance']))          $totPdfua++;
    if (!empty($doc['pdfa_compliance']))           $totPdfa++;
    if (!empty($doc['info_title']))                $totHasTitle++;
    if ($doc['permissions_allow_copy'] === true)  $totAllowCopy++;
    // Permission counters — only when permission data exists (encrypted PDF)
    if ($doc['permissions_assistive_tech'] !== null) {
        $totPermData++;
        if ($doc['permissions_assistive_tech'] === false) $totAtBlocked++;
    }
    if ($doc['permissions_allow_copy'] === false)                            $totCopyBlocked++;
    if ($doc['permissions_printing']   === 'none')                          $totPrintBlocked++;
    if ($doc['permissions_form_filling'] === false)                         $totFormFillBlocked++;
    if ($doc['permissions_commenting']   === false)                         $totCommentBlocked++;
    if ($doc['access_pass_rate'] !== null) $accessRates[] = $doc['access_pass_rate'];
}
unset($doc);

// ── Summary ───────────────────────────────────────────────────────────────
$totalDocs = count($allDocs);
$avgAccess = count($accessRates)
    ? (int)round(array_sum($accessRates) / count($accessRates)) : null;

$summary = [
    'total_docs'     => $totalDocs,
    'total_pages'    => $totPages,
    'avg_score'      => $hc['avg_score'],
    'score_good'     => $hc['score_good'],
    'score_fair'     => $hc['score_fair'],
    'score_poor'     => $hc['score_poor'],
    'pct_tagged'     => $totalDocs ? (int)round($totTagged     / $totalDocs * 100) : 0,
    'pct_linearized' => $totalDocs ? (int)round($totLinearized / $totalDocs * 100) : 0,
    'pct_encrypted'  => $totalDocs ? (int)round($totEncrypted  / $totalDocs * 100) : 0,
    'pct_xfa'        => $totalDocs ? (int)round($totXfa        / $totalDocs * 100) : 0,
    'pii_count'      => $totPii,
    'has_author'     => $totHasAuthor,
    'pct_embedded'   => $totalDocs ? (int)round($totEmbedded  / $totalDocs * 100) : 0,
    'pct_certified'  => $totalDocs ? (int)round($totCertified / $totalDocs * 100) : 0,
    'pct_signed'     => $totalDocs ? (int)round($totSigned    / $totalDocs * 100) : 0,
    'pct_pdfua'      => $totalDocs ? (int)round($totPdfua     / $totalDocs * 100) : 0,
    'pct_pdfa'       => $totalDocs ? (int)round($totPdfa      / $totalDocs * 100) : 0,
    'pct_has_title'  => $totalDocs ? (int)round($totHasTitle  / $totalDocs * 100) : 0,
    'pct_allow_copy'      => $totalDocs && $totAllowCopy > 0 ? (int)round($totAllowCopy  / $totalDocs * 100) : null,
    'perm_has_data'       => $totPermData,
    'pct_at_blocked'      => $totPermData ? (int)round($totAtBlocked       / $totPermData * 100) : null,
    'pct_copy_blocked'    => $totPermData ? (int)round($totCopyBlocked     / $totPermData * 100) : null,
    'pct_print_blocked'   => $totPermData ? (int)round($totPrintBlocked    / $totPermData * 100) : null,
    'pct_form_fill_blocked'=> $totPermData ? (int)round($totFormFillBlocked/ $totPermData * 100) : null,
    'pct_comment_blocked' => $totPermData ? (int)round($totCommentBlocked  / $totPermData * 100) : null,
    'avg_access_rate'     => $avgAccess,
];

Response::success([
    'health_check' => $hc,
    'summary'      => $summary,
    'documents'    => $allDocs,
    'generated_at' => date('c'),
]);
