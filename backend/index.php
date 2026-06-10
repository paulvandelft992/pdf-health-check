<?php
declare(strict_types=1);

// ─── Bootstrap ────────────────────────────────────────────────────────────────
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/lib/Response.php';
require_once __DIR__ . '/lib/Encryption.php';
require_once __DIR__ . '/lib/AdobeApiClient.php';
require_once __DIR__ . '/lib/PiiDetector.php';

// ─── CORS ────────────────────────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: '  . CORS_ORIGIN);
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, X-Admin-Token, Authorization, X-User-Email');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ─── Auth ──────────────────────────────────────────────────────────────────────
$apiKey = $_SERVER['HTTP_X_API_KEY'] ?? '';

// Determine the request path early so we can bypass API-key check for admin-token routes
$_preUri  = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$_preBase = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/');
$_prePath = '/' . ltrim(str_replace($_preBase, '', $_preUri), '/');
$_prePath = strtok($_prePath, '?');

// /api/auth/* and /api/settings use admin-token auth instead of API key — bypass API key check
// /api/carwash/download uses a one-time token as auth — no API key needed
$_bypassApiKey = preg_match('#^/api/auth/#', $_prePath) || $_prePath === '/api/settings' || preg_match('#^/api/admin#', $_prePath) || $_prePath === '/api/carwash/download';

if (!$_bypassApiKey && APP_API_KEY !== 'CHANGE_ME_STRONG_RANDOM_KEY' && $apiKey !== APP_API_KEY) {
    Response::unauthorized();
}

// ─── User identity (available to every required route file) ───────────────────
// The frontend sends the signed-in user's email as a plain header for data-
// scoping (filtering records by owner). This value is intentionally untrusted
// for privilege decisions — it is self-declared and unverified.
$userEmail = strtolower(trim($_SERVER['HTTP_X_USER_EMAIL'] ?? ''));

// Admin status is determined solely by a verified session token, never by the
// email header.  If X-Admin-Token is present and matches an active row in
// admin_sessions, $isAdmin is set to true and $userEmail is overridden with the
// verified email from the session record.
$isAdmin    = false;
$adminToken = trim($_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '');
if ($adminToken !== '') {
    try {
        $db = getDB();
        $s  = $db->prepare(
            "SELECT email FROM admin_sessions WHERE token = ? AND expires_at > NOW()"
        );
        $s->execute([$adminToken]);
        $row = $s->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $isAdmin   = true;
            $userEmail = strtolower($row['email']); // verified — override header value
        }
    } catch (\Throwable $e) {
        // DB error: deny admin silently; don't crash the request
    }
}

// ─── Route ────────────────────────────────────────────────────────────────────
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$base   = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/');
$path   = '/' . ltrim(str_replace($base, '', $uri), '/');
$method = $_SERVER['REQUEST_METHOD'];

// Strip query string from path
$path = strtok($path, '?');

// ─── Router ───────────────────────────────────────────────────────────────────
try {
    // Schema migrations — runs once per PHP-FPM worker; inside try so any DB
    // hiccup is caught and returned as a proper JSON error rather than a raw 500.
    runMigrations(getDB());
    // Auth
    if (preg_match('#^/api/auth/(verify|login|logout|setup)$#', $path, $m) && in_array($method, ['GET','POST'])) {
        $_ROUTE_ACTION = $m[1];
        require_once __DIR__ . '/api/auth.php';
        exit;
    }

    // Ping
    if ($path === '/api/ping' && $method === 'GET') {
        Response::success(['version' => APP_VERSION, 'time' => date('c')], 'pong');
    }

    // Current user identity + admin flag — called by the frontend on boot
    if ($path === '/api/me' && $method === 'GET') {
        Response::success([
            'email'    => $userEmail,
            'is_admin' => $isAdmin,
        ]);
        exit;
    }

    // App settings endpoint (GET = API-key-accessible, POST = admin-token-protected)
    if ($path === '/api/settings' && in_array($method, ['GET', 'POST'])) {
        require_once __DIR__ . '/api/settings.php';
        exit;
    }

    // Yukon runtime config — returns real (unmasked) credentials for Yukon API calls
    if ($path === '/api/yukon/config' && $method === 'GET') {
        require_once __DIR__ . '/api/yukon-config.php';
        exit;
    }

    // Adobe config endpoint (settings push from UI) — kept for backward compat
    if ($path === '/api/config' && $method === 'POST') {
        require_once __DIR__ . '/api/config.php';
        exit;
    }

    // Customer report (full data for the customer-facing PDF report)
    if (preg_match('#^/api/customers/(\d+)/report$#', $path, $m) && $method === 'GET') {
        $_ROUTE_ID = (int)$m[1];
        require_once __DIR__ . '/api/customer-report.php';
        exit;
    }

    // Customers
    if (preg_match('#^/api/customers(?:/(\d+))?$#', $path, $m)) {
        $_ROUTE_ID = $m[1] ?? null;
        require_once __DIR__ . '/api/customers.php';
        exit;
    }

    // Health check report (must be before the generic HC pattern)
    if (preg_match('#^/api/health-checks/(\d+)/report$#', $path, $m) && $method === 'GET') {
        $_ROUTE_ID = (int)$m[1];
        require_once __DIR__ . '/api/hc-report.php';
        exit;
    }

    // Health checks — finalize (must be before the generic pattern)
    if (preg_match('#^/api/health-checks/(\d+)/finalize$#', $path, $m) && $method === 'POST') {
        $_ROUTE_ID     = (int)$m[1];
        $_ROUTE_ACTION = 'finalize';
        require_once __DIR__ . '/api/health-checks.php';
        exit;
    }

    // Extension — import a single PDF URL into a health check (server-side processing)
    if (preg_match('#^/api/health-checks/(\d+)/import-url$#', $path, $m) && $method === 'POST') {
        $_ROUTE_ID = (int)$m[1];
        require_once __DIR__ . '/api/extension.php';
        exit;
    }

    // Health checks
    if (preg_match('#^/api/health-checks(?:/(\d+))?$#', $path, $m)) {
        $_ROUTE_ID = $m[1] ?? null;
        require_once __DIR__ . '/api/health-checks.php';
        exit;
    }

    // Documents — register (step 1: store metadata + asset ID from frontend)
    if ($path === '/api/documents/register' && $method === 'POST') {
        $_ROUTE_ID     = null;
        $_ROUTE_ACTION = 'register';
        require_once __DIR__ . '/api/documents.php';
        exit;
    }
    // Documents — backfill scores for legacy rows missing overall_score
    if ($path === '/api/documents/backfill-scores' && $method === 'POST') {
        $_ROUTE_ID     = null;
        $_ROUTE_ACTION = 'backfill-scores';
        require_once __DIR__ . '/api/documents.php';
        exit;
    }
    // Documents — per-step analysis (steps 2 & 3)
    if (preg_match('#^/api/documents/(\d+)/(properties|accessibility)$#', $path, $m) && $method === 'POST') {
        $_ROUTE_ID     = (int)$m[1];
        $_ROUTE_ACTION = $m[2];
        require_once __DIR__ . '/api/documents.php';
        exit;
    }
    // Documents — list / detail / result
    if (preg_match('#^/api/documents(?:/(\d+)(?:/result)?)?$#', $path, $m)) {
        $_ROUTE_ID     = isset($m[1]) ? (int)$m[1] : null;
        $_ROUTE_ACTION = str_ends_with($path, '/result') ? 'result' : ($m[1] ? 'get' : 'list');
        require_once __DIR__ . '/api/documents.php';
        exit;
    }

    // Stats
    if (preg_match('#^/api/stats/(.+)$#', $path, $m)) {
        $_ROUTE_STAT = $m[1];
        require_once __DIR__ . '/api/stats.php';
        exit;
    }

    // Crawl — discover PDF URLs across domains / proxy-download a single PDF
    if (preg_match('#^/api/crawl/(discover|fetch)$#', $path, $m) && in_array($method, ['GET', 'POST'])) {
        $_ROUTE_ACTION = $m[1];
        require_once __DIR__ . '/api/crawl.php';
        exit;
    }

    // Admin panel — user management, activity, bulk operations
    if (preg_match('#^/api/admin/(users|activity|health-checks|customers|bulk-delete)$#', $path, $m)) {
        $action = $m[1];
        // Map URL segment to action constant
        $_ROUTE_ACTION = match($action) {
            'users'          => $method === 'POST' ? 'users-add' : 'users-list',
            'activity'       => 'activity',
            'health-checks'  => 'bulk-hc-list',
            'customers'      => 'bulk-cust-list',
            'bulk-delete'    => 'bulk-delete',
        };
        $_ROUTE_ID = null;
        require_once __DIR__ . '/api/admin.php';
        exit;
    }
    // DELETE /api/admin/users/{email}
    if (preg_match('#^/api/admin/users/(.+)$#', $path, $m) && $method === 'DELETE') {
        $_ROUTE_ACTION = 'users-remove';
        $_ROUTE_ID     = urldecode($m[1]);
        require_once __DIR__ . '/api/admin.php';
        exit;
    }

    // POST /api/admin/recalculate-scores
    if ($path === '/api/admin/recalculate-scores') {
        require_once __DIR__ . '/api/recalculate.php';
        exit;
    }

    // POST /api/admin/yukon-sync
    if ($path === '/api/admin/yukon-sync' && $method === 'POST') {
        require_once __DIR__ . '/api/yukon-sync.php';
        exit;
    }

    // Excel export — returns structured JSON for all/customer/hc scope
    if ($path === '/api/export' && $method === 'GET') {
        require_once __DIR__ . '/api/export.php';
        exit;
    }

    // Executive portfolio report
    if ($path === '/api/exec-report' && $method === 'GET') {
        require_once __DIR__ . '/api/exec-report.php';
        exit;
    }

    // PDF Carwash — process (POST, API-key protected) + download (GET, token-auth)
    if (preg_match('#^/api/carwash/(process|download)$#', $path, $m) && in_array($method, ['GET', 'POST'])) {
        $_ROUTE_ACTION = $m[1];
        require_once __DIR__ . '/api/carwash.php';
        exit;
    }

    Response::notFound("Route not found: {$method} {$path}");

} catch (PDOException $e) {
    error_log('DB error: ' . $e->getMessage());
    Response::error('Database error: ' . $e->getMessage(), 500);
} catch (RuntimeException $e) {
    error_log('Runtime error: ' . $e->getMessage());
    Response::error($e->getMessage(), 500);
} catch (Throwable $e) {
    error_log('Unexpected error: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    Response::error(
        'Unexpected error: ' . $e->getMessage()
        . ' [' . basename($e->getFile()) . ':' . $e->getLine() . ']',
        500
    );
}
