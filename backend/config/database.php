<?php
// ─── Database Configuration ─────────────────────────────────────────────────
define('DB_HOST',    getenv('DB_HOST')    ?: 'localhost');
define('DB_PORT',    getenv('DB_PORT')    ?: '3306');
define('DB_NAME',    getenv('DB_NAME')    ?: 'pdf_health_check');
define('DB_USER',    getenv('DB_USER')    ?: 'REDACTED');
define('DB_PASS',    getenv('DB_PASS')    ?: 'REDACTED');
define('DB_CHARSET', 'utf8mb4');

function getDB(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=%s',
        DB_HOST, DB_PORT, DB_NAME, DB_CHARSET);
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
    return $pdo;
}

/**
 * Run all schema migrations exactly once per PHP-FPM worker process.
 * Uses SHOW COLUMNS (no special privileges required, works on all MySQL /
 * MariaDB versions) to check column existence before attempting ALTER TABLE.
 * The try/catch on ALTER TABLE handles the rare race where two fresh workers
 * both detect a missing column at the same moment.
 */
function runMigrations(PDO $db): void {
    static $done = false;
    if ($done) return;
    $done = true;

    // Helper: add a column only when it does not already exist.
    // SHOW COLUMNS … LIKE is a metadata-only read — no table lock.
    // We use fetch() (not rowCount()) because rowCount() on SELECT/SHOW
    // is not guaranteed to return the actual row count in MySQL via PDO.
    $add = static function(string $table, string $col, string $type) use ($db): void {
        try {
            $q      = $db->query("SHOW COLUMNS FROM `{$table}` LIKE " . $db->quote($col));
            $exists = ($q->fetch() !== false);
            if (!$exists) {
                $db->exec("ALTER TABLE `{$table}` ADD COLUMN `{$col}` {$type}");
            }
        } catch (\Throwable $e) {
            // Log so the error appears in the PHP / web-server error log.
            // Common cause: DB user lacks ALTER TABLE privilege — run
            // backend/db/migrations.sql manually to add the missing columns.
            error_log("Migration failed [{$table}.{$col}]: " . $e->getMessage());
        }
    };

    // pdf_documents ─────────────────────────────────────────────────────────
    $add('pdf_documents', 'file_size',      'INT UNSIGNED DEFAULT NULL');
    $add('pdf_documents', 'error_message',  'TEXT DEFAULT NULL');
    $add('pdf_documents', 'overall_score',  'TINYINT UNSIGNED DEFAULT NULL');
    $add('pdf_documents', 'adobe_asset_id', 'VARCHAR(500) DEFAULT NULL');

    // health_checks — owner/consultant identity + deal registration ──────────
    $add('health_checks', 'owner_email',      'VARCHAR(255) DEFAULT NULL');
    $add('health_checks', 'owner_first_name', 'VARCHAR(100) DEFAULT NULL');
    $add('health_checks', 'owner_last_name',  'VARCHAR(100) DEFAULT NULL');
    $add('health_checks', 'dr_number',        'VARCHAR(100) DEFAULT NULL');

    // customers — owner scoping + segmentation ──────────────────────────────
    $add('customers', 'owner_email', 'VARCHAR(255) DEFAULT NULL');
    $add('customers', 'segment',     "VARCHAR(20) DEFAULT NULL COMMENT 'Commercial|Government|Education'");

    // pdf_accessibility — raw Adobe Accessibility Checker JSON (added later) ──
    $add('pdf_accessibility', 'raw_results', 'JSON DEFAULT NULL');

    // pdf_properties ────────────────────────────────────────────────────────
    $add('pdf_properties', 'author_encrypted', 'TEXT DEFAULT NULL');
    $add('pdf_properties', 'creator_app',      'VARCHAR(200) DEFAULT NULL');
    $add('pdf_properties', 'pii_author',       'TINYINT(1) NOT NULL DEFAULT 0');

    // pdf_properties — extended property columns ────────────────────────────
    $add('pdf_properties', 'has_embedded_files',     'TINYINT(1)   NOT NULL DEFAULT 0');
    $add('pdf_properties', 'is_certified',           'TINYINT(1)   NOT NULL DEFAULT 0');
    $add('pdf_properties', 'is_signed',              'TINYINT(1)   NOT NULL DEFAULT 0');
    $add('pdf_properties', 'pdfa_compliance',        "VARCHAR(10)  DEFAULT NULL COMMENT 'e.g. 1a, 2b'");
    $add('pdf_properties', 'pdfe_compliance',        'VARCHAR(10)  DEFAULT NULL');
    $add('pdf_properties', 'pdfua_compliance',       "VARCHAR(10)  DEFAULT NULL COMMENT 'e.g. 1, 2'");
    $add('pdf_properties', 'pdfvt_compliance',       'VARCHAR(10)  DEFAULT NULL');
    $add('pdf_properties', 'pdfx_compliance',        'VARCHAR(10)  DEFAULT NULL');
    $add('pdf_properties', 'info_title',             'VARCHAR(500) DEFAULT NULL');
    $add('pdf_properties', 'info_creation_date',     'DATETIME     DEFAULT NULL');
    $add('pdf_properties', 'permissions',                 'JSON         DEFAULT NULL');
    $add('pdf_properties', 'permissions_allow_copy',     'TINYINT(1)   DEFAULT NULL');
    $add('pdf_properties', 'permissions_assistive_tech', 'TINYINT(1)   DEFAULT NULL');
    $add('pdf_properties', 'permissions_form_filling',   'TINYINT(1)   DEFAULT NULL');
    $add('pdf_properties', 'permissions_page_extraction','TINYINT(1)   DEFAULT NULL');
    $add('pdf_properties', 'permissions_doc_assembly',   'TINYINT(1)   DEFAULT NULL');
    $add('pdf_properties', 'permissions_commenting',     'TINYINT(1)   DEFAULT NULL');
    $add('pdf_properties', 'permissions_printing',       'VARCHAR(20)  DEFAULT NULL');
    $add('pdf_properties', 'permissions_editing',        'TINYINT(1)   DEFAULT NULL');
    $add('pdf_properties', 'info_subject',               'VARCHAR(500) DEFAULT NULL');
    $add('pdf_properties', 'info_keywords',              'TEXT         DEFAULT NULL');

    // pii_feedback — user corrections that feed back into the ML scorer ──────
    // One row per document; author_value is stored in plain text so the scorer
    // can do exact-match lookups without decrypting pdf_properties.
    try {
        $db->exec("
            CREATE TABLE IF NOT EXISTS `pii_feedback` (
                `id`             INT          AUTO_INCREMENT PRIMARY KEY,
                `document_id`    INT          NOT NULL,
                `author_value`   VARCHAR(500) NOT NULL,
                `is_person_name` TINYINT(1)   NOT NULL,
                `created_at`     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
                `updated_at`     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY `uk_document` (`document_id`),
                INDEX      `idx_author`  (`author_value`(100))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    } catch (\Throwable $e) {
        error_log('Migration failed [pii_feedback]: ' . $e->getMessage());
    }

    // Indexes for owner-scoped queries (safe to run repeatedly — checks existence first)
    $addIdx = static function(string $table, string $idxName, string $col) use ($db): void {
        try {
            $q = $db->query("SHOW INDEX FROM `{$table}` WHERE Key_name = " . $db->quote($idxName));
            if (!$q->fetch()) {
                $db->exec("CREATE INDEX `{$idxName}` ON `{$table}`(`{$col}`)");
            }
        } catch (\Throwable $e) {
            error_log("Index migration failed [{$table}.{$idxName}]: " . $e->getMessage());
        }
    };
    $addIdx('health_checks', 'idx_hc_owner',        'owner_email');
    $addIdx('customers',     'idx_customers_owner', 'owner_email');

    // admin_users — web admin panel users ───────────────────────────────────
    try {
        $db->exec("CREATE TABLE IF NOT EXISTS `admin_users` (
            `id`            INT          AUTO_INCREMENT PRIMARY KEY,
            `email`         VARCHAR(255) NOT NULL UNIQUE,
            `password_hash` VARCHAR(255) NOT NULL,
            `is_active`     TINYINT(1)   NOT NULL DEFAULT 1,
            `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `last_login_at` DATETIME     NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (\Throwable $e) {
        error_log('Migration failed [admin_users]: ' . $e->getMessage());
    }

    // admin_sessions — short-lived login tokens ─────────────────────────────
    try {
        $db->exec("CREATE TABLE IF NOT EXISTS `admin_sessions` (
            `token`      VARCHAR(64)  NOT NULL PRIMARY KEY,
            `email`      VARCHAR(255) NOT NULL,
            `expires_at` DATETIME     NOT NULL,
            `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_email` (`email`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (\Throwable $e) {
        error_log('Migration failed [admin_sessions]: ' . $e->getMessage());
    }
}
