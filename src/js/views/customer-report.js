/* Health Check Report View
 *
 * Renders a professional, customer-facing report for a single health check,
 * covering all captured PDF properties and accessibility data.
 *
 * Navigate via: App.navigate('report', { hcId: 123 })
 *
 * The Export PDF button:
 *   1. Applies print-mode CSS to hide app chrome.
 *   2. Calls window.electronAPI.exportReportPdf() — Electron prints the page
 *      to PDF, uploads to Adobe PDF Services, runs Auto Tag for accessibility,
 *      then prompts the user to save.
 */
const CustomerReportView = (() => {

  // ── Colour helpers ────────────────────────────────────────────────────────
  const S_GOOD = '#2D9D78';
  const S_WARN = '#E68619';
  const S_POOR = '#E34850';

  function scoreClass(s) { return s >= 75 ? 'good' : s >= 50 ? 'warn' : 'poor'; }
  function scoreColor(s) { return s >= 75 ? S_GOOD : s >= 50 ? S_WARN : S_POOR; }
  function scoreLabel(s) { return s >= 75 ? t('dashboard.scoreGood') : s >= 50 ? t('dashboard.scoreFair') : t('dashboard.scorePoor'); }

  function boolBadge(val, goodWhenTrue = true) {
    const good = goodWhenTrue ? val : !val;
    return good
      ? `<svg viewBox="0 0 12 12" fill="none" style="width:13px;height:13px;color:${S_GOOD}"><path d="M1.5 6l3 3 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg viewBox="0 0 12 12" fill="none" style="width:13px;height:13px;color:${S_POOR}"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  }

  function fmtBytes(b) {
    if (!b) return '—';
    if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
    return Math.round(b / 1024) + ' KB';
  }

  // ── Lightweight tooltip engine ────────────────────────────────────────────
  // Single shared popover, positioned with fixed coords so it works inside
  // any scroll container. Activated by .rpt-tip-icon elements via delegation.
  const _tip = (() => {
    let el = null;
    function ensure() {
      if (el && document.body.contains(el)) return el;
      el = document.createElement('div');
      el.className = 'rpt-tip';
      document.body.appendChild(el);
      return el;
    }
    function show(trigger) {
      const html = trigger.dataset.tip;
      if (!html) return;
      const t = ensure();
      t.innerHTML = html;
      t.classList.add('rpt-tip-visible');
      // Position: prefer above the trigger, fall back to below
      const r  = trigger.getBoundingClientRect();
      const tw = t.offsetWidth  || 260;
      const th = t.offsetHeight || 60;
      let top  = r.top - th - 10;
      let left = r.left + r.width / 2 - tw / 2;
      if (top < 8) top = r.bottom + 10;
      left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
      t.style.top  = top  + 'px';
      t.style.left = left + 'px';
    }
    function hide() { if (el) el.classList.remove('rpt-tip-visible'); }
    return { show, hide };
  })();

  // Returns an inline ⓘ icon that triggers the tooltip on hover / focus.
  // `html` may contain basic markup (<strong>, <br>).
  function tipIcon(html) {
    // Encode double-quotes so the attribute stays valid
    const safe = html.replace(/"/g, '&quot;');
    return `<button class="rpt-tip-icon" data-tip="${safe}" aria-label="More information" tabindex="0">
      <svg viewBox="0 0 14 14" fill="none" style="width:12px;height:12px;display:block">
        <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2"/>
        <path d="M7 6.5v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <circle cx="7" cy="4.7" r=".6" fill="currentColor"/>
      </svg>
    </button>`;
  }

  // Wire all .rpt-tip-icon elements inside a root element
  function wireTips(root) {
    root.querySelectorAll('.rpt-tip-icon').forEach(icon => {
      icon.addEventListener('mouseenter', () => _tip.show(icon));
      icon.addEventListener('mouseleave',  _tip.hide);
      icon.addEventListener('focus',      () => _tip.show(icon));
      icon.addEventListener('blur',        _tip.hide);
    });
  }

  // ── Entry point ───────────────────────────────────────────────────────────
  async function render(container, params = {}) {
    const hcId = params.hcId;
    if (!hcId) {
      container.innerHTML = `<div class="connection-banner">${t('report.noHcSelected')}</div>`;
      return;
    }

    container.innerHTML = `
      <div class="report-topbar no-print">
        <button class="btn btn-ghost btn-sm" onclick="App.navigate('healthchecks',{id:${hcId}})">
          <svg viewBox="0 0 16 16" fill="none" style="width:14px;height:14px;margin-right:4px">
            <path d="M10 3L4 8l6 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          ${t('report.backToHc')}
        </button>
        <div style="flex:1"></div>
        <div id="reportExportArea"></div>
      </div>
      <div id="reportBody">
        <div class="flex items-center gap-8" style="color:var(--gray-400);font-size:13px;padding:40px 0">
          <div class="loading-spinner"></div> ${t('report.loading')}
        </div>
      </div>`;

    try {
      const res  = await API.healthChecks.report(hcId);
      const data = res.data || {};
      renderReport(container, data);
    } catch (e) {
      document.getElementById('reportBody').innerHTML =
        `<div class="connection-banner">${escHtml(e.message)}</div>`;
    }
  }

  // ── Full report render ────────────────────────────────────────────────────
  function renderReport(container, data) {
    const hc    = data.health_check || {};
    const sum   = data.summary      || {};
    const docs  = data.documents    || [];

    // Set Yukon context so chat questions are scoped to this report's HC
    if (typeof YukonChat !== 'undefined') {
      YukonChat.setContext({
        view:         'report',
        label:        `${hc.name || 'Report'}${hc.customer_name ? ' · ' + hc.customer_name : ''}`,
        hcId:         hc.id,
        hcName:       hc.name || null,
        customerName: hc.customer_name || null,
        avgScore:     sum.avg_score ?? null,
        status:       hc.status || null,
        docCount:     docs.length,
      });
    }
    const genAt = data.generated_at ? new Date(data.generated_at) : new Date();

    const total = docs.length || 1;
    const good  = sum.score_good || 0;
    const fair  = sum.score_fair || 0;
    const poor  = sum.score_poor || 0;
    const avg   = sum.avg_score  || 0;

    // ── Compliance bar data ───────────────────────────────────────────────
    const complianceItems = [
      { label: t('report.thTagged'),        value: sum.pct_tagged,                  color: '#1473E6', tip: t('report.tipTagged') },
      { label: t('report.thLinearized'),    value: sum.pct_linearized,              color: '#2D9D78', tip: t('report.tipLinearized') },
      { label: t('report.compUnencrypted'), value: 100 - (sum.pct_encrypted || 0), color: '#9B59B6', tip: t('report.tipEncrypted') },
      { label: t('report.compNoXfa'),       value: 100 - (sum.pct_xfa      || 0), color: '#E68619', tip: t('report.tipXfa') },
      ...(sum.perm_has_data > 0 ? [
        { label: t('report.compScreenReaderOk'), value: 100 - (sum.pct_at_blocked   || 0), color: '#E34850', tip: t('report.tipScreenReader') },
        { label: t('report.compCopyOk'),         value: 100 - (sum.pct_copy_blocked || 0), color: '#2680EB', tip: t('report.tipCopyOk') },
      ] : []),
    ];

    // ── Creator app aggregation ───────────────────────────────────────────
    // Shorten verbose app strings (e.g. "Microsoft® Word for Microsoft 365" → "Microsoft Word")
    function shortAppName(raw) {
      if (!raw) return t('report.unknown');
      return raw
        .replace(/®|™|©/g, '')          // strip trademark symbols
        .replace(/\s+for\s+.+$/i, '')   // strip " for Microsoft 365" etc.
        .replace(/\s+\d{4}$/,'')        // strip trailing year
        .trim()
        .slice(0, 32);                  // hard cap length
    }
    const appCounts = {};
    docs.forEach(doc => {
      const name = shortAppName(doc.creator_app);
      appCounts[name] = (appCounts[name] || 0) + 1;
    });
    // Sort descending, collapse tail into "Other" if more than 7 distinct apps
    const appSorted = Object.entries(appCounts).sort((a, b) => b[1] - a[1]);
    const TOP_N = 7;
    let appSegments;
    if (appSorted.length > TOP_N) {
      const top   = appSorted.slice(0, TOP_N);
      const other = appSorted.slice(TOP_N).reduce((s, [, v]) => s + v, 0);
      appSegments = [...top, [t('report.other'), other]];
    } else {
      appSegments = appSorted;
    }

    // ── Accessibility check aggregation ───────────────────────────────────
    const checkAgg = {};
    docs.forEach(doc => {
      (doc.checks || []).forEach(ch => {
        const name = ch.checkName || 'Unknown';
        if (!checkAgg[name]) checkAgg[name] = { name, passed: 0, failed: 0, warnings: 0 };
        const s = (ch.status || '').toLowerCase();
        if      (s.includes('pass')) checkAgg[name].passed++;
        else if (s.includes('fail')) checkAgg[name].failed++;
        else                         checkAgg[name].warnings++;
      });
    });
    const checks = Object.values(checkAgg)
      .map(c => ({ ...c, total: c.passed + c.failed + c.warnings,
                   passRate: c.passed + c.failed + c.warnings > 0
                     ? Math.round(c.passed / (c.passed + c.failed + c.warnings) * 100) : 0 }))
      .sort((a, b) => b.failed - a.failed);

    // Customer sub-line
    const custLine = [hc.customer_name, hc.region, hc.country, hc.vertical]
      .filter(Boolean).join(' · ') || '';

    // ── Render ────────────────────────────────────────────────────────────
    document.getElementById('reportBody').innerHTML = `

      <!-- ── REPORT HEADER ─────────────────────────────────────────────── -->
      <div class="report-page-header">
        <div class="report-brand">
          <img src="assets/images/acrobat.svg" style="width:32px;height:32px;flex-shrink:0" alt="Adobe Acrobat">
          <div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--gray-500)">${t('report.title')}</div>
            <div style="font-size:20px;font-weight:700;color:var(--gray-900);margin-top:1px">${escHtml(hc.name || t('report.defaultName'))}</div>
            ${custLine ? `<div style="font-size:13px;color:var(--gray-500);margin-top:2px">${escHtml(custLine)}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="font-size:12px;color:var(--gray-500);text-align:right;line-height:1.8">
            ${t('report.generated')} ${genAt.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}<br>
            <span class="status-pill status-${hc.status}" style="font-size:11px">${ucFirst(hc.status || '')}</span>
          </div>
          <div id="exportBtnWrap" class="no-print"></div>
        </div>
      </div>

      <!-- ── KPI STRIP ─────────────────────────────────────────────────── -->
      <div class="report-kpi-strip">
        <div class="report-kpi"><div class="report-kpi-val">${sum.total_docs || 0}</div><div class="report-kpi-lbl">${t('report.kpiPdfsAnalysed')}${tipIcon(t('report.tipTotalDocs'))}</div></div>
        <div class="report-kpi"><div class="report-kpi-val">${(sum.total_pages || 0).toLocaleString()}</div><div class="report-kpi-lbl">${t('report.kpiTotalPages')}${tipIcon(t('report.tipTotalPages'))}</div></div>
        <div class="report-kpi"><div class="report-kpi-val" style="color:${scoreColor(avg)}">${avg || '—'}</div><div class="report-kpi-lbl">${t('report.kpiAvgScore')}${tipIcon(t('report.tipAvgScore'))}</div></div>
        <div class="report-kpi"><div class="report-kpi-val">${sum.avg_access_rate != null ? sum.avg_access_rate + '%' : '—'}</div><div class="report-kpi-lbl">${t('report.kpiAccessRate')}${tipIcon(t('report.tipAccessRate'))}</div></div>
        <div class="report-kpi"><div class="report-kpi-val">${sum.pct_tagged}%</div><div class="report-kpi-lbl">${t('report.kpiTaggedPdfs')}${tipIcon(t('report.tipTaggedKpi'))}</div></div>
        <div class="report-kpi"><div class="report-kpi-val">${sum.pct_linearized}%</div><div class="report-kpi-lbl">${t('report.kpiLinearized')}${tipIcon(t('report.tipLinKpi'))}</div></div>
      </div>

      <!-- ── SECTION 1: EXECUTIVE SUMMARY ──────────────────────────────── -->
      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-num">01</div>
          <h2 class="report-section-title">${t('report.sec01')}</h2>
        </div>

        <div style="display:grid;grid-template-columns:180px 1fr;gap:24px;align-items:start">
          <!-- Score ring -->
          <div style="display:flex;flex-direction:column;align-items:center;gap:10px">
            <div id="execScoreDonut"></div>
            <div style="font-size:12px;color:var(--gray-500);text-align:center;display:flex;align-items:center;justify-content:center;gap:2px">
              ${t('report.overallHealthScore')}${tipIcon(t('report.tipOverallScore'))}
            </div>
          </div>

          <!-- Score breakdown + compliance bars -->
          <div>
            <div style="display:flex;gap:10px;margin-bottom:20px">
              ${[[t('reports.goodRange'), good, S_GOOD], [t('reports.fairRange'), fair, S_WARN], [t('reports.poorRange'), poor, S_POOR]].map(([lbl,val,col]) => `
                <div style="flex:1;padding:14px;border-radius:10px;background:var(--gray-75);text-align:center">
                  <div style="font-size:22px;font-weight:700;color:${col}">${val}</div>
                  <div style="font-size:11px;color:var(--gray-500);margin-top:2px">${lbl}</div>
                </div>`).join('')}
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${complianceItems.map(it => {
                const v = it.value || 0;
                return `<div>
                  <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
                    <span style="color:var(--gray-600);display:flex;align-items:center">${it.label}${it.tip ? tipIcon(it.tip) : ''}</span>
                    <span style="font-weight:600;color:${it.color}">${v}%</span>
                  </div>
                  <div class="progress-bar"><div class="progress-fill" style="width:${v}%;background:${it.color}"></div></div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Insight bullets -->
        <div class="report-insights" style="margin-top:20px">
          ${renderInsights(sum, avg)}
        </div>
      </div>

      <!-- ── SECTION 2: PDF PROPERTIES ─────────────────────────────────── -->
      <div class="report-section report-section-landscape">
        <div class="report-section-header">
          <div class="report-section-num">02</div>
          <h2 class="report-section-title">${t('report.sec02')}</h2>
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
          ${propStatCard(t('report.thTagged'),     sum.pct_tagged     + '%', sum.pct_tagged     >= 80 ? S_GOOD : sum.pct_tagged     >= 50 ? S_WARN : S_POOR, t('report.tipTagged'))}
          ${propStatCard(t('report.thLinearized'), sum.pct_linearized + '%', sum.pct_linearized >= 80 ? S_GOOD : S_WARN,                                        t('report.tipLinearized'))}
          ${propStatCard(t('report.thEncrypted'),  sum.pct_encrypted  + '%', sum.pct_encrypted   > 0 ? S_WARN : S_GOOD,                                        t('report.tipEncrypted'))}
          ${propStatCard(t('report.statHasXfa'),   sum.pct_xfa        + '%', sum.pct_xfa          > 0 ? S_POOR : S_GOOD,                                        t('report.tipXfa'))}
        </div>

        ${sum.perm_has_data > 0 ? `
        <div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--gray-500);margin-bottom:8px;padding:0 2px">${t('report.permissionsSection')} <span style="font-weight:400;color:var(--gray-400)">(${t('report.permissionsEncryptedNote', { n: sum.perm_has_data })})</span></div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
            ${propStatCard(t('doc.permAssistiveTech'),  (100-(sum.pct_at_blocked||0))+'%',    (sum.pct_at_blocked||0)>0  ? S_POOR : S_GOOD, t('report.tipScreenReader'))}
            ${propStatCard(t('doc.permissionsAllowCopy'),(100-(sum.pct_copy_blocked||0))+'%', (sum.pct_copy_blocked||0)>0? S_WARN : S_GOOD, t('report.tipCopyOk'))}
            ${propStatCard(t('doc.permPrinting'),       (100-(sum.pct_print_blocked||0))+'%', (sum.pct_print_blocked||0)>0?S_WARN : S_GOOD, t('report.tipPrinting'))}
            ${propStatCard(t('doc.permFormFilling'),    (100-(sum.pct_form_fill_blocked||0))+'%',(sum.pct_form_fill_blocked||0)>0?S_WARN:S_GOOD, t('report.tipFormFilling'))}
          </div>
        </div>` : ''}

        <!-- Creator apps donut chart -->
        <div style="display:inline-flex;align-items:center;gap:28px;padding:20px;border-radius:10px;background:var(--gray-75);border:1px solid var(--gray-100);margin-bottom:20px;max-width:560px;width:auto">
          <div style="flex-shrink:0">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-500);margin-bottom:14px;white-space:nowrap;display:flex;align-items:center">${t('report.creatorApps')}${tipIcon(t('report.tipCreatorApps'))}</div>
            <div id="creatorAppsDonut"></div>
          </div>
          <div id="creatorAppsLegend" style="width:240px;display:flex;flex-direction:column;gap:7px"></div>
        </div>

        <div class="table-wrap" style="max-height:none">
          <table style="font-size:12px">
            <thead><tr>
              <th>${t('report.thFile')}</th>
              <th>${t('report.thPdfVer')}</th>
              <th style="text-align:center">${t('report.thPages')}</th>
              <th style="text-align:right">${t('report.thSize')}</th>
              <th style="text-align:center">${t('report.thTagged')}</th>
              <th style="text-align:center">${t('report.thLinearized')}</th>
              <th style="text-align:center">${t('report.thEncrypted')}</th>
              <th style="text-align:center">${t('report.thXfa')}</th>
              <th style="text-align:center">${t('report.thAcroForm')}</th>
              <th>${t('report.thCreatorApp')}</th>
              <th style="text-align:center">${t('report.thScore')}</th>
            </tr></thead>
            <tbody>
              ${docs.length ? docs.map(doc => `
                <tr>
                  <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500"
                      title="${escHtml(doc.filename)}">${escHtml(doc.filename)}</td>
                  <td>${doc.pdf_version ? 'PDF ' + doc.pdf_version : '—'}</td>
                  <td style="text-align:center">${doc.page_count || '—'}</td>
                  <td style="text-align:right;color:var(--gray-500)">${fmtBytes(doc.file_size)}</td>
                  <td style="text-align:center">${boolBadge(doc.is_tagged)}</td>
                  <td style="text-align:center">${boolBadge(doc.is_linearized)}</td>
                  <td style="text-align:center">${boolBadge(!doc.is_encrypted)}</td>
                  <td style="text-align:center">${boolBadge(!doc.has_xfa)}</td>
                  <td style="text-align:center">${doc.has_acroform ? '✓' : '—'}</td>
                  <td style="color:var(--gray-500);font-size:11px">${escHtml(doc.creator_app || '—')}</td>
                  <td style="text-align:center">${doc.overall_score != null
                    ? `<span class="score-pill ${scoreClass(doc.overall_score)}">${doc.overall_score}</span>`
                    : '—'}</td>
                </tr>`).join('')
              : `<tr><td colspan="11" style="text-align:center;color:var(--gray-400);padding:20px">${t('report.noCompletedDocs')}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── SECTION 3: ACCESSIBILITY ───────────────────────────────────── -->
      <div class="report-section report-section-landscape">
        <div class="report-section-header">
          <div class="report-section-num">03</div>
          <h2 class="report-section-title">${t('report.sec03')}</h2>
        </div>

        ${sum.avg_access_rate != null ? `
        <div style="display:grid;grid-template-columns:160px 1fr;gap:24px;margin-bottom:20px;align-items:start">
          <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
            <div id="accessScoreDonut"></div>
            <div style="font-size:11px;color:var(--gray-500);text-align:center;display:flex;align-items:center;justify-content:center;gap:2px">${t('report.avgPassRate')}${tipIcon(t('report.tipAccessAvg'))}</div>
          </div>
          <div>
            ${checks.slice(0, 15).map(ch => `
              <div style="margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px">
                  <span style="color:var(--gray-700);font-weight:${ch.failed > 0 ? '600' : '400'}">${escHtml(ch.name)}</span>
                  <span style="color:${ch.failed > 0 ? S_POOR : S_GOOD};font-weight:600">${ch.passRate}%</span>
                </div>
                <div class="progress-bar" style="height:4px">
                  <div class="progress-fill" style="width:${ch.passRate}%;background:${ch.passRate >= 80 ? S_GOOD : ch.passRate >= 50 ? S_WARN : S_POOR}"></div>
                </div>
              </div>`).join('')}
          </div>
        </div>
        ${renderWorstAccessDocs(docs)}
        ` : `<div class="empty-state" style="padding:24px"><h3>${t('report.noAccessData')}</h3><p>${t('report.noAccessDataSub')}</p></div>`}
      </div>

      <!-- ── SECTION 4: METADATA & PII ──────────────────────────────────── -->
      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-num">04</div>
          <h2 class="report-section-title">${t('report.sec04')}</h2>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
          ${propStatCard(t('report.metaAuthorPresent'), sum.has_author + ' / ' + sum.total_docs + ' docs', '#1473E6', 'Number of documents with the Author field set in their PDF metadata.')}
          ${propStatCard(t('report.metaPersonDetected'), sum.pii_count + ' docs', sum.pii_count > 0 ? S_POOR : S_GOOD, 'Documents where the Author field appears to contain a personal name. These may pose <strong>GDPR/privacy liability</strong> when shared externally.')}
          ${propStatCard(t('report.metaNoAuthor'), (sum.total_docs - sum.has_author) + ' docs', (sum.total_docs - sum.has_author) > 0 ? S_WARN : S_GOOD, 'Documents with no Author metadata. Missing metadata reduces traceability but poses no direct PII risk.')}
        </div>

        ${sum.pii_count > 0 ? `
        <div class="report-callout report-callout-warn" style="margin-bottom:16px">
          <strong>${t('report.piiCalloutPrefix')}</strong>
          ${sum.pii_count !== 1
            ? t('report.piiCalloutBodyPlural', { count: sum.pii_count })
            : t('report.piiCalloutBody',       { count: sum.pii_count })}
        </div>
        <div class="table-wrap">
          <table style="font-size:12px">
            <thead><tr><th>${t('report.thFile')}</th><th>${t('reports.piiThAuthor')}</th><th>${t('report.thScore')}</th></tr></thead>
            <tbody>
              ${docs.filter(d => d.pii_author).map(doc => `<tr>
                <td style="font-weight:500;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(doc.filename)}</td>
                <td><span style="color:${S_POOR};font-weight:600;background:#FCE8E9;padding:2px 8px;border-radius:12px;font-size:11px">${escHtml(doc.author || '—')}</span></td>
                <td>${doc.overall_score != null ? `<span class="score-pill ${scoreClass(doc.overall_score)}">${doc.overall_score}</span>` : '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `
        <div style="padding:16px;border-radius:10px;background:var(--green-light);color:var(--green);font-size:13px;font-weight:500">
          ${t('report.noPii')}
        </div>`}
      </div>

      <!-- ── FOOTER ─────────────────────────────────────────────────────── -->
      <div class="report-footer no-print">
        <img src="assets/images/acrobat.svg" style="width:20px;height:20px;opacity:.4" alt="">
        <span>${t('report.footerLabel')} — ${escHtml(hc.name || '')} — ${genAt.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</span>
      </div>
      <div class="report-footer-print print-only">
        <span>${t('report.footerLabel')}: ${escHtml(hc.name || '')} · ${escHtml(hc.customer_name || '')} — ${t('report.footerConfidential')} — ${genAt.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</span>
      </div>`;

    // ── Sticky topbar shadow (IntersectionObserver on a sentinel pixel) ──
    const topbarEl = container.querySelector('.report-topbar');
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'height:1px;pointer-events:none;margin-top:-1px';
    document.getElementById('reportBody').prepend(sentinel);
    const mainContent = document.getElementById('mainContent');
    if (topbarEl && mainContent) {
      new IntersectionObserver(
        ([entry]) => topbarEl.classList.toggle('is-stuck', !entry.isIntersecting),
        { root: mainContent, threshold: 0 }
      ).observe(sentinel);
    }

    // ── Creator apps donut chart ──────────────────────────────────────────
    const donutEl  = document.getElementById('creatorAppsDonut');
    const legendEl = document.getElementById('creatorAppsLegend');
    if (donutEl && appSegments.length) {
      const segments = appSegments.map(([name, count], i) => ({
        value: count,
        color: Charts.CAT[i % Charts.CAT.length],
        label: name,
      }));
      Charts.donut(donutEl, {
        segments,
        size:     160,
        label:    String(docs.length),
        sublabel: docs.length === 1 ? t('report.pdf') : t('report.pdfs'),
      });

      if (legendEl) {
        legendEl.innerHTML = segments.map(seg => {
          const pct = Math.round((seg.value / docs.length) * 100);
          return `
            <div style="display:flex;align-items:center;gap:8px">
              <span style="width:10px;height:10px;border-radius:2px;flex-shrink:0;background:${seg.color}"></span>
              <span style="font-size:12px;color:var(--gray-700);flex:1;
                           overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                    title="${escHtml(seg.label)}">${escHtml(seg.label)}</span>
              <span style="font-size:12px;color:var(--gray-500);white-space:nowrap">${seg.value} · ${pct}%</span>
            </div>`;
        }).join('');
      }
    } else if (donutEl) {
      donutEl.closest('div[style]').style.display = 'none'; // hide if no data
    }

    // ── Executive summary score donut ────────────────────────────────────
    const execDonutEl = document.getElementById('execScoreDonut');
    if (execDonutEl && avg != null) {
      Charts.donut(execDonutEl, {
        segments: [
          { value: avg,       color: scoreColor(avg) },
          { value: 100 - avg, color: 'var(--gray-200)' },
        ],
        size:     140,
        label:    `${avg}`,
        sublabel: scoreLabel(avg),
      });
    }

    // ── Accessibility pass-rate donut ─────────────────────────────────────
    const accessDonutEl = document.getElementById('accessScoreDonut');
    if (accessDonutEl && sum.avg_access_rate != null) {
      const ar = sum.avg_access_rate;
      Charts.donut(accessDonutEl, {
        segments: [
          { value: ar,       color: scoreColor(ar) },
          { value: 100 - ar, color: 'var(--gray-200)' },
        ],
        size:     120,
        label:    `${ar}%`,
        sublabel: scoreLabel(ar),
      });
    }

    // ── Wire tooltips on the fully-rendered report ────────────────────────
    const reportBody = document.getElementById('reportBody');
    if (reportBody) wireTips(reportBody);

    // ── Export button ─────────────────────────────────────────────────────
    const exportWrap = document.getElementById('exportBtnWrap');
    if (exportWrap) {
      exportWrap.innerHTML = `
        <button class="btn btn-primary" id="exportPdfBtn"
          ${!window.electronAPI ? `disabled title="${t('report.exportOnlyDesktop')}"` : ''}>
          <svg viewBox="0 0 16 16" fill="none" style="width:14px;height:14px;flex-shrink:0">
            <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3 12h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          ${t('report.exportPdf')}
        </button>`;
      document.getElementById('exportPdfBtn').onclick = () => exportPdf(hc.name || 'Health_Check');
    }
  }

  // ── Worst accessibility documents table ───────────────────────────────────
  function renderWorstAccessDocs(docs) {
    const worst = docs
      .filter(d => d.failed_checks > 0)
      .sort((a, b) => b.failed_checks - a.failed_checks)
      .slice(0, 5);
    if (!worst.length) {
      return `<div style="padding:12px 16px;border-radius:8px;background:var(--green-light);color:var(--green);font-size:13px">${t('report.allPassAcc')}</div>`;
    }
    return `
      <div class="section-title" style="margin-top:20px"><span>${t('report.accIssuesDocs')}</span></div>
      <div class="table-wrap">
        <table style="font-size:12px">
          <thead><tr>
            <th>${t('report.thFile')}</th>
            <th style="text-align:right">${t('report.thPassed')}</th>
            <th style="text-align:right">${t('report.thFailed')}</th>
            <th style="text-align:right">${t('report.thWarnings')}</th>
            <th style="width:120px">${t('report.thPassRate')}</th>
            <th>${t('report.thScore')}</th>
          </tr></thead>
          <tbody>
            ${worst.map(doc => {
              const tot = (doc.passed_checks + doc.failed_checks + doc.warning_checks) || 1;
              const pct = Math.round(doc.passed_checks / tot * 100);
              return `<tr>
                <td style="font-weight:500;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(doc.filename)}</td>
                <td style="text-align:right;color:${S_GOOD}">${doc.passed_checks}</td>
                <td style="text-align:right;color:${S_POOR};font-weight:600">${doc.failed_checks}</td>
                <td style="text-align:right;color:${S_WARN}">${doc.warning_checks}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px">
                    <div class="progress-bar" style="height:4px;flex:1">
                      <div class="progress-fill" style="width:${pct}%;background:${pct>=80?S_GOOD:pct>=50?S_WARN:S_POOR}"></div>
                    </div>
                    <span style="font-size:11px;width:28px;text-align:right;color:var(--gray-500)">${pct}%</span>
                  </div>
                </td>
                <td>${doc.overall_score != null ? `<span class="score-pill ${scoreClass(doc.overall_score)}">${doc.overall_score}</span>` : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ── Insight bullets ───────────────────────────────────────────────────────
  function renderInsights(sum, avg) {
    const strengths = [], issues = [];

    if (avg >= 75)      strengths.push(t('report.insightScoreGood'));
    else if (avg >= 50) issues.push(t('report.insightScoreFair'));
    else if (avg > 0)   issues.push(t('report.insightScorePoor'));

    if ((sum.pct_tagged || 0) >= 80)
      strengths.push(t('report.insightTaggedGood', { pct: sum.pct_tagged }));
    else
      issues.push(t('report.insightTaggedBad', { pct: sum.pct_tagged || 0 }));

    if ((sum.avg_access_rate || 0) >= 80)
      strengths.push(t('report.insightAccessGood', { rate: sum.avg_access_rate }));
    else if (sum.avg_access_rate != null)
      issues.push(t('report.insightAccessBad', { rate: sum.avg_access_rate }));

    if ((sum.pct_linearized || 0) >= 80)
      strengths.push(t('report.insightLinGood', { pct: sum.pct_linearized }));
    else
      issues.push(t('report.insightLinBad', { pct: sum.pct_linearized || 0 }));

    if ((sum.pct_xfa || 0) > 0)
      issues.push(t('report.insightXfa', { pct: sum.pct_xfa }));
    if ((sum.pii_count || 0) > 0)
      issues.push(sum.pii_count !== 1
        ? t('report.insightPiiPlural', { count: sum.pii_count })
        : t('report.insightPii',       { count: sum.pii_count }));
    // Permission insights (only for encrypted PDFs)
    if (sum.perm_has_data > 0) {
      if ((sum.pct_at_blocked || 0) > 0)
        issues.push(t('report.insightAtBlocked', { pct: sum.pct_at_blocked }));
      if ((sum.pct_copy_blocked || 0) > 10)
        issues.push(t('report.insightCopyBlocked', { pct: sum.pct_copy_blocked }));
      if ((sum.pct_print_blocked || 0) > 10)
        issues.push(t('report.insightPrintBlocked', { pct: sum.pct_print_blocked }));
      if ((sum.pct_at_blocked || 0) === 0 && (sum.pct_copy_blocked || 0) === 0)
        strengths.push(t('report.insightPermissionsOk'));
    }

    if (!strengths.length && !issues.length)
      return `<div style="font-size:13px;color:var(--gray-500)">${t('report.insightNoData')}</div>`;

    return `
      ${strengths.length ? `
        <div style="margin-bottom:10px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${S_GOOD};margin-bottom:6px">${t('report.insightStrengths')}</div>
          ${strengths.map(s => `<div style="font-size:13px;color:var(--gray-700);padding:3px 0;display:flex;gap:8px"><span style="color:${S_GOOD};flex-shrink:0">✓</span><span>${s}</span></div>`).join('')}
        </div>` : ''}
      ${issues.length ? `
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${S_WARN};margin-bottom:6px">${t('report.insightImprove')}</div>
          ${issues.map(w => `<div style="font-size:13px;color:var(--gray-700);padding:3px 0;display:flex;gap:8px"><span style="color:${S_WARN};flex-shrink:0">⚠</span><span>${w}</span></div>`).join('')}
        </div>` : ''}`;
  }

  // ── Stat card helper ──────────────────────────────────────────────────────
  function propStatCard(label, value, color, tip = '') {
    return `
      <div style="padding:16px;border-radius:10px;background:var(--gray-75);border:1px solid var(--gray-100)">
        <div style="font-size:11px;color:var(--gray-500);text-transform:uppercase;letter-spacing:.05em;font-weight:600;margin-bottom:6px;display:flex;align-items:center">
          <span>${label}</span>${tip ? tipIcon(tip) : ''}
        </div>
        <div style="font-size:20px;font-weight:700;color:${color}">${value}</div>
      </div>`;
  }

  // ── PDF Export overlay helpers ────────────────────────────────────────────
  function showExportOverlay() {
    const el = document.createElement('div');
    el.id = 'exportOverlay';
    el.innerHTML = `
      <div class="export-modal">
        <div class="export-modal-icon">
          <div class="export-spinner"></div>
        </div>
        <div class="export-modal-title">${t('report.exportCreating')}</div>
        <div class="export-modal-step" id="exportStep">${t('report.exportRendering')}</div>
        <div class="export-modal-steps">
          <div class="export-step-row" id="estep-render">
            <span class="export-step-dot active"></span><span>${t('report.exportStepRender')}</span>
          </div>
          <div class="export-step-row" id="estep-upload">
            <span class="export-step-dot"></span><span>${t('report.exportStepUpload')}</span>
          </div>
          <div class="export-step-row" id="estep-tag">
            <span class="export-step-dot"></span><span>${t('report.exportStepTag')}</span>
          </div>
          <div class="export-step-row" id="estep-save">
            <span class="export-step-dot"></span><span>${t('report.exportStepSave')}</span>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    // Trigger CSS enter transition next frame
    requestAnimationFrame(() => el.classList.add('visible'));
    return el;
  }

  function setExportStep(stepId) {
    // Mark all steps up to and including stepId as done/active
    const order = ['render', 'upload', 'tag', 'save'];
    const idx   = order.indexOf(stepId);
    order.forEach((id, i) => {
      const dot = document.querySelector(`#estep-${id} .export-step-dot`);
      if (!dot) return;
      dot.className = 'export-step-dot ' + (i < idx ? 'done' : i === idx ? 'active' : '');
    });
    const labels = {
      render: t('report.exportRendering'),
      upload: t('report.exportUploading'),
      tag:    t('report.exportTagging'),
      save:   t('report.exportSaving'),
    };
    const stepEl = document.getElementById('exportStep');
    if (stepEl && labels[stepId]) stepEl.textContent = labels[stepId];
  }

  function closeExportOverlay(overlayEl, success, message) {
    if (!overlayEl) return;
    const modal = overlayEl.querySelector('.export-modal');

    if (success) {
      // Swap to success state then auto-dismiss after 1.8 s
      modal.innerHTML = `
        <div class="export-modal-icon success">
          <svg viewBox="0 0 40 40" fill="none" style="width:40px;height:40px">
            <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="2.5"/>
            <path d="M11 20l6 6 12-12" stroke="currentColor" stroke-width="2.5"
                  stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="export-modal-title">${t('report.exportReady')}</div>
        <div class="export-modal-step">${escHtml(message || 'Accessible PDF saved successfully.')}</div>`;
      setTimeout(() => dismiss(), 1800);
    } else {
      // Error state — show message + close button
      modal.innerHTML = `
        <div class="export-modal-icon error">
          <svg viewBox="0 0 40 40" fill="none" style="width:40px;height:40px">
            <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="2.5"/>
            <path d="M13 13l14 14M27 13L13 27" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="export-modal-title">${t('report.exportFailed')}</div>
        <div class="export-modal-step">${escHtml(message || t('report.exportError'))}</div>
        <button class="btn btn-secondary" style="margin-top:20px" onclick="document.getElementById('exportOverlay')?.remove()">${t('common.close')}</button>`;
    }

    function dismiss() {
      overlayEl.classList.remove('visible');
      overlayEl.addEventListener('transitionend', () => overlayEl.remove(), { once: true });
    }
  }

  // ── PDF Export ────────────────────────────────────────────────────────────
  async function exportPdf(hcName) {
    if (!window.electronAPI) {
      Toast.show(t('report.exportOnlyDesktop'), 'warning');
      return;
    }

    const btn = document.getElementById('exportPdfBtn');
    if (btn) btn.disabled = true;

    // Show the overlay immediately — stays visible for the full export duration.
    // main.js handles hiding it briefly during printToPDF, then restores it.
    const overlay = showExportOverlay();

    try {
      // Advance step indicators on approximate timings:
      //  0 s  → render   (printToPDF + 800 ms sleep)
      //  3 s  → upload   (asset create + PUT)
      //  7 s  → tag      (Auto Tag job poll, typically 10–30 s)
      setExportStep('render');
      const t1 = setTimeout(() => setExportStep('upload'), 3000);
      const t2 = setTimeout(() => setExportStep('tag'),    7000);

      const result = await window.electronAPI.exportReportPdf({ customerName: hcName });
      clearTimeout(t1);
      clearTimeout(t2);

      if (result.cancelled) {
        closeExportOverlay(overlay, false, t('report.exportCancelled'));
      } else if (result.success) {
        setExportStep('save');
        const shortPath = result.filePath
          ? result.filePath.split(/[\\/]/).pop()
          : 'report.pdf';
        closeExportOverlay(overlay, true, t('report.exportSavedAs', { name: shortPath }));
      } else {
        closeExportOverlay(overlay, false, t('report.exportFailedRetry'));
      }
    } catch (e) {
      closeExportOverlay(overlay, false, e.message || t('report.exportError'));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg viewBox="0 0 16 16" fill="none" style="width:14px;height:14px;flex-shrink:0">
            <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3 12h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          ${t('report.exportPdf')}`;
      }
    }
  }

  return { render };
})();
