/* Executive Portfolio Report
 *
 * A printable / PDF-exportable portfolio overview modelled after
 * customer-report.js.  Accepts optional { customerId, hcId } params to
 * scope the report to a single customer or health check.
 */
const ExecReportView = (() => {

  const S_GOOD = 'var(--green)';
  const S_WARN = 'var(--yellow)';
  const S_POOR = 'var(--red)';

  const C_BLUE   = 'rgb(20,122,243)';
  const C_TEAL   = 'rgb(15,181,174)';
  const C_ORANGE = 'rgb(246,133,17)';
  const C_INDIGO = 'rgb(64,70,202)';
  const C_PURPLE = 'rgb(115,38,211)';

  function scoreColor(s) { return s >= 75 ? S_GOOD : s >= 50 ? S_WARN : S_POOR; }
  function scoreClass(s) { return s >= 75 ? 'good' : s >= 50 ? 'warn' : 'poor'; }
  function int(v)        { return parseInt(v, 10) || 0; }

  /* ── Entry point ─────────────────────────────────────────────────────────── */
  async function render(container, params = {}) {
    const { customerId, hcId } = params;

    container.innerHTML = `
      <div id="execRptWrap" style="max-width:900px;margin:0 auto;padding:24px 24px 60px">
        <div style="display:flex;align-items:center;gap:10px;color:var(--gray-400);font-size:13px;margin-bottom:24px">
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('exec')" style="gap:6px">
            <svg viewBox="0 0 16 16" fill="none" style="width:12px;height:12px">
              <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            ${t('exec.title')}
          </button>
          <span>›</span>
          <span>${t('execReport.title')}</span>
        </div>
        <div class="flex items-center gap-8" style="color:var(--gray-400);font-size:13px">
          <div class="loading-spinner"></div> ${t('common.loading')}
        </div>
      </div>`;

    try {
      const apiParams = {};
      if (hcId)       apiParams.hc_id       = hcId;
      if (customerId) apiParams.customer_id  = customerId;

      const res = await API.execReport.get(apiParams);
      const data = res.data || res;
      renderReport(container, data);
    } catch (e) {
      container.innerHTML = `
        <div style="max-width:900px;margin:40px auto;padding:0 24px">
          <div class="connection-banner">
            <svg viewBox="0 0 16 16" fill="none" style="width:15px;height:15px;flex-shrink:0">
              <path d="M8 2L15 14H1L8 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
              <path d="M8 6.5v3M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            ${escHtml(e.message)}
            &ensp;<button class="btn btn-ghost btn-sm" onclick="App.navigate('exec')">${t('common.back')}</button>
          </div>
        </div>`;
    }
  }

  /* ── Render ──────────────────────────────────────────────────────────────── */
  function renderReport(container, data) {
    const { scope, summary, health_checks: hcs = [], customers = [], by_region = [], by_vertical = [], generated_at } = data;

    const s          = summary || {};
    const totalDocs  = s.total_docs  || 0;
    const avgScore   = s.avg_score   || 0;
    const piiCount   = s.pii_count   || 0;
    const atRisk     = s.at_risk     || 0;

    const pctGood    = totalDocs ? Math.round(s.score_good / totalDocs * 100) : 0;
    const pctFair    = totalDocs ? Math.round(s.score_fair / totalDocs * 100) : 0;
    const pctPoor    = totalDocs ? Math.round(s.score_poor / totalDocs * 100) : 0;

    // Scope label
    let scopeLabel = t('execReport.scopeAll');
    if (scope.type === 'customer' && scope.customer) scopeLabel = scope.customer.name;
    if (scope.type === 'hc'       && scope.health_check) {
      scopeLabel = `${scope.health_check.customer_name} — ${scope.health_check.name}`;
    }

    const genDate = new Date(generated_at || Date.now())
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    container.innerHTML = `

      <!-- ── Report wrapper ────────────────────────────────────────────── -->
      <div id="execRptWrap" class="report-wrap" style="max-width:900px;margin:0 auto;padding:24px 24px 60px">

        <!-- Back nav (hidden in print) -->
        <div class="no-print" style="display:flex;align-items:center;gap:10px;color:var(--gray-400);font-size:13px;margin-bottom:24px">
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('exec')" style="gap:6px">
            <svg viewBox="0 0 16 16" fill="none" style="width:12px;height:12px">
              <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            ${t('exec.title')}
          </button>
          <span>›</span>
          <span>${t('execReport.title')}</span>
        </div>

        <!-- Export overlay (hidden until export starts) -->
        <div id="execRptOverlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;
             display:none;align-items:center;justify-content:center;flex-direction:column;gap:16px">
          <div class="loading-spinner" style="width:32px;height:32px;border-width:3px;border-color:rgba(255,255,255,.2);border-top-color:#fff"></div>
          <div id="execRptOverlayMsg" style="color:#fff;font-size:14px;font-weight:600"></div>
        </div>

        <!-- ── Report header ────────────────────────────────────────────── -->
        <div class="rpt-header" style="display:flex;align-items:flex-start;justify-content:space-between;
             padding:28px 32px;border-radius:12px;background:linear-gradient(135deg,#E34850 0%,#C9252D 100%);
             color:#fff;margin-bottom:28px;gap:20px">
          <div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <img src="assets/images/acrobat.svg" style="width:28px;height:28px;filter:brightness(10)">
              <span style="font-size:13px;font-weight:600;opacity:.85;letter-spacing:.04em;text-transform:uppercase">
                PDF Health Check
              </span>
            </div>
            <h1 style="font-size:24px;font-weight:800;margin:0 0 4px;line-height:1.2">${t('execReport.title')}</h1>
            <div style="font-size:14px;opacity:.85">${escHtml(scopeLabel)}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:11px;opacity:.7;text-transform:uppercase;letter-spacing:.06em">${t('execReport.generated')}</div>
            <div style="font-size:13px;font-weight:600;margin-top:2px">${genDate}</div>
          </div>
        </div>

        <!-- ── KPI strip ─────────────────────────────────────────────────── -->
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px">
          ${kpiCard(t('exec.kpiCustomers'),  s.total_customers  || 0, C_INDIGO)}
          ${kpiCard(t('execReport.kpiHcs'), s.total_hcs        || 0, C_BLUE)}
          ${kpiCard(t('exec.kpiPdfs'),       totalDocs,              C_ORANGE)}
          ${kpiCard(t('exec.kpiAvgScore'),   avgScore,               scoreColor(avgScore), true)}
          ${kpiCard(t('exec.kpiPii'),        piiCount,               piiCount > 0 ? S_POOR : S_GOOD)}
        </div>

        <!-- ── Section 01: Portfolio Overview ───────────────────────────── -->
        <div class="rpt-section-header" style="display:flex;align-items:center;gap:10px;
             margin:0 0 16px;padding-bottom:8px;border-bottom:2px solid var(--gray-100)">
          <div style="width:28px;height:28px;border-radius:50%;background:#E34850;
               display:flex;align-items:center;justify-content:center;
               font-size:12px;font-weight:800;color:#fff;flex-shrink:0">01</div>
          <span style="font-size:16px;font-weight:700">${t('execReport.sec01')}</span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">

          <!-- Score distribution -->
          <div class="card" style="padding:20px">
            <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;
                 color:var(--gray-500);margin-bottom:14px">${t('exec.portfolioHealth')}</div>
            <div id="execRptDonut" style="display:flex;align-items:center;justify-content:center;padding:8px 0"></div>
            <div style="display:flex;justify-content:center;gap:20px;margin-top:8px">
              <div style="text-align:center">
                <div style="font-size:22px;font-weight:800;color:${S_GOOD}">${s.score_good || 0}</div>
                <div style="font-size:11px;color:var(--gray-500)">${t('dashboard.scoreGood')}</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:22px;font-weight:800;color:${S_WARN}">${s.score_fair || 0}</div>
                <div style="font-size:11px;color:var(--gray-500)">${t('dashboard.scoreFair')}</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:22px;font-weight:800;color:${S_POOR}">${s.score_poor || 0}</div>
                <div style="font-size:11px;color:var(--gray-500)">${t('dashboard.scorePoor')}</div>
              </div>
            </div>
          </div>

          <!-- Compliance bars -->
          <div class="card" style="padding:20px">
            <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;
                 color:var(--gray-500);margin-bottom:14px">${t('exec.complianceSnapshot')}</div>
            <div id="execRptCompliance"></div>
          </div>

        </div>

        <!-- Score breakdown tiles -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px">
          ${breakdownTile(t('dashboard.scoreGood'),   s.score_good || 0, pctGood, S_GOOD)}
          ${breakdownTile(t('dashboard.scoreFair'),   s.score_fair || 0, pctFair, S_WARN)}
          ${breakdownTile(t('dashboard.scorePoor'),   s.score_poor || 0, pctPoor, S_POOR)}
        </div>

        <!-- ── Section 02: Customer Breakdown (skipped for single-HC) ───── -->
        ${scope.type !== 'hc' && customers.length > 0 ? `

        <div class="rpt-section-header" style="display:flex;align-items:center;gap:10px;
             margin:0 0 16px;padding-bottom:8px;border-bottom:2px solid var(--gray-100)">
          <div style="width:28px;height:28px;border-radius:50%;background:#E34850;
               display:flex;align-items:center;justify-content:center;
               font-size:12px;font-weight:800;color:#fff;flex-shrink:0">02</div>
          <span style="font-size:16px;font-weight:700">${t('execReport.sec02')}</span>
        </div>

        <!-- By region + vertical -->
        ${by_region.length + by_vertical.length > 0 ? `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
          ${by_region.length > 0 ? `
          <div class="card" style="padding:20px">
            <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;
                 color:var(--gray-500);margin-bottom:14px">${t('exec.byRegion')}</div>
            <div id="execRptRegion"></div>
          </div>` : '<div></div>'}
          ${by_vertical.length > 0 ? `
          <div class="card" style="padding:20px">
            <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;
                 color:var(--gray-500);margin-bottom:14px">${t('exec.byVertical')}</div>
            <div id="execRptVertical"></div>
          </div>` : '<div></div>'}
        </div>` : ''}

        <!-- Customer table -->
        <div class="card card-table" style="margin-bottom:24px">
          <div style="padding:16px 20px;border-bottom:1px solid var(--gray-100)">
            <span style="font-size:14px;font-weight:700">${t('execReport.customerTable')}</span>
            <span style="font-size:12px;color:var(--gray-400);margin-left:8px">(${customers.length})</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>${t('exec.thCustomer')}</th>
                  <th>${t('reports.region')}</th>
                  <th>${t('reports.vertical')}</th>
                  <th style="text-align:right">${t('execReport.hcs')}</th>
                  <th style="text-align:right">${t('execReport.docs')}</th>
                  <th style="text-align:right">${t('exec.thScore')}</th>
                  <th style="text-align:right">Good</th>
                  <th style="text-align:right">Fair</th>
                  <th style="text-align:right">Poor</th>
                </tr>
              </thead>
              <tbody>
                ${customers.map(c => `
                  <tr>
                    <td><span class="font-medium">${escHtml(c.name)}</span></td>
                    <td class="text-muted text-sm">${escHtml(c.region || '—')}</td>
                    <td class="text-muted text-sm">${escHtml(c.vertical || '—')}</td>
                    <td style="text-align:right">${c.hc_count}</td>
                    <td style="text-align:right">${c.total_docs}</td>
                    <td style="text-align:right">
                      ${c.avg_score != null
                        ? `<span class="score-pill ${scoreClass(c.avg_score)}">${c.avg_score}</span>`
                        : '<span class="text-muted">—</span>'}
                    </td>
                    <td style="text-align:right;color:${S_GOOD};font-weight:600">${c.score_good || 0}</td>
                    <td style="text-align:right;color:${S_WARN};font-weight:600">${c.score_fair || 0}</td>
                    <td style="text-align:right;color:${S_POOR};font-weight:600">${c.score_poor || 0}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}

        <!-- ── Section 03: Health Check Activity ─────────────────────────── -->
        ${hcs.length > 0 ? `

        <div class="rpt-section-header" style="display:flex;align-items:center;gap:10px;
             margin:0 0 16px;padding-bottom:8px;border-bottom:2px solid var(--gray-100)">
          <div style="width:28px;height:28px;border-radius:50%;background:#E34850;
               display:flex;align-items:center;justify-content:center;
               font-size:12px;font-weight:800;color:#fff;flex-shrink:0">${scope.type !== 'hc' && customers.length > 0 ? '03' : '02'}</div>
          <span style="font-size:16px;font-weight:700">${t('execReport.sec03')}</span>
        </div>

        <div class="card card-table" style="margin-bottom:24px">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>${t('exec.thHcName')}</th>
                  ${scope.type !== 'hc' ? `<th>${t('exec.thCustomer')}</th>` : ''}
                  <th>${t('exec.thStatus')}</th>
                  <th>${t('exec.thDr')}</th>
                  <th style="text-align:right">${t('execReport.docs')}</th>
                  <th style="text-align:right">${t('exec.thScore')}</th>
                  <th>${t('exec.thOwner')}</th>
                  <th>${t('exec.thDate')}</th>
                </tr>
              </thead>
              <tbody>
                ${hcs.map(hc => `
                  <tr>
                    <td><span class="font-medium">${escHtml(hc.name)}</span></td>
                    ${scope.type !== 'hc' ? `<td class="text-muted text-sm">${escHtml(hc.customer_name || '—')}</td>` : ''}
                    <td><span class="status-pill status-${hc.status}">${ucFirst(hc.status)}</span></td>
                    <td>
                      ${hc.dr_number
                        ? `<span style="color:var(--accent);font-weight:600;font-size:11px">${escHtml(hc.dr_number)}</span>`
                        : '<span class="text-muted">—</span>'}
                    </td>
                    <td style="text-align:right">${hc.doc_count}</td>
                    <td style="text-align:right">
                      ${hc.avg_score != null
                        ? `<span class="score-pill ${scoreClass(hc.avg_score)}">${hc.avg_score}</span>`
                        : '<span class="text-muted">—</span>'}
                    </td>
                    <td class="text-muted text-sm">${escHtml(hc.owner || '—')}</td>
                    <td class="text-sm text-muted">${formatDate(hc.created_at)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}

        <!-- ── Section 04: At-Risk Highlights ───────────────────────────── -->
        ${atRisk > 0 ? `
        <div class="card" style="margin-bottom:24px;border-left:3px solid var(--red)">
          <div style="padding:14px 18px;display:flex;align-items:center;gap:8px">
            <svg viewBox="0 0 16 16" fill="none" style="width:14px;height:14px;flex-shrink:0;color:var(--red)">
              <path d="M8 2L15 14H1L8 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
              <path d="M8 6v3M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span style="font-size:14px;font-weight:700;color:var(--red)">${t('exec.atRiskTitle')} (${atRisk})</span>
            <span style="font-size:12px;color:var(--gray-400);margin-left:4px">${t('exec.atRiskSub')}</span>
          </div>
          <div style="padding:0 18px 16px;font-size:13px;color:var(--gray-600)">
            ${atRisk} ${t('execReport.atRiskDesc', { total: hcs.filter(h => h.avg_score != null).length })}
          </div>
        </div>` : ''}

        <!-- ── Key metrics strip ─────────────────────────────────────────── -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
          ${metricTile(t('dashboard.tagged'),        s.pct_tagged      || 0, '%')}
          ${metricTile(t('dashboard.linearized'),    s.pct_linearized  || 0, '%')}
          ${metricTile(t('dashboard.unencrypted'),   100 - (s.pct_encrypted || 0), '%')}
          ${metricTile(t('dashboard.avgAccess'),     s.avg_access_rate || 0, '%')}
        </div>

        <!-- ── Export button ─────────────────────────────────────────────── -->
        ${window.electronAPI ? `
        <div class="no-print" style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px">
          <button class="btn btn-secondary" onclick="window.print()">
            <svg viewBox="0 0 16 16" fill="none" style="width:13px;height:13px">
              <rect x="2" y="5" width="12" height="8" rx="1" stroke="currentColor" stroke-width="1.4"/>
              <path d="M5 5V3h6v2M5 12h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            ${t('exec.print')}
          </button>
          <button class="btn btn-primary" id="execRptExportBtn">
            <svg viewBox="0 0 16 16" fill="none" style="width:13px;height:13px">
              <path d="M8 2v8M4 7l4 4 4-4M2 13h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            ${t('execReport.exportPdf')}
          </button>
        </div>` : `
        <div class="no-print" style="display:flex;justify-content:flex-end;margin-top:8px">
          <button class="btn btn-secondary" onclick="window.print()">
            <svg viewBox="0 0 16 16" fill="none" style="width:13px;height:13px">
              <rect x="2" y="5" width="12" height="8" rx="1" stroke="currentColor" stroke-width="1.4"/>
              <path d="M5 5V3h6v2M5 12h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            ${t('exec.print')}
          </button>
        </div>`}

      </div>
    `;

    /* ── Charts ────────────────────────────────────────────────────────────── */
    const donutEl = document.getElementById('execRptDonut');
    if (donutEl) {
      Charts.donut(donutEl, {
        segments: [
          { value: s.score_good || 0, color: S_GOOD },
          { value: s.score_fair || 0, color: S_WARN },
          { value: s.score_poor || 0, color: S_POOR }
        ],
        size:     140,
        label:    `${avgScore}`,
        sublabel: t('dashboard.avgScoreSublabel')
      });
    }

    const compEl = document.getElementById('execRptCompliance');
    if (compEl) {
      Charts.hbar(compEl, {
        items: [
          { label: t('dashboard.tagged'),          value: s.pct_tagged     || 0, color: C_BLUE   },
          { label: t('dashboard.linearized'),       value: s.pct_linearized || 0, color: C_TEAL   },
          { label: t('dashboard.unencryptedShort'), value: 100 - (s.pct_encrypted || 0), color: C_ORANGE },
          { label: t('dashboard.noXfa'),            value: 100 - (s.pct_xfa || 0), color: C_INDIGO },
          { label: t('dashboard.avgAccess'),        value: s.avg_access_rate || 0, color: C_PURPLE },
        ],
        max: 100
      });
    }

    const regionEl = document.getElementById('execRptRegion');
    if (regionEl && by_region.length > 0) {
      Charts.hbar(regionEl, {
        items: by_region.map((r, i) => ({
          label: r.region || 'Unknown',
          value: r.avg_score || 0,
          color: Charts.CAT[i % Charts.CAT.length]
        })),
        max: 100
      });
    }

    const vertEl = document.getElementById('execRptVertical');
    if (vertEl && by_vertical.length > 0) {
      Charts.hbar(vertEl, {
        items: by_vertical.map((v, i) => ({
          label: v.vertical || 'Unknown',
          value: v.avg_score || 0,
          color: Charts.CAT[i % Charts.CAT.length]
        })),
        max: 100
      });
    }

    /* ── PDF Export ────────────────────────────────────────────────────────── */
    const exportBtn = document.getElementById('execRptExportBtn');
    if (exportBtn && window.electronAPI) {
      exportBtn.onclick = () => exportPdf(scopeLabel, data);
    }
  }

  /* ── PDF export (mirrors customer-report.js pattern) ────────────────────── */
  async function exportPdf(scopeLabel, data) {
    const overlay = document.getElementById('execRptOverlay');
    const msg     = document.getElementById('execRptOverlayMsg');

    function showOverlay(text) {
      if (overlay) { overlay.style.display = 'flex'; }
      if (msg)     { msg.textContent = text; }
    }
    function hideOverlay() {
      if (overlay) { overlay.style.display = 'none'; }
    }

    try {
      showOverlay(t('report.exportStep1'));
      await window.electronAPI.exportReportPdf({ customerName: scopeLabel });
      hideOverlay();
    } catch (e) {
      hideOverlay();
      alert(e.message || t('report.exportFailed'));
    }
  }

  /* ── Small HTML helpers ──────────────────────────────────────────────────── */
  function kpiCard(label, value, color, large = false) {
    return `
      <div class="stat-card" style="padding:14px 16px;text-align:center">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-500);margin-bottom:4px">${label}</div>
        <div style="font-size:${large ? 32 : 26}px;font-weight:800;color:${color};line-height:1.1">${
          typeof value === 'number' ? value.toLocaleString() : value}</div>
      </div>`;
  }

  function breakdownTile(label, count, pct, color) {
    return `
      <div class="stat-card" style="padding:16px;display:flex;align-items:center;gap:12px">
        <div style="width:4px;height:40px;border-radius:2px;background:${color};flex-shrink:0"></div>
        <div>
          <div style="font-size:22px;font-weight:800;color:${color}">${count}</div>
          <div style="font-size:11px;color:var(--gray-500)">${label} &middot; ${pct}%</div>
        </div>
      </div>`;
  }

  function metricTile(label, value, unit) {
    return `
      <div class="stat-card" style="padding:14px 16px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:var(--accent)">${value}${unit}</div>
        <div style="font-size:11px;color:var(--gray-500);margin-top:2px">${label}</div>
      </div>`;
  }

  return { render };
})();
