-- PDF Health Check — MySQL Schema
-- Run once to initialise the database.

CREATE DATABASE IF NOT EXISTS pdf_health_check
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pdf_health_check;

-- ─── Customers ─────────────────────────────────────────────────────────────
-- Customer names are AES-256-CBC encrypted at rest.
-- name_hash is an HMAC-SHA256 used for duplicate detection (never reveals the name).
CREATE TABLE IF NOT EXISTS customers (
    id             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    name_encrypted TEXT            NOT NULL COMMENT 'AES-256-CBC encrypted customer name',
    name_hash      VARCHAR(64)     NOT NULL COMMENT 'HMAC-SHA256 of lower-cased name for dedup',
    region         VARCHAR(100)    DEFAULT NULL,
    country        VARCHAR(100)    DEFAULT NULL,
    vertical       VARCHAR(100)    DEFAULT NULL,
    created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_name_hash (name_hash),
    KEY idx_region   (region),
    KEY idx_vertical (vertical),
    KEY idx_country  (country)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Health Checks ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health_checks (
    id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    customer_id  INT UNSIGNED    NOT NULL,
    name         VARCHAR(255)    NOT NULL,
    status       ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
    created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME        DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_customer (customer_id),
    KEY idx_status   (status),
    KEY idx_created  (created_at),
    CONSTRAINT fk_hc_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── PDF Documents ─────────────────────────────────────────────────────────
-- Original filenames are encrypted; file_hash is used for deduplication within a health check.
CREATE TABLE IF NOT EXISTS pdf_documents (
    id                 INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    health_check_id    INT UNSIGNED    NOT NULL,
    filename_encrypted TEXT            NOT NULL COMMENT 'AES-256-CBC encrypted original filename',
    file_hash          VARCHAR(64)     NOT NULL COMMENT 'SHA-256 of file content',
    file_size          INT UNSIGNED    DEFAULT NULL,
    status             ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
    error_message      TEXT            DEFAULT NULL,
    overall_score      TINYINT UNSIGNED DEFAULT NULL COMMENT '0-100 composite score',
    created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_hc       (health_check_id),
    KEY idx_status   (status),
    KEY idx_score    (overall_score),
    UNIQUE KEY uq_hc_hash (health_check_id, file_hash),
    CONSTRAINT fk_doc_hc FOREIGN KEY (health_check_id) REFERENCES health_checks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── PDF Properties ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pdf_properties (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    document_id     INT UNSIGNED    NOT NULL,
    pdf_version     VARCHAR(10)     DEFAULT NULL,
    page_count      SMALLINT UNSIGNED DEFAULT NULL,
    is_tagged       TINYINT(1)      NOT NULL DEFAULT 0,
    is_linearized   TINYINT(1)      NOT NULL DEFAULT 0,
    is_encrypted    TINYINT(1)      NOT NULL DEFAULT 0,
    has_acroform    TINYINT(1)      NOT NULL DEFAULT 0,
    has_xfa         TINYINT(1)      NOT NULL DEFAULT 0,
    content_type    VARCHAR(50)     DEFAULT NULL COMMENT 'e.g. tagged, scanned, form',
    raw_properties  JSON            DEFAULT NULL COMMENT 'Full Adobe API response',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_doc (document_id),
    CONSTRAINT fk_prop_doc FOREIGN KEY (document_id) REFERENCES pdf_documents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── PDF Accessibility ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pdf_accessibility (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    document_id     INT UNSIGNED    NOT NULL,
    overall_score   TINYINT UNSIGNED DEFAULT NULL COMMENT 'passed / total * 100',
    passed_checks   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    failed_checks   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    warning_checks  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    raw_results     JSON            DEFAULT NULL COMMENT 'Full Adobe Accessibility Checker response',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_doc (document_id),
    CONSTRAINT fk_acc_doc FOREIGN KEY (document_id) REFERENCES pdf_documents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
