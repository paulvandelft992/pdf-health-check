/**
 * Client-side PDF crawler for Electron main process.
 * Runs on the user's machine — full outbound internet access, no CORS.
 *
 * Hard limits prevent infinite crawling:
 *   - MAX_RUNTIME_MS   : overall discover() wall-clock limit (90 s)
 *   - MAX_HTML_PAGES   : max HTML pages fetched via BFS (30)
 *   - MAX_SITEMAP_URLS : max <loc> entries scanned per sitemap (2 000)
 */

const https = require('https');
const http  = require('http');
const zlib  = require('zlib');
const { URL } = require('url');

const MAX_RUNTIME_MS   = 90_000;   // 90 seconds hard wall-clock
const MAX_HTML_PAGES   = 30;       // BFS HTML pages cap
const MAX_SITEMAP_URLS = 2_000;    // sitemap <loc> entries cap per run

// ── Low-level HTTP helper ─────────────────────────────────────────────────────

function fetchRaw(urlStr, options = {}) {
  return new Promise((resolve) => {
    let parsedUrl;
    try { parsedUrl = new URL(urlStr); } catch { return resolve(null); }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return resolve(null);

    const mod       = parsedUrl.protocol === 'https:' ? https : http;
    const timeoutMs = options.timeoutMs || 10000;

    const reqOpts = {
      hostname: parsedUrl.hostname,
      port:     parsedUrl.port || undefined,
      path:     (parsedUrl.pathname || '/') + (parsedUrl.search || ''),
      method:   options.method || 'GET',
      headers: {
        'User-Agent':      options.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          options.accept   || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        ...(options.headers || {}),
      },
      rejectUnauthorized: false,
    };

    const redirects = options._redirects || 0;

    const req = mod.request(reqOpts, (res) => {
      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects >= 5) return resolve(null);
        let nextUrl;
        try { nextUrl = new URL(res.headers.location, urlStr).href; } catch { return resolve(null); }
        return resolve(fetchRaw(nextUrl, { ...options, _redirects: redirects + 1 }));
      }

      const enc = (res.headers['content-encoding'] || '').toLowerCase();
      let stream = res;
      try {
        if      (enc === 'gzip')    stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br')      stream = res.pipe(zlib.createBrotliDecompress());
      } catch { stream = res; }

      const chunks = [];
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body, text: body.toString('utf8') });
      });
      stream.on('error', () => resolve(null));
    });

    req.setTimeout(timeoutMs, () => { req.destroy(); });
    req.on('error', () => resolve(null));
    if (options.postData) req.write(options.postData);
    req.end();
  });
}

// ── Crawler class ─────────────────────────────────────────────────────────────

class Crawler {
  constructor(maxPdfs = 20, maxDepth = 3, timeoutSec = 8) {
    this.maxPdfs      = Math.max(1, Math.min(200, maxPdfs));
    this.maxDepth     = Math.max(1, Math.min(10,  maxDepth));
    this.timeoutMs    = Math.max(3000, Math.min(30000, timeoutSec * 1000));
    this.visited      = new Set();
    this.pdfUrls      = [];   // [{ url, filename }]
    this.queue        = [];   // [{ url, depth, seedHost, wildcard }]
    this.pagesCrawled = 0;
    this.sitemapUrlsScanned = 0;
    this._deadline    = 0;    // set at start of each discover/discoverViaSearch call
    this.debugLog     = [];   // human-readable trace for diagnostics
  }

  _timedOut() { return Date.now() > this._deadline; }

  // ── Public: search-engine mode ──────────────────────────────────────────────

  async discoverViaSearch(query) {
    const start = Date.now();
    this._deadline = start + MAX_RUNTIME_MS;

    if (!query.toLowerCase().includes('filetype:pdf')) {
      query = query.trimEnd() + ' filetype:pdf';
    }

    // 1. Try DuckDuckGo
    let pdfs = await this._tryDuckDuckGo(query);

    // 2. Try Bing if DDG found nothing (Bing supports filetype: more reliably)
    if (pdfs.length === 0 && !this._timedOut()) {
      pdfs = await this._tryBing(query);
    }

    // 3. Fallback: robots.txt → sitemap walk for every site: operator
    if (pdfs.length === 0 && !this._timedOut()) {
      pdfs = await this._discoverViaSiteOperators(query);
    }

    return {
      pdfs:          pdfs.slice(0, this.maxPdfs),
      pages_crawled: this.pagesCrawled,
      duration_ms:   Date.now() - start,
    };
  }

  // ── Public: domain crawl mode ───────────────────────────────────────────────

  async discover(domains) {
    const start = Date.now();
    this._deadline = start + MAX_RUNTIME_MS;

    for (const raw of domains) {
      const domain = raw.trim();
      if (!domain) continue;

      const isWildcard = domain.startsWith('*.');
      let base = isWildcard ? domain.slice(2) : domain;
      if (!/^https?:\/\//i.test(base)) base = 'https://' + base;

      let seedHost;
      try { seedHost = new URL(base).hostname.toLowerCase(); } catch { continue; }

      // Always queue the canonical URL
      this.queue.push({ url: base, depth: 0, seedHost, wildcard: isWildcard });

      // For wildcard domains (*.example.com): also seed www.example.com explicitly.
      // Most large sites serve their real sitemap from www., not the bare domain.
      if (isWildcard && !seedHost.startsWith('www.')) {
        const wwwBase = 'https://www.' + seedHost;
        this.queue.push({ url: wwwBase, depth: 0, seedHost, wildcard: isWildcard });
      }
    }

    while (this.queue.length > 0 && this.pdfUrls.length < this.maxPdfs && !this._timedOut()) {
      const item = this.queue.shift();
      await this._crawlUrl(item.url, item.depth, item.seedHost, item.wildcard);
    }

    return {
      pdfs:          this.pdfUrls.slice(0, this.maxPdfs),
      pages_crawled: this.pagesCrawled,
      duration_ms:   Date.now() - start,
    };
  }

  // ── Public: fetch a single PDF and return base64 ────────────────────────────

  async fetchPdf(url) {
    const res = await fetchRaw(url, {
      timeoutMs: 60000,
      userAgent: 'Mozilla/5.0 (compatible; PDFHealthCheckBot/1.0)',
      accept:    'application/pdf,*/*',
    });

    if (!res || res.status !== 200) {
      throw new Error(`Failed to download PDF (HTTP ${res ? res.status : 0})`);
    }

    const ct = (res.headers['content-type'] || '').toLowerCase();
    if (ct.includes('text/html') && !res.body.slice(0, 10).toString().includes('%PDF')) {
      throw new Error('URL did not return a PDF document');
    }

    let filename;
    try {
      const p = new URL(url).pathname;
      filename = decodeURIComponent(p.split('/').pop()) || 'document.pdf';
    } catch { filename = 'document.pdf'; }
    if (!/\.pdf$/i.test(filename)) filename += '.pdf';

    return { data: res.body.toString('base64'), name: filename, size: res.body.length };
  }

  // ── Private: DuckDuckGo ─────────────────────────────────────────────────────

  async _tryDuckDuckGo(query) {
    const pdfs = [];
    const seen = new Set();

    for (let page = 0, offset = 0;
         page < 4 && pdfs.length < this.maxPdfs && !this._timedOut();
         page++, offset += 30) {
      const html = await this._fetchDdgPage(query, offset);
      if (!html) break;

      const found = this._parseDdgPdfs(html);
      this.debugLog.push(`DDG page ${page}: parsed ${found.length} PDF URLs: ${found.slice(0,3).join(', ')}`);
      if (found.length === 0) break;

      for (const url of found) {
        if (pdfs.length >= this.maxPdfs) break;
        if (!seen.has(url)) { seen.add(url); pdfs.push(this._makePdfEntry(url)); }
      }

      if (found.length < 5) break; // last page
    }

    return pdfs;
  }

  async _tryBing(query) {
    const pdfs = [];
    const seen = new Set();

    // Bing supports up to 50 results per page; try 2 pages
    for (let first = 1; first <= 51 && pdfs.length < this.maxPdfs && !this._timedOut(); first += 50) {
      const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=50&first=${first}&setlang=en`;
      const res = await fetchRaw(url, {
        timeoutMs: 15000,
        accept:    'text/html,application/xhtml+xml,*/*;q=0.9',
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control':   'no-cache',
        },
      });

      this.debugLog.push(`Bing fetch first=${first}: HTTP ${res?.status ?? 0}, body=${res?.body?.length ?? 0} bytes`);
      if (!res || res.status !== 200) break;

      // Extract direct PDF hrefs from Bing results
      const found = [];
      const hrefRe = /href="(https?:\/\/[^"]+\.pdf[^"]*)"/gi;
      let m;
      while ((m = hrefRe.exec(res.text)) !== null) {
        const u = m[1].split('"')[0]; // trim anything after stray quote
        if (!seen.has(u)) { seen.add(u); found.push(u); }
      }

      // Also check cite= attributes which Bing uses for result URLs
      const citeRe = /\bcite="(https?:\/\/[^"]+\.pdf[^"]*)"/gi;
      while ((m = citeRe.exec(res.text)) !== null) {
        const u = m[1];
        if (!seen.has(u)) { seen.add(u); found.push(u); }
      }

      this.debugLog.push(`Bing page first=${first}: found ${found.length} PDF URLs: ${found.slice(0,3).join(', ')}`);
      for (const u of found) {
        if (pdfs.length >= this.maxPdfs) break;
        pdfs.push(this._makePdfEntry(u));
      }

      if (found.length === 0) break;
    }

    return pdfs;
  }

  async _fetchDdgPage(query, offset = 0) {
    let url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=en-us&kp=-1`;
    if (offset > 0) url += `&s=${offset}&dc=${offset}`;

    const res = await fetchRaw(url, {
      timeoutMs: 15000,
      accept:    'text/html,application/xhtml+xml,*/*;q=0.9',
      headers: { 'Referer': 'https://duckduckgo.com/', 'Cache-Control': 'no-cache' },
    });

    this.debugLog.push(`DDG fetch offset=${offset}: HTTP ${res?.status ?? 0}, body=${res?.body?.length ?? 0} bytes`);

    if (!res || res.status !== 200) return null;

    // Log a snippet to see what DDG actually returned
    const snippet = res.text.slice(0, 500).replace(/\s+/g, ' ');
    this.debugLog.push(`DDG snippet: ${snippet}`);

    // Detect bot-block / CAPTCHA — be lenient, just check there's some content
    if (res.body.length < 1000) {
      this.debugLog.push('DDG response too short — likely blocked');
      return null;
    }

    return res.text;
  }

  _parseDdgPdfs(html) {
    const urls = [];
    const seen = new Set();

    const add = (u) => {
      if (u && !seen.has(u) && this._isPdfUrl(u) && /^https?:\/\//i.test(u)) {
        seen.add(u); urls.push(u);
      }
    };

    // uddg= encoded redirect links
    const uddgRe = /href="[^"]*[?&]uddg=([^"&]+)/gi;
    let m;
    const uddgSamples = [];
    while ((m = uddgRe.exec(html)) !== null) {
      const decoded = this._decodeDdgUddg(m[1]);
      if (uddgSamples.length < 3) uddgSamples.push(`raw=${m[1].slice(0,40)} → ${decoded}`);
      add(decoded);
    }
    if (uddgSamples.length) this.debugLog.push(`DDG uddg samples: ${uddgSamples.join(' | ')}`);
    else this.debugLog.push('DDG: no uddg= links found in HTML');

    // Plain href links ending in .pdf
    const hrefRe = /href="(https?:\/\/[^"]+\.pdf[^"]*)"/gi;
    while ((m = hrefRe.exec(html)) !== null) add(m[1]);

    // result__url spans (plain-text URL shown under results)
    const spanRe = /<[^>]+class="[^"]*result__url[^"]*"[^>]*>([^<]+)<\/span>/gi;
    const spanSamples = [];
    while ((m = spanRe.exec(html)) !== null) {
      let txt = m[1].trim();
      if (spanSamples.length < 3) spanSamples.push(txt);
      if (!txt) continue;
      if (!/^https?:\/\//i.test(txt)) txt = 'https://' + txt;
      add(txt);
    }
    if (spanSamples.length) this.debugLog.push(`DDG result__url samples: ${spanSamples.join(' | ')}`);
    else this.debugLog.push('DDG: no result__url spans found');

    return urls;
  }

  _decodeDdgUddg(raw) {
    try {
      // DDG uddg is usually a URL-encoded URL — try that first
      const urlDecoded = decodeURIComponent(raw);
      if (/^https?:\/\//i.test(urlDecoded)) return urlDecoded;

      // Fallback: try base64url decoding
      const b64    = raw.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
      const decoded = Buffer.from(padded, 'base64').toString('utf8');
      const url = /^https?:\/\//i.test(decoded) ? decoded : decodeURIComponent(decoded);
      return /^https?:\/\//i.test(url) ? url : null;
    } catch { return null; }
  }

  // ── Private: site: operator fallback ───────────────────────────────────────

  async _discoverViaSiteOperators(query) {
    const re = /site:(\*\.)?([a-z0-9][a-z0-9\-\.]*\.[a-z]{2,})/gi;
    let m;
    while ((m = re.exec(query)) !== null && this.pdfUrls.length < this.maxPdfs && !this._timedOut()) {
      const isWildcard = !!m[1];
      const domain     = m[2].toLowerCase();
      const baseUrl    = 'https://' + domain;

      let sitemaps = await this._getRobotsSitemaps(baseUrl);

      // Also try www. variant if bare domain had no Sitemap: lines
      if (sitemaps.length === 0) {
        const wwwBase = 'https://www.' + domain;
        sitemaps = await this._getRobotsSitemaps(wwwBase);
      }

      if (sitemaps.length === 0) {
        sitemaps = [
          baseUrl + '/sitemap.xml',
          'https://www.' + domain + '/sitemap.xml',
          baseUrl + '/sitemap_index.xml',
        ];
      }

      for (const smUrl of sitemaps) {
        if (this.pdfUrls.length >= this.maxPdfs || this._timedOut()) break;
        await this._crawlSitemap(smUrl, domain, isWildcard);
      }
    }

    return this.pdfUrls;
  }

  async _getRobotsSitemaps(baseUrl) {
    if (this._timedOut()) return [];
    const robotsUrl = baseUrl.replace(/\/$/, '') + '/robots.txt';
    const res = await fetchRaw(robotsUrl, {
      timeoutMs: 8000,
      userAgent: 'Mozilla/5.0 (compatible; PDFHealthCheckBot/1.0)',
      accept:    'text/plain,*/*',
    });

    if (!res || res.status !== 200) {
      this.debugLog.push(`robots.txt ${robotsUrl} → HTTP ${res?.status ?? 0}`);
      return [];
    }

    const sitemaps = [];
    for (const line of res.text.split('\n')) {
      const t = line.trim();
      if (/^sitemap:/i.test(t)) {
        const sm = t.slice('sitemap:'.length).trim();
        if (sm) sitemaps.push(sm);
      }
    }
    this.debugLog.push(`robots.txt ${robotsUrl} → HTTP 200, sitemaps: [${sitemaps.join(', ') || 'none'}]`);
    return sitemaps;
  }

  // ── Private: sitemap walker ─────────────────────────────────────────────────

  async _crawlSitemap(url, seedHost, isWildcard) {
    if (this.visited.has(url) || this._timedOut()) return;
    if (this.sitemapUrlsScanned >= MAX_SITEMAP_URLS) return;
    this.visited.add(url);

    const res = await fetchRaw(url, {
      timeoutMs: 10000,
      userAgent: 'Mozilla/5.0 (compatible; PDFHealthCheckBot/1.0)',
      accept:    'application/xml,text/xml,*/*',
    });

    if (!res || res.status !== 200) {
      this.debugLog.push(`sitemap ${url} → HTTP ${res?.status ?? 0}`);
      return;
    }
    this.debugLog.push(`sitemap ${url} → HTTP 200, ${res.body.length} bytes`);

    let text = res.text;

    // Decompress if gzip-compressed but served without content-encoding header
    if (!text.trimStart().startsWith('<')) {
      try { text = zlib.gunzipSync(res.body).toString('utf8'); } catch {}
    }

    if (!text.includes('<')) return;

    // Nested sitemap index: <sitemap><loc>…</loc></sitemap>
    const sitemapLocRe = /<sitemap>[\s\S]*?<loc>([\s\S]*?)<\/loc>/gi;
    let m;
    while ((m = sitemapLocRe.exec(text)) !== null) {
      const smUrl = m[1].trim();
      if (smUrl && !this.visited.has(smUrl) && !this._timedOut()) {
        await this._crawlSitemap(smUrl, seedHost, isWildcard);
        if (this.pdfUrls.length >= this.maxPdfs) return;
      }
    }

    // Regular entries: <url><loc>…</loc></url>
    const urlLocRe = /<url>[\s\S]*?<loc>([\s\S]*?)<\/loc>/gi;
    while ((m = urlLocRe.exec(text)) !== null) {
      if (this._timedOut() || this.sitemapUrlsScanned >= MAX_SITEMAP_URLS) return;
      this.sitemapUrlsScanned++;
      const loc = m[1].trim();
      if (!loc || this.visited.has(loc)) continue;
      let locHost;
      try { locHost = new URL(loc).hostname.toLowerCase(); } catch { continue; }
      if (!this._matchesDomain(locHost, seedHost, isWildcard)) continue;
      if (this._isPdfUrl(loc)) {
        this.visited.add(loc);
        this._addPdf(loc);
        if (this.pdfUrls.length >= this.maxPdfs) return;
      }
    }

    // Also scan bare <loc> tags not wrapped in <url> (some generators omit <url>)
    const rawLocRe = /<loc>(https?:\/\/[^<]+)<\/loc>/gi;
    while ((m = rawLocRe.exec(text)) !== null) {
      if (this._timedOut() || this.sitemapUrlsScanned >= MAX_SITEMAP_URLS) return;
      this.sitemapUrlsScanned++;
      const loc = m[1].trim();
      if (!loc || this.visited.has(loc) || !this._isPdfUrl(loc)) continue;
      let locHost;
      try { locHost = new URL(loc).hostname.toLowerCase(); } catch { continue; }
      if (!this._matchesDomain(locHost, seedHost, isWildcard)) continue;
      this.visited.add(loc);
      this._addPdf(loc);
      if (this.pdfUrls.length >= this.maxPdfs) return;
    }
  }

  // ── Private: BFS page crawler ───────────────────────────────────────────────

  async _crawlUrl(url, depth, seedHost, isWildcard) {
    if (this._timedOut()) return;
    if (this.pagesCrawled >= MAX_HTML_PAGES) return;

    // Strip fragment
    try { const u = new URL(url); u.hash = ''; url = u.href; } catch { return; }
    if (!url || this.visited.has(url)) return;
    this.visited.add(url);

    if (this.pdfUrls.length >= this.maxPdfs) return;

    if (this._isPdfUrl(url)) { this._addPdf(url); return; }
    if (depth >= this.maxDepth) return;

    // At depth 0: robots.txt → sitemaps (most reliable for large sites)
    if (depth === 0) {
      let baseUrl;
      try { const u = new URL(url); baseUrl = u.protocol + '//' + u.hostname; } catch { return; }

      let sitemaps = await this._getRobotsSitemaps(baseUrl);

      // If the bare domain had no sitemaps, also try www. variant (and vice-versa)
      if (sitemaps.length === 0) {
        const parsed = new URL(baseUrl);
        const altHost = parsed.hostname.startsWith('www.')
          ? parsed.hostname.slice(4)
          : 'www.' + parsed.hostname;
        const altBase = parsed.protocol + '//' + altHost;
        sitemaps = await this._getRobotsSitemaps(altBase);
      }

      if (sitemaps.length === 0) sitemaps = [baseUrl + '/sitemap.xml', baseUrl.replace('://', '://www.') + '/sitemap.xml'];

      for (const smUrl of sitemaps) {
        if (this._timedOut() || this.pdfUrls.length >= this.maxPdfs) return;
        await this._crawlSitemap(smUrl, seedHost, isWildcard);
      }

      this.debugLog.push(`after sitemaps: ${this.pdfUrls.length} PDFs found, ${this.sitemapUrlsScanned} URLs scanned`);

      // If sitemaps already found enough, skip BFS
      if (this.pdfUrls.length >= this.maxPdfs) return;
    }

    // BFS: fetch HTML, extract links
    const res = await fetchRaw(url, {
      timeoutMs: this.timeoutMs,
      accept:    'text/html,application/xhtml+xml,*/*',
    });

    if (!res || res.status !== 200) return;
    if (!(res.headers['content-type'] || '').toLowerCase().includes('html')) return;

    this.pagesCrawled++;
    this.debugLog.push(`BFS page ${this.pagesCrawled}: ${url}`);

    // 1. Extract anchor href links (static HTML)
    const links = this._extractLinks(res.text, url);

    // 2. Also scan the raw source for any .pdf URL patterns —
    //    catches PDFs embedded in JSON-LD, JS bundles, data attributes, etc.
    const rawPdfUrls = this._extractRawPdfUrls(res.text, url, seedHost, isWildcard);
    for (const pdfUrl of rawPdfUrls) {
      if (this.pdfUrls.length >= this.maxPdfs) break;
      if (!this.visited.has(pdfUrl)) {
        this.visited.add(pdfUrl);
        this._addPdf(pdfUrl);
      }
    }

    for (const link of links) {
      if (this.pdfUrls.length >= this.maxPdfs || this._timedOut()) break;

      let stripped;
      try { const u = new URL(link); u.hash = ''; stripped = u.href; } catch { continue; }
      if (this.visited.has(stripped)) continue;

      let linkHost;
      try { linkHost = new URL(stripped).hostname.toLowerCase(); } catch { continue; }
      if (!this._matchesDomain(linkHost, seedHost, isWildcard)) continue;

      if (this._isPdfUrl(stripped)) {
        this.visited.add(stripped);
        this._addPdf(stripped);
      } else {
        this.queue.push({ url: stripped, depth: depth + 1, seedHost, wildcard: isWildcard });
      }
    }
  }

  // ── Private: helpers ──────────────────────────────────────────────────────────

  // Scan raw page source for any absolute .pdf URL patterns —
  // catches PDFs referenced in JSON-LD, JavaScript, data-* attributes, etc.
  _extractRawPdfUrls(html, baseUrl, seedHost, isWildcard) {
    const found = [];
    const seen  = new Set();
    // Match any https?://... ending in .pdf (optionally followed by ?, #, or whitespace/quote)
    const re = /https?:\/\/[^\s"'<>\])\}]+\.pdf(?=[?#"'\s<>\])\}]|$)/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      let u = m[0];
      // Strip trailing punctuation that may have been captured
      u = u.replace(/[.,;:!?]+$/, '');
      if (seen.has(u)) continue;
      seen.add(u);
      let host;
      try { host = new URL(u).hostname.toLowerCase(); } catch { continue; }
      if (this._matchesDomain(host, seedHost, isWildcard)) found.push(u);
    }
    return found;
  }

  _extractLinks(html, baseUrl) {
    const links = [];
    const seen  = new Set();
    const re    = /href=["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      let href = m[1].trim();
      if (!href || href.startsWith('#') || /^(mailto:|javascript:|tel:)/i.test(href)) continue;
      try { href = new URL(href, baseUrl).href; } catch { continue; }
      if (!seen.has(href)) { seen.add(href); links.push(href); }
    }
    return links;
  }

  _isPdfUrl(url) {
    try { return new URL(url).pathname.toLowerCase().endsWith('.pdf'); } catch { return false; }
  }

  _matchesDomain(host, seedHost, isWildcard) {
    if (!host) return false;
    return isWildcard
      ? (host === seedHost || host.endsWith('.' + seedHost))
      : host === seedHost;
  }

  _makePdfEntry(url) {
    let filename = 'document.pdf';
    try {
      filename = decodeURIComponent(new URL(url).pathname.split('/').pop()) || 'document.pdf';
    } catch {}
    if (!/\.pdf$/i.test(filename)) filename += '.pdf';
    return { url, filename };
  }

  _addPdf(url) {
    if (this.pdfUrls.length < this.maxPdfs) this.pdfUrls.push(this._makePdfEntry(url));
  }
}

module.exports = Crawler;
