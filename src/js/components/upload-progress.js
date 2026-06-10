/* UploadProgress — persistent header indicator for background PDF processing
 *
 * Architecture:
 *  - init() is called once from App.init() after DOM ready
 *  - startJob() fires processing in the background (never await-ed by callers)
 *  - All errors are caught internally; no promise ever escapes unhandled
 */
const UploadProgress = (() => {

  // ── State ──────────────────────────────────────────────────────────────────
  // jobs[hcId] = { name, total, done, errors, hcId,
  //   files: [{ name, state, steps:[{label,state,detail}], score, errorMsg }] }
  const jobs = {};
  let activeJobCount = 0;
  let hideTimeout    = null;
  let dropdownOpen   = false;

  // ── DOM refs ────────────────────────────────────────────────────────────────
  let elIndicator, elBtn, elBtnInner, elDropdown, elDropTitle, elDropBody;

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════════════════
  function init() {
    elIndicator = document.createElement('div');
    elIndicator.id        = 'uploadIndicator';
    elIndicator.className = 'upind';
    elIndicator.style.display = 'none';

    elIndicator.innerHTML = `
      <button class="upind-btn" id="upindBtn" title="View processing progress">
        <span class="upind-spinner-wrap" id="upindSpinWrap">
          <span class="upind-spinner"></span>
        </span>
        <span class="upind-label" id="upindLabel">0 / 0</span>
      </button>

      <div class="upind-panel" id="upindPanel">
        <div class="upind-panel-head">
          <span class="upind-panel-title" id="upindPanelTitle">Processing PDFs</span>
          <button class="upind-panel-close" id="upindClose">&times;</button>
        </div>
        <div class="upind-panel-body" id="upindBody"></div>
      </div>`;

    // Inject before the topbar-right (notification button)
    const topbarRight = document.querySelector('.topbar-right');
    if (topbarRight && topbarRight.parentNode) {
      topbarRight.parentNode.insertBefore(elIndicator, topbarRight);
    } else {
      document.querySelector('.topbar')?.appendChild(elIndicator);
    }

    elBtn        = document.getElementById('upindBtn');
    elBtnInner   = document.getElementById('upindSpinWrap');
    elDropdown   = document.getElementById('upindPanel');
    elDropTitle  = document.getElementById('upindPanelTitle');
    elDropBody   = document.getElementById('upindBody');

    document.getElementById('upindClose').addEventListener('click', e => {
      e.stopPropagation();
      closeDropdown();
    });

    elBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleDropdown();
    });

    // Close on outside click
    document.addEventListener('click', e => {
      if (dropdownOpen && elIndicator && !elIndicator.contains(e.target)) {
        closeDropdown();
      }
    });
  }

  // ── Dropdown ────────────────────────────────────────────────────────────────
  function toggleDropdown() {
    if (dropdownOpen) closeDropdown(); else openDropdown();
  }

  function openDropdown() {
    dropdownOpen = true;
    elDropdown.classList.add('open');
    safeRenderBody();
  }

  function closeDropdown() {
    dropdownOpen = false;
    elDropdown.classList.remove('open');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC: start a background job
  // ═══════════════════════════════════════════════════════════════════════════
  function startJob(hcId, hcName, files, settings, crawlConfig = null) {
    clearTimeout(hideTimeout);

    // Build initial file entries from uploaded files
    const fileEntries = files.map(f => ({
      name:     f.name,
      size:     f.size || 0,
      state:    'queued',
      steps:    _makeSteps(false),
      score:    null,
      errorMsg: null,
      ref:      f,
    }));

    // If crawling, add a placeholder entry that shows discovery progress
    if (crawlConfig) {
      const placeholderName = crawlConfig.search_query
        ? `Searching: "${crawlConfig.search_query.replace(/\s*filetype:pdf\s*/i,'').trim()}"…`
        : `Crawling ${(crawlConfig.domains||[]).length} domain${(crawlConfig.domains||[]).length !== 1 ? 's' : ''}…`;
      fileEntries.push({
        name:     placeholderName,
        size:     0,
        state:    'discovering',
        steps:    [],
        score:    null,
        errorMsg: null,
        ref:      null,
        isDiscovery: true,
      });
    }

    jobs[hcId] = {
      hcId,
      name:   hcName,
      total:  fileEntries.length,
      done:   0,
      errors: 0,
      files:  fileEntries,
    };

    activeJobCount++;
    elIndicator.style.display = '';
    safeRenderBtn();

    // Fire-and-forget — never throws to caller
    _runJob(hcId, settings, crawlConfig).catch(err => {
      console.warn('[UploadProgress] job error:', err);
    });
  }

  function _makeSteps(isCrawled) {
    return [
      { label: isCrawled ? 'Fetching PDF'   : 'Reading file',   state: 'pending', detail: '' },
      { label: 'Uploading to Adobe',  state: 'pending', detail: '' },
      { label: 'Registering',         state: 'pending', detail: '' },
      { label: 'PDF Properties',      state: 'pending', detail: '' },
      { label: 'Accessibility Check', state: 'pending', detail: '' },
      { label: 'Computing score',     state: 'pending', detail: '' },
    ];
  }

  // ── Internal: run the full job ──────────────────────────────────────────────
  async function _runJob(hcId, settings, crawlConfig) {
    const job = jobs[hcId];
    if (!job) return;

    // ── Phase 1: Discovery ────────────────────────────────────────────────────
    if (crawlConfig && (crawlConfig.search_query || crawlConfig.domains?.length > 0)) {
      const placeholderIdx = job.files.length - 1;
      try {
        // Discovery runs client-side in Electron main process (server has no outbound internet)
        const result = await window.electronAPI.crawlDiscover(crawlConfig);
        const pdfs   = result?.pdfs || [];

        if (pdfs.length > 0) {
          // Replace placeholder with real crawled-file entries
          const crawledEntries = pdfs.map(p => ({
            name:        p.filename,
            url:         p.url,
            size:        0,
            state:       'queued',
            isCrawled:   true,
            steps:       _makeSteps(true),
            score:       null,
            errorMsg:    null,
            ref:         p,
          }));
          job.files.splice(placeholderIdx, 1, ...crawledEntries);
          Toast.show(
            `Found ${pdfs.length} PDF${pdfs.length !== 1 ? 's' : ''} — analysis starting…`,
            'success', 3500
          );
        } else {
          // Nothing found — mark placeholder as errored
          const noResultMsg = crawlConfig.search_query
            ? `No PDFs found for: "${crawlConfig.search_query}"`
            : 'No PDF documents found on the specified domains';
          job.files[placeholderIdx].state    = 'errored';
          job.files[placeholderIdx].errorMsg = noResultMsg;
          Toast.show(noResultMsg + '.', 'warning', 5000);
        }
      } catch (e) {
        job.files[placeholderIdx].state    = 'errored';
        job.files[placeholderIdx].errorMsg = 'Discovery failed: ' + (e.message || 'Unknown error');
        Toast.show('Domain crawl failed: ' + e.message, 'error', 5000);
      }

      job.total = job.files.length;
      safeRenderBtn();
      safeRenderBody();

      // If discovery left nothing queued (crawl-only mode failed, or 0 PDFs found
      // and no uploaded files), delete the health check and tear down the indicator.
      const stillQueued = job.files.filter(f => f.state === 'queued').length;
      if (stillQueued === 0) {
        activeJobCount = Math.max(0, activeJobCount - 1);
        try { await API.healthChecks.delete(hcId); } catch {}
        delete jobs[hcId];
        if (activeJobCount === 0) {
          closeDropdown();
          elIndicator.style.display = 'none';
        } else {
          safeRenderBtn();
          safeRenderBody();
        }
        return;
      }
    }

    // ── Phase 2: Process all queued files (uploaded + crawled) ────────────────
    let fileIdx = 0;

    async function runWorker() {
      while (fileIdx < job.files.length) {
        const i    = fileIdx++;
        const fObj = job.files[i];
        if (!fObj) { if (job) job.done++; continue; }

        if (fObj.state === 'errored') {
          // Already failed (e.g. discovery placeholder — count it and move on)
          job.errors++;
          job.done++;
          safeRenderBtn();
          safeRenderBody();
          continue;
        }

        try {
          const ok = await processOnePDF(hcId, i, settings);
          if (!ok) job.errors++;
        } catch (err) {
          console.warn('[UploadProgress] processOnePDF threw unexpectedly:', err);
          if (job) {
            job.files[i].state    = 'errored';
            job.files[i].errorMsg = err.message || 'Unknown error';
            job.errors++;
          }
        }
        if (job) job.done++;
        safeRenderBtn();
        safeRenderBody();
      }
    }

    const queuedCount = job.files.filter(f => f.state === 'queued').length;
    const workerCount = Math.min(3, queuedCount);
    if (workerCount > 0) {
      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    }

    activeJobCount = Math.max(0, activeJobCount - 1);

    // Finalize health check on backend
    try { await API.healthChecks.finalize(hcId); } catch {}

    // Re-upload the HC summary to Yukon now that scores are available
    if (typeof Yukon !== 'undefined') {
      try {
        const [hcRes, docsRes] = await Promise.all([
          API.healthChecks.get(hcId),
          API.documents.list(hcId),
        ]);
        Yukon.uploadHCDocument(hcRes.data, docsRes.data || []).catch(() => {});
      } catch { /* best-effort — never break the job completion flow */ }
    }

    // In-app toast + desktop notification on completion
    if (jobs[hcId]) {
      const job        = jobs[hcId];
      const totalCount = job.total  || 0;
      const errCount   = job.errors || 0;
      const okCount    = totalCount - errCount;

      // Toast
      if (errCount === 0) {
        Toast.show(
          `All ${totalCount} PDF${totalCount !== 1 ? 's' : ''} processed successfully`,
          'success', 5000
        );
      } else if (errCount === totalCount) {
        Toast.show(`Processing failed — no PDFs could be analysed`, 'error', 6000);
      } else {
        Toast.show(
          `${okCount} of ${totalCount} PDF${totalCount !== 1 ? 's' : ''} processed — ${errCount} failed`,
          'warning', 6000
        );
      }

      // Desktop notification (fires in parallel; no-op when permission not granted)
      const notifTitle = errCount
        ? (errCount === totalCount ? 'Health check failed' : 'Partially complete')
        : 'Health check complete';
      const notifBody = errCount
        ? `${okCount}/${totalCount} PDFs analysed — ${errCount} failed`
        : `All ${totalCount} PDF${totalCount !== 1 ? 's' : ''} analysed`;
      try {
        if (Notification.permission === 'granted') new Notification(notifTitle, { body: notifBody });
        else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(p => {
            if (p === 'granted') new Notification(notifTitle, { body: notifBody });
          });
        }
      } catch {}
    }

    safeRenderBtn();
    safeRenderBody();

    // Auto-hide 3 s after all jobs complete
    if (activeJobCount === 0) {
      hideTimeout = setTimeout(() => {
        closeDropdown();
        elIndicator.style.display = 'none';
        for (const id of Object.keys(jobs)) {
          if (jobs[id].done >= jobs[id].total) delete jobs[id];
        }
      }, 3000);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PIPELINE — one PDF
  // ═══════════════════════════════════════════════════════════════════════════
  async function processOnePDF(hcId, idx, settings) {
    const job  = jobs[hcId];
    if (!job) return false;
    const fObj = job.files[idx];
    const file = fObj?.ref;
    if (!fObj || (!file && !fObj.isCrawled)) return false;

    fObj.state = 'active';
    safeRenderBody();

    // Helper to update a step and re-render safely
    const setStep = (stepIdx, state, detail = '') => {
      const s = fObj.steps[stepIdx];
      if (s) { s.state = state; s.detail = detail; }
      safeRenderBody();
    };

    // ── Credentials ──────────────────────────────────────────────────────────
    const clientId     = settings.adobeClientId     || '';
    const clientSecret = settings.adobeClientSecret || '';
    if (!clientId || !clientSecret) {
      setStep(0, 'errored', 'Adobe credentials missing — go to Settings');
      fObj.state    = 'errored';
      fObj.errorMsg = 'Adobe credentials not configured';
      return false;
    }

    if (!window.electronAPI) {
      setStep(0, 'errored', 'Electron API not available');
      fObj.state    = 'errored';
      fObj.errorMsg = 'Electron API not available';
      return false;
    }

    // ── STEP 0: Read / fetch file ─────────────────────────────────────────────
    setStep(0, 'active');
    let fileData;
    try {
      if (fObj.isCrawled) {
        // Crawled file — download via Electron main process (client-side, no server needed)
        setStep(0, 'active', 'Downloading…');
        fileData = await window.electronAPI.crawlFetchPdf(fObj.url);
        if (!fileData?.data) throw new Error('Empty response from PDF download');
        // Update display name with actual filename
        if (fileData.name) fObj.name = fileData.name;
      } else if (file.isElectron) {
        const raw = await window.electronAPI.readFile(file.path);
        if (!raw || raw.error) throw new Error(raw?.error || 'Failed to read file');
        fileData = raw;
      } else {
        const buf    = await file.arrayBuffer();
        const bytes  = new Uint8Array(buf);
        let binary   = '';
        const chunk  = 8192;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        fileData = { data: btoa(binary), name: file.name, size: file.size };
      }
      setStep(0, 'done', _fmtBytes(fileData.size || file?.size || 0));
    } catch (e) {
      setStep(0, 'errored', e.message);
      fObj.state = 'errored'; fObj.errorMsg = e.message;
      return false;
    }

    // ── STEP 1: Upload to Adobe ───────────────────────────────────────────────
    setStep(1, 'active');
    let assetId;
    try {
      const res = await window.electronAPI.adobeUploadAsset({
        clientId, clientSecret,
        fileBase64: fileData.data,
        filename:   fileData.name,
      });
      if (!res || !res.assetId) throw new Error('Adobe upload returned no assetId');
      assetId = res.assetId;
      setStep(1, 'done', 'Asset ready');
    } catch (e) {
      setStep(1, 'errored', e.message);
      fObj.state = 'errored'; fObj.errorMsg = e.message;
      return false;
    }

    // ── STEP 2: Register in backend ───────────────────────────────────────────
    setStep(2, 'active');
    let docId;
    try {
      let fileHash = '';
      try {
        const hashBuf = await crypto.subtle.digest('SHA-256',
          new Uint8Array(Array.from(atob(fileData.data), c => c.charCodeAt(0))));
        fileHash = Array.from(new Uint8Array(hashBuf))
          .map(b => b.toString(16).padStart(2, '0')).join('');
      } catch { /* hash is optional — deduplication just won't work */ }

      const res = await _apiCall(() => API.documents.register({
        health_check_id: hcId,
        filename:        fileData.name,
        file_size:       fileData.size || file?.size || 0,
        file_hash:       fileHash,
        adobe_asset_id:  assetId,
      }));
      if (!res?.data?.document_id) throw new Error('Backend did not return document_id');
      docId = res.data.document_id;
      setStep(2, 'done', 'Saved');
    } catch (e) {
      setStep(2, 'errored', e.message);
      fObj.state = 'errored'; fObj.errorMsg = e.message;
      return false;
    }

    // ── STEP 3: PDF Properties ────────────────────────────────────────────────
    setStep(3, 'active');
    let props;
    try {
      props = await window.electronAPI.adobeGetProperties({ clientId, clientSecret, assetId });
      await _apiCall(() => API.documents.storeProperties(docId, props));
      const detail = [
        props.pdf_version ? 'PDF ' + props.pdf_version : null,
        props.page_count  ? props.page_count + (props.page_count === 1 ? ' page' : ' pages') : null,
        props.is_tagged   ? 'Tagged' : 'Untagged',
        props.creator_app ? props.creator_app : null,
      ].filter(Boolean).join(' · ');
      setStep(3, 'done', detail);
    } catch (e) {
      setStep(3, 'errored', e.message);
      // Persist the failure reason so the health check detail view can show it
      _apiCall(() => API.documents.fail(docId, 'PDF Properties', e.message)).catch(() => {});
      fObj.state = 'errored'; fObj.errorMsg = e.message;
      return false;
    }

    // ── STEP 4: Accessibility ─────────────────────────────────────────────────
    setStep(4, 'active');
    try {
      let access;
      if (props.has_xfa) {
        // XFA forms are rejected by Adobe's accessibility checker — skip gracefully
        access = { passed_checks: 0, failed_checks: 0, warning_checks: 0, checks: [], xfa_skipped: true };
        setStep(4, 'done', 'Skipped — XFA form (not supported by accessibility checker)');
      } else {
        access = await window.electronAPI.adobeGetAccessibility({ clientId, clientSecret, assetId });
        if (access.xfa_skipped) {
          // Safety net: main process caught the XFA error and returned gracefully
          setStep(4, 'done', 'Skipped — XFA form (not supported by accessibility checker)');
        } else if (access.restricted_skipped) {
          // Document is restricted or encrypted — accessibility cannot run,
          // but we still proceed so the document is scored on properties alone.
          setStep(4, 'done', 'Skipped — document is restricted or encrypted (accessibility unavailable)');
        } else {
          const detail = `${access.passed_checks ?? 0} passed · ${access.failed_checks ?? 0} failed · ${access.warning_checks ?? 0} warnings`;
          setStep(4, 'done', detail);
        }
      }
      const res   = await _apiCall(() => API.documents.storeAccessibility(docId, access));
      const score = res?.data?.overall_score ?? null;
      setStep(5, 'done', score != null ? `${score} / 100` : '');
      fObj.state = 'done';
      fObj.score = score;
      return true;
    } catch (e) {
      setStep(4, 'errored', e.message);
      // Persist the failure reason so the health check detail view can show it
      _apiCall(() => API.documents.fail(docId, 'Accessibility Check', e.message)).catch(() => {});
      fObj.steps[5].state = 'pending';
      fObj.state = 'errored'; fObj.errorMsg = e.message;
      return false;
    }
  }

  // ── API wrapper with up to 3 attempts and exponential back-off ────────────
  // Uses Promise.resolve().then().catch() rather than try-await-catch to
  // ensure the rejection handler is attached synchronously, preventing
  // Chromium from briefly marking the fetch rejection as "unhandled".
  async function _apiCall(fn) {
    const DELAYS = [0, 1500, 3000]; // ms before each attempt
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (DELAYS[attempt]) await new Promise(r => setTimeout(r, DELAYS[attempt]));
      let caught = null;
      const result = await Promise.resolve()
        .then(() => fn())
        .catch(err => { caught = err; });
      if (!caught) return result; // success
      lastErr = caught;
      const isNetwork = lastErr.message?.includes('Failed to fetch') ||
                        lastErr.message?.includes('Cannot reach backend') ||
                        lastErr.message?.includes('NetworkError') ||
                        lastErr.message?.includes('Failed to load');
      if (!isNetwork) break; // non-network error — no point retrying
    }
    throw lastErr;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER — indicator button
  // ═══════════════════════════════════════════════════════════════════════════
  function safeRenderBtn() {
    try { renderBtn(); } catch (e) { console.warn('[UploadProgress] renderBtn error:', e); }
  }

  function renderBtn() {
    if (!elBtn) return;

    let totalDone  = 0, totalFiles = 0, anyErrors = false;
    for (const job of Object.values(jobs)) {
      totalDone  += job.done;
      totalFiles += job.total;
      if (job.errors > 0) anyErrors = true;
    }

    const allDone = totalFiles > 0 && totalDone >= totalFiles;
    const label   = document.getElementById('upindLabel');
    if (label) label.textContent = `${totalDone} / ${totalFiles}`;

    elBtn.classList.remove('upind-btn--active', 'upind-btn--done', 'upind-btn--error');
    const spinWrap = document.getElementById('upindSpinWrap');

    if (allDone) {
      elBtn.classList.add(anyErrors ? 'upind-btn--error' : 'upind-btn--done');
      if (spinWrap) spinWrap.innerHTML = anyErrors
        ? `<svg viewBox="0 0 14 14" fill="none" style="width:13px;height:13px"><path d="M7 1.5L12.5 12H1.5L7 1.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M7 5.5v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="7" cy="10" r=".6" fill="currentColor"/></svg>`
        : `<svg viewBox="0 0 14 14" fill="none" style="width:13px;height:13px"><path d="M1.5 7l4 4 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      if (elDropTitle) elDropTitle.textContent = anyErrors ? 'Done — some files failed' : 'All files processed';
    } else {
      elBtn.classList.add('upind-btn--active');
      if (spinWrap) spinWrap.innerHTML = `<span class="upind-spinner"></span>`;
      if (elDropTitle) elDropTitle.textContent = 'Processing PDFs…';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER — dropdown body
  // ═══════════════════════════════════════════════════════════════════════════
  function safeRenderBody() {
    if (!dropdownOpen) return;
    try { renderBody(); } catch (e) { console.warn('[UploadProgress] renderBody error:', e); }
  }

  function renderBody() {
    if (!elDropBody) return;

    const jobEntries = Object.entries(jobs);
    if (!jobEntries.length) {
      elDropBody.innerHTML = `<div class="upind-empty">No active jobs</div>`;
      return;
    }

    elDropBody.innerHTML = jobEntries.map(([id, job]) => {
      const progressPct = job.total ? Math.round((job.done / job.total) * 100) : 0;
      return `
        <div class="upind-job">
          <div class="upind-job-hd">
            <span class="upind-job-name">${_esc(job.name)}</span>
            <span class="upind-job-prog">${job.done} / ${job.total} files</span>
          </div>
          <div class="upind-job-bar">
            <div class="upind-job-bar-fill" style="width:${progressPct}%"></div>
          </div>
          <div class="upind-files">
            ${job.files.map((f, i) => _renderFile(f, i, id)).join('')}
          </div>
        </div>`;
    }).join('');
  }

  function _renderFile(f, idx, hcId) {
    const ICONS = {
      done:        `<svg viewBox="0 0 16 16" fill="none" class="upind-state-icon done"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M5 8l2.5 2.5 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      errored:     `<svg viewBox="0 0 16 16" fill="none" class="upind-state-icon err"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
      active:      `<span class="upind-file-spinner"></span>`,
      queued:      `<svg viewBox="0 0 16 16" fill="none" class="upind-state-icon queued"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3.5l2 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      discovering: `<span class="upind-file-spinner"></span>`,
    };

    const stateIcon  = ICONS[f.state] || ICONS.queued;
    const stateLabel = { done: 'Done', errored: 'Failed', active: 'Processing…', queued: 'Queued', discovering: 'Crawling…' }[f.state] || '';
    const stateClass = `upind-file-badge--${f.state}`;

    // Score badge for done files
    const scoreBadge = f.score != null
      ? `<span class="upind-score-badge ${f.score >= 75 ? 'good' : f.score >= 50 ? 'warn' : 'poor'}">${f.score}</span>`
      : '';

    // Error message for failed files
    const errorLine = (f.state === 'errored' && f.errorMsg)
      ? `<div class="upind-error-msg">${_esc(f.errorMsg)}</div>`
      : '';

    // Step list — shown only for active / errored files
    const showSteps = f.state === 'active' || f.state === 'errored';
    const stepsHtml = showSteps ? `
      <div class="upind-steps">
        ${f.steps.map((s, si) => {
          const stepIcon = {
            done:    `<svg viewBox="0 0 10 10" fill="none" class="upind-si done"><path d="M1 5l2.5 2.5L9 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
            active:  `<span class="upind-step-spin"></span>`,
            errored: `<svg viewBox="0 0 10 10" fill="none" class="upind-si err"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
            pending: `<span class="upind-step-dot"></span>`,
          }[s.state] || '';
          return `<div class="upind-step upind-step--${s.state}">
            ${stepIcon}
            <span class="upind-step-label">${s.label}</span>
            ${s.detail ? `<span class="upind-step-detail">${_esc(s.detail)}</span>` : ''}
          </div>`;
        }).join('')}
      </div>` : '';

    return `
      <div class="upind-file upind-file--${f.state}">
        <div class="upind-file-row">
          <div class="upind-file-icon-wrap">${stateIcon}</div>
          <div class="upind-file-info">
            <span class="upind-file-name" title="${_esc(f.name)}">${_esc(f.name)}</span>
            ${f.size ? `<span class="upind-file-size">${_fmtBytes(f.size)}</span>` : ''}
          </div>
          <div class="upind-file-right">
            ${scoreBadge}
            <span class="upind-file-badge ${stateClass}">${stateLabel}</span>
          </div>
        </div>
        ${errorLine}
        ${stepsHtml}
      </div>`;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function _fmtBytes(b) {
    if (!b || b < 0) return '';
    if (b < 1024)         return b + ' B';
    if (b < 1024 * 1024)  return (b / 1024).toFixed(0) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }

  // Safe escapeHtml — works even if global escHtml is not yet defined
  function _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return { init, startJob };
})();
