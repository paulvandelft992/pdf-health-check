<?php
/** GET /api/export
 *
 * Returns structured data for Excel export.
 *
 * Query parameters:
 *   type=all|customer|hc   — scope of the export (default: all)
 *   customer_id=N           — required when type=customer
 *   hc_id=N                 — required when type=hc
 *
 * Response:
 *   { health_checks: [...], customers: [...], documents: [...] }
 *   documents is only populated for type=hc.
 */

if ($method !== 'GET') Response::error('Method not allowed', 405);

$enc  = new Encryption(ENCRYPTION_KEY);
$db   = getDB();
$type = $_GET['type'] ?? 'all';

// ── Helper ────────────────────────────────────────────────────────────────────
function _decryptField(Encryption $enc, ?string $val, string $fallback = ''): string {
    if ($val === null || $val === '') return $fallback;
    try { return $enc->decrypt($val); } catch (\Throwable $e) { return $fallback; }
}

// ── Scope validation ──────────────────────────────────────────────────────────
$customerId = isset($_GET['customer_id']) ? (int)$_GET['customer_id'] : null;
$hcId       = isset($_GET['hc_id'])       ? (int)$_GET['hc_id']       : null;

if ($type === 'customer' && !$customerId) Response::error('customer_id required', 400);
if ($type === 'hc'       && !$hcId)       Response::error('hc_id required', 400);

// ── Health Checks query ───────────────────────────────────────────────────────
$whereHc  = '1=1';
$paramsHc = [];

if ($type === 'customer') {
    $whereHc    = 'hc.customer_id = ?';
    $paramsHc[] = $customerId;
} elseif ($type === 'hc') {
    $whereHc    = 'hc.id = ?';
    $paramsHc[] = $hcId;
}

$hcRows = $db->prepare("
    SELECT hc.id,
           hc.name,
           hc.status,
           hc.created_at,
           hc.dr_number,
           hc.owner_email,
           TRIM(CONCAT(COALESCE(hc.owner_first_name,''), ' ', COALESCE(hc.owner_last_name,''))) AS owner_name,
           hc.customer_id,
           c.name_encrypted     AS customer_name_encrypted,
           c.region,
           c.country,
           c.vertical,
           COUNT(d.id)                                                AS doc_count,
           ROUND(AVG(d.overall_score))                               AS avg_score,
           SUM(d.overall_score >= 75)                                AS score_good,
           SUM(d.overall_score BETWEEN 50 AND 74)                   AS score_fair,
           SUM(d.overall_score < 50 AND d.overall_score IS NOT NULL) AS score_poor,
           SUM(pp.is_tagged = 1)                                     AS tagged_count,
           SUM(pp.is_linearized = 1)                                 AS linearized_count,
           SUM(pp.is_encrypted = 1)                                  AS encrypted_count,
           SUM(pp.has_xfa = 1)                                       AS xfa_count,
           SUM(pp.pii_author = 1)                                    AS pii_count,
           ROUND(AVG(acc.passed_checks * 100.0 /
               NULLIF(acc.passed_checks + acc.failed_checks + acc.warning_checks, 0))) AS avg_access_rate
    FROM health_checks hc
    LEFT JOIN customers c     ON c.id = hc.customer_id
    LEFT JOIN pdf_documents d ON d.health_check_id = hc.id AND d.status = 'completed'
    LEFT JOIN pdf_properties pp  ON pp.document_id = d.id
    LEFT JOIN pdf_accessibility acc ON acc.document_id = d.id
    WHERE {$whereHc}
    GROUP BY hc.id
    ORDER BY hc.created_at DESC
");
$hcRows->execute($paramsHc);
$rawHcs = $hcRows->fetchAll();

$healthChecks = [];
foreach ($rawHcs as $row) {
    $dc = max((int)($row['doc_count'] ?? 0), 1);
    $healthChecks[] = [
        'id'              => (int)$row['id'],
        'name'            => $row['name'],
        'customer_name'   => _decryptField($enc, $row['customer_name_encrypted'], 'Customer #' . $row['customer_id']),
        'status'          => $row['status'],
        'created_at'      => $row['created_at'],
        'dr_number'       => $row['dr_number'] ?? '',
        'owner'           => ($row['owner_name'] !== '' ? $row['owner_name'] : null) ?? $row['owner_email'] ?? '',
        'region'          => $row['region'] ?? '',
        'country'         => $row['country'] ?? '',
        'vertical'        => $row['vertical'] ?? '',
        'doc_count'       => (int)($row['doc_count'] ?? 0),
        'avg_score'       => $row['avg_score'] !== null ? (int)$row['avg_score'] : null,
        'score_good'      => (int)($row['score_good'] ?? 0),
        'score_fair'      => (int)($row['score_fair'] ?? 0),
        'score_poor'      => (int)($row['score_poor'] ?? 0),
        'pct_tagged'      => (int)round(($row['tagged_count'] ?? 0) / $dc * 100),
        'pct_linearized'  => (int)round(($row['linearized_count'] ?? 0) / $dc * 100),
        'pct_encrypted'   => (int)round(($row['encrypted_count'] ?? 0) / $dc * 100),
        'pct_xfa'         => (int)round(($row['xfa_count'] ?? 0) / $dc * 100),
        'pii_count'       => (int)($row['pii_count'] ?? 0),
        'avg_access_rate' => $row['avg_access_rate'] !== null ? (int)$row['avg_access_rate'] : null,
    ];
}

// ── Customer summary ──────────────────────────────────────────────────────────
$customers = [];
if ($type !== 'hc') {
    $whereC  = '1=1';
    $paramsC = [];
    if ($type === 'customer') {
        $whereC    = 'c.id = ?';
        $paramsC[] = $customerId;
    }

    $custRows = $db->prepare("
        SELECT c.id,
               c.name_encrypted,
               c.region,
               c.country,
               c.vertical,
               COUNT(DISTINCT hc.id)                                             AS hc_count,
               COUNT(d.id)                                                        AS total_docs,
               ROUND(AVG(d.overall_score))                                        AS avg_score,
               SUM(d.overall_score >= 75)                                         AS score_good,
               SUM(d.overall_score BETWEEN 50 AND 74)                            AS score_fair,
               SUM(d.overall_score < 50 AND d.overall_score IS NOT NULL)          AS score_poor,
               SUM(pp.is_tagged = 1)                                              AS tagged_count,
               SUM(pp.is_encrypted = 1)                                           AS encrypted_count,
               SUM(pp.pii_author = 1)                                             AS pii_count
        FROM customers c
        LEFT JOIN health_checks hc ON hc.customer_id = c.id
        LEFT JOIN pdf_documents d  ON d.health_check_id = hc.id AND d.status = 'completed'
        LEFT JOIN pdf_properties pp ON pp.document_id = d.id
        WHERE {$whereC}
        GROUP BY c.id
        ORDER BY c.id
    ");
    $custRows->execute($paramsC);

    foreach ($custRows->fetchAll() as $row) {
        $dc = max((int)($row['total_docs'] ?? 0), 1);
        $customers[] = [
            'id'            => (int)$row['id'],
            'name'          => _decryptField($enc, $row['name_encrypted'], 'Customer #' . $row['id']),
            'region'        => $row['region'] ?? '',
            'country'       => $row['country'] ?? '',
            'vertical'      => $row['vertical'] ?? '',
            'hc_count'      => (int)($row['hc_count'] ?? 0),
            'total_docs'    => (int)($row['total_docs'] ?? 0),
            'avg_score'     => $row['avg_score'] !== null ? (int)$row['avg_score'] : null,
            'score_good'    => (int)($row['score_good'] ?? 0),
            'score_fair'    => (int)($row['score_fair'] ?? 0),
            'score_poor'    => (int)($row['score_poor'] ?? 0),
            'pct_tagged'    => (int)round(($row['tagged_count'] ?? 0) / $dc * 100),
            'pct_encrypted' => (int)round(($row['encrypted_count'] ?? 0) / $dc * 100),
            'pii_count'     => (int)($row['pii_count'] ?? 0),
        ];
    }
}

// ── Documents (single HC only) ────────────────────────────────────────────────
$documents = [];
if ($type === 'hc' && $hcId) {
    $docRows = $db->prepare("
        SELECT d.id,
               d.filename_encrypted,
               d.overall_score,
               d.file_size,
               d.created_at,
               pp.pdf_version,
               pp.page_count,
               pp.is_tagged,
               pp.is_linearized,
               pp.is_encrypted,
               pp.has_xfa,
               pp.has_acroform,
               pp.creator_app,
               pp.author_encrypted,
               pp.pii_author,
               pp.has_embedded_files,
               pp.is_certified,
               pp.is_signed,
               pp.pdfa_compliance,
               pp.pdfua_compliance,
               pp.permissions_allow_copy,
               pp.permissions_assistive_tech,
               pp.permissions_printing,
               acc.passed_checks,
               acc.failed_checks,
               ROUND(acc.passed_checks * 100.0 /
                   NULLIF(acc.passed_checks + acc.failed_checks + acc.warning_checks, 0)) AS accessibility_rate
        FROM pdf_documents d
        LEFT JOIN pdf_properties pp   ON pp.document_id = d.id
        LEFT JOIN pdf_accessibility acc ON acc.document_id = d.id
        WHERE d.health_check_id = ? AND d.status = 'completed'
        ORDER BY d.overall_score ASC
    ");
    $docRows->execute([$hcId]);

    foreach ($docRows->fetchAll() as $row) {
        $filename = _decryptField($enc, $row['filename_encrypted'], 'document-' . $row['id']);
        $author   = _decryptField($enc, $row['author_encrypted'] ?? null, '');
        $documents[] = [
            'filename'           => $filename,
            'score'              => $row['overall_score'] !== null ? (int)$row['overall_score'] : null,
            'score_category'     => $row['overall_score'] === null ? '' :
                                    ($row['overall_score'] >= 75 ? 'Good' : ($row['overall_score'] >= 50 ? 'Fair' : 'Poor')),
            'page_count'         => (int)($row['page_count'] ?? 0),
            'file_size_kb'       => $row['file_size'] ? round($row['file_size'] / 1024, 1) : '',
            'pdf_version'        => $row['pdf_version'] ?? '',
            'creator_app'        => $row['creator_app'] ?? '',
            'author'             => $author,
            'is_tagged'          => (bool)($row['is_tagged'] ?? false) ? 'Yes' : 'No',
            'is_linearized'      => (bool)($row['is_linearized'] ?? false) ? 'Yes' : 'No',
            'is_encrypted'       => (bool)($row['is_encrypted'] ?? false) ? 'Yes' : 'No',
            'has_xfa'            => (bool)($row['has_xfa'] ?? false) ? 'Yes' : 'No',
            'has_acroform'       => (bool)($row['has_acroform'] ?? false) ? 'Yes' : 'No',
            'is_certified'       => (bool)($row['is_certified'] ?? false) ? 'Yes' : 'No',
            'is_signed'          => (bool)($row['is_signed'] ?? false) ? 'Yes' : 'No',
            'pdfa_compliance'    => $row['pdfa_compliance'] ?? '',
            'pdfua_compliance'   => (bool)($row['pdfua_compliance'] ?? false) ? 'Yes' : 'No',
            'pii_detected'       => (bool)($row['pii_author'] ?? false) ? 'Yes' : 'No',
            'has_embedded_files' => (bool)($row['has_embedded_files'] ?? false) ? 'Yes' : 'No',
            'copy_allowed'       => $row['permissions_allow_copy'] === null ? 'N/A' :
                                    ((bool)$row['permissions_allow_copy'] ? 'Yes' : 'No'),
            'screen_reader'      => $row['permissions_assistive_tech'] === null ? 'N/A' :
                                    ((bool)$row['permissions_assistive_tech'] ? 'Yes' : 'No'),
            'printing'           => $row['permissions_printing'] ?? 'N/A',
            'passed_checks'      => (int)($row['passed_checks'] ?? 0),
            'failed_checks'      => (int)($row['failed_checks'] ?? 0),
            'accessibility_rate' => $row['accessibility_rate'] !== null ? (int)$row['accessibility_rate'] : null,
        ];
    }
}

Response::success([
    'type'          => $type,
    'health_checks' => $healthChecks,
    'customers'     => $customers,
    'documents'     => $documents,
    'generated_at'  => date('c'),
]);
