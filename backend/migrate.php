<?php
/**
 * One-time migration runner.
 * Visit:  https://yourserver.com/migrate.php?key=RunMigrations2024
 *
 * DELETE THIS FILE from the server once migrations have run successfully.
 */

// ─── Simple access key — change this if you want, must match the URL param ───
define('MIGRATE_KEY', 'RunMigrations2024');

if (($_GET['key'] ?? '') !== MIGRATE_KEY) {
    http_response_code(403);
    die('<h2>403 Forbidden</h2><p>Provide the correct <code>?key=</code> parameter.</p>');
}

require_once __DIR__ . '/config/database.php';

$db = getDB();

// ─── Migrations list ─────────────────────────────────────────────────────────
// Each entry: [ 'label' => '...', 'sql' => '...' ]
$migrations = [

    // pdf_documents columns
    [
        'label' => 'pdf_documents: add file_size',
        'sql'   => "ALTER TABLE `pdf_documents` ADD COLUMN IF NOT EXISTS `file_size` INT UNSIGNED DEFAULT NULL",
    ],
    [
        'label' => 'pdf_documents: add error_message',
        'sql'   => "ALTER TABLE `pdf_documents` ADD COLUMN IF NOT EXISTS `error_message` TEXT DEFAULT NULL",
    ],
    [
        'label' => 'pdf_documents: add overall_score',
        'sql'   => "ALTER TABLE `pdf_documents` ADD COLUMN IF NOT EXISTS `overall_score` TINYINT UNSIGNED DEFAULT NULL",
    ],
    [
        'label' => 'pdf_documents: add adobe_asset_id',
        'sql'   => "ALTER TABLE `pdf_documents` ADD COLUMN IF NOT EXISTS `adobe_asset_id` VARCHAR(500) DEFAULT NULL",
    ],

    // pdf_accessibility columns
    [
        'label' => 'pdf_accessibility: add raw_results',
        'sql'   => "ALTER TABLE `pdf_accessibility` ADD COLUMN IF NOT EXISTS `raw_results` JSON DEFAULT NULL",
    ],

    // pdf_properties columns
    [
        'label' => 'pdf_properties: add author_encrypted',
        'sql'   => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `author_encrypted` TEXT DEFAULT NULL",
    ],
    [
        'label' => 'pdf_properties: add creator_app',
        'sql'   => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `creator_app` VARCHAR(200) DEFAULT NULL",
    ],
    [
        'label' => 'pdf_properties: add pii_author',
        'sql'   => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `pii_author` TINYINT(1) NOT NULL DEFAULT 0",
    ],

    // health_checks columns
    [
        'label' => 'health_checks: add owner_email',
        'sql'   => "ALTER TABLE `health_checks` ADD COLUMN IF NOT EXISTS `owner_email` VARCHAR(255) DEFAULT NULL",
    ],
    [
        'label' => 'health_checks: add owner_first_name',
        'sql'   => "ALTER TABLE `health_checks` ADD COLUMN IF NOT EXISTS `owner_first_name` VARCHAR(100) DEFAULT NULL",
    ],
    [
        'label' => 'health_checks: add owner_last_name',
        'sql'   => "ALTER TABLE `health_checks` ADD COLUMN IF NOT EXISTS `owner_last_name` VARCHAR(100) DEFAULT NULL",
    ],
    [
        'label' => 'health_checks: add dr_number',
        'sql'   => "ALTER TABLE `health_checks` ADD COLUMN IF NOT EXISTS `dr_number` VARCHAR(100) DEFAULT NULL",
    ],

    // customers columns
    [
        'label' => 'customers: add owner_email',
        'sql'   => "ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `owner_email` VARCHAR(255) DEFAULT NULL",
    ],

    // pii_feedback table
    [
        'label' => 'Create table: pii_feedback',
        'sql'   => "CREATE TABLE IF NOT EXISTS `pii_feedback` (
                        `id`             INT          AUTO_INCREMENT PRIMARY KEY,
                        `document_id`    INT          NOT NULL,
                        `author_value`   VARCHAR(500) NOT NULL,
                        `is_person_name` TINYINT(1)   NOT NULL,
                        `created_at`     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
                        `updated_at`     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY `uk_document` (`document_id`),
                        INDEX      `idx_author`  (`author_value`(100))
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    ],

    // Indexes
    [
        'label' => 'Index: idx_hc_owner on health_checks',
        'sql'   => "CREATE INDEX IF NOT EXISTS `idx_hc_owner` ON `health_checks` (`owner_email`)",
    ],
    [
        'label' => 'Index: idx_customers_owner on customers',
        'sql'   => "CREATE INDEX IF NOT EXISTS `idx_customers_owner` ON `customers` (`owner_email`)",
    ],

    // admin_users table
    [
        'label' => 'Create table: admin_users',
        'sql'   => "CREATE TABLE IF NOT EXISTS `admin_users` (
                        `id`            INT          AUTO_INCREMENT PRIMARY KEY,
                        `email`         VARCHAR(255) NOT NULL UNIQUE,
                        `password_hash` VARCHAR(255) NOT NULL,
                        `is_active`     TINYINT(1)   NOT NULL DEFAULT 1,
                        `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        `last_login_at` DATETIME     NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    ],

    // admin_sessions table
    [
        'label' => 'Create table: admin_sessions',
        'sql'   => "CREATE TABLE IF NOT EXISTS `admin_sessions` (
                        `token`      VARCHAR(64)  NOT NULL PRIMARY KEY,
                        `email`      VARCHAR(255) NOT NULL,
                        `expires_at` DATETIME     NOT NULL,
                        `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX `idx_admin_session_email` (`email`)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    ],

    // pdf_properties: extended property columns
    ['label' => 'pdf_properties: add has_embedded_files',    'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `has_embedded_files`     TINYINT(1)   NOT NULL DEFAULT 0"],
    ['label' => 'pdf_properties: add is_certified',          'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `is_certified`           TINYINT(1)   NOT NULL DEFAULT 0"],
    ['label' => 'pdf_properties: add is_signed',             'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `is_signed`              TINYINT(1)   NOT NULL DEFAULT 0"],
    ['label' => 'pdf_properties: add pdfa_compliance',       'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `pdfa_compliance`        VARCHAR(10)  DEFAULT NULL"],
    ['label' => 'pdf_properties: add pdfe_compliance',       'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `pdfe_compliance`        VARCHAR(10)  DEFAULT NULL"],
    ['label' => 'pdf_properties: add pdfua_compliance',      'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `pdfua_compliance`       VARCHAR(10)  DEFAULT NULL"],
    ['label' => 'pdf_properties: add pdfvt_compliance',      'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `pdfvt_compliance`       VARCHAR(10)  DEFAULT NULL"],
    ['label' => 'pdf_properties: add pdfx_compliance',       'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `pdfx_compliance`        VARCHAR(10)  DEFAULT NULL"],
    ['label' => 'pdf_properties: add info_title',            'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `info_title`             VARCHAR(500) DEFAULT NULL"],
    ['label' => 'pdf_properties: add info_creation_date',    'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `info_creation_date`     DATETIME     DEFAULT NULL"],
    ['label' => 'pdf_properties: add permissions',           'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `permissions`            JSON         DEFAULT NULL"],
    ['label' => 'pdf_properties: add permissions_allow_copy',     'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `permissions_allow_copy`     TINYINT(1)   DEFAULT NULL"],
    ['label' => 'pdf_properties: add permissions_assistive_tech','sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `permissions_assistive_tech` TINYINT(1)   DEFAULT NULL"],
    ['label' => 'pdf_properties: add permissions_form_filling',  'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `permissions_form_filling`   TINYINT(1)   DEFAULT NULL"],
    ['label' => 'pdf_properties: add permissions_page_extraction','sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `permissions_page_extraction` TINYINT(1)  DEFAULT NULL"],
    ['label' => 'pdf_properties: add permissions_doc_assembly',  'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `permissions_doc_assembly`   TINYINT(1)   DEFAULT NULL"],
    ['label' => 'pdf_properties: add permissions_commenting',    'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `permissions_commenting`     TINYINT(1)   DEFAULT NULL"],
    ['label' => 'pdf_properties: add permissions_printing',      'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `permissions_printing`       VARCHAR(20)  DEFAULT NULL"],
    ['label' => 'pdf_properties: add permissions_editing',       'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `permissions_editing`        TINYINT(1)   DEFAULT NULL"],
    ['label' => 'pdf_properties: add info_subject',              'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `info_subject`               VARCHAR(500) DEFAULT NULL"],
    ['label' => 'pdf_properties: add info_keywords',             'sql' => "ALTER TABLE `pdf_properties` ADD COLUMN IF NOT EXISTS `info_keywords`              TEXT         DEFAULT NULL"],
];

// ─── Run ─────────────────────────────────────────────────────────────────────
$results = [];
foreach ($migrations as $m) {
    try {
        $db->exec($m['sql']);
        $results[] = ['ok' => true,  'label' => $m['label'], 'msg' => 'OK'];
    } catch (\Throwable $e) {
        $results[] = ['ok' => false, 'label' => $m['label'], 'msg' => $e->getMessage()];
    }
}

$allOk = array_reduce($results, fn($carry, $r) => $carry && $r['ok'], true);
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>DB Migrations</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 760px; margin: 40px auto; padding: 0 20px; background: #f5f5f5; }
  h1   { font-size: 1.4rem; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.1); }
  th   { background: #1e293b; color: #fff; padding: 10px 14px; text-align: left; font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; }
  td   { padding: 9px 14px; font-size: .875rem; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .ok  { color: #16a34a; font-weight: 600; }
  .err { color: #dc2626; font-weight: 600; }
  .msg { color: #6b7280; font-size: .8rem; }
  .banner { margin-top: 24px; padding: 14px 18px; border-radius: 8px; font-weight: 600; }
  .banner.success { background: #dcfce7; color: #15803d; }
  .banner.failure { background: #fee2e2; color: #b91c1c; }
  .warn { margin-top: 16px; background: #fef9c3; color: #854d0e; padding: 12px 16px; border-radius: 8px; font-size: .85rem; }
</style>
</head>
<body>
<h1>🗄️ Database Migrations</h1>
<table>
  <thead><tr><th>Migration</th><th>Status</th><th>Detail</th></tr></thead>
  <tbody>
  <?php foreach ($results as $r): ?>
    <tr>
      <td><?= htmlspecialchars($r['label']) ?></td>
      <td class="<?= $r['ok'] ? 'ok' : 'err' ?>"><?= $r['ok'] ? '✓ OK' : '✗ Error' ?></td>
      <td class="msg"><?= htmlspecialchars($r['msg']) ?></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>

<div class="banner <?= $allOk ? 'success' : 'failure' ?>">
  <?= $allOk
      ? '✅ All migrations completed successfully.'
      : '❌ One or more migrations failed — check the errors above.' ?>
</div>

<?php if ($allOk): ?>
<div class="warn">
  ⚠️ <strong>Security:</strong> Delete <code>migrate.php</code> from your server now that migrations have run.
</div>
<?php endif; ?>

</body>
</html>
