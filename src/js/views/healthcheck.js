/* Health Checks View — list, create, detail, upload & processing */
const HealthCheckView = (() => {

  let pendingFiles    = [];
  let showAllHC       = false;   // admin scope: false = mine, true = all users

  // Current detail view context — used by Carwash pill onclick handlers
  let _currentHc   = null;
  let _currentDocs = null;

  // ── View mode: 'table' (default) or 'cards' ───────────────────────────────
  let _hcView = localStorage.getItem('hcapp_hc_view') || 'table';

  // Defined immediately (module load) so it's available from both list AND detail views
  // without requiring renderList() to have run first.
  let _listContainer  = null;    // reference for re-render on scope toggle

  // ── Pagination ────────────────────────────────────────────────────────────
  const HC_PAGE_SIZE = 25;
  let   _hcPage      = 1;
  let   _lastHCs     = [];   // last loaded set, used for page nav

  function hcPaginationHtml(total, page, size) {
    if (total <= size) return '';
    const pages = Math.ceil(total / size);
    const start = (page - 1) * size + 1;
    const end   = Math.min(page * size, total);
    return `<div class="pagination-bar">
      <span class="pagination-info">${t('common.showing') || 'Showing'} ${start}–${end} ${t('common.of') || 'of'} ${total}</span>
      <div class="pagination-btns">
        <button class="btn btn-ghost btn-sm" id="hcPagePrev" ${page <= 1 ? 'disabled' : ''}>&lsaquo; ${t('common.prev') || 'Prev'}</button>
        <span class="pagination-info" style="min-width:60px;text-align:center">${page} / ${pages}</span>
        <button class="btn btn-ghost btn-sm" id="hcPageNext" ${page >= pages ? 'disabled' : ''}>${t('common.next') || 'Next'} &rsaquo;</button>
      </div>
    </div>`;
  }

  function renderHCPage() {
    const admin  = (typeof UserProfile !== 'undefined') && UserProfile.isAdmin();
    const vc     = document.getElementById('hcViewContainer');
    if (!vc) return;
    const hcs    = _lastHCs;
    const page   = _hcPage;
    const size   = HC_PAGE_SIZE;
    const slice  = hcs.slice((page - 1) * size, page * size);

    if (_hcView === 'cards') {
      vc.innerHTML = `<div class="hc-card-grid">${slice.map(hc => {
        const score     = hc.avg_score;
        const scoreCls  = score != null ? (score >= 75 ? 'good' : score >= 50 ? 'warn' : 'poor') : '';
        const ownerName = [hc.owner_first_name, hc.owner_last_name].filter(Boolean).join(' ') || hc.owner_email || '—';
        return `
        <div class="hc-card" onclick="App.navigate('healthchecks',{id:${hc.id}})">
          <div class="hc-card-header">
            <div class="hc-card-icon">
              <svg viewBox="0 0 16 16" fill="none" style="width:14px;height:14px"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5 6h6M5 9h6M5 12h3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
            </div>
            <div style="flex:1;min-width:0">
              <div class="hc-card-name">${escHtml(hc.name)}</div>
              <div class="hc-card-customer">${escHtml(hc.customer_name || '—')}</div>
            </div>
            ${score != null ? `<span class="score-pill ${scoreCls}" style="flex-shrink:0">${score}</span>` : ''}
          </div>
          <div class="hc-card-meta">
            <span class="status-pill status-${hc.status}">${ucFirst(hc.status)}</span>
            ${hc.dr_number ? `<span style="color:var(--accent);font-weight:600">${escHtml(hc.dr_number)}</span>` : ''}
            <span>${formatDate(hc.created_at)}</span>
            ${admin && showAllHC ? `<span>· ${escHtml(ownerName)}</span>` : ''}
          </div>
          <div class="hc-card-stats">
            <div><div class="val">${hc.doc_count || 0}</div><div class="lbl">${t('hc.thDocuments')}</div></div>
          </div>
          <div class="hc-card-actions" onclick="event.stopPropagation()">
            <button class="btn btn-ghost btn-sm" onclick="App.navigate('healthchecks',{id:${hc.id}})">${t('common.viewArrow')}</button>
            ${hc.status === 'completed' ? `<button class="btn btn-ghost btn-sm" onclick="App.navigate('report',{hcId:${hc.id}})">${t('common.report')}</button>` : ''}
            <button class="btn btn-ghost btn-sm add-pdfs-btn" title="Add PDFs" data-hc-id="${hc.id}" data-hc-name="${escHtml(hc.name)}">
              <svg viewBox="0 0 16 16" fill="none" style="width:13px;height:13px"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            </button>
            <button class="btn btn-sm" style="color:var(--gray-400);margin-left:auto" onclick="deleteHC(${hc.id})">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8.24903 15.0215C7.84864 15.0215 7.51563 14.7041 7.50098 14.3008L7.25098 7.80078C7.23438 7.38672 7.55762 7.03808 7.97071 7.02246C7.98145 7.02148 7.99122 7.02148 8.00098 7.02148C8.40137 7.02148 8.73438 7.33886 8.74903 7.74218L8.99903 14.2422C9.01563 14.6562 8.69239 15.0049 8.2793 15.0205C8.26856 15.0215 8.25879 15.0215 8.24903 15.0215Z" fill="currentColor"/>
                <path d="M11.751 15.0215C11.7412 15.0215 11.7314 15.0215 11.7207 15.0205C11.3076 15.0049 10.9844 14.6562 11.001 14.2422L11.251 7.74218C11.2656 7.33886 11.5986 7.02148 11.999 7.02148C12.0088 7.02148 12.0186 7.02148 12.0293 7.02246C12.4424 7.03808 12.7656 7.38672 12.749 7.80078L12.499 14.3008C12.4844 14.7041 12.1514 15.0215 11.751 15.0215Z" fill="currentColor"/>
                <path d="M17 4H13.5V3.25C13.5 2.00977 12.4902 1 11.25 1H8.75C7.50977 1 6.5 2.00977 6.5 3.25V4H3C2.58594 4 2.25 4.33594 2.25 4.75C2.25 5.16406 2.58594 5.5 3 5.5H3.52002L3.94238 15.8418C3.99023 17.0518 4.97851 18 6.19043 18H13.8096C15.0215 18 16.0098 17.0518 16.0576 15.8418L16.48 5.5H17C17.4141 5.5 17.75 5.16406 17.75 4.75C17.75 4.33594 17.4141 4 17 4ZM8 3.25C8 2.83691 8.33691 2.5 8.75 2.5H11.25C11.6631 2.5 12 2.83691 12 3.25V4H8V3.25ZM14.5596 15.7812C14.543 16.1846 14.2139 16.5 13.8096 16.5H6.19043C5.78613 16.5 5.45703 16.1846 5.44043 15.7812L5.02075 5.5H14.9792L14.5596 15.7812Z" fill="currentColor"/>
              </svg>  
            </button>
          </div>
        </div>`;
      }).join('')}</div>`;
    } else {
      vc.innerHTML = `<div class="card" style="padding:0;overflow:hidden"><div class="table-wrap">
        <table>
          <thead><tr>
            <th>${t('hc.thName')}</th>
            <th>${t('hc.thCustomer')}</th>
            ${admin && showAllHC ? `<th>${t('hc.thOwner')}</th>` : ''}
            <th>${t('hc.thDr')}</th>
            <th>${t('hc.thDocuments')}</th>
            <th>${t('hc.thAvgScore')}</th>
            <th>${t('hc.thStatus')}</th>
            <th>${t('hc.thDate')}</th>
            <th></th>
          </tr></thead>
          <tbody id="hcListBody">
            ${slice.map(hc => {
              const ownerName = [hc.owner_first_name, hc.owner_last_name].filter(Boolean).join(' ')
                              || hc.owner_email || '—';
              return `
              <tr style="cursor:pointer" onclick="App.navigate('healthchecks',{id:${hc.id}})">
                <td class="font-medium">${escHtml(hc.name)}</td>
                <td>${escHtml(hc.customer_name || '—')}</td>
                ${admin && showAllHC ? `<td class="text-sm text-muted">${escHtml(ownerName)}</td>` : ''}
                <td class="text-sm text-muted">${hc.dr_number ? `<span style="color:var(--accent);font-weight:600">${escHtml(hc.dr_number)}</span>` : '—'}</td>
                <td>${hc.doc_count || 0}</td>
                <td>${hc.avg_score != null ? `<span class="score-pill ${hc.avg_score >= 75 ? 'good' : hc.avg_score >= 50 ? 'warn' : 'poor'}">${hc.avg_score}</span>` : '<span class="text-muted text-sm">—</span>'}</td>
                <td><span class="status-pill status-${hc.status}">${ucFirst(hc.status)}</span></td>
                <td class="text-sm text-muted">${formatDate(hc.created_at)}</td>
                <td style="white-space:nowrap">
                  <button class="btn btn-ghost btn-sm">${t('common.viewArrow')}</button>
                  ${hc.status === 'completed' ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();App.navigate('report',{hcId:${hc.id}})">${t('common.report')}</button>` : ''}
                  <button class="btn btn-ghost btn-sm add-pdfs-btn" title="Add PDFs" data-hc-id="${hc.id}" data-hc-name="${escHtml(hc.name)}">
                    <svg viewBox="0 0 16 16" fill="none" style="width:13px;height:13px"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
                  </button>
                  <button class="btn btn-sm" style="color:var(--gray-400)" onclick="event.stopPropagation();deleteHC(${hc.id})">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M8.24903 15.0215C7.84864 15.0215 7.51563 14.7041 7.50098 14.3008L7.25098 7.80078C7.23438 7.38672 7.55762 7.03808 7.97071 7.02246C7.98145 7.02148 7.99122 7.02148 8.00098 7.02148C8.40137 7.02148 8.73438 7.33886 8.74903 7.74218L8.99903 14.2422C9.01563 14.6562 8.69239 15.0049 8.2793 15.0205C8.26856 15.0215 8.25879 15.0215 8.24903 15.0215Z" fill="currentColor"/>
<path d="M11.751 15.0215C11.7412 15.0215 11.7314 15.0215 11.7207 15.0205C11.3076 15.0049 10.9844 14.6562 11.001 14.2422L11.251 7.74218C11.2656 7.33886 11.5986 7.02148 11.999 7.02148C12.0088 7.02148 12.0186 7.02148 12.0293 7.02246C12.4424 7.03808 12.7656 7.38672 12.749 7.80078L12.499 14.3008C12.4844 14.7041 12.1514 15.0215 11.751 15.0215Z" fill="currentColor"/>
<path d="M17 4H13.5V3.25C13.5 2.00977 12.4902 1 11.25 1H8.75C7.50977 1 6.5 2.00977 6.5 3.25V4H3C2.58594 4 2.25 4.33594 2.25 4.75C2.25 5.16406 2.58594 5.5 3 5.5H3.52002L3.94238 15.8418C3.99023 17.0518 4.97851 18 6.19043 18H13.8096C15.0215 18 16.0098 17.0518 16.0576 15.8418L16.48 5.5H17C17.4141 5.5 17.75 5.16406 17.75 4.75C17.75 4.33594 17.4141 4 17 4ZM8 3.25C8 2.83691 8.33691 2.5 8.75 2.5H11.25C11.6631 2.5 12 2.83691 12 3.25V4H8V3.25ZM14.5596 15.7812C14.543 16.1846 14.2139 16.5 13.8096 16.5H6.19043C5.78613 16.5 5.45703 16.1846 5.44043 15.7812L5.02075 5.5H14.9792L14.5596 15.7812Z" fill="currentColor"/>
</svg>
                  </button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div></div>`;
    }

    // Wire "Add PDFs" buttons
    vc.querySelectorAll('.add-pdfs-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        window.openAddPdfsModal(+btn.dataset.hcId, btn.dataset.hcName);
      });
    });

    // Append pagination
    const pagHtml = hcPaginationHtml(hcs.length, page, size);
    if (pagHtml) {
      const pagDiv = document.createElement('div');
      pagDiv.innerHTML = pagHtml;
      vc.appendChild(pagDiv.firstElementChild);
      document.getElementById('hcPagePrev').onclick = () => { _hcPage--; renderHCPage(); };
      document.getElementById('hcPageNext').onclick = () => { _hcPage++; renderHCPage(); };
    }
  }

  async function render(container, params = {}) {
    if (params.id) return renderDetail(container, params.id);
    if (params.action === 'new') {
      if (typeof YukonChat !== 'undefined') YukonChat.setContext(null);
      return renderNew(container, params);
    }
    if (typeof YukonChat !== 'undefined') YukonChat.setContext(null);
    return renderList(container);
  }

  /* ── List ─────────────────────────────────────────────────── */
  async function renderList(container) {
    _listContainer = container;
    const admin = (typeof UserProfile !== 'undefined') && UserProfile.isAdmin();

    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-row">
          <div><h1>${t('hc.title')}</h1><p>${showAllHC ? t('hc.subtitleAll') : t('hc.subtitleMine')}</p></div>
          <button class="btn btn-primary" onclick="App.navigate('healthchecks',{action:'new'})">
            <svg viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            ${t('common.newHealthCheck')}
          </button>
        </div>
      </div>
      <div class="filter-bar">
        ${admin ? `
        <div class="scope-toggle">
          <button class="scope-toggle-btn ${!showAllHC ? 'active' : ''}" id="hcScopeMine">${t('hc.myHc')}</button>
          <button class="scope-toggle-btn ${showAllHC  ? 'active' : ''}" id="hcScopeAll">${t('hc.allHc')}</button>
        </div>` : ''}
        <div class="filter-group" id="hcStatusFilter">
          <button class="filter-btn active" data-status="">${t('hc.filterAll')}</button>
          <button class="filter-btn" data-status="completed">${t('hc.filterCompleted')}</button>
          <button class="filter-btn" data-status="processing">${t('hc.filterProcessing')}</button>
          <button class="filter-btn" data-status="failed">${t('hc.filterFailed')}</button>
        </div>
        <select class="filter-select" id="hcCustFilter"><option value="">${t('hc.allCustomers')}</option></select>
        <div class="view-toggle" id="hcViewToggle">
          <button class="view-toggle-btn ${_hcView === 'cards' ? 'active' : ''}" data-view="cards" title="Card view">
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14"><rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.4"/></svg>
          </button>
          <button class="view-toggle-btn ${_hcView === 'table' ? 'active' : ''}" data-view="table" title="Table view">
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14"><path d="M1 4h14M1 8h14M1 12h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
      <div id="hcViewContainer">
        <div class="flex items-center gap-8" style="justify-content:center;color:var(--gray-400);padding:20px">
          <div class="loading-spinner"></div> ${t('hc.loading')}
        </div>
      </div>`;

    if (admin) {
      document.getElementById('hcScopeMine').onclick = () => { showAllHC = false; _hcPage = 1; renderList(container); };
      document.getElementById('hcScopeAll').onclick  = () => { showAllHC = true;  _hcPage = 1; renderList(container); };
    }

    document.getElementById('hcStatusFilter').onclick = e => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      document.querySelectorAll('#hcStatusFilter .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadList();
    };
    document.getElementById('hcCustFilter').onchange = loadList;

    document.querySelectorAll('#hcViewToggle .view-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _hcView = btn.dataset.view;
        _hcPage = 1;
        localStorage.setItem('hcapp_hc_view', _hcView);
        document.querySelectorAll('#hcViewToggle .view-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
        if (_lastHCs.length) renderHCPage(); else loadList();
      });
    });

    try {
      // Populate customer filter — use all=1 when showing all so filter covers everyone's customers
      const cusRes = await API.customers.list(showAllHC ? { all: 1 } : {});
      const custSel = document.getElementById('hcCustFilter');
      (cusRes.data || []).forEach(c => custSel.add(new Option(c.display_name, c.id)));
      if (typeof SearchableSelect !== 'undefined') new SearchableSelect(custSel, { placeholder: 'Search customers…' });
    } catch {}
    loadList();
  }

  async function loadList() {
    const admin  = (typeof UserProfile !== 'undefined') && UserProfile.isAdmin();
    const status = document.querySelector('#hcStatusFilter .filter-btn.active')?.dataset.status || '';
    const custId = document.getElementById('hcCustFilter')?.value || '';
    const vc     = document.getElementById('hcViewContainer');
    if (!vc) return;

    try {
      const params = {};
      if (status)  params.status      = status;
      if (custId)  params.customer_id = custId;
      if (showAllHC && admin) params.all = 1;

      const res = await API.healthChecks.list(params);
      const hcs = res.data || [];

      if (!hcs.length) {
        vc.innerHTML = `<div class="empty-state" style="padding:30px">
          <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/></svg>
          <h3>${t('hc.noFound')}</h3><p>${t('hc.noFoundSub')}</p>
        </div>`;
        _lastHCs = [];
        return;
      }

      _lastHCs  = hcs;
      _hcPage   = 1;
      renderHCPage();
    } catch (e) {
      vc.innerHTML = `<div class="connection-banner">${e.message}</div>`;
    }
  }

  window.deleteHC = async function(id) {
    if (!confirm(t('hc.deleteConfirm'))) return;
    try {
      await API.healthChecks.delete(id);
      Toast.show(t('toast.hcDeleted'), 'success');
      loadList();
    } catch (e) { Toast.show(e.message, 'error'); }
  };

  // Defined at module level so it works from both the list AND detail views
  window.openAddPdfsModal = async function(hcId, hcName) {
    let settings = {};
    try { if (window.electronAPI) settings = await window.electronAPI.getSettings() || {}; } catch {}
    try {
      const r = await API.appSettings.get();
      const d = r.data || {};
      if (d.crawler_max_pdfs)  settings.crawlerMaxPdfs  = d.crawler_max_pdfs;
      if (d.crawler_max_depth) settings.crawlerMaxDepth = d.crawler_max_depth;
      if (d.crawler_timeout)   settings.crawlerTimeout  = d.crawler_timeout;
    } catch {}
    const defaultMaxPdfs = settings.crawlerMaxPdfs || 20;

    let modalFiles = [];

    // ── Build modal HTML ──────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'add-pdfs-overlay';

    overlay.innerHTML = `
      <div class="add-pdfs-dialog">
        <div class="add-pdfs-header">
          <div class="add-pdfs-title">${t('addPdfs.heading')}</div>
          <div class="add-pdfs-subtitle">${t('hc.addingTo', { name: escHtml(hcName) })}</div>
        </div>

        <div class="add-pdfs-body">

          <!-- Source tabs -->
          <div class="add-source-tabs">
            <button class="add-source-tab active" data-mode="upload">${t('addPdfs.uploadTab')}</button>
            <button class="add-source-tab" data-mode="crawl">${t('addPdfs.crawlTab')}</button>
            <button class="add-source-tab" data-mode="both">${t('addPdfs.bothTab')}</button>
          </div>

          <!-- Upload section -->
          <div id="addUploadSection">
            <div id="addDropZone" class="add-drop-zone">
              <div style="font-size:32px;margin-bottom:8px">📄</div>
              <div class="add-drop-hint">${t('addPdfs.dropHint')} <span class="add-browse-link" id="addBrowseLink">${t('addPdfs.browseLink')}</span></div>
              <div class="add-drop-size-hint">${t('addPdfs.dropSizeHint')}</div>
            </div>
            <input type="file" id="addFileInput" accept=".pdf" multiple style="display:none">
            <div id="addFileList" style="margin-top:10px"></div>
          </div>

          <!-- Crawl section -->
          <div id="addCrawlSection" style="display:none">
            <div class="add-crawl-modes">
              <button class="add-crawl-mode-btn active" data-crawl-mode="crawl">${t('addPdfs.pageCrawl')}</button>
              <button class="add-crawl-mode-btn" data-crawl-mode="search">${t('addPdfs.searchEngine')}</button>
            </div>
            <div style="margin-bottom:14px">
              <label class="add-field-label" id="addCrawlLabel">${t('addPdfs.domainsLabel')} <span class="add-required">*</span></label>
              <textarea id="addCrawlInput" class="form-input crawl-domains-input"
                placeholder="philips.com&#10;*.philips.com" rows="4" spellcheck="false"
                style="font-size:13px;width:100%;box-sizing:border-box"></textarea>
              <div id="addCrawlHint" class="add-crawl-hint">
                One domain per line. Use <code class="add-code">*.domain.com</code> to include all subdomains.
              </div>
            </div>
            <div>
              <label class="add-field-label">${t('addPdfs.maxPdfsLabel')}</label>
              <input id="addMaxPdfs" class="form-input" type="number" min="1" max="200" value="${defaultMaxPdfs}"
                style="max-width:120px;text-align:center;font-size:14px">
            </div>
          </div>

        </div>

        <div class="add-pdfs-footer">
          <button id="addCancelBtn" class="btn btn-secondary" style="font-size:14px;padding:9px 20px">${t('addPdfs.cancelBtn')}</button>
          <button id="addStartBtn" class="btn btn-primary" style="font-size:14px;padding:9px 20px">
            <svg viewBox="0 0 16 16" fill="none" style="width:13px;height:13px"><path d="M5 3l8 5-8 5V3z" fill="currentColor"/></svg>
            ${t('addPdfs.startBtn')}
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    // Trigger enter animation on the next two frames (matches pm-overlay pattern)
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('is-open')));

    // ── Source tab switching ───────────────────────────────────────────────────
    const uploadSection = overlay.querySelector('#addUploadSection');
    const crawlSection  = overlay.querySelector('#addCrawlSection');

    overlay.querySelectorAll('.add-source-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.add-source-tab').forEach(b => b.classList.toggle('active', b === btn));
        const m = btn.dataset.mode;
        uploadSection.style.display = m !== 'crawl'  ? '' : 'none';
        crawlSection.style.display  = m !== 'upload' ? '' : 'none';
      });
    });

    // ── Crawl mode toggle ─────────────────────────────────────────────────────
    function applyAddCrawlMode(mode) {
      const label = overlay.querySelector('#addCrawlLabel');
      const input = overlay.querySelector('#addCrawlInput');
      const hint  = overlay.querySelector('#addCrawlHint');
      overlay.querySelectorAll('.add-crawl-mode-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.crawlMode === mode));
      if (mode === 'search') {
        label.innerHTML   = `${t('addPdfs.searchLabel')} <span>*</span>`;
        input.placeholder = 'philips.com\ncompany.com';
        hint.textContent  = 'One domain per line — site: and filetype:pdf are added automatically.';
      } else {
        label.innerHTML   = `${t('addPdfs.domainsLabel')} <span>*</span>`;
        input.placeholder = 'philips.com\n*.philips.com';
        hint.innerHTML    = `One domain per line. Use <code class="add-code">*.domain.com</code> for all subdomains.`;
      }
    }
    overlay.querySelectorAll('.add-crawl-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => applyAddCrawlMode(btn.dataset.crawlMode));
    });

    // ── Upload zone ───────────────────────────────────────────────────────────
    const dropZone  = overlay.querySelector('#addDropZone');
    const fileInput = overlay.querySelector('#addFileInput');
    overlay.querySelector('#addBrowseLink').onclick = () => fileInput.click();
    dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent)'; });
    dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = ''; });
    dropZone.addEventListener('drop', e => {
      e.preventDefault(); dropZone.style.borderColor = '';
      addModalFiles([...e.dataTransfer.files]);
    });
    fileInput.addEventListener('change', () => { addModalFiles([...fileInput.files]); fileInput.value = ''; });

    function addModalFiles(files) {
      files.filter(f => f.name.toLowerCase().endsWith('.pdf')).forEach(f => {
        if (!modalFiles.find(x => x.name === f.name && x.size === f.size)) {
          modalFiles.push({ name: f.name, size: f.size, isElectron: false, file: f });
        }
      });
      renderModalFileList();
    }

    function renderModalFileList() {
      const list = overlay.querySelector('#addFileList');
      if (!modalFiles.length) { list.innerHTML = ''; return; }
      list.innerHTML = modalFiles.map((f, i) => `
        <div class="file-item">
          <div class="file-icon"><svg viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5 6h6M5 9h6M5 12h4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg></div>
          <div class="file-info"><div class="file-name">${escHtml(f.name)}</div><div class="file-size">${formatBytes(f.size)}</div></div>
          <button class="file-remove" data-idx="${i}"><svg viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
        </div>`).join('');
      list.querySelectorAll('.file-remove').forEach(btn => {
        btn.addEventListener('click', () => { modalFiles.splice(+btn.dataset.idx, 1); renderModalFileList(); });
      });
    }

    // ── Electron file picker (drag handles won't work — use dialog) ───────────
    if (window.electronAPI) {
      dropZone.addEventListener('click', async () => {
        const paths = await window.electronAPI.openFileDialog();
        if (!paths?.length) return;
        const entries = paths.map(p => ({ name: p.split(/[\\/]/).pop(), size: 0, isElectron: true, path: p }));
        entries.forEach(e => { if (!modalFiles.find(x => x.path === e.path)) modalFiles.push(e); });
        renderModalFileList();
      });
      overlay.querySelector('#addBrowseLink').onclick = async () => {
        const paths = await window.electronAPI.openFileDialog();
        if (!paths?.length) return;
        const entries = paths.map(p => ({ name: p.split(/[\\/]/).pop(), size: 0, isElectron: true, path: p }));
        entries.forEach(e => { if (!modalFiles.find(x => x.path === e.path)) modalFiles.push(e); });
        renderModalFileList();
      };
    }

    // ── Close ─────────────────────────────────────────────────────────────────
    const close = () => {
      overlay.classList.remove('is-open');
      setTimeout(() => overlay.remove(), 220);
    };
    overlay.querySelector('#addCancelBtn').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // ── Submit ────────────────────────────────────────────────────────────────
    overlay.querySelector('#addStartBtn').addEventListener('click', async () => {
      const sourceMode = overlay.querySelector('.add-source-tab.active')?.dataset.mode || 'upload';
      const needsUpload = sourceMode !== 'crawl';
      const needsCrawl  = sourceMode !== 'upload';

      const crawlMode   = overlay.querySelector('.add-crawl-mode-btn.active')?.dataset.crawlMode || 'crawl';
      const crawlInput  = (overlay.querySelector('#addCrawlInput')?.value || '').trim();
      const maxPdfs     = Math.max(1, Math.min(200, parseInt(overlay.querySelector('#addMaxPdfs')?.value) || 20));
      const crawlDomains = crawlMode !== 'search' ? crawlInput.split('\n').map(d => d.trim()).filter(Boolean) : [];
      const hasCrawlInput = crawlMode === 'search' ? !!crawlInput : crawlDomains.length > 0;

      if (needsUpload && !modalFiles.length)  { Toast.show(t('addPdfs.needFile'), 'warning'); return; }
      if (needsCrawl  && !hasCrawlInput)       { Toast.show(crawlMode === 'search' ? t('addPdfs.needSearchDomain') : t('addPdfs.needDomain'), 'warning'); return; }

      let crawlConfig = null;
      if (hasCrawlInput) {
        if (crawlMode === 'search') {
          crawlConfig = { search_query: buildSearchQuery(crawlInput), max_pdfs: maxPdfs };
        } else {
          crawlConfig = { domains: crawlDomains, max_pdfs: maxPdfs,
            max_depth: settings.crawlerMaxDepth || 3, timeout: settings.crawlerTimeout || 8 };
        }
      }

      close();
      UploadProgress.startJob(hcId, hcName, needsUpload ? [...modalFiles] : [], settings, crawlConfig);
      Toast.show(t('toast.pdfsAdding'), 'success', 4000);
    });
  };

  // Build a search engine query from one or more raw domain lines.
  // "*.philips.com" → "site:philips.com filetype:pdf"
  // Multiple lines  → "(site:a.com OR site:b.com) filetype:pdf"
  function buildSearchQuery(rawInput) {
    const domains = rawInput.split('\n')
      .map(d => d.trim()
        .replace(/^\*\./, '')           // strip wildcard prefix
        .replace(/^https?:\/\//, '')    // strip protocol
        .replace(/\/.*$/, '')           // strip path
        .toLowerCase())
      .filter(Boolean);
    if (domains.length === 0) return '';
    const siteTerms = domains.map(d => `site:${d}`);
    const siteExpr  = siteTerms.length === 1 ? siteTerms[0] : `(${siteTerms.join(' OR ')})`;
    return `${siteExpr} filetype:pdf`;
  }

  /* ── New Health Check ──────────────────────────────────────── */
  async function renderNew(container, params = {}) {
    let customers = [];
    try { const r = await API.customers.list(); customers = r.data || []; } catch {}

    pendingFiles = [];

    // Pre-fill consultant details from saved profile
    const prof = (typeof UserProfile !== 'undefined') ? (UserProfile.get() || {}) : {};

    // Read crawler defaults from saved settings, enriched with server-side values
    let settings = {};
    try { if (window.electronAPI) settings = await window.electronAPI.getSettings() || {}; } catch {}
    try {
      const r = await API.appSettings.get();
      const d = r.data || {};
      if (d.crawler_max_pdfs)  settings.crawlerMaxPdfs  = d.crawler_max_pdfs;
      if (d.crawler_max_depth) settings.crawlerMaxDepth = d.crawler_max_depth;
      if (d.crawler_timeout)   settings.crawlerTimeout  = d.crawler_timeout;
    } catch {}
    const defaultMaxPdfs = settings.crawlerMaxPdfs || 20;

    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-row">
          <div>
            <button class="btn btn-ghost btn-sm" style="margin-bottom:6px" onclick="App.navigate('healthchecks')">
              <svg viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              ${t('hc.backBtn')}
            </button>
            <h1>${t('hc.newTitle')}</h1>
            <p>${t('hc.newSubtitle')}</p>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:400px 1fr;gap:24px;align-items:start">
        <!-- Left: metadata -->
        <div>
          <div class="card" style="margin-bottom:16px">
            <div class="section-title"><span>${t('hcNew.detailsSection')}</span></div>
            <div class="form-group">
              <label class="form-label">${t('hcNew.nameLabel')} <span>*</span></label>
              <input id="hcName" class="form-input" placeholder="${t('hcNew.namePlaceholder')}">
              <div id="hcNameErr" style="color:var(--red);font-size:12px;margin-top:3px"></div>
            </div>
            <div class="form-group">
              <label class="form-label">${t('hcNew.customerLabel')} <span>*</span></label>
              <select id="hcCustomer" class="form-select">
                <option value="">${t('hcNew.selectCustomer')}</option>
                ${customers.map(c => `<option value="${c.id}" ${params.customerId == c.id ? 'selected' : ''}>${escHtml(c.display_name)}</option>`).join('')}
              </select>
              <div style="margin-top:6px"><button class="btn btn-ghost btn-sm" id="newCustLink">${t('hcNew.newCustomerLink')}</button></div>
              <div id="hcCustErr" style="color:var(--red);font-size:12px;margin-top:3px"></div>
            </div>
            <div class="form-group">
              <label class="form-label">${t('hcNew.drLabel')} <span style="color:var(--gray-400);font-weight:400">${t('hcNew.drOptional')}</span></label>
              <input id="hcDrNumber" class="form-input" placeholder="${t('hcNew.drPlaceholder')}">
              <div style="font-size:11px;color:var(--gray-500);margin-top:4px">${t('hcNew.drHint')}</div>
            </div>
            <div class="divider"></div>
            <button class="btn btn-primary" style="width:100%;justify-content:center" id="startHcBtn">
              <svg viewBox="0 0 16 16" fill="none"><path d="M5 3l8 5-8 5V3z" fill="currentColor"/></svg>
              ${t('hcNew.startBtn')}
            </button>
          </div>
        </div>

        <!-- Right: source selector -->
        <div>

          <!-- Mode tab card -->
          <div class="card source-card" style="margin-bottom:16px;padding:0;overflow:visible">

            <!-- Tab bar -->
            <div class="source-tabs">
              <button class="source-tab active" data-mode="upload">
                <svg viewBox="0 0 16 16" fill="none" style="width:14px;height:14px"><rect x="2" y="2" width="12" height="14" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M5 6h6M5 9h6M5 12h4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
                ${t('hcNew.uploadTab')}
              </button>
              <button class="source-tab" data-mode="crawl">
                <svg viewBox="0 0 16 16" fill="none" style="width:14px;height:14px"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4"/><path d="M8 2c0 0-3 2-3 6s3 6 3 6M8 2c0 0 3 2 3 6s-3 6-3 6M2 8h12" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
                ${t('hcNew.crawlTab')}
              </button>
              <button class="source-tab" data-mode="both">
                <svg viewBox="0 0 16 16" fill="none" style="width:14px;height:14px"><rect x="1" y="3" width="8" height="10" rx="1.2" stroke="currentColor" stroke-width="1.4"/><path d="M11 5h3M11 8h3M11 11h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
                ${t('hcNew.bothTab')}
              </button>
            </div>

            <!-- Upload section -->
            <div id="uploadSection" style="padding:20px">
              <div class="upload-zone" id="uploadZone">
                <div class="upload-icon">
                  <svg viewBox="0 0 40 40" fill="none"><rect x="8" y="4" width="24" height="32" rx="3" stroke="currentColor" stroke-width="2"/><path d="M14 16h12M14 21h12M14 26h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M28 4v10h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                <h3>${t('hcNew.dropZoneTitle')}</h3>
                <p>${t('hcNew.dropZoneOr')} <span class="browse-link" id="browseLink">${t('hcNew.browseLink')}</span></p>
                <p style="margin-top:6px">${t('hcNew.dropZoneHint')}</p>
              </div>
              <input type="file" id="fileInput" accept=".pdf" multiple style="display:none">
            </div>

            <!-- Crawl section -->
            <div id="crawlSection" style="padding:20px;display:none">

              <!-- Discovery mode toggle -->
              <div style="margin-bottom:16px">
                <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--gray-500);margin-bottom:8px">${t('hcNew.discoveryMethod')}</div>
                <div style="display:flex;gap:8px">
                  <button class="crawl-mode-btn active" data-crawl-mode="crawl"
                    style="padding:8px 14px;font-size:12px;font-weight:500;background:var(--accent);color:#fff;border:2px solid var(--accent);border-radius:7px;cursor:pointer;display:flex;align-items:center;gap:6px;line-height:1.3;text-align:left">
                    <svg viewBox="0 0 14 14" fill="none" style="width:13px;height:13px;flex-shrink:0"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.3"/><path d="M7 1.5c0 0-2.5 1.5-2.5 5.5s2.5 5.5 2.5 5.5M7 1.5c0 0 2.5 1.5 2.5 5.5S7 12.5 7 12.5M1.5 7h11" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>
                    <span><strong>${t('hcNew.pageCrawl')}</strong><br><span style="font-weight:400;font-size:11px;opacity:.85">${t('hcNew.pageCrawlSub')}</span></span>
                  </button>
                  <button class="crawl-mode-btn" data-crawl-mode="search"
                    style="padding:8px 14px;font-size:12px;font-weight:500;background:none;color:var(--gray-700);border:2px solid var(--gray-200);border-radius:7px;cursor:pointer;display:flex;align-items:center;gap:6px;line-height:1.3;text-align:left">
                    <svg viewBox="0 0 14 14" fill="none" style="width:13px;height:13px;flex-shrink:0"><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.3"/><path d="M9.5 9.5L12.5 12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
                    <span><strong>${t('hcNew.searchEngine')}</strong><br><span style="font-weight:400;font-size:11px;opacity:.75">${t('hcNew.searchEngineSub')}</span></span>
                  </button>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" id="crawlInputLabel">${t('hcNew.domainsLabel')} <span>*</span></label>
                <textarea id="crawlInput" class="form-input crawl-domains-input"
                  placeholder="philips.com&#10;*.philips.com&#10;docs.company.com"
                  rows="5" spellcheck="false"></textarea>
                <div id="crawlInputHint" style="font-size:11px;color:var(--gray-500);margin-top:5px;line-height:1.6">
                  One domain per line. Use <code style="background:var(--gray-100);padding:1px 4px;border-radius:3px">*.domain.com</code>
                  to include all subdomains. Sitemaps are checked automatically.
                </div>
              </div>
              <div class="form-row" style="align-items:flex-end;gap:16px">
                <div class="form-group" style="flex:0 0 160px;margin:0">
                  <label class="form-label">${t('hcNew.maxPdfsLabel')}</label>
                  <input id="crawlMaxPdfs" class="form-input" type="number" min="1" max="200" value="${defaultMaxPdfs}"
                    style="text-align:center">
                </div>
                <div id="crawlMaxHint" style="font-size:12px;color:var(--gray-400);padding-bottom:4px;line-height:1.5">
                  ${t('hcNew.crawlStopsHint')}
                </div>
              </div>
            </div>

          </div>

          <!-- File list (upload + both modes) -->
          <div id="fileListWrap" style="display:none">
            <div class="section-title">
              <span id="fileListTitle">0 ${t('hcNew.filesSelected', { count: 0, s: 's' })}</span>
              <button class="btn btn-secondary btn-sm" id="clearFilesBtn">${t('hcNew.clearAll')}</button>
            </div>
            <div class="file-list" id="fileList"></div>
          </div>

        </div>
      </div>`;

    // SearchableSelect on the customer picker in the new-HC form
    const hcCustEl = document.getElementById('hcCustomer');
    if (hcCustEl && typeof SearchableSelect !== 'undefined') {
      new SearchableSelect(hcCustEl, { placeholder: 'Search customers…' });
    }

    // ── Crawl discovery-mode toggle (Page Crawl ↔ Search Engine) ──
    function applyCrawlMode(mode) {
      const label = document.getElementById('crawlInputLabel');
      const input = document.getElementById('crawlInput');
      const hint  = document.getElementById('crawlInputHint');
      document.querySelectorAll('.crawl-mode-btn').forEach(b => {
        const active = b.dataset.crawlMode === mode;
        b.classList.toggle('active', active);
        b.style.background   = active ? 'var(--accent)' : 'none';
        b.style.color        = active ? '#fff' : 'var(--gray-700)';
        b.style.borderColor  = active ? 'var(--accent)' : 'var(--gray-200)';
      });
      if (mode === 'search') {
        label.innerHTML   = `${t('hcNew.searchDomainsLabel')} <span>*</span>`;
        input.placeholder = 'philips.com\ncompany.com';
        hint.innerHTML    = 'One domain per line. <code style="background:var(--gray-100);padding:1px 4px;border-radius:3px">*.domain.com</code> wildcards are supported. <code style="background:var(--gray-100);padding:1px 4px;border-radius:3px">site:</code> and <code style="background:var(--gray-100);padding:1px 4px;border-radius:3px">filetype:pdf</code> are added automatically.';
      } else {
        label.innerHTML  = `${t('hcNew.domainsLabel')} <span>*</span>`;
        input.placeholder = 'philips.com\n*.philips.com\ndocs.company.com';
        hint.innerHTML   = 'One domain per line. Use <code style="background:var(--gray-100);padding:1px 4px;border-radius:3px">*.domain.com</code> to include all subdomains. Sitemaps are checked automatically.';
      }
    }

    // ── Source-mode tab switching ──────────────────────────────
    document.querySelectorAll('.source-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.source-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        document.getElementById('uploadSection').style.display = (mode !== 'crawl') ? '' : 'none';
        document.getElementById('crawlSection').style.display  = (mode !== 'upload') ? '' : 'none';
        // File list only relevant when uploading
        if (mode === 'crawl') document.getElementById('fileListWrap').style.display = 'none';
        else renderFileList();
      });
    });

    document.querySelectorAll('.crawl-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => applyCrawlMode(btn.dataset.crawlMode));
    });

    setupUploadZone();

    document.getElementById('newCustLink').onclick = () => {
      CustomersView.openCustomerForm(null, {
        onCreate: (newCust) => {
          const sel = document.getElementById('hcCustomer');
          if (sel) {
            // Add the new customer option and select it
            const opt = new Option(newCust.display_name, newCust.id, true, true);
            sel.add(opt);
            sel.value = newCust.id;
          }
        }
      });
    };

    document.getElementById('startHcBtn').onclick = startAnalysis;
  }

  function setupUploadZone() {
    const zone    = document.getElementById('uploadZone');
    const input   = document.getElementById('fileInput');
    const browse  = document.getElementById('browseLink');

    browse.onclick = () => input.click();

    input.onchange = e => addFiles([...e.target.files]);

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      addFiles([...e.dataTransfer.files].filter(f => f.type === 'application/pdf'));
    });

    document.getElementById('clearFilesBtn').onclick = () => {
      pendingFiles = [];
      renderFileList();
    };

    // Electron native file picker
    zone.addEventListener('dblclick', async () => {
      if (window.electronAPI) {
        const paths = await window.electronAPI.openFileDialog();
        if (paths.length) {
          const fileObjs = paths.map(p => ({ isElectron: true, path: p, name: p.split(/[\\/]/).pop(), size: 0 }));
          addFiles(fileObjs);
        }
      }
    });
  }

  function addFiles(files) {
    const MAX = 50 * 1024 * 1024;
    files.forEach(f => {
      if (f.size > MAX && !f.isElectron) { Toast.show(`${f.name} exceeds 50 MB limit.`, 'warning'); return; }
      if (pendingFiles.find(p => p.name === f.name)) return; // dedupe
      pendingFiles.push(f);
    });
    renderFileList();
  }

  function formatBytes(b) {
    if (!b) return '—';
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }

  function renderFileList() {
    const wrap  = document.getElementById('fileListWrap');
    const list  = document.getElementById('fileList');
    const title = document.getElementById('fileListTitle');
    if (!pendingFiles.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    title.textContent = t('hcNew.filesSelected', { count: pendingFiles.length, s: pendingFiles.length !== 1 ? 's' : '' });
    list.innerHTML = pendingFiles.map((f, i) => `
      <div class="file-item">
        <div class="file-icon">
          <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5 6h6M5 9h6M5 12h4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
        </div>
        <div class="file-info">
          <div class="file-name">${escHtml(f.name)}</div>
          <div class="file-size">${formatBytes(f.size)}</div>
        </div>
        <button class="file-remove" onclick="HealthCheckView.removeFile(${i})" title="Remove">
          <svg viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>`).join('');
  }

  function removeFile(idx) {
    pendingFiles.splice(idx, 1);
    renderFileList();
  }

  async function startAnalysis() {
    const name      = document.getElementById('hcName').value.trim();
    const custId    = document.getElementById('hcCustomer').value;
    const drNumber  = document.getElementById('hcDrNumber').value.trim();

    // Owner info always comes from the saved user profile
    const _prof     = typeof UserProfile !== 'undefined' ? UserProfile.get() : {};
    const firstName = (_prof.firstName || '').trim();
    const lastName  = (_prof.lastName  || '').trim();
    const email     = (_prof.email     || '').trim().toLowerCase();

    // Determine source mode and crawl config
    const sourceMode   = document.querySelector('.source-tab.active')?.dataset.mode || 'upload';
    const needsUpload  = sourceMode !== 'crawl';
    const needsCrawl   = sourceMode !== 'upload';

    const crawlDiscoveryMode = document.querySelector('.crawl-mode-btn.active')?.dataset.crawlMode || 'crawl';
    let crawlInput   = '';
    let crawlDomains = [];
    let crawlMaxPdfs = 20;
    if (needsCrawl) {
      crawlInput   = (document.getElementById('crawlInput')?.value || '').trim();
      crawlMaxPdfs = Math.max(1, Math.min(200, parseInt(document.getElementById('crawlMaxPdfs')?.value) || 20));
      if (crawlDiscoveryMode !== 'search') {
        crawlDomains = crawlInput.split('\n').map(d => d.trim()).filter(Boolean);
      }
    }

    let valid = true;
    document.getElementById('hcNameErr').textContent = '';
    document.getElementById('hcCustErr').textContent = '';

    if (!name)   { document.getElementById('hcNameErr').textContent = t('hcNew.nameRequired');     valid = false; }
    if (!custId) { document.getElementById('hcCustErr').textContent = t('hcNew.customerRequired'); valid = false; }

    // Owner details come from the user profile — surface a friendly prompt if incomplete
    if (!firstName || !lastName || !email) {
      Toast.show(t('hcNew.profileIncomplete'), 'warning', 6000);
      if (typeof UserProfile !== 'undefined') UserProfile.showSetupModal({ allowCancel: true });
      return;
    }
    if (!email.endsWith('@adobe.com')) {
      Toast.show(t('hcNew.emailInvalid'), 'warning', 5000);
      if (typeof UserProfile !== 'undefined') UserProfile.showSetupModal({ allowCancel: true });
      return;
    }

    // Source validation
    const hasCrawlInput = crawlDiscoveryMode === 'search' ? !!crawlInput : crawlDomains.length > 0;
    if (sourceMode === 'upload' && !pendingFiles.length) {
      Toast.show(t('hcNew.uploadAtLeastOne'), 'warning'); valid = false;
    } else if (sourceMode === 'crawl' && !hasCrawlInput) {
      Toast.show(crawlDiscoveryMode === 'search' ? t('hcNew.enterSearchQuery') : t('hcNew.enterDomain'), 'warning'); valid = false;
    } else if (sourceMode === 'both' && !pendingFiles.length && !hasCrawlInput) {
      Toast.show(t('hcNew.uploadOrCrawl'), 'warning'); valid = false;
    }

    if (!valid) return;

    const btn = document.getElementById('startHcBtn');
    btn.disabled = true;
    btn.innerHTML = `<div class="loading-spinner sm"></div> ${t('hcNew.creatingBtn')}`;

    let hcId;
    try {
      const hc = await API.healthChecks.create({
        name,
        customer_id:       custId,
        owner_first_name:  firstName,
        owner_last_name:   lastName,
        owner_email:       email,
        dr_number:         drNumber || null,
      });
      hcId = hc.data.id;
      // Fire-and-forget: upload HC summary to Yukon collection (if configured)
      Yukon.uploadHCDocument(hc.data).catch(() => {});
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 16 16" fill="none"><path d="M5 3l8 5-8 5V3z" fill="currentColor"/></svg> ${t('hcNew.startBtn')}`;
      Toast.show(e.message, 'error');
      return;
    }

    // Get Adobe credentials for the background job
    const jobSettings = window.electronAPI ? (await window.electronAPI.getSettings() || {}) : {};
    try {
      const r = await API.appSettings.get();
      const d = r.data || {};
      if (d.crawler_max_pdfs)  jobSettings.crawlerMaxPdfs  = d.crawler_max_pdfs;
      if (d.crawler_max_depth) jobSettings.crawlerMaxDepth = d.crawler_max_depth;
      if (d.crawler_timeout)   jobSettings.crawlerTimeout  = d.crawler_timeout;
    } catch {}

    // Build crawl config (null = no crawling)
    let crawlConfig = null;
    if (hasCrawlInput) {
      if (crawlDiscoveryMode === 'search') {
        crawlConfig = { search_query: buildSearchQuery(crawlInput), max_pdfs: crawlMaxPdfs };
      } else {
        crawlConfig = {
          domains:   crawlDomains,
          max_pdfs:  crawlMaxPdfs,
          max_depth: jobSettings.crawlerMaxDepth || 3,
          timeout:   jobSettings.crawlerTimeout  || 8,
        };
      }
    }

    // Hand off to the global UploadProgress module — runs in background
    UploadProgress.startJob(hcId, name, [...pendingFiles], jobSettings, crawlConfig);

    Toast.show(t('toast.hcStarted'), 'success', 4000);
    App.navigate('healthchecks');
  }

  /* ── Detail View ───────────────────────────────────────────── */
  async function renderDetail(container, id) {
    container.innerHTML = `
      <div class="flex items-center gap-8" style="color:var(--gray-400);font-size:13px;padding:20px"><div class="loading-spinner"></div> ${t('hc.loadingDetail')}</div>`;

    try {
      const [hcRes, docsRes] = await Promise.all([
        API.healthChecks.get(id),
        API.documents.list(id)
      ]);
      const hc   = hcRes.data;
      const docs = docsRes.data || [];
      renderDetailContent(container, hc, docs);
    } catch (e) {
      container.innerHTML = `<div class="connection-banner">${e.message}</div>`;
    }
  }

  // ── Error-section helpers ───────────────────────────────────────────────
  // Parse the "[Step Name] error detail" format stored by documents.fail()
  // and return a user-friendly category + hint.
  function getErrorInfo(raw) {
    const stepMatch = raw && raw.match(/^\[([^\]]+)\]\s*([\s\S]*)/);
    const step   = stepMatch ? stepMatch[1].trim() : null;
    const detail = (stepMatch ? stepMatch[2] : (raw || '')).trim();
    const lo     = detail.toLowerCase();

    let category, hint;
    if (!detail || detail === 'Processing failed') {
      category = 'Processing failed';
      hint     = 'An unexpected error occurred. Retry by uploading this file again.';
    } else if (lo.includes('unauthorized') || lo.includes('401') || lo.includes('403') ||
               lo.includes('auth failed')  || lo.includes('credential')) {
      category = 'Authentication error';
      hint     = 'Adobe API credentials may be invalid or expired — check Settings.';
    } else if (lo.includes('timed out') || lo.includes('timeout')) {
      category = 'Request timed out';
      hint     = 'The Adobe API took too long to respond. Try again.';
    } else if (lo.includes('network') || lo.includes('econnrefused') ||
               lo.includes('enotfound') || lo.includes('cannot reach') ||
               lo.includes('failed to fetch')) {
      category = 'Network error';
      hint     = 'Check your internet connection and the backend URL in Settings.';
    } else if (lo.includes('put failed') || lo.includes('asset upload') ||
               lo.includes('asset create')) {
      category = 'Upload failed';
      hint     = 'The PDF could not be uploaded to Adobe. The file may be corrupted or too large.';
    } else if (lo.includes('500') || lo.includes('server error') || lo.includes('bad gateway')) {
      category = 'Adobe API error';
      hint     = 'Adobe PDF Services returned a server error. Try again later.';
    } else {
      category = step ? `${step} error` : 'Processing error';
      hint     = null; // show raw detail instead
    }
    return { step, detail, category, hint };
  }

  function renderErrorCard(d) {
    const { step, detail, category, hint } = getErrorInfo(d.error_message || '');
    const showDetail = !hint && detail && detail !== 'Unknown error';
    return `
      <div style="border:1px solid var(--gray-100);border-radius:8px;overflow:hidden">
        <!-- File row -->
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--white)">
          <div style="width:34px;height:34px;flex-shrink:0;background:var(--red-light);border-radius:6px;
                      display:flex;align-items:center;justify-content:center">
            <svg viewBox="0 0 14 14" fill="none" style="width:13px;height:13px;color:var(--red)">
              <rect x="1" y="0.5" width="12" height="13" rx="1.5" stroke="currentColor" stroke-width="1.1"/>
              <path d="M4 5h6M4 7.5h4" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            </svg>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:var(--gray-800);white-space:nowrap;
                        overflow:hidden;text-overflow:ellipsis"
                 title="${escHtml(d.original_filename || '')}">${escHtml(d.original_filename || 'Unknown file')}</div>
            ${d.file_size ? `<div style="font-size:11px;color:var(--gray-400);margin-top:1px">${formatBytes(d.file_size)}</div>` : ''}
          </div>
          ${step ? `<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
                               color:var(--gray-500);background:var(--gray-100);padding:2px 7px;
                               border-radius:10px;flex-shrink:0;white-space:nowrap">${escHtml(step)}</span>` : ''}
          <span style="font-size:11px;font-weight:700;color:var(--red);background:var(--red-light);
                       padding:2px 9px;border-radius:10px;flex-shrink:0">${t('hc.failed')}</span>
        </div>
        <!-- Error strip -->
        <div style="border-top:1px solid var(--gray-100);background:var(--gray-75);
                    padding:8px 14px;display:flex;align-items:flex-start;gap:7px">
          <svg viewBox="0 0 14 14" fill="none"
               style="width:13px;height:13px;color:var(--red);flex-shrink:0;margin-top:1px">
            <path d="M7 1L13 12H1L7 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
            <path d="M7 5.5v2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            <circle cx="7" cy="10" r=".5" fill="currentColor"/>
          </svg>
          <div style="min-width:0;flex:1">
            <span style="font-size:12px;font-weight:600;color:var(--gray-700)">${escHtml(category)}</span>
            ${hint
              ? `<span style="font-size:12px;color:var(--gray-500);margin-left:6px">${escHtml(hint)}</span>`
              : (showDetail
                  ? `<code style="font-size:11px;color:var(--gray-500);margin-left:6px;
                                  font-family:ui-monospace,monospace;word-break:break-all">${escHtml(detail.slice(0, 160))}${detail.length > 160 ? '…' : ''}</code>`
                  : '')}
          </div>
        </div>
      </div>`;
  }

  function renderErrorSection(docs, hc) {
    const failed    = docs.filter(d => d.status === 'failed');
    const succeeded = docs.filter(d => d.status === 'completed').length;
    const anyKnown  = failed.some(d => d.error_message && !/^(Unknown error|Processing failed)?$/.test(d.error_message));

    return `
      <div class="card" style="margin-top:20px;border-left:3px solid var(--red)">
        <div class="section-title">
          <span style="display:flex;align-items:center;gap:6px">
            <svg viewBox="0 0 16 16" fill="none" style="width:14px;height:14px;color:var(--red);flex-shrink:0">
              <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
              <path d="M8 5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <circle cx="8" cy="11" r=".65" fill="currentColor"/>
            </svg>
            ${t('hc.procErrors')}
          </span>
          <span style="font-size:11px;color:var(--gray-400)">
            ${t('hc.errorsCount', { failed: failed.length, total: docs.length, s: docs.length !== 1 ? 's' : '' })}
          </span>
        </div>
        <p style="font-size:12px;color:var(--gray-500);margin:-2px 0 14px">
          ${anyKnown ? t('hc.errorsHint') : t('hc.errorsHintGeneric')}
        </p>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${failed.map(d => renderErrorCard(d)).join('')}
        </div>
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--gray-100);
                    display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="App.navigate('settings')">
            <svg viewBox="0 0 14 14" fill="none" style="width:12px;height:12px">
              <circle cx="7" cy="7" r="2" stroke="currentColor" stroke-width="1.2"/>
              <path d="M7 1.5v1M7 11.5v1M1.5 7h1M11.5 7h1M3 3l.7.7M10.3 10.3l.7.7M10.3 3.7L11 3M3 11l.7-.7"
                    stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            ${t('hc.checkSettings')}
          </button>
          <button class="btn btn-primary btn-sm"
                  onclick="window.openAddPdfsModal(${hc.id},${JSON.stringify(hc.name).replace(/"/g,'&quot;')})">
            <svg viewBox="0 0 14 14" fill="none" style="width:12px;height:12px">
              <path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
            ${t('hc.uploadRetry')}
          </button>
          <span style="font-size:11px;color:var(--gray-400);margin-left:auto">
            ${succeeded > 0
              ? t('hc.processedOk', { count: succeeded, total: docs.length })
              : t('hc.noneProcessed')}
          </span>
        </div>
      </div>`;
  }

  function renderDetailContent(container, hc, docs) {
    // Store HC + docs so carwash pill onclicks and _openCarwash() can reference them
    _currentHc   = hc;
    _currentDocs = docs;

    // Tell the Yukon chat which HC we're looking at so questions are scoped
    if (typeof YukonChat !== 'undefined') {
      YukonChat.setContext({
        view:         'healthcheck',
        label:        `${hc.name}${hc.customer_name ? ' · ' + hc.customer_name : ''}`,
        hcId:         hc.id,
        hcName:       hc.name,
        customerName: hc.customer_name || null,
        avgScore:     hc.avg_score,
        status:       hc.status,
        docCount:     docs.length || hc.doc_count || 0,
      });
    }

    const avgScore = hc.avg_score;
    const scoreHtml = avgScore != null
      ? `<span class="score-pill ${avgScore >= 75 ? 'good' : avgScore >= 50 ? 'warn' : 'poor'}" style="font-size:14px;padding:5px 14px">${avgScore} / 100</span>`
      : '';

    container.innerHTML = `
      <div class="hc-header">
        <button class="btn btn-ghost btn-sm hc-back-btn" onclick="App.navigate('healthchecks')"
                title="${t('hc.backBtn')}" aria-label="${t('hc.backBtn')}" style="padding:6px">
          <svg viewBox="0 0 16 16" fill="none" style="width:16px;height:16px"><path d="M10 4L6 8l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        ${hc.customer_name ? CustomersView.customerAvatarSVG(hc.customer_name, 36) : ''}
        <div style="flex:1">
          <div class="hc-title">${escHtml(hc.name)}</div>
          <div class="hc-meta">
            ${escHtml(hc.customer_name || '')} · ${formatDate(hc.created_at)}
            ${hc.dr_number ? ` · <span style="color:var(--accent);font-weight:600">${escHtml(hc.dr_number)}</span>` : ''}
            ${hc.owner_first_name ? ` · ${escHtml(hc.owner_first_name + ' ' + (hc.owner_last_name||''))}` : ''}
          </div>
        </div>
        ${scoreHtml}
        <span class="status-pill status-${hc.status}">${ucFirst(hc.status)}</span>
        ${hc.status === 'completed' ? `
        <button class="btn btn-secondary btn-sm" onclick="App.navigate('report',{hcId:${hc.id}})">
          <svg viewBox="0 0 16 16" fill="none" style="width:13px;height:13px;flex-shrink:0">
            <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
            <path d="M5 6h6M5 8.5h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
          ${t('hc.viewReport')}
        </button>` : ''}
        <button class="btn btn-primary btn-sm"
                onclick="window.openAddPdfsModal(${hc.id},${JSON.stringify(hc.name).replace(/"/g,'&quot;')})">
          ${t('hc.uploadMore')}
        </button>
      </div>

      <!-- Summary stats -->
      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-label">${t('hc.statDocuments')}</div>
          <div class="stat-value">${docs.length}</div>
          <div class="stat-sub">${t('hc.statProcessed', { count: docs.filter(d => d.status === 'completed').length })}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">${t('hc.statAvgScore')}</div>
          <div class="stat-value">${avgScore ?? '—'}</div>
          <div class="stat-sub">${t('hc.statOutOf')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">${t('hc.statAccessIssues')}</div>
          <div class="stat-value">${hc.total_failed_checks ?? '—'}</div>
          <div class="stat-sub">${t('hc.statFailedChecks')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">${t('hc.statTaggedPdfs')}</div>
          <div class="stat-value">${hc.tagged_count ?? '—'}</div>
          <div class="stat-sub">${t('hc.statOfTotal', { total: docs.length })}</div>
        </div>
      </div>

      <!-- Carwash Opportunity Card -->
      ${typeof Carwash !== 'undefined' ? Carwash.renderOpportunityCard(hc, docs) : ''}

      <!-- Document results -->
      <div class="card card-table">
        <div class="section-title"><span>${t('hc.docsSection', { count: docs.length })}</span></div>
        ${docs.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>${t('hc.thFile')}</th><th>${t('hc.thSize')}</th><th>${t('hc.thPages')}</th><th>${t('hc.thPdfVersion')}</th><th>${t('hc.thTagged')}</th><th>${t('hc.thProperties')}</th><th>${t('hc.thAccessibility')}</th><th>${t('hc.thScore')}</th><th>${t('hc.thStatus')}</th></tr></thead>
          <tbody>
            ${docs.map(doc => renderDocRow(doc, hc)).join('')}
          </tbody>
        </table></div>` : `<div class="empty-state" style="padding:24px"><h3>${t('hc.noDocuments')}</h3></div>`}
      </div>

      <!-- Processing errors -->
      ${docs.some(d => d.status === 'failed') ? renderErrorSection(docs, hc) : ''}`;

    // Wire the Carwash button after the HTML is in the DOM
    const cwBtn = document.getElementById('carwashOpenBtn');
    if (cwBtn && typeof Carwash !== 'undefined') {
      cwBtn.addEventListener('click', () => Carwash.open(hc, docs));
    }

  }

  function renderDocRow(doc, hc) {
    const props  = doc.properties || {};
    const access = doc.accessibility || {};
    const score  = doc.overall_score;

    const scoreHtml = score != null
      ? `<div style="display:inline-block">${Charts.scoreRing(score, 44)}</div>`
      : '<span class="text-muted text-sm">—</span>';

    const taggedIcon = props.is_tagged
      ? `<svg viewBox="0 0 14 14" fill="none" style="width:14px;height:14px;color:var(--green)"><path d="M2 7l4 4 6-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg viewBox="0 0 14 14" fill="none" style="width:14px;height:14px;color:var(--red)"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

    // Carwash opportunity pills for this document
    let cwPills = '';
    if (doc.status === 'completed' && typeof Carwash !== 'undefined') {
      const COMPRESS_THRESHOLD = 1 * 1024 * 1024;
      const needs = [];
      if (props.is_tagged === false)                        needs.push(['autotag',   'TAG']);
      if ((doc.file_size || 0) > COMPRESS_THRESHOLD)       needs.push(['compress',  'ZIP']);
      if (props.is_linearized === false)                    needs.push(['linearize', 'LIN']);
      if (needs.length > 0) {
        cwPills = `<div class="cw-row-pills" title="Click to wash this PDF">
          ${needs.map(([op, lbl]) => `<span class="cw-pill cw-pill-xs pill-${op}" onclick="event.stopPropagation();HealthCheckView._openCarwash()">${lbl}</span>`).join('')}
        </div>`;
      }
    }

    return `<tr style="cursor:pointer" onclick="HealthCheckView.openDocDetail('${doc.id}')">
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="file-icon" style="width:28px;height:28px;border-radius:5px">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16.3408 5.2959L12.7197 1.67383C12.3008 1.25488 11.7207 1.01465 11.1289 1.01465H5.25C4.00977 1.01465 3 2.02442 3 3.26465V15.748C3 16.9883 4.00977 17.998 5.25 17.998H14.75C15.9902 17.998 17 16.9883 17 15.748V6.88672C17 6.28613 16.7656 5.7207 16.3408 5.2959ZM15.2803 6.35645C15.3264 6.40259 15.3542 6.45997 15.3862 6.51465H12.25C11.8369 6.51465 11.5 6.17774 11.5 5.76465V2.62842C11.5554 2.66065 11.6135 2.68872 11.6592 2.73438L15.2803 6.35645ZM14.75 16.498H5.25C4.83691 16.498 4.5 16.1611 4.5 15.748V3.26465C4.5 2.85156 4.83691 2.51465 5.25 2.51465H10V5.76465C10 7.00488 11.0098 8.01465 12.25 8.01465H15.5V15.748C15.5 16.1611 15.1631 16.498 14.75 16.498Z" fill="currentColor"/>
              <path d="M13 11.498H7C6.58594 11.498 6.25 11.1621 6.25 10.748C6.25 10.334 6.58594 9.99805 7 9.99805H13C13.4141 9.99805 13.75 10.334 13.75 10.748C13.75 11.1621 13.4141 11.498 13 11.498Z" fill="currentColor"/>
              <path d="M13 14.498H7C6.58594 14.498 6.25 14.1621 6.25 13.748C6.25 13.334 6.58594 12.998 7 12.998H13C13.4141 12.998 13.75 13.334 13.75 13.748C13.75 14.1621 13.4141 14.498 13 14.498Z" fill="currentColor"/>
            </svg>
          </div>
          <div>
            <div style="font-size:12.5px;font-weight:500;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(doc.original_filename || '—')}</div>
            ${cwPills}
          </div>
        </div>
      </td>
      <td class="text-sm text-muted">${doc.file_size ? formatBytes(doc.file_size) : '—'}</td>
      <td class="text-sm">${props.page_count ?? '—'}</td>
      <td class="text-sm">${props.pdf_version ? 'PDF ' + props.pdf_version : '—'}</td>
      <td>${doc.status === 'completed' ? taggedIcon : '—'}</td>
      <td class="text-sm">${doc.status === 'completed' ? `${props.passed_properties ?? 0}/${props.total_properties ?? 0} ok` : '—'}</td>
      <td class="text-sm">${doc.status === 'completed' && access.passed_checks != null ? `${access.passed_checks} pass / ${access.failed_checks ?? 0} fail` : '—'}</td>
      <td>${scoreHtml}</td>
      <td><span class="status-pill status-${doc.status}">${ucFirst(doc.status)}</span></td>
    </tr>`;
  }

  function formatBytes(b) {
    if (!b) return '—';
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }

  async function openDocDetail(docId) {
    Modal.open({ heading: t('doc.heading'), content: '<div style="padding:20px;text-align:center"><div class="loading-spinner" style="margin:0 auto"></div></div>', size: 'modal-xl', actions: [{ label: t('common.close'), cls: 'btn-secondary', onClick: Modal.close }] });
    try {
      const res  = await API.documents.getResult(docId);
      const doc  = res.data;
      const props   = doc.properties || {};
      const access  = doc.accessibility || {};
      const rawP    = props.raw_properties   ? (typeof props.raw_properties === 'string' ? JSON.parse(props.raw_properties) : props.raw_properties) : {};
      const rawA    = access.raw_results ? (typeof access.raw_results === 'string' ? JSON.parse(access.raw_results) : access.raw_results) : {};
      const checks  = rawA.checks || rawA.checkResults || [];
      const score   = doc.overall_score;

      document.getElementById('modalBody').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
          <div>
            <div class="section-title"><span>${t('doc.pdfProperties')}</span></div>
            <div class="check-list">
              ${propRow(t('doc.pdfVersion'), props.pdf_version ? 'PDF ' + props.pdf_version : null)}
              ${propRow(t('doc.pageCount'), props.page_count)}
              ${propRow(t('doc.fileSize'), doc.file_size ? formatBytes(doc.file_size) : null)}
              ${props.info_creation_date ? propRow(t('doc.infoCreationDate'), new Date(props.info_creation_date).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'})) : ''}
              ${props.info_title    ? propRow(t('doc.infoTitle'),    props.info_title)    : ''}
              ${props.info_subject  ? propRow(t('doc.infoSubject'),  props.info_subject)  : ''}
              ${props.info_keywords ? propRow(t('doc.infoKeywords'), props.info_keywords) : ''}
              ${propCheckRow(t('doc.taggedPdf'), props.is_tagged)}
              ${propCheckRow(t('doc.linearized'), props.is_linearized, true)}
              ${propCheckRow(t('doc.encrypted'), props.is_encrypted, true)}
              ${propCheckRow(t('doc.xfaForm'), props.has_xfa, true)}
              ${propCheckRow(t('doc.acroForm'), props.has_acroform, null)}
              ${propCheckRow(t('doc.embeddedFiles'), props.has_embedded_files, true)}
              ${propCheckRow(t('doc.isCertified'), props.is_certified)}
              ${propCheckRow(t('doc.isSigned'), props.is_signed)}
              ${(props.permissions_allow_copy != null || props.permissions_assistive_tech != null || props.permissions_printing != null) ? `
                <div class="check-item" style="font-size:11px;font-weight:600;color:var(--gray-400);text-transform:uppercase;letter-spacing:.05em;padding-top:4px">${t('doc.permissionsSection')}</div>
                ${props.permissions_assistive_tech  != null ? propCheckRow(t('doc.permAssistiveTech'),   props.permissions_assistive_tech) : ''}
                ${props.permissions_allow_copy      != null ? propCheckRow(t('doc.permissionsAllowCopy'),props.permissions_allow_copy) : ''}
                ${props.permissions_form_filling    != null ? propCheckRow(t('doc.permFormFilling'),     props.permissions_form_filling) : ''}
                ${props.permissions_commenting      != null ? propCheckRow(t('doc.permCommenting'),      props.permissions_commenting) : ''}
                ${props.permissions_editing         != null ? propCheckRow(t('doc.permEditing'),         props.permissions_editing, true) : ''}
                ${props.permissions_page_extraction != null ? propCheckRow(t('doc.permPageExtraction'),  props.permissions_page_extraction) : ''}
                ${props.permissions_doc_assembly    != null ? propCheckRow(t('doc.permDocAssembly'),     props.permissions_doc_assembly) : ''}
                ${props.permissions_printing != null ? `
                  <div class="check-item">
                    <span class="check-label">${t('doc.permPrinting')}</span>
                    <span style="font-size:12px;font-weight:600;color:${props.permissions_printing==='none' ? 'var(--red)' : props.permissions_printing==='low' ? 'var(--yellow)' : 'var(--green)'}">
                      ${props.permissions_printing === 'none' ? t('doc.permPrintingNone') : props.permissions_printing === 'low' ? t('doc.permPrintingLow') : t('doc.permPrintingHigh')}
                    </span>
                  </div>` : ''}
              ` : ''}
              ${propRow(t('doc.contentType'), props.content_type)}
              ${props.pdfa_compliance  ? propRow(t('doc.pdfaCompliance'),  'PDF/A-' + props.pdfa_compliance)  : ''}
              ${props.pdfua_compliance ? propRow(t('doc.pdfuaCompliance'), 'PDF/UA-' + props.pdfua_compliance) : ''}
              ${props.pdfe_compliance  ? propRow(t('doc.pdfeCompliance'),  'PDF/E-' + props.pdfe_compliance)  : ''}
              ${props.pdfx_compliance  ? propRow(t('doc.pdfxCompliance'),  'PDF/X-' + props.pdfx_compliance)  : ''}
              ${props.pdfvt_compliance ? propRow(t('doc.pdfvtCompliance'), 'PDF/VT-' + props.pdfvt_compliance) : ''}
              ${props.creator_app ? propRow(t('doc.creatorApp'), props.creator_app) : ''}
              ${props.author ? `
                <div class="check-item" style="${props.pii_author ? 'background:var(--yellow-light);border-radius:5px;padding:6px 8px;margin-top:4px' : ''}">
                  <span class="check-label">${t('doc.author')}</span>
                  <span style="font-size:12px;color:var(--gray-500);display:flex;align-items:center;gap:6px">
                    ${escHtml(props.author)}
                    ${props.pii_author ? `<span style="background:var(--yellow);color:white;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;text-transform:uppercase;letter-spacing:.05em">PII</span>` : ''}
                  </span>
                </div>
                ${props.pii_author ? `
                  <div style="font-size:11px;color:var(--yellow);margin:4px 0 0 0;padding:0 8px;display:flex;align-items:center;gap:5px">
                    <svg viewBox="0 0 12 12" fill="none" style="width:11px;height:11px;flex-shrink:0"><path d="M6 1L11 10H1L6 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6 4.5v2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="6" cy="9" r=".5" fill="currentColor"/></svg>
                    ${t('doc.piiWarning')}
                  </div>` : ''}
              ` : ''}
            </div>
          </div>
          <div>
            <div class="section-title"><span>${t('doc.accessSummary')}</span></div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
              <div style="text-align:center;padding:12px;background:var(--green-light);border-radius:8px">
                <div style="font-size:22px;font-weight:700;color:var(--green)">${access.passed_checks ?? 0}</div>
                <div style="font-size:11px;color:var(--green);margin-top:2px">${t('doc.passed')}</div>
              </div>
              <div style="text-align:center;padding:12px;background:var(--red-light);border-radius:8px">
                <div style="font-size:22px;font-weight:700;color:var(--red)">${access.failed_checks ?? 0}</div>
                <div style="font-size:11px;color:var(--red);margin-top:2px">${t('doc.failed')}</div>
              </div>
              <div style="text-align:center;padding:12px;background:var(--yellow-light);border-radius:8px">
                <div style="font-size:22px;font-weight:700;color:var(--yellow)">${access.warning_checks ?? 0}</div>
                <div style="font-size:11px;color:var(--yellow);margin-top:2px">${t('doc.warnings')}</div>
              </div>
            </div>
            ${score != null ? `<div style="text-align:center;margin-bottom:16px">${Charts.scoreRing(score, 80)}<div style="font-size:12px;color:var(--gray-500);margin-top:4px">${t('doc.overallScore')}</div></div>` : ''}
          </div>
        </div>
        ${checks.length ? `
        <div class="section-title"><span>${t('doc.accessChecks')}</span></div>
        <div class="check-list" style="max-height:260px;overflow-y:auto">
          ${checks.map(ch => {
            const s = (ch.status || ch.result || '').toLowerCase();
            const cls = s === 'passed' || s === 'pass' ? 'check-pass' : s === 'failed' || s === 'fail' ? 'check-fail' : 'check-warn';
            const icon = s.includes('pass')
              ? `<svg viewBox="0 0 14 14" fill="none"><path d="M2 7l4 4 6-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
              : s.includes('fail')
              ? `<svg viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
              : `<svg viewBox="0 0 14 14" fill="none"><path d="M7 1L13 12H1L7 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M7 5.5v3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
            return `<div class="check-item">
              <span class="check-status ${cls}">${icon}</span>
              <span class="check-label">${escHtml(ch.checkName || ch.name || ch.rule || 'Check')}</span>
              <span style="font-size:11px;color:var(--gray-400)">${ucFirst(ch.status || ch.result || '')}</span>
            </div>`;
          }).join('')}
        </div>` : ''}`;
    } catch (e) {
      document.getElementById('modalBody').innerHTML = `<div class="connection-banner">${e.message}</div>`;
    }
  }

  function propRow(label, value) {
    return `<div class="check-item"><span class="check-label">${label}</span><span style="font-size:12px;color:var(--gray-500)">${value ?? '—'}</span></div>`;
  }

  function propCheckRow(label, value, negativeIsGood = false) {
    if (value == null) return propRow(label, null);
    const isGood = negativeIsGood ? !value : !!value;
    const icon   = isGood
      ? `<svg viewBox="0 0 14 14" fill="none" style="width:14px;height:14px;color:var(--green)"><path d="M2 7l4 4 6-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg viewBox="0 0 14 14" fill="none" style="width:14px;height:14px;color:var(--red)"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    return `<div class="check-item"><span class="check-label">${label}</span>${icon}</div>`;
  }

  function _openCarwash() {
    if (typeof Carwash !== 'undefined' && _currentHc && _currentDocs) {
      Carwash.open(_currentHc, _currentDocs);
    }
  }

  return { render, removeFile, openDocDetail, _openCarwash };
})();
