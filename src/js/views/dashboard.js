/* Dashboard View */
const DashboardView = (() => {

  function scoreClass(s) { return s >= 75 ? 'good' : s >= 50 ? 'warn' : 'poor'; }
  function scoreLabel(s) { return s >= 75 ? t('dashboard.scoreGood') : s >= 50 ? t('dashboard.scoreFair') : t('dashboard.scorePoor'); }

  // Spectrum categorical colours (aliased from Charts.CAT for inline use)
  const C_BLUE    = 'rgb(20,122,243)';    // CAT[5]  — blue
  const C_TEAL    = 'rgb(15,181,174)';    // CAT[0]  — seafoam teal
  const C_ORANGE  = 'rgb(246,133,17)';    // CAT[2]  — orange
  const C_INDIGO  = 'rgb(64,70,202)';     // CAT[1]  — indigo
  const C_PURPLE  = 'rgb(115,38,211)';    // CAT[6]  — purple
  const C_MAGENTA = 'rgb(222,61,130)';    // CAT[3]  — magenta (used for encrypted/XFA)

  // Semantic score colours — CSS vars so inline styles and SVG fills
  // automatically pick up the dark-mode overrides defined in styles.css.
  const S_GOOD = 'var(--green)';
  const S_WARN = 'var(--yellow)';
  const S_POOR = 'var(--red)';

  async function render(container) {
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-row">
          <div>
            <h1>${t('dashboard.title')}</h1>
            <p>${t('dashboard.subtitle')}</p>
          </div>
          <div class="flex gap-8">
            <select class="filter-select" id="dashPeriod">
              <option value="30">${t('reports.last30')}</option>
              <option value="60">Last 60 days</option>
              <option value="90">${t('reports.last90')}</option>
              <option value="0">${t('reports.allTime')}</option>
            </select>
            <button class="btn btn-primary" id="dashNewBtn">
              <svg viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              ${t('common.newHealthCheck')}
            </button>
          </div>
        </div>
      </div>
      <div id="dashContent">
        <div class="flex items-center gap-8" style="color:var(--gray-400);font-size:13px">
          <div class="loading-spinner"></div> ${t('dashboard.loading')}
        </div>
      </div>`;

    document.getElementById('dashNewBtn').onclick = () => App.navigate('healthchecks', { action: 'new' });

    try {
      const [overview, trend, byRegion, byVertical, bySegment, recent, creatorApps, byCountry, piiDocs, timeline] = await Promise.all([
        API.stats.overview(),
        API.stats.trend(30),
        API.stats.byRegion(),
        API.stats.byVertical(),
        API.stats.bySegment().catch(() => ({ data: [] })),
        API.healthChecks.list({ limit: 8, sort: 'created_at', order: 'desc' }),
        API.stats.creatorApps().catch(() => ({ data: [] })),
        API.stats.byCountry().catch(()  => ({ data: [] })),
        API.stats.piiDocs().catch(()    => ({ data: { pii_count: 0, total: 0 } })),
        API.stats.timeline({ granularity: 'month' }, {}).catch(() => ({ data: { rows: [] } })),
      ]);
      renderContent(container, overview.data, trend.data, byRegion.data || [], byVertical.data || [], bySegment.data || [], recent, creatorApps.data || [], byCountry.data || [], piiDocs.data || {}, (timeline.data || {}).rows || []);
    } catch (e) {
      document.getElementById('dashContent').innerHTML = `
        <div class="connection-banner">
          <svg viewBox="0 0 16 16" fill="none"><path d="M8 2L15 14H1L8 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6.5v3M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          ${e.message} — <button class="btn-ghost btn btn-sm" onclick="DashboardView.reload()">${t('common.retry')}</button>
        </div>`;
    }
  }

  function renderContent(container, ov, trend, byRegion, byVertical, bySegment, recent, creatorApps, byCountry, piiData, timelineRows = []) {
    const avgScore  = ov.avg_score || 0;
    const totalPdfs = ov.total_pdfs || 1;
    const content   = document.getElementById('dashContent');
    const noData    = !ov.total_health_checks;

    // Dimension scores — uses all category-relevant properties
    const taggedPct   = Math.round((ov.tagged_pdfs  || 0) / totalPdfs * 100);
    const accessRate  = ov.avg_accessibility_rate || 0;
    const pdfuaPct    = Math.round((ov.pdfua_pdfs   || 0) / totalPdfs * 100);
    const accessScore = Math.round(taggedPct * 0.25 + accessRate * 0.45 + pdfuaPct * 0.30);

    const versionPct  = Math.round((ov.pdf_version_compliant || 0) / totalPdfs * 100);
    const unencPct    = Math.round(((totalPdfs - (ov.encrypted_pdfs   || 0)) / totalPdfs) * 100);
    const noXfaPct    = Math.round(((totalPdfs - (ov.xfa_pdfs         || 0)) / totalPdfs) * 100);
    const noPiiPct          = Math.round(((totalPdfs - (ov.pii_author_pdfs           || 0)) / totalPdfs) * 100);
    const noEmbedPct        = Math.round(((totalPdfs - (ov.embedded_pdfs              || 0)) / totalPdfs) * 100);
    const noAtBlockedPct    = Math.round(((totalPdfs - (ov.perm_assistive_tech_blocked|| 0)) / totalPdfs) * 100);
    const noCopyBlockedPct  = Math.round(((totalPdfs - (ov.perm_copy_blocked          || 0)) / totalPdfs) * 100);
    const noPrintBlockedPct = Math.round(((totalPdfs - (ov.perm_printing_blocked      || 0)) / totalPdfs) * 100);
    const secScore = Math.round(
      unencPct        * 0.20 +
      noXfaPct        * 0.15 +
      noPiiPct        * 0.20 +
      noEmbedPct      * 0.10 +
      versionPct      * 0.10 +
      noAtBlockedPct  * 0.15 +
      noCopyBlockedPct* 0.10 +
      noPrintBlockedPct * 0.00  // display only; weight kept at 0 to avoid over-counting usability
    );

    const linearPct   = Math.round((ov.linearized_pdfs    || 0) / totalPdfs * 100);
    const hasTitlePct = Math.round((ov.has_title_pdfs     || 0) / totalPdfs * 100);
    const hasMetaPct  = Math.round(((ov.has_title_pdfs||0) + (ov.has_subject_pdfs||0) + (ov.has_keywords_pdfs||0) + (ov.has_author_pdfs||0)) / (4 * totalPdfs) * 100);
    const usability   = Math.round(linearPct * 0.20 + versionPct * 0.25 + hasMetaPct * 0.35 + taggedPct * 0.20);

    const avgPages   = ov.total_pdfs ? Math.round((ov.total_pages || 0) / ov.total_pdfs) : 0;
    const good = ov.score_good || 0;
    const fair = ov.score_fair || 0;
    const poor = ov.score_poor || 0;

    // PII / metadata
    const piiCount  = piiData.pii_count  || 0;
    const piiTotal  = piiData.total       || totalPdfs;
    const piiPct    = piiTotal > 0 ? Math.round(piiCount / piiTotal * 100) : 0;
    const piiColor  = piiCount > 0 ? 'red' : 'green';

    content.innerHTML = `
      <!-- KPI metrics strip — all 5 KPIs in one full-width card ──────── -->
      <div class="metrics-strip">

        <div class="metrics-strip-item clickable" onclick="App.navigate('customers')" title="${t('dashboard.kpiCustomers')}">
          <div class="stat-header">
            <div class="stat-icon blue">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M1.75 19C1.33594 19 1 18.6641 1 18.25V10.4717C1 9.99609 1.19727 9.53418 1.54102 9.20606L3.76465 7.08399C4.06153 6.79786 4.53906 6.80762 4.82422 7.1084C5.11035 7.40723 5.09961 7.88281 4.79981 8.16797L2.57715 10.29C2.52735 10.3379 2.5 10.4023 2.5 10.4717V18.25C2.5 18.6641 2.16406 19 1.75 19Z" fill="currentColor"/>
<path d="M4.25 19.0088C3.83594 19.0088 3.5 18.6728 3.5 18.2588V11.8164C3.5 11.4023 3.83594 11.0664 4.25 11.0664C4.66406 11.0664 5 11.4023 5 11.8164V18.2588C5 18.6728 4.66406 19.0088 4.25 19.0088Z" fill="currentColor"/>
<path d="M17.75 19H15.75C15.3359 19 15 18.6641 15 18.25C15 17.8359 15.3359 17.5 15.75 17.5H17.75C18.1631 17.5 18.5 17.1631 18.5 16.75V10.25C18.5 9.83691 18.1631 9.5 17.75 9.5H15.75C15.3359 9.5 15 9.16406 15 8.75C15 8.33594 15.3359 8 15.75 8H17.75C18.9902 8 20 9.00977 20 10.25V16.75C20 17.9902 18.9902 19 17.75 19Z" fill="currentColor"/>
<path d="M11.4775 3H10.75V1.75C10.75 1.33594 10.4141 1 10 1C9.58594 1 9.25 1.33594 9.25 1.75V3H8.52246C7.13184 3 6 4.00977 6 5.25V16.75C6 17.9902 7.13184 19 8.52246 19H11.4775C12.8682 19 14 17.9902 14 16.75V5.25C14 4.00977 12.8682 3 11.4775 3ZM12.5 16.75C12.5 17.1562 12.0322 17.5 11.4775 17.5H8.52246C7.96777 17.5 7.5 17.1562 7.5 16.75V5.25C7.5 4.84375 7.96777 4.5 8.52246 4.5H11.4775C12.0322 4.5 12.5 4.84375 12.5 5.25V16.75Z" fill="currentColor"/>
<path d="M8.72949 7C8.62988 7 8.53027 6.97949 8.43945 6.93945C8.34961 6.89941 8.26953 6.84961 8.20019 6.78027C8.12988 6.70996 8.06933 6.62988 8.03027 6.54004C8 6.4502 7.97949 6.34961 7.97949 6.25C7.97949 6.14941 8 6.0498 8.03027 5.95996C8.06933 5.87012 8.12988 5.79004 8.20019 5.71973C8.26953 5.64942 8.3496 5.59961 8.43945 5.55957C8.62988 5.47949 8.83007 5.47949 9.01953 5.55957C9.10937 5.59961 9.18945 5.64941 9.25976 5.71973C9.39941 5.85938 9.47949 6.04981 9.47949 6.25C9.47949 6.45019 9.39941 6.63965 9.25976 6.78027C9.18945 6.84961 9.10937 6.89941 9.01953 6.93945C8.91992 6.97949 8.83008 7 8.72949 7Z" fill="currentColor"/>
<path d="M11.25 7C11.1494 7 11.0498 6.97949 10.96 6.93945C10.8701 6.91015 10.79 6.84961 10.7197 6.78027C10.6494 6.70996 10.5996 6.62988 10.5596 6.54004C10.5195 6.4502 10.5 6.34961 10.5 6.25C10.5 6.14941 10.5195 6.0498 10.5596 5.95996C10.5996 5.87012 10.6494 5.79004 10.7197 5.71973C10.7901 5.64942 10.8701 5.59961 10.96 5.55957C11.1494 5.47949 11.3594 5.47949 11.54 5.55957C11.6299 5.59961 11.71 5.64941 11.7803 5.71973C11.8496 5.79004 11.9102 5.87012 11.9395 5.95996C11.9795 6.0498 12 6.14941 12 6.25C12 6.34961 11.9795 6.4502 11.9395 6.54004C11.9102 6.62988 11.8496 6.70996 11.7803 6.78027C11.71 6.84961 11.6299 6.91015 11.54 6.93945C11.4502 6.97949 11.3496 7 11.25 7Z" fill="currentColor"/>
<path d="M8.7295 10C8.62989 10 8.53028 9.97949 8.43946 9.93945C8.34962 9.91015 8.26954 9.84961 8.2002 9.78027C8.12989 9.70996 8.06934 9.62988 8.04004 9.54004C8 9.4502 7.97949 9.34961 7.97949 9.25C7.97949 9.14941 8 9.0498 8.04004 8.95996C8.06934 8.87012 8.12988 8.79004 8.2002 8.71973C8.26954 8.64942 8.34961 8.59961 8.43946 8.55957C8.62012 8.47949 8.83008 8.47949 9.01954 8.55957C9.10938 8.59961 9.18946 8.64941 9.25977 8.71973C9.39942 8.85938 9.4795 9.04981 9.4795 9.25C9.4795 9.45019 9.39942 9.63965 9.25977 9.78027C9.18946 9.84961 9.10938 9.91015 9.01954 9.93945C8.91993 9.97949 8.81934 10 8.7295 10Z" fill="currentColor"/>
<path d="M11.25 10C11.1494 10 11.0498 9.97949 10.96 9.93945C10.8701 9.91015 10.79 9.84961 10.7197 9.78027C10.5801 9.63965 10.5 9.45019 10.5 9.25C10.5 9.04981 10.5801 8.85938 10.7197 8.71973C10.79 8.64942 10.8701 8.59961 10.96 8.55957C11.1494 8.47949 11.3594 8.47949 11.54 8.55957C11.6299 8.59961 11.71 8.64941 11.7803 8.71973C11.8496 8.79004 11.9102 8.87012 11.9395 8.95996C11.9795 9.0498 12 9.14941 12 9.25C12 9.34961 11.9795 9.4502 11.9395 9.54004C11.9102 9.62988 11.8496 9.70996 11.7803 9.78027C11.71 9.84961 11.6299 9.91015 11.54 9.93945C11.4502 9.97949 11.3496 10 11.25 10Z" fill="currentColor"/>
<path d="M8.72949 13C8.62988 13 8.53027 12.9795 8.43945 12.9394C8.34961 12.8994 8.26953 12.8496 8.20019 12.7803C8.05957 12.6396 7.97949 12.4502 7.97949 12.25C7.97949 12.1494 8 12.0596 8.03027 11.96C8.06933 11.8701 8.12988 11.79 8.20019 11.7197C8.26953 11.6494 8.3496 11.5996 8.43945 11.5596C8.71972 11.4394 9.0498 11.5098 9.25976 11.7197C9.33007 11.79 9.37988 11.8701 9.41992 11.96C9.45996 12.0596 9.47949 12.1494 9.47949 12.25C9.47949 12.4502 9.39941 12.6396 9.25976 12.7803C9.12011 12.9199 8.91992 13 8.72949 13Z" fill="currentColor"/>
<path d="M11.25 13C11.0596 13 10.8594 12.9199 10.7197 12.7803C10.5801 12.6396 10.5 12.4502 10.5 12.25C10.5 12.1494 10.5195 12.0596 10.5596 11.96C10.5996 11.8701 10.6494 11.79 10.7197 11.7197C11.0098 11.4395 11.5 11.4395 11.7803 11.7197C11.9199 11.8594 12 12.0498 12 12.25C12 12.3496 11.9795 12.4502 11.9395 12.54C11.8994 12.6299 11.8496 12.71 11.7803 12.7803C11.6397 12.9199 11.4502 13 11.25 13Z" fill="currentColor"/>
<path d="M8.7295 16C8.53028 16 8.33985 15.9199 8.2002 15.7803C8.12989 15.71 8.06934 15.6299 8.04004 15.54C8 15.4502 7.97949 15.3496 7.97949 15.25C7.97949 15.1494 8 15.0596 8.04004 14.96C8.06934 14.8701 8.12988 14.79 8.2002 14.7197C8.4795 14.4395 8.96973 14.4395 9.25977 14.7197C9.33008 14.79 9.37989 14.8701 9.41993 14.96C9.45997 15.0596 9.4795 15.1494 9.4795 15.25C9.4795 15.3496 9.45997 15.4502 9.41993 15.54C9.37989 15.6299 9.33009 15.71 9.25977 15.7803C9.12012 15.9199 8.91993 16 8.7295 16Z" fill="currentColor"/>
<path d="M11.25 16C11.1494 16 11.0596 15.9795 10.96 15.9395C10.8701 15.9102 10.79 15.8496 10.7197 15.7803C10.6494 15.71 10.5996 15.6299 10.5596 15.54C10.5195 15.4502 10.5 15.3496 10.5 15.25C10.5 15.1494 10.5195 15.0596 10.5596 14.96C10.5996 14.8701 10.6494 14.79 10.7197 14.7197C10.7901 14.6494 10.8701 14.5996 10.96 14.5596C11.1494 14.4795 11.3496 14.4795 11.54 14.5596C11.6299 14.5996 11.71 14.6494 11.7803 14.7197C11.8496 14.79 11.9102 14.8701 11.9395 14.96C11.9795 15.0596 12 15.1494 12 15.25C12 15.4502 11.9199 15.6397 11.7803 15.7803C11.71 15.8496 11.6299 15.9102 11.54 15.9395C11.4502 15.9795 11.3496 16 11.25 16Z" fill="currentColor"/>
<path d="M15.75 12.5C15.6494 12.5 15.5596 12.4795 15.46 12.4394C15.3701 12.3994 15.29 12.3496 15.2197 12.2803C15.1494 12.21 15.0996 12.1299 15.0596 12.04C15.0195 11.9502 15 11.8496 15 11.75C15 11.6494 15.0195 11.5596 15.0596 11.46C15.0996 11.3701 15.1494 11.29 15.2197 11.2197C15.2901 11.1494 15.3701 11.0996 15.46 11.0596C15.7402 10.9394 16.0693 11.0098 16.2803 11.2197C16.3496 11.29 16.4101 11.3701 16.4394 11.46C16.4795 11.5596 16.5 11.6494 16.5 11.75C16.5 11.8496 16.4795 11.9502 16.4394 12.04C16.4101 12.1299 16.3496 12.21 16.2803 12.2803C16.1396 12.4199 15.9502 12.5 15.75 12.5Z" fill="currentColor"/>
<path d="M15.75 15.5C15.5498 15.5 15.3594 15.4199 15.2197 15.2803C15.0801 15.1396 15 14.9502 15 14.75C15 14.5498 15.0801 14.3594 15.2197 14.2197C15.4297 14.0098 15.7598 13.9395 16.04 14.0596C16.1299 14.0996 16.21 14.1494 16.2803 14.2197C16.3496 14.29 16.4101 14.3701 16.4394 14.46C16.4795 14.5596 16.5 14.6494 16.5 14.75C16.5 14.8496 16.4795 14.9502 16.4394 15.04C16.4101 15.1299 16.3496 15.21 16.2803 15.2803C16.1396 15.4199 15.9502 15.5 15.75 15.5Z" fill="currentColor"/>
</svg>
            </div>
            <div class="stat-label">${t('dashboard.kpiCustomers')}</div>
          </div>
          <div class="stat-value" id="bnCustomers"></div>
          <div class="stat-sub">${t('dashboard.newThisMonth', { count: ov.new_customers_30d || 0 })}</div>
        </div>

        <div class="metrics-strip-item clickable" onclick="App.navigate('healthchecks')" title="${t('dashboard.kpiHc')}">
          <div class="stat-header">
            <div class="stat-icon green">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M13.5 9.26099V4.19629C13.5 2.1582 11.9297 0.5 10 0.5C8.07031 0.5 6.5 2.1582 6.5 4.19629V9.26099C5.2793 10.2708 4.5 11.7962 4.5 13.5C4.5 16.5322 6.96777 19 10 19C13.0322 19 15.5 16.5322 15.5 13.5C15.5 11.7961 14.7207 10.2708 13.5 9.26099ZM10 17.5C7.79395 17.5 6 15.706 6 13.5C6 12.4689 6.40259 11.5371 7.04541 10.8272C7.32153 10.5221 7.64233 10.2647 8 10.0562V4.19629C8 2.98535 8.89746 2 10 2C11.1025 2 12 2.98535 12 4.19629V10.0562C12.3577 10.2647 12.6785 10.5221 12.9546 10.8272C13.5974 11.5371 14 12.4689 14 13.5C14 15.706 12.206 17.5 10 17.5Z" fill="currentColor"/>
<path d="M10.75 11.3877V6.75C10.75 6.33594 10.4141 6 10 6C9.58594 6 9.25 6.33594 9.25 6.75V11.3877C8.37793 11.6978 7.75 12.5217 7.75 13.5C7.75 14.7427 8.75732 15.75 10 15.75C11.2427 15.75 12.25 14.7427 12.25 13.5C12.25 12.5217 11.6221 11.6978 10.75 11.3877Z" fill="currentColor"/>
</svg>
            </div>
            <div class="stat-label">${t('dashboard.kpiHc')}</div>
          </div>
          <div class="stat-value" id="bnHc"></div>
          <div class="stat-sub">${t('dashboard.completed', { count: ov.completed_health_checks || 0 })}</div>
        </div>

        <div class="metrics-strip-item clickable" onclick="App.navigate('healthchecks')" title="${t('dashboard.kpiPdfs')}">
          <div class="stat-header">
            <div class="stat-icon yellow">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16.3408 5.2959L12.7197 1.67383C12.3008 1.25488 11.7207 1.01465 11.1289 1.01465H5.25C4.00977 1.01465 3 2.02442 3 3.26465V15.748C3 16.9883 4.00977 17.998 5.25 17.998H14.75C15.9902 17.998 17 16.9883 17 15.748V6.88672C17 6.28613 16.7656 5.7207 16.3408 5.2959ZM15.2803 6.35645C15.3264 6.40259 15.3542 6.45997 15.3862 6.51465H12.25C11.8369 6.51465 11.5 6.17774 11.5 5.76465V2.62842C11.5554 2.66065 11.6135 2.68872 11.6592 2.73438L15.2803 6.35645ZM14.75 16.498H5.25C4.83691 16.498 4.5 16.1611 4.5 15.748V3.26465C4.5 2.85156 4.83691 2.51465 5.25 2.51465H10V5.76465C10 7.00488 11.0098 8.01465 12.25 8.01465H15.5V15.748C15.5 16.1611 15.1631 16.498 14.75 16.498Z" fill="currentColor"/>
                <path d="M13 11.498H7C6.58594 11.498 6.25 11.1621 6.25 10.748C6.25 10.334 6.58594 9.99805 7 9.99805H13C13.4141 9.99805 13.75 10.334 13.75 10.748C13.75 11.1621 13.4141 11.498 13 11.498Z" fill="currentColor"/>
                <path d="M13 14.498H7C6.58594 14.498 6.25 14.1621 6.25 13.748C6.25 13.334 6.58594 12.998 7 12.998H13C13.4141 12.998 13.75 13.334 13.75 13.748C13.75 14.1621 13.4141 14.498 13 14.498Z" fill="currentColor"/>
              </svg>

            </div>
            <div class="stat-label">${t('dashboard.kpiPdfs')}</div>
          </div>
          <div class="stat-value" id="bnPdfs"></div>
          <div class="stat-sub">${t('dashboard.totalPages', { count: (ov.total_pages || 0).toLocaleString() })}</div>
        </div>

        <div class="metrics-strip-item clickable" onclick="App.navigate('reports')" title="${t('dashboard.kpiAvgScore')}">
          <div class="stat-header">
            <div class="stat-icon ${avgScore >= 75 ? 'green' : avgScore >= 50 ? 'yellow' : 'red'}">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 11.6221C9.71289 11.6221 9.42627 11.5674 9.15332 11.457L8.19678 11.0713C7.8125 10.917 7.62647 10.4795 7.78125 10.0957C7.93652 9.71192 8.37207 9.52344 8.75732 9.68067L9.71435 10.0664C9.89843 10.1406 10.1006 10.1406 10.2847 10.0664L17.3423 7.22168C17.4726 7.16895 17.5 7.06641 17.5 6.98926C17.5 6.91309 17.4726 6.81153 17.3423 6.75879L10.2851 3.91309C10.1011 3.83985 9.89745 3.84082 9.71337 3.91407L2.65771 6.7588C2.52734 6.81153 2.5 6.91407 2.5 6.99025C2.5 7.06643 2.52734 7.16896 2.65771 7.2217L2.95751 7.34279C3.34179 7.49709 3.52782 7.93459 3.37304 8.31838C3.21777 8.70217 2.78027 8.88772 2.39697 8.73342L2.09668 8.61233C1.42969 8.3428 0.99951 7.70608 1 6.98928C1 6.27248 1.43115 5.63576 2.09717 5.36819L9.15381 2.52249C9.69971 2.30374 10.2998 2.30276 10.8447 2.52151L17.9028 5.36819C18.5689 5.63577 18.9995 6.27249 19 6.98928C19 7.70608 18.5698 8.3428 17.9033 8.61233L10.8457 11.4571C10.5732 11.5674 10.2866 11.6221 10 11.6221Z" fill="currentColor"/>
                <path d="M9.96194 15.9326C9.3804 15.9326 8.80471 15.8818 8.25198 15.7822C7.84427 15.708 7.57376 15.3184 7.64749 14.9102C7.72073 14.502 8.11478 14.2354 8.51858 14.3057C8.98391 14.3896 9.46926 14.4326 9.96194 14.4326C13.9287 14.4326 15.2119 12.6709 15.2119 11.8174C15.2119 11.4033 15.5479 11.0674 15.9619 11.0674C16.376 11.0674 16.7119 11.4033 16.7119 11.8174C16.7119 12.9619 15.4995 15.9326 9.96194 15.9326Z" fill="currentColor"/>
                <path d="M10.6948 6.42286C10.5371 6.04102 10.0991 5.86134 9.71486 6.01661L6.10207 7.51368C5.25734 7.86231 4.71193 8.67872 4.71193 9.59278V15.5566L4.23 16.5205C4.01662 16.9473 4.03859 17.4453 4.29006 17.8516C4.54104 18.2578 4.9761 18.5 5.45363 18.5C5.93116 18.5 6.36623 18.2578 6.6172 17.8516C6.86866 17.4453 6.89064 16.9473 6.67726 16.5205L6.21193 15.5899V9.59279C6.21193 9.2881 6.39357 9.01662 6.67531 8.90041L10.2891 7.40334C10.6719 7.24416 10.8535 6.80567 10.6948 6.42286Z" fill="currentColor"/>
              </svg>

            </div>
            <div class="stat-label">${t('dashboard.kpiAvgScore')}</div>
          </div>
          <div class="stat-value" id="bnAvgScore"></div>
          <div class="stat-sub">${t('dashboard.overallHealth', { label: scoreLabel(avgScore) })}</div>
        </div>

        <div class="metrics-strip-item clickable" onclick="App.navigate('reports')" title="${t('dashboard.kpiPii')}">
          <div class="stat-header">
            <div class="stat-icon ${piiColor}">
             <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 1.25C5.1748 1.25 1.25 5.1748 1.25 10C1.25 14.8252 5.1748 18.75 10 18.75C10.3359 18.75 10.666 18.7305 10.9912 18.6943C11.4033 18.6484 11.6992 18.2774 11.6533 17.8662C11.6084 17.4551 11.2383 17.167 10.8252 17.2041C10.5547 17.2344 10.2793 17.25 10 17.25C8.17139 17.25 6.50391 16.5645 5.22717 15.4439C6.29712 14.2559 8.49585 13.5371 10.6279 13.7051C11.0361 13.7402 11.4023 13.4317 11.4355 13.0186C11.4697 12.6065 11.1621 12.2442 10.749 12.2109C8.21485 12.0069 5.62379 12.8657 4.21119 14.3467C3.2981 13.1338 2.75001 11.6316 2.75001 10C2.75001 6.00196 6.00196 2.75001 10 2.75001C13.9981 2.75001 17.25 6.00196 17.25 10C17.25 10.3721 17.2217 10.7461 17.1651 11.1123C17.1016 11.5215 17.3828 11.9043 17.792 11.9678C18.2022 12.0361 18.585 11.75 18.6475 11.3408C18.7158 10.8994 18.75 10.4482 18.75 10C18.75 5.17481 14.8252 1.25 10 1.25Z" fill="currentColor"/>
              <path d="M10.0537 11C10.0332 11 10.0361 10.9844 9.99219 10.999C9.40137 10.999 8.82617 10.831 8.32715 10.5137C7.83692 10.2002 7.43653 9.76269 7.16895 9.24805C6.88575 8.70899 6.74122 8.10059 6.75098 7.49024C6.72754 6.31446 7.31446 5.20313 8.32227 4.54395C9.34082 3.89551 10.6494 3.89454 11.6641 4.53907C12.1553 4.85743 12.5547 5.292 12.8272 5.79884C13.1094 6.31837 13.2559 6.91114 13.25 7.50978C13.2598 8.10158 13.1143 8.71193 12.8311 9.25587C12.5625 9.77052 12.1621 10.21 11.6729 10.5264C11.1846 10.8369 10.627 11 10.0537 11ZM10.0098 9.49902H10.0195C10.3262 9.49511 10.6113 9.4248 10.8623 9.26367C11.1299 9.09082 11.3516 8.84765 11.501 8.56152C11.6699 8.23828 11.7559 7.87597 11.75 7.51367C11.7539 7.15039 11.6699 6.81055 11.5068 6.51172C11.3525 6.22266 11.127 5.97852 10.8535 5.80078C10.334 5.4707 9.65821 5.4707 9.13477 5.80469C8.57032 6.17383 8.23731 6.80469 8.25098 7.48731C8.24512 7.87403 8.33106 8.2334 8.49805 8.55274C8.64649 8.83692 8.86621 9.07715 9.13477 9.24903C9.39063 9.41212 9.6875 9.49903 9.99317 9.49903L10.0098 9.49902Z" fill="currentColor"/>
              <path d="M14.2578 18.3613C14.0967 18.3613 13.9336 18.3301 13.7783 18.2666C13.3057 18.0713 13 17.6152 13 17.1045V12.7344C13 12.2246 13.3037 11.7695 13.7744 11.5742C14.248 11.3789 14.7851 11.4853 15.1435 11.8447L18.1299 14.8222C18.4941 15.1865 18.6006 15.7334 18.4004 16.2168C18.2031 16.6924 17.749 17 17.2422 17H16.1279L15.1494 17.9883C14.9072 18.2324 14.5859 18.3613 14.2578 18.3613ZM14.5 13.3213V16.5127L15.165 15.8408C15.3887 15.6142 15.6894 15.5 16.0576 15.5H16.6856L14.5 13.3213Z" fill="currentColor"/>
            </svg>

            </div>
            <div class="stat-label">${t('dashboard.kpiPii')}</div>
          </div>
          <div class="stat-value" id="bnPii"></div>
          <div class="stat-sub">${t('dashboard.pctOfPdfs', { pct: piiPct })}</div>
        </div>

      </div>

      <div id="dashChartsBody">

      <!-- Dimension score rings ──────────────────────────────────────── -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px">

        <div class="card" style="display:flex;flex-direction:column;align-items:left;gap:14px">
          <div style="font-size:16px;font-weight:700;text-transform:;letter-spacing:0em;color:var(--gray-700); ">${t('dashboard.dimAccessibility')}</div>
          <div id="ringAccess" style="margin:0 auto"></div>
          <div style="width:100%;display:flex;flex-direction:column;gap:6px;font-size:12px">
            <div style="display:flex;justify-content:space-between"><span style="color:var(--gray-500)">${t('dashboard.taggedPdfs')}</span><span style="font-weight:700">${taggedPct}%</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--gray-500)">${t('dashboard.avgPassRate')}</span><span style="font-weight:700">${accessRate}%</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--gray-500)">${t('dashboard.pdfuaCompliance')}</span><span style="font-weight:700">${pdfuaPct}%</span></div>
          </div>
        </div>

        <div class="card" style="display:flex;flex-direction:column;align-items:left;gap:14px">
          <div style="font-size:16px;font-weight:700;text-transform:;letter-spacing:0em;color:var(--gray-700)">${t('dashboard.dimSecurity')}</div>
          <div id="ringSecure" style="margin:0 auto"></div>
          <div style="width:100%;display:flex;flex-direction:column;gap:6px;font-size:12px">
            <div style="display:flex;justify-content:space-between"><span style="color:var(--gray-500)">${t('dashboard.unencrypted')}</span><span style="font-weight:700">${unencPct}%</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--gray-500)">${t('dashboard.noXfa')}</span><span style="font-weight:700">${noXfaPct}%</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--gray-500)">${t('dashboard.noPii')}</span><span style="font-weight:700">${noPiiPct}%</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--gray-500)">${t('dashboard.noEmbedded')}</span><span style="font-weight:700">${noEmbedPct}%</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--gray-500)">${t('dashboard.screenReaderOk')}</span><span style="font-weight:700">${noAtBlockedPct}%</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--gray-500)">${t('dashboard.copyOk')}</span><span style="font-weight:700">${noCopyBlockedPct}%</span></div>
          </div>
        </div>

        <div class="card" style="display:flex;flex-direction:column;align-items:left;gap:14px">
          <div style="font-size:16px;font-weight:700;text-transform:;letter-spacing:0em;color:var(--gray-700)">${t('dashboard.dimUsability')}</div>
          <div id="ringUsability" style="margin:0 auto"></div>
          <div style="width:100%;display:flex;flex-direction:column;gap:6px;font-size:12px">
            <div style="display:flex;justify-content:space-between"><span style="color:var(--gray-500)">${t('dashboard.linearized')}</span><span style="font-weight:700">${linearPct}%</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--gray-500)">${t('dashboard.versionOk')}</span><span style="font-weight:700">${versionPct}%</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--gray-500)">${t('dashboard.metadataComplete')}</span><span style="font-weight:700">${hasMetaPct}%</span></div>
          </div>
        </div>

      </div>

      <!-- Score trend (area) + Overall health donut ──────────────────── -->
      <div class="dashboard-grid" style="margin-bottom:20px">

        <div class="card">
          <div class="section-title"><span>${t('dashboard.scoreTrend')}</span></div>
          <div id="scoreAreaChart" style="margin-top:4px"></div>
        </div>

        <div class="card">
          <div class="section-title"><span>${t('dashboard.overallHealthTitle')}</span></div>
          <div id="overallDonut" style="display:flex;align-items:center;justify-content:center;padding:12px 0"></div>
          <!-- Spectrum-style legend row -->
          <div style="display:flex;justify-content:center;gap:16px;margin-top:4px">
            <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--gray-700)">
              <span style="width:10px;height:10px;border-radius:2px;background:${S_GOOD};display:inline-block"></span>${t('dashboard.scoreGoodLabel')}
            </span>
            <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--gray-700)">
              <span style="width:10px;height:10px;border-radius:2px;background:${S_WARN};display:inline-block"></span>${t('dashboard.scoreFairLabel')}
            </span>
            <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--gray-700)">
              <span style="width:10px;height:10px;border-radius:2px;background:${S_POOR};display:inline-block"></span>${t('dashboard.scorePoorLabel')}
            </span>
          </div>
        </div>

      </div>

      <!-- Compliance bar chart + Score distribution donut ─────────────── -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">

        <div class="card">
          <div class="section-title"><span>${t('dashboard.complianceChart')}</span></div>
          <div id="complianceChart" style="margin-top:10px"></div>
        </div>

        <div class="card">
          <div class="section-title"><span>${t('dashboard.scoreDist')}</span></div>
          <div id="scoreDistDonut" style="display:flex;align-items:center;justify-content:center;padding:12px 0"></div>
          <div style="display:flex;justify-content:center;gap:16px;margin-top:4px">
            <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--gray-700)">
              <span style="width:10px;height:10px;border-radius:2px;background:${S_GOOD};display:inline-block"></span>${t('dashboard.scoreGood')}: ${good}
            </span>
            <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--gray-700)">
              <span style="width:10px;height:10px;border-radius:2px;background:${S_WARN};display:inline-block"></span>${t('dashboard.scoreFair')}: ${fair}
            </span>
            <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--gray-700)">
              <span style="width:10px;height:10px;border-radius:2px;background:${S_POOR};display:inline-block"></span>${t('dashboard.scorePoor')}: ${poor}
            </span>
          </div>
        </div>

      </div>

      <!-- PDF Creation Date Timeline ─────────────────────────────────── -->
      <div class="card" style="margin-bottom:20px">
        <div class="section-title">
          <span>${t('dashboard.tlTitle')}</span>
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('reports',{tab:'timeline'})">${t('dashboard.tlViewFull')}</button>
        </div>
        <div style="font-size:11px;color:var(--gray-400);margin-bottom:10px">${t('dashboard.tlSubtitle')}</div>
        <div id="dashTimelineChart"></div>
      </div>

      <!-- World Map ──────────────────────────────────────────────────── -->
      <div class="card" style="margin-bottom:20px;padding:18px 20px 0">
        <div class="section-title" style="align-items:flex-start;gap:8px">
          <div>
            <span>${t('dashboard.geoDistTitle')}</span>
            <div style="font-size:11px;color:var(--gray-400);font-weight:400;margin-top:1px">
              ${t('dashboard.geoDistSub')}
            </div>
          </div>
        </div>
        <!-- tabs sit inside the normal card padding; map+legend bleed to edges -->
        <div id="worldMapWidget"></div>
      </div>

      <!-- Creator Apps + By Region ───────────────────────────────────── -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div class="card">
          <div class="section-title"><span>${t('dashboard.creatorApps')}</span></div>
          <div id="creatorAppsDonut" style="display:flex;align-items:center;justify-content:center;padding:12px 0"></div>
          <div id="creatorAppsLegend" style="display:flex;flex-wrap:wrap;justify-content:center;gap:8px 14px;margin-top:4px"></div>
        </div>
        <div class="card">
          <div class="section-title"><span>${t('dashboard.avgByRegion')}</span></div>
          <div id="regionChart" style="margin-top:10px"></div>
        </div>
      </div>

      <!-- By Vertical + By Segment ───────────────────────────────────── -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div class="card">
          <div class="section-title"><span>${t('dashboard.avgByVertical')}</span></div>
          <div id="verticalChart" style="margin-top:10px"></div>
        </div>
        <div class="card">
          <div class="section-title"><span>${t('dashboard.avgBySegment')}</span></div>
          <div id="segmentChart" style="margin-top:10px"></div>
        </div>
      </div>

      <!-- Recent Health Checks table ─────────────────────────────────── -->
      <div class="card card-table">
        <div class="section-title">
          <span>${t('dashboard.recentHc')}</span>
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('healthchecks')">${t('common.viewAll')}</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${t('dashboard.thCustomer')}</th><th>${t('dashboard.thHealthCheck')}</th>
                <th>${t('dashboard.thDocuments')}</th><th>${t('dashboard.thScore')}</th>
                <th>${t('dashboard.thStatus')}</th><th>${t('dashboard.thDate')}</th><th></th>
              </tr>
            </thead>
            <tbody id="recentHcBody"></tbody>
          </table>
        </div>
      </div>

      </div>`; /* end dashChartsBody */

    // ── Big-number stat cards (rendered via Charts.bigNumber) ─────────
    Charts.bigNumber(document.getElementById('bnCustomers'), {
      value: (ov.total_customers || 0).toLocaleString(),
      trend: {
        labels:  trend.labels    || [],
        data:    trend.customers || [],
        color:   'var(--accent)',
        tooltip: t('dashboard.sparkCustomers')
      }
    });
    Charts.bigNumber(document.getElementById('bnHc'), {
      value: (ov.total_health_checks || 0).toLocaleString(),
      trend: {
        labels:  trend.labels || [],
        data:    trend.hcs    || [],
        color:   'var(--green)',
        tooltip: t('dashboard.sparkHc')
      }
    });
    Charts.bigNumber(document.getElementById('bnPdfs'), {
      value: (ov.total_pdfs || 0).toLocaleString(),
      trend: {
        labels:  trend.labels || [],
        data:    trend.pdfs   || [],
        color:   'var(--yellow)',
        tooltip: t('dashboard.sparkPdfs')
      }
    });
    Charts.bigNumber(document.getElementById('bnAvgScore'), {
      value: avgScore,
      trend: {
        labels:  trend.labels || [],
        data:    trend.scores || [],
        color:   avgScore >= 75 ? S_GOOD : avgScore >= 50 ? S_WARN : S_POOR,
        tooltip: t('dashboard.sparkScore')
      }
    });
    Charts.bigNumber(document.getElementById('bnPii'), {
      value: piiCount.toLocaleString(),
      trend: {
        labels:  trend.labels || [],
        data:    trend.pii    || [],
        color:   piiCount > 0 ? 'var(--red)' : 'var(--green)',
        tooltip: t('dashboard.sparkPii')
      }
    });

    // ── No data state — replace all chart sections with a single empty-state card
    if (noData) {
      document.getElementById('dashChartsBody').innerHTML = `
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

    // ── Dimension score donuts — same Spectrum donut style as overall health ring
    const usabilityScore = Math.min(100, usability);
    [
      { id: 'ringAccess',    score: accessScore   },
      { id: 'ringSecure',    score: secScore       },
      { id: 'ringUsability', score: usabilityScore },
    ].forEach(({ id, score }) => {
      const col = score >= 75 ? S_GOOD : score >= 50 ? S_WARN : S_POOR;
      Charts.donut(document.getElementById(id), {
        segments: [
          { value: score,           color: col },
          { value: 100 - score,     color: 'var(--gray-200)' },
        ],
        size:     120,
        label:    `${score}`,
        sublabel: scoreLabel(score),
      });
    });

    // ── Area chart — score trend (Spectrum area: opacity 0.8, 2 px stroke) ──
    Charts.vbar(document.getElementById('scoreAreaChart'), {
      labels:   trend.labels || [],
      datasets: [{ label: 'Avg Score', data: trend.scores || [], color: C_BLUE }],
      height:   170,
      type:     'area'
    });

    // ── Donut — overall health distribution ──────────────────────────
    Charts.donut(document.getElementById('overallDonut'), {
      segments: [
        { value: good, color: S_GOOD },
        { value: fair, color: S_WARN },
        { value: poor, color: S_POOR }
      ],
      size: 148, label: `${avgScore}`, sublabel: t('dashboard.avgScoreSublabel')
    });

    // ── Donut — score distribution (total PDFs) ───────────────────────
    Charts.donut(document.getElementById('scoreDistDonut'), {
      segments: [
        { value: good, color: S_GOOD },
        { value: fair, color: S_WARN },
        { value: poor, color: S_POOR }
      ],
      size: 132, label: `${ov.total_pdfs || 0}`, sublabel: t('dashboard.pdfsSublabel')
    });

    // ── Horizontal bar — compliance rates (Spectrum hbar) ────────────
    Charts.hbar(document.getElementById('complianceChart'), {
      items: [
        { label: t('dashboard.tagged'),          value: taggedPct,  color: C_BLUE   },
        { label: t('dashboard.versionOkShort'), value: versionPct, color: C_TEAL   },
        { label: t('dashboard.noXfa'),           value: noXfaPct,   color: C_ORANGE },
        { label: t('dashboard.linearizedShort'),value: linearPct,  color: C_INDIGO },
        { label: t('dashboard.unencryptedShort'),value: unencPct,  color: C_PURPLE },
      ],
      max: 100
    });

    // ── World map ─────────────────────────────────────────────────────
    WorldMap.render(document.getElementById('worldMapWidget'), byCountry || []);

    // ── Creator Apps donut ────────────────────────────────────────────
    const appsEl      = document.getElementById('creatorAppsDonut');
    const appsLegEl   = document.getElementById('creatorAppsLegend');
    const appsData    = (creatorApps || []).slice(0, 6);
    if (appsData.length) {
      const totalApps = appsData.reduce((s, a) => s + a.count, 0);
      Charts.donut(appsEl, {
        segments: appsData.map((a, i) => ({ value: a.count, color: Charts.CAT[i % Charts.CAT.length] })),
        size: 148,
        label:    `${totalApps}`,
        sublabel: t('dashboard.pdfsSublabel')
      });
      appsLegEl.innerHTML = appsData.map((a, i) => `
        <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--gray-700)">
          <span style="width:10px;height:10px;border-radius:2px;background:${Charts.CAT[i % Charts.CAT.length]};display:inline-block;flex-shrink:0"></span>
          ${escHtml(a.creator_app)} <span style="color:var(--gray-400)">(${a.count})</span>
        </span>`).join('');
    } else {
      appsEl.innerHTML = `<div style="padding:20px;text-align:center;font-size:12px;color:var(--gray-400)">${t('dashboard.noCreatorData')}</div>`;
    }

    // ── Horizontal bars — by region, vertical & segment ──────────────
    Charts.hbar(document.getElementById('regionChart'), {
      items: (byRegion || []).map((r, i) => ({
        label: r.region || 'Unknown',
        value: r.avg_score || 0,
        color: Charts.CAT[i % Charts.CAT.length]
      })),
      max: 100
    });
    Charts.hbar(document.getElementById('verticalChart'), {
      items: (byVertical || []).map((v, i) => ({
        label: v.vertical || 'Unknown',
        value: v.avg_score || 0,
        color: Charts.CAT[i % Charts.CAT.length]
      })),
      max: 100
    });
    Charts.hbar(document.getElementById('segmentChart'), {
      items: (bySegment || []).map((s, i) => ({
        label: s.segment || 'Unknown',
        value: s.avg_score || 0,
        color: Charts.CAT[i % Charts.CAT.length]
      })),
      max: 100
    });

    // ── PDF Creation Date Timeline ────────────────────────────────────
    const tlEl = document.getElementById('dashTimelineChart');
    if (tlEl) {
      if (timelineRows.length > 0) {
        Charts.vbar(tlEl, {
          labels:   timelineRows.map(r => r.period),
          height:   160,
          // area needs ≥ 2 points to draw a filled path; fall back to bar for a single period
          type:     timelineRows.length > 1 ? 'area' : 'bar',
          datasets: [
            { label: t('reports.tlScore'),      data: timelineRows.map(r => r.avg_score       ?? 0), color: 'var(--accent)' },
            { label: t('reports.tlAccessRate'), data: timelineRows.map(r => r.avg_access_rate ?? 0), color: 'var(--green)'  },
          ],
        });
      } else {
        tlEl.innerHTML = `<div style="text-align:center;padding:28px 0;font-size:12px;color:var(--gray-400)">${t('dashboard.tlNoData')}</div>`;
      }
    }

    // ── Recent health checks table ────────────────────────────────────
    const tbody = document.getElementById('recentHcBody');
    // Render custom pinned report widgets (async, non-blocking)
    _renderDashboardWidgets();

    if (!recent.data || !recent.data.length) {
      tbody.innerHTML = `<tr><td colspan="7">
        <div class="empty-state" style="padding:28px">
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
          </svg>
          <h3>${t('dashboard.noHcYet')}</h3>
          <p>${t('dashboard.noHcYetSub')}</p>
        </div>
      </td></tr>`;
    } else {
      tbody.innerHTML = recent.data.map(hc => `
        <tr style="cursor:pointer" onclick="App.navigate('healthchecks',{id:${hc.id}})">
          <td><span class="font-medium">${escHtml(hc.customer_name || '—')}</span></td>
          <td>${escHtml(hc.name)}</td>
          <td class="text-muted">${hc.doc_count || 0}</td>
          <td>${hc.avg_score != null
            ? `<span class="score-pill ${scoreClass(hc.avg_score)}">${hc.avg_score}</span>`
            : '<span class="text-muted text-sm">—</span>'}</td>
          <td><span class="status-pill status-${hc.status}">${ucFirst(hc.status)}</span></td>
          <td class="text-sm text-muted">${formatDate(hc.created_at)}</td>
          <td><button class="btn btn-ghost btn-sm">${t('common.viewArrow')}</button></td>
        </tr>`).join('');
    }
  }

  // ── Custom dashboard widgets ───────────────────────────────────────────────
  async function _renderDashboardWidgets() {
    const settings = await window.electronAPI?.getSettings?.() || {};
    const widgets  = Array.isArray(settings.dashboardWidgets) ? settings.dashboardWidgets : [];

    const content = document.getElementById('dashContent');
    if (!content) return;

    // Remove previous section if re-rendering
    document.getElementById('dashWidgetsSection')?.remove();

    const section = document.createElement('div');
    section.id    = 'dashWidgetsSection';
    section.innerHTML = `
      <div class="dash-widgets-header">
        <h2 class="dash-widgets-title">${t('dashboard.pinnedReports')}</h2>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-primary btn-sm" id="dashAddReport">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="margin-right:5px"><path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>${t('rb.newReport')}
          </button>
          <button class="btn btn-ghost btn-sm" id="dashManageWidgets">${t('dashboard.manageWidgets')}</button>
        </div>
      </div>
      <div class="dash-widgets-grid" id="dashWidgetsGrid">
        ${widgets.map(w => _widgetCardHtml(w)).join('')}
      </div>`;
    content.appendChild(section);

    // Wire "Add Report" button
    document.getElementById('dashAddReport').onclick  = () => _showAddReportPicker();
    document.getElementById('dashManageWidgets').onclick = () => App.navigate('report-builder');

    _wireWidgetControls(section, widgets);

    // Run each widget's report
    await Promise.all(widgets.map(w => _runWidget(w)));
  }

  function _widgetCardHtml(w) {
    const colSpan = w.width  || 1;
    const bodyH   = w.height || 240;
    return `
      <div class="dash-widget-card" id="dw_${w.id}" data-width="${colSpan}" style="grid-column:span ${colSpan}">
        <div class="dash-widget-header">
          <span class="dash-widget-name" title="${_escHtml(w.name)}">${_escHtml(w.name)}</span>
          <div class="dash-widget-actions">
            <button class="btn btn-ghost btn-sm dash-widget-width" data-id="${w.id}" title="${t('dashboard.widthToggle')||'Toggle width'}">${colSpan === 1 ? '⟷' : colSpan === 2 ? '⟺' : '▬'}</button>
            <button class="btn btn-ghost btn-sm dash-widget-move" data-id="${w.id}" data-dir="up"   title="Move up">↑</button>
            <button class="btn btn-ghost btn-sm dash-widget-move" data-id="${w.id}" data-dir="down" title="Move down">↓</button>
            <button class="btn btn-ghost btn-sm dash-widget-unpin" data-id="${w.id}" title="Unpin">×</button>
          </div>
        </div>
        <div class="dash-widget-body" id="dwb_${w.id}" style="height:${bodyH}px">
          <div class="loading-spinner"></div>
        </div>
        <div class="dash-widget-resize-handle" data-id="${w.id}" title="Drag to resize"></div>
      </div>`;
  }

  function _wireWidgetControls(section, widgets) {
    // Unpin
    section.querySelectorAll('.dash-widget-unpin').forEach(btn => {
      btn.addEventListener('click', async () => {
        const s  = await window.electronAPI?.getSettings?.() || {};
        const ws = (s.dashboardWidgets || []).filter(w => w.id !== btn.dataset.id);
        await window.electronAPI?.saveSettings?.({ ...s, dashboardWidgets: ws });
        document.getElementById(`dw_${btn.dataset.id}`)?.remove();
        if (!ws.length) section.remove();
      });
    });

    // Move up/down
    section.querySelectorAll('.dash-widget-move').forEach(btn => {
      btn.addEventListener('click', async () => {
        const s   = await window.electronAPI?.getSettings?.() || {};
        const ws  = [...(s.dashboardWidgets || [])];
        const idx = ws.findIndex(w => w.id === btn.dataset.id);
        if (idx < 0) return;
        const target = btn.dataset.dir === 'up' ? idx - 1 : idx + 1;
        if (target < 0 || target >= ws.length) return;
        [ws[idx], ws[target]] = [ws[target], ws[idx]];
        ws.forEach((w, i) => { w.position = i; });
        await window.electronAPI?.saveSettings?.({ ...s, dashboardWidgets: ws });
        section.remove();
        _renderDashboardWidgets();
      });
    });

    // Width toggle (1 → 2 → 3 → 1)
    section.querySelectorAll('.dash-widget-width').forEach(btn => {
      btn.addEventListener('click', async () => {
        const s   = await window.electronAPI?.getSettings?.() || {};
        const ws  = [...(s.dashboardWidgets || [])];
        const idx = ws.findIndex(w => w.id === btn.dataset.id);
        if (idx < 0) return;
        const cur = ws[idx].width || 1;
        ws[idx].width = cur >= 3 ? 1 : cur + 1;
        await window.electronAPI?.saveSettings?.({ ...s, dashboardWidgets: ws });
        section.remove();
        _renderDashboardWidgets();
      });
    });

    // Height drag-to-resize
    section.querySelectorAll('.dash-widget-resize-handle').forEach(handle => {
      handle.addEventListener('mousedown', e => {
        e.preventDefault();
        const id   = handle.dataset.id;
        const body = document.getElementById(`dwb_${id}`);
        if (!body) return;
        const startY = e.clientY;
        const startH = body.offsetHeight;

        const onMove = e => {
          const newH = Math.max(120, startH + e.clientY - startY);
          body.style.height = newH + 'px';
          // Resize Chart.js instance if present
          const canvas = body.querySelector('canvas');
          if (canvas) Chart.getChart(canvas)?.resize();
        };
        const onUp = async () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          const finalH = body.offsetHeight;
          const s  = await window.electronAPI?.getSettings?.() || {};
          const ws = (s.dashboardWidgets || []).map(w =>
            w.id === id ? { ...w, height: finalH } : w
          );
          await window.electronAPI?.saveSettings?.({ ...s, dashboardWidgets: ws });
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  }

  async function _showAddReportPicker() {
    // Remove any existing picker
    document.getElementById('dashAddReportModal')?.remove();

    let reports = [];
    try {
      const res = await API.reportBuilder.list();
      reports = res.data || [];
    } catch (e) {
      Toast.show(e.message, 'error');
      return;
    }

    const settings = await window.electronAPI?.getSettings?.() || {};
    const pinned   = new Set((settings.dashboardWidgets || []).map(w => String(w.reportId)));

    const overlay = document.createElement('div');
    overlay.id    = 'dashAddReportModal';
    overlay.className = 'dash-picker-overlay';
    overlay.innerHTML = `
      <div class="dash-picker-modal">
        <div class="dash-picker-header">
          <span style="font-size:15px;font-weight:700">${t('dashboard.addReport')||'Add Report to Dashboard'}</span>
          <button class="btn btn-ghost btn-sm" id="dashPickerClose">✕</button>
        </div>
        <div class="dash-picker-list">
          ${reports.length ? reports.map(r => `
            <div class="dash-picker-row">
              <span class="dash-picker-name">${_escHtml(r.name)}</span>
              <button class="btn ${pinned.has(String(r.id)) ? 'btn-ghost' : 'btn-primary'} btn-sm dash-picker-pin"
                data-id="${r.id}" data-name="${_escHtml(r.name)}"
                ${pinned.has(String(r.id)) ? 'disabled' : ''}>
                ${pinned.has(String(r.id)) ? '✓ Pinned' : '+ Pin'}
              </button>
            </div>`).join('')
          : `<div style="padding:24px;text-align:center;color:var(--gray-400);font-size:13px">${t('rb.noReports')}</div>`}
        </div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('dashPickerClose').onclick = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelectorAll('.dash-picker-pin').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reportId = btn.dataset.id;
        const name     = btn.dataset.name;
        const s        = await window.electronAPI?.getSettings?.() || {};
        const ws       = s.dashboardWidgets || [];
        if (ws.some(w => String(w.reportId) === String(reportId))) return;

        let reportConfig = null;
        try {
          const res = await API.reportBuilder.get(reportId);
          reportConfig = res.data?.config;
        } catch {}

        const newWidget = {
          id:       `dw_${Date.now()}`,
          reportId: String(reportId),
          name,
          config:   reportConfig,
          position: ws.length,
          width:    1,
          height:   240,
        };
        const updatedWs = [...ws, newWidget];
        await window.electronAPI?.saveSettings?.({ ...s, dashboardWidgets: updatedWs });

        btn.textContent = '✓ Pinned';
        btn.disabled    = true;
        btn.className   = 'btn btn-ghost btn-sm dash-picker-pin';

        Toast.show(`"${name}" ${t('rb.pinnedSuccess','').split('"')[2] || 'added to dashboard'}`, 'success');

        // Re-render widgets section
        document.getElementById('dashWidgetsSection')?.remove();
        _renderDashboardWidgets();
      });
    });
  }

  async function _runWidget(widget) {
    const body = document.getElementById(`dwb_${widget.id}`);
    if (!body) return;
    try {
      const res  = await API.reportBuilder.run(widget.config);
      const data = res.data;
      _renderWidgetResult(body, data, widget);
    } catch (e) {
      body.innerHTML = `<div style="font-size:12px;color:var(--gray-400);padding:12px 0">${_escHtml(e.message)}</div>`;
    }
  }

  function _renderWidgetResult(body, data, widget) {
    if (!data.has_groups && data.metric_cards?.length) {
      body.style.display = 'flex';
      body.style.alignItems = 'center';
      body.style.justifyContent = 'center';
      body.innerHTML = `<div class="dash-widget-kpis">${data.metric_cards.map(c =>
        `<div class="dash-widget-kpi"><div class="dash-widget-kpi-val">${c.value != null ? parseFloat(c.value).toLocaleString('en',{maximumFractionDigits:1}) + (c.unit||'') : '—'}</div><div class="dash-widget-kpi-lbl">${_escHtml(c.key.replace(/_/g,' '))}</div></div>`
      ).join('')}</div>`;
      return;
    }

    if (!data.labels?.length && !data.rows?.length) {
      body.style.display = 'flex';
      body.style.alignItems = 'center';
      body.style.justifyContent = 'center';
      body.innerHTML = `<div style="font-size:12px;color:var(--gray-400);padding:12px 0">${t('rb.noData')}</div>`;
      return;
    }

    const viz = data.visualization || 'bar';

    // Table
    if (viz === 'table' || !data.has_groups) {
      body.style.display = 'block';
      body.style.overflowY = 'auto';
      const metrics = data.metrics || [];
      body.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>${data.has_groups ? `<th style="text-align:left;padding:4px 8px;border-bottom:1px solid var(--border)">Group</th>` : ''}
          ${metrics.map(m => `<th style="text-align:right;padding:4px 8px;border-bottom:1px solid var(--border)">${_escHtml(m)}</th>`).join('')}
        </tr></thead>
        <tbody>${(data.rows || []).slice(0,8).map(r => `<tr>
          ${data.has_groups ? `<td style="padding:3px 8px;border-bottom:1px solid var(--border)">${_escHtml(r.group_key??'—')}</td>` : ''}
          ${metrics.map(m => `<td style="text-align:right;padding:3px 8px;border-bottom:1px solid var(--border)">${r[m]!=null?parseFloat(r[m]).toLocaleString('en',{maximumFractionDigits:1}):'—'}</td>`).join('')}
        </tr>`).join('')}</tbody>
      </table></div>`;
      return;
    }

    // Chart
    if (typeof Chart === 'undefined') {
      body.innerHTML = `<div style="font-size:12px;color:var(--gray-400)">${t('rb.chartLibMissing')}</div>`;
      return;
    }

    // Set up body for chart rendering (block layout, explicit height drives Chart.js dimensions)
    body.style.display  = 'block';
    body.style.padding  = '12px 16px';
    body.innerHTML = '<canvas></canvas>';
    const canvas = body.querySelector('canvas');
    canvas.style.width  = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';

    const colors  = (typeof Charts !== 'undefined' && Charts.CAT) ? Charts.CAT
      : ['rgb(15,181,174)','rgb(64,70,202)','rgb(246,133,17)','rgb(222,61,130)',
         'rgb(126,132,250)','rgb(20,122,243)','rgb(115,38,211)','rgb(232,198,0)'];
    const isPie   = viz === 'pie' || viz === 'donut';
    const clrs    = data.labels.map((_, i) => colors[i % colors.length]);

    const chartType = viz === 'donut' ? 'doughnut'
                    : viz === 'area'  ? 'line'
                    : viz === 'line'  ? 'line'
                    : isPie           ? 'pie'
                    : 'bar';

    new Chart(canvas, {
      type: chartType,
      data: {
        labels: data.labels,
        datasets: data.datasets.map((ds, di) => {
          const baseClr = colors[di % colors.length];
          const bgColor = isPie ? clrs
            : viz === 'area'
              ? (context) => {
                  const chart = context.chart;
                  const { ctx, chartArea } = chart;
                  if (!chartArea) return baseClr.replace('rgb(','rgba(').replace(')',',0.35)');
                  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                  gradient.addColorStop(0, baseClr.replace('rgb(','rgba(').replace(')', `,${data.datasets.length > 1 ? 0.22 : 0.40})`));
                  gradient.addColorStop(1, baseClr.replace('rgb(','rgba(').replace(')' , ',0.02)'));
                  return gradient;
                }
              : baseClr.replace('rgb(','rgba(').replace(')',',0.75)');
          return {
            label:           ds.field,
            data:            ds.values,
            backgroundColor: bgColor,
            borderColor:     isPie ? clrs : baseClr,
            borderWidth:     isPie ? 1 : 2,
            fill:            viz === 'area',
            tension:         0.35,
            pointRadius:     viz === 'line' || viz === 'area' ? 3 : 0,
            pointHoverRadius: viz === 'line' || viz === 'area' ? 5 : 0,
            pointBackgroundColor: baseClr,
          };
        }),
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        indexAxis: viz === 'bar_h' ? 'y' : 'x',
        animation: { duration: 400 },
        plugins: {
          legend: {
            display:  isPie || data.datasets.length > 1,
            position: 'bottom',
            labels:   { font: { size: 10 }, boxWidth: 10, padding: 8 },
          },
          tooltip: {
            mode:      'index',
            intersect: false,
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toLocaleString('en', { maximumFractionDigits: 1 }) ?? ctx.parsed}`,
            },
          },
        },
        scales: isPie ? {} : {
          x: {
            grid:  { display: false },
            ticks: { font: { size: 10 }, maxTicksLimit: 8, maxRotation: 30 },
          },
          y: {
            grid:  { color: 'rgba(128,128,128,.12)' },
            ticks: { font: { size: 10 } },
          },
        },
      },
    });
  }

  function _escHtml(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  async function reload() {
    render(document.getElementById('viewContainer'));
  }

  return { render, reload };
})();
