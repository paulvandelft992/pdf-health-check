/**
 * Report Builder — create, save, share and export custom reports.
 *
 * Sub-views
 *   list    — saved reports + shared library (default)
 *   builder — interactive config panel + live preview
 *   view    — full-screen display of a saved/run report
 */
const ReportBuilderView = (() => {
  // ── State ─────────────────────────────────────────────────────────────────
  let _container     = null;
  let _mode          = 'list';   // 'list' | 'builder' | 'view'
  let _report        = null;     // { id?, name, description, config, is_shared }
  let _fields        = null;     // cached /fields response
  let _chart         = null;     // Chart.js instance
  let _debounce      = null;
  let _runResult     = null;     // last run result
  let _listTab       = 'mine';   // 'mine' | 'shared'
  let _editMode      = false;    // true when editing an existing saved report
  let _activeFilters = [];       // [{field, op, value}]

  // Spectrum categorical palette — same as Charts.CAT used across the app
  const CHART_COLORS = (typeof Charts !== 'undefined' && Charts.CAT)
    ? Charts.CAT
    : ['rgb(15,181,174)','rgb(64,70,202)','rgb(246,133,17)','rgb(222,61,130)',
       'rgb(126,132,250)','rgb(20,122,243)','rgb(115,38,211)','rgb(232,198,0)',
       'rgb(203,93,0)','rgb(0,143,93)'];

  function _rgbToRgba(rgb, alpha) {
    // Converts 'rgb(r,g,b)' → 'rgba(r,g,b,alpha)'
    return rgb.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
  }

  // ── Default config ────────────────────────────────────────────────────────
  function _defaultConfig() {
    return {
      scope:         { type: 'mine' },
      dateRange:     '30d',
      groupBy:       'customer',
      metrics:       ['hc_count', 'avg_overall_score'],
      filters:       [],
      visualization: 'bar',
      sortBy:        'hc_count',
      sortDir:       'DESC',
      limit:         20,
    };
  }

  // ── Entry point ───────────────────────────────────────────────────────────
  async function render(container, params = {}) {
    _container = container;
    container.innerHTML = '<div class="rb-loading"><div class="loading-spinner"></div></div>';

    try {
      if (!_fields) _fields = (await API.reportBuilder.fields()).data;
    } catch (e) {
      container.innerHTML = `<div class="connection-banner">Failed to load report builder: ${e.message}</div>`;
      return;
    }

    if (params.id) {
      // Load existing report for viewing or editing
      try {
        const res = await API.reportBuilder.get(params.id);
        _report   = res.data;
        _editMode = !!params.edit;
        _showBuilder();
      } catch {
        await _showList();
      }
    } else if (params.action === 'new') {
      _report   = { name: t('rb.untitledReport'), description: '', config: _defaultConfig(), is_shared: false };
      _editMode = false;
      _showBuilder();
    } else {
      await _showList();
    }
  }

  // ── LIST VIEW ─────────────────────────────────────────────────────────────
  async function _showList() {
    _mode = 'list';
    _renderListShell();
    await _loadListTab(_listTab);
  }

  function _renderListShell() {
    _container.innerHTML = `
      <div class="rb-list-wrap">
        <div class="rb-list-header">
          <div>
            <h2 class="rb-list-title">Report Builder</h2>
            <p class="rb-list-sub">Build custom reports from your health check data</p>
          </div>
          <button class="btn btn-primary" id="rbNewBtn">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="margin-right:6px"><path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            ${t('rb.newReport')}
          </button>
        </div>

        <div class="rb-tabs">
          <button class="rb-tab ${_listTab === 'mine'   ? 'active' : ''}" data-tab="mine">${t('rb.myReports')}</button>
          <button class="rb-tab ${_listTab === 'shared' ? 'active' : ''}" data-tab="shared">${t('rb.sharedLibrary')}</button>
        </div>

        <div class="rb-search-row">
          <input class="rb-search-input" id="rbSearch" placeholder="${t('rb.searchPlaceholder')}" type="search">
        </div>

        <div id="rbGrid" class="rb-grid">
          <div class="rb-loading"><div class="loading-spinner"></div></div>
        </div>
      </div>`;

    document.getElementById('rbNewBtn').onclick = () => App.navigate('report-builder', { action: 'new' });

    document.querySelectorAll('.rb-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        _listTab = btn.dataset.tab;
        document.querySelectorAll('.rb-tab').forEach(b => b.classList.toggle('active', b === btn));
        await _loadListTab(_listTab);
      });
    });

    document.getElementById('rbSearch').addEventListener('input', e => _filterGrid(e.target.value));
  }

  async function _loadListTab(tab) {
    const grid = document.getElementById('rbGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="rb-loading"><div class="loading-spinner"></div></div>';

    try {
      const res  = tab === 'shared' ? await API.reportBuilder.shared() : await API.reportBuilder.list();
      const rows = res.data || [];
      _renderGrid(grid, rows, tab === 'shared');
    } catch (e) {
      grid.innerHTML = `<div class="connection-banner">${e.message}</div>`;
    }
  }

  function _renderGrid(grid, reports, isShared) {
    if (!reports.length) {
      grid.innerHTML = `<div class="empty-state" style="padding:48px 0">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style="color:var(--gray-300);margin-bottom:12px">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
          <path d="M3 9h18M9 21V9" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        <h3>${isShared ? t('rb.noShared') : t('rb.noReports')}</h3>
        <p>${isShared ? 'Reports shared by team members appear here.' : 'Create your first report to get started.'}</p>
        ${!isShared ? `<button class="btn btn-primary" onclick="App.navigate('report-builder',{action:'new'})">${t('rb.newReport')}</button>` : ''}
      </div>`;
      return;
    }

    grid.innerHTML = reports.map(r => _reportCard(r, isShared)).join('');
    grid.dataset.reports = JSON.stringify(reports);

    grid.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const id     = parseInt(btn.closest('[data-id]').dataset.id);
        const action = btn.dataset.action;
        await _handleCardAction(action, id);
      });
    });

    grid.querySelectorAll('.rb-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('[data-action]')) return;
        App.navigate('report-builder', { id: card.dataset.id });
      });
    });
  }

  function _reportCard(r, isShared) {
    const vizIcon = _vizIcon(r.config?.visualization || 'bar');
    const metrics = (r.config?.metrics || []).slice(0, 3);
    const metaLabels = (_fields?.metrics || []).filter(m => metrics.includes(m.key)).map(m => m.label);

    return `
      <div class="rb-card" data-id="${r.id}">
        <div class="rb-card-icon">${vizIcon}</div>
        <div class="rb-card-body">
          <div class="rb-card-name">${escHtml(r.name)}</div>
          ${r.description ? `<div class="rb-card-desc">${escHtml(r.description)}</div>` : ''}
          <div class="rb-card-chips">
            ${metaLabels.map(l => `<span class="rb-chip">${escHtml(l)}</span>`).join('')}
            ${r.is_shared ? `<span class="rb-chip rb-chip--shared">${t('rb.shared')}</span>` : ''}
          </div>
          <div class="rb-card-date">${_relDate(r.updated_at)}</div>
        </div>
        <div class="rb-card-actions" onclick="event.stopPropagation()">
          <button class="btn btn-primary btn-sm" data-action="run">${t('rb.run')}</button>
          ${!isShared ? `<button class="btn btn-secondary btn-sm" data-action="edit">${t('rb.edit')}</button>` : `<button class="btn btn-secondary btn-sm" data-action="clone-shared">${t('rb.clone')}</button>`}
          ${!isShared ? `
          <div class="rb-card-menu">
            <button class="rb-menu-trigger btn-icon" data-action="menu" title="More">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="13" r="1.2"/></svg>
            </button>
            <div class="rb-menu-dropdown hidden">
              <button class="rb-menu-item" data-action="clone">${t('rb.clone')}</button>
              <button class="rb-menu-item" data-action="share">${r.is_shared ? t('rb.unshare') : t('rb.shareToLibrary')}</button>
              ${!r.is_shared ? `<button class="rb-menu-item rb-menu-item--danger" data-action="delete">${t('rb.delete')}</button>` : ''}
            </div>
          </div>` : ''}
        </div>
      </div>`;
  }

  async function _handleCardAction(action, id) {
    if (action === 'menu') {
      // Toggle dropdown
      const card     = _container.querySelector(`[data-id="${id}"]`);
      const dropdown = card?.querySelector('.rb-menu-dropdown');
      if (!dropdown) return;
      document.querySelectorAll('.rb-menu-dropdown:not(.hidden)').forEach(d => { if (d !== dropdown) d.classList.add('hidden'); });
      dropdown.classList.toggle('hidden');
      return;
    }
    if (action === 'run') {
      App.navigate('report-builder', { id });
      return;
    }
    if (action === 'edit') {
      App.navigate('report-builder', { id, edit: true });
      return;
    }
    if (action === 'clone' || action === 'clone-shared') {
      try {
        await API.reportBuilder.clone(id);
        Toast.show(t('rb.cloneSuccess'), 'success');
        await _loadListTab('mine');
        if (_listTab === 'shared') { _listTab = 'mine'; document.querySelectorAll('.rb-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'mine')); }
      } catch (e) { Toast.show(e.message, 'error'); }
      return;
    }
    if (action === 'share') {
      try {
        const res = await API.reportBuilder.share(id);
        Toast.show(res.data.is_shared ? t('rb.sharedToLibrary') : t('rb.removedFromLibrary'), 'success');
        await _loadListTab(_listTab);
      } catch (e) { Toast.show(e.message, 'error'); }
      return;
    }
    if (action === 'delete') {
      if (!confirm(t('rb.deleteConfirm'))) return;
      try {
        await API.reportBuilder.delete(id);
        Toast.show(t('rb.reportDeleted'), 'success');
        await _loadListTab(_listTab);
      } catch (e) { Toast.show(e.message, 'error'); }
      return;
    }
  }

  function _filterGrid(q) {
    q = q.toLowerCase();
    _container.querySelectorAll('.rb-card').forEach(card => {
      const name = card.querySelector('.rb-card-name')?.textContent?.toLowerCase() || '';
      const desc = card.querySelector('.rb-card-desc')?.textContent?.toLowerCase() || '';
      card.style.display = (!q || name.includes(q) || desc.includes(q)) ? '' : 'none';
    });
  }

  // ── BUILDER VIEW ──────────────────────────────────────────────────────────
  function _showBuilder() {
    _mode          = 'builder';
    const cfg      = _report.config || _defaultConfig();
    _activeFilters = Array.isArray(cfg.filters) ? cfg.filters.map(f => ({ ...f, op: f.op || 'eq' })) : [];

    _container.innerHTML = `
      <div class="rb-builder">
        <!-- Header -->
        <div class="rb-builder-header">
          <button class="rb-back" id="rbBack">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            ${t('rb.myReports')}
          </button>
          <input class="rb-name-input" id="rbNameInput" value="${escHtml(_report.name)}" placeholder="${t('rb.reportNamePlaceholder')}">
          <div class="rb-builder-actions">
            <button class="btn btn-secondary btn-md" id="rbRunBtn">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="margin-right:4px"><path d="M3 2l11 6-11 6V2z"/></svg>
              ${t('rb.run')}
            </button>
            <button class="btn btn-primary btn-md" id="rbSaveBtn">${t('rb.saveReport')}</button>
          </div>
        </div>

        <!-- Body: config + preview -->
        <div class="rb-builder-body">

          <!-- Left: config panel -->
          <div class="rb-config-panel" id="rbConfigPanel">

            <div class="rb-cfg-section">
              <div class="rb-cfg-label">${t('rb.labelDescription')}</div>
              <textarea class="rb-description" id="rbDesc" rows="2" placeholder="${t('rb.descPlaceholder')}">${escHtml(_report.description || '')}</textarea>
            </div>

            <div class="rb-cfg-section">
              <div class="rb-cfg-label">${t('rb.labelScope')}</div>
              <select class="form-select rb-select" id="rbScopeType">
                ${(_fields.scopes || []).map(s => `<option value="${s.key}" ${cfg.scope?.type === s.key ? 'selected' : ''}>${escHtml(s.label)}</option>`).join('')}
              </select>
              <div id="rbScopeDetail" class="rb-scope-detail"></div>
            </div>

            <div class="rb-cfg-section">
              <div class="rb-cfg-label">${t('rb.labelDateRange')}</div>
              <select class="form-select rb-select" id="rbDateRange">
                ${(_fields.dateRanges || []).map(d => `<option value="${d.key}" ${cfg.dateRange === d.key ? 'selected' : ''}>${escHtml(d.label)}</option>`).join('')}
              </select>
            </div>

            <div class="rb-cfg-section">
              <div class="rb-cfg-label">${t('rb.labelGroupBy')}</div>
              <select class="form-select rb-select" id="rbGroupBy">
                <option value="">${t('rb.noGrouping')}</option>
                ${(() => {
                  const groups = {};
                  (_fields.dimensions || []).forEach(d => { (groups[d.group||'Other'] = groups[d.group||'Other']||[]).push(d); });
                  return Object.entries(groups).map(([g, dims]) =>
                    `<optgroup label="${escHtml(g)}">${dims.map(d => `<option value="${d.key}" ${cfg.groupBy === d.key ? 'selected' : ''}>${escHtml(d.label)}</option>`).join('')}</optgroup>`
                  ).join('');
                })()}
              </select>
            </div>

            <div class="rb-cfg-section">
              <div class="rb-cfg-label">${t('rb.labelMetrics')}</div>
              <input type="search" class="rb-field-search" id="rbMetricSearch" placeholder="${t('rb.searchMetrics')}" autocomplete="off">
              <div class="rb-metric-list" id="rbMetricList">
                ${(() => {
                  const groups = {};
                  (_fields.metrics || []).forEach(m => { (groups[m.group||'Other'] = groups[m.group||'Other']||[]).push(m); });
                  return Object.entries(groups).map(([g, metrics]) => `
                    <div class="rb-metric-group-label">${escHtml(g)}</div>
                    ${metrics.map(m => `
                      <label class="rb-metric-row ${cfg.metrics?.includes(m.key) ? 'checked' : ''}">
                        <input type="checkbox" value="${m.key}" ${cfg.metrics?.includes(m.key) ? 'checked' : ''}>
                        <span class="rb-metric-name">${escHtml(m.label)}</span>
                        ${m.unit ? `<span class="rb-metric-unit">${escHtml(m.unit)}</span>` : ''}
                      </label>`).join('')}`).join('');
                })()}
              </div>
            </div>

            <div class="rb-cfg-section">
              <div class="rb-cfg-label">${t('rb.labelVisualization')}</div>
              <div class="rb-viz-grid" id="rbVizGrid">
                ${(_fields.visualizations || []).map(v => `
                  <button class="rb-viz-btn ${cfg.visualization === v.key ? 'active' : ''}" data-viz="${v.key}" title="${escHtml(v.label)}">
                    ${_vizIcon(v.key)}
                    <span>${escHtml(v.label)}</span>
                  </button>`).join('')}
              </div>
            </div>

            <div class="rb-cfg-section">
              <div class="rb-cfg-label">${t('rb.labelSortLimit')}</div>
              <div class="rb-sort-row">
                <select class="form-select rb-select" id="rbSortBy" style="flex:1">
                  ${(_fields.metrics || []).map(m => `<option value="${m.key}" ${cfg.sortBy === m.key ? 'selected' : ''}>${escHtml(m.label)}</option>`).join('')}
                </select>
                <select class="form-select rb-select" id="rbSortDir" style="width:120px">
                  <option value="DESC" ${cfg.sortDir === 'DESC' ? 'selected' : ''}>${t('rb.highestFirst')}</option>
                  <option value="ASC"  ${cfg.sortDir === 'ASC'  ? 'selected' : ''}>${t('rb.lowestFirst')}</option>
                </select>
              </div>
              <div class="rb-limit-row">
                <label class="rb-cfg-sub">${t('rb.showTop')}</label>
                <input type="number" class="rb-limit-input" id="rbLimit" value="${cfg.limit || 20}" min="5" max="200">
                <label class="rb-cfg-sub">${t('rb.rows')}</label>
              </div>
            </div>

            <div class="rb-cfg-section rb-cfg-section--filters" id="rbFilterSection">
              <div class="rb-cfg-label">${t('rb.labelFilters')}</div>
              <!-- rendered dynamically by _renderFilters() -->
            </div>

          </div>

          <!-- Right: preview -->
          <div class="rb-preview-panel">
            <div class="rb-preview-header">
              <span class="rb-preview-label">${t('rb.preview')}</span>
              <button class="btn btn-ghost btn-sm" id="rbCopyImage" title="Copy chart as image" style="display:none">${t('rb.copyImage')}</button>
              <button class="btn btn-ghost btn-sm" id="rbPinDash" title="Add to dashboard">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.3809 6.56641L13.4346 2.62012C13.0723 2.25684 12.5889 2.05762 12.0752 2.05762C11.5605 2.05762 11.0752 2.25879 10.7139 2.6211C10.2891 3.04493 10.0928 3.62012 10.1572 4.18555L6.99219 7.35059L4.68067 7.15235C3.93262 7.06641 3.24317 7.46192 2.9209 8.1377C2.59863 8.81543 2.7334 9.59668 3.26465 10.1279L6.03809 12.9014L2.21973 16.7197C1.92676 17.0127 1.92676 17.4873 2.21973 17.7803C2.36621 17.9268 2.55762 18 2.75 18C2.94238 18 3.13379 17.9268 3.28027 17.7803L7.09863 13.9619L9.87304 16.7363C10.2119 17.0762 10.6533 17.2529 11.1045 17.2529C11.3594 17.2529 11.6172 17.1963 11.8623 17.0801C12.5391 16.7578 12.9258 16.0674 12.8486 15.334L12.6484 13.0078L15.8144 9.8418C16.3818 9.90918 16.9551 9.71192 17.3789 9.28809C17.7422 8.92481 17.9424 8.44239 17.9433 7.92871C17.9443 7.41309 17.7441 6.92969 17.3809 6.56641ZM16.3184 8.22754C16.1914 8.35352 16.0303 8.38672 15.8809 8.32324C15.5996 8.19922 15.2715 8.26367 15.0537 8.48144L11.3408 12.1943C11.1846 12.3506 11.1045 12.5683 11.124 12.7891L11.3555 15.4766C11.3711 15.6211 11.2881 15.6914 11.2168 15.7256C11.1445 15.7607 11.0361 15.7783 10.9336 15.6758L4.32521 9.06738C4.22169 8.96386 4.24025 8.85547 4.27541 8.7832C4.30666 8.71777 4.36818 8.64355 4.49904 8.64355C4.51174 8.64355 4.52443 8.64453 4.5381 8.6455L7.21095 8.87499C7.43263 8.8955 7.64845 8.81542 7.80568 8.65819L11.5176 4.94628C11.7344 4.72948 11.7979 4.40136 11.6758 4.11913C11.6104 3.96581 11.6445 3.81151 11.7744 3.68163C11.8545 3.60155 11.9609 3.55761 12.0752 3.55761C12.1885 3.55761 12.2949 3.60156 12.374 3.68066L16.3203 7.62695C16.4854 7.79199 16.4844 8.06152 16.3184 8.22754Z" fill="currentColor"/>
                </svg>

                ${t('rb.pinToDashboard')}
              </button>
              <button class="btn btn-ghost btn-sm" id="rbExportPdf">${t('rb.exportPdf')}</button>
              <button class="btn btn-ghost btn-sm" id="rbExportExcel">${t('rb.exportExcel')}</button>
            </div>
            <div class="rb-preview-body" id="rbPreviewBody">
              <div class="rb-preview-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style="color:var(--gray-300)"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M3 9h18M9 21V9" stroke="currentColor" stroke-width="1.5"/></svg>
                <p>${t('rb.emptyPreview')}</p>
              </div>
            </div>
          </div>

        </div>
      </div>`;

    // Wiring
    document.getElementById('rbBack').onclick    = () => _showList();
    document.getElementById('rbRunBtn').onclick  = () => _runPreview();
    document.getElementById('rbSaveBtn').onclick = () => _saveReport();

    document.getElementById('rbExportPdf').onclick   = () => _exportPdf();
    document.getElementById('rbExportExcel').onclick = () => _exportExcel();
    document.getElementById('rbCopyImage').onclick   = () => _copyChartImage();
    document.getElementById('rbPinDash').onclick     = () => _pinToDashboard();

    // Scope — single handler that re-renders the sub-dropdown AND schedules preview
    _renderScopeDetail(cfg.scope);
    document.getElementById('rbScopeType').addEventListener('change', (e) => {
      _renderScopeDetail({ type: e.target.value });
      _schedulePreview();
    });

    // Viz type picker
    document.getElementById('rbVizGrid').querySelectorAll('.rb-viz-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.rb-viz-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _schedulePreview();
      });
    });

    // Metric checkboxes
    document.getElementById('rbMetricList').querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        cb.closest('label').classList.toggle('checked', cb.checked);
        _schedulePreview();
      });
    });

    // Metric search filter
    document.getElementById('rbMetricSearch').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      document.getElementById('rbMetricList').querySelectorAll('label.rb-metric-row').forEach(row => {
        const name = row.querySelector('.rb-metric-name')?.textContent?.toLowerCase() || '';
        row.style.display = (!q || name.includes(q)) ? '' : 'none';
      });
      // Show/hide group headers based on whether they have visible rows
      document.getElementById('rbMetricList').querySelectorAll('.rb-metric-group-label').forEach(hdr => {
        let sib = hdr.nextElementSibling;
        let hasVisible = false;
        while (sib && !sib.classList.contains('rb-metric-group-label')) {
          if (sib.style.display !== 'none') hasVisible = true;
          sib = sib.nextElementSibling;
        }
        hdr.style.display = hasVisible ? '' : 'none';
      });
    });

    // All select/input changes trigger preview (rbScopeType handled above separately)
    ['rbDateRange','rbGroupBy','rbSortBy','rbSortDir'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => _schedulePreview());
    });
    document.getElementById('rbLimit').addEventListener('input', () => _schedulePreview());

    // Render dynamic filter builder
    _renderFilters();

    // Close dropdowns on outside click
    document.addEventListener('click', _closeMenus);

    // Auto-run on load if editing
    if (_editMode && _report.id) _runPreview();
  }

  function _renderScopeDetail(scope = {}) {
    const detail = document.getElementById('rbScopeDetail');
    if (!detail) return;
    const type = scope.type || document.getElementById('rbScopeType')?.value || 'mine';

    if (type === 'customer') {
      detail.innerHTML = `<select class="form-select rb-select" id="rbScopeCustomer" style="margin-top:6px">
        <option value="">— Select customer —</option>
        ${(_fields.customers || []).map(c => `<option value="${c.id}" ${scope.customerId == c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('')}
      </select>`;
      document.getElementById('rbScopeCustomer').onchange = () => _schedulePreview();
    } else if (type === 'region') {
      detail.innerHTML = `<select class="form-select rb-select" id="rbScopeVal" style="margin-top:6px">
        <option value="">— Select region —</option>
        ${(_fields.regions || []).map(r => `<option value="${escHtml(r)}" ${scope.value === r ? 'selected' : ''}>${escHtml(r)}</option>`).join('')}
      </select>`;
      document.getElementById('rbScopeVal').onchange = () => _schedulePreview();
    } else if (type === 'segment') {
      detail.innerHTML = `<select class="form-select rb-select" id="rbScopeVal" style="margin-top:6px">
        <option value="">— Select segment —</option>
        ${(_fields.segments || []).map(s => `<option value="${escHtml(s)}" ${scope.value === s ? 'selected' : ''}>${escHtml(s)}</option>`).join('')}
      </select>`;
      document.getElementById('rbScopeVal').onchange = () => _schedulePreview();
    } else if (type === 'vertical') {
      detail.innerHTML = `<select class="form-select rb-select" id="rbScopeVal" style="margin-top:6px">
        <option value="">— Select vertical —</option>
        ${(_fields.verticals || []).map(v => `<option value="${escHtml(v)}" ${scope.value === v ? 'selected' : ''}>${escHtml(v)}</option>`).join('')}
      </select>`;
      document.getElementById('rbScopeVal').onchange = () => _schedulePreview();
    } else {
      detail.innerHTML = '';
    }
  }

  function _getConfig() {
    const scopeType = document.getElementById('rbScopeType')?.value || 'mine';
    const scope = { type: scopeType };
    if (scopeType === 'customer') scope.customerId = document.getElementById('rbScopeCustomer')?.value;
    else if (['region','segment','vertical'].includes(scopeType)) scope.value = document.getElementById('rbScopeVal')?.value;

    const checkedMetrics = [...document.querySelectorAll('#rbMetricList input:checked')].map(cb => cb.value);
    const activeViz = document.querySelector('.rb-viz-btn.active')?.dataset.viz || 'bar';

    return {
      scope,
      dateRange:     document.getElementById('rbDateRange')?.value || '30d',
      groupBy:       document.getElementById('rbGroupBy')?.value   || null,
      metrics:       checkedMetrics.length ? checkedMetrics : ['hc_count'],
      visualization: activeViz,
      sortBy:        document.getElementById('rbSortBy')?.value    || 'hc_count',
      sortDir:       document.getElementById('rbSortDir')?.value   || 'DESC',
      limit:         parseInt(document.getElementById('rbLimit')?.value) || 20,
      filters:       _activeFilters.filter(f => f.field && f.value !== ''),
    };
  }

  // ── Filter builder ────────────────────────────────────────────────────────
  function _renderFilters() {
    const section = document.getElementById('rbFilterSection');
    if (!section) return;
    const filterFields = _fields.filterFields || [];

    const chipHtml = _activeFilters.map((f, i) => {
      const meta   = filterFields.find(ff => ff.key === f.field) || { label: f.field };
      const opLbl  = f.op === 'neq' ? '≠' : '=';
      const valLbl = meta.type === 'bool' ? (f.value === '1' ? t('rb.yes') : t('rb.no')) : escHtml(f.value);
      return `<div class="rb-filter-chip">
        <span>${escHtml(meta.label)} ${opLbl} <strong>${valLbl}</strong></span>
        <button class="rb-filter-chip-remove" data-idx="${i}" title="Remove filter">×</button>
      </div>`;
    }).join('');

    // Group filter fields for the select dropdown
    const ffOptHtml = filterFields.map(ff => `<option value="${ff.key}">${escHtml(ff.label)}</option>`).join('');

    section.innerHTML = `
      <div class="rb-cfg-label">${t('rb.labelFilters')}</div>
      ${chipHtml ? `<div class="rb-filter-chips" id="rbFilterChips">${chipHtml}</div>` : ''}
      <div class="rb-filter-add-row">
        <select class="form-select rb-select rb-filter-field-sel" id="rbFilterField" style="flex:1">
          <option value="">${t('rb.addFilter')}</option>
          ${ffOptHtml}
        </select>
      </div>
      <div class="rb-filter-value-row" id="rbFilterValueRow" style="display:none">
        <div id="rbFilterOpWrap"></div>
        <div id="rbFilterValWrap" style="flex:1"></div>
        <button class="btn btn-primary btn-sm" id="rbFilterAddBtn">${t('rb.add')}</button>
      </div>`;

    // Remove chip
    section.querySelectorAll('.rb-filter-chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeFilters.splice(parseInt(btn.dataset.idx), 1);
        _renderFilters();
        _schedulePreview();
      });
    });

    // Field selector — show value picker when field is chosen
    const fieldSel = document.getElementById('rbFilterField');
    const valueRow = document.getElementById('rbFilterValueRow');
    fieldSel.addEventListener('change', () => {
      const key  = fieldSel.value;
      const meta = filterFields.find(ff => ff.key === key);
      if (!meta) { valueRow.style.display = 'none'; return; }
      valueRow.style.display = 'flex';
      _renderFilterOpAndValue(meta);
    });

    // Add button
    document.getElementById('rbFilterAddBtn').addEventListener('click', () => {
      const key   = fieldSel.value;
      const meta  = filterFields.find(ff => ff.key === key);
      if (!meta) return;
      const op    = document.getElementById('rbFilterOp')?.value  || 'eq';
      const valEl = document.getElementById('rbFilterVal');
      const val   = valEl?.value ?? '';
      if (val === '') { Toast.show(t('rb.filterValueRequired'), 'info'); return; }
      _activeFilters.push({ field: key, op, value: val });
      _renderFilters();
      _schedulePreview();
    });
  }

  function _renderFilterOpAndValue(meta) {
    const opWrap  = document.getElementById('rbFilterOpWrap');
    const valWrap = document.getElementById('rbFilterValWrap');

    // Operator selector: categorical/text get eq/neq; bool and isset have no operator choice
    if (meta.type === 'bool' || meta.type === 'isset') {
      opWrap.innerHTML = '';
    } else {
      opWrap.innerHTML = `<select class="form-select rb-select" id="rbFilterOp" style="width:56px;padding:7px 4px">
        <option value="eq">=</option>
        <option value="neq">≠</option>
      </select>`;
    }

    // Value widget
    if (meta.type === 'bool') {
      valWrap.innerHTML = `<select class="form-select rb-select" id="rbFilterVal">
        <option value="1">${t('rb.yes')}</option>
        <option value="0">${t('rb.no')}</option>
      </select>`;
    } else if (meta.type === 'select' && meta.options?.length) {
      valWrap.innerHTML = `<select class="form-select rb-select" id="rbFilterVal">
        <option value="">${t('rb.selectPlaceholder')}</option>
        ${meta.options.map(o => `<option value="${escHtml(o)}">${escHtml(o)}</option>`).join('')}
      </select>`;
    } else {
      // text or empty options
      valWrap.innerHTML = `<input class="form-input rb-filter-text-input" id="rbFilterVal" placeholder="${t('rb.valuePlaceholder')}" style="width:100%">`;
    }
  }

  function _schedulePreview() {
    clearTimeout(_debounce);
    _debounce = setTimeout(_runPreview, 700);
  }

  async function _runPreview() {
    const body = document.getElementById('rbPreviewBody');
    if (!body) return;
    const config = _getConfig();
    body.innerHTML = `<div class="rb-preview-loading"><div class="loading-spinner"></div> ${t('rb.running')}</div>`;

    try {
      const res = await API.reportBuilder.run(config);
      _runResult = res.data;
      _renderPreview(body, res.data, config);
    } catch (e) {
      body.innerHTML = `<div class="connection-banner">${e.message}</div>`;
    }
  }

  function _renderPreview(body, data, config) {
    // Hide copy-image button until a chart actually renders
    const copyBtn = document.getElementById('rbCopyImage');
    if (copyBtn) copyBtn.style.display = 'none';

    if (data.visualization === 'table' || !data.has_groups) {
      _renderTable(body, data);
      return;
    }
    if (data.visualization === 'metric') {
      _renderMetricCards(body, data);
      return;
    }
    _renderChart(body, data, config);
  }

  function _renderMetricCards(body, data) {
    const metricMeta = {};
    (_fields.metrics || []).forEach(m => { metricMeta[m.key] = m; });

    if (!data.has_groups && data.metric_cards?.length) {
      body.innerHTML = `<div class="rb-metric-cards">${data.metric_cards.map(c => {
        const meta = metricMeta[c.key] || { label: c.key, unit: '' };
        const val  = c.value != null ? (parseFloat(c.value).toLocaleString('en', { maximumFractionDigits: 1 }) + (meta.unit || '')) : '—';
        return `<div class="rb-kpi-card"><div class="rb-kpi-value">${val}</div><div class="rb-kpi-label">${escHtml(meta.label)}</div></div>`;
      }).join('')}</div>`;
      return;
    }
    // has groups — fall through to table
    _renderTable(body, data);
  }

  function _renderTable(body, data) {
    const metricMeta = {};
    (_fields.metrics || []).forEach(m => { metricMeta[m.key] = m; });

    if (!data.rows?.length) {
      body.innerHTML = `<div class="rb-preview-empty"><p>${t('rb.noData')}</p></div>`;
      return;
    }

    const hasGroup  = data.has_groups && data.group_by;
    const metrics   = data.metrics || [];
    const groupDim  = (_fields.dimensions || []).find(d => d.key === data.group_by);

    body.innerHTML = `<div class="rb-table-wrap"><table class="rb-table">
      <thead><tr>
        ${hasGroup ? `<th>${escHtml(groupDim?.label || 'Group')}</th>` : ''}
        ${metrics.map(m => `<th>${escHtml(metricMeta[m]?.label || m)}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${data.rows.map(r => `<tr>
          ${hasGroup ? `<td class="rb-table-label">${escHtml(r.group_key ?? '—')}</td>` : ''}
          ${metrics.map(m => `<td class="rb-table-num">${r[m] != null ? parseFloat(r[m]).toLocaleString('en', { maximumFractionDigits: 1 }) + (metricMeta[m]?.unit || '') : '—'}</td>`).join('')}
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  }

  function _renderChart(body, data, config) {
    if (!data.labels?.length) {
      body.innerHTML = `<div class="rb-preview-empty"><p>${t('rb.noData')}</p></div>`;
      return;
    }

    const metricMeta = {};
    (_fields.metrics || []).forEach(m => { metricMeta[m.key] = m; });

    body.innerHTML = '<div class="rb-chart-wrap"><canvas id="rbCanvas"></canvas></div>';
    const canvas = document.getElementById('rbCanvas');
    if (!canvas) return;

    if (_chart) { _chart.destroy(); _chart = null; }

    if (typeof Chart === 'undefined') {
      body.innerHTML = `<div class="rb-preview-empty"><p>${t('rb.chartLibMissing')}</p></div>`;
      return;
    }

    const viz      = data.visualization || 'bar';
    const isPie    = viz === 'pie' || viz === 'donut';
    const isHorizB = viz === 'bar_h';

    const chartType = viz === 'donut' ? 'doughnut'
                    : viz === 'area'  ? 'line'
                    : viz === 'line'  ? 'line'
                    : isPie           ? 'pie'
                    : 'bar';

    const colors = data.labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

    const datasets = data.datasets.map((ds, di) => {
      const meta    = metricMeta[ds.field] || { label: ds.field, unit: '' };
      const baseClr = CHART_COLORS[di % CHART_COLORS.length];
      const bgColor = isPie
        ? colors
        : viz === 'area'
          ? (context) => {
              const chart = context.chart;
              const { ctx, chartArea } = chart;
              if (!chartArea) return _rgbToRgba(baseClr, 0.35);
              const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
              gradient.addColorStop(0, _rgbToRgba(baseClr, data.datasets.length > 1 ? 0.22 : 0.40));
              gradient.addColorStop(1, _rgbToRgba(baseClr, 0.02));
              return gradient;
            }
          : _rgbToRgba(baseClr, 0.75);
      return {
        label:           meta.label,
        data:            ds.values,
        backgroundColor: bgColor,
        borderColor:     isPie ? colors : baseClr,
        borderWidth:     isPie ? 1 : 2,
        fill:            viz === 'area',
        tension:         0.35,
        pointRadius:     viz === 'line' || viz === 'area' ? 3 : 0,
        pointBackgroundColor: baseClr,
      };
    });

    _chart = new Chart(canvas, {
      type: chartType,
      data: { labels: data.labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: isHorizB ? 'y' : 'x',
        plugins: {
          legend:  { display: datasets.length > 1 || isPie, position: 'bottom' },
          tooltip: {
            callbacks: {
              label: ctx => {
                const meta = metricMeta[data.datasets[ctx.datasetIndex]?.field] || {};
                return ` ${ctx.dataset.label}: ${ctx.raw?.toLocaleString('en', { maximumFractionDigits: 1 })}${meta.unit || ''}`;
              }
            }
          }
        },
        scales: isPie ? {} : {
          x: { grid: { color: 'rgba(0,0,0,.06)' }, ticks: { font: { size: 11 } } },
          y: { grid: { color: 'rgba(0,0,0,.06)' }, ticks: { font: { size: 11 } } },
        },
        animation: {
          onComplete: () => {
            const btn = document.getElementById('rbCopyImage');
            if (btn) btn.style.display = '';
          }
        }
      },
    });
  }

  async function _saveReport() {
    const config = _getConfig();
    const name   = document.getElementById('rbNameInput')?.value.trim() || t('rb.untitledReport');
    const desc   = document.getElementById('rbDesc')?.value.trim() || '';

    try {
      if (_report?.id) {
        await API.reportBuilder.update(_report.id, { name, description: desc, config });
        Toast.show(t('rb.reportSaved'), 'success');
      } else {
        const res = await API.reportBuilder.create({ name, description: desc, config });
        _report   = { ...(_report || {}), id: res.data.id, name, description: desc, config };
        Toast.show(t('rb.reportSaved'), 'success');
      }
    } catch (e) { Toast.show(e.message, 'error'); }
  }

  async function _copyChartImage() {
    const canvas = document.getElementById('rbCanvas');
    if (!canvas) { Toast.show(t('rb.noChartToCopy'), 'info'); return; }

    try {
      const blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Canvas export failed')), 'image/png'));
      if (navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        Toast.show(t('rb.chartCopied'), 'success');
      } else {
        // Fallback: download as PNG
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href = url; a.download = 'chart.png'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        Toast.show(t('rb.chartDownloaded'), 'success');
      }
    } catch (e) {
      Toast.show(t('rb.chartCopyFailed') + e.message, 'error');
    }
  }

  async function _pinToDashboard() {
    const name   = document.getElementById('rbNameInput')?.value.trim() || 'Report';
    const config = _getConfig();

    // Save the report first if not yet saved
    let reportId = _report?.id;
    if (!reportId) {
      try {
        const res = await API.reportBuilder.create({ name, description: _report?.description || '', config });
        reportId  = res.data.id;
        _report   = { ...(_report || {}), id: reportId, name, config };
      } catch (e) { Toast.show(t('rb.saveToPinFirst') + e.message, 'error'); return; }
    }

    // Load existing dashboard widgets
    const settings = await window.electronAPI?.getSettings?.() || {};
    const widgets  = Array.isArray(settings.dashboardWidgets) ? settings.dashboardWidgets : [];

    // Avoid duplicate pins of the same report
    if (widgets.find(w => w.reportId === reportId)) {
      Toast.show(t('rb.alreadyPinned'), 'info');
      return;
    }

    // Ask for position
    const pos = await _askDashboardPosition(widgets.length);
    if (pos === null) return; // cancelled

    const widget = { id: `rb_${reportId}_${Date.now()}`, reportId, name, config, position: pos };
    widgets.splice(pos, 0, widget);
    // Re-number positions
    widgets.forEach((w, i) => { w.position = i; });

    await window.electronAPI?.saveSettings?.({ ...settings, dashboardWidgets: widgets });
    Toast.show(t('rb.pinnedSuccess', { name, pos: pos + 1 }), 'success');
  }

  function _askDashboardPosition(total) {
    return new Promise(resolve => {
      const positions = Array.from({ length: total + 1 }, (_, i) => i);
      const opts = positions.map(i => `<option value="${i}">${i === 0 ? t('rb.posTop') : i === total ? t('rb.posBottom', { n: total + 1 }) : t('rb.posN', { n: i + 1 })}</option>`).join('');
      Modal.open({
        heading: t('rb.pinToDashboard'),
        content: `
          <p style="font-size:13px;color:var(--gray-600);margin-bottom:16px">${t('rb.pinDesc')}</p>
          <div class="form-group">
            <label class="form-label">${t('rb.position')}</label>
            <select class="form-select" id="dashPosSelect">${opts}</select>
          </div>`,
        actions: [
          { label: t('rb.pin'), cls: 'btn-primary', onClick: () => { resolve(parseInt(document.getElementById('dashPosSelect').value)); Modal.close(); } },
          { label: t('common.cancel'), cls: 'btn-secondary', onClick: () => { resolve(null); Modal.close(); } },
        ],
      });
    });
  }

  async function _exportPdf() {
    if (!_runResult) { Toast.show(t('rb.runFirst'), 'info'); return; }
    const name = document.getElementById('rbNameInput')?.value.trim() || 'Report';

    try {
      await window.electronAPI?.exportReportPdf?.({ customerName: name });
    } catch (e) {
      Toast.show(t('rb.pdfFailed') + e.message, 'error');
    }
  }

  async function _exportExcel() {
    if (!_runResult) { Toast.show(t('rb.runFirst'), 'info'); return; }
    const data    = _runResult;
    const name    = document.getElementById('rbNameInput')?.value.trim() || 'Report';
    const metaMp  = {};
    (_fields.metrics || []).forEach(m => { metaMp[m.key] = m; });
    const groupDim = (_fields.dimensions || []).find(d => d.key === data.group_by);

    const headers = [];
    if (data.has_groups) headers.push(groupDim?.label || 'Group');
    (data.metrics || []).forEach(m => headers.push(metaMp[m]?.label || m));

    const rows = (data.rows || []).map(r => {
      const row = [];
      if (data.has_groups) row.push(r.group_key ?? '');
      (data.metrics || []).forEach(m => row.push(r[m] ?? ''));
      return row;
    });

    try {
      await window.electronAPI?.exportExcel?.({
        filename: `${name}.xls`,
        sheets:   [{ name: name.slice(0, 31), headers, rows }],
      });
    } catch (e) { Toast.show(t('rb.excelFailed') + e.message, 'error'); }
  }

  // ── VIEW MODE (list item → run) ───────────────────────────────────────────
  // When navigating to a saved report we show it full-screen then run it
  // This is triggered by render() when params.id is set and params.edit is falsy.
  // We reuse _showBuilder() which already auto-runs when _editMode is true.
  // For view-only access of a shared report we set _editMode = false.

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _vizIcon(key) {
    const icons = {
      bar:    '<svg viewBox="0 0 20 20" fill="none" width="20" height="20"><rect x="2" y="10" width="3" height="8" rx="1" fill="currentColor"/><rect x="7" y="6"  width="3" height="12" rx="1" fill="currentColor"/><rect x="12" y="3" width="3" height="15" rx="1" fill="currentColor"/><rect x="17" y="8" width="3" height="10" rx="1" fill="currentColor"/></svg>',
      bar_h:  '<svg viewBox="0 0 20 20" fill="none" width="20" height="20"><rect x="2" y="2"  width="8"  height="3" rx="1" fill="currentColor"/><rect x="2" y="7"  width="12" height="3" rx="1" fill="currentColor"/><rect x="2" y="12" width="6"  height="3" rx="1" fill="currentColor"/><rect x="2" y="17" width="10" height="3" rx="1" fill="currentColor"/></svg>',
      line:   '<svg viewBox="0 0 20 20" fill="none" width="20" height="20"><polyline points="2,16 6,10 10,13 14,5 18,8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      area:   '<svg viewBox="0 0 20 20" fill="none" width="20" height="20"><path d="M2 16 L6 10 L10 13 L14 5 L18 8 L18 18 L2 18 Z" fill="currentColor" opacity=".35"/><polyline points="2,16 6,10 10,13 14,5 18,8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      pie:    '<svg viewBox="0 0 20 20" fill="none" width="20" height="20"><path d="M10 2 A8 8 0 0 1 18 10 L10 10 Z" fill="currentColor"/><path d="M10 10 L18 10 A8 8 0 1 1 10 2 Z" fill="currentColor" opacity=".4"/></svg>',
      donut:  '<svg viewBox="0 0 20 20" fill="none" width="20" height="20"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="4" stroke-dasharray="22 22" stroke-dashoffset="-5"/></svg>',
      table:  '<svg viewBox="0 0 20 20" fill="none" width="20" height="20"><rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="7"  x2="18" y2="7"  stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="12" x2="18" y2="12" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="7"  x2="8"  y2="18" stroke="currentColor" stroke-width="1.5"/></svg>',
      metric: '<svg viewBox="0 0 20 20" fill="none" width="20" height="20"><rect x="2" y="6" width="7" height="8" rx="2" fill="currentColor"/><rect x="11" y="6" width="7" height="8" rx="2" fill="currentColor" opacity=".5"/></svg>',
    };
    return icons[key] || icons.bar;
  }

  function _relDate(iso) {
    if (!iso) return '';
    const d    = new Date(iso.replace(' ', 'T'));
    const diff = (Date.now() - d) / 1000;
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  }

  function _closeMenus(e) {
    if (!e.target.closest('.rb-card-menu')) {
      document.querySelectorAll('.rb-menu-dropdown:not(.hidden)').forEach(d => d.classList.add('hidden'));
    }
  }

  function escHtml(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { render };
})();
