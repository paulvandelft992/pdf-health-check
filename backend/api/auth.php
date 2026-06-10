<?php
/** Admin Auth API — uses admin_users + admin_sessions tables */
$db     = getDB();
$body   = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $_ROUTE_ACTION ?? '';

// ── Helper: check admin session token ────────────────────────────────────────
function adminIsAuthed(PDO $db): bool {
    try {
        $tok = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
        if (!$tok) return false;
        $s = $db->prepare("SELECT token FROM admin_sessions WHERE token=? AND expires_at > NOW()");
        $s->execute([$tok]); return (bool)$s->fetch();
    } catch (\Throwable $e) { return false; }
}

// ── Helper: check if admin_users table exists ─────────────────────────────────
function adminTablesExist(PDO $db): bool {
    try {
        $s = $db->query("SHOW TABLES LIKE 'admin_users'");
        return $s->fetch() !== false;
    } catch (\Throwable $e) { return false; }
}

// ── Helper: check if admin_users table exists and has rows ────────────────────
function adminUsersExist(PDO $db): bool {
    try {
        $s = $db->query("SELECT COUNT(*) FROM admin_users");
        return (int)$s->fetchColumn() > 0;
    } catch (\Throwable $e) { return false; }
}

// ── GET /api/auth/verify ──────────────────────────────────────────────────────
if ($method === 'GET' && $action === 'verify') {
    if (!adminTablesExist($db)) {
        Response::error('Admin tables have not been created. Please run the database migrations manually. See backend/config/database.php for the CREATE TABLE statements.', 503);
    }
    if (!adminUsersExist($db)) {
        Response::success(['setup_required' => true, 'authenticated' => false]);
    }
    $tok = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
    if ($tok) {
        try {
            $s = $db->prepare("SELECT email FROM admin_sessions WHERE token=? AND expires_at > NOW()");
            $s->execute([$tok]);
            $row = $s->fetch();
            if ($row) {
                Response::success(['setup_required' => false, 'authenticated' => true, 'email' => $row['email']]);
            }
        } catch (\Throwable $e) {}
    }
    Response::success(['setup_required' => false, 'authenticated' => false, 'email' => null]);
}

// ── POST /api/auth/setup ──────────────────────────────────────────────────────
if ($method === 'POST' && $action === 'setup') {
    if (!adminTablesExist($db)) {
        Response::error('Admin tables are missing. Run this SQL in your database first:<br><pre>CREATE TABLE IF NOT EXISTS `admin_users` (`id` INT AUTO_INCREMENT PRIMARY KEY, `email` VARCHAR(255) NOT NULL UNIQUE, `password_hash` VARCHAR(255) NOT NULL, `is_active` TINYINT(1) NOT NULL DEFAULT 1, `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, `last_login_at` DATETIME NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;<br>CREATE TABLE IF NOT EXISTS `admin_sessions` (`token` VARCHAR(64) NOT NULL PRIMARY KEY, `email` VARCHAR(255) NOT NULL, `expires_at` DATETIME NOT NULL, `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX `idx_email` (`email`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;</pre>', 503);
    }
    $force = !empty($body['force']);

    // If force=true, require valid admin token (password change for any user)
    if ($force) {
        if (!adminIsAuthed($db)) {
            Response::error('Admin authentication required to change password', 401);
        }
    } else {
        // Initial setup: only allowed if no users exist
        if (adminUsersExist($db)) {
            Response::error('Admin account already exists. Use /api/auth/login.', 403);
        }
    }

    $email    = trim($body['email'] ?? '');
    $password = $body['password'] ?? '';

    if ($email === '') Response::error('Email is required', 400);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) Response::error('Invalid email address', 400);
    if (mb_strlen($password) < 8) Response::error('Password must be at least 8 characters', 400);

    $hash = password_hash($password, PASSWORD_BCRYPT);

    if ($force) {
        // Update existing user's password
        $db->prepare("UPDATE admin_users SET password_hash=? WHERE email=?")->execute([$hash, $email]);
    } else {
        // Insert first admin user
        $db->prepare("INSERT INTO admin_users (email, password_hash) VALUES (?, ?)")->execute([$email, $hash]);
    }

    // Create session
    $token = bin2hex(random_bytes(32));
    $expires = date('Y-m-d H:i:s', strtotime('+24 hours'));

    // Clear any old sessions for this email
    $db->prepare("DELETE FROM admin_sessions WHERE email=?")->execute([$email]);
    $db->prepare("INSERT INTO admin_sessions (token, email, expires_at) VALUES (?, ?, ?)")->execute([$token, $email, $expires]);

    Response::success(['token' => $token, 'email' => $email], $force ? 'Password changed' : 'Admin account created');
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
if ($method === 'POST' && $action === 'login') {
    if (!adminUsersExist($db)) {
        Response::error('No admin accounts configured. Complete setup first.', 403);
    }

    $email    = trim($body['email'] ?? '');
    $password = $body['password'] ?? '';

    if ($email === '') Response::error('Email is required', 400);

    try {
        $s = $db->prepare("SELECT id, email, password_hash FROM admin_users WHERE email=? AND is_active=1");
        $s->execute([$email]);
        $user = $s->fetch();
    } catch (\Throwable $e) {
        Response::error('Login failed', 500);
    }

    if (!$user || !password_verify($password, $user['password_hash'])) {
        Response::error('Incorrect email or password', 401);
    }

    // Update last_login_at
    $db->prepare("UPDATE admin_users SET last_login_at=NOW() WHERE id=?")->execute([$user['id']]);

    // Delete old sessions for this email
    $db->prepare("DELETE FROM admin_sessions WHERE email=?")->execute([$email]);

    // Create new session
    $token   = bin2hex(random_bytes(32));
    $expires = date('Y-m-d H:i:s', strtotime('+24 hours'));
    $db->prepare("INSERT INTO admin_sessions (token, email, expires_at) VALUES (?, ?, ?)")->execute([$token, $email, $expires]);

    Response::success(['token' => $token, 'email' => $email], 'Logged in');
}

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
if ($method === 'POST' && $action === 'logout') {
    $tok = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
    if ($tok) {
        try {
            $db->prepare("DELETE FROM admin_sessions WHERE token=?")->execute([$tok]);
        } catch (\Throwable $e) {}
    }
    Response::success(null, 'Logged out');
}

Response::error('Method not allowed', 405);
