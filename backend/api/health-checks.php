<?php
/** Health Checks API */
// $userEmail and $isAdmin are set by index.php (shared require scope).
$enc = new Encryption(ENCRYPTION_KEY);
$db  = getDB();
$id  = $_ROUTE_ID ?? null;

// ── GET /api/health-checks ─────────────────────────────────────────────────
if ($method === 'GET' && !$id) {
    $where  = ['1=1'];
    $params = [];

    // Admins may request all health checks via ?all=1; everyone else sees only theirs.
    $showAll = $isAdmin && !empty($_GET['all']);
    if (!$showAll && $userEmail) {
        $where[]  = '(hc.owner_email = ? OR hc.owner_email IS NULL OR hc.owner_email = \'\')';
        $params[] = $userEmail;
    }

    if (!empty($_GET['customer_id'])) {
        $where[]  = 'hc.customer_id = ?';
        $params[] = (int)$_GET['customer_id'];
    }
    if (!empty($_GET['status'])) {
        $where[]  = 'hc.status = ?';
        $params[] = $_GET['status'];
    }

    $limit  = min((int)($_GET['limit'] ?? 50), 200);
    $order  = in_array($_GET['sort'] ?? '', ['created_at','name']) ? ($_GET['sort'] ?? 'created_at') : 'created_at';
    $dir    = strtoupper($_GET['order'] ?? 'DESC') === 'ASC' ? 'ASC' : 'DESC';

    $sql = "
        SELECT hc.id, hc.name, hc.customer_id, hc.status, hc.created_at, hc.completed_at,
               hc.owner_email, hc.owner_first_name, hc.owner_last_name, hc.dr_number,
               ROUND(AVG(d.overall_score))      AS avg_score,
               COUNT(d.id)                      AS doc_count,
               SUM(CASE WHEN d.status='failed' THEN 1 ELSE 0 END) AS failed_count
        FROM health_checks hc
        LEFT JOIN customers c  ON c.id = hc.customer_id
        LEFT JOIN pdf_documents d ON d.health_check_id = hc.id
        WHERE " . implode(' AND ', $where) . "
        GROUP BY hc.id
        ORDER BY hc.{$order} {$dir}
        LIMIT {$limit}";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    // Decrypt customer names
    $custCache = [];
    foreach ($rows as &$row) {
        $cid = $row['customer_id'];
        if (!isset($custCache[$cid])) {
            $cs = $db->prepare("SELECT name_encrypted FROM customers WHERE id = ?");
            $cs->execute([$cid]);
            $cn = $cs->fetchColumn();
            try { $custCache[$cid] = $cn ? $enc->decrypt($cn) : null; }
            catch (\Throwable $e) { $custCache[$cid] = 'Customer #' . $cid; }
        }
        $row['customer_name'] = $custCache[$cid];
        $row['avg_score']     = $row['avg_score'] !== null ? (int)$row['avg_score'] : null;
        $row['doc_count']     = (int)$row['doc_count'];
    }

    // Count total
    $cntSql  = "SELECT COUNT(*) FROM health_checks hc WHERE " . implode(' AND ', $where);
    $cntStmt = $db->prepare($cntSql);
    $cntStmt->execute($params);
    $total = (int)$cntStmt->fetchColumn();

    Response::paginated($rows, $total);
}

// ── GET /api/health-checks/:id ─────────────────────────────────────────────
if ($method === 'GET' && $id) {
    $whereId  = 'hc.id = ?';
    $idParams = [$id];
    if (!$isAdmin && $userEmail) {
        $whereId  .= ' AND (hc.owner_email = ? OR hc.owner_email IS NULL OR hc.owner_email = \'\')';
        $idParams[] = $userEmail;
    }
    $stmt = $db->prepare("
        SELECT hc.*, c.name_encrypted, c.region, c.country, c.vertical,
               ROUND(AVG(d.overall_score))      AS avg_score,
               COUNT(d.id)                      AS doc_count,
               SUM(CASE WHEN pa.is_tagged = 1 THEN 1 ELSE 0 END) AS tagged_count,
               SUM(COALESCE(ac.failed_checks, 0)) AS total_failed_checks
        FROM health_checks hc
        LEFT JOIN customers c       ON c.id = hc.customer_id
        LEFT JOIN pdf_documents d   ON d.health_check_id = hc.id
        LEFT JOIN pdf_properties pa ON pa.document_id = d.id
        LEFT JOIN pdf_accessibility ac ON ac.document_id = d.id
        WHERE {$whereId}
        GROUP BY hc.id
    ");
    $stmt->execute($idParams);
    $row = $stmt->fetch();
    if (!$row) Response::notFound('Health check not found');

    try { $row['customer_name'] = $enc->decrypt($row['name_encrypted']); }
    catch (\Throwable $e) { $row['customer_name'] = 'Customer #' . $row['customer_id']; }
    unset($row['name_encrypted']);

    $row['avg_score']           = $row['avg_score'] !== null ? (int)$row['avg_score'] : null;
    $row['doc_count']           = (int)$row['doc_count'];
    $row['tagged_count']        = (int)$row['tagged_count'];
    $row['total_failed_checks'] = (int)$row['total_failed_checks'];

    Response::success($row);
}

// ── POST /api/health-checks ────────────────────────────────────────────────
if ($method === 'POST' && !$id) {
    $body      = json_decode(file_get_contents('php://input'), true) ?? [];
    $name      = trim($body['name']             ?? '');
    $custId    = (int)($body['customer_id']     ?? 0);
    $ownerEmail = trim($body['owner_email']     ?? $userEmail);
    $firstName = trim($body['owner_first_name'] ?? '');
    $lastName  = trim($body['owner_last_name']  ?? '');
    $drNumber  = trim($body['dr_number']        ?? '');

    if (!$name)   Response::error('name is required');
    if (!$custId) Response::error('customer_id is required');

    // Verify customer exists (and is accessible to this user)
    $cs = $db->prepare("SELECT id FROM customers WHERE id = ?");
    $cs->execute([$custId]);
    if (!$cs->fetch()) Response::notFound('Customer not found');

    $stmt = $db->prepare("
        INSERT INTO health_checks
            (name, customer_id, status, owner_email, owner_first_name, owner_last_name, dr_number)
        VALUES (?, ?, 'pending', ?, ?, ?, ?)
    ");
    $stmt->execute([
        $name,
        $custId,
        $ownerEmail ?: null,
        $firstName  ?: null,
        $lastName   ?: null,
        $drNumber   ?: null,
    ]);
    $newId = (int)$db->lastInsertId();
    Response::created([
        'id'         => $newId,
        'name'       => $name,
        'customer_id'=> $custId,
        'status'     => 'pending',
        'dr_number'  => $drNumber ?: null,
    ]);
}

// ── POST /api/health-checks/:id/finalize ──────────────────────────────────
if ($method === 'POST' && $id && isset($_ROUTE_ACTION) && $_ROUTE_ACTION === 'finalize') {
    // Mark any docs still pending/processing as failed
    $db->prepare("
        UPDATE pdf_documents
        SET status = 'failed'
        WHERE health_check_id = ? AND status NOT IN ('completed', 'failed')
    ")->execute([$id]);

    $stmt = $db->prepare("
        SELECT
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status = 'failed'    THEN 1 ELSE 0 END) AS failed,
            COUNT(*) AS total
        FROM pdf_documents WHERE health_check_id = ?
    ");
    $stmt->execute([$id]);
    $counts    = $stmt->fetch();
    $completed = (int)$counts['completed'];
    $failed    = (int)$counts['failed'];
    $total     = (int)$counts['total'];

    $newStatus = ($total === 0) ? 'failed' : 'completed';

    $db->prepare("
        UPDATE health_checks
        SET status = ?, completed_at = NOW()
        WHERE id = ?
    ")->execute([$newStatus, $id]);

    Response::success([
        'status'    => $newStatus,
        'completed' => $completed,
        'failed'    => $failed,
        'total'     => $total,
    ]);
}

// ── DELETE /api/health-checks/:id ─────────────────────────────────────────
if ($method === 'DELETE' && $id) {
    $db->beginTransaction();
    try {
        $db->prepare("DELETE FROM pdf_accessibility WHERE document_id IN (SELECT id FROM pdf_documents WHERE health_check_id = ?)")->execute([$id]);
        $db->prepare("DELETE FROM pdf_properties    WHERE document_id IN (SELECT id FROM pdf_documents WHERE health_check_id = ?)")->execute([$id]);
        $db->prepare("DELETE FROM pdf_documents WHERE health_check_id = ?")->execute([$id]);
        $db->prepare("DELETE FROM health_checks WHERE id = ?")->execute([$id]);
        $db->commit();
        Response::success(null, 'Health check deleted');
    } catch (\Throwable $e) {
        $db->rollBack();
        throw $e;
    }
}

Response::error('Method not allowed', 405);
