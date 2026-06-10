/**
 * PDF Health Check — Chrome Extension Popup
 *
 * Communicates with the same PHP backend as the Electron app.
 * Auth: X-API-Key + X-User-Email headers (same as the main app).
 */

// ── State ────────────────────────────────────────────────────────────────────
let cfg = { backendUrl: '', apiKey: '', email: '', firstName: '', lastName: '' };
let currentTab = null;
let pageInfo   = null;
let healthChecks = [];
let customers    = [];
let discoveredPdfs = [];   // [{url, filename, selected, status}]
let importing = false;

// ── DOM shortcuts ────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const show  = id => $( id)?.classList.remove('hidden');
const hide  = id => $( id)?.classList.add('hidden');

function setScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('screen-' + name)?.classList.add('active');
}

// ── API helper ───────────────────────────────────────────────────────────────
async function api(method, path, body = null) {
  const url = cfg.backendUrl.replace(/\/$/, '') + path;
  const headers = {
    'X-API-Key':    cfg.apiKey || '',
    'X-User-Email': cfg.email  || '',
  };
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const opts = { method, headers };
  if (body) opts.body = (body instanceof FormData) ? body : JSON.stringify(body);

  const res  = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Server error (HTTP ${res.status})`); }
  if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  return data;
}

// ── Status bar helpers ───────────────────────────────────────────────────────
function statusBar(elId, type, html, spinner = false) {
  const icons = {
    info:    `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 7v4M8 5v.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    success: `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/><path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    error:   `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/><path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    warning: `<svg viewBox="0 0 16 16" fill="none"><path d="M8 1.5L15 14H1z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 7v3M8 11.5v.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  };
  const el = $(elId);
  if (!el) return;
  const icon = spinner
    ? `<div class="spinner"></div>`
    : (icons[type] || icons.info);
  el.className = `status-bar ${type}`;
  el.innerHTML = `${icon}<span>${html}</span>`;
  el.classList.remove('hidden');
}

function clearStatus(elId) {
  const el = $(elId);
  if (el) { el.innerHTML = ''; el.classList.add('hidden'); }
}

// ── Load / save settings ─────────────────────────────────────────────────────
async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(
      ['backendUrl', 'apiKey', 'email', 'firstName', 'lastName'],
      data => {
        cfg = {
          backendUrl: data.backendUrl || '',
          apiKey:     data.apiKey     || '',
          email:      data.email      || '',
          firstName:  data.firstName  || '',
          lastName:   data.lastName   || '',
        };
        resolve();
      }
    );
  });
}

async function saveSettings() {
  return new Promise(resolve => {
    chrome.storage.local.set(cfg, resolve);
  });
}

// ── Settings screen ──────────────────────────────────────────────────────────
function populateSettingsForm() {
  $('cfgBackendUrl').value = cfg.backendUrl;
  $('cfgApiKey').value     = cfg.apiKey;
  $('cfgEmail').value      = cfg.email;
  $('cfgFirstName').value  = cfg.firstName;
  $('cfgLastName').value   = cfg.lastName;
}

async function handleSaveSettings() {
  const url       = $('cfgBackendUrl').value.trim().replace(/\/$/, '');
  const key       = $('cfgApiKey').value.trim();
  const email     = $('cfgEmail').value.trim().toLowerCase();
  const firstName = $('cfgFirstName').value.trim();
  const lastName  = $('cfgLastName').value.trim();

  $('cfgEmailErr').textContent = '';

  if (!url) {
    statusBar('settingsStatus', 'error', 'Backend URL is required.');
    return;
  }
  if (email && !email.endsWith('@adobe.com')) {
    $('cfgEmailErr').textContent = 'Must be an @adobe.com address';
    return;
  }

  statusBar('settingsStatus', 'info', 'Testing connection…', true);

  try {
    const res = await fetch(`${url}/api/ping`, {
      headers: { 'X-API-Key': key || '' }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    cfg = { backendUrl: url, apiKey: key, email, firstName, lastName };
    await saveSettings();
    statusBar('settingsStatus', 'success', `Connected — ${data.data?.version || 'OK'}`);

    setTimeout(() => {
      clearStatus('settingsStatus');
      init();
    }, 900);
  } catch (e) {
    statusBar('settingsStatus', 'error', `Cannot reach server: ${e.message}`);
  }
}

// ── Populate HC / Customer pickers ───────────────────────────────────────────
async function loadPickerData() {
  try {
    const [hcRes, custRes] = await Promise.all([
      api('GET', '/api/health-checks').catch(() => ({ data: [] })),
      api('GET', '/api/customers').catch(() => ({ data: [] })),
    ]);
    healthChecks = (hcRes.data || []).filter(h => h.status !== 'processing').sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    );
    customers = (custRes.data || []).sort((a, b) =>
      (a.display_name || '').localeCompare(b.display_name || '')
    );
  } catch {}
}

function populateHcSelect(selectId) {
  const sel = $(selectId);
  if (!sel) return;
  sel.innerHTML = `<option value="">— Select health check —</option>` +
    healthChecks.map(h => {
      const score = h.avg_score != null ? ` · ${h.avg_score}/100` : '';
      const name  = h.customer_name ? `${h.name} (${h.customer_name})` : h.name;
      return `<option value="${h.id}">${esc(name)}${esc(score)}</option>`;
    }).join('');
}

function populateCustSelect(selectId) {
  const sel = $(selectId);
  if (!sel) return;
  sel.innerHTML = `<option value="">— Select customer —</option>` +
    customers.map(c => `<option value="${c.id}">${esc(c.display_name)}</option>`).join('');
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── HC tab switching ─────────────────────────────────────────────────────────
function setupHcTabs(tabExistingId, tabNewId, panelExistingId, panelNewId) {
  const tabE = $(tabExistingId), tabN = $(tabNewId);
  const panE = $(panelExistingId), panN = $(panelNewId);
  if (!tabE) return;
  tabE.onclick = () => {
    tabE.classList.add('active');   tabN.classList.remove('active');
    panE.classList.remove('hidden'); panN.classList.add('hidden');
  };
  tabN.onclick = () => {
    tabN.classList.add('active');   tabE.classList.remove('active');
    panN.classList.remove('hidden'); panE.classList.add('hidden');
  };
}

// ── Discovery mode ────────────────────────────────────────────────────────────
let discoverMode = 'crawl';  // 'crawl' | 'search'

function setupModeToggle() {
  const tabCrawl  = $('modePageCrawl');
  const tabSearch = $('modeSearchWeb');
  if (!tabCrawl) return;

  function setMode(mode) {
    discoverMode = mode;
    const isCrawl = mode === 'crawl';
    tabCrawl.classList.toggle('active', isCrawl);
    tabSearch.classList.toggle('active', !isCrawl);
    isCrawl ? show('modeDescCrawl') : hide('modeDescCrawl');
    isCrawl ? hide('modeDescSearch') : show('modeDescSearch');
    const svg = `<svg viewBox="0 0 20 20" fill="none" style="width:14px;height:14px;flex-shrink:0"><circle cx="9" cy="9" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M13.5 13.5L17 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    $('btnDiscover').innerHTML = svg + (isCrawl ? ' Discover PDFs on this domain' : ' Search web for PDFs');
  }

  tabCrawl.onclick  = () => setMode('crawl');
  tabSearch.onclick = () => setMode('search');
  setMode('crawl');
}

// ── Client-side PDF discovery (runs in extension, not on server) ──────────────

// Query DuckDuckGo directly from the extension.
// Extension fetch bypasses bot-detection that blocks server-side cURL requests.
async function searchDdgClientSide(domain, maxPdfs) {
  const bareDomain = domain.replace(/^www\./, '');
  const query = `site:${bareDomain} filetype:pdf`;
  const url   = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=en-us&kp=-1`;

  const resp = await fetch(url, {
    headers: { 'Accept': 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'en-US,en;q=0.9' }
  });
  if (!resp.ok) throw new Error(`DuckDuckGo HTTP ${resp.status}`);

  const html   = await resp.text();
  const doc    = new DOMParser().parseFromString(html, 'text/html');
  const pdfs   = [];
  const seen   = new Set();

  doc.querySelectorAll('a[href]').forEach(a => {
    if (pdfs.length >= maxPdfs) return;
    const href = a.getAttribute('href') || '';

    // DDG wraps results: /l/?uddg=<url-encoded-destination>
    if (href.includes('uddg=')) {
      try {
        const qs  = href.includes('?') ? href.slice(href.indexOf('?') + 1) : href;
        const dec = decodeURIComponent(new URLSearchParams(qs).get('uddg') || '');
        if (/\.pdf(\?.*)?$/i.test(dec) && dec.startsWith('http') && !seen.has(dec)) {
          seen.add(dec);
          pdfs.push({ url: dec, filename: dec.split('/').pop().split('?')[0] || 'document.pdf' });
        }
      } catch {}
      return;
    }
    // Direct PDF link
    if (/\.pdf(\?.*)?$/i.test(href) && href.startsWith('http') && !seen.has(href)) {
      seen.add(href);
      pdfs.push({ url: href, filename: href.split('/').pop().split('?')[0] || 'document.pdf' });
    }
  });

  return pdfs;
}

// BFS page crawl from extension context.
// Step 1: ask the content script for PDFs already visible in the rendered DOM.
// Step 2: fetch additional pages via extension (cross-origin allowed by manifest).
async function crawlDomainClientSide(domain, protocol, maxPdfs, onProgress) {
  const bareDomain = domain.replace(/^www\./, '');
  const seen  = new Set();
  const pdfs  = new Map();   // url → filename

  // ── Step 1: extract from the already-rendered current page ─────────────────
  try {
    const r = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(currentTab.id, { type: 'GET_PAGE_PDFS' }, resp => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(resp);
      });
    });
    (r?.pdfs || []).forEach(p => pdfs.set(p.url, p.filename));
    if (r?.pageUrl) seen.add(r.pageUrl);
    if (pdfs.size > 0) onProgress?.(`Found ${pdfs.size} PDF${pdfs.size !== 1 ? 's' : ''} on this page, scanning more pages…`);
  } catch {}

  if (pdfs.size >= maxPdfs) {
    return [...pdfs.entries()].map(([url, filename]) => ({ url, filename }));
  }

  // ── Step 2: BFS over the domain via extension fetch ─────────────────────────
  const queue = [`${protocol}//${domain}/`];
  const MAX_DEPTH = 3;
  const BATCH     = 4;   // concurrent fetches per level
  let   depth     = 0;

  while (queue.length > 0 && pdfs.size < maxPdfs && depth < MAX_DEPTH) {
    depth++;
    const batch = queue.splice(0, BATCH);

    await Promise.all(batch.map(async pageUrl => {
      if (seen.has(pageUrl)) return;
      seen.add(pageUrl);

      try {
        const r = await fetch(pageUrl, { signal: AbortSignal.timeout(10_000) });
        if (!r.ok) return;
        const ct = r.headers.get('content-type') || '';
        if (!ct.includes('html')) return;

        const html = await r.text();
        const doc  = new DOMParser().parseFromString(html, 'text/html');

        doc.querySelectorAll('a[href]').forEach(a => {
          try {
            const abs  = new URL(a.getAttribute('href') || '', r.url).href;
            const host = new URL(abs).hostname.replace(/^www\./, '');
            if (host !== bareDomain) return;

            if (/\.pdf(\?.*)?$/i.test(abs)) {
              pdfs.set(abs, abs.split('/').pop().split('?')[0] || 'document.pdf');
            } else if (!seen.has(abs) && (abs.startsWith('https://') || abs.startsWith('http://'))) {
              queue.push(abs);
            }
          } catch {}
        });
      } catch {}
    }));

    if (pdfs.size > 0) onProgress?.(`Found ${pdfs.size} PDF${pdfs.size !== 1 ? 's' : ''}… still scanning`);
  }

  return [...pdfs.entries()].map(([url, filename]) => ({ url, filename }));
}

// ── Discover flow (main screen) ───────────────────────────────────────────────
async function handleDiscover() {
  if (!pageInfo?.domain) return;
  const maxPdfs = Math.max(1, Math.min(200, parseInt($('maxPdfs').value) || 50));

  $('btnDiscover').disabled = true;
  hide('discoverResults');
  hide('hcPickerWrap');
  $('mainFooter').style.display = 'none';

  const isSearch = discoverMode === 'search';
  statusBar('discoverStatus', 'info',
    isSearch ? `Searching web for PDFs on ${pageInfo.domain}…` : `Scanning ${pageInfo.domain} for PDFs…`,
    true);
  show('discoverStatus');

  try {
    let pdfs;
    if (isSearch) {
      pdfs = await searchDdgClientSide(pageInfo.domain, maxPdfs);
    } else {
      pdfs = await crawlDomainClientSide(
        pageInfo.domain, pageInfo.protocol, maxPdfs,
        msg => statusBar('discoverStatus', 'info', msg, true)
      );
    }

    discoveredPdfs = pdfs.map(p => ({ ...p, selected: true, status: 'pending' }));

    if (discoveredPdfs.length === 0) {
      const hint = isSearch
        ? `No PDFs found via web search. Try Page Crawl mode instead.`
        : `No PDFs found on ${pageInfo.domain}. Try Search Web mode.`;
      statusBar('discoverStatus', 'warning', hint);
      $('btnDiscover').disabled = false;
      return;
    }

    clearStatus('discoverStatus');
    renderPdfList();
    show('discoverResults');
    show('hcPickerWrap');
    $('mainFooter').style.display = '';
    updateSubmitBtn();
  } catch (e) {
    statusBar('discoverStatus', 'error', `Discovery failed: ${e.message}`);
  }

  $('btnDiscover').disabled = false;
}

function renderPdfList() {
  const list = $('pdfList');
  if (!list) return;

  $('pdfCountLabel').textContent = `${discoveredPdfs.length} PDF${discoveredPdfs.length !== 1 ? 's' : ''} found`;

  list.innerHTML = discoveredPdfs.map((p, i) => {
    const statusClass = p.status === 'done' ? 'done' : p.status === 'failed' ? 'failed' : p.status === 'active' ? 'active' : 'pending';
    const statusLabel = p.status === 'done' ? 'Done' : p.status === 'failed' ? 'Failed' : p.status === 'active' ? 'Adding…' : '';
    return `
      <label class="pdf-item" data-idx="${i}">
        <input type="checkbox" ${p.selected ? 'checked' : ''} data-idx="${i}" class="pdf-check">
        <div class="pdf-item-icon">PDF</div>
        <span class="pdf-item-name" title="${esc(p.url)}">${esc(p.filename)}</span>
        ${statusLabel ? `<span class="pdf-item-status ${statusClass}">${statusLabel}</span>` : ''}
      </label>`;
  }).join('');

  list.querySelectorAll('.pdf-check').forEach(cb => {
    cb.addEventListener('change', () => {
      discoveredPdfs[+cb.dataset.idx].selected = cb.checked;
      updateSubmitBtn();
    });
  });
}

function updateSubmitBtn() {
  const count = discoveredPdfs.filter(p => p.selected).length;
  $('selectedCount').textContent = count;
  $('btnSubmitMain').disabled = count === 0;
}

// ── Resolve / create HC ───────────────────────────────────────────────────────
async function resolveHc(existingSelectId, newHcNameId, custSelectId, tabExistingId) {
  const isNew = !$(tabExistingId).classList.contains('active');

  if (isNew) {
    const name   = $(newHcNameId).value.trim();
    const custId = parseInt($(custSelectId).value) || 0;
    if (!name)   { throw new Error('Health Check name is required.'); }
    if (!custId) { throw new Error('Customer is required.'); }

    const res = await api('POST', '/api/health-checks', {
      name,
      customer_id: custId,
      user_email:  cfg.email,
      user_name:   [cfg.firstName, cfg.lastName].filter(Boolean).join(' '),
    });
    return res.data?.id || res.data?.health_check?.id;
  } else {
    const hcId = parseInt($(existingSelectId).value) || 0;
    if (!hcId) throw new Error('Please select a health check.');
    return hcId;
  }
}

// ── Import a single PDF URL via backend ───────────────────────────────────────
async function importUrl(hcId, url, filename) {
  const res = await api('POST', `/api/health-checks/${hcId}/import-url`, { url, filename });
  return res.data;
}

// ── Submit (main screen) ──────────────────────────────────────────────────────
async function handleSubmitMain() {
  if (importing) return;
  importing = true;
  $('btnSubmitMain').disabled = true;
  $('btnCancelMain').disabled = true;
  clearStatus('hcPickerStatus');

  let hcId;
  try {
    hcId = await resolveHc('hcSelect', 'newHcName', 'custSelect', 'tabExisting');
  } catch (e) {
    statusBar('hcPickerStatus', 'error', e.message);
    show('hcPickerStatus');
    $('btnSubmitMain').disabled = false;
    $('btnCancelMain').disabled = false;
    importing = false;
    return;
  }

  const selected = discoveredPdfs.filter(p => p.selected);
  let done = 0, failed = 0;

  for (let i = 0; i < discoveredPdfs.length; i++) {
    if (!discoveredPdfs[i].selected) continue;
    discoveredPdfs[i].status = 'active';
    renderPdfList();
    statusBar('hcPickerStatus', 'info',
      `Processing ${done + failed + 1} of ${selected.length}…`, true);
    show('hcPickerStatus');

    try {
      await importUrl(hcId, discoveredPdfs[i].url, discoveredPdfs[i].filename);
      discoveredPdfs[i].status = 'done';
      done++;
    } catch (e) {
      discoveredPdfs[i].status = 'failed';
      failed++;
    }
    renderPdfList();
  }

  // Finalize the HC
  try { await api('POST', `/api/health-checks/${hcId}/finalize`); } catch {}

  if (failed === 0) {
    statusBar('hcPickerStatus', 'success',
      `✓ ${done} PDF${done !== 1 ? 's' : ''} added successfully.`);
  } else {
    statusBar('hcPickerStatus', 'warning',
      `${done} added, ${failed} failed. Check the health check for details.`);
  }
  show('hcPickerStatus');
  $('btnSubmitMain').textContent = 'Done';
  $('btnSubmitMain').disabled = false;
  $('btnCancelMain').disabled = false;
  importing = false;
}

// ── Submit (PDF screen) ───────────────────────────────────────────────────────
async function handleAddPdf() {
  if (importing || !pageInfo?.isPdf) return;
  importing = true;
  $('btnAddPdf').disabled = true;
  clearStatus('pdfStatus');

  let hcId;
  try {
    hcId = await resolveHc('pdfHcSelect', 'pdfNewHcName', 'pdfCustSelect', 'pdfTabExisting');
  } catch (e) {
    statusBar('pdfStatus', 'error', e.message);
    show('pdfStatus');
    $('btnAddPdf').disabled = false;
    importing = false;
    return;
  }

  const filename = pageInfo.url.split('/').pop().split('?')[0] || 'document.pdf';
  statusBar('pdfStatus', 'info', 'Fetching and analysing PDF…', true);
  show('pdfStatus');

  try {
    await importUrl(hcId, pageInfo.url, filename);
    try { await api('POST', `/api/health-checks/${hcId}/finalize`); } catch {}
    statusBar('pdfStatus', 'success', '✓ PDF added and analysed successfully.');
    $('btnAddPdf').textContent = 'Done';
  } catch (e) {
    statusBar('pdfStatus', 'error', `Failed: ${e.message}`);
    $('btnAddPdf').disabled = false;
    importing = false;
    return;
  }

  importing = false;
}

// ── Main init ─────────────────────────────────────────────────────────────────
async function init() {
  await loadSettings();

  // Wire settings screen
  $('btnSaveSettings').onclick = handleSaveSettings;
  $('btnSettings').onclick     = () => {
    populateSettingsForm();
    setScreen('settings');
  };

  // If not configured → settings screen
  if (!cfg.backendUrl) {
    populateSettingsForm();
    setScreen('settings');
    return;
  }

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  // Ask content script for page info
  try {
    pageInfo = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' }, resp => {
        if (chrome.runtime.lastError) {
          // Content script not loaded (e.g. chrome:// pages) — infer from URL
          resolve({
            isPdf:    /\.pdf(\?.*)?$/i.test(tab.url),
            url:      tab.url,
            title:    tab.title || '',
            domain:   new URL(tab.url).hostname,
            protocol: new URL(tab.url).protocol,
          });
        } else {
          resolve(resp);
        }
      });
    });
  } catch {
    pageInfo = { isPdf: false, url: tab.url, domain: '', protocol: '' };
  }

  // Load pickers in background
  loadPickerData().then(() => {
    populateHcSelect('hcSelect');
    populateHcSelect('pdfHcSelect');
    populateCustSelect('custSelect');
    populateCustSelect('pdfCustSelect');
  });

  // Setup HC tab toggles
  setupHcTabs('tabExisting', 'tabNew', 'panelExisting', 'panelNew');
  setupHcTabs('pdfTabExisting', 'pdfTabNew', 'pdfPanelExisting', 'pdfPanelNew');

  // ── PDF viewer mode ─────────────────────────────────────────────────────────
  if (pageInfo.isPdf) {
    const filename = pageInfo.url.split('/').pop().split('?')[0] || 'document.pdf';
    $('pdfName').textContent = filename;
    $('btnAddPdf').onclick = handleAddPdf;
    setScreen('pdf');
    return;
  }

  // ── Web page mode ───────────────────────────────────────────────────────────
  $('domainName').textContent = pageInfo.domain || '—';

  // Fill domain name into mode description labels
  const domainText = pageInfo.domain || '—';
  const dd1 = $('modeDescDomain');  if (dd1) dd1.textContent = domainText;
  const dd2 = $('modeDescDomain2'); if (dd2) dd2.textContent = domainText;

  // Wire discovery mode tabs
  setupModeToggle();

  // Disable discover on non-HTTP pages
  const isHttpPage = pageInfo.protocol === 'http:' || pageInfo.protocol === 'https:';
  if (!isHttpPage) {
    statusBar('discoverStatus', 'warning', 'PDF discovery requires an HTTP/HTTPS page.');
    show('discoverStatus');
    $('btnDiscover').disabled = true;
  }

  $('btnDiscover').onclick = handleDiscover;

  $('selectAll').addEventListener('click', e => {
    e.preventDefault();
    const allSelected = discoveredPdfs.every(p => p.selected);
    discoveredPdfs.forEach(p => p.selected = !allSelected);
    renderPdfList();
    updateSubmitBtn();
  });

  $('btnSubmitMain').onclick = handleSubmitMain;
  $('btnCancelMain').onclick = () => {
    hide('discoverResults');
    hide('hcPickerWrap');
    $('mainFooter').style.display = 'none';
    clearStatus('discoverStatus');
    clearStatus('hcPickerStatus');
    discoveredPdfs = [];
    importing = false;
  };

  setScreen('main');
}

document.addEventListener('DOMContentLoaded', init);
