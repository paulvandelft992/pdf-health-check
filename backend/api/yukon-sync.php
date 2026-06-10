<?php
/**
 * POST /api/admin/yukon-sync
 *
 * Generates LLM-friendly markdown summaries for all completed health checks
 * and returns them to the caller.  The browser (admin.php) uploads each
 * document to Yukon directly using the Yukon credentials — this avoids any
 * outbound network requirement on the PHP server.
 *
 * Optional request body:
 *   { "hc_ids": [1, 2, 3] }   — generate only for specific HC IDs
 *   {}                         — generate for ALL completed health checks
 *
 * Returns:
 *   { documents: [{ filename, content, hc_id, hc_name }, ...] }
 */

$db     = getDB();
$method = $_SERVER['REQUEST_METHOD'];
$body   = json_decode(file_get_contents('php://input'), true) ?? [];

require_once __DIR__ . '/../lib/Encryption.php';
$enc = new Encryption(ENCRYPTION_KEY);

// ── Admin auth ───────────────────────────────────────────────────────────────
(function() use ($db) {
    $tok = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
    if (!$tok) { Response::error('Admin authentication required', 401); exit; }
    $s = $db->prepare("SELECT token FROM admin_sessions WHERE token=? AND expires_at > NOW()");
    $s->execute([$tok]);
    if (!$s->fetch()) { Response::error('Admin authentication required', 401); exit; }
})();

if ($method !== 'POST') { Response::error('Method not allowed', 405); exit; }

// ── Fetch completed health checks ────────────────────────────────────────────
$filterIds = !empty($body['hc_ids']) && is_array($body['hc_ids'])
    ? array_map('intval', $body['hc_ids'])
    : [];

if ($filterIds) {
    $ph   = implode(',', array_fill(0, count($filterIds), '?'));
    $stmt = $db->prepare("
        SELECT hc.id, hc.name, hc.status, hc.created_at, hc.completed_at,
               hc.owner_email, hc.owner_first_name, hc.owner_last_name, hc.dr_number,
               c.name_encrypted AS customer_name_encrypted,
               ROUND(AVG(d.overall_score)) AS avg_score,
               COUNT(d.id) AS doc_count
        FROM health_checks hc
        LEFT JOIN customers c ON c.id = hc.customer_id
        LEFT JOIN pdf_documents d ON d.health_check_id = hc.id AND d.status = 'completed'
        WHERE hc.id IN ($ph)
        GROUP BY hc.id
    ");
    $stmt->execute($filterIds);
} else {
    $stmt = $db->prepare("
        SELECT hc.id, hc.name, hc.status, hc.created_at, hc.completed_at,
               hc.owner_email, hc.owner_first_name, hc.owner_last_name, hc.dr_number,
               c.name_encrypted AS customer_name_encrypted,
               ROUND(AVG(d.overall_score)) AS avg_score,
               COUNT(d.id) AS doc_count
        FROM health_checks hc
        LEFT JOIN customers c ON c.id = hc.customer_id
        LEFT JOIN pdf_documents d ON d.health_check_id = hc.id AND d.status = 'completed'
        WHERE hc.status = 'completed'
        GROUP BY hc.id
    ");
    $stmt->execute();
}
$hcs = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Decrypt customer names
foreach ($hcs as &$hc) {
    try { $hc['customer_name'] = $enc->decrypt($hc['customer_name_encrypted']); }
    catch (\Throwable $e) { $hc['customer_name'] = 'Customer #' . $hc['id']; }
    unset($hc['customer_name_encrypted']);
    $hc['avg_score'] = $hc['avg_score'] !== null ? (int)$hc['avg_score'] : null;
    $hc['doc_count'] = (int)$hc['doc_count'];
}
unset($hc);

// ── Fetch docs for a given HC ────────────────────────────────────────────────
$docStmt = $db->prepare("
    SELECT d.id, d.filename_encrypted, d.file_size, d.status, d.overall_score, d.created_at,
           pp.page_count, pp.pdf_version, pp.is_tagged, pp.is_encrypted,
           pp.is_linearized, pp.content_type,
           pa.passed_checks, pa.failed_checks, pa.warning_checks
    FROM pdf_documents d
    LEFT JOIN pdf_properties    pp ON pp.document_id = d.id
    LEFT JOIN pdf_accessibility pa ON pa.document_id = d.id
    WHERE d.health_check_id = ? AND d.status = 'completed'
    ORDER BY d.id
");

// ── Markdown generator ───────────────────────────────────────────────────────
function generateHCDocument(array $hc, array $docs): string {
    $ownerParts = array_filter([$hc['owner_first_name'] ?? '', $hc['owner_last_name'] ?? '']);
    $ownerName  = $ownerParts ? implode(' ', $ownerParts) : ($hc['owner_email'] ?: '—');

    $avgScore   = $hc['avg_score'];
    $scoreLabel = $avgScore !== null
        ? $avgScore . '/100 (' . ($avgScore >= 75 ? 'Good' : ($avgScore >= 50 ? 'Needs improvement' : 'Poor')) . ')'
        : 'Not yet scored';

    $lines = [
        '# Health Check: ' . $hc['name'],
        '',
        '## Summary',
        'This document is an automated summary of health check "' . $hc['name'] . '" created for ' . ($hc['customer_name'] ?: 'the customer') . '.',
        '',
        '## Metadata',
        '| Field | Value |',
        '|-------|-------|',
        '| Health Check ID | ' . $hc['id'] . ' |',
        '| Name | ' . $hc['name'] . ' |',
        '| Customer | ' . ($hc['customer_name'] ?: '—') . ' |',
        '| Status | ' . ($hc['status'] ?: '—') . ' |',
        '| DR Number | ' . ($hc['dr_number'] ?: '—') . ' |',
        '| Owner | ' . $ownerName . ' |',
        '| Created | ' . ($hc['created_at'] ?: '—') . ' |',
        '| Average Score | ' . $scoreLabel . ' |',
        '| Total Documents | ' . (count($docs) ?: $hc['doc_count']) . ' |',
    ];

    if (count($docs) > 0) {
        $lines[] = '';
        $lines[] = '## Documents Analysed (' . count($docs) . ')';

        foreach ($docs as $i => $d) {
            $docName  = $d['file_name'] ?: ('Document ' . ($i + 1));
            $docScore = $d['overall_score'] !== null ? (int)$d['overall_score'] : null;

            $lines[] = '';
            $lines[] = '### ' . $docName;
            $lines[] = '| Field | Value |';
            $lines[] = '|-------|-------|';
            $lines[] = '| Document ID | ' . $d['id'] . ' |';
            $lines[] = '| Status | ' . ($d['status'] ?: '—') . ' |';
            if ($docScore !== null)          $lines[] = '| Score | ' . $docScore . '/100 |';
            if (!empty($d['page_count']))    $lines[] = '| Pages | ' . $d['page_count'] . ' |';
            if (!empty($d['pdf_version']))   $lines[] = '| PDF Version | ' . $d['pdf_version'] . ' |';
            if (!empty($d['content_type']))  $lines[] = '| Content Type | ' . $d['content_type'] . ' |';
            if (isset($d['is_tagged']))      $lines[] = '| Tagged | ' . ($d['is_tagged'] ? 'Yes' : 'No') . ' |';
            if (isset($d['is_encrypted']))   $lines[] = '| Encrypted | ' . ($d['is_encrypted'] ? 'Yes' : 'No') . ' |';
            if (!empty($d['created_at']))    $lines[] = '| Uploaded | ' . $d['created_at'] . ' |';

            if ($d['passed_checks'] !== null || $d['failed_checks'] !== null) {
                $lines[] = '';
                $lines[] = '**Accessibility:** ' .
                    ($d['passed_checks'] ?? 0) . ' passed, ' .
                    ($d['failed_checks'] ?? 0) . ' failed, ' .
                    ($d['warning_checks'] ?? 0) . ' warnings';
            }
        }
    }

    $lines[] = '';
    $lines[] = '---';
    $lines[] = '*Generated by PDF Health Check app on ' . gmdate('c') . '*';

    return implode("\n", $lines);
}

// ── Build document list ───────────────────────────────────────────────────────
$documents = [];

foreach ($hcs as $hc) {
    try {
        $docStmt->execute([$hc['id']]);
        $rawDocs = $docStmt->fetchAll(PDO::FETCH_ASSOC);

        $docs = [];
        foreach ($rawDocs as $d) {
            try { $d['file_name'] = $enc->decrypt($d['filename_encrypted']); }
            catch (\Throwable $e) { $d['file_name'] = 'document_' . $d['id'] . '.pdf'; }
            unset($d['filename_encrypted']);
            $docs[] = $d;
        }

        $content  = generateHCDocument($hc, $docs);
        $safeName = strtolower(substr(preg_replace('/[^a-z0-9]+/i', '_', $hc['name']), 0, 60));
        $filename = 'hc_' . $hc['id'] . '_' . $safeName . '.md';

        $documents[] = [
            'hc_id'    => (int)$hc['id'],
            'hc_name'  => $hc['name'],
            'filename' => $filename,
            'content'  => $content,
        ];
    } catch (\Throwable $e) {
        // Skip this HC — log but don't abort the whole batch
        error_log('[yukon-sync] HC ' . $hc['id'] . ': ' . $e->getMessage());
    }
}

Response::success(['documents' => $documents]);
