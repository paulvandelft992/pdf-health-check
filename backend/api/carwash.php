<?php
/**
 * PDF Carwash — fix PDFs using Adobe PDF Services APIs
 *
 * POST /api/carwash/process
 *   Multipart/form-data:
 *     file        (binary)  — the original PDF
 *     operations  (JSON)    — e.g. ["autotag","compress","linearize","protect"]
 *     doc_id      (int)     — optional: source document DB record
 *   Returns:
 *     { output_size, download_url, operations_applied[], original_size, filename }
 *
 * GET /api/carwash/download?token=UUID
 *   Streams the processed file (no API-key required — token acts as auth).
 *   File is deleted after serving; all files older than 1h are garbage-collected.
 */

define('CARWASH_TEMP_DIR', __DIR__ . '/../carwash-temp');
define('CARWASH_TEMP_TTL', 3600);            // seconds before a temp file expires
define('CARWASH_MAX_SIZE_MB', 50);           // max upload size (same as global)

$action = $_ROUTE_ACTION ?? 'process';

// ── Temp-dir bootstrap ──────────────────────────────────────────────────────
if (!is_dir(CARWASH_TEMP_DIR)) {
    mkdir(CARWASH_TEMP_DIR, 0700, true);
}

// Write an .htaccess to prevent direct Apache access to the temp dir
$htaccessPath = CARWASH_TEMP_DIR . '/.htaccess';
if (!file_exists($htaccessPath)) {
    file_put_contents($htaccessPath, "Deny from all\n");
}

// ── Route ───────────────────────────────────────────────────────────────────
if ($action === 'download') {
    handleDownload();
    exit;
}

if ($action === 'process') {
    handleProcess();
    exit;
}

Response::error('Unknown carwash action', 400);


// ═══════════════════════════════════════════════════════════════════════════
// POST /api/carwash/process
// ═══════════════════════════════════════════════════════════════════════════
function handleProcess(): void {
    global $db;

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        Response::error('Method not allowed', 405);
    }

    // ── Validate uploaded file ─────────────────────────────────────────────
    if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        $uploadErr = $_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE;
        Response::error('File upload error: ' . uploadErrorMessage($uploadErr), 400);
    }

    $file     = $_FILES['file'];
    $maxBytes = CARWASH_MAX_SIZE_MB * 1024 * 1024;

    if ($file['size'] > $maxBytes) {
        Response::error('File exceeds maximum size of ' . CARWASH_MAX_SIZE_MB . ' MB', 413);
    }

    $mime = mime_content_type($file['tmp_name']);
    if ($mime !== 'application/pdf') {
        Response::error('Only PDF files are accepted (detected: ' . $mime . ')', 415);
    }

    // ── Parse operations ──────────────────────────────────────────────────
    $opsRaw  = $_POST['operations'] ?? '[]';
    $ops     = json_decode($opsRaw, true);
    if (!is_array($ops)) {
        Response::error('Invalid operations parameter — expected JSON array', 400);
    }

    $validOps   = ['autotag', 'compress', 'linearize', 'protect'];
    $ops        = array_values(array_intersect($ops, $validOps));
    // Enforce chain order: autotag → compress → linearize → protect
    $chainOrder = ['autotag', 'compress', 'linearize', 'protect'];
    usort($ops, fn($a, $b) => array_search($a, $chainOrder) <=> array_search($b, $chainOrder));

    if (empty($ops)) {
        Response::error('No valid operations specified', 400);
    }

    // ── Resolve Adobe credentials from DB (preferred) or config constants ──
    [$clientId, $clientSecret] = resolveAdobeCredentials();
    if (!$clientId || !$clientSecret) {
        Response::error(
            'Adobe PDF Services credentials are not configured. '
            . 'Add them in Settings → Adobe PDF Services API.',
            503
        );
    }

    // ── Copy upload to a stable temp path ─────────────────────────────────
    $uploadTmp  = CARWASH_TEMP_DIR . '/' . bin2hex(random_bytes(16)) . '_input.pdf';
    if (!move_uploaded_file($file['tmp_name'], $uploadTmp)) {
        Response::error('Failed to store uploaded file', 500);
    }

    $originalSize = filesize($uploadTmp);
    $filename     = $file['name'] ?: 'document.pdf';

    try {
        $adobe = new AdobeApiClient($clientId, $clientSecret);

        // ── Upload to Adobe ────────────────────────────────────────────────
        $assetId = $adobe->uploadAsset($uploadTmp);

        // ── Chain operations in order ──────────────────────────────────────
        $appliedOps = [];
        $currentAssetId = $assetId;

        foreach ($ops as $op) {
            try {
                $newAssetId = applyOperation($adobe, $op, $currentAssetId);
                $currentAssetId = $newAssetId;
                $appliedOps[]   = $op;
            } catch (\Throwable $e) {
                // Log the failure but continue with the asset we have so far
                error_log("Carwash op '{$op}' failed for '{$filename}': " . $e->getMessage());
                // Re-throw so the caller knows something went wrong — partial results
                // are not useful for a carwash (e.g. tagging failed = subsequent quality
                // operations would still work, but we report the error clearly)
                throw new RuntimeException("Operation '{$op}' failed: " . $e->getMessage());
            }
        }

        // ── Download processed file to a one-time token path ──────────────
        $token      = bin2hex(random_bytes(16));
        $outputPath = CARWASH_TEMP_DIR . '/' . $token . '.pdf';
        $outputSize = $adobe->downloadAssetToFile($currentAssetId, $outputPath);

        // Store metadata alongside the file for the download handler
        $meta = [
            'filename'    => $filename,
            'expires_at'  => time() + CARWASH_TEMP_TTL,
        ];
        file_put_contents($outputPath . '.meta', json_encode($meta));

        // ── Garbage-collect old temp files ────────────────────────────────
        garbageCollect();

        Response::success([
            'filename'          => $filename,
            'original_size'     => $originalSize,
            'output_size'       => $outputSize,
            'operations_applied'=> $appliedOps,
            'download_url'      => '/api/carwash/download?token=' . urlencode($token),
        ]);

    } catch (\Throwable $e) {
        error_log('Carwash error: ' . $e->getMessage());
        Response::error('Carwash processing failed: ' . $e->getMessage(), 500);
    } finally {
        // Always clean up the input temp file
        if (file_exists($uploadTmp)) @unlink($uploadTmp);
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// GET /api/carwash/download?token=UUID
// ═══════════════════════════════════════════════════════════════════════════
function handleDownload(): void {
    $token = preg_replace('/[^a-f0-9]/', '', strtolower($_GET['token'] ?? ''));
    if (strlen($token) !== 32) {
        Response::error('Invalid or missing token', 400);
    }

    $filePath  = CARWASH_TEMP_DIR . '/' . $token . '.pdf';
    $metaPath  = $filePath . '.meta';

    if (!file_exists($filePath)) {
        Response::error('File not found or already downloaded', 404);
    }

    // Check expiry
    $meta = file_exists($metaPath) ? (json_decode(file_get_contents($metaPath), true) ?? []) : [];
    if (!empty($meta['expires_at']) && time() > $meta['expires_at']) {
        @unlink($filePath);
        @unlink($metaPath);
        Response::error('Download link has expired', 410);
    }

    $filename = $meta['filename'] ?? 'washed.pdf';
    $filesize = filesize($filePath);

    // Stream the file — clear any JSON content-type header set in index.php
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . addslashes($filename) . '"');
    header('Content-Length: ' . $filesize);
    header('Cache-Control: no-store');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Expose-Headers: Content-Disposition');
    // Remove the JSON content-type override from index.php
    header_remove('Content-Type');
    header('Content-Type: application/pdf');

    readfile($filePath);

    // Delete after serving (one-time download)
    @unlink($filePath);
    @unlink($metaPath);
    exit;
}


// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply a single carwash operation to an asset, return the new assetID.
 */
function applyOperation(AdobeApiClient $adobe, string $op, string $assetId): string {
    return match($op) {
        'autotag'   => $adobe->autoTag($assetId),
        'compress'  => $adobe->compressPdf($assetId, 'MEDIUM'),
        'linearize' => $adobe->linearizePdf($assetId),
        'protect'   => $adobe->protectPdf($assetId, [
            'allow_copy'  => true,
            'allow_print' => 'HIGH_QUALITY',
        ]),
        default     => throw new \InvalidArgumentException("Unknown operation: {$op}"),
    };
}

/**
 * Get Adobe credentials — check DB first, fall back to config constants.
 * Returns [clientId, clientSecret] or ['', ''] if not configured.
 */
function resolveAdobeCredentials(): array {
    // Try DB-stored credentials (set via admin Settings panel)
    try {
        $db   = getDB();
        $stmt = $db->prepare("SELECT `key`, `value` FROM app_settings WHERE `key` IN ('adobe_client_id','adobe_client_secret')");
        $stmt->execute();
        $rows = $stmt->fetchAll(\PDO::FETCH_KEY_PAIR);
        $id     = $rows['adobe_client_id']     ?? '';
        $secret = $rows['adobe_client_secret'] ?? '';
        if ($id !== '' && $secret !== '') return [$id, $secret];
    } catch (\Throwable $e) {
        error_log('Carwash: DB credential lookup failed: ' . $e->getMessage());
    }

    // Fall back to config.php constants
    $id     = defined('ADOBE_CLIENT_ID')     ? ADOBE_CLIENT_ID     : '';
    $secret = defined('ADOBE_CLIENT_SECRET') ? ADOBE_CLIENT_SECRET : '';
    return [$id, $secret];
}

/**
 * Delete temp files older than CARWASH_TEMP_TTL seconds.
 * Called once per process request to avoid dedicated cron.
 */
function garbageCollect(): void {
    $cutoff = time() - CARWASH_TEMP_TTL;
    foreach (glob(CARWASH_TEMP_DIR . '/*.pdf') ?: [] as $file) {
        if (filemtime($file) < $cutoff) {
            @unlink($file);
            @unlink($file . '.meta');
        }
    }
    // Also clean up orphan input files
    foreach (glob(CARWASH_TEMP_DIR . '/*_input.pdf') ?: [] as $file) {
        if (filemtime($file) < $cutoff) @unlink($file);
    }
}

/**
 * Human-readable PHP upload error.
 */
function uploadErrorMessage(int $code): string {
    return match($code) {
        UPLOAD_ERR_INI_SIZE   => 'File exceeds upload_max_filesize',
        UPLOAD_ERR_FORM_SIZE  => 'File exceeds MAX_FILE_SIZE in form',
        UPLOAD_ERR_PARTIAL    => 'File was only partially uploaded',
        UPLOAD_ERR_NO_FILE    => 'No file was uploaded',
        UPLOAD_ERR_NO_TMP_DIR => 'Missing temp directory',
        UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk',
        UPLOAD_ERR_EXTENSION  => 'A PHP extension stopped the upload',
        default               => "Upload error code {$code}",
    };
}
