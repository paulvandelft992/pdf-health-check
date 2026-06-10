<?php
/**
 * Crawler — discovers PDF URLs on given domains (with wildcard subdomain support)
 * and can proxy-download individual PDFs as base64 for the frontend pipeline.
 */
class Crawler {

    private int   $maxPdfs;
    private int   $maxDepth;
    private int   $timeout;         // seconds per page fetch
    private array $visited  = [];   // URL → true
    private array $pdfUrls  = [];   // discovered PDF entries
    private array $queue    = [];   // [{url, depth, seedHost, wildcard}]
    private int   $pagesCrawled = 0;
    public  array $debugLog = [];   // diagnostic steps for troubleshooting

    public function __construct(int $maxPdfs = 20, int $maxDepth = 3, int $timeout = 8) {
        $this->maxPdfs  = max(1, min(200, $maxPdfs));
        $this->maxDepth = max(1, min(10,  $maxDepth));
        $this->timeout  = max(3, min(30,  $timeout));
    }

    // ── Public: discover via search engine query ──────────────────────────────
    // Accepts any Google-style query, e.g. "site:philips.com filetype:pdf"
    //
    // Three complementary sources are always tried and merged:
    //   1. DuckDuckGo HTML — fast and catches recently-indexed PDFs
    //   2. robots.txt → sitemap walk — very reliable for corporate sites;
    //      previously only ran as a fallback but now always runs
    //   3. Common Crawl CDX API — free, no key, comprehensive historical index

    public function discoverViaSearch(string $query): array {
        $startTime = microtime(true);

        // Ensure filetype:pdf is in the query
        if (!str_contains(strtolower($query), 'filetype:pdf')) {
            $query = rtrim($query) . ' filetype:pdf';
        }
        $this->debugLog[] = "query: $query";

        $seen = [];  // url → true, for deduplication across sources
        $pdfs = [];

        // ── 1. DuckDuckGo ─────────────────────────────────────────────────────
        $ddgPdfs = $this->tryDuckDuckGo($query);
        $this->debugLog[] = 'ddg_pdfs: ' . count($ddgPdfs);
        foreach ($ddgPdfs as $p) {
            if (!isset($seen[$p['url']]) && count($pdfs) < $this->maxPdfs) {
                $seen[$p['url']] = true;
                $pdfs[] = $p;
            }
        }

        // ── 2. Sitemap (always — not just when DDG fails) ─────────────────────
        // Extract site:domain operators from the query
        $domains = $this->extractSiteDomains($query);
        $this->debugLog[] = 'site_domains: ' . implode(', ', $domains);

        foreach ($domains as $domain) {
            if (count($pdfs) >= $this->maxPdfs) break;
            $before = count($pdfs);
            $smPdfs = $this->sitemapPdfsForDomain($domain);
            foreach ($smPdfs as $p) {
                if (!isset($seen[$p['url']]) && count($pdfs) < $this->maxPdfs) {
                    $seen[$p['url']] = true;
                    $pdfs[] = $p;
                }
            }
            $this->debugLog[] = "sitemap($domain): +" . (count($pdfs) - $before) . ' pdfs';
        }

        // ── 3. Common Crawl CDX — fills in what DDG & sitemaps miss ──────────
        if (!empty($domains) && count($pdfs) < $this->maxPdfs) {
            $ccIndexId = $this->getLatestCCIndex();
            $this->debugLog[] = 'cc_index: ' . ($ccIndexId ?? 'unavailable');

            if ($ccIndexId) {
                foreach ($domains as $domain) {
                    if (count($pdfs) >= $this->maxPdfs) break;
                    $before  = count($pdfs);
                    $ccPdfs  = $this->tryCommonCrawl($domain, $ccIndexId);
                    foreach ($ccPdfs as $p) {
                        if (!isset($seen[$p['url']]) && count($pdfs) < $this->maxPdfs) {
                            $seen[$p['url']] = true;
                            $pdfs[] = $p;
                        }
                    }
                    $this->debugLog[] = "cc($domain): +" . (count($pdfs) - $before) . ' pdfs';
                }
            }
        }

        return [
            'pdfs'          => array_slice($pdfs, 0, $this->maxPdfs),
            'pages_crawled' => $this->pagesCrawled,
            'duration_ms'   => (int)((microtime(true) - $startTime) * 1000),
            '_debug'        => $this->debugLog,
        ];
    }

    // ── Extract site:domain operators from a search query ────────────────────

    private function extractSiteDomains(string $query): array {
        preg_match_all('/site:(\*\.)?([a-z0-9][a-z0-9\-\.]*\.[a-z]{2,})/i', $query, $m, PREG_SET_ORDER);
        $domains = [];
        foreach ($m as $match) {
            // Always store as bare domain (strip www.) — matchesDomain handles equivalence
            $domains[] = strtolower(preg_replace('/^www\./', '', $match[2]));
        }
        return array_unique($domains);
    }

    // ── Sitemap discovery for one domain (extracted from discoverViaSiteOperators) ─

    private function sitemapPdfsForDomain(string $domain): array {
        $this->pdfUrls = []; // reset for this domain pass; results are merged by caller
        $isWildcard    = false;
        $baseUrl       = 'https://' . $domain;
        $wwwUrl        = 'https://www.' . $domain;

        $sitemaps = $this->getRobotsSitemaps($baseUrl);
        if (empty($sitemaps)) {
            $sitemaps = $this->getRobotsSitemaps($wwwUrl);
        }
        if (empty($sitemaps)) {
            $sitemaps = [
                $wwwUrl  . '/sitemap.xml',
                $baseUrl . '/sitemap.xml',
                $wwwUrl  . '/sitemap_index.xml',
                $baseUrl . '/sitemap_index.xml',
                $wwwUrl  . '/sitemap-index.xml',
                $baseUrl . '/sitemaps/sitemap.xml',
            ];
        }

        foreach ($sitemaps as $smUrl) {
            if (count($this->pdfUrls) >= $this->maxPdfs) break;
            $this->crawlSitemap($smUrl, $domain, $isWildcard);
        }

        $result = $this->pdfUrls;
        $this->pdfUrls = []; // clear so BFS crawl mode still works cleanly
        return $result;
    }

    // ── Common Crawl CDX API ──────────────────────────────────────────────────
    // Free, no API key required.  Queries the CDX index for all URLs matching
    // domain/*.pdf captured in Common Crawl's most recent crawl.

    private function getLatestCCIndex(): ?string {
        static $cached = null;
        if ($cached !== null) return $cached;

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => 'https://index.commoncrawl.org/collinfo.json',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_USERAGENT      => 'PDFHealthCheckBot/1.0',
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_ENCODING       => '',
        ]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code !== 200 || !$body) {
            // Fall back to a hardcoded recent index if the registry is unreachable
            return $cached = 'CC-MAIN-2025-08';
        }
        $list = json_decode($body, true);
        $cached = $list[0]['id'] ?? 'CC-MAIN-2025-08';
        return $cached;
    }

    private function tryCommonCrawl(string $domain, string $indexId): array {
        // Query both bare domain and www. subdomain patterns
        $patterns = [
            $domain . '/*.pdf',
            'www.' . $domain . '/*.pdf',
        ];

        $pdfs = [];
        $seen = [];

        foreach ($patterns as $pattern) {
            if (count($pdfs) >= $this->maxPdfs) break;

            $apiUrl = 'https://index.commoncrawl.org/' . urlencode($indexId)
                    . '-index?url=' . urlencode($pattern)
                    . '&output=json&limit=500&fl=url,status';

            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL            => $apiUrl,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 20,
                CURLOPT_CONNECTTIMEOUT => 8,
                CURLOPT_USERAGENT      => 'PDFHealthCheckBot/1.0',
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_ENCODING       => '',
            ]);
            $body = curl_exec($ch);
            $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($code !== 200 || !$body) continue;

            // Response is JSONL (one JSON object per line)
            foreach (explode("\n", trim($body)) as $line) {
                $line = trim($line);
                if (!$line) continue;
                $data = json_decode($line, true);
                if (!is_array($data)) continue;
                $url    = $data['url'] ?? '';
                $status = (int)($data['status'] ?? 200);
                // Skip known-dead URLs (4xx/5xx) but allow unknown (status=0)
                if ($status >= 400 && $status < 600) continue;
                if ($url && $this->isPdfUrl($url) && !isset($seen[$url])) {
                    $seen[$url] = true;
                    $pdfs[]     = $this->makePdfEntry($url);
                    if (count($pdfs) >= $this->maxPdfs) break 2;
                }
            }
        }

        return $pdfs;
    }

    // ── DuckDuckGo strategy ───────────────────────────────────────────────────

    private function tryDuckDuckGo(string $query): array {
        $pdfs    = [];
        $seen    = [];
        $offset  = 0;
        $maxPages = 4;   // up to 4 DDG pages ≈ 120 results

        for ($page = 0; $page < $maxPages && count($pdfs) < $this->maxPdfs; $page++) {
            $html = $this->fetchDdgResults($query, $offset);
            if (!$html) break;

            $found = $this->parseDdgPdfs($html);
            if (empty($found)) break;

            foreach ($found as $url) {
                if (count($pdfs) >= $this->maxPdfs) break;
                if (!isset($seen[$url])) {
                    $seen[$url] = true;
                    $pdfs[]     = $this->makePdfEntry($url);
                }
            }

            if (count($found) < 5) break;   // likely last page
            $offset += 30;
        }

        return $pdfs;
    }

    private function fetchDdgResults(string $query, int $offset = 0): ?string {
        // Try GET first (more reliable than POST for server-side requests)
        $url = 'https://html.duckduckgo.com/html/?q=' . urlencode($query) . '&kl=en-us&kp=-1';
        if ($offset > 0) $url .= '&s=' . $offset . '&dc=' . $offset;

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            CURLOPT_HTTPHEADER     => [
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language: en-US,en;q=0.9',
                'Accept-Encoding: gzip, deflate, br',
                'Cache-Control: no-cache',
                'Pragma: no-cache',
            ],
            CURLOPT_ENCODING       => '',   // handle gzip automatically
        ]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $this->debugLog[] = "ddg_http: $code len:" . strlen((string)$body);
        if ($code !== 200 || !$body) return null;

        // Detect hard bot-block: DDG returns a page with no result links at all
        if (str_contains($body, 'id="no-results"') || str_contains($body, 'class="no-results"')) {
            $this->debugLog[] = 'ddg: no-results marker found';
            return null;
        }
        if (!str_contains($body, 'result__')) {
            $this->debugLog[] = 'ddg: no result__ classes — likely bot-block page';
            return null;
        }

        return $body;
    }

    private function parseDdgPdfs(string $html): array {
        libxml_use_internal_errors(true);
        $doc = new DOMDocument();
        @$doc->loadHTML(mb_convert_encoding($html, 'HTML-ENTITIES', 'UTF-8'));
        libxml_clear_errors();

        $urls = [];
        foreach ($doc->getElementsByTagName('a') as $a) {
            $href = trim($a->getAttribute('href'));
            if (!$href) continue;

            // DDG wraps external links via redirect: /l/?uddg=<encoded-url>
            if (str_contains($href, 'uddg=')) {
                $decoded = $this->decodeDdgUrl($href);
                if ($decoded && $this->isPdfUrl($decoded) && preg_match('#^https?://#i', $decoded)) {
                    $urls[] = $decoded;
                }
                continue;
            }

            // Direct https link (some DDG variants / future formats)
            if (preg_match('#^https?://#i', $href) && $this->isPdfUrl($href)) {
                $urls[] = $href;
            }
        }

        // Scan result URL display spans — these often contain the bare URL as text
        // and work regardless of DDG's link-wrapping format.
        foreach ($doc->getElementsByTagName('span') as $span) {
            $cls = $span->getAttribute('class');
            if (!$cls) continue;
            // Match any DDG result-URL class (result__url, result__extras__url, etc.)
            if (!preg_match('/result[_a-z]*url/i', $cls)) continue;
            $txt = trim($span->textContent);
            if (!$txt) continue;
            if (!preg_match('#^https?://#i', $txt)) $txt = 'https://' . $txt;
            if ($this->isPdfUrl($txt)) $urls[] = $txt;
        }

        return array_unique($urls);
    }

    private function decodeDdgUrl(string $href): ?string {
        // href may be "//duckduckgo.com/l/?uddg=..." or "/l/?uddg=..."
        if (!str_starts_with($href, 'http')) {
            $href = 'https:' . (str_starts_with($href, '//') ? $href : '//' . ltrim($href, '/'));
        }
        $query = parse_url($href, PHP_URL_QUERY) ?: '';
        parse_str($query, $params);
        $raw = $params['uddg'] ?? '';
        if (!$raw) return null;

        // Current DDG format: uddg is simply URL-encoded (urldecode gives the real URL).
        $decoded = urldecode($raw);
        if (preg_match('#^https?://#i', $decoded)) {
            return $decoded;
        }

        // Older DDG format: uddg was URL-encoded then base64url-encoded.
        $b64    = strtr($decoded, '-_', '+/');
        $padded = str_pad($b64, strlen($b64) + (4 - strlen($b64) % 4) % 4, '=');
        $b64dec = base64_decode($padded, true);
        if ($b64dec !== false) {
            $url = str_starts_with($b64dec, 'http') ? $b64dec : urldecode($b64dec);
            if (preg_match('#^https?://#i', $url)) return $url;
        }

        return null;
    }


    /**
     * Fetch robots.txt and return all Sitemap: directive URLs.
     */
    private function getRobotsSitemaps(string $baseUrl): array {
        $robotsUrl = rtrim($baseUrl, '/') . '/robots.txt';
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $robotsUrl,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; PDFHealthCheckBot/1.0)',
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_FOLLOWLOCATION => true,
        ]);
        $body  = curl_exec($ch);
        $code  = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $cerr  = curl_error($ch);
        curl_close($ch);

        if ($code !== 200 || !$body) return [];

        $sitemaps = [];
        foreach (explode("\n", $body) as $line) {
            $line = trim($line);
            if (stripos($line, 'Sitemap:') === 0) {
                $smUrl = trim(substr($line, 8));
                if ($smUrl) $sitemaps[] = $smUrl;
            }
        }
        return $sitemaps;
    }

    private function makePdfEntry(string $url): array {
        $path     = parse_url($url, PHP_URL_PATH) ?? '';
        $filename = basename(urldecode($path)) ?: 'document.pdf';
        if (!preg_match('/\.pdf$/i', $filename)) $filename .= '.pdf';
        return ['url' => $url, 'filename' => $filename];
    }

    // ── Public: discover PDF URLs (BFS page crawl) ────────────────────────────

    public function discover(array $domains): array {
        $startTime = microtime(true);

        foreach ($domains as $raw) {
            $domain = trim($raw);
            if (!$domain) continue;

            $isWildcard = str_starts_with($domain, '*.');
            $base       = $isWildcard ? substr($domain, 2) : $domain;
            if (!preg_match('#^https?://#i', $base)) {
                $base = 'https://' . $base;
            }
            $seedHost = strtolower(parse_url($base, PHP_URL_HOST) ?: $base);
            $this->queue[] = [
                'url'      => $base,
                'depth'    => 0,
                'seedHost' => $seedHost,
                'wildcard' => $isWildcard,
            ];
        }

        while (!empty($this->queue) && count($this->pdfUrls) < $this->maxPdfs) {
            $item = array_shift($this->queue);
            $this->crawlUrl($item['url'], $item['depth'], $item['seedHost'], $item['wildcard']);
        }

        return [
            'pdfs'          => array_slice($this->pdfUrls, 0, $this->maxPdfs),
            'pages_crawled' => $this->pagesCrawled,
            'duration_ms'   => (int)((microtime(true) - $startTime) * 1000),
        ];
    }

    // ── Public: download one PDF and return base64 ───────────────────────────

    public function fetchPdf(string $url): array {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 5,
            CURLOPT_TIMEOUT        => 60,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; PDFHealthCheckBot/1.0)',
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_ENCODING       => '',   // accept gzip/deflate
        ]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $type = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        curl_close($ch);

        if (!$body || $code !== 200) {
            throw new RuntimeException("Failed to download PDF (HTTP {$code})");
        }
        // Some servers send PDFs with generic content types — don't reject on MIME
        // but do reject obvious HTML error pages
        if (str_contains(strtolower($type), 'text/html') && !str_contains(substr($body, 0, 10), '%PDF')) {
            throw new RuntimeException("URL did not return a PDF document");
        }

        $path     = parse_url($url, PHP_URL_PATH) ?? '';
        $filename = basename(urldecode($path)) ?: 'document.pdf';
        if (!preg_match('/\.pdf$/i', $filename)) $filename .= '.pdf';

        return [
            'data' => base64_encode($body),
            'name' => $filename,
            'size' => strlen($body),
        ];
    }

    // ── Private: crawl one URL ────────────────────────────────────────────────

    private function crawlUrl(string $url, int $depth, string $seedHost, bool $isWildcard): void {
        $url = strtok($url, '#') ?: '';  // strip fragments
        if (!$url || isset($this->visited[$url])) return;
        $this->visited[$url] = true;

        if (count($this->pdfUrls) >= $this->maxPdfs) return;

        // Direct PDF link — no HTML fetch needed
        if ($this->isPdfUrl($url)) {
            $this->addPdf($url);
            return;
        }

        if ($depth >= $this->maxDepth) return;

        // At depth 0: try robots.txt sitemaps first, then /sitemap.xml
        if ($depth === 0) {
            $parsed  = parse_url($url);
            $base    = ($parsed['scheme'] ?? 'https') . '://' . ($parsed['host'] ?? '');
            $sitemaps = $this->getRobotsSitemaps($base);
            if (empty($sitemaps)) {
                $sitemaps = [$base . '/sitemap.xml'];
            }
            foreach ($sitemaps as $smUrl) {
                $this->crawlSitemap($smUrl, $seedHost, $isWildcard);
                if (count($this->pdfUrls) >= $this->maxPdfs) return;
            }
        }

        // Fetch and parse HTML
        [$html, $finalUrl] = $this->fetchHtml($url);
        if (!$html) return;
        $this->pagesCrawled++;

        $base  = $finalUrl ?: $url;
        $links = $this->extractLinks($html, $base);

        foreach ($links as $link) {
            if (count($this->pdfUrls) >= $this->maxPdfs) break;
            $link = strtok($link, '#') ?: '';
            if (!$link || isset($this->visited[$link])) continue;

            $linkHost = strtolower(parse_url($link, PHP_URL_HOST) ?? '');
            if (!$this->matchesDomain($linkHost, $seedHost, $isWildcard)) continue;

            if ($this->isPdfUrl($link)) {
                $this->visited[$link] = true;
                $this->addPdf($link);
            } else {
                $this->queue[] = [
                    'url'      => $link,
                    'depth'    => $depth + 1,
                    'seedHost' => $seedHost,
                    'wildcard' => $isWildcard,
                ];
            }
        }
    }

    // ── Private: sitemap ─────────────────────────────────────────────────────

    private function crawlSitemap(string $url, string $seedHost, bool $isWildcard): void {
        if (isset($this->visited[$url])) return;
        $this->visited[$url] = true;

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; PDFHealthCheckBot/1.0)',
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_ENCODING       => '',   // handle gzip sitemaps automatically
        ]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code !== 200 || !$body) return;

        // Some sitemaps are served gzipped even without .gz extension
        if (!str_starts_with($body, '<') && !str_starts_with($body, "\xef\xbb\xbf<")) {
            $decompressed = @gzdecode($body);
            if ($decompressed && str_starts_with(ltrim($decompressed), '<')) {
                $body = $decompressed;
            }
        }

        libxml_use_internal_errors(true);
        $xml = simplexml_load_string($body);
        libxml_clear_errors();
        if (!$xml) return;

        // Handle sitemap index (list of sitemaps) and regular sitemaps
        foreach ($xml->sitemap ?? [] as $sm) {
            $smLoc = (string)($sm->loc ?? '');
            if ($smLoc && !isset($this->visited[$smLoc])) {
                $this->crawlSitemap($smLoc, $seedHost, $isWildcard);
                if (count($this->pdfUrls) >= $this->maxPdfs) return;
            }
        }
        foreach ($xml->url ?? [] as $urlEl) {
            $loc   = (string)($urlEl->loc ?? '');
            if (!$loc) continue;
            $lHost = strtolower(parse_url($loc, PHP_URL_HOST) ?? '');
            if (!$this->matchesDomain($lHost, $seedHost, $isWildcard)) continue;
            if ($this->isPdfUrl($loc) && !isset($this->visited[$loc])) {
                $this->visited[$loc] = true;
                $this->addPdf($loc);
                if (count($this->pdfUrls) >= $this->maxPdfs) return;
            }
        }
    }

    // ── Private: helpers ──────────────────────────────────────────────────────

    private function addPdf(string $url): void {
        $this->pdfUrls[] = $this->makePdfEntry($url);
    }

    private function isPdfUrl(string $url): bool {
        $lower = strtolower($url);
        // 1. Path ends with .pdf  (most common — e.g. /files/report.pdf)
        $path = strtolower(parse_url($url, PHP_URL_PATH) ?? '');
        if (str_ends_with($path, '.pdf')) return true;
        // 2. Query string contains filetype=pdf or format=pdf
        $query = strtolower(parse_url($url, PHP_URL_QUERY) ?? '');
        if (preg_match('/(?:^|&)(?:filetype|format|type)=pdf(?:&|$)/', $query)) return true;
        // 3. URL contains /pdf/ path segment (common CMS pattern)
        if (preg_match('#/pdf/#i', $path)) return true;
        return false;
    }

    private function matchesDomain(string $host, string $seedHost, bool $isWildcard): bool {
        if (!$host) return false;

        // Normalise: strip www. from both sides for comparison so that
        // seedHost="philips.nl" matches "www.philips.nl" and vice-versa.
        $bareHost = preg_replace('/^www\./', '', $host);
        $bareSeed = preg_replace('/^www\./', '', $seedHost);

        if ($isWildcard) {
            // *.example.com matches example.com AND any sub.example.com
            return $bareHost === $bareSeed || str_ends_with($bareHost, '.' . $bareSeed);
        }
        // Exact non-wildcard: allow www. / non-www. equivalence
        return $bareHost === $bareSeed;
    }

    private function fetchHtml(string $url): array {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 5,
            CURLOPT_TIMEOUT        => $this->timeout,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; PDFHealthCheckBot/1.0)',
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_HTTPHEADER     => ['Accept: text/html,application/xhtml+xml,*/*'],
            CURLOPT_ENCODING       => '',
        ]);
        $body     = curl_exec($ch);
        $code     = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $type     = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $finalUrl = (string)curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
        curl_close($ch);

        if (!$body || $code !== 200) return [null, null];
        if (!str_contains(strtolower($type), 'html')) return [null, null];
        return [$body, $finalUrl ?: null];
    }

    private function extractLinks(string $html, string $baseUrl): array {
        libxml_use_internal_errors(true);
        $doc = new DOMDocument();
        @$doc->loadHTML(mb_convert_encoding($html, 'HTML-ENTITIES', 'UTF-8'));
        libxml_clear_errors();

        $parsed   = parse_url($baseUrl);
        $scheme   = $parsed['scheme']   ?? 'https';
        $host     = $parsed['host']     ?? '';
        $basePath = rtrim(dirname($parsed['path'] ?? '/'), '/');

        $links = [];
        foreach ($doc->getElementsByTagName('a') as $a) {
            $href = trim($a->getAttribute('href'));
            if (!$href)                              continue;
            if (str_starts_with($href, '#'))         continue;
            if (str_starts_with($href, 'mailto:'))   continue;
            if (str_starts_with($href, 'javascript:'))continue;
            if (str_starts_with($href, 'tel:'))      continue;

            if (str_starts_with($href, '//')) {
                $href = $scheme . ':' . $href;
            } elseif (str_starts_with($href, '/')) {
                $href = $scheme . '://' . $host . $href;
            } elseif (!preg_match('#^https?://#i', $href)) {
                $href = $scheme . '://' . $host . $basePath . '/' . $href;
            }
            $links[] = $href;
        }
        return array_unique($links);
    }
}
