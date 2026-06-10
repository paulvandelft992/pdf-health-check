<?php
/** GET /api/exec-report
 *
 * Returns aggregate portfolio data for the executive printable report.
 *
 * Query parameters (all optional):
 *   customer_id=N   — scope to one customer
 *   hc_id=N         — scope to one health check (takes precedence)
 */

if ($method !== 'GET') Response::error('Method not allowed', 405);

$enc = new Encryption(ENCRYPTION_KEY);
$db  = getDB();

$customerId = isset($_GET['customer_id']) ? (int)$_GET['customer_id'] : null;
$hcId       = isset($_GET['hc_id'])       ? (int)$_GET['hc_id']       : null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function _decField(Encryption $enc, ?string $v, string $fb = ''): string {
    if ($v === null || $v === '') return $fb;
    try { return $enc->decrypt($v); } catch (\Throwable $e) { return $fb; }
}

// ── Build WHERE clause for document join ──────────────────────────────────────
$whereDoc  = '1=1';
$paramsDoc = [];

if ($hcId) {
    $whereDoc    = 'hc.id = ?';
    $paramsDoc[] = $hcId;
} elseif ($customerId) {
    $whereDoc    = 'hc.customer_id = ?';
    $paramsDoc[] = $customerId;
}

// ── Scope metadata ────────────────────────────────────────────────────────────
$scope = ['type' => 'all', 'customer' => null, 'health_check' => null];

if ($hcId) {
    $hcMeta = $db->prepare("
        SELECT hc.id, hc.name, hc.created_at, hc.status,
               c.name_encrypted AS customer_name_encrypted, c.id AS customer_id
        FROM health_checks hc
        LEFT JOIN customers c ON c.id = hc.customer_id
        WHERE hc.id = ?
    ");
    $hcMeta->execute([$hcId]);
    $row = $hcMeta->fetch();
    if ($row) {
        $scope['type']         = 'hc';
        $scope['health_check'] = [
            'id'            => (int)$row['id'],
            'name'          => $row['name'],
            'created_at'    => $row['created_at'],
            'status'        => $row['status'],
            'customer_name' => _decField($enc, $row['customer_name_encrypted'], 'Customer #' . $row['customer_id']),
        ];
    }
} elseif ($customerId) {
    $custMeta = $db->prepare("SELECT id, name_encrypted, region, country, vertical FROM customers WHERE id = ?");
    $custMeta->execute([$customerId]);
    $row = $custMeta->fetch();
    if ($row) {
        $scope['type']     = 'customer';
        $scope['customer'] = [
            'id'       => (int)$row['id'],
            'name'     => _decField($enc, $row['name_encrypted'], 'Customer #' . $row['id']),
            'region'   => $row['region'] ?? '',
            'country'  => $row['country'] ?? '',
            'vertical' => $row['vertical'] ?? '',
        ];
    }
}

// ── Portfolio summary ─────────────────────────────────────────────────────────
$summaryStmt = $db->prepare("
    SELECT COUNT(DISTINCT hc.customer_id)                             AS total_customers,
           COUNT(DISTINCT hc.id)                                      AS total_hcs,
           COUNT(d.id)                                                AS total_docs,
           COALESCE(SUM(pp.page_count), 0)                           AS total_pages,
           ROUND(AVG(d.overall_score))                               AS avg_score,
           SUM(d.overall_score >= 75)                                AS score_good,
           SUM(d.overall_score BETWEEN 50 AND 74)                   AS score_fair,
           SUM(d.overall_score < 50 AND d.overall_score IS NOT NULL) AS score_poor,
           SUM(pp.is_tagged = 1)                                      AS tagged_count,
           SUM(pp.is_linearized = 1)                                  AS linearized_count,
           SUM(pp.is_encrypted = 1)                                   AS encrypted_count,
           SUM(pp.has_xfa = 1)                                        AS xfa_count,
           SUM(pp.pii_author = 1)                                     AS pii_count,
           ROUND(AVG(acc.passed_checks * 100.0 /
               NULLIF(acc.passed_checks + acc.failed_checks + acc.warning_checks, 0))) AS avg_access_rate
    FROM health_checks hc
    LEFT JOIN pdf_documents d      ON d.health_check_id = hc.id AND d.status = 'completed'
    LEFT JOIN pdf_properties pp    ON pp.document_id = d.id
    LEFT JOIN pdf_accessibility acc ON acc.document_id = d.id
    WHERE {$whereDoc}
");
$summaryStmt->execute($paramsDoc);
$s = $summaryStmt->fetch();

$totalDocs = max((int)($s['total_docs'] ?? 0), 1);
$summary = [
    'total_customers' => (int)($s['total_customers'] ?? 0),
    'total_hcs'       => (int)($s['total_hcs'] ?? 0),
    'total_docs'      => (int)($s['total_docs'] ?? 0),
    'total_pages'     => (int)($s['total_pages'] ?? 0),
    'avg_score'       => $s['avg_score'] !== null ? (int)$s['avg_score'] : null,
    'score_good'      => (int)($s['score_good'] ?? 0),
    'score_fair'      => (int)($s['score_fair'] ?? 0),
    'score_poor'      => (int)($s['score_poor'] ?? 0),
    'pct_tagged'      => (int)round(($s['tagged_count'] ?? 0) / $totalDocs * 100),
    'pct_linearized'  => (int)round(($s['linearized_count'] ?? 0) / $totalDocs * 100),
    'pct_encrypted'   => (int)round(($s['encrypted_count'] ?? 0) / $totalDocs * 100),
    'pct_xfa'         => (int)round(($s['xfa_count'] ?? 0) / $totalDocs * 100),
    'pii_count'       => (int)($s['pii_count'] ?? 0),
    'avg_access_rate' => $s['avg_access_rate'] !== null ? (int)$s['avg_access_rate'] : null,
];

// ── Health checks list ────────────────────────────────────────────────────────
$hcStmt = $db->prepare("
    SELECT hc.id, hc.name, hc.status, hc.created_at, hc.dr_number,
           hc.owner_email,
           TRIM(CONCAT(COALESCE(hc.owner_first_name,''), ' ', COALESCE(hc.owner_last_name,''))) AS owner_name,
           hc.customer_id,
           c.name_encrypted AS customer_name_encrypted,
           c.region, c.vertical,
           COUNT(d.id)                                                AS doc_count,
           ROUND(AVG(d.overall_score))                               AS avg_score
    FROM health_checks hc
    LEFT JOIN customers c     ON c.id = hc.customer_id
    LEFT JOIN pdf_documents d ON d.health_check_id = hc.id AND d.status = 'completed'
    WHERE {$whereDoc}
    GROUP BY hc.id
    ORDER BY hc.created_at DESC
    LIMIT 50
");
$hcStmt->execute($paramsDoc);

$healthChecks = [];
foreach ($hcStmt->fetchAll() as $row) {
    $healthChecks[] = [
        'id'            => (int)$row['id'],
        'name'          => $row['name'],
        'status'        => $row['status'],
        'created_at'    => $row['created_at'],
        'dr_number'     => $row['dr_number'] ?? '',
        'owner'         => ($row['owner_name'] !== '' ? $row['owner_name'] : null) ?? $row['owner_email'] ?? '',
        'customer_name' => _decField($enc, $row['customer_name_encrypted'], 'Customer #' . $row['customer_id']),
        'region'        => $row['region'] ?? '',
        'vertical'      => $row['vertical'] ?? '',
        'doc_count'     => (int)($row['doc_count'] ?? 0),
        'avg_score'     => $row['avg_score'] !== null ? (int)$row['avg_score'] : null,
    ];
}

// At-risk count (score < 50 in the latest HC per customer)
$atRisk = count(array_filter($healthChecks, fn($h) => $h['avg_score'] !== null && $h['avg_score'] < 50));
$summary['at_risk'] = $atRisk;

// ── Customer breakdown (skip for single-HC scope) ─────────────────────────────
$customers = [];
if ($scope['type'] !== 'hc') {
    $whereC  = $customerId ? 'c.id = ?' : '1=1';
    $paramsC = $customerId ? [$customerId] : [];

    $custStmt = $db->prepare("
        SELECT c.id,
               c.name_encrypted,
               c.region,
               c.country,
               c.vertical,
               COUNT(DISTINCT hc.id)                                              AS hc_count,
               COUNT(d.id)                                                         AS total_docs,
               ROUND(AVG(d.overall_score))                                         AS avg_score,
               SUM(d.overall_score >= 75)                                          AS score_good,
               SUM(d.overall_score BETWEEN 50 AND 74)                             AS score_fair,
               SUM(d.overall_score < 50 AND d.overall_score IS NOT NULL)           AS score_poor,
               MAX(hc.created_at)                                                  AS last_hc
        FROM customers c
        LEFT JOIN health_checks hc ON hc.customer_id = c.id
        LEFT JOIN pdf_documents d  ON d.health_check_id = hc.id AND d.status = 'completed'
        WHERE {$whereC}
        GROUP BY c.id
        ORDER BY avg_score ASC
        LIMIT 100
    ");
    $custStmt->execute($paramsC);

    foreach ($custStmt->fetchAll() as $row) {
        $customers[] = [
            'id'         => (int)$row['id'],
            'name'       => _decField($enc, $row['name_encrypted'], 'Customer #' . $row['id']),
            'region'     => $row['region'] ?? '',
            'country'    => $row['country'] ?? '',
            'vertical'   => $row['vertical'] ?? '',
            'hc_count'   => (int)($row['hc_count'] ?? 0),
            'total_docs' => (int)($row['total_docs'] ?? 0),
            'avg_score'  => $row['avg_score'] !== null ? (int)$row['avg_score'] : null,
            'score_good' => (int)($row['score_good'] ?? 0),
            'score_fair' => (int)($row['score_fair'] ?? 0),
            'score_poor' => (int)($row['score_poor'] ?? 0),
            'last_hc'    => $row['last_hc'] ?? '',
        ];
    }
}

// ── By region ─────────────────────────────────────────────────────────────────
$byRegion = [];
if ($scope['type'] === 'all') {
    $regStmt = $db->query("
        SELECT c.region,
               COUNT(DISTINCT hc.customer_id) AS customer_count,
               COUNT(d.id)                    AS doc_count,
               ROUND(AVG(d.overall_score))    AS avg_score
        FROM customers c
        LEFT JOIN health_checks hc ON hc.customer_id = c.id
        LEFT JOIN pdf_documents d  ON d.health_check_id = hc.id AND d.status = 'completed'
        WHERE c.region IS NOT NULL AND c.region != ''
        GROUP BY c.region
        ORDER BY avg_score DESC
    ");
    foreach ($regStmt->fetchAll() as $row) {
        $byRegion[] = [
            'region'         => $row['region'],
            'customer_count' => (int)$row['customer_count'],
            'doc_count'      => (int)$row['doc_count'],
            'avg_score'      => $row['avg_score'] !== null ? (int)$row['avg_score'] : null,
        ];
    }
}

// ── By vertical ───────────────────────────────────────────────────────────────
$byVertical = [];
if ($scope['type'] === 'all') {
    $vertStmt = $db->query("
        SELECT c.vertical,
               COUNT(DISTINCT hc.customer_id) AS customer_count,
               COUNT(d.id)                    AS doc_count,
               ROUND(AVG(d.overall_score))    AS avg_score
        FROM customers c
        LEFT JOIN health_checks hc ON hc.customer_id = c.id
        LEFT JOIN pdf_documents d  ON d.health_check_id = hc.id AND d.status = 'completed'
        WHERE c.vertical IS NOT NULL AND c.vertical != ''
        GROUP BY c.vertical
        ORDER BY avg_score DESC
        LIMIT 10
    ");
    foreach ($vertStmt->fetchAll() as $row) {
        $byVertical[] = [
            'vertical'       => $row['vertical'],
            'customer_count' => (int)$row['customer_count'],
            'doc_count'      => (int)$row['doc_count'],
            'avg_score'      => $row['avg_score'] !== null ? (int)$row['avg_score'] : null,
        ];
    }
}

Response::success([
    'scope'         => $scope,
    'summary'       => $summary,
    'health_checks' => $healthChecks,
    'customers'     => $customers,
    'by_region'     => $byRegion,
    'by_vertical'   => $byVertical,
    'generated_at'  => date('c'),
]);
