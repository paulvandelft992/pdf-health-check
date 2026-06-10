/* Central API client — communicates with PHP backend */
const API = (() => {
  let baseUrl = '';
  let apiKey  = '';

  function init(url, key) {
    baseUrl = url.replace(/\/$/, '');
    apiKey  = key || '';
  }

  async function request(method, path, body = null, isFormData = false) {
    if (!baseUrl) throw new Error('Backend URL not configured. Please check Settings.');

    const headers = { 'X-API-Key': apiKey };
    if (!isFormData) headers['Content-Type'] = 'application/json';
    // Scope requests to the current user so the backend can filter records.
    const userEmail = (typeof UserProfile !== 'undefined') ? UserProfile.getEmail() : '';
    if (userEmail) headers['X-User-Email'] = userEmail;
    // If a verified admin session token is stored, include it so the backend
    // can grant admin privileges without trusting the email header.
    const adminToken = (typeof UserProfile !== 'undefined') ? UserProfile.getAdminToken() : '';
    if (adminToken) headers['X-Admin-Token'] = adminToken;

    const opts = { method, headers };
    if (body) opts.body = isFormData ? body : JSON.stringify(body);

    let res;
    try {
      res = await fetch(`${baseUrl}${path}`, opts);
    } catch (e) {
      throw new Error('Cannot reach backend server. Please check your connection and Settings.');
    }

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`Server returned unexpected response (HTTP ${res.status})`); }

    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    return data;
  }

  // ── Auth / identity ───────────────────────────────────────
  const auth = {
    me:     ()                => request('GET',  '/api/me'),
    login:  (email, password) => request('POST', '/api/auth/login',  { email, password }),
    logout: ()                => request('POST', '/api/auth/logout'),
  };

  // ── Customers ─────────────────────────────────────────────
  const customers = {
    list:   (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('GET', `/api/customers${q ? '?' + q : ''}`);
    },
    get:    (id)     => request('GET',    `/api/customers/${id}`),
    report: (id)     => request('GET',    `/api/customers/${id}/report`),
    create: (data)   => request('POST',   '/api/customers', data),
    update: (id, d)  => request('PUT',    `/api/customers/${id}`, d),
    delete: (id)     => request('DELETE', `/api/customers/${id}`)
  };

  // ── Health Checks ──────────────────────────────────────────
  const healthChecks = {
    list:      (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('GET', `/api/health-checks${q ? '?' + q : ''}`);
    },
    get:       (id)    => request('GET',    `/api/health-checks/${id}`),
    report:    (id)    => request('GET',    `/api/health-checks/${id}/report`),
    create:    (data)  => request('POST',   '/api/health-checks', data),
    finalize:  (id)    => request('POST',   `/api/health-checks/${id}/finalize`),
    delete:    (id)    => request('DELETE', `/api/health-checks/${id}`)
  };

  // ── Documents ──────────────────────────────────────────────
  const documents = {
    // Step 1: register document metadata (Adobe upload done by Electron)
    register: (data) => request('POST', '/api/documents/register', data),
    // Step 2: store pre-fetched PDF properties
    storeProperties:    (docId, props)  => request('POST', `/api/documents/${docId}/properties`, props),
    // Step 3: store pre-fetched accessibility results + compute score
    storeAccessibility: (docId, access) => request('POST', `/api/documents/${docId}/accessibility`, access),
    // Mark a registered document as failed (called when step 3 or 4 throws)
    fail: (docId, step, errorMessage)   => request('POST', `/api/documents/${docId}/fail`, { step, error_message: errorMessage }),

    list:      (healthCheckId) => request('GET', `/api/documents?health_check_id=${healthCheckId}`),
    getResult: (docId)         => request('GET', `/api/documents/${docId}/result`),

    backfillScores: ()         => request('POST', '/api/documents/backfill-scores')
  };

  // ── Stats / Dashboard ──────────────────────────────────────
  // All stat methods accept an optional `filter` object { customerId, healthCheckId }
  // that scopes results to a specific customer or health check.
  function _fq(f = {}, extra = {}) {
    const p = new URLSearchParams(extra);
    if (f && f.customerId)    p.set('customer_id',    f.customerId);
    if (f && f.healthCheckId) p.set('health_check_id', f.healthCheckId);
    const s = p.toString();
    return s ? '?' + s : '';
  }

  const stats = {
    overview:               (f)             => request('GET', '/api/stats/overview'            + _fq(f)),
    byCustomer:             (id)            => request('GET', `/api/stats/customer/${id}`),
    byRegion:               (f)             => request('GET', '/api/stats/by-region'            + _fq(f)),
    byVertical:             (f)             => request('GET', '/api/stats/by-vertical'          + _fq(f)),
    bySegment:              (f)             => request('GET', '/api/stats/by-segment'           + _fq(f)),
    byCountry:              (f)             => request('GET', '/api/stats/by-country'           + _fq(f)),
    trend:                  (days, f)       => request('GET', '/api/stats/trend'                + _fq(f, { days: days || 30 })),
    security:               (f)             => request('GET', '/api/stats/security'             + _fq(f)),
    securityDrilldown:      (filter, f)     => request('GET', '/api/stats/security-drilldown'   + _fq(f, { filter })),
    accessibility:          (f)             => request('GET', '/api/stats/accessibility'        + _fq(f)),
    accessibilityDrilldown: (check, f)      => request('GET', '/api/stats/accessibility-drilldown' + _fq(f, { check })),
    creatorApps:            (f)             => request('GET', '/api/stats/creator-apps'         + _fq(f)),
    piiDocs:                (f)             => request('GET', '/api/stats/pii-docs'             + _fq(f)),
    piiDocsFeedback:        (data)          => request('POST', '/api/stats/pii-feedback', data),
    compare:                (custId, against) => request('GET', `/api/stats/compare?customer_id=${custId}&against=${encodeURIComponent(against)}`),
    timeline:               (params, f)       => request('GET', '/api/stats/timeline' + _fq(f, params)),
  };

  // ── Crawl ──────────────────────────────────────────────────
  const crawl = {
    // Discover PDF URLs across given domains (returns { pdfs, pages_crawled, duration_ms })
    discover: (data) => request('POST', '/api/crawl/discover', data),
    // Proxy-download one PDF and return { data: base64, name, size }
    fetch:    (url)  => request('GET',  `/api/crawl/fetch?url=${encodeURIComponent(url)}`),
  };

  // ── App Settings ───────────────────────────────────────────
  const appSettings = {
    get:  ()     => request('GET',  '/api/settings'),
    save: (body) => request('POST', '/api/settings', body),
  };

  // Yukon runtime config — returns real (unmasked) credentials
  const yukon = {
    config: () => request('GET', '/api/yukon/config'),
  };

  // ── Export (Excel data) ────────────────────────────────────
  const exportData = {
    all:      ()          => request('GET', '/api/export?type=all'),
    customer: (id)        => request('GET', `/api/export?type=customer&customer_id=${id}`),
    hc:       (id)        => request('GET', `/api/export?type=hc&hc_id=${id}`),
  };

  // ── Executive report ───────────────────────────────────────
  const execReport = {
    get: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('GET', `/api/exec-report${q ? '?' + q : ''}`);
    },
  };

  // ── PDF Carwash ─────────────────────────────────────────────
  // POST /api/carwash/process — multipart/form-data:
  //   file:       original PDF (binary)
  //   operations: JSON array ["autotag","compress","linearize","protect"]
  //   doc_id:     (optional) source document record ID
  // Returns: { data: { output_size, download_url, operations_applied[] } }
  const carwash = {
    process: (formData) => request('POST', '/api/carwash/process', formData, true),
  };

  return { init, auth, customers, healthChecks, documents, stats, crawl, appSettings, yukon, exportData, execReport, carwash };
})();
