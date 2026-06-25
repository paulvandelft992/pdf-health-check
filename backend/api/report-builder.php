<?php
/**
 * Report Builder API
 *
 * GET    /api/report-builder/fields          — available dimensions, metrics, viz types
 * POST   /api/report-builder/run             — execute a report config → data
 * GET    /api/report-builder/saved           — list current user's saved reports
 * POST   /api/report-builder/saved           — create a saved report
 * GET    /api/report-builder/saved/:id       — get single saved report
 * PUT    /api/report-builder/saved/:id       — update saved report
 * DELETE /api/report-builder/saved/:id       — delete (only if not shared)
 * POST   /api/report-builder/saved/:id/share — toggle share to library
 * POST   /api/report-builder/saved/:id/clone — clone to a new report
 * GET    /api/report-builder/shared          — list shared report library
 */

$db = getDB();

// Auto-create table on first use
$db->exec("CREATE TABLE IF NOT EXISTS saved_reports (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_email  VARCHAR(255) NOT NULL,
    name        VARCHAR(255) NOT NULL,
    description TEXT         NULL,
    config      JSON         NOT NULL,
    is_shared   TINYINT(1)   NOT NULL DEFAULT 0,
    shared_at   DATETIME     NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_rb_user   (user_email),
    INDEX idx_rb_shared (is_shared)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

// Strip the /api/report-builder prefix to get the sub-path
$rbPath = preg_replace('#^/api/report-builder#', '', $path);

// ── GET /fields ───────────────────────────────────────────────────────────────
if ($rbPath === '/fields' && $method === 'GET') {
    $regions      = $db->query("SELECT DISTINCT region       FROM customers       WHERE region       IS NOT NULL AND region       != '' ORDER BY region")->fetchAll(PDO::FETCH_COLUMN);
    $segments     = $db->query("SELECT DISTINCT segment      FROM customers       WHERE segment      IS NOT NULL AND segment      != '' ORDER BY segment")->fetchAll(PDO::FETCH_COLUMN);
    $verticals    = $db->query("SELECT DISTINCT vertical     FROM customers       WHERE vertical     IS NOT NULL AND vertical     != '' ORDER BY vertical")->fetchAll(PDO::FETCH_COLUMN);
    $countries    = $db->query("SELECT DISTINCT country      FROM customers       WHERE country      IS NOT NULL AND country      != '' ORDER BY country")->fetchAll(PDO::FETCH_COLUMN);
    $contentTypes = $db->query("SELECT DISTINCT content_type FROM pdf_properties  WHERE content_type IS NOT NULL AND content_type != '' ORDER BY content_type")->fetchAll(PDO::FETCH_COLUMN);
    $creatorApps  = $db->query("SELECT DISTINCT creator_app  FROM pdf_properties  WHERE creator_app  IS NOT NULL AND creator_app  != '' ORDER BY creator_app  LIMIT 100")->fetchAll(PDO::FETCH_COLUMN);
    $pdfVersions  = $db->query("SELECT DISTINCT pdf_version  FROM pdf_properties  WHERE pdf_version  IS NOT NULL AND pdf_version  != '' ORDER BY pdf_version")->fetchAll(PDO::FETCH_COLUMN);

    $custSql  = $isAdmin
        ? "SELECT id, name_encrypted FROM customers ORDER BY created_at DESC LIMIT 300"
        : "SELECT id, name_encrypted FROM customers WHERE owner_email = ? OR owner_email IS NULL OR owner_email = '' ORDER BY created_at DESC LIMIT 300";
    $custStmt = $db->prepare($custSql);
    $isAdmin ? $custStmt->execute() : $custStmt->execute([$userEmail]);
    $enc      = new Encryption(ENCRYPTION_KEY);
    $customers = array_map(fn($r) => [
        'id'   => (int)$r['id'],
        'name' => $enc->decrypt($r['name_encrypted']) ?: 'Unknown',
    ], $custStmt->fetchAll());

    Response::success([
        'scopes' => [
            ['key' => 'mine',     'label' => 'My health checks'],
            ['key' => 'all',      'label' => 'All health checks'],
            ['key' => 'customer', 'label' => 'By customer'],
            ['key' => 'region',   'label' => 'By region'],
            ['key' => 'segment',  'label' => 'By segment'],
            ['key' => 'vertical', 'label' => 'By vertical / industry'],
        ],
        'dimensions' => [
            // Health Check / Customer
            ['key' => 'customer',     'label' => 'Customer',            'group' => 'Health Check'],
            ['key' => 'region',       'label' => 'Region',              'group' => 'Health Check'],
            ['key' => 'segment',      'label' => 'Segment',             'group' => 'Health Check'],
            ['key' => 'vertical',     'label' => 'Vertical / Industry', 'group' => 'Health Check'],
            ['key' => 'country',      'label' => 'Country',             'group' => 'Health Check'],
            ['key' => 'status',       'label' => 'HC Status',           'group' => 'Health Check'],
            ['key' => 'owner',        'label' => 'Consultant',          'group' => 'Health Check'],
            ['key' => 'dr_number',    'label' => 'DR Number',           'group' => 'Health Check'],
            // Time
            ['key' => 'day',          'label' => 'Day',                 'group' => 'Time'],
            ['key' => 'month',        'label' => 'Month',               'group' => 'Time'],
            ['key' => 'quarter',      'label' => 'Quarter',             'group' => 'Time'],
            ['key' => 'year',         'label' => 'Year',                'group' => 'Time'],
            // Document properties
            ['key' => 'content_type', 'label' => 'Content Type',        'group' => 'Document'],
            ['key' => 'creator_app',  'label' => 'Creator App',         'group' => 'Document'],
            ['key' => 'pdf_version',  'label' => 'PDF Version',         'group' => 'Document'],
        ],
        'metrics' => [
            // Volume
            ['key' => 'hc_count',              'label' => '# Health Checks',         'unit' => '',   'group' => 'Volume'],
            ['key' => 'doc_count',             'label' => '# Documents Analyzed',    'unit' => '',   'group' => 'Volume'],
            // Scores
            ['key' => 'avg_overall_score',     'label' => 'Avg Overall Score',        'unit' => '%',  'group' => 'Scores'],
            ['key' => 'avg_accessibility',     'label' => 'Avg Accessibility Score',  'unit' => '%',  'group' => 'Scores'],
            ['key' => 'pass_rate',             'label' => 'Accessibility Pass Rate',  'unit' => '%',  'group' => 'Scores'],
            ['key' => 'avg_passed_checks',     'label' => 'Avg Passed Checks',        'unit' => '',   'group' => 'Scores'],
            ['key' => 'avg_failed_checks',     'label' => 'Avg Failed Checks',        'unit' => '',   'group' => 'Scores'],
            ['key' => 'avg_warning_checks',    'label' => 'Avg Warning Checks',       'unit' => '',   'group' => 'Scores'],
            // Document properties
            ['key' => 'tagged_rate',           'label' => 'Tagged PDF Rate',          'unit' => '%',  'group' => 'Document'],
            ['key' => 'encrypted_rate',        'label' => 'Encrypted Rate',           'unit' => '%',  'group' => 'Document'],
            ['key' => 'linearized_rate',       'label' => 'Linearized Rate',          'unit' => '%',  'group' => 'Document'],
            ['key' => 'acroform_rate',         'label' => 'AcroForm Rate',            'unit' => '%',  'group' => 'Document'],
            ['key' => 'xfa_rate',              'label' => 'XFA Form Rate',            'unit' => '%',  'group' => 'Document'],
            ['key' => 'form_rate',             'label' => 'Any Form Rate',            'unit' => '%',  'group' => 'Document'],
            ['key' => 'signed_rate',           'label' => 'Digitally Signed Rate',    'unit' => '%',  'group' => 'Document'],
            ['key' => 'certified_rate',        'label' => 'Certified Rate',           'unit' => '%',  'group' => 'Document'],
            ['key' => 'embedded_files_rate',   'label' => 'Embedded Files Rate',      'unit' => '%',  'group' => 'Document'],
            ['key' => 'pdfa_rate',             'label' => 'PDF/A Compliance Rate',    'unit' => '%',  'group' => 'Document'],
            ['key' => 'pdfua_rate',            'label' => 'PDF/UA Compliance Rate',   'unit' => '%',  'group' => 'Document'],
            ['key' => 'avg_pages',             'label' => 'Avg Page Count',           'unit' => '',   'group' => 'Document'],
            ['key' => 'avg_file_size_kb',      'label' => 'Avg File Size (KB)',       'unit' => 'KB', 'group' => 'Document'],
            // Permissions
            ['key' => 'copy_allowed_rate',     'label' => 'Copy Allowed Rate',        'unit' => '%',  'group' => 'Permissions'],
            ['key' => 'print_allowed_rate',    'label' => 'Printing Allowed Rate',    'unit' => '%',  'group' => 'Permissions'],
            ['key' => 'assistive_tech_rate',   'label' => 'Assistive Tech Rate',      'unit' => '%',  'group' => 'Permissions'],
            // Privacy
            ['key' => 'pii_rate',              'label' => 'PII Author Flagged Rate',  'unit' => '%',  'group' => 'Privacy'],
        ],
        'visualizations' => [
            ['key' => 'bar',    'label' => 'Bar Chart'],
            ['key' => 'bar_h',  'label' => 'Horizontal Bar'],
            ['key' => 'line',   'label' => 'Line Chart'],
            ['key' => 'area',   'label' => 'Area Chart'],
            ['key' => 'pie',    'label' => 'Pie Chart'],
            ['key' => 'donut',  'label' => 'Donut Chart'],
            ['key' => 'table',  'label' => 'Data Table'],
            ['key' => 'metric', 'label' => 'KPI Metrics'],
        ],
        'dateRanges' => [
            ['key' => '7d',   'label' => 'Last 7 days'],
            ['key' => '30d',  'label' => 'Last 30 days'],
            ['key' => '90d',  'label' => 'Last 90 days'],
            ['key' => '180d', 'label' => 'Last 6 months'],
            ['key' => '1y',   'label' => 'Last year'],
            ['key' => 'all',  'label' => 'All time'],
        ],
        // Filter field definitions — type drives the UI widget
        'filterFields' => [
            ['key' => 'status',              'label' => 'HC Status',           'type' => 'select',  'options' => ['pending','processing','completed','failed']],
            ['key' => 'region',              'label' => 'Region',              'type' => 'select',  'options' => array_values($regions)],
            ['key' => 'segment',             'label' => 'Segment',             'type' => 'select',  'options' => array_values($segments)],
            ['key' => 'vertical',            'label' => 'Vertical',            'type' => 'select',  'options' => array_values($verticals)],
            ['key' => 'country',             'label' => 'Country',             'type' => 'select',  'options' => array_values($countries)],
            ['key' => 'content_type',        'label' => 'Content Type',        'type' => 'select',  'options' => array_values($contentTypes)],
            ['key' => 'creator_app',         'label' => 'Creator App',         'type' => 'select',  'options' => array_values($creatorApps)],
            ['key' => 'pdf_version',         'label' => 'PDF Version',         'type' => 'select',  'options' => array_values($pdfVersions)],
            ['key' => 'is_tagged',           'label' => 'Tagged PDF',          'type' => 'bool'],
            ['key' => 'is_encrypted',        'label' => 'Encrypted',           'type' => 'bool'],
            ['key' => 'is_linearized',       'label' => 'Linearized',          'type' => 'bool'],
            ['key' => 'has_acroform',        'label' => 'Has AcroForm',        'type' => 'bool'],
            ['key' => 'has_xfa',             'label' => 'Has XFA Form',        'type' => 'bool'],
            ['key' => 'is_signed',           'label' => 'Digitally Signed',    'type' => 'bool'],
            ['key' => 'is_certified',        'label' => 'Certified',           'type' => 'bool'],
            ['key' => 'has_embedded_files',  'label' => 'Has Embedded Files',  'type' => 'bool'],
            ['key' => 'pdfa',                'label' => 'PDF/A Compliant',     'type' => 'bool'],
            ['key' => 'pdfua',               'label' => 'PDF/UA Compliant',    'type' => 'bool'],
            ['key' => 'pii_author',          'label' => 'PII in Author Field', 'type' => 'bool'],
            ['key' => 'permissions_allow_copy',        'label' => 'Copy Allowed',       'type' => 'bool'],
            ['key' => 'permissions_assistive_tech',    'label' => 'Assistive Tech',     'type' => 'bool'],
            ['key' => 'permissions_form_filling',      'label' => 'Form Filling',       'type' => 'bool'],
            ['key' => 'permissions_commenting',        'label' => 'Commenting',         'type' => 'bool'],
            ['key' => 'dr_number',           'label' => 'DR Number',           'type' => 'text'],
            ['key' => 'hc_name',             'label' => 'HC Name contains',    'type' => 'text'],
        ],
        'customers' => $customers,
        'regions'   => array_values($regions),
        'segments'  => array_values($segments),
        'verticals' => array_values($verticals),
    ]);
    exit;
}

// ── POST /run ─────────────────────────────────────────────────────────────────
if ($rbPath === '/run' && $method === 'POST') {
    $config = json_decode(file_get_contents('php://input'), true) ?? [];
    Response::success(_rb_run($db, $config, $userEmail, $isAdmin));
    exit;
}

// ── GET /shared ───────────────────────────────────────────────────────────────
if ($rbPath === '/shared' && $method === 'GET') {
    $stmt = $db->query("SELECT id, user_email, name, description, config, shared_at, updated_at FROM saved_reports WHERE is_shared=1 ORDER BY shared_at DESC LIMIT 200");
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) { $r['config'] = json_decode($r['config'], true); $r['is_shared'] = true; }
    Response::success($rows);
    exit;
}

// ── GET/POST /saved ───────────────────────────────────────────────────────────
if (preg_match('#^/saved/?$#', $rbPath)) {
    if ($method === 'GET') {
        $stmt = $db->prepare("SELECT id, name, description, config, is_shared, shared_at, created_at, updated_at FROM saved_reports WHERE user_email=? ORDER BY updated_at DESC");
        $stmt->execute([$userEmail]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) { $r['config'] = json_decode($r['config'], true); $r['is_shared'] = (bool)$r['is_shared']; }
        Response::success($rows);
        exit;
    }
    if ($method === 'POST') {
        $body   = json_decode(file_get_contents('php://input'), true) ?? [];
        $name   = trim($body['name']        ?? '') ?: 'Untitled Report';
        $desc   = trim($body['description'] ?? '');
        $config = $body['config']            ?? [];
        $stmt   = $db->prepare("INSERT INTO saved_reports (user_email, name, description, config) VALUES (?,?,?,?)");
        $stmt->execute([$userEmail, $name, $desc, json_encode($config)]);
        Response::created(['id' => (int)$db->lastInsertId(), 'name' => $name]);
        exit;
    }
}

// ── Single report routes: /saved/:id[/action] ─────────────────────────────────
if (preg_match('#^/saved/(\d+)(?:/(share|clone))?$#', $rbPath, $m)) {
    $id     = (int)$m[1];
    $action = $m[2] ?? null;

    $stmt = $db->prepare("SELECT * FROM saved_reports WHERE id=?");
    $stmt->execute([$id]);
    $report = $stmt->fetch();
    if (!$report) { Response::notFound('Report not found'); exit; }

    $isOwner = ($report['user_email'] === $userEmail);
    if (!$isOwner && !$isAdmin && !$report['is_shared']) { Response::unauthorized(); exit; }

    if ($method === 'GET' && !$action) {
        $report['config']    = json_decode($report['config'], true);
        $report['is_shared'] = (bool)$report['is_shared'];
        Response::success($report);
        exit;
    }

    if ($method === 'PUT' && !$action) {
        if (!$isOwner && !$isAdmin) { Response::unauthorized(); exit; }
        $body   = json_decode(file_get_contents('php://input'), true) ?? [];
        $name   = trim($body['name']        ?? $report['name']);
        $desc   = trim($body['description'] ?? ($report['description'] ?? ''));
        $config = $body['config'] ?? json_decode($report['config'], true);
        $db->prepare("UPDATE saved_reports SET name=?,description=?,config=?,updated_at=NOW() WHERE id=?")->execute([$name, $desc, json_encode($config), $id]);
        Response::success(['id' => $id, 'name' => $name]);
        exit;
    }

    if ($method === 'DELETE' && !$action) {
        if (!$isOwner && !$isAdmin) { Response::unauthorized(); exit; }
        if ($report['is_shared']) { Response::error('Unshare the report before deleting it.', 409); exit; }
        $db->prepare("DELETE FROM saved_reports WHERE id=?")->execute([$id]);
        Response::success(null, 'Deleted');
        exit;
    }

    if ($method === 'POST' && $action === 'share') {
        if (!$isOwner && !$isAdmin) { Response::unauthorized(); exit; }
        $new = $report['is_shared'] ? 0 : 1;
        $db->prepare("UPDATE saved_reports SET is_shared=?,shared_at=? WHERE id=?")->execute([$new, $new ? date('Y-m-d H:i:s') : null, $id]);
        Response::success(['is_shared' => (bool)$new]);
        exit;
    }

    if ($method === 'POST' && $action === 'clone') {
        $newName = 'Copy of ' . $report['name'];
        $stmt    = $db->prepare("INSERT INTO saved_reports (user_email, name, description, config) VALUES (?,?,?,?)");
        $stmt->execute([$userEmail, $newName, $report['description'], $report['config']]);
        Response::created(['id' => (int)$db->lastInsertId(), 'name' => $newName]);
        exit;
    }
}

Response::notFound('Report builder route not found');
exit;

// ── Report execution engine ───────────────────────────────────────────────────
function _rb_run(PDO $db, array $config, string $userEmail, bool $isAdmin): array {
    $scope     = $config['scope']         ?? ['type' => 'mine'];
    $dateRange = $config['dateRange']     ?? '30d';
    $groupBy   = $config['groupBy']       ?? null;
    $metrics   = $config['metrics']       ?? ['hc_count'];
    $filters   = $config['filters']       ?? [];
    $viz       = $config['visualization'] ?? 'bar';
    $limit     = min((int)($config['limit']   ?? 25), 200);
    $sortBy    = $config['sortBy']        ?? ($metrics[0] ?? 'hc_count');
    $sortDir   = strtoupper($config['sortDir'] ?? 'DESC') === 'ASC' ? 'ASC' : 'DESC';

    $where = []; $params = [];

    // ── Scope ────────────────────────────────────────────────────────────────
    $scopeType = $scope['type'] ?? 'mine';
    $addUserScope = function() use (&$where, &$params, $userEmail) {
        $where[]  = '(hc.owner_email = ? OR hc.owner_email IS NULL OR hc.owner_email = \'\')';
        $params[] = $userEmail;
    };

    if ($scopeType === 'mine' || (!$isAdmin)) {
        $addUserScope();
    }
    if ($scopeType === 'customer' && !empty($scope['customerId'])) {
        $where[]  = 'hc.customer_id = ?'; $params[] = (int)$scope['customerId'];
    } elseif ($scopeType === 'region' && !empty($scope['value'])) {
        $where[]  = 'c.region = ?'; $params[] = $scope['value'];
    } elseif ($scopeType === 'segment' && !empty($scope['value'])) {
        $where[]  = 'c.segment = ?'; $params[] = $scope['value'];
    } elseif ($scopeType === 'vertical' && !empty($scope['value'])) {
        $where[]  = 'c.vertical = ?'; $params[] = $scope['value'];
    }

    // ── Date range ───────────────────────────────────────────────────────────
    $dateMap = ['7d'=>'7 DAY','30d'=>'30 DAY','90d'=>'90 DAY','180d'=>'180 DAY','1y'=>'1 YEAR'];
    if (!empty($dateMap[$dateRange])) {
        $where[] = "hc.created_at >= DATE_SUB(NOW(), INTERVAL {$dateMap[$dateRange]})";
    }

    // ── Filters ──────────────────────────────────────────────────────────────
    // Map filter field keys → SQL column + handling type
    $filterColMap = [
        // Health Check / Customer fields
        'region'                      => ['col' => 'c.region',                       'how' => 'eq'],
        'segment'                     => ['col' => 'c.segment',                      'how' => 'eq'],
        'vertical'                    => ['col' => 'c.vertical',                     'how' => 'eq'],
        'country'                     => ['col' => 'c.country',                      'how' => 'eq'],
        'dr_number'                   => ['col' => 'hc.dr_number',                   'how' => 'like'],
        'hc_name'                     => ['col' => 'hc.name',                        'how' => 'like'],
        // Document properties (boolean)
        'is_tagged'                   => ['col' => 'pp.is_tagged',                   'how' => 'bool'],
        'is_encrypted'                => ['col' => 'pp.is_encrypted',                'how' => 'bool'],
        'is_linearized'               => ['col' => 'pp.is_linearized',               'how' => 'bool'],
        'has_acroform'                => ['col' => 'pp.has_acroform',                'how' => 'bool'],
        'has_xfa'                     => ['col' => 'pp.has_xfa',                     'how' => 'bool'],
        'is_signed'                   => ['col' => 'pp.is_signed',                   'how' => 'bool'],
        'is_certified'                => ['col' => 'pp.is_certified',                'how' => 'bool'],
        'has_embedded_files'          => ['col' => 'pp.has_embedded_files',          'how' => 'bool'],
        'pii_author'                  => ['col' => 'pp.pii_author',                  'how' => 'bool'],
        'permissions_allow_copy'      => ['col' => 'pp.permissions_allow_copy',      'how' => 'bool'],
        'permissions_assistive_tech'  => ['col' => 'pp.permissions_assistive_tech',  'how' => 'bool'],
        'permissions_form_filling'    => ['col' => 'pp.permissions_form_filling',    'how' => 'bool'],
        'permissions_commenting'      => ['col' => 'pp.permissions_commenting',      'how' => 'bool'],
        // Document properties (categorical)
        'content_type'                => ['col' => 'pp.content_type',                'how' => 'eq'],
        'creator_app'                 => ['col' => 'pp.creator_app',                 'how' => 'eq'],
        'pdf_version'                 => ['col' => 'pp.pdf_version',                 'how' => 'eq'],
        // PDF/A, PDF/UA — treat as "is set" / "is not set"
        'pdfa'                        => ['col' => 'pp.pdfa_compliance',             'how' => 'isset'],
        'pdfua'                       => ['col' => 'pp.pdfua_compliance',            'how' => 'isset'],
    ];

    $statusFiltered = false;
    foreach ($filters as $f) {
        $field = $f['field'] ?? '';
        $val   = $f['value'] ?? '';
        $op    = $f['op']    ?? 'eq'; // default operator

        if ($field === 'status') {
            if ($val !== '') {
                $where[]  = 'hc.status = ?'; $params[] = $val; $statusFiltered = true;
            }
            continue;
        }

        if (!isset($filterColMap[$field])) continue;
        $col = $filterColMap[$field]['col'];
        $how = $filterColMap[$field]['how'];

        if ($how === 'eq' && $val !== '') {
            $negate  = ($op === 'neq');
            $where[] = $negate ? "{$col} != ?" : "{$col} = ?";
            $params[] = $val;
        } elseif ($how === 'like' && $val !== '') {
            $where[]  = "{$col} LIKE ?"; $params[] = '%' . $val . '%';
        } elseif ($how === 'bool') {
            // value: "1" = yes, "0" = no
            if ($val === '1' || $val === '0') {
                $where[]  = "{$col} = ?"; $params[] = (int)$val;
            }
        } elseif ($how === 'isset') {
            if ($val === '1') {
                $where[] = "{$col} IS NOT NULL AND {$col} != ''";
            } elseif ($val === '0') {
                $where[] = "({$col} IS NULL OR {$col} = '')";
            }
        }
    }

    // Default: only completed HCs (unless status filter applied)
    if (!$statusFiltered) {
        $where[] = "hc.status = 'completed'";
    }

    // ── Metric SQL expressions ────────────────────────────────────────────────
    $metricSql = [
        // Volume
        'hc_count'             => 'COUNT(DISTINCT hc.id)',
        'doc_count'            => 'COUNT(DISTINCT d.id)',
        // Scores
        'avg_overall_score'    => 'ROUND(AVG(d.overall_score), 1)',
        'avg_accessibility'    => 'ROUND(AVG(a.overall_score), 1)',
        'pass_rate'            => 'ROUND(SUM(a.passed_checks) / NULLIF(SUM(a.passed_checks + a.failed_checks + a.warning_checks), 0) * 100, 1)',
        'avg_passed_checks'    => 'ROUND(AVG(a.passed_checks), 1)',
        'avg_failed_checks'    => 'ROUND(AVG(a.failed_checks), 1)',
        'avg_warning_checks'   => 'ROUND(AVG(a.warning_checks), 1)',
        // Document properties
        'tagged_rate'          => 'ROUND(SUM(pp.is_tagged)          / NULLIF(COUNT(pp.id), 0) * 100, 1)',
        'encrypted_rate'       => 'ROUND(SUM(pp.is_encrypted)       / NULLIF(COUNT(pp.id), 0) * 100, 1)',
        'linearized_rate'      => 'ROUND(SUM(pp.is_linearized)      / NULLIF(COUNT(pp.id), 0) * 100, 1)',
        'acroform_rate'        => 'ROUND(SUM(pp.has_acroform)       / NULLIF(COUNT(pp.id), 0) * 100, 1)',
        'xfa_rate'             => 'ROUND(SUM(pp.has_xfa)            / NULLIF(COUNT(pp.id), 0) * 100, 1)',
        'form_rate'            => 'ROUND(SUM(pp.has_acroform OR pp.has_xfa) / NULLIF(COUNT(pp.id), 0) * 100, 1)',
        'signed_rate'          => 'ROUND(SUM(pp.is_signed)          / NULLIF(COUNT(pp.id), 0) * 100, 1)',
        'certified_rate'       => 'ROUND(SUM(pp.is_certified)       / NULLIF(COUNT(pp.id), 0) * 100, 1)',
        'embedded_files_rate'  => 'ROUND(SUM(pp.has_embedded_files) / NULLIF(COUNT(pp.id), 0) * 100, 1)',
        'pdfa_rate'            => 'ROUND(SUM(pp.pdfa_compliance IS NOT NULL AND pp.pdfa_compliance != \'\') / NULLIF(COUNT(pp.id), 0) * 100, 1)',
        'pdfua_rate'           => 'ROUND(SUM(pp.pdfua_compliance IS NOT NULL AND pp.pdfua_compliance != \'\') / NULLIF(COUNT(pp.id), 0) * 100, 1)',
        'avg_pages'            => 'ROUND(AVG(pp.page_count), 0)',
        'avg_file_size_kb'     => 'ROUND(AVG(d.file_size) / 1024, 0)',
        // Permissions
        'copy_allowed_rate'    => 'ROUND(SUM(pp.permissions_allow_copy)     / NULLIF(COUNT(pp.id), 0) * 100, 1)',
        'print_allowed_rate'   => 'ROUND(SUM(pp.permissions_printing != \'notAllowed\' AND pp.permissions_printing IS NOT NULL) / NULLIF(COUNT(pp.id), 0) * 100, 1)',
        'assistive_tech_rate'  => 'ROUND(SUM(pp.permissions_assistive_tech) / NULLIF(COUNT(pp.id), 0) * 100, 1)',
        // Privacy
        'pii_rate'             => 'ROUND(SUM(pp.pii_author)          / NULLIF(COUNT(pp.id), 0) * 100, 1)',
    ];

    // ── GroupBy configurations ────────────────────────────────────────────────
    $gbMap = [
        // Health Check / Customer
        'customer'     => ['sel' => 'c.id AS group_key, c.name_encrypted AS _enc',                                                'grp' => 'c.id'],
        'region'       => ['sel' => "COALESCE(c.region,   'Unknown') AS group_key",                                               'grp' => 'c.region'],
        'segment'      => ['sel' => "COALESCE(c.segment,  'Unknown') AS group_key",                                               'grp' => 'c.segment'],
        'vertical'     => ['sel' => "COALESCE(c.vertical, 'Unknown') AS group_key",                                               'grp' => 'c.vertical'],
        'country'      => ['sel' => "COALESCE(c.country,  'Unknown') AS group_key",                                               'grp' => 'c.country'],
        'status'       => ['sel' => 'hc.status AS group_key',                                                                     'grp' => 'hc.status'],
        'owner'        => ['sel' => "COALESCE(CONCAT(NULLIF(hc.owner_first_name,''),' ',NULLIF(hc.owner_last_name,'')),hc.owner_email,'Unknown') AS group_key", 'grp' => 'hc.owner_email'],
        'dr_number'    => ['sel' => "COALESCE(hc.dr_number, 'No DR') AS group_key",                                               'grp' => 'hc.dr_number'],
        // Time
        'day'          => ['sel' => "DATE_FORMAT(hc.created_at,'%Y-%m-%d') AS group_key",                                         'grp' => "DATE(hc.created_at)"],
        'month'        => ['sel' => "DATE_FORMAT(hc.created_at,'%Y-%m') AS group_key",                                            'grp' => "DATE_FORMAT(hc.created_at,'%Y-%m')"],
        'quarter'      => ['sel' => "CONCAT(YEAR(hc.created_at),'-Q',QUARTER(hc.created_at)) AS group_key",                       'grp' => 'YEAR(hc.created_at),QUARTER(hc.created_at)'],
        'year'         => ['sel' => "YEAR(hc.created_at) AS group_key",                                                           'grp' => 'YEAR(hc.created_at)'],
        // Document properties
        'content_type' => ['sel' => "COALESCE(pp.content_type, 'Unknown') AS group_key",                                          'grp' => 'pp.content_type'],
        'creator_app'  => ['sel' => "COALESCE(pp.creator_app,  'Unknown') AS group_key",                                          'grp' => 'pp.creator_app'],
        'pdf_version'  => ['sel' => "COALESCE(pp.pdf_version,  'Unknown') AS group_key",                                          'grp' => 'pp.pdf_version'],
    ];

    $hasGroup  = $groupBy && isset($gbMap[$groupBy]);
    $selParts  = $hasGroup ? [$gbMap[$groupBy]['sel']] : [];
    $validM    = [];

    foreach ($metrics as $m) {
        if (isset($metricSql[$m])) {
            $selParts[] = "{$metricSql[$m]} AS `{$m}`";
            $validM[]   = $m;
        }
    }
    if (empty($validM)) {
        $selParts[] = "{$metricSql['hc_count']} AS `hc_count`";
        $validM[]   = 'hc_count';
    }

    $safeSortBy = in_array($sortBy, $validM) ? "`{$sortBy}`" : '`' . $validM[0] . '`';
    $whereSQL   = $where ? 'WHERE ' . implode(' AND ', $where) : '';
    $groupSQL   = $hasGroup ? 'GROUP BY ' . $gbMap[$groupBy]['grp'] : '';

    $sql = "SELECT " . implode(', ', $selParts) . "
            FROM health_checks hc
            LEFT JOIN customers c          ON c.id = hc.customer_id
            LEFT JOIN pdf_documents d      ON d.health_check_id = hc.id AND d.status='completed'
            LEFT JOIN pdf_accessibility a  ON a.document_id = d.id
            LEFT JOIN pdf_properties    pp ON pp.document_id = d.id
            {$whereSQL}
            {$groupSQL}
            ORDER BY {$safeSortBy} {$sortDir}
            LIMIT {$limit}";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    // Decrypt customer names
    if ($groupBy === 'customer') {
        $enc = new Encryption(ENCRYPTION_KEY);
        foreach ($rows as &$r) {
            $r['group_key'] = !empty($r['_enc']) ? ($enc->decrypt($r['_enc']) ?: 'Unknown') : 'Unknown';
            unset($r['_enc']);
        }
        unset($r);
    }

    // Cast numeric metric values
    foreach ($rows as &$r) {
        foreach ($validM as $m) {
            if (isset($r[$m])) $r[$m] = is_numeric($r[$m]) ? (float)$r[$m] : null;
        }
    }
    unset($r);

    if (!$hasGroup) {
        $summary = $rows[0] ?? [];
        $cards   = array_map(fn($m) => ['key' => $m, 'value' => $summary[$m] ?? 0], $validM);
        return ['visualization' => $viz, 'has_groups' => false, 'metric_cards' => $cards, 'rows' => $rows, 'metrics' => $validM];
    }

    $labels   = array_column($rows, 'group_key');
    $datasets = array_map(fn($m) => [
        'field'  => $m,
        'values' => array_map(fn($r) => $r[$m] ?? 0, $rows),
    ], $validM);

    return [
        'visualization' => $viz,
        'has_groups'    => true,
        'labels'        => $labels,
        'datasets'      => $datasets,
        'rows'          => $rows,
        'metrics'       => $validM,
        'group_by'      => $groupBy,
    ];
}
