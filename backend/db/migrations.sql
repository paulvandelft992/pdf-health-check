-- PDF Health Check — incremental column migrations
-- Run this script directly against the database whenever the PHP auto-migration
-- cannot execute (e.g. the DB user lacks ALTER TABLE privilege).
--
-- Every statement is safe to re-run: ALTER TABLE … ADD COLUMN IF NOT EXISTS
-- is a no-op when the column already exists (MySQL 8.0+ / MariaDB 10.3+).
-- For older MySQL 5.7 use the IGNORE variant below (also safe to re-run).
--
-- Usage:
--   mysql -u <user> -p <dbname> < backend/db/migrations.sql

USE pdf_health_check;

-- ─── pdf_documents ──────────────────────────────────────────────────────────

ALTER TABLE `pdf_documents`
    ADD COLUMN IF NOT EXISTS `file_size`      INT UNSIGNED     DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `error_message`  TEXT             DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `overall_score`  TINYINT UNSIGNED DEFAULT NULL
                                              COMMENT '0-100 composite score',
    ADD COLUMN IF NOT EXISTS `adobe_asset_id` VARCHAR(500)     DEFAULT NULL;

-- ─── pdf_accessibility ──────────────────────────────────────────────────────

ALTER TABLE `pdf_accessibility`
    ADD COLUMN IF NOT EXISTS `raw_results` JSON DEFAULT NULL
                                          COMMENT 'Full Adobe Accessibility Checker response';

-- ─── pdf_properties ─────────────────────────────────────────────────────────

ALTER TABLE `pdf_properties`
    ADD COLUMN IF NOT EXISTS `author_encrypted` TEXT         DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `creator_app`      VARCHAR(200) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `pii_author`       TINYINT(1)   NOT NULL DEFAULT 0;

-- ─── health_checks — owner/consultant identity + deal registration ───────────

ALTER TABLE `health_checks`
    ADD COLUMN IF NOT EXISTS `owner_email`      VARCHAR(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `owner_first_name` VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `owner_last_name`  VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `dr_number`        VARCHAR(100) DEFAULT NULL;

-- ─── customers — owner scoping ───────────────────────────────────────────────

ALTER TABLE `customers`
    ADD COLUMN IF NOT EXISTS `owner_email` VARCHAR(255) DEFAULT NULL;

-- ─── pii_feedback ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `pii_feedback` (
    `id`             INT          AUTO_INCREMENT PRIMARY KEY,
    `document_id`    INT          NOT NULL,
    `author_value`   VARCHAR(500) NOT NULL,
    `is_person_name` TINYINT(1)   NOT NULL,
    `created_at`     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    `updated_at`     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_document` (`document_id`),
    INDEX      `idx_author`  (`author_value`(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Indexes for owner-scoped queries ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS `idx_hc_owner`        ON `health_checks` (`owner_email`);
CREATE INDEX IF NOT EXISTS `idx_customers_owner` ON `customers`     (`owner_email`);

-- ─── admin_users — web admin panel users ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS `admin_users` (
    `id`            INT          AUTO_INCREMENT PRIMARY KEY,
    `email`         VARCHAR(255) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `is_active`     TINYINT(1)   NOT NULL DEFAULT 1,
    `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `last_login_at` DATETIME     NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── admin_sessions — short-lived login tokens ───────────────────────────────

CREATE TABLE IF NOT EXISTS `admin_sessions` (
    `token`      VARCHAR(64)  NOT NULL PRIMARY KEY,
    `email`      VARCHAR(255) NOT NULL,
    `expires_at` DATETIME     NOT NULL,
    `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_admin_session_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── pdf_properties: extended property columns ───────────────────────────────

ALTER TABLE `pdf_properties`
    ADD COLUMN IF NOT EXISTS `has_embedded_files`    TINYINT(1)   NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `is_certified`          TINYINT(1)   NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `is_signed`             TINYINT(1)   NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS `pdfa_compliance`       VARCHAR(10)  DEFAULT NULL COMMENT 'e.g. 1a, 2b',
    ADD COLUMN IF NOT EXISTS `pdfe_compliance`       VARCHAR(10)  DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `pdfua_compliance`      VARCHAR(10)  DEFAULT NULL COMMENT 'e.g. 1, 2',
    ADD COLUMN IF NOT EXISTS `pdfvt_compliance`      VARCHAR(10)  DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `pdfx_compliance`       VARCHAR(10)  DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `info_title`            VARCHAR(500) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `info_creation_date`    DATETIME     DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `permissions`           JSON         DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `permissions_allow_copy` TINYINT(1)  DEFAULT NULL;
