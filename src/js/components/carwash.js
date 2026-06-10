/* PDF Carwash — fix detected issues using Adobe PDF Services APIs
 *
 * Operations (applied in this order):
 *   Auto-tag   → add accessibility tags  (is_tagged === false)
 *   Compress   → reduce file size         (file_size > 1 MB)
 *   Linearize  → fast web view           (is_linearized === false)
 *   Protect    → add password protection  (optional, user-triggered)
 *
 * Public API:
 *   Carwash.open(hc, docs)              — open the wash panel
 *   Carwash.renderOpportunityCard(hc, docs) — returns HTML for the in-page card
 *   Carwash.getOpportunities(hc, docs)  — returns opportunity counts object
 */
const Carwash = (() => {

  /* ── Constants ──────────────────────────────────────────────────────────── */
  const COMPRESS_THRESHOLD = 1 * 1024 * 1024;  // 1 MB — files larger than this are compress candidates

  /* ── Module state ────────────────────────────────────────────────────────── */
  let _hc             = null;
  let _docs           = [];
  let _overlay        = null;
  let _step           = 1;
  let _selectedDocs   = new Set();
  let _operations     = { autotag: true, compress: true, linearize: true, protect: false };
  let _uploadedFiles  = new Map();   // filename → File (browser) or { name, path, isElectron }
  let _results        = [];

  /* ── Operation helpers ───────────────────────────────────────────────────── */

  // Which carwash operations apply to a given document?
  function _docOps(doc) {
    const props = doc.properties || {};
    const ops   = [];
    if (props.is_tagged === false)                       ops.push('autotag');
    if ((doc.file_size || 0) > COMPRESS_THRESHOLD)      ops.push('compress');
    if (props.is_linearized === false)                   ops.push('linearize');
    // Protect is always available but opt-in only
    ops.push('protect');
    return ops;
  }

  // Aggregate opportunity counts across all completed docs
  function getOpportunities(hc, docs) {
    const completed  = docs.filter(d => d.status === 'completed');
    const untagged   = completed.filter(d => (d.properties || {}).is_tagged === false).length;
    const oversized  = completed.filter(d => (d.file_size || 0) > COMPRESS_THRESHOLD).length;
    const unlinear   = completed.filter(d => (d.properties || {}).is_linearized === false).length;
    const unprotected = completed.filter(d => !(d.properties || {}).is_encrypted).length;
    return { untagged, oversized, unlinear, unprotected, total: completed.length };
  }

  /* ── Opportunity card (rendered inline in the HC detail view) ────────────── */
  function renderOpportunityCard(hc, docs) {
    const opp = getOpportunities(hc, docs);
    if (opp.total === 0) return '';
    const hasWork = opp.untagged > 0 || opp.oversized > 0 || opp.unlinear > 0;
    if (!hasWork) return '';

    return `
    <div class="carwash-opp-card" id="carwashOpportunityCard">
      <div class="carwash-opp-left">
        <div class="carwash-opp-icon-wrap" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/>
            <path d="M7.5 12c0 0 1.2-3.5 4.5-3.5s4.5 3.5 4.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M7.5 16c0 0 1.2 1.5 4.5 1.5s4.5-1.5 4.5-1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M9.5 8.5v7M12 8v8M14.5 8.5v7" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.35"/>
          </svg>
        </div>
        <div class="carwash-opp-text">
          <div class="carwash-opp-title">PDF Carwash Opportunity</div>
          <div class="carwash-opp-subtitle">Automatically fix identified issues using Adobe PDF Services APIs</div>
        </div>
      </div>
      <div class="carwash-opp-ops">
        ${opp.untagged > 0 ? `
        <div class="carwash-opp-op">
          <span class="cw-pill pill-autotag">AUTO-TAG</span>
          <span class="carwash-opp-op-count">${opp.untagged}</span>
          <span class="carwash-opp-op-label">untagged</span>
        </div>` : ''}
        ${opp.oversized > 0 ? `
        <div class="carwash-opp-op">
          <span class="cw-pill pill-compress">COMPRESS</span>
          <span class="carwash-opp-op-count">${opp.oversized}</span>
          <span class="carwash-opp-op-label">oversized</span>
        </div>` : ''}
        ${opp.unlinear > 0 ? `
        <div class="carwash-opp-op">
          <span class="cw-pill pill-linearize">LINEARIZE</span>
          <span class="carwash-opp-op-count">${opp.unlinear}</span>
          <span class="carwash-opp-op-label">not fast view</span>
        </div>` : ''}
      </div>
      <button class="btn btn-primary btn-sm carwash-opp-btn" id="carwashOpenBtn">
        <svg viewBox="0 0 16 16" fill="none" width="12" height="12"><path d="M5 3l8 5-8 5V3z" fill="currentColor"/></svg>
        Run PDF Carwash
      </button>
    </div>`;
  }

  /* ── Public open ─────────────────────────────────────────────────────────── */
  function open(hc, docs) {
    _hc    = hc;
    _docs  = (docs || []).filter(d => d.status === 'completed');
    _step  = 1;
    _results = [];
    _uploadedFiles.clear();
    _operations = { autotag: true, compress: true, linearize: true, protect: false };

    // Pre-select docs that have at least one auto-detectable operation
    _selectedDocs = new Set(
      _docs
        .filter(d => {
          const ops = _docOps(d);
          return ops.includes('autotag') || ops.includes('compress') || ops.includes('linearize');
        })
        .map(d => String(d.id))
    );
    if (_selectedDocs.size === 0) {
      // Fallback: select all
      _docs.forEach(d => _selectedDocs.add(String(d.id)));
    }

    _build();
    _renderStep();
  }

  /* ── DOM shell ───────────────────────────────────────────────────────────── */
  function _build() {
    _teardown();
    _overlay = document.createElement('div');
    _overlay.className = 'carwash-overlay';
    _overlay.innerHTML = `
      <div class="carwash-panel">
        <div class="carwash-header">
          <div class="carwash-header-brand">
            <div class="carwash-brand-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/>
                <path d="M7.5 12c0 0 1.2-3.5 4.5-3.5s4.5 3.5 4.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M7.5 16c0 0 1.2 1.5 4.5 1.5s4.5-1.5 4.5-1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M9.5 8.5v7M12 8v8M14.5 8.5v7" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.35"/>
              </svg>
            </div>
            <div>
              <div class="carwash-panel-title">PDF Carwash</div>
              <div class="carwash-panel-subtitle">${typeof escHtml === 'function' ? escHtml(_hc ? _hc.name : '') : (_hc ? _hc.name : '')}</div>
            </div>
          </div>
          <div class="carwash-step-indicator" id="cwStepIndicator"></div>
          <button class="carwash-close-btn" id="cwClose" aria-label="Close">
            <svg viewBox="0 0 12 12" fill="none" width="12" height="12">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="carwash-body" id="cwBody"></div>
        <div class="carwash-footer" id="cwFooter"></div>
      </div>`;

    document.body.appendChild(_overlay);
    document.getElementById('cwClose').addEventListener('click', _teardown);
    window.addEventListener('keydown', _onKey);
  }

  function _onKey(e) { if (e.key === 'Escape') _teardown(); }

  function _teardown() {
    window.removeEventListener('keydown', _onKey);
    if (_overlay) { _overlay.remove(); _overlay = null; }
  }

  /* ── Step indicator ──────────────────────────────────────────────────────── */
  const STEP_META = [
    { n: 1, label: 'Select' },
    { n: 2, label: 'Wash'   },
    { n: 3, label: 'Results'},
  ];

  function _updateStepIndicator() {
    const el = document.getElementById('cwStepIndicator');
    if (!el) return;
    el.innerHTML = STEP_META.map((s, i) => `
      <div class="cw-step-item ${s.n === _step ? 'active' : s.n < _step ? 'done' : ''}">
        <span class="cw-step-num">${s.n < _step ? '✓' : s.n}</span>
        <span class="cw-step-label">${s.label}</span>
      </div>
      ${i < STEP_META.length - 1 ? '<div class="cw-step-line"></div>' : ''}
    `).join('');
  }

  function _renderStep() {
    _updateStepIndicator();
    if (_step === 1) _renderStep1();
    else if (_step === 2) _renderStep2();
    else                  _renderStep3();
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * STEP 1 — SELECT
   * ══════════════════════════════════════════════════════════════════════════ */
  function _renderStep1() {
    const body   = document.getElementById('cwBody');
    const footer = document.getElementById('cwFooter');

    // Count how many selected docs need each operation
    const selDocs = _docs.filter(d => _selectedDocs.has(String(d.id)));
    const opCounts = { autotag: 0, compress: 0, linearize: 0, protect: 0 };
    _docs.forEach(d => _docOps(d).forEach(op => opCounts[op]++));

    body.innerHTML = `
      <div class="cw-step1">
        <div class="cw-section-header">
          <h3 class="cw-section-title">Select PDFs to Wash</h3>
          <p class="cw-section-desc">
            Operations are automatically suggested from the analysis results.
            Toggle operations below, then select which PDFs to include.
          </p>
        </div>

        <!-- Operation toggles -->
        <div class="cw-ops-grid" id="cwOpsGrid">
          ${_opCardHtml('autotag',   'Auto-Tag',   'pill-autotag',   opCounts.autotag,
            'Add accessibility tags so screen readers and assistive technology can navigate the PDF.')}
          ${_opCardHtml('compress',  'Compress',   'pill-compress',  opCounts.oversized || opCounts.compress,
            'Reduce file size using Adobe PDF Services — removes embedded redundancies and downsamples images.')}
          ${_opCardHtml('linearize', 'Linearize',  'pill-linearize', opCounts.linearize,
            'Optimise the PDF for Fast Web View so browsers can show the first page before the full file downloads.')}
          ${_opCardHtml('protect',   'Protect',    'pill-protect',   opCounts.protect,
            'Apply a read-only password and set permissions — useful before sharing with a customer.', true)}
        </div>

        <!-- Document list -->
        <div class="cw-doc-list">
          <div class="cw-doc-list-header">
            <label class="cw-check-label">
              <input type="checkbox" id="cwSelectAll" ${_selectedDocs.size === _docs.length ? 'checked' : _selectedDocs.size > 0 ? 'indeterminate-js' : ''}>
              <span>Select all (${_docs.length})</span>
            </label>
            <span class="cw-sel-count" id="cwSelCount">${_selectedDocs.size} selected</span>
          </div>
          <div class="cw-doc-rows" id="cwDocRows">
            ${_docs.map(doc => _docRowHtml(doc)).join('')}
          </div>
        </div>

        <div class="cw-info-banner">
          <svg viewBox="0 0 16 16" fill="none" width="13" height="13">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
            <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          The original PDF files need to be re-uploaded to Adobe PDF Services for processing.
          You'll select them in the next step.
        </div>
      </div>`;

    footer.innerHTML = `
      <button class="btn btn-secondary" id="cwCancelBtn">Cancel</button>
      <button class="btn btn-primary" id="cwNextBtn" ${_selectedDocs.size === 0 ? 'disabled' : ''}>
        Wash ${_selectedDocs.size} PDF${_selectedDocs.size !== 1 ? 's' : ''} →
      </button>`;

    // ── Events ──
    const selectAllCb = document.getElementById('cwSelectAll');
    if (selectAllCb) {
      if (_selectedDocs.size > 0 && _selectedDocs.size < _docs.length) {
        selectAllCb.indeterminate = true;
      }
      selectAllCb.addEventListener('change', e => {
        if (e.target.checked) _docs.forEach(d => _selectedDocs.add(String(d.id)));
        else                   _selectedDocs.clear();
        _renderStep1();
      });
    }

    document.querySelectorAll('.cw-doc-check').forEach(cb => {
      cb.addEventListener('change', e => {
        const id = e.target.dataset.docId;
        if (e.target.checked) _selectedDocs.add(id);
        else                   _selectedDocs.delete(id);
        _syncSelCount();
        _syncNextBtn();
      });
    });

    document.querySelectorAll('.cw-op-card-input').forEach(cb => {
      cb.addEventListener('change', e => {
        _operations[e.target.dataset.op] = e.target.checked;
        _renderStep1();
      });
    });

    document.getElementById('cwCancelBtn').addEventListener('click', _teardown);
    document.getElementById('cwNextBtn').addEventListener('click', () => {
      if (_selectedDocs.size === 0) {
        if (typeof Toast !== 'undefined') Toast.show('Select at least one PDF to wash.', 'warning');
        return;
      }
      const activeOps = Object.entries(_operations).filter(([, v]) => v).map(([k]) => k);
      if (activeOps.length === 0) {
        if (typeof Toast !== 'undefined') Toast.show('Enable at least one operation.', 'warning');
        return;
      }
      _step = 2;
      _renderStep();
    });
  }

  function _opCardHtml(op, label, pillCls, count, desc, optional = false) {
    const on = _operations[op];
    return `
    <label class="cw-op-card ${on ? 'active' : ''}" title="${desc}">
      <input type="checkbox" class="cw-op-card-input" data-op="${op}" ${on ? 'checked' : ''}>
      <div class="cw-op-card-inner">
        <div class="cw-op-card-top">
          <span class="cw-pill ${pillCls}">${label.toUpperCase()}</span>
          ${optional ? '<span class="cw-op-optional-badge">optional</span>' : ''}
        </div>
        <div class="cw-op-card-count">${count}</div>
        <div class="cw-op-card-desc">${desc}</div>
      </div>
    </label>`;
  }

  function _docRowHtml(doc) {
    const ops      = _docOps(doc);
    const activeOps = ops.filter(op => _operations[op]);
    const isSelected = _selectedDocs.has(String(doc.id));
    const esc = typeof escHtml === 'function' ? escHtml : (s => s);

    return `
    <div class="cw-doc-row ${isSelected ? '' : 'cw-doc-dimmed'}" data-doc-id="${doc.id}">
      <label class="cw-doc-check-wrap">
        <input type="checkbox" class="cw-doc-check" data-doc-id="${doc.id}" ${isSelected ? 'checked' : ''}>
      </label>
      <svg class="cw-doc-icon" viewBox="0 0 14 14" fill="none" width="12" height="12">
        <rect x="1" y="0" width="12" height="14" rx="1.5" stroke="currentColor" stroke-width="1"/>
        <path d="M3.5 4.5h7M3.5 7h7M3.5 9.5h5" stroke="currentColor" stroke-width=".9" stroke-linecap="round"/>
      </svg>
      <div class="cw-doc-name" title="${esc(doc.original_filename || '')}">${esc(doc.original_filename || 'Unknown')}</div>
      <div class="cw-doc-size">${_fmtBytes(doc.file_size)}</div>
      <div class="cw-doc-ops-wrap">
        ${activeOps.length > 0
          ? activeOps.map(op => `<span class="cw-pill cw-pill-xs pill-${op}">${op.toUpperCase()}</span>`).join('')
          : '<span class="cw-doc-clean">✓ Already optimised</span>'}
      </div>
    </div>`;
  }

  function _syncSelCount() {
    const el = document.getElementById('cwSelCount');
    if (el) el.textContent = `${_selectedDocs.size} selected`;
  }

  function _syncNextBtn() {
    const btn = document.getElementById('cwNextBtn');
    if (!btn) return;
    btn.disabled = _selectedDocs.size === 0;
    btn.textContent = `Wash ${_selectedDocs.size} PDF${_selectedDocs.size !== 1 ? 's' : ''} →`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * STEP 2 — UPLOAD & WASH
   * ══════════════════════════════════════════════════════════════════════════ */
  function _renderStep2() {
    const body   = document.getElementById('cwBody');
    const footer = document.getElementById('cwFooter');
    const selDocs = _docs.filter(d => _selectedDocs.has(String(d.id)));
    const esc = typeof escHtml === 'function' ? escHtml : (s => s);

    body.innerHTML = `
      <div class="cw-step2">
        <div class="cw-section-header">
          <h3 class="cw-section-title">Upload Original PDFs</h3>
          <p class="cw-section-desc">
            Drop or select the original files — we match them by filename to the PDFs in this health check.
          </p>
        </div>

        <div class="cw-dropzone" id="cwDropzone">
          <svg viewBox="0 0 40 40" fill="none" width="36" height="36">
            <rect x="6" y="2" width="22" height="30" rx="2.5" stroke="currentColor" stroke-width="1.6"/>
            <path d="M28 2l8 8h-8V2z" stroke="currentColor" stroke-width="1.5"/>
            <path d="M11 12h12M11 17h12M11 22h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          <div class="cw-dropzone-text">
            <strong>Drop PDF files here</strong> or <span class="cw-browse-link" id="cwBrowseLink">browse</span>
          </div>
          <div class="cw-dropzone-hint">Files are matched by filename</div>
        </div>
        <input type="file" id="cwFileInput" accept=".pdf" multiple style="display:none">

        <div class="cw-wash-rows" id="cwWashRows">
          ${selDocs.map(doc => _washRowHtml(doc, 'waiting')).join('')}
        </div>
      </div>`;

    footer.innerHTML = `
      <button class="btn btn-secondary" id="cwBackBtn">← Back</button>
      <button class="btn btn-primary" id="cwWashBtn" disabled>
        <svg viewBox="0 0 16 16" fill="none" width="12" height="12"><path d="M5 3l8 5-8 5V3z" fill="currentColor"/></svg>
        Start Washing
      </button>`;

    // ── File matching ──
    const dropzone  = document.getElementById('cwDropzone');
    const fileInput = document.getElementById('cwFileInput');

    const handleBrowserFiles = files => {
      [...files].filter(f => f.name.toLowerCase().endsWith('.pdf'))
                .forEach(f => _uploadedFiles.set(f.name, f));
      _syncWashRows();
    };

    dropzone.addEventListener('dragover',  e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault(); dropzone.classList.remove('drag-over');
      handleBrowserFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => { handleBrowserFiles(fileInput.files); fileInput.value = ''; });

    document.getElementById('cwBrowseLink').addEventListener('click', async () => {
      if (window.electronAPI) {
        const paths = await window.electronAPI.openFileDialog();
        if (paths?.length) {
          paths.forEach(p => _uploadedFiles.set(p.split(/[\\/]/).pop(), { name: p.split(/[\\/]/).pop(), path: p, isElectron: true }));
          _syncWashRows();
        }
      } else {
        fileInput.click();
      }
    });

    if (window.electronAPI) {
      dropzone.addEventListener('click', async () => {
        const paths = await window.electronAPI.openFileDialog();
        if (paths?.length) {
          paths.forEach(p => _uploadedFiles.set(p.split(/[\\/]/).pop(), { name: p.split(/[\\/]/).pop(), path: p, isElectron: true }));
          _syncWashRows();
        }
      });
    }

    document.getElementById('cwBackBtn').addEventListener('click', () => { _step = 1; _renderStep(); });
    document.getElementById('cwWashBtn').addEventListener('click', _runWash);
  }

  function _washRowHtml(doc, state) {
    const ops = _docOps(doc).filter(op => _operations[op]);
    const esc = typeof escHtml === 'function' ? escHtml : (s => s);
    const statusHtml = {
      waiting: `<span class="cw-status waiting">Waiting for file…</span>`,
      ready:   `<span class="cw-status ready">✓ Ready</span>`,
      running: `<span class="cw-status running"><span class="loading-spinner" style="width:11px;height:11px;border-width:1.5px"></span> Processing…</span>`,
      done:    `<span class="cw-status done">✓ Done</span>`,
      error:   `<span class="cw-status error">✗ Failed</span>`,
    }[state] || '';

    return `
    <div class="cw-wash-row" id="cw-wash-${doc.id}">
      <svg class="cw-doc-icon" viewBox="0 0 14 14" fill="none" width="12" height="12">
        <rect x="1" y="0" width="12" height="14" rx="1.5" stroke="currentColor" stroke-width="1"/>
      </svg>
      <div class="cw-wash-name">${esc(doc.original_filename || 'Unknown')}</div>
      <div class="cw-wash-ops">
        ${ops.map(op => `<span class="cw-pill cw-pill-xs pill-${op}">${op.toUpperCase()}</span>`).join('')}
      </div>
      <div class="cw-wash-status" id="cw-status-${doc.id}">${statusHtml}</div>
    </div>`;
  }

  function _syncWashRows() {
    const selDocs = _docs.filter(d => _selectedDocs.has(String(d.id)));
    selDocs.forEach(doc => {
      const statusEl = document.getElementById(`cw-status-${doc.id}`);
      if (!statusEl) return;
      const matched = _uploadedFiles.has(doc.original_filename);
      statusEl.innerHTML = matched
        ? `<span class="cw-status ready">✓ Ready</span>`
        : `<span class="cw-status waiting">Waiting for file…</span>`;
    });

    const allReady = selDocs.every(d => _uploadedFiles.has(d.original_filename));
    const btn = document.getElementById('cwWashBtn');
    if (btn) btn.disabled = !allReady;
  }

  /* ── Wash execution ──────────────────────────────────────────────────────── */
  async function _runWash() {
    document.getElementById('cwWashBtn').disabled = true;
    document.getElementById('cwBackBtn').disabled = true;

    const selDocs = _docs.filter(d => _selectedDocs.has(String(d.id)));
    _results = [];

    let settings = {};
    try { if (window.electronAPI) settings = await window.electronAPI.getSettings() || {}; } catch {}

    for (const doc of selDocs) {
      const statusEl = document.getElementById(`cw-status-${doc.id}`);
      if (statusEl) statusEl.innerHTML = `<span class="cw-status running"><span class="loading-spinner" style="width:11px;height:11px;border-width:1.5px"></span> Processing…</span>`;

      const ops       = _docOps(doc).filter(op => _operations[op]);
      const fileEntry = _uploadedFiles.get(doc.original_filename);

      try {
        const result = await _processDoc(doc, ops, fileEntry, settings);
        _results.push({ doc, ops, result, success: true });
        if (statusEl) statusEl.innerHTML = `<span class="cw-status done">✓ Done</span>`;
      } catch (err) {
        const msg = (err && err.message) ? err.message : 'Unknown error';
        _results.push({ doc, ops, error: msg, success: false });
        if (statusEl) statusEl.innerHTML = `<span class="cw-status error" title="${typeof escHtml === 'function' ? escHtml(msg) : msg}">✗ Failed</span>`;
      }
    }

    setTimeout(() => { _step = 3; _renderStep(); }, 500);
  }

  async function _processDoc(doc, ops, fileEntry, settings) {
    // ── Electron path: all Adobe calls happen in the main process ──────────
    if (window.electronAPI && window.electronAPI.carwashProcess) {
      const clientId     = settings.adobeClientId     || settings.clientId     || '';
      const clientSecret = settings.adobeClientSecret || settings.clientSecret || '';
      if (!clientId || !clientSecret) {
        throw new Error('Adobe credentials are not configured. Please check Settings.');
      }

      const fileResult = await window.electronAPI.readFile(fileEntry.path);
      if (fileResult.error) throw new Error('Could not read file: ' + fileResult.error);

      return await window.electronAPI.carwashProcess({
        clientId,
        clientSecret,
        fileBase64: fileResult.data,
        filename:   doc.original_filename,
        operations: ops,
      });
    }

    // ── Web / PHP-backend fallback ─────────────────────────────────────────
    if (typeof API === 'undefined' || !API.carwash) {
      throw new Error('Carwash API not available');
    }
    const formData = new FormData();
    formData.append('operations', JSON.stringify(ops));
    formData.append('doc_id',     String(doc.id));
    if (fileEntry instanceof File) {
      formData.append('file', fileEntry, doc.original_filename);
    } else if (fileEntry && fileEntry.file) {
      formData.append('file', fileEntry.file, doc.original_filename);
    }
    return await API.carwash.process(formData);
  }

  // Convert a base64 PDF string to a temporary blob URL for the download button
  function _base64ToBlobUrl(base64) {
    const binary = atob(base64);
    const uint8  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) uint8[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([uint8], { type: 'application/pdf' }));
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * STEP 3 — RESULTS
   * ══════════════════════════════════════════════════════════════════════════ */
  function _renderStep3() {
    const body   = document.getElementById('cwBody');
    const footer = document.getElementById('cwFooter');
    const esc = typeof escHtml === 'function' ? escHtml : (s => s);

    const succeeded  = _results.filter(r => r.success);
    const failed     = _results.filter(r => !r.success);
    const totalBefore = succeeded.reduce((s, r) => s + (r.doc.file_size || 0), 0);
    const totalAfter  = succeeded.reduce((s, r) => s + ((r.result && r.result.output_size) || r.doc.file_size || 0), 0);
    const savings     = totalBefore > 0 ? totalBefore - totalAfter : 0;
    const savingsPct  = totalBefore > 0 ? Math.round((savings / totalBefore) * 100) : 0;

    body.innerHTML = `
      <div class="cw-step3">
        <div class="cw-results-hero">
          ${succeeded.length > 0
            ? `<div class="cw-results-check">
                 <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
                   <circle cx="12" cy="12" r="10" fill="var(--green-light)" stroke="var(--green)" stroke-width="1.5"/>
                   <path d="M7 12l3.5 4L17 8" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                 </svg>
               </div>`
            : `<div class="cw-results-check">
                 <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
                   <circle cx="12" cy="12" r="10" fill="var(--red-light)" stroke="var(--red)" stroke-width="1.5"/>
                   <path d="M8 8l8 8M16 8l-8 8" stroke="var(--red)" stroke-width="2" stroke-linecap="round"/>
                 </svg>
               </div>`}
          <div>
            <div class="cw-results-headline">
              ${succeeded.length > 0
                ? `${succeeded.length} PDF${succeeded.length !== 1 ? 's' : ''} successfully washed`
                : 'Wash failed'}
            </div>
            <div class="cw-results-sub">
              ${failed.length > 0 ? `${failed.length} file${failed.length !== 1 ? 's' : ''} failed · ` : ''}
              ${savings > 0 ? `<strong>${_fmtBytes(savings)}</strong> saved (${savingsPct}% reduction)` : ''}
            </div>
          </div>
        </div>

        ${succeeded.length > 0 ? `
        <div class="cw-results-table-wrap">
          <table class="cw-results-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Before</th>
                <th>After</th>
                <th>Saved</th>
                <th>Operations applied</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${succeeded.map(r => {
                const before = r.doc.file_size || 0;
                const after  = (r.result && r.result.output_size) ? r.result.output_size : before;
                const saved  = before > 0 ? before - after : 0;
                const pct    = before > 0 ? Math.round((saved / before) * 100) : 0;
                const downloadUrl = r.result && r.result.outputBase64
                  ? _base64ToBlobUrl(r.result.outputBase64)
                  : (r.result && r.result.download_url ? r.result.download_url : null);
                return `
                <tr>
                  <td class="cw-res-name" title="${esc(r.doc.original_filename || '')}">${esc(r.doc.original_filename || '—')}</td>
                  <td class="text-muted text-sm">${_fmtBytes(before)}</td>
                  <td class="text-sm">${_fmtBytes(after)}</td>
                  <td class="text-sm ${pct > 0 ? 'cw-saving' : ''}">${pct > 0 ? '−' + pct + '%' : '—'}</td>
                  <td>
                    ${r.ops.map(op => `<span class="cw-pill cw-pill-xs pill-${op}">${op.toUpperCase()}</span>`).join(' ')}
                    ${r.result && r.result.protectPassword ? `
                      <span class="cw-password-badge" title="${r.result.protectPassword.type === 'ownerPassword' ? 'Owner password (controls permissions)' : 'Open password (required to open)'}">
                        🔑 ${esc(r.result.protectPassword.value)}
                        <span class="cw-password-type">${r.result.protectPassword.type === 'ownerPassword' ? 'owner' : 'open'}</span>
                      </span>` : ''}
                  </td>
                  <td>
                    ${downloadUrl
                      ? `<a class="btn btn-ghost btn-sm" href="${downloadUrl}" download="${esc(r.doc.original_filename || 'washed.pdf')}">↓ Save</a>`
                      : '<span class="text-muted text-sm">—</span>'}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

        ${succeeded.some(r => r.result && (r.result.download_url || r.result.outputBase64)) ? `
        <div class="cw-download-all-wrap">
          <button class="btn btn-secondary btn-sm" id="cwDownloadAll">
            <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
              <path d="M8 3v7M5 8l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 13h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            Download All (${succeeded.length} files)
          </button>
        </div>` : ''}
        ` : ''}

        ${failed.length > 0 ? `
        <div class="cw-failed-section">
          <div class="cw-failed-heading">Failed</div>
          ${failed.map(r => `
          <div class="cw-failed-row">
            <svg viewBox="0 0 14 14" fill="none" width="12" height="12" style="color:var(--red);flex-shrink:0">
              <path d="M7 1L13 12H1L7 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
              <path d="M7 5.5v2.5M7 10v.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            <span class="cw-failed-name">${esc(r.doc.original_filename || '—')}</span>
            <span class="cw-failed-msg text-muted text-sm">${esc((r.error || '').slice(0, 120))}</span>
          </div>`).join('')}
        </div>` : ''}
      </div>`;

    footer.innerHTML = `
      <button class="btn btn-secondary" id="cwNewWashBtn">Start New Wash</button>
      <button class="btn btn-primary" id="cwDoneBtn">Done</button>`;

    document.getElementById('cwDoneBtn').addEventListener('click', _teardown);
    document.getElementById('cwNewWashBtn').addEventListener('click', () => {
      _step = 1;
      _uploadedFiles.clear();
      _results = [];
      _renderStep();
    });

    const dlAll = document.getElementById('cwDownloadAll');
    if (dlAll) {
      dlAll.addEventListener('click', () => {
        succeeded.forEach(r => {
          const url = r.result && r.result.outputBase64
            ? _base64ToBlobUrl(r.result.outputBase64)
            : (r.result && r.result.download_url ? r.result.download_url : null);
          if (url) {
            const a = Object.assign(document.createElement('a'), {
              href: url,
              download: r.doc.original_filename || 'washed.pdf',
            });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
        });
      });
    }
  }

  /* ── Utilities ───────────────────────────────────────────────────────────── */
  function _fmtBytes(b) {
    if (!b) return '—';
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }

  return { open, getOpportunities, renderOpportunityCard };

})();
