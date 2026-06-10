<?php
/** GET /api/customers/:id/report
 *
 * Returns ALL data required to render the customer-facing health check report
 * in a single round-trip: customer info, per-health-check aggregates, every
 * document with its properties and per-accessibility-check breakdown.
 */
$enc = new Encryption(ENCRYPTION_KEY);
$db  = getDB();
$id  = (int)$_ROUTE_ID;

if ($method !== 'GET') Response::error('Method not allowed', 405);

// ── Customer info + top-level aggregates ──────────────────────────────────
$custStmt = $db->prepare("
    SELECT c.id, c.name_encrypted, c.region, c.country, c.vertical, c.created_at,
           COUNT(DISTINCT hc.id) AS health_check_count,
           COUNT(DISTINCT d.id)  AS total_docs,
           ROUND(AVG(d.overall_score))   AS avg_score,
           SUM(d.overall_score >= 75)    AS score_good,
           SUM(d.overall_score BETWEEN 50 AND 74)                           AS score_fair,
           SUM(d.overall_score < 50 AND d.overall_score IS NOT NULL)        AS score_poor
    FROM customers c
    LEFT JOIN health_checks hc ON hc.customer_id = c.id
    LEFT JOIN pdf_documents  d ON d.health_check_id = hc.id AND d.status = 'completed'
    WHERE c.id = ?
    GROUP BY c.id
");
$custStmt->execute([$id]);
$cust = $custStmt->fetch();
if (!$cust) Response::notFound('Customer not found');

try { $cust['display_name'] = $enc->decrypt($cust['name_encrypted']); }
catch (\Throwable $e) { $cust['display_name'] = 'Customer #' . $id; }
unset($cust['name_encrypted']);
$cust['avg_score'] = $cust['avg_score'] !== null ? (int)$cust['avg_score'] : null;
foreach (['health_check_count','total_docs','score_good','score_fair','score_poor'] as $k) {
    $cust[$k] = (int)($cust[$k] ?? 0);
}

// ── Health checks (header-level, no documents yet) ────────────────────────
$hcStmt = $db->prepare("
    SELECT hc.id, hc.name, hc.created_at, hc.status,
           COUNT(d.id)               AS doc_count,
           ROUND(AVG(d.overall_score)) AS avg_score
    FROM health_checks hc
    LEFT JOIN pdf_documents d ON d.health_check_id = hc.id AND d.status = 'completed'
    WHERE hc.customer_id = ?
    GROUP BY hc.id
    ORDER BY hc.created_at DESC
");
$hcStmt->execute([$id]);
$healthChecks = $hcStmt->fetchAll();
foreach ($healthChecks as &$hc) {
    $hc['doc_count'] = (int)$hc['doc_count'];
    $hc['avg_score'] = $hc['avg_score'] !== null ? (int)$hc['avg_score'] : null;
}
unset($hc);

// ── Documents with properties + accessibility ─────────────────────────────
$docStmt = $db->prepare("
    SELECT d.id, d.filename_encrypted, d.overall_score, d.file_size, d.created_at,
           d.health_check_id,
           pp.pdf_version, pp.page_count,
           pp.is_tagged, pp.is_linearized, pp.is_encrypted,
           pp.has_xfa, pp.has_acroform, pp.content_type, pp.creator_app,
           pp.author_encrypted, pp.pii_author,
           pp.has_embedded_files, pp.permissions_allow_copy,
           pp.permissions_assistive_tech, pp.permissions_form_filling,
           pp.permissions_printing, pp.permissions_commenting,
           a.passed_checks, a.failed_checks, a.warning_checks, a.raw_results
    FROM pdf_documents d
    JOIN health_checks hc         ON hc.id = d.health_check_id
    LEFT JOIN pdf_properties    pp ON pp.document_id = d.id
    LEFT JOIN pdf_accessibility a  ON a.document_id  = d.id
    WHERE hc.customer_id = ? AND d.status = 'completed'
    ORDER BY hc.created_at DESC, d.id ASC
");
$docStmt->execute([$id]);
$allDocs = $docStmt->fetchAll();

$docsByHc = [];
$totPages        = 0;
$totTagged       = 0;
$totLinearized   = 0;
$totEncrypted    = 0;
$totXfa          = 0;
$totPii          = 0;
$totHasAuthor    = 0;
$totEmbedded     = 0;
$totPermData     = 0;
$totAtBlocked    = 0;
$totCopyBlocked  = 0;
$totPrintBlocked = 0;
$totFormFillBlocked = 0;
$totCommentBlocked  = 0;
$accessRates     = [];

foreach ($allDocs as &$doc) {
    // Decrypt filename & author
    try { $doc['filename'] = $enc->decrypt($doc['filename_encrypted']); }
    catch (\Throwable $e) { $doc['filename'] = 'document.pdf'; }
    $doc['author'] = null;
    if (!empty($doc['author_encrypted'])) {
        try { $doc['author'] = $enc->decrypt($doc['author_encrypted']); }
        catch (\Throwable $e) {}
    }
    unset($doc['filename_encrypted'], $doc['author_encrypted']);

    // Parse per-check accessibility breakdown from raw_results JSON
    $checks = [];
    if (!empty($doc['raw_results'])) {
        $raw        = json_decode($doc['raw_results'], true) ?? [];
        $categories = $raw['DetailedReport'] ?? $raw['detailedReport'] ?? [];
        if ($categories) {
            foreach ($categories as $cat) {
                foreach ($cat['Elements'] ?? $cat['elements'] ?? [] as $el) {
                    $checks[] = [
                        'checkName' => $el['CheckName']   ?? $el['checkName']   ?? $el['name']  ?? '',
                        'status'    => $el['Status']      ?? $el['status']      ?? '',
                        'category'  => $cat['Category']   ?? $cat['category']   ?? '',
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

    // Cast booleans & integers
    $doc['overall_score']  = $doc['overall_score']  !== null ? (int)$doc['overall_score']  : null;
    $doc['page_count']     = (int)($doc['page_count']  ?? 0);
    $doc['file_size']      = (int)($doc['file_size']   ?? 0);
    $doc['is_tagged']      = (bool)($doc['is_tagged']      ?? false);
    $doc['is_linearized']  = (bool)($doc['is_linearized']  ?? false);
    $doc['is_encrypted']   = (bool)($doc['is_encrypted']   ?? false);
    $doc['has_xfa']        = (bool)($doc['has_xfa']        ?? false);
    $doc['has_acroform']   = (bool)($doc['has_acroform']   ?? false);
    $doc['pii_author']     = (bool)($doc['pii_author']     ?? false);
    $doc['has_embedded_files']       = (bool)($doc['has_embedded_files']       ?? false);
    $doc['permissions_allow_copy']   = $doc['permissions_allow_copy']   !== null ? (bool)$doc['permissions_allow_copy']   : null;
    $doc['permissions_assistive_tech']= $doc['permissions_assistive_tech'] !== null ? (bool)$doc['permissions_assistive_tech'] : null;
    $doc['permissions_form_filling'] = $doc['permissions_form_filling'] !== null ? (bool)$doc['permissions_form_filling'] : null;
    $doc['permissions_printing']     = $doc['permissions_printing']     ?? null;
    $doc['permissions_commenting']   = $doc['permissions_commenting']   !== null ? (bool)$doc['permissions_commenting']   : null;
    $doc['passed_checks']  = (int)($doc['passed_checks']   ?? 0);
    $doc['failed_checks']  = (int)($doc['failed_checks']   ?? 0);
    $doc['warning_checks'] = (int)($doc['warning_checks']  ?? 0);

    $total = $doc['passed_checks'] + $doc['failed_checks'] + $doc['warning_checks'];
    $doc['access_pass_rate'] = $total > 0 ? (int)round($doc['passed_checks'] / $total * 100) : null;

    // Accumulate summary counters
    $totPages      += $doc['page_count'];
    if ($doc['is_tagged'])         $totTagged++;
    if ($doc['is_linearized'])     $totLinearized++;
    if ($doc['is_encrypted'])      $totEncrypted++;
    if ($doc['has_xfa'])           $totXfa++;
    if ($doc['pii_author'])        $totPii++;
    if ($doc['author'] !== null)   $totHasAuthor++;
    if ($doc['has_embedded_files'])$totEmbedded++;
    if ($doc['permissions_assistive_tech'] !== null) {
        $totPermData++;
        if ($doc['permissions_assistive_tech'] === false) $totAtBlocked++;
    }
    if ($doc['permissions_allow_copy']   === false) $totCopyBlocked++;
    if ($doc['permissions_printing']     === 'none') $totPrintBlocked++;
    if ($doc['permissions_form_filling'] === false) $totFormFillBlocked++;
    if ($doc['permissions_commenting']   === false) $totCommentBlocked++;
    if ($doc['access_pass_rate'] !== null) $accessRates[] = $doc['access_pass_rate'];

    // Group by health_check_id
    $docsByHc[$doc['health_check_id']][] = $doc;
}
unset($doc);

// Attach documents to health checks
foreach ($healthChecks as &$hc) {
    $hc['documents'] = $docsByHc[$hc['id']] ?? [];
}
unset($hc);

// ── Aggregated summary ────────────────────────────────────────────────────
$totalDocs = count($allDocs);
$avgAccess = count($accessRates) ? (int)round(array_sum($accessRates) / count($accessRates)) : null;

$summary = [
    'total_docs'      => $totalDocs,
    'total_pages'     => $totPages,
    'avg_score'       => $cust['avg_score'],
    'score_good'      => $cust['score_good'],
    'score_fair'      => $cust['score_fair'],
    'score_poor'      => $cust['score_poor'],
    'pct_tagged'       => $totalDocs ? (int)round($totTagged     / $totalDocs * 100) : 0,
    'pct_linearized'   => $totalDocs ? (int)round($totLinearized / $totalDocs * 100) : 0,
    'pct_encrypted'    => $totalDocs ? (int)round($totEncrypted  / $totalDocs * 100) : 0,
    'pct_xfa'          => $totalDocs ? (int)round($totXfa        / $totalDocs * 100) : 0,
    'pct_embedded'     => $totalDocs ? (int)round($totEmbedded   / $totalDocs * 100) : 0,
    'pii_count'        => $totPii,
    'has_author'       => $totHasAuthor,
    'perm_has_data'    => $totPermData,
    'pct_at_blocked'   => $totPermData ? (int)round($totAtBlocked       / $totPermData * 100) : null,
    'pct_copy_blocked' => $totPermData ? (int)round($totCopyBlocked     / $totPermData * 100) : null,
    'pct_print_blocked'=> $totPermData ? (int)round($totPrintBlocked    / $totPermData * 100) : null,
    'pct_form_fill_blocked' => $totPermData ? (int)round($totFormFillBlocked / $totPermData * 100) : null,
    'pct_comment_blocked'   => $totPermData ? (int)round($totCommentBlocked  / $totPermData * 100) : null,
    'avg_access_rate'  => $avgAccess,
];

Response::success([
    'customer'      => $cust,
    'summary'       => $summary,
    'health_checks' => $healthChecks,
    'generated_at'  => date('c'),
]);
