<?php
/**
 * Crawl API
 *
 * POST /api/crawl/discover   — crawl domains, return discovered PDF URLs
 * GET  /api/crawl/fetch?url= — download one PDF and return as base64
 */
require_once __DIR__ . '/../lib/Crawler.php';

$action = $_ROUTE_ACTION ?? '';

// ── POST /api/crawl/discover ──────────────────────────────────────────────────
if ($method === 'POST' && $action === 'discover') {
    $body        = json_decode(file_get_contents('php://input'), true) ?? [];
    $maxPdfs     = max(1,  min(200, (int)($body['max_pdfs']  ?? 20)));
    $searchQuery = trim($body['search_query'] ?? '');

    $crawler = new Crawler($maxPdfs);

    if ($searchQuery !== '') {
        // ── Search-engine mode: query DuckDuckGo ──────────────────────────────
        $result = $crawler->discoverViaSearch($searchQuery);
    } else {
        // ── Page-crawl mode: BFS over given domains ────────────────────────────
        $domains  = array_values(array_filter(array_map('trim', (array)($body['domains']   ?? []))));
        $maxDepth = max(1,  min(10,  (int)($body['max_depth'] ?? 3)));
        $timeout  = max(3,  min(30,  (int)($body['timeout']   ?? 8)));

        if (empty($domains)) Response::error('domains array or search_query is required');

        $crawler  = new Crawler($maxPdfs, $maxDepth, $timeout);
        $result   = $crawler->discover($domains);
    }

    Response::success($result);
    exit;
}

// ── GET /api/crawl/fetch?url= ─────────────────────────────────────────────────
if ($method === 'GET' && $action === 'fetch') {
    $url = trim($_GET['url'] ?? '');
    if (!$url)                              Response::error('url parameter is required');
    if (!preg_match('#^https?://#i', $url)) Response::error('url must start with http:// or https://');

    $crawler = new Crawler();
    try {
        $result = $crawler->fetchPdf($url);
        Response::success($result);
    } catch (RuntimeException $e) {
        Response::error($e->getMessage(), 422);
    }
    exit;
}

Response::error('Method not allowed', 405);
