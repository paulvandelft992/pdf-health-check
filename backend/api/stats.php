<?php
/** Stats / Dashboard API */
$db   = getDB();
$stat = $_ROUTE_STAT ?? '';

// ── Common filter params ───────────────────────────────────────────────────
// All endpoints accept optional ?customer_id= and/or ?health_check_id= to
// scope results to a specific customer or health check.
$filterCustId = (int)($_GET['customer_id']    ?? 0);
$filterHcId   = (int)($_GET['health_check_id'] ?? 0);

// For queries that include: pdf_documents d → health_checks hc → customers c
// (used when the main table is pdf_documents, pdf_properties, or pdf_accessibility)
$docWhere  = '';
$docParams = [];
if ($filterHcId)       { $docWhere = ' AND d.health_check_id = ?'; $docParams[] = $filterHcId; }
elseif ($filterCustId) { $docWhere = ' AND hc.customer_id = ?';    $docParams[] = $filterCustId; }

// For queries that start from customers c (with LEFT JOINs to hc, d)
$custWhere  = '';
$custParams = [];
if ($filterHcId)       { $custWhere = ' AND hc.id = ?'; $custParams[] = $filterHcId; }
elseif ($filterCustId) { $custWhere = ' AND c.id = ?';  $custParams[] = $filterCustId; }

// ── GET /api/stats/overview ────────────────────────────────────────────────
if ($stat === 'overview') {
    $ovStmt = $db->prepare("
        SELECT
            COUNT(DISTINCT c.id)   AS total_customers,
            -- Customers created in the current calendar month (de-duped via DISTINCT)
            COUNT(DISTINCT CASE WHEN DATE_FORMAT(c.created_at,'%Y-%m') = DATE_FORMAT(NOW(),'%Y-%m') THEN c.id END) AS new_customers_30d,
            COUNT(DISTINCT hc.id)  AS total_health_checks,
            -- Use COUNT(DISTINCT …) so the per-document JOIN fan-out doesn't inflate the count
            COUNT(DISTINCT CASE WHEN hc.status='completed' THEN hc.id END)               AS completed_health_checks,
            COUNT(DISTINCT d.id)   AS total_pdfs,
            COALESCE(SUM(pp.page_count), 0)                                               AS total_pages,
            ROUND(AVG(d.overall_score))                                                   AS avg_score,
            SUM(CASE WHEN d.overall_score >= 75  THEN 1 ELSE 0 END)                      AS score_good,
            SUM(CASE WHEN d.overall_score BETWEEN 50 AND 74 THEN 1 ELSE 0 END)           AS score_fair,
            SUM(CASE WHEN d.overall_score < 50 AND d.overall_score IS NOT NULL THEN 1 ELSE 0 END) AS score_poor,
            SUM(CASE WHEN pp.is_tagged     = 1 THEN 1 ELSE 0 END)                        AS tagged_pdfs,
            SUM(CASE WHEN pp.is_encrypted  = 1 THEN 1 ELSE 0 END)                        AS encrypted_pdfs,
            SUM(CASE WHEN pp.is_linearized = 1 THEN 1 ELSE 0 END)                        AS linearized_pdfs,
            SUM(CASE WHEN pp.has_xfa       = 1 THEN 1 ELSE 0 END)                        AS xfa_pdfs,
            SUM(CASE WHEN pp.pdf_version  >= '1.4' THEN 1 ELSE 0 END)                    AS pdf_version_compliant,
            ROUND(AVG(
                a.passed_checks * 100.0 /
                NULLIF(a.passed_checks + a.failed_checks + a.warning_checks, 0)
            ))                                                                             AS avg_accessibility_rate,
            SUM(CASE WHEN d.status='completed' AND a.failed_checks = 0 THEN 1 ELSE 0 END) AS no_issues_pdfs,
            SUM(CASE WHEN pp.pii_author    = 1 THEN 1 ELSE 0 END)  AS pii_author_pdfs,
            SUM(CASE WHEN pp.has_embedded_files = 1 THEN 1 ELSE 0 END) AS embedded_pdfs,
            SUM(CASE WHEN pp.pdfua_compliance IS NOT NULL AND pp.pdfua_compliance != '' THEN 1 ELSE 0 END) AS pdfua_pdfs,
            SUM(CASE WHEN pp.info_title IS NOT NULL AND pp.info_title != '' THEN 1 ELSE 0 END) AS has_title_pdfs,
            SUM(CASE WHEN pp.info_subject IS NOT NULL AND pp.info_subject != '' THEN 1 ELSE 0 END) AS has_subject_pdfs,
            SUM(CASE WHEN pp.info_keywords IS NOT NULL AND pp.info_keywords != '' THEN 1 ELSE 0 END) AS has_keywords_pdfs,
            SUM(CASE WHEN pp.author_encrypted IS NOT NULL AND pp.author_encrypted != '' THEN 1 ELSE 0 END) AS has_author_pdfs,
            SUM(CASE WHEN pp.info_creation_date IS NOT NULL THEN 1 ELSE 0 END) AS has_date_pdfs,
            SUM(CASE WHEN pp.permissions_allow_copy = 1 THEN 1 ELSE 0 END) AS copy_allowed_pdfs,
            SUM(CASE WHEN pp.is_certified = 1 THEN 1 ELSE 0 END) AS certified_pdfs,
            SUM(CASE WHEN pp.is_signed = 1 THEN 1 ELSE 0 END) AS signed_pdfs,
            -- Permission counts (NULL = unencrypted PDF, no restrictions)
            SUM(CASE WHEN pp.permissions_assistive_tech = 0 THEN 1 ELSE 0 END) AS perm_assistive_tech_blocked,
            SUM(CASE WHEN pp.permissions_allow_copy     = 0 THEN 1 ELSE 0 END) AS perm_copy_blocked,
            SUM(CASE WHEN pp.permissions_printing = 'none' THEN 1 ELSE 0 END)  AS perm_printing_blocked,
            SUM(CASE WHEN pp.permissions_form_filling   = 0 THEN 1 ELSE 0 END) AS perm_form_filling_blocked,
            SUM(CASE WHEN pp.permissions_commenting     = 0 THEN 1 ELSE 0 END) AS perm_commenting_blocked,
            SUM(CASE WHEN pp.permissions_editing        = 0 THEN 1 ELSE 0 END) AS perm_editing_blocked,
            SUM(CASE WHEN pp.permissions_assistive_tech IS NOT NULL THEN 1 ELSE 0 END) AS perm_has_data
        FROM customers c
        LEFT JOIN health_checks hc ON hc.customer_id = c.id
        LEFT JOIN pdf_documents d  ON d.health_check_id = hc.id
        LEFT JOIN pdf_properties    pp ON pp.document_id = d.id
        LEFT JOIN pdf_accessibility a  ON a.document_id  = d.id
        WHERE 1=1{$custWhere}
    ");
    $ovStmt->execute($custParams);
    $ov = $ovStmt->fetch();

    foreach ($ov as $k => $v) {
        $ov[$k] = $v !== null ? (int)$v : null;
    }
    $ov['avg_score'] = $ov['avg_score'] ?? 0;

    Response::success($ov);
}

// ── GET /api/stats/trend?days=30 ──────────────────────────────────────────
if ($stat === 'trend') {
    $days = max(7, min(365, (int)($_GET['days'] ?? 30)));

    // Daily buckets — pdf-based series (score, pdfs, pii, security flags)
    $stmt = $db->prepare("
        SELECT
            DATE(d.created_at)                                        AS day,
            ROUND(AVG(d.overall_score))                               AS avg_score,
            COUNT(d.id)                                               AS pdfs,
            SUM(CASE WHEN pp.pii_author    = 1 THEN 1 ELSE 0 END)    AS pii,
            SUM(CASE WHEN pp.is_tagged     = 0 THEN 1 ELSE 0 END)    AS untagged,
            SUM(CASE WHEN pp.is_encrypted  = 1 THEN 1 ELSE 0 END)    AS encrypted,
            SUM(CASE WHEN pp.has_xfa       = 1 THEN 1 ELSE 0 END)    AS xfa
        FROM pdf_documents d
        LEFT JOIN pdf_properties pp ON pp.document_id = d.id
        LEFT JOIN health_checks hc  ON hc.id = d.health_check_id
        LEFT JOIN customers c       ON c.id  = hc.customer_id
        WHERE d.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          AND d.overall_score IS NOT NULL
          {$docWhere}
        GROUP BY DATE(d.created_at)
        ORDER BY DATE(d.created_at) ASC
        LIMIT 365
    ");
    $stmt->execute(array_merge([$days], $docParams));
    $rows = $stmt->fetchAll();

    // New customers per day — keyed by date string
    $cStmt = $db->prepare("
        SELECT DATE(c.created_at) AS day, COUNT(DISTINCT c.id) AS cnt
        FROM customers c
        WHERE c.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          {$custWhere}
        GROUP BY DATE(c.created_at)
    ");
    $cStmt->execute(array_merge([$days], $custParams));
    $custMap = [];
    foreach ($cStmt->fetchAll() as $cr) $custMap[$cr['day']] = (int)$cr['cnt'];

    // New health checks per day — keyed by date string
    $hcStmt = $db->prepare("
        SELECT DATE(hc.created_at) AS day, COUNT(hc.id) AS cnt
        FROM health_checks hc
        LEFT JOIN customers c ON c.id = hc.customer_id
        WHERE hc.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          {$custWhere}
        GROUP BY DATE(hc.created_at)
    ");
    $hcStmt->execute(array_merge([$days], $custParams));
    $hcMap = [];
    foreach ($hcStmt->fetchAll() as $hr) $hcMap[$hr['day']] = (int)$hr['cnt'];

    $labels    = array_map(fn($r) => date('d M', strtotime($r['day'])), $rows);
    $scores    = array_map(fn($r) => (int)$r['avg_score'],              $rows);
    $pdfs      = array_map(fn($r) => (int)$r['pdfs'],                   $rows);
    $pii       = array_map(fn($r) => (int)$r['pii'],                    $rows);
    $untagged  = array_map(fn($r) => (int)$r['untagged'],               $rows);
    $encrypted = array_map(fn($r) => (int)$r['encrypted'],              $rows);
    $xfa       = array_map(fn($r) => (int)$r['xfa'],                    $rows);
    $customers = array_map(fn($r) => $custMap[$r['day']] ?? 0,          $rows);
    $hcs       = array_map(fn($r) => $hcMap[$r['day']]   ?? 0,          $rows);

    Response::success(compact(
        'labels', 'scores', 'pdfs', 'hcs', 'pii',
        'untagged', 'encrypted', 'xfa', 'customers'
    ));
}

// ── GET /api/stats/customer/:id ────────────────────────────────────────────
if (preg_match('#^customer/(\d+)$#', $stat, $m)) {
    $custId = (int)$m[1];
    $stmt   = $db->prepare("
        SELECT hc.id, hc.name, hc.created_at, hc.status,
               ROUND(AVG(d.overall_score)) AS avg_score,
               COUNT(d.id)                 AS doc_count
        FROM health_checks hc
        LEFT JOIN pdf_documents d ON d.health_check_id = hc.id
        WHERE hc.customer_id = ?
        GROUP BY hc.id
        ORDER BY hc.created_at DESC
    ");
    $stmt->execute([$custId]);
    Response::success($stmt->fetchAll());
}

// ── GET /api/stats/by-region ───────────────────────────────────────────────
if ($stat === 'by-region') {
    $regStmt = $db->prepare("
        SELECT c.region,
               COUNT(DISTINCT c.id)            AS customer_count,
               COUNT(DISTINCT hc.id)           AS check_count,
               ROUND(AVG(d.overall_score))     AS avg_score
        FROM customers c
        LEFT JOIN health_checks hc ON hc.customer_id = c.id
        LEFT JOIN pdf_documents d  ON d.health_check_id = hc.id AND d.overall_score IS NOT NULL
        WHERE c.region IS NOT NULL AND c.region != ''{$custWhere}
        GROUP BY c.region
        ORDER BY avg_score DESC
    ");
    $regStmt->execute($custParams);
    $rows = $regStmt->fetchAll();
    foreach ($rows as &$r) $r['avg_score'] = $r['avg_score'] !== null ? (int)$r['avg_score'] : null;
    Response::success($rows);
}

// ── GET /api/stats/by-vertical ─────────────────────────────────────────────
if ($stat === 'by-vertical') {
    $verStmt2 = $db->prepare("
        SELECT c.vertical,
               COUNT(DISTINCT c.id)            AS customer_count,
               COUNT(DISTINCT hc.id)           AS check_count,
               ROUND(AVG(d.overall_score))     AS avg_score
        FROM customers c
        LEFT JOIN health_checks hc ON hc.customer_id = c.id
        LEFT JOIN pdf_documents d  ON d.health_check_id = hc.id AND d.overall_score IS NOT NULL
        WHERE c.vertical IS NOT NULL AND c.vertical != ''{$custWhere}
        GROUP BY c.vertical
        ORDER BY avg_score DESC
    ");
    $verStmt2->execute($custParams);
    $rows = $verStmt2->fetchAll();
    foreach ($rows as &$r) $r['avg_score'] = $r['avg_score'] !== null ? (int)$r['avg_score'] : null;
    Response::success($rows);
}

// ── GET /api/stats/by-segment ─────────────────────────────────────────────
if ($stat === 'by-segment') {
    $segStmt = $db->prepare("
        SELECT c.segment,
               COUNT(DISTINCT c.id)            AS customer_count,
               COUNT(DISTINCT hc.id)           AS check_count,
               ROUND(AVG(d.overall_score))     AS avg_score
        FROM customers c
        LEFT JOIN health_checks hc ON hc.customer_id = c.id
        LEFT JOIN pdf_documents d  ON d.health_check_id = hc.id AND d.overall_score IS NOT NULL
        WHERE c.segment IS NOT NULL AND c.segment != ''{$custWhere}
        GROUP BY c.segment
        ORDER BY FIELD(c.segment, 'Commercial', 'Government', 'Education')
    ");
    $segStmt->execute($custParams);
    $rows = $segStmt->fetchAll();
    foreach ($rows as &$r) $r['avg_score'] = $r['avg_score'] !== null ? (int)$r['avg_score'] : null;
    Response::success($rows);
}

// ── GET /api/stats/by-country ──────────────────────────────────────────────
if ($stat === 'by-country') {
    $ctryStmt = $db->prepare("
        SELECT
            c.country,
            COUNT(DISTINCT c.id)                                                       AS customer_count,
            COUNT(DISTINCT hc.id)                                                      AS check_count,
            COUNT(DISTINCT d.id)                                                       AS doc_count,
            ROUND(AVG(d.overall_score))                                                AS avg_score,
            ROUND(AVG(
                a.passed_checks * 100.0 /
                NULLIF(a.passed_checks + a.failed_checks + a.warning_checks, 0)
            ))                                                                          AS avg_accessibility_rate,
            ROUND(SUM(CASE WHEN pp.is_tagged    = 1 THEN 1 ELSE 0 END) * 100.0 /
                  NULLIF(COUNT(pp.id), 0))                                             AS pct_tagged,
            ROUND(SUM(CASE WHEN pp.is_encrypted = 1 THEN 1 ELSE 0 END) * 100.0 /
                  NULLIF(COUNT(pp.id), 0))                                             AS pct_encrypted
        FROM customers c
        LEFT JOIN health_checks hc  ON hc.customer_id = c.id
        LEFT JOIN pdf_documents d   ON d.health_check_id = hc.id
        LEFT JOIN pdf_accessibility a  ON a.document_id = d.id
        LEFT JOIN pdf_properties    pp ON pp.document_id = d.id
        WHERE c.country IS NOT NULL AND c.country != ''{$custWhere}
        GROUP BY c.country
        ORDER BY check_count DESC
    ");
    $ctryStmt->execute($custParams);
    $rows = $ctryStmt->fetchAll();
    foreach ($rows as &$r) {
        $r['customer_count']        = (int)$r['customer_count'];
        $r['check_count']           = (int)$r['check_count'];
        $r['doc_count']             = (int)$r['doc_count'];
        $r['avg_score']             = $r['avg_score']             !== null ? (int)$r['avg_score']             : null;
        $r['avg_accessibility_rate']= $r['avg_accessibility_rate']!== null ? (int)$r['avg_accessibility_rate']: null;
        $r['pct_tagged']            = $r['pct_tagged']            !== null ? (int)$r['pct_tagged']            : null;
        $r['pct_encrypted']         = $r['pct_encrypted']         !== null ? (int)$r['pct_encrypted']         : null;
    }
    unset($r);
    Response::success($rows);
}

// ── GET /api/stats/security ────────────────────────────────────────────────
if ($stat === 'security') {
    $secTotStmt = $db->prepare("
        SELECT
            COUNT(pp.id)                                                         AS total,
            SUM(pp.is_tagged = 0)                                                AS untagged,
            SUM(pp.is_encrypted = 1)                                             AS encrypted,
            SUM(pp.has_xfa = 1)                                                  AS has_xfa,
            SUM(pp.has_acroform = 1)                                             AS has_acroform,
            SUM(pp.is_linearized = 0)                                            AS not_linearized,
            SUM(pp.is_linearized = 1)                                            AS linearized,
            SUM(pp.pdf_version IS NULL OR pp.pdf_version < '1.4')               AS old_version,
            SUM(pp.pdf_version >= '1.7')                                         AS version_1_7_plus,
            SUM(pp.pdf_version >= '1.5' AND pp.pdf_version < '1.7')             AS version_1_5_1_6,
            SUM(pp.pdf_version >= '1.4' AND pp.pdf_version < '1.5')             AS version_1_4,
            ROUND(AVG(CAST(pp.pdf_version AS DECIMAL(4,2))), 2)                  AS avg_version,
            SUM(pp.pii_author = 1)                                            AS pii_author,
            SUM(pp.has_embedded_files = 1)                                    AS has_embedded_files,
            SUM(pp.permissions_allow_copy = 0 AND pp.permissions_allow_copy IS NOT NULL)       AS copy_restricted,
            SUM(pp.permissions_assistive_tech = 0 AND pp.permissions_assistive_tech IS NOT NULL) AS assistive_tech_blocked,
            SUM(pp.permissions_form_filling = 0 AND pp.permissions_form_filling IS NOT NULL)   AS form_filling_blocked,
            SUM(pp.permissions_commenting = 0 AND pp.permissions_commenting IS NOT NULL)       AS commenting_blocked,
            SUM(pp.permissions_printing = 'none' AND pp.permissions_printing IS NOT NULL)      AS printing_blocked,
            SUM(pp.is_certified = 1)                                          AS is_certified,
            SUM(pp.is_signed = 1)                                             AS is_signed
        FROM pdf_properties pp
        JOIN pdf_documents d    ON d.id  = pp.document_id
        JOIN health_checks hc   ON hc.id = d.health_check_id
        JOIN customers c        ON c.id  = hc.customer_id
        WHERE 1=1{$docWhere}
    ");
    $secTotStmt->execute($docParams);
    $totals = $secTotStmt->fetch();
    foreach ($totals as $k => $v) $totals[$k] = is_numeric($v) ? (float)$v : $v;

    $verStmt = $db->prepare("
        SELECT COALESCE(pp.pdf_version, 'Unknown') AS version, COUNT(*) AS count
        FROM pdf_properties pp
        JOIN pdf_documents d  ON d.id  = pp.document_id
        JOIN health_checks hc ON hc.id = d.health_check_id
        JOIN customers c      ON c.id  = hc.customer_id
        WHERE 1=1{$docWhere}
        GROUP BY pp.pdf_version
        ORDER BY CAST(COALESCE(pp.pdf_version,'0') AS DECIMAL(4,2)) ASC
    ");
    $verStmt->execute($docParams);
    $versions = $verStmt->fetchAll();
    foreach ($versions as &$v) $v['count'] = (int)$v['count'];
    unset($v);

    $total = (int)($totals['total'] ?: 1);
    $issues = [
        ['key'=>'untagged',       'label'=>'Not Tagged (accessibility barrier)', 'count'=>(int)$totals['untagged'],       'severity'=>'high'],
        ['key'=>'encrypted',      'label'=>'Encrypted PDF',                      'count'=>(int)$totals['encrypted'],      'severity'=>'medium'],
        ['key'=>'xfa',            'label'=>'Contains XFA Forms',                 'count'=>(int)$totals['has_xfa'],        'severity'=>'high'],
        ['key'=>'old_version',    'label'=>'PDF Version < 1.4',                  'count'=>(int)$totals['old_version'],    'severity'=>'medium'],
        ['key'=>'not_linearized', 'label'=>'Not Linearized (slow web load)',     'count'=>(int)$totals['not_linearized'], 'severity'=>'low'],
        ['key'=>'pii_author',             'label'=>'Author field contains personal name (PII)', 'count'=>(int)$totals['pii_author'],              'severity'=>'high'],
        ['key'=>'embedded_files',         'label'=>'Has embedded files',                        'count'=>(int)$totals['has_embedded_files'],       'severity'=>'medium'],
        ['key'=>'copy_restricted',        'label'=>'Content copy restricted',                   'count'=>(int)$totals['copy_restricted'],          'severity'=>'low'],
        ['key'=>'assistive_tech_blocked', 'label'=>'Screen reader access blocked',              'count'=>(int)$totals['assistive_tech_blocked'],   'severity'=>'high'],
        ['key'=>'form_filling_blocked',   'label'=>'Form filling disabled',                     'count'=>(int)$totals['form_filling_blocked'],     'severity'=>'medium'],
        ['key'=>'commenting_blocked',     'label'=>'Commenting disabled',                       'count'=>(int)$totals['commenting_blocked'],       'severity'=>'low'],
        ['key'=>'printing_blocked',       'label'=>'Printing disabled',                         'count'=>(int)$totals['printing_blocked'],         'severity'=>'low'],
    ];
    foreach ($issues as &$iss) $iss['pct'] = $total ? round($iss['count'] / $total * 100) : 0;
    unset($iss);

    Response::success(['totals' => $totals, 'versions' => $versions, 'issues' => $issues]);
}

// ── GET /api/stats/security-drilldown?filter=X ────────────────────────────
if ($stat === 'security-drilldown') {
    $filter = $_GET['filter'] ?? '';
    $allowed = [
        'untagged'       => 'pp.is_tagged = 0',
        'encrypted'      => 'pp.is_encrypted = 1',
        'xfa'            => 'pp.has_xfa = 1',
        'old_version'    => "(pp.pdf_version IS NULL OR pp.pdf_version < '1.4')",
        'not_linearized' => 'pp.is_linearized = 0',
        'pii_author'             => 'pp.pii_author = 1',
        'embedded_files'         => 'pp.has_embedded_files = 1',
        'copy_restricted'        => 'pp.permissions_allow_copy = 0',
        'assistive_tech_blocked' => 'pp.permissions_assistive_tech = 0',
        'form_filling_blocked'   => 'pp.permissions_form_filling = 0',
        'commenting_blocked'     => 'pp.permissions_commenting = 0',
        'printing_blocked'       => "pp.permissions_printing = 'none'",
    ];
    if (!isset($allowed[$filter])) Response::error('Unknown filter', 400);

    $enc  = new Encryption(ENCRYPTION_KEY);
    $stmt = $db->prepare("
        SELECT d.id AS doc_id, d.overall_score, d.filename_encrypted, d.file_size,
               pp.pdf_version, pp.is_tagged, pp.is_encrypted, pp.has_xfa,
               pp.is_linearized, pp.has_acroform, pp.content_type,
               hc.id AS hc_id, hc.name AS hc_name,
               c.id AS customer_id, c.name_encrypted AS cust_enc, c.region
        FROM pdf_properties pp
        JOIN pdf_documents d  ON d.id = pp.document_id
        JOIN health_checks hc ON hc.id = d.health_check_id
        JOIN customers c      ON c.id = hc.customer_id
        WHERE {$allowed[$filter]}{$docWhere}
        ORDER BY d.overall_score ASC, hc.created_at DESC
        LIMIT 200
    ");
    $stmt->execute($docParams);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) {
        try { $row['filename'] = $enc->decrypt($row['filename_encrypted']); }
        catch (\Throwable $e) { $row['filename'] = 'document.pdf'; }
        try { $row['customer_name'] = $enc->decrypt($row['cust_enc']); }
        catch (\Throwable $e) { $row['customer_name'] = 'Customer #' . $row['customer_id']; }
        unset($row['filename_encrypted'], $row['cust_enc']);
        $row['is_tagged']     = (bool)$row['is_tagged'];
        $row['is_encrypted']  = (bool)$row['is_encrypted'];
        $row['has_xfa']       = (bool)$row['has_xfa'];
        $row['is_linearized'] = (bool)$row['is_linearized'];
        $row['has_acroform']  = (bool)$row['has_acroform'];
        $row['overall_score'] = $row['overall_score'] !== null ? (int)$row['overall_score'] : null;
    }
    unset($row);
    Response::success($rows);
}

// ── GET /api/stats/accessibility ──────────────────────────────────────────
if ($stat === 'accessibility') {
    $accTotStmt = $db->prepare("
        SELECT
            COUNT(a.id)                                                            AS total_docs,
            SUM(a.passed_checks)                                                   AS total_passed,
            SUM(a.failed_checks)                                                   AS total_failed,
            SUM(a.warning_checks)                                                  AS total_warnings,
            ROUND(AVG(a.passed_checks * 100.0 /
                NULLIF(a.passed_checks + a.failed_checks + a.warning_checks, 0))) AS avg_pass_rate,
            SUM(CASE WHEN a.failed_checks = 0 THEN 1 ELSE 0 END)                  AS fully_passing,
            SUM(CASE WHEN a.failed_checks > 0 THEN 1 ELSE 0 END)                  AS has_failures
        FROM pdf_accessibility a
        JOIN pdf_documents d  ON d.id  = a.document_id
        JOIN health_checks hc ON hc.id = d.health_check_id
        JOIN customers c      ON c.id  = hc.customer_id
        WHERE 1=1{$docWhere}
    ");
    $accTotStmt->execute($docParams);
    $totals = $accTotStmt->fetch();
    foreach ($totals as $k => $v) $totals[$k] = $v !== null ? (int)$v : null;

    // Per-named-check aggregation from raw_results JSON.
    // Guard: raw_results column may be absent on databases that pre-date the
    // migration — catch the PDOException and return an empty array rather than
    // a 500 so the totals / worst-docs sections still render.
    $checkAgg   = [];
    $debugInfo  = ['rows_with_raw' => 0, 'rows_without_raw' => 0, 'sample_keys' => [], 'error' => null];
    try {
        // Count rows with and without raw_results so we can tell the UI what happened
        $countRow = $db->query("
            SELECT
                SUM(raw_results IS NOT NULL)  AS with_raw,
                SUM(raw_results IS NULL)      AS without_raw
            FROM pdf_accessibility
        ")->fetch();
        $debugInfo['rows_with_raw']    = (int)($countRow['with_raw']    ?? 0);
        $debugInfo['rows_without_raw'] = (int)($countRow['without_raw'] ?? 0);

        $rawStmt = $db->prepare("
            SELECT a.raw_results FROM pdf_accessibility a
            JOIN pdf_documents d  ON d.id  = a.document_id
            JOIN health_checks hc ON hc.id = d.health_check_id
            JOIN customers c      ON c.id  = hc.customer_id
            WHERE a.raw_results IS NOT NULL{$docWhere}
            LIMIT 2000
        ");
        $rawStmt->execute($docParams);
        $rawRows = $rawStmt->fetchAll(PDO::FETCH_COLUMN);

        foreach ($rawRows as $raw) {
            // MySQL JSON columns return the value as a plain JSON string via PDO.
            $data = is_array($raw) ? $raw : json_decode((string)$raw, true);
            if (!$data || !is_array($data)) continue;

            // Build a flat list of {checkName, status} entries from whichever
            // format this row uses.  Two formats exist in the wild:
            //
            // Format A — full Adobe report stored directly (most existing rows):
            //   { "DetailedReport": [ { "Category": "...", "Elements": [ { "CheckName": "...", "Status": "..." } ] } ], "Summary": {...} }
            //
            // Format B — processed checks array (newer rows):
            //   { "passed_checks": N, "failed_checks": M, "warning_checks": K, "checks": [ { "checkName": "...", "status": "..." } ] }
            $flatChecks = [];
            $categories = $data['DetailedReport'] ?? $data['detailedReport'] ?? [];
            if (!empty($categories)) {
                // Format A
                foreach ($categories as $cat) {
                    $catName = $cat['Category'] ?? $cat['category'] ?? '';
                    foreach ($cat['Elements'] ?? $cat['elements'] ?? [] as $el) {
                        $flatChecks[] = [
                            'name'   => $el['CheckName'] ?? $el['checkName'] ?? $el['name'] ?? '',
                            'status' => $el['Status']    ?? $el['status']    ?? '',
                            'cat'    => $catName,
                        ];
                    }
                }
            } else {
                // Format B
                foreach ($data['checks'] ?? $data['checkResults'] ?? $data['results'] ?? [] as $ch) {
                    if (!is_array($ch)) continue;
                    $flatChecks[] = [
                        'name'   => $ch['checkName'] ?? $ch['name']   ?? $ch['rule']   ?? '',
                        'status' => $ch['status']    ?? $ch['result'] ?? '',
                        'cat'    => $ch['category']  ?? '',
                    ];
                }
            }

            // Capture debug sample from first row that has any checks
            if (empty($debugInfo['sample_keys']) && !empty($flatChecks)) {
                $debugInfo['sample_keys']        = array_keys($data);
                $debugInfo['sample_check_count'] = count($flatChecks);
                $debugInfo['sample_first_check'] = $flatChecks[0];
            }

            foreach ($flatChecks as $check) {
                $name   = trim($check['name']);
                $status = strtolower((string)$check['status']);
                if ($name === '') continue;
                if (!isset($checkAgg[$name])) {
                    $checkAgg[$name] = ['name'=>$name,'passed'=>0,'failed'=>0,'warnings'=>0,'needs_manual'=>0,'total'=>0];
                }
                $checkAgg[$name]['total']++;
                if (strpos($status, 'pass') !== false)        $checkAgg[$name]['passed']++;
                elseif (strpos($status, 'fail') !== false)    $checkAgg[$name]['failed']++;
                elseif (strpos($status, 'manual') !== false)  $checkAgg[$name]['needs_manual']++;
                else                                          $checkAgg[$name]['warnings']++;
            }
        }
    } catch (\Throwable $e) {
        // Column missing or other DB error — log and continue with empty breakdown.
        error_log('Accessibility checks aggregation failed: ' . $e->getMessage());
        $debugInfo['error'] = $e->getMessage();
    }

    // Compute pass rate; sort by most failures first
    foreach ($checkAgg as &$ch) {
        $ch['pass_rate'] = $ch['total'] > 0 ? (int)round($ch['passed'] / $ch['total'] * 100) : 0;
    }
    unset($ch);
    usort($checkAgg, fn($a, $b) => $b['failed'] <=> $a['failed'] ?: strcmp($a['name'], $b['name']));

    // Flag whether any rows exist at all but lack raw_results (legacy data).
    // The UI uses this to show a more helpful message instead of "run health checks".
    $hasLegacyOnly = empty($checkAgg) && ((int)($totals['total_docs'] ?? 0)) > 0;

    // Worst performing docs
    $enc  = new Encryption(ENCRYPTION_KEY);
    $stmt = $db->prepare("
        SELECT d.id, d.filename_encrypted, d.overall_score,
               a.passed_checks, a.failed_checks, a.warning_checks,
               hc.id AS hc_id, hc.name AS hc_name,
               c.id AS customer_id, c.name_encrypted AS cust_enc
        FROM pdf_accessibility a
        JOIN pdf_documents d  ON d.id = a.document_id
        JOIN health_checks hc ON hc.id = d.health_check_id
        JOIN customers c      ON c.id = hc.customer_id
        WHERE a.failed_checks > 0{$docWhere}
        ORDER BY a.failed_checks DESC, d.overall_score ASC
        LIMIT 25
    ");
    $stmt->execute($docParams);
    $worstDocs = $stmt->fetchAll();
    foreach ($worstDocs as &$row) {
        try { $row['filename'] = $enc->decrypt($row['filename_encrypted']); }
        catch (\Throwable $e) { $row['filename'] = 'document.pdf'; }
        try { $row['customer_name'] = $enc->decrypt($row['cust_enc']); }
        catch (\Throwable $e) { $row['customer_name'] = 'Customer #' . $row['customer_id']; }
        unset($row['filename_encrypted'], $row['cust_enc']);
        $row['overall_score']  = $row['overall_score']  !== null ? (int)$row['overall_score']  : null;
        $row['passed_checks']  = (int)$row['passed_checks'];
        $row['failed_checks']  = (int)$row['failed_checks'];
        $row['warning_checks'] = (int)$row['warning_checks'];
    }
    unset($row);

    Response::success([
        'totals'       => $totals,
        'checks'       => array_values($checkAgg),
        'worst_docs'   => $worstDocs,
        'legacy_only'  => $hasLegacyOnly,
        '_debug'       => $debugInfo,
    ]);
}

// ── GET /api/stats/accessibility-drilldown?check=X ────────────────────────
if ($stat === 'accessibility-drilldown') {
    $checkName = trim($_GET['check'] ?? '');
    if (!$checkName) Response::error('check parameter required', 400);

    // PHP-side: find doc IDs where the named check is failed or warning
    $rawStmt = $db->prepare("
        SELECT a.document_id, a.raw_results
        FROM pdf_accessibility a
        JOIN pdf_documents d  ON d.id  = a.document_id
        JOIN health_checks hc ON hc.id = d.health_check_id
        JOIN customers c      ON c.id  = hc.customer_id
        WHERE a.raw_results IS NOT NULL{$docWhere}
        LIMIT 2000
    ");
    $rawStmt->execute($docParams);
    $rawRows = $rawStmt->fetchAll();

    $matchIds = [];
    $statuses  = [];   // doc_id → status string
    foreach ($rawRows as $row) {
        $data = json_decode($row['raw_results'], true);
        if (!$data) continue;

        // Build flat check list — same two-format logic as the aggregation above
        $flatChecks = [];
        $cats = $data['DetailedReport'] ?? $data['detailedReport'] ?? [];
        if (!empty($cats)) {
            foreach ($cats as $cat) {
                foreach ($cat['Elements'] ?? $cat['elements'] ?? [] as $el) {
                    $flatChecks[] = [
                        'name'   => $el['CheckName'] ?? $el['checkName'] ?? $el['name'] ?? '',
                        'status' => $el['Status']    ?? $el['status']    ?? '',
                    ];
                }
            }
        } else {
            foreach ($data['checks'] ?? $data['checkResults'] ?? $data['results'] ?? [] as $ch) {
                if (!is_array($ch)) continue;
                $flatChecks[] = [
                    'name'   => $ch['checkName'] ?? $ch['name']   ?? $ch['rule']   ?? '',
                    'status' => $ch['status']    ?? $ch['result'] ?? '',
                ];
            }
        }

        foreach ($flatChecks as $check) {
            $name = trim($check['name']);
            if (strcasecmp($name, $checkName) === 0) {
                $status = strtolower((string)$check['status']);
                $statuses[$row['document_id']] = $status;
                if (strpos($status, 'fail') !== false || strpos($status, 'warn') !== false || strpos($status, 'manual') !== false) {
                    $matchIds[] = (int)$row['document_id'];
                }
                break;
            }
        }
    }

    if (empty($matchIds)) {
        Response::success(['check' => $checkName, 'documents' => []]);
    }

    $ph   = implode(',', array_fill(0, count($matchIds), '?'));
    $enc  = new Encryption(ENCRYPTION_KEY);
    $stmt = $db->prepare("
        SELECT d.id, d.filename_encrypted, d.overall_score, d.file_size,
               a.passed_checks, a.failed_checks, a.warning_checks,
               pp.pdf_version, pp.is_tagged, pp.content_type,
               hc.id AS hc_id, hc.name AS hc_name,
               c.id AS customer_id, c.name_encrypted AS cust_enc
        FROM pdf_documents d
        LEFT JOIN pdf_accessibility a ON a.document_id = d.id
        LEFT JOIN pdf_properties pp   ON pp.document_id = d.id
        JOIN health_checks hc         ON hc.id = d.health_check_id
        JOIN customers c              ON c.id = hc.customer_id
        WHERE d.id IN ({$ph})
        ORDER BY d.overall_score ASC
    ");
    $stmt->execute($matchIds);
    $docs = $stmt->fetchAll();
    foreach ($docs as &$doc) {
        try { $doc['filename'] = $enc->decrypt($doc['filename_encrypted']); }
        catch (\Throwable $e) { $doc['filename'] = 'document.pdf'; }
        try { $doc['customer_name'] = $enc->decrypt($doc['cust_enc']); }
        catch (\Throwable $e) { $doc['customer_name'] = 'Customer #' . $doc['customer_id']; }
        unset($doc['filename_encrypted'], $doc['cust_enc']);
        $doc['check_status']   = $statuses[$doc['id']] ?? 'unknown';
        $doc['overall_score']  = $doc['overall_score'] !== null ? (int)$doc['overall_score'] : null;
        $doc['passed_checks']  = (int)($doc['passed_checks']  ?? 0);
        $doc['failed_checks']  = (int)($doc['failed_checks']  ?? 0);
        $doc['warning_checks'] = (int)($doc['warning_checks'] ?? 0);
        $doc['is_tagged']      = (bool)($doc['is_tagged'] ?? false);
    }
    unset($doc);

    Response::success(['check' => $checkName, 'documents' => $docs]);
}

// ── GET /api/stats/creator-apps ────────────────────────────────────────────
if ($stat === 'creator-apps') {
    $caStmt = $db->prepare("
        SELECT pp.creator_app, COUNT(*) AS count
        FROM pdf_properties pp
        JOIN pdf_documents d  ON d.id  = pp.document_id
        JOIN health_checks hc ON hc.id = d.health_check_id
        JOIN customers c      ON c.id  = hc.customer_id
        WHERE pp.creator_app IS NOT NULL AND pp.creator_app != ''{$docWhere}
        GROUP BY pp.creator_app
        ORDER BY count DESC
        LIMIT 6
    ");
    $caStmt->execute($docParams);
    $rows = $caStmt->fetchAll();
    foreach ($rows as &$r) $r['count'] = (int)$r['count'];
    unset($r);
    Response::success($rows);
}

// ── GET /api/stats/pii-docs ────────────────────────────────────────────────
if ($stat === 'pii-docs') {
    $enc = new Encryption(ENCRYPTION_KEY);

    $piiCountStmt = $db->prepare("
        SELECT COUNT(pp.id) FROM pdf_properties pp
        JOIN pdf_documents d  ON d.id  = pp.document_id
        JOIN health_checks hc ON hc.id = d.health_check_id
        JOIN customers c      ON c.id  = hc.customer_id
        WHERE pp.pii_author = 1{$docWhere}
    ");
    $piiCountStmt->execute($docParams);
    $piiCount = (int)$piiCountStmt->fetchColumn();

    $piiTotalStmt = $db->prepare("
        SELECT COUNT(pp.id) FROM pdf_properties pp
        JOIN pdf_documents d  ON d.id  = pp.document_id
        JOIN health_checks hc ON hc.id = d.health_check_id
        JOIN customers c      ON c.id  = hc.customer_id
        WHERE 1=1{$docWhere}
    ");
    $piiTotalStmt->execute($docParams);
    $total = (int)$piiTotalStmt->fetchColumn();

    $hasAuthorStmt = $db->prepare("
        SELECT COUNT(pp.id) FROM pdf_properties pp
        JOIN pdf_documents d  ON d.id  = pp.document_id
        JOIN health_checks hc ON hc.id = d.health_check_id
        JOIN customers c      ON c.id  = hc.customer_id
        WHERE pp.author_encrypted IS NOT NULL AND pp.author_encrypted != ''{$docWhere}
    ");
    $hasAuthorStmt->execute($docParams);
    $hasAuthor = (int)$hasAuthorStmt->fetchColumn();
    $noAuthor  = $total - $hasAuthor;

    // Per-customer breakdown — LEFT JOIN so orphaned rows don't vanish
    $custStmt = $db->prepare("
        SELECT c.id AS customer_id, c.name_encrypted,
               COUNT(pp.id)           AS total_docs,
               SUM(pp.pii_author = 1) AS pii_count,
               SUM(pp.author_encrypted IS NOT NULL AND pp.author_encrypted != '') AS has_author_count
        FROM pdf_properties pp
        LEFT JOIN pdf_documents d  ON d.id  = pp.document_id
        LEFT JOIN health_checks hc ON hc.id = d.health_check_id
        LEFT JOIN customers     c  ON c.id  = hc.customer_id
        WHERE 1=1{$docWhere}
        GROUP BY c.id
        ORDER BY pii_count DESC, total_docs DESC
        LIMIT 30
    ");
    $custStmt->execute($docParams);
    $byCustomer = $custStmt->fetchAll();
    foreach ($byCustomer as &$r) {
        try { $r['customer_name'] = $enc->decrypt($r['name_encrypted']); }
        catch (\Throwable $e) { $r['customer_name'] = 'Customer #' . $r['customer_id']; }
        unset($r['name_encrypted']);
        $r['total_docs']       = (int)$r['total_docs'];
        $r['pii_count']        = (int)$r['pii_count'];
        $r['has_author_count'] = (int)$r['has_author_count'];
    }
    unset($r);

    // At-risk documents list (pii_author = 1), decrypted for display.
    // Use LEFT JOINs so flagged rows are always returned even if the parent
    // health_check or customer was deleted after the document was processed.
    // Also LEFT JOIN pii_feedback so the UI knows the current review state.
    $atRiskStmt = $db->prepare("
        SELECT pp.document_id AS doc_id,
               pp.author_encrypted,
               d.filename_encrypted, d.overall_score,
               hc.id AS hc_id, hc.name AS hc_name,
               c.id AS customer_id, c.name_encrypted AS cust_enc,
               pf.is_person_name AS feedback,
               (pf.id IS NOT NULL)  AS has_feedback
        FROM pdf_properties pp
        LEFT JOIN pdf_documents d  ON d.id  = pp.document_id
        LEFT JOIN health_checks hc ON hc.id = d.health_check_id
        LEFT JOIN customers     c  ON c.id  = hc.customer_id
        LEFT JOIN pii_feedback  pf ON pf.document_id = pp.document_id
        WHERE pp.pii_author = 1{$docWhere}
        ORDER BY hc.created_at DESC, pp.document_id DESC
        LIMIT 100
    ");
    $atRiskStmt->execute($docParams);
    $atRisk = $atRiskStmt->fetchAll();
    foreach ($atRisk as &$row) {
        try { $row['filename'] = $enc->decrypt($row['filename_encrypted']); }
        catch (\Throwable $e) { $row['filename'] = 'document.pdf'; }
        try { $row['author'] = $enc->decrypt($row['author_encrypted']); }
        catch (\Throwable $e) { $row['author'] = '[encrypted]'; }
        $custId = (int)($row['customer_id'] ?? 0);
        try { $row['customer_name'] = $custId ? $enc->decrypt($row['cust_enc']) : '—'; }
        catch (\Throwable $e) { $row['customer_name'] = $custId ? 'Customer #' . $custId : '—'; }
        unset($row['filename_encrypted'], $row['author_encrypted'], $row['cust_enc']);
        $row['overall_score'] = $row['overall_score'] !== null ? (int)$row['overall_score'] : null;
        $row['hc_id']         = $row['hc_id'] !== null ? (int)$row['hc_id'] : null;
        $row['hc_name']       = $row['hc_name'] ?? '—';
        $row['customer_id']   = $custId ?: null;
        // Feedback state: null = no feedback yet, true = confirmed person, false = rejected
        $row['feedback']      = $row['has_feedback'] ? (bool)$row['feedback'] : null;
        unset($row['has_feedback']);
        // Confidence metadata — computed at display time from the decrypted author string
        $conf                  = personNameConfidence($db, $row['author']);
        $row['pii_confidence'] = $conf['confidence'];
        $row['pii_source']     = $conf['source'];
    }
    unset($row);

    Response::success([
        'pii_count'   => $piiCount,
        'total'       => $total,
        'has_author'  => $hasAuthor,
        'no_author'   => $noAuthor,
        'by_customer' => $byCustomer,
        'at_risk'     => $atRisk,
    ]);
}

// ── GET /api/stats/compare?customer_id=X&against=overall|region:R|vertical:V|customer:Y ──
if ($stat === 'compare') {
    $custId  = (int)($_GET['customer_id'] ?? 0);
    $against = trim($_GET['against'] ?? 'overall');
    if (!$custId) Response::error('customer_id required', 400);

    $enc = new Encryption(ENCRYPTION_KEY);

    // Helper closure: get metrics for a given WHERE clause
    $getMetrics = function(string $where, array $params = []) use ($db): array {
        $stmt = $db->prepare("
            SELECT
                COUNT(DISTINCT d.id)                                                   AS total_pdfs,
                ROUND(AVG(d.overall_score))                                            AS avg_score,
                SUM(pp.is_tagged = 1)                                                  AS tagged_count,
                SUM(pp.is_encrypted = 1)                                               AS encrypted_count,
                SUM(pp.has_xfa = 1)                                                    AS xfa_count,
                SUM(pp.is_linearized = 1)                                              AS linearized_count,
                SUM(pp.pdf_version >= '1.7')                                           AS v17_count,
                ROUND(AVG(
                    ac.passed_checks * 100.0 /
                    NULLIF(ac.passed_checks + ac.failed_checks + ac.warning_checks, 0)
                ))                                                                      AS avg_access_rate,
                SUM(CASE WHEN pp.pii_author = 1 THEN 1 ELSE 0 END)                    AS pii_count
            FROM pdf_documents d
            JOIN health_checks hc  ON hc.id = d.health_check_id
            JOIN customers c       ON c.id = hc.customer_id
            LEFT JOIN pdf_properties    pp ON pp.document_id = d.id
            LEFT JOIN pdf_accessibility ac ON ac.document_id = d.id
            WHERE {$where}
        ");
        $stmt->execute($params);
        $row = $stmt->fetch();

        $total = (int)($row['total_pdfs'] ?: 1);
        return [
            'total_pdfs'       => (int)($row['total_pdfs'] ?? 0),
            'avg_score'        => $row['avg_score'] !== null ? (int)$row['avg_score'] : null,
            'tagged_pct'       => $total ? (int)round($row['tagged_count']    / $total * 100) : 0,
            'encrypted_pct'    => $total ? (int)round($row['encrypted_count'] / $total * 100) : 0,
            'xfa_pct'          => $total ? (int)round($row['xfa_count']       / $total * 100) : 0,
            'linearized_pct'   => $total ? (int)round($row['linearized_count']/ $total * 100) : 0,
            'version17_pct'    => $total ? (int)round($row['v17_count']        / $total * 100) : 0,
            'avg_access_rate'  => $row['avg_access_rate'] !== null ? (int)$row['avg_access_rate'] : null,
            'pii_count'        => (int)($row['pii_count'] ?? 0),
        ];
    };

    // Subject: chosen customer
    $custRow = $db->prepare("SELECT id, name_encrypted FROM customers WHERE id = ?");
    $custRow->execute([$custId]);
    $custData = $custRow->fetch();
    if (!$custData) Response::notFound('Customer not found');
    try { $custName = $enc->decrypt($custData['name_encrypted']); }
    catch (\Throwable $e) { $custName = 'Customer #' . $custId; }

    $subjectMetrics = $getMetrics('c.id = ?', [$custId]);

    // Baseline: parse the "against" parameter
    $baselineLabel   = 'All customers';
    $baselineMetrics = [];

    if ($against === 'overall') {
        $baselineLabel   = 'All customers';
        $baselineMetrics = $getMetrics('1=1');
    } elseif (substr($against, 0, 7) === 'region:') {
        $region = substr($against, 7);
        $baselineLabel   = 'Region: ' . $region;
        $baselineMetrics = $getMetrics('c.region = ?', [$region]);
    } elseif (substr($against, 0, 9) === 'vertical:') {
        $vertical = substr($against, 9);
        $baselineLabel   = 'Vertical: ' . $vertical;
        $baselineMetrics = $getMetrics('c.vertical = ?', [$vertical]);
    } elseif (substr($against, 0, 9) === 'customer:') {
        $otherId = (int)substr($against, 9);
        $baselineLabel   = 'Comparison customer';
        $baselineMetrics = $getMetrics('c.id = ?', [$otherId]);
    } elseif (substr($against, 0, 8) === 'segment:') {
        $seg = substr($against, 8);
        $baselineLabel   = 'Segment: ' . $seg;
        $baselineMetrics = $getMetrics('c.segment = ?', [$seg]);
    } else {
        $baselineLabel   = 'All customers';
        $baselineMetrics = $getMetrics('1=1');
    }

    // Return list of regions and verticals for the UI dropdowns
    $regions   = $db->query("SELECT DISTINCT region   FROM customers WHERE region   IS NOT NULL AND region   != '' ORDER BY region"  )->fetchAll(PDO::FETCH_COLUMN);
    $verticals = $db->query("SELECT DISTINCT vertical  FROM customers WHERE vertical IS NOT NULL AND vertical != '' ORDER BY vertical")->fetchAll(PDO::FETCH_COLUMN);
    $segments  = ['Commercial', 'Government', 'Education'];

    Response::success([
        'subject'  => ['label' => $custName,      'metrics' => $subjectMetrics],
        'baseline' => ['label' => $baselineLabel,  'metrics' => $baselineMetrics],
        'regions'  => $regions,
        'verticals'=> $verticals,
        'segments' => $segments,
    ]);
}

// ── GET /api/stats/timeline?granularity=month|quarter|year&from=YYYY-MM-DD&to=YYYY-MM-DD ──
// Returns per-period aggregates of key PDF quality metrics, bucketed by the
// PDF creation date stored in pdf_properties.info_creation_date.
if ($stat === 'timeline') {
    $granularity = in_array($_GET['granularity'] ?? 'month', ['month', 'quarter', 'year'])
                   ? ($_GET['granularity'] ?? 'month')
                   : 'month';

    // Date range — defaults to last 2 years
    $from = isset($_GET['from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['from'])
            ? $_GET['from'] : date('Y-m-d', strtotime('-2 years'));
    $to   = isset($_GET['to']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['to'])
            ? $_GET['to']   : date('Y-m-d');

    // Period expression for GROUP BY / label
    if ($granularity === 'year') {
        $periodExpr = "DATE_FORMAT(pp.info_creation_date, '%Y')";
    } elseif ($granularity === 'quarter') {
        // SQLite-compatible form; on MySQL this renders as "2024-Q2"
        $periodExpr = "CONCAT(YEAR(pp.info_creation_date), '-Q', QUARTER(pp.info_creation_date))";
    } else {
        $periodExpr  = "DATE_FORMAT(pp.info_creation_date, '%Y-%m')";
    }

    $tlParams = array_merge([$from, $to], $docParams);
    $tlStmt   = $db->prepare("
        SELECT
            {$periodExpr}                                                         AS period,
            COUNT(DISTINCT d.id)                                                  AS pdf_count,
            ROUND(AVG(d.overall_score))                                           AS avg_score,
            ROUND(AVG(
                a.passed_checks * 100.0 /
                NULLIF(a.passed_checks + a.failed_checks + a.warning_checks, 0)
            ))                                                                    AS avg_access_rate,
            ROUND(SUM(CASE WHEN pp.is_tagged     = 1 THEN 1 ELSE 0 END)
                  * 100.0 / NULLIF(COUNT(pp.id), 0))                             AS tagged_pct,
            ROUND(SUM(CASE WHEN pp.is_encrypted  = 1 THEN 1 ELSE 0 END)
                  * 100.0 / NULLIF(COUNT(pp.id), 0))                             AS encrypted_pct,
            ROUND(SUM(CASE WHEN pp.is_linearized = 1 THEN 1 ELSE 0 END)
                  * 100.0 / NULLIF(COUNT(pp.id), 0))                             AS linearized_pct,
            ROUND(SUM(CASE WHEN pp.pii_author    = 1 THEN 1 ELSE 0 END)
                  * 100.0 / NULLIF(COUNT(pp.id), 0))                             AS pii_pct
        FROM pdf_properties pp
        JOIN pdf_documents d         ON d.id  = pp.document_id
        JOIN health_checks hc        ON hc.id = d.health_check_id
        JOIN customers c             ON c.id  = hc.customer_id
        LEFT JOIN pdf_accessibility a ON a.document_id = d.id
        WHERE pp.info_creation_date IS NOT NULL
          AND DATE(pp.info_creation_date) BETWEEN ? AND ?
          {$docWhere}
        GROUP BY period
        ORDER BY period ASC
    ");
    $tlStmt->execute($tlParams);
    $rows = $tlStmt->fetchAll();

    foreach ($rows as &$r) {
        $r['pdf_count']      = (int)$r['pdf_count'];
        $r['avg_score']      = $r['avg_score']      !== null ? (int)$r['avg_score']      : null;
        $r['avg_access_rate']= $r['avg_access_rate']!== null ? (int)$r['avg_access_rate']: null;
        $r['tagged_pct']     = $r['tagged_pct']     !== null ? (int)$r['tagged_pct']     : null;
        $r['encrypted_pct']  = $r['encrypted_pct']  !== null ? (int)$r['encrypted_pct']  : null;
        $r['linearized_pct'] = $r['linearized_pct'] !== null ? (int)$r['linearized_pct'] : null;
        $r['pii_pct']        = $r['pii_pct']        !== null ? (int)$r['pii_pct']        : null;
    }
    unset($r);

    Response::success([
        'granularity' => $granularity,
        'from'        => $from,
        'to'          => $to,
        'rows'        => $rows,
    ]);
}

// ── POST /api/stats/pii-feedback ──────────────────────────────────────────
// Body: { document_id: 123, author: "Jane Smith", is_person_name: true|false }
//
// Records a user correction for one document, immediately updates pii_author
// on that document's pdf_properties row, and stores the plain-text author
// string so the ML scorer can learn from it on future document uploads.
if ($stat === 'pii-feedback') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') Response::error('POST required', 405);

    $body         = json_decode(file_get_contents('php://input'), true) ?? [];
    $docId        = (int)($body['document_id'] ?? 0);
    $authorValue  = trim($body['author'] ?? '');
    $isPerson     = isset($body['is_person_name']) ? (int)(bool)$body['is_person_name'] : null;

    if (!$docId)           Response::error('document_id required', 400);
    if ($authorValue === '') Response::error('author required', 400);
    if ($isPerson === null) Response::error('is_person_name required', 400);

    // 1. Store / update feedback (one row per document)
    $db->prepare("
        INSERT INTO pii_feedback (document_id, author_value, is_person_name)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
            author_value   = VALUES(author_value),
            is_person_name = VALUES(is_person_name),
            updated_at     = NOW()
    ")->execute([$docId, $authorValue, $isPerson]);

    // 2. Immediately update pii_author on the document's properties row so the
    //    at-risk count and table reflect the correction without re-processing.
    $db->prepare("
        UPDATE pdf_properties SET pii_author = ? WHERE document_id = ?
    ")->execute([$isPerson, $docId]);

    Response::success(['recorded' => true, 'document_id' => $docId, 'is_person_name' => (bool)$isPerson]);
}

Response::notFound("Unknown stat: {$stat}");
