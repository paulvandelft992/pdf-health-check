/* Executive Overview — Adobe sales leadership view
 *
 * Shows portfolio-wide KPIs, deal registration activity, risk radar,
 * consultant leaderboard, and compliance snapshot.
 */
const ExecView = (() => {

  const S_GOOD = 'var(--green)';
  const S_WARN = 'var(--yellow)';
  const S_POOR = 'var(--red)';

  const C_BLUE   = 'rgb(20,122,243)';
  const C_TEAL   = 'rgb(15,181,174)';
  const C_ORANGE = 'rgb(246,133,17)';
  const C_INDIGO = 'rgb(64,70,202)';
  const C_PURPLE = 'rgb(115,38,211)';

  function scoreClass(s) { return s >= 75 ? 'good' : s >= 50 ? 'warn' : 'poor'; }
  function int(v) { return parseInt(v, 10) || 0; }

  /* ── Shell ──────────────────────────────────────────────────────────────── */
  async function render(container) {
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-row">
          <div>
            <h1>${t('exec.title')}</h1>
            <p>${t('exec.subtitle')}</p>
          </div>
          <div class="flex gap-8 items-center">
            <select class="filter-select" id="execPeriod">
              <option value="30">${t('reports.last30')}</option>
              <option value="90" selected>${t('reports.last90')}</option>
              <option value="0">${t('reports.allTime')}</option>
            </select>
            <button class="btn btn-secondary" id="execPrintBtn">
              <svg viewBox="0 0 16 16" fill="none" style="width:13px;height:13px">
                <rect x="2" y="5" width="12" height="8" rx="1" stroke="currentColor" stroke-width="1.4"/>
                <path d="M5 5V3h6v2M5 12h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
              ${t('exec.print')}
            </button>
            <button class="btn btn-secondary" id="execExportBtn">
              <svg viewBox="0 0 16 16" fill="none" style="width:13px;height:13px">
                <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              ${t('exec.exportExcel')}
            </button>
            <button class="btn btn-primary" id="execReportBtn">
              <svg viewBox="0 0 16 16" fill="none" style="width:13px;height:13px">
                <rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
                <path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
              ${t('exec.generateReport')}
            </button>
          </div>
        </div>
      </div>
      <div id="execContent">
        <div class="flex items-center gap-8" style="color:var(--gray-400);font-size:13px">
          <div class="loading-spinner"></div> ${t('exec.loading')}
        </div>
      </div>`;

    document.getElementById('execPrintBtn').onclick = () => window.print();
    document.getElementById('execPeriod').addEventListener('change', () => loadData(container));
    document.getElementById('execReportBtn').onclick = () => App.navigate('exec-report', {});
    document.getElementById('execExportBtn').onclick = () => openExportModal();

    loadData(container);
  }

  /* ── Data fetch ─────────────────────────────────────────────────────────── */
  async function loadData(container) {
    const periodEl = document.getElementById('execPeriod');
    const days = parseInt(periodEl?.value || '90');

    try {
      const [overview, trend, byRegion, byVertical, allHcsRes, piiRes, byCountry] = await Promise.all([
        API.stats.overview(),
        API.stats.trend(days || 365),
        API.stats.byRegion(),
        API.stats.byVertical(),
        API.healthChecks.list({ all: 1 }),
        API.stats.piiDocs().catch(() => ({ data: { pii_count: 0, total: 0 } })),
        API.stats.byCountry().catch(() => ({ data: [] })),
      ]);

      const el = document.getElementById('execContent');
      if (!el) return;
      renderContent(
        el,
        overview.data   || {},
        trend.data      || {},
        byRegion.data   || [],
        byVertical.data || [],
        allHcsRes.data  || [],
        piiRes.data     || {},
        byCountry.data  || []
      );
    } catch (e) {
      const el = document.getElementById('execContent');
      if (el) el.innerHTML = `
        <div class="connection-banner">
          <svg viewBox="0 0 16 16" fill="none" style="width:15px;height:15px;flex-shrink:0">
            <path d="M8 2L15 14H1L8 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="M8 6.5v3M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          ${escHtml(e.message)}
          &ensp;<button class="btn btn-ghost btn-sm" onclick="App.navigate('exec')">${t('common.retry')}</button>
        </div>`;
    }
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */
  function renderContent(el, ov, trend, byRegion, byVertical, allHcs, piiData, byCountry) {

    /* ── Derived metrics ───────────────────────────────────────────────────── */
    const completedHcs = allHcs.filter(h => h.status === 'completed');
    const hcsWithDr    = allHcs.filter(h => h.dr_number);
    const uniqueDrs    = new Set(hcsWithDr.map(h => h.dr_number)).size;

    // Latest completed HC per customer (for scoring)
    const latestByCustomer = {};
    completedHcs.forEach(hc => {
      const cid = hc.customer_id || hc.customer_name;
      if (!cid) return;
      const prev = latestByCustomer[cid];
      if (!prev || new Date(hc.created_at) > new Date(prev.created_at)) {
        latestByCustomer[cid] = hc;
      }
    });
    const scoredCustomers = Object.values(latestByCustomer).filter(h => h.avg_score != null);
    const atRisk          = scoredCustomers.filter(h => h.avg_score < 50)
                              .sort((a, b) => a.avg_score - b.avg_score);
    const topPerformers   = scoredCustomers.filter(h => h.avg_score >= 75)
                              .sort((a, b) => b.avg_score - a.avg_score)
                              .slice(0, 5);

    // Consultant leaderboard
    const consultants = {};
    allHcs.forEach(hc => {
      const name = hc.owner_name || hc.owner_email || hc.created_by;
      if (!name) return;
      if (!consultants[name]) consultants[name] = { name, total: 0, completed: 0, pdfs: 0 };
      consultants[name].total++;
      if (hc.status === 'completed') {
        consultants[name].completed++;
        consultants[name].pdfs += int(hc.doc_count);
      }
    });
    const consultantList = Object.values(consultants)
      .sort((a, b) => b.completed - a.completed)
      .slice(0, 8);

    // Recent DR-linked HCs
    const recentDrs = [...hcsWithDr]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 12);

    const avgScore  = ov.avg_score   || 0;
    const totalPdfs = ov.total_pdfs  || 1;
    const noData    = !allHcs.length && !ov.total_health_checks;
    const piiCount  = piiData.pii_count || 0;
    const piiTotal  = piiData.total     || totalPdfs;
    const piiPct    = piiTotal > 0 ? Math.round(piiCount / piiTotal * 100) : 0;

    // Compliance
    const taggedPct  = Math.round((ov.tagged_pdfs            || 0) / totalPdfs * 100);
    const versionPct = Math.round((ov.pdf_version_compliant  || 0) / totalPdfs * 100);
    const unencPct   = Math.round(((totalPdfs - int(ov.encrypted_pdfs)) / totalPdfs) * 100);
    const noXfaPct   = Math.round(((totalPdfs - int(ov.xfa_pdfs))       / totalPdfs) * 100);
    const linearPct  = Math.round((ov.linearized_pdfs        || 0) / totalPdfs * 100);

    /* ── HTML ─────────────────────────────────────────────────────────────── */
    el.innerHTML = `

      <!-- Generated timestamp ─────────────────────────────────────────── -->
      <div style="text-align:right;font-size:11px;color:var(--gray-400);margin-bottom:18px">
        ${t('exec.generatedOn')} ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
      </div>

      <!-- KPI row ─────────────────────────────────────────────────────── -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px">

        <div class="stat-card exec-kpi-card">
          <div class="stat-label" style="font-size:10px;text-transform:uppercase;letter-spacing:.06em">${t('exec.kpiCustomers')}</div>
          <div style="font-size:38px;font-weight:800;line-height:1.1;color:var(--accent);margin:4px 0 2px">${(ov.total_customers||0).toLocaleString()}</div>
          <div class="stat-sub">${t('exec.kpiNewCustomers', { count: ov.new_customers_30d || 0 })}</div>
        </div>

        <div class="stat-card exec-kpi-card">
          <div class="stat-label" style="font-size:10px;text-transform:uppercase;letter-spacing:.06em">${t('exec.kpiDeals')}</div>
          <div style="font-size:38px;font-weight:800;line-height:1.1;color:${C_INDIGO};margin:4px 0 2px">${uniqueDrs.toLocaleString()}</div>
          <div class="stat-sub">${t('exec.kpiHcsWithDr', { count: hcsWithDr.length })}</div>
        </div>

        <div class="stat-card exec-kpi-card">
          <div class="stat-label" style="font-size:10px;text-transform:uppercase;letter-spacing:.06em">${t('exec.kpiPdfs')}</div>
          <div style="font-size:38px;font-weight:800;line-height:1.1;color:${C_ORANGE};margin:4px 0 2px">${(ov.total_pdfs||0).toLocaleString()}</div>
          <div class="stat-sub">${t('exec.kpiPages', { count: (ov.total_pages||0).toLocaleString() })}</div>
        </div>

        <div class="stat-card exec-kpi-card">
          <div class="stat-label" style="font-size:10px;text-transform:uppercase;letter-spacing:.06em">${t('exec.kpiAvgScore')}</div>
          <div style="font-size:38px;font-weight:800;line-height:1.1;color:${avgScore >= 75 ? S_GOOD : avgScore >= 50 ? S_WARN : S_POOR};margin:4px 0 2px">${avgScore}</div>
          <div class="stat-sub">${t('exec.kpiScoreOf100')}</div>
        </div>

        <div class="stat-card exec-kpi-card${atRisk.length > 0 ? ' exec-kpi-risk' : ''}">
          <div class="stat-label" style="font-size:10px;text-transform:uppercase;letter-spacing:.06em">${t('exec.kpiAtRisk')}</div>
          <div style="font-size:38px;font-weight:800;line-height:1.1;color:${atRisk.length > 0 ? S_POOR : S_GOOD};margin:4px 0 2px">${atRisk.length}</div>
          <div class="stat-sub">${t('exec.kpiAtRiskSub')}</div>
        </div>

        <div class="stat-card exec-kpi-card${piiCount > 0 ? ' exec-kpi-risk' : ''}">
          <div class="stat-label" style="font-size:10px;text-transform:uppercase;letter-spacing:.06em">${t('exec.kpiPii')}</div>
          <div style="font-size:38px;font-weight:800;line-height:1.1;color:${piiCount > 0 ? S_POOR : S_GOOD};margin:4px 0 2px">${piiCount.toLocaleString()}</div>
          <div class="stat-sub">${t('exec.kpiPiiSub', { pct: piiPct })}</div>
        </div>

      </div>

      <div id="execChartsBody">

      <!-- Portfolio health donut + Compliance snapshot ────────────────── -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">

        <div class="card">
          <div class="section-title"><span>${t('exec.portfolioHealth')}</span></div>
          <div id="execHealthDonut" style="display:flex;align-items:center;justify-content:center;padding:14px 0"></div>
          <div style="display:flex;justify-content:center;gap:24px;margin-top:2px">
            <div style="text-align:center">
              <div style="font-size:24px;font-weight:800;color:${S_GOOD}">${ov.score_good||0}</div>
              <div style="font-size:11px;color:var(--gray-500)">${t('dashboard.scoreGood')}</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:24px;font-weight:800;color:${S_WARN}">${ov.score_fair||0}</div>
              <div style="font-size:11px;color:var(--gray-500)">${t('dashboard.scoreFair')}</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:24px;font-weight:800;color:${S_POOR}">${ov.score_poor||0}</div>
              <div style="font-size:11px;color:var(--gray-500)">${t('dashboard.scorePoor')}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="section-title"><span>${t('exec.complianceSnapshot')}</span></div>
          <div id="execComplianceChart" style="margin-top:10px"></div>
        </div>

      </div>

      <!-- Score trend ─────────────────────────────────────────────────── -->
      <div class="card" style="margin-bottom:20px">
        <div class="section-title">
          <span>${t('exec.scoreTrend')}</span>
          <span style="font-size:11px;color:var(--gray-400);font-weight:400">${t('exec.scoreTrendSub')}</span>
        </div>
        <div id="execTrendChart" style="margin-top:4px"></div>
      </div>

      <!-- By Vertical + By Region ─────────────────────────────────────── -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">

        <div class="card">
          <div class="section-title"><span>${t('exec.byVertical')}</span></div>
          <div id="execVerticalChart" style="margin-top:10px"></div>
          ${!byVertical.length ? `<div style="padding:20px;text-align:center;font-size:12px;color:var(--gray-400)">${t('exec.noData')}</div>` : ''}
        </div>

        <div class="card">
          <div class="section-title"><span>${t('exec.byRegion')}</span></div>
          <div id="execRegionChart" style="margin-top:10px"></div>
          ${!byRegion.length ? `<div style="padding:20px;text-align:center;font-size:12px;color:var(--gray-400)">${t('exec.noData')}</div>` : ''}
        </div>

      </div>

      <!-- Customers Requiring Attention ───────────────────────────────── -->
      ${atRisk.length > 0 ? `
      <div class="card card-table" style="margin-bottom:20px;border-left:3px solid var(--red)">
        <div class="section-title">
          <span style="color:var(--red);display:flex;align-items:center;gap:6px">
            <svg viewBox="0 0 16 16" fill="none" style="width:14px;height:14px;flex-shrink:0">
              <path d="M8 2L15 14H1L8 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
              <path d="M8 6v3M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            ${t('exec.atRiskTitle')} (${atRisk.length})
          </span>
          <span style="font-size:11px;color:var(--gray-400);font-weight:400">${t('exec.atRiskSub')}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${t('exec.thCustomer')}</th>
                <th>${t('exec.thScore')}</th>
                <th>${t('exec.thDr')}</th>
                <th>${t('exec.thHcName')}</th>
                <th>${t('exec.thLastCheck')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${atRisk.map(hc => `
                <tr style="cursor:pointer" onclick="App.navigate('healthchecks',{id:${hc.id}})">
                  <td><span class="font-medium">${escHtml(hc.customer_name || '—')}</span></td>
                  <td><span class="score-pill poor">${hc.avg_score}</span></td>
                  <td>${hc.dr_number
                      ? `<span style="color:var(--accent);font-weight:600">${escHtml(hc.dr_number)}</span>`
                      : '<span class="text-muted">—</span>'}</td>
                  <td class="text-muted text-sm">${escHtml(hc.name)}</td>
                  <td class="text-sm text-muted">${formatDate(hc.created_at)}</td>
                  <td><button class="btn btn-ghost btn-sm">${t('common.viewArrow')}</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}

      <!-- Deal Activity ───────────────────────────────────────────────── -->
      ${recentDrs.length > 0 ? `
      <div class="card card-table" style="margin-bottom:20px">
        <div class="section-title">
          <span>${t('exec.dealActivity')}</span>
          <span style="font-size:11px;color:var(--gray-400);font-weight:400">${t('exec.dealActivitySub')}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${t('exec.thDr')}</th>
                <th>${t('exec.thCustomer')}</th>
                <th>${t('exec.thHcName')}</th>
                <th>${t('exec.thScore')}</th>
                <th>${t('exec.thStatus')}</th>
                <th>${t('exec.thOwner')}</th>
                <th>${t('exec.thDate')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${recentDrs.map(hc => `
                <tr style="cursor:pointer" onclick="App.navigate('healthchecks',{id:${hc.id}})">
                  <td><span style="color:var(--accent);font-weight:700;font-size:12px">${escHtml(hc.dr_number)}</span></td>
                  <td><span class="font-medium">${escHtml(hc.customer_name || '—')}</span></td>
                  <td class="text-muted text-sm">${escHtml(hc.name)}</td>
                  <td>${hc.avg_score != null
                      ? `<span class="score-pill ${scoreClass(hc.avg_score)}">${hc.avg_score}</span>`
                      : '<span class="text-muted">—</span>'}</td>
                  <td><span class="status-pill status-${hc.status}">${ucFirst(hc.status)}</span></td>
                  <td class="text-sm text-muted">${escHtml(hc.owner_name || hc.owner_email || '—')}</td>
                  <td class="text-sm text-muted">${formatDate(hc.created_at)}</td>
                  <td><button class="btn btn-ghost btn-sm">${t('common.viewArrow')}</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : `
      <div class="card" style="margin-bottom:20px">
        <div class="section-title"><span>${t('exec.dealActivity')}</span></div>
        <div style="padding:28px;text-align:center;font-size:13px;color:var(--gray-400)">${t('exec.noDrActivity')}</div>
      </div>`}

      <!-- Top performers + Consultant leaderboard ─────────────────────── -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">

        ${topPerformers.length > 0 ? `
        <div class="card card-table">
          <div class="section-title"><span>${t('exec.topPerformers')}</span></div>
          <div class="table-wrap"><table>
            <thead>
              <tr>
                <th>${t('exec.thRank')}</th>
                <th>${t('exec.thCustomer')}</th>
                <th style="text-align:right">${t('exec.thScore')}</th>
                <th>${t('exec.thDr')}</th>
              </tr>
            </thead>
            <tbody>
              ${topPerformers.map((hc, i) => `
                <tr style="cursor:pointer" onclick="App.navigate('healthchecks',{id:${hc.id}})">
                  <td style="color:var(--gray-400);font-weight:800">#${i + 1}</td>
                  <td><span class="font-medium">${escHtml(hc.customer_name || '—')}</span></td>
                  <td style="text-align:right"><span class="score-pill good">${hc.avg_score}</span></td>
                  <td>
                    ${hc.dr_number
                      ? `<span style="color:var(--accent);font-weight:600;font-size:11px">${escHtml(hc.dr_number)}</span>`
                      : '<span class="text-muted">—</span>'}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table></div>
        </div>` : '<div></div>'}

        ${consultantList.length > 0 ? `
        <div class="card card-table">
          <div class="section-title"><span>${t('exec.consultantActivity')}</span></div>
          <div class="table-wrap"><table>
            <thead>
              <tr>
                <th>${t('exec.thConsultant')}</th>
                <th style="text-align:right">${t('exec.thHcsCompleted')}</th>
                <th style="text-align:right">${t('exec.thPdfsAnalysed')}</th>
              </tr>
            </thead>
            <tbody>
              ${consultantList.map((c, i) => `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px">
                      <div style="
                        width:24px;height:24px;border-radius:50%;
                        background:${Charts.CAT[i % Charts.CAT.length]};
                        display:flex;align-items:center;justify-content:center;
                        font-size:10px;font-weight:700;color:#fff;flex-shrink:0">
                        ${escHtml(c.name.charAt(0).toUpperCase())}
                      </div>
                      <span class="font-medium" style="font-size:12px">${escHtml(c.name)}</span>
                    </div>
                  </td>
                  <td style="text-align:right;font-weight:700">${c.completed}</td>
                  <td style="text-align:right;color:var(--gray-500)">${c.pdfs.toLocaleString()}</td>
                </tr>`).join('')}
            </tbody>
          </table></div>
        </div>` : '<div></div>'}

      </div>

      </div> <!-- end execChartsBody -->

    `;

    /* ── No data state ─────────────────────────────────────────────────────── */
    if (noData) {
      document.getElementById('execChartsBody').innerHTML = `
        <div class="card" style="margin-top:4px;padding:56px 24px;text-align:center;color:var(--gray-400)">
          <svg viewBox="0 0 48 48" fill="none" style="width:48px;height:48px;opacity:.35;display:block;margin:0 auto 14px">
            <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2"/>
            <path d="M24 16v10M24 30v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <div style="font-size:16px;font-weight:600;color:var(--gray-600);margin-bottom:6px">${t('dashboard.noHcYet')}</div>
          <div style="font-size:13px">${t('dashboard.noHcYetSub')}</div>
        </div>`;
      return;
    }

    /* ── Charts ────────────────────────────────────────────────────────────── */

    // Portfolio health donut
    Charts.donut(document.getElementById('execHealthDonut'), {
      segments: [
        { value: ov.score_good || 0, color: S_GOOD },
        { value: ov.score_fair || 0, color: S_WARN },
        { value: ov.score_poor || 0, color: S_POOR }
      ],
      size: 148,
      label:    `${avgScore}`,
      sublabel: t('dashboard.avgScoreSublabel')
    });

    // Compliance hbar
    Charts.hbar(document.getElementById('execComplianceChart'), {
      items: [
        { label: t('dashboard.tagged'),           value: taggedPct,  color: C_BLUE   },
        { label: t('dashboard.versionOkShort'),   value: versionPct, color: C_TEAL   },
        { label: t('dashboard.noXfa'),            value: noXfaPct,   color: C_ORANGE },
        { label: t('dashboard.linearizedShort'),  value: linearPct,  color: C_INDIGO },
        { label: t('dashboard.unencryptedShort'), value: unencPct,   color: C_PURPLE },
      ],
      max: 100
    });

    // Score trend area chart
    Charts.vbar(document.getElementById('execTrendChart'), {
      labels:   trend.labels  || [],
      datasets: [
        { label: t('exec.trendScore'),     data: trend.scores    || [], color: C_BLUE   },
        { label: t('exec.trendCustomers'), data: trend.customers || [], color: C_TEAL   },
      ],
      height: 180,
      type:   'area'
    });

    // By vertical
    if (byVertical.length && document.getElementById('execVerticalChart')) {
      Charts.hbar(document.getElementById('execVerticalChart'), {
        items: byVertical.map((v, i) => ({
          label: v.vertical || 'Unknown',
          value: v.avg_score || 0,
          color: Charts.CAT[i % Charts.CAT.length]
        })),
        max: 100
      });
    }

    // By region
    if (byRegion.length && document.getElementById('execRegionChart')) {
      Charts.hbar(document.getElementById('execRegionChart'), {
        items: byRegion.map((r, i) => ({
          label: r.region || 'Unknown',
          value: r.avg_score || 0,
          color: Charts.CAT[i % Charts.CAT.length]
        })),
        max: 100
      });
    }
  }

  /* ── Excel Export Modal ──────────────────────────────────────────────────── */
  async function openExportModal() {
    // Load customers and HCs for the filter dropdowns
    let allCustomers = [];
    let allHcs       = [];
    try {
      const [custRes, hcRes] = await Promise.all([
        API.customers.list(),
        API.healthChecks.list({ all: 1 }),
      ]);
      allCustomers = custRes.data?.customers || custRes.data || [];
      allHcs       = hcRes.data?.health_checks || hcRes.data || [];
    } catch {}

    const custOpts = allCustomers
      .sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''))
      .map(c => `<option value="${c.id}">${escHtml(c.display_name || c.name || 'Customer #' + c.id)}</option>`)
      .join('');

    const hcOpts = allHcs
      .filter(h => h.status === 'completed')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(h => `<option value="${h.id}">${escHtml(h.customer_name ? h.customer_name + ' – ' + h.name : h.name)}</option>`)
      .join('');

    Modal.open({
      heading: t('exec.exportExcel'),
      content: `
        <div style="display:flex;flex-direction:column;gap:16px;padding:4px 0">
          <div>
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--gray-600)">${t('exec.exportScope')}</label>
            <select id="exportScopeSelect" class="filter-select" style="width:100%">
              <option value="all">${t('exec.exportScopeAll')}</option>
              <option value="customer">${t('exec.exportScopeCustomer')}</option>
              <option value="hc">${t('exec.exportScopeHc')}</option>
            </select>
          </div>
          <div id="exportCustomerWrap" style="display:none">
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--gray-600)">${t('exec.thCustomer')}</label>
            <select id="exportCustomerSelect" class="filter-select" style="width:100%">
              <option value="">${t('exec.exportPickCustomer')}</option>
              ${custOpts}
            </select>
          </div>
          <div id="exportHcWrap" style="display:none">
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--gray-600)">${t('exec.thHcName')}</label>
            <select id="exportHcSelect" class="filter-select" style="width:100%">
              <option value="">${t('exec.exportPickHc')}</option>
              ${hcOpts}
            </select>
          </div>
          <div id="exportStatus" style="font-size:12px;color:var(--gray-500);min-height:18px"></div>
        </div>`,
      actions: [
        { label: t('common.cancel'), cls: 'btn-ghost', onClick: () => Modal.close() },
        { label: t('exec.downloadExcel'), cls: 'btn-primary', onClick: btn => {
            const scopeSel = document.getElementById('exportScopeSelect');
            const custSel  = document.getElementById('exportCustomerSelect');
            const hcSel    = document.getElementById('exportHcSelect');
            runExcelExport(scopeSel, custSel, hcSel, btn);
          }
        },
      ],
    });

    // Wire scope change listener after modal opens
    const scopeSel  = document.getElementById('exportScopeSelect');
    const custWrap  = document.getElementById('exportCustomerWrap');
    const hcWrap    = document.getElementById('exportHcWrap');
    scopeSel.addEventListener('change', () => {
      const v = scopeSel.value;
      custWrap.style.display = v === 'customer' ? '' : 'none';
      hcWrap.style.display   = v === 'hc'       ? '' : 'none';
    });
  }

  async function runExcelExport(scopeSel, custSel, hcSel, btn) {
    const statusEl = document.getElementById('exportStatus');
    const scope    = scopeSel.value;

    if (scope === 'customer' && !custSel.value) {
      if (statusEl) statusEl.textContent = t('exec.exportPickCustomer');
      return;
    }
    if (scope === 'hc' && !hcSel.value) {
      if (statusEl) statusEl.textContent = t('exec.exportPickHc');
      return;
    }

    if (btn) btn.disabled = true;
    if (statusEl) statusEl.textContent = t('exec.exportLoading');

    try {
      let res;
      if (scope === 'customer') res = await API.exportData.customer(custSel.value);
      else if (scope === 'hc')  res = await API.exportData.hc(hcSel.value);
      else                      res = await API.exportData.all();

      const data   = res.data || res;
      const sheets = buildExcelSheets(data, scope);
      const now    = new Date().toISOString().slice(0, 10);
      const filename = `pdf-healthcheck-export-${now}.xls`;

      if (window.electronAPI) {
        const result = await window.electronAPI.exportExcel({ filename, sheets });
        if (result.canceled) {
          if (statusEl) statusEl.textContent = '';
          if (btn) btn.disabled = false;
          return;
        }
        if (statusEl) statusEl.textContent = t('exec.exportDone');
        setTimeout(() => Modal.close(), 1200);
      } else {
        // Fallback: download via blob (non-Electron)
        if (statusEl) statusEl.textContent = t('exec.exportNotElectron');
        if (btn) btn.disabled = false;
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = e.message || t('common.error');
      if (btn) btn.disabled = false;
    }
  }

  function buildExcelSheets(data, scope) {
    const sheets = [];

    // ── Sheet 1: Health Checks ──────────────────────────────────────────────
    if (data.health_checks && data.health_checks.length > 0) {
      sheets.push({
        name: 'Health Checks',
        headers: [
          'Customer', 'Health Check', 'Status', 'DR Number', 'Owner',
          'Region', 'Country', 'Vertical', 'Date',
          'Doc Count', 'Avg Score', 'Score: Good', 'Score: Fair', 'Score: Poor',
          '% Tagged', '% Linearized', '% Encrypted', '% XFA', 'PII Docs', 'Avg Accessibility %'
        ],
        rows: data.health_checks.map(h => [
          h.customer_name || '',
          h.name || '',
          h.status || '',
          h.dr_number || '',
          h.owner || '',
          h.region || '',
          h.country || '',
          h.vertical || '',
          h.created_at ? h.created_at.slice(0, 10) : '',
          h.doc_count || 0,
          h.avg_score != null ? h.avg_score : '',
          h.score_good || 0,
          h.score_fair || 0,
          h.score_poor || 0,
          h.pct_tagged || 0,
          h.pct_linearized || 0,
          h.pct_encrypted || 0,
          h.pct_xfa || 0,
          h.pii_count || 0,
          h.avg_access_rate != null ? h.avg_access_rate : '',
        ])
      });
    }

    // ── Sheet 2: Customer Summary (not for single-HC) ───────────────────────
    if (scope !== 'hc' && data.customers && data.customers.length > 0) {
      sheets.push({
        name: 'Customer Summary',
        headers: [
          'Customer', 'Region', 'Country', 'Vertical',
          'Health Checks', 'Total Docs', 'Avg Score',
          'Score: Good', 'Score: Fair', 'Score: Poor',
          '% Tagged', '% Encrypted', 'PII Docs'
        ],
        rows: data.customers.map(c => [
          c.name || '',
          c.region || '',
          c.country || '',
          c.vertical || '',
          c.hc_count || 0,
          c.total_docs || 0,
          c.avg_score != null ? c.avg_score : '',
          c.score_good || 0,
          c.score_fair || 0,
          c.score_poor || 0,
          c.pct_tagged || 0,
          c.pct_encrypted || 0,
          c.pii_count || 0,
        ])
      });
    }

    // ── Sheet 3: PDF Detail (single HC only) ────────────────────────────────
    if (data.documents && data.documents.length > 0) {
      sheets.push({
        name: 'PDF Detail',
        headers: [
          'Filename', 'Score', 'Category', 'Pages', 'File Size (KB)',
          'PDF Version', 'Creator App', 'Author',
          'Tagged', 'Linearized', 'Encrypted', 'Has XFA', 'Has AcroForm',
          'Certified', 'Signed', 'PDF/A', 'PDF/UA',
          'PII Detected', 'Has Embedded Files',
          'Copy Allowed', 'Screen Reader', 'Printing',
          'Passed Checks', 'Failed Checks', 'Accessibility %'
        ],
        rows: data.documents.map(d => [
          d.filename || '',
          d.score != null ? d.score : '',
          d.score_category || '',
          d.page_count || 0,
          d.file_size_kb || '',
          d.pdf_version || '',
          d.creator_app || '',
          d.author || '',
          d.is_tagged || '',
          d.is_linearized || '',
          d.is_encrypted || '',
          d.has_xfa || '',
          d.has_acroform || '',
          d.is_certified || '',
          d.is_signed || '',
          d.pdfa_compliance || '',
          d.pdfua_compliance || '',
          d.pii_detected || '',
          d.has_embedded_files || '',
          d.copy_allowed || '',
          d.screen_reader || '',
          d.printing || '',
          d.passed_checks || 0,
          d.failed_checks || 0,
          d.accessibility_rate != null ? d.accessibility_rate : '',
        ])
      });
    }

    return sheets;
  }

  return { render };
})();
