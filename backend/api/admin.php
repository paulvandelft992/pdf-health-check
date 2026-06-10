<?php
/** Admin management API — user management, activity, bulk operations */
$db      = getDB();
$enc     = new Encryption(ENCRYPTION_KEY);
$body    = json_decode(file_get_contents('php://input'), true) ?? [];
$action  = $_ROUTE_ACTION ?? '';
$routeId = $_ROUTE_ID ?? null;

// Require valid admin session
(function() use ($db) {
    try {
        $tok = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
        if (!$tok) Response::error('Admin authentication required', 401);
        $s = $db->prepare("SELECT token FROM admin_sessions WHERE token=? AND expires_at > NOW()");
        $s->execute([$tok]);
        if (!$s->fetch()) Response::error('Admin authentication required', 401);
    } catch (\Throwable $e) { Response::error('Admin authentication required', 401); }
})();

// ── users-list — GET /api/admin/users ────────────────────────────────────────
if ($action === 'users-list') {
    $rows = $db->query("SELECT id, email, is_active, created_at, last_login_at FROM admin_users ORDER BY created_at ASC")->fetchAll();
    Response::success($rows);
}

// ── users-add — POST /api/admin/users ────────────────────────────────────────
if ($action === 'users-add') {
    $email    = trim($body['email'] ?? '');
    $password = $body['password'] ?? '';

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) Response::error('Invalid email address', 400);
    if (mb_strlen($password) < 8) Response::error('Password must be at least 8 characters', 400);

    // Check for duplicate
    $check = $db->prepare("SELECT id FROM admin_users WHERE email=?");
    $check->execute([$email]);
    if ($check->fetch()) Response::error('An admin user with this email already exists', 409);

    $hash = password_hash($password, PASSWORD_BCRYPT);
    $ins  = $db->prepare("INSERT INTO admin_users (email, password_hash) VALUES (?, ?)");
    $ins->execute([$email, $hash]);
    $newId = $db->lastInsertId();

    $row = $db->prepare("SELECT id, email, created_at FROM admin_users WHERE id=?");
    $row->execute([$newId]);
    Response::success($row->fetch(), 'Admin user added');
}

// ── users-remove — DELETE /api/admin/users/{email} ───────────────────────────
if ($action === 'users-remove') {
    $targetEmail = $routeId ?? '';
    if (!$targetEmail) Response::error('Email required', 400);

    // Get caller email from session
    $tok = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
    $callerStmt = $db->prepare("SELECT email FROM admin_sessions WHERE token=? AND expires_at > NOW()");
    $callerStmt->execute([$tok]);
    $callerRow = $callerStmt->fetch();
    $callerEmail = $callerRow ? $callerRow['email'] : '';

    if (strtolower($targetEmail) === strtolower($callerEmail)) {
        Response::error('You cannot remove your own admin account', 403);
    }

    // Check there will be at least 1 remaining user
    $count = (int)$db->query("SELECT COUNT(*) FROM admin_users")->fetchColumn();
    if ($count <= 1) Response::error('Cannot remove the last admin user', 403);

    $db->prepare("DELETE FROM admin_sessions WHERE email=?")->execute([$targetEmail]);
    $db->prepare("DELETE FROM admin_users WHERE email=?")->execute([$targetEmail]);

    Response::success(null, 'Admin user removed');
}

// ── activity — GET /api/admin/activity ───────────────────────────────────────
if ($action === 'activity') {
    try {
        $rows = $db->query("
            SELECT
                e.email,
                COALESCE(c.cnt, 0) AS customers,
                COALESCE(hc.cnt, 0) AS health_checks,
                COALESCE(d.cnt, 0) AS pdfs,
                GREATEST(
                    COALESCE(c.last_at, '1970-01-01 00:00:00'),
                    COALESCE(hc.last_at, '1970-01-01 00:00:00')
                ) AS last_activity
            FROM (
                SELECT DISTINCT owner_email AS email FROM customers WHERE owner_email IS NOT NULL
                UNION
                SELECT DISTINCT owner_email FROM health_checks WHERE owner_email IS NOT NULL
            ) e
            LEFT JOIN (SELECT owner_email, COUNT(*) cnt, MAX(created_at) last_at FROM customers GROUP BY owner_email) c ON c.owner_email = e.email
            LEFT JOIN (SELECT owner_email, COUNT(*) cnt, MAX(created_at) last_at FROM health_checks GROUP BY owner_email) hc ON hc.owner_email = e.email
            LEFT JOIN (SELECT hc2.owner_email, COUNT(d.id) cnt FROM pdf_documents d JOIN health_checks hc2 ON hc2.id = d.health_check_id GROUP BY hc2.owner_email) d ON d.owner_email = e.email
            ORDER BY last_activity DESC
        ")->fetchAll();
    } catch (\Throwable $e) {
        $rows = [];
    }
    Response::success($rows);
}

// ── bulk-hc-list — GET /api/admin/health-checks ──────────────────────────────
if ($action === 'bulk-hc-list') {
    try {
        $rows = $db->query("
            SELECT hc.id, hc.name, hc.status, hc.owner_email, hc.created_at,
                   c.id AS customer_id, c.name_encrypted AS customer_name_enc,
                   COUNT(d.id) AS doc_count,
                   ROUND(AVG(d.overall_score)) AS avg_score
            FROM health_checks hc
            LEFT JOIN customers c ON c.id = hc.customer_id
            LEFT JOIN pdf_documents d ON d.health_check_id = hc.id
            GROUP BY hc.id, c.id, c.name_encrypted
            ORDER BY hc.created_at DESC
            LIMIT 500
        ")->fetchAll();
        foreach ($rows as &$row) {
            try { $row['customer_name'] = $enc->decrypt($row['customer_name_enc']); }
            catch (\Throwable $e) { $row['customer_name'] = 'Customer #' . $row['customer_id']; }
            unset($row['customer_name_enc']);
        }
        unset($row);
    } catch (\Throwable $e) {
        error_log('bulk-hc-list error: ' . $e->getMessage());
        $rows = [];
    }
    Response::success($rows);
}

// ── bulk-cust-list — GET /api/admin/customers ────────────────────────────────
if ($action === 'bulk-cust-list') {
    try {
        $rows = $db->query("
            SELECT c.id, c.name_encrypted, c.owner_email, c.region, c.country, c.vertical, c.created_at,
                   COUNT(DISTINCT hc.id) AS health_check_count
            FROM customers c
            LEFT JOIN health_checks hc ON hc.customer_id = c.id
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT 500
        ")->fetchAll();
        foreach ($rows as &$row) {
            try { $row['display_name'] = $enc->decrypt($row['name_encrypted']); }
            catch (\Throwable $e) { $row['display_name'] = 'Customer #' . $row['id']; }
            unset($row['name_encrypted']);
        }
        unset($row);
    } catch (\Throwable $e) {
        error_log('bulk-cust-list error: ' . $e->getMessage());
        $rows = [];
    }
    Response::success($rows);
}

// ── bulk-delete — POST /api/admin/bulk-delete ────────────────────────────────
if ($action === 'bulk-delete') {
    $type = $body['type'] ?? '';
    $ids  = $body['ids']  ?? [];

    if (!in_array($type, ['health_checks', 'customers'], true)) {
        Response::error('Invalid type. Must be health_checks or customers', 400);
    }
    if (!is_array($ids) || empty($ids)) {
        Response::error('ids must be a non-empty array', 400);
    }

    // Ensure all IDs are integers
    $ids = array_values(array_filter(array_map('intval', $ids)));
    if (empty($ids)) Response::error('ids must contain valid integers', 400);

    $placeholders = implode(',', array_fill(0, count($ids), '?'));

    try {
        if ($type === 'health_checks') {
            $db->prepare("DELETE FROM pdf_documents WHERE health_check_id IN ($placeholders)")->execute($ids);
            $db->prepare("DELETE FROM health_checks WHERE id IN ($placeholders)")->execute($ids);
        } elseif ($type === 'customers') {
            $db->prepare("DELETE d FROM pdf_documents d JOIN health_checks hc ON hc.id=d.health_check_id WHERE hc.customer_id IN ($placeholders)")->execute($ids);
            $db->prepare("DELETE FROM health_checks WHERE customer_id IN ($placeholders)")->execute($ids);
            $db->prepare("DELETE FROM customers WHERE id IN ($placeholders)")->execute($ids);
        }
    } catch (\Throwable $e) {
        Response::error('Bulk delete failed: ' . $e->getMessage(), 500);
    }

    Response::success(['deleted' => count($ids)], 'Deleted successfully');
}

Response::error('Unknown action', 400);
