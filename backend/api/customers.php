<?php
/** Customers API — CRUD with PII encryption */
// $userEmail and $isAdmin are set by index.php (shared require scope).
$enc = new Encryption(ENCRYPTION_KEY);
$db  = getDB();
$id  = $_ROUTE_ID ?? null;

// ── GET /api/customers ─────────────────────────────────────────────────────
if ($method === 'GET' && !$id) {
    // Admins may request all customers via ?all=1; everyone else sees only theirs.
    $showAll = $isAdmin && !empty($_GET['all']);

    $ownerClause = '';
    $ownerParams = [];
    if (!$showAll && $userEmail) {
        $ownerClause = 'WHERE (c.owner_email = ? OR c.owner_email IS NULL OR c.owner_email = \'\')';
        $ownerParams = [$userEmail];
    }

    $stmt = $db->prepare("
        SELECT c.id, c.name_hash, c.name_encrypted, c.region, c.country, c.vertical, c.segment, c.owner_email, c.created_at,
               COUNT(DISTINCT hc.id)   AS health_check_count,
               COUNT(DISTINCT d.id)    AS pdf_count,
               ROUND(AVG(d.overall_score)) AS avg_score,
               MAX(hc.created_at)      AS last_check
        FROM customers c
        LEFT JOIN health_checks hc ON hc.customer_id = c.id
        LEFT JOIN pdf_documents d  ON d.health_check_id = hc.id AND d.status = 'completed'
        {$ownerClause}
        GROUP BY c.id
        ORDER BY c.created_at DESC
    ");
    $stmt->execute($ownerParams);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) {
        try { $row['display_name'] = $enc->decrypt($row['name_encrypted']); }
        catch (\Throwable $e) { $row['display_name'] = 'Customer #' . $row['id']; }
        unset($row['name_encrypted'], $row['name_hash']);
        $row['avg_score']            = $row['avg_score'] !== null ? (int)$row['avg_score'] : null;
        $row['health_check_count']   = (int)$row['health_check_count'];
        $row['pdf_count']            = (int)$row['pdf_count'];
    }
    Response::success($rows);
}

// ── GET /api/customers/:id ─────────────────────────────────────────────────
if ($method === 'GET' && $id) {
    $whereId   = 'c.id = ?';
    $idParams  = [$id];
    if (!$isAdmin && $userEmail) {
        $whereId  .= ' AND (c.owner_email = ? OR c.owner_email IS NULL OR c.owner_email = \'\')';
        $idParams[] = $userEmail;
    }
    $stmt = $db->prepare("
        SELECT c.*, ROUND(AVG(d.overall_score)) AS avg_score
        FROM customers c
        LEFT JOIN health_checks hc ON hc.customer_id = c.id
        LEFT JOIN pdf_documents d  ON d.health_check_id = hc.id AND d.status = 'completed'
        WHERE {$whereId}
        GROUP BY c.id
    ");
    $stmt->execute($idParams);
    $row = $stmt->fetch();
    if (!$row) Response::notFound('Customer not found');
    try { $row['display_name'] = $enc->decrypt($row['name_encrypted']); }
    catch (\Throwable $e) { $row['display_name'] = 'Customer #' . $id; }
    unset($row['name_encrypted'], $row['name_hash']);
    $row['avg_score'] = $row['avg_score'] !== null ? (int)$row['avg_score'] : null;
    Response::success($row);
}

// ── POST /api/customers ────────────────────────────────────────────────────
if ($method === 'POST') {
    $body  = json_decode(file_get_contents('php://input'), true) ?? [];
    $name  = trim($body['name'] ?? '');
    $owner = $userEmail ?: null;
    if (!$name) Response::error('name is required');

    $nameEnc  = $enc->encrypt($name);
    $nameHash = $enc->hash(strtolower($name));

    // Check for duplicate by hash, scoped to same owner
    if ($owner) {
        $dup = $db->prepare("SELECT id FROM customers WHERE name_hash = ? AND (owner_email = ? OR owner_email IS NULL OR owner_email = '')");
        $dup->execute([$nameHash, $owner]);
    } else {
        $dup = $db->prepare("SELECT id FROM customers WHERE name_hash = ?");
        $dup->execute([$nameHash]);
    }
    if ($dup->fetch()) Response::error('A customer with this name already exists', 409);

    $stmt = $db->prepare("
        INSERT INTO customers (name_encrypted, name_hash, region, country, vertical, segment, owner_email)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ");
    $validSegments = ['Commercial', 'Government', 'Education'];
    $segment = trim($body['segment'] ?? '');
    $segment = in_array($segment, $validSegments, true) ? $segment : null;
    $stmt->execute([
        $nameEnc,
        $nameHash,
        trim($body['region']   ?? ''),
        trim($body['country']  ?? ''),
        trim($body['vertical'] ?? ''),
        $segment,
        $owner,
    ]);
    $newId = (int)$db->lastInsertId();
    Response::created(['id' => $newId, 'display_name' => $name]);
}

// ── PUT /api/customers/:id ─────────────────────────────────────────────────
if ($method === 'PUT' && $id) {
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $name = trim($body['name'] ?? '');
    if (!$name) Response::error('name is required');

    $nameEnc  = $enc->encrypt($name);
    $nameHash = $enc->hash(strtolower($name));

    $validSegments = ['Commercial', 'Government', 'Education'];
    $segment = trim($body['segment'] ?? '');
    $segment = in_array($segment, $validSegments, true) ? $segment : null;

    $updateWhere  = 'id=?';
    $updateParams = [$nameEnc, $nameHash, trim($body['region'] ?? ''), trim($body['country'] ?? ''), trim($body['vertical'] ?? ''), $segment, $id];
    if (!$isAdmin && $userEmail) {
        $updateWhere  .= ' AND (owner_email = ? OR owner_email IS NULL OR owner_email = \'\')';
        $updateParams[] = $userEmail;
    }

    $stmt = $db->prepare("
        UPDATE customers SET name_encrypted=?, name_hash=?, region=?, country=?, vertical=?, segment=?
        WHERE {$updateWhere}
    ");
    $stmt->execute($updateParams);
    if (!$stmt->rowCount()) Response::notFound('Customer not found or not yours');
    Response::success(['id' => (int)$id, 'display_name' => $name]);
}

// ── DELETE /api/customers/:id ──────────────────────────────────────────────
if ($method === 'DELETE' && $id) {
    $delWhere  = 'id = ?';
    $delParams = [$id];
    if (!$isAdmin && $userEmail) {
        $delWhere  .= ' AND (owner_email = ? OR owner_email IS NULL OR owner_email = \'\')';
        $delParams[] = $userEmail;
    }
    $stmt = $db->prepare("DELETE FROM customers WHERE {$delWhere}");
    $stmt->execute($delParams);
    if (!$stmt->rowCount()) Response::notFound('Customer not found or not yours');
    Response::success(null, 'Customer deleted');
}

Response::error('Method not allowed', 405);
