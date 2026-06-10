/**
 * WorldMap — interactive choropleth map for country-level PDF health data.
 *
 * Loads data/world.svg (Simplemaps-style, viewBox "0 0 2000 857") via fetch
 * and colours each country path based on the selected metric.
 *
 * Country paths are identified two ways:
 *   • id="XX"          — single-path countries with an ISO 3166-1 alpha-2 id
 *   • class="Name"     — multi-path / island countries identified by name
 *
 * Public API:
 *   WorldMap.render(containerEl, countryRows)
 *   WorldMap.METRICS — array of {key, label} for external tab building
 */
const WorldMap = (() => {
  'use strict';

  // ── HTML-escape helper ────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Country name → ISO-2 ──────────────────────────────────────────────────
  // Used to resolve both the `class="CountryName"` SVG attribute
  // and the country strings returned by /api/stats/by-country.
  const NAME_MAP = {
    // A
    'afghanistan':'AF','albania':'AL','algeria':'DZ','american samoa':'AS',
    'angola':'AO','antigua and barbuda':'AG','argentina':'AR','armenia':'AM',
    'australia':'AU','austria':'AT','azerbaijan':'AZ',
    // B
    'bahamas':'BS','bahrain':'BH','bangladesh':'BD','barbados':'BB',
    'belarus':'BY','belgium':'BE','belize':'BZ','benin':'BJ','bhutan':'BT',
    'bolivia':'BO','bosnia':'BA','bosnia and herzegovina':'BA',
    'botswana':'BW','brazil':'BR','brasil':'BR','bulgaria':'BG',
    'burkina faso':'BF','burundi':'BI',
    // C
    'cambodia':'KH','cameroon':'CM','canada':'CA',
    'canary islands (spain)':'ES',
    'cape verde':'CV','cayman islands':'KY',
    'central african republic':'CF','chad':'TD','chile':'CL','china':'CN',
    "côte d'ivoire":'CI',"cote d'ivoire":'CI','ivory coast':'CI',
    'colombia':'CO','comoros':'KM','congo':'CG','dr congo':'CD',
    'democratic republic of the congo':'CD','congo dr':'CD',
    'costa rica':'CR','croatia':'HR','cuba':'CU','cyprus':'CY',
    'czech republic':'CZ','czechia':'CZ',
    // D-E
    'denmark':'DK','djibouti':'DJ','dominican republic':'DO',
    'ecuador':'EC','egypt':'EG','el salvador':'SV','equatorial guinea':'GQ',
    'eritrea':'ER','estonia':'EE','ethiopia':'ET',
    // F
    'faeroe islands':'FO','falkland islands':'FK',
    'federated states of micronesia':'FM','fiji':'FJ',
    'finland':'FI','france':'FR','french polynesia':'PF',
    // G
    'gabon':'GA','gambia':'GM','georgia':'GE','germany':'DE',
    'ghana':'GH','greece':'GR','guadeloupe':'GP',
    'guatemala':'GT','guinea':'GN','guinea-bissau':'GW','guyana':'GY',
    // H-I
    'haiti':'HT','honduras':'HN','hungary':'HU','iceland':'IS',
    'india':'IN','indonesia':'ID','iran':'IR','iraq':'IQ',
    'ireland':'IE','israel':'IL','italy':'IT',
    // J-K
    'jamaica':'JM','japan':'JP','jordan':'JO',
    'kazakhstan':'KZ','kenya':'KE','kosovo':'XK',
    'north korea':'KP','south korea':'KR','korea':'KR',
    'kuwait':'KW','kyrgyzstan':'KG',
    // L
    'laos':'LA','latvia':'LV','lebanon':'LB','lesotho':'LS',
    'liberia':'LR','libya':'LY','lithuania':'LT','luxembourg':'LU',
    // M
    'madagascar':'MG','malawi':'MW','malaysia':'MY','mali':'ML',
    'malta':'MT','mauritania':'MR','mauritius':'MU','mexico':'MX',
    'moldova':'MD','mongolia':'MN','montenegro':'ME','morocco':'MA',
    'mozambique':'MZ','myanmar':'MM','burma':'MM',
    // N
    'namibia':'NA','nepal':'NP','netherlands':'NL','holland':'NL',
    'new caledonia':'NC','new zealand':'NZ','nicaragua':'NI',
    'niger':'NE','nigeria':'NG','north macedonia':'MK','macedonia':'MK',
    'northern mariana islands':'MP','norway':'NO',
    // O-P
    'oman':'OM','pakistan':'PK','palestine':'PS','panama':'PA',
    'papua new guinea':'PG','paraguay':'PY','peru':'PE',
    'philippines':'PH','poland':'PL','portugal':'PT',
    'puerto rico':'PR','qatar':'QA',
    // R
    'romania':'RO','russia':'RU','russian federation':'RU','rwanda':'RW',
    // S
    'saint kitts and nevis':'KN','samoa':'WS',
    'saudi arabia':'SA','senegal':'SN','serbia':'RS','seychelles':'SC',
    'sierra leone':'SL','singapore':'SG','slovakia':'SK',
    'slovenia':'SI','solomon islands':'SB','somalia':'SO',
    'south africa':'ZA','south sudan':'SS','spain':'ES','sri lanka':'LK',
    'sudan':'SD','são tomé and principe':'ST','sao tome and principe':'ST',
    'sweden':'SE','switzerland':'CH','syria':'SY',
    // T
    'taiwan':'TW','chinese taipei':'TW','tajikistan':'TJ','tanzania':'TZ',
    'thailand':'TH','togo':'TG','tonga':'TO',
    'trinidad and tobago':'TT','trinidad':'TT','tunisia':'TN',
    'turkey':'TR','türkiye':'TR','turkmenistan':'TM',
    'turks and caicos islands':'TC',
    // U
    'uganda':'UG','ukraine':'UA','united arab emirates':'AE','uae':'AE',
    'united kingdom':'GB','uk':'GB','england':'GB','great britain':'GB',
    'united states':'US','united states of america':'US',
    'united states virgin islands':'VI',
    'usa':'US','u.s.a.':'US','u.s.':'US','america':'US',
    'uruguay':'UY','uzbekistan':'UZ',
    // V-Z
    'vanuatu':'VU','venezuela':'VE','vietnam':'VN','viet nam':'VN',
    'yemen':'YE','zambia':'ZM','zimbabwe':'ZW',
  };

  function nameToIso(name) {
    if (!name) return null;
    return NAME_MAP[String(name).trim().toLowerCase()] || null;
  }

  // ── Colour palette (Adobe Spectrum tokens) ───────────────────────────────
  //
  //  Blues:  --blue-400 #378EF0  --blue-500 #2680EB
  //          --blue-600 #1473E6  --blue-700 #0D66D0
  //  Green:  --green    #2D9D78  (Celery 500)
  //  Red:    --red      #E34850  --red-hover #D7373F
  //  Gray:   --gray-200 #D3D3D3  --gray-300 #BCBCBC
  //  Accent-light: #EAF1FB
  //
  const CLR_GOOD  = '#2D9D78';   // Spectrum Celery / Green 500
  const CLR_WARN  = '#E68619';   // Spectrum Orange 500
  const CLR_POOR  = '#E34850';   // Spectrum Red 500
  const CLR_NONE  = '#D3D3D3';   // Spectrum Gray 200 — clear "no data"
  const CLR_OCEAN_LIGHT = '#EAF1FB';   // Spectrum accent-light
  const CLR_OCEAN_DARK  = '#0d1e33';   // Spectrum dark blue-tinted surface
  function cLrOcean() {
    return (typeof ThemeManager !== 'undefined' && ThemeManager.isDark())
      ? CLR_OCEAN_DARK : CLR_OCEAN_LIGHT;
  }

  // Count choropleth colour stops (Spectrum blue family)
  const CLR_COUNT_LO = '#C5DFFB'; // lighter than accent-light, still blue-tinted
  const CLR_COUNT_HI = '#0D66D0'; // --blue-700 for strong contrast at max

  function lerpColor(a, b, t) {
    const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
    const ar = ah >> 16, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
    const br = bh >> 16, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
    const r   = Math.round(ar + (br - ar) * t);
    const g   = Math.round(ag + (bg - ag) * t);
    const blv = Math.round(ab + (bb - ab) * t);
    return `#${((1 << 24) | (r << 16) | (g << 8) | blv).toString(16).slice(1)}`;
  }

  // Sequential blue ramp (√ scaling gives better perceptual spread)
  function countColor(val, max) {
    if (!val || !max) return CLR_NONE;
    const t = Math.sqrt(Math.max(0, Math.min(1, val / max)));
    return lerpColor(CLR_COUNT_LO, CLR_COUNT_HI, t);
  }

  // Diverging red → orange → green (all Spectrum tokens)
  function metricColor(val) {
    if (val === null || val === undefined) return CLR_NONE;
    if (val >= 75) return lerpColor(CLR_WARN, CLR_GOOD, (val - 75) / 25);
    if (val >= 50) return lerpColor(CLR_POOR, CLR_WARN, (val - 50) / 25);
    // Below 50: darken toward Spectrum --red-hover
    return lerpColor('#D7373F', CLR_POOR, val / 50);
  }

  function scoreColor(v) {
    if (v === null || v === undefined) return CLR_NONE;
    return v >= 75 ? CLR_GOOD : v >= 50 ? CLR_WARN : CLR_POOR;
  }

  // ── Metric definitions ────────────────────────────────────────────────────
  const METRICS = [
    { key: 'checks',        label: 'Health Checks',  field: 'check_count',            mode: 'count' },
    { key: 'score',         label: 'Avg Score',       field: 'avg_score',              mode: 'score' },
    { key: 'accessibility', label: 'Accessibility',   field: 'avg_accessibility_rate', mode: 'score' },
    { key: 'tagged',        label: 'Tagged PDFs',     field: 'pct_tagged',             mode: 'score' },
  ];

  // ── Legend ────────────────────────────────────────────────────────────────
  // Uses a continuous CSS gradient bar — cleaner than discrete swatches.
  const GRAD_BAR = 'width:140px;height:10px;border-radius:5px;display:inline-block;vertical-align:middle;flex-shrink:0';
  const NO_DATA_CHIP = `<span style="${GRAD_BAR};width:10px;background:${CLR_NONE};margin-left:4px"></span>`;

  function buildLegend(metric) {
    const m = METRICS.find(x => x.key === metric) || METRICS[0];
    if (m.mode === 'count') {
      return `<div class="wmap-legend-row">
        <span class="wmap-leg-label">Fewer</span>
        <span style="${GRAD_BAR};background:linear-gradient(90deg,${CLR_COUNT_LO},${CLR_COUNT_HI})"></span>
        <span class="wmap-leg-label">More</span>
        <span style="margin-left:16px;display:inline-flex;align-items:center;gap:5px">
          ${NO_DATA_CHIP}<span class="wmap-leg-label">No data</span>
        </span>
      </div>`;
    }
    // Diverging scale: red → orange → green
    return `<div class="wmap-legend-row">
      <span class="wmap-leg-label">Poor</span>
      <span style="${GRAD_BAR};background:linear-gradient(90deg,${CLR_POOR},${CLR_WARN},${CLR_GOOD})"></span>
      <span class="wmap-leg-label">Good</span>
      <span style="margin-left:16px;display:inline-flex;align-items:center;gap:5px">
        ${NO_DATA_CHIP}<span class="wmap-leg-label">No data</span>
      </span>
    </div>`;
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────
  function tooltipHtml(d) {
    const pct = v => (v !== null && v !== undefined) ? `${v}%` : '—';
    const num = v => (v !== null && v !== undefined) ? v : '—';
    const scoreCell = d.score !== null && d.score !== undefined
      ? `<span class="wmap-tt-score" style="background:${scoreColor(d.score)}">${d.score}</span>`
      : '—';
    return `
      <div class="wmap-tt-name">${escHtml(d.name || d.iso)}</div>
      <table class="wmap-tt-table">
        <tr><td>Health Checks</td><td>${num(d.checks)}</td></tr>
        <tr><td>Documents</td><td>${num(d.docs)}</td></tr>
        <tr><td>Customers</td><td>${num(d.cust)}</td></tr>
        <tr><td>Avg Score</td><td>${scoreCell}</td></tr>
        <tr><td>Accessibility</td><td>${pct(d.acc)}</td></tr>
        <tr><td>Tagged PDFs</td><td>${pct(d.tagged)}</td></tr>
        <tr><td>Encrypted</td><td>${pct(d.enc)}</td></tr>
      </table>`;
  }

  function positionTooltip(tt, e, containerEl) {
    const rect = containerEl.getBoundingClientRect();
    let left = e.clientX - rect.left + 14;
    let top  = e.clientY - rect.top  - 10;
    const ttW = tt.offsetWidth  || 200;
    const ttH = tt.offsetHeight || 160;
    if (left + ttW > rect.width  - 8) left = e.clientX - rect.left - ttW - 14;
    if (top  + ttH > rect.height - 8) top  = e.clientY - rect.top  - ttH - 10;
    tt.style.left = `${Math.max(0, left)}px`;
    tt.style.top  = `${Math.max(0, top)}px`;
  }

  // ── Empty-state placeholder ───────────────────────────────────────────────
  function emptyState() {
    return `<div style="padding:60px 24px;text-align:center;color:var(--gray-400);font-size:13px">
      <svg viewBox="0 0 24 24" fill="none" style="width:36px;height:36px;margin:0 auto 12px;display:block;opacity:.4">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
        <path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" stroke="currentColor" stroke-width="1.5"/>
      </svg>
      No country data yet.<br>Add countries to your customers to see the map.
    </div>`;
  }

  // ── SVG loader (fetch + cache) ────────────────────────────────────────────
  let _svgText = null;

  async function loadSvg() {
    if (_svgText) return _svgText;
    const resp = await fetch('data/world.svg');
    if (!resp.ok) throw new Error(`World map fetch failed: ${resp.status}`);
    _svgText = await resp.text();
    return _svgText;
  }

  // ── Choropleth colouring ──────────────────────────────────────────────────
  // ISO2_RE matches only valid 2-letter uppercase country codes.
  // IDs like "0","1","2","BQBO","BQSA","BQSE" are excluded.
  const ISO2_RE = /^[A-Z]{2}$/;

  function applyColors(svgEl, byIso, metric) {
    const m      = METRICS.find(x => x.key === metric) || METRICS[0];
    const vals   = Object.values(byIso).map(r => r.check_count || 0);
    const maxCnt = Math.max(...vals, 1);

    svgEl.querySelectorAll('path').forEach(p => {
      const id  = p.getAttribute('id')    || '';
      const cls = p.getAttribute('class') || '';

      // Determine ISO2 code for this path
      let iso = null;
      if (ISO2_RE.test(id)) {
        iso = id;                          // single-path country (id="XX")
      } else if (cls) {
        iso = nameToIso(cls);              // multi-path country (class="Name")
      }

      // Store on the element for tooltip handler reuse
      p._wmapIso = iso;
      p._wmapRow = iso ? (byIso[iso] || null) : null;

      if (!iso) {
        // Non-country element — keep original fill (ocean/graticule)
        p.style.cursor = '';
        return;
      }

      p.style.cursor = 'pointer';
      p.setAttribute('data-iso', iso);   // enables CSS hover rule

      const row = byIso[iso];
      if (!row) {
        // Known country, just no data yet
        p.setAttribute('fill', CLR_NONE);
        return;
      }

      const val  = row[m.field];
      const fill = m.mode === 'count'
        ? countColor(row.check_count, maxCnt)
        : metricColor(val);
      p.setAttribute('fill', fill);
    });
  }

  // ── Tooltip event binding ─────────────────────────────────────────────────
  function attachTooltips(svgEl, mapEl) {
    const tt = mapEl.querySelector('#wmapTooltip');

    svgEl.querySelectorAll('path').forEach(p => {
      p.addEventListener('mouseenter', e => {
        if (!p._wmapIso) return;
        const row = p._wmapRow;
        if (!row) {
          // Country exists but no data — show minimal tooltip
          tt.innerHTML = `<div class="wmap-tt-name">${escHtml(p.getAttribute('class') || p.getAttribute('id'))}</div>
            <div style="font-size:11px;color:var(--gray-400);margin-top:4px">No data available</div>`;
          tt.style.display = 'block';
          positionTooltip(tt, e, mapEl);
          return;
        }
        tt.innerHTML = tooltipHtml({
          iso:    p._wmapIso,
          name:   row.country,
          checks: row.check_count       || 0,
          docs:   row.doc_count         || 0,
          cust:   row.customer_count    || 0,
          score:  row.avg_score,
          acc:    row.avg_accessibility_rate,
          tagged: row.pct_tagged,
          enc:    row.pct_encrypted,
        });
        tt.style.display = 'block';
        positionTooltip(tt, e, mapEl);
      });

      p.addEventListener('mousemove', e => {
        if (p._wmapIso && tt.style.display !== 'none') {
          positionTooltip(tt, e, mapEl);
        }
      });

      p.addEventListener('mouseleave', () => {
        tt.style.display = 'none';
      });
    });
  }

  // ── Main async render ─────────────────────────────────────────────────────
  async function renderMap(mapEl, byIso, metric) {
    // Loading state
    mapEl.innerHTML = `<div style="padding:40px;text-align:center;color:var(--gray-400);font-size:12px">
      Loading map…</div>`;

    let svgText;
    try {
      svgText = await loadSvg();
    } catch (err) {
      mapEl.innerHTML = `<div style="padding:40px;text-align:center;color:var(--gray-400);font-size:12px">
        Map unavailable</div>`;
      return null;
    }

    // Parse the world SVG
    const parser = new DOMParser();
    const doc    = parser.parseFromString(svgText, 'image/svg+xml');
    const svgEl  = doc.querySelector('svg');

    if (!svgEl) {
      mapEl.innerHTML = `<div style="padding:40px;text-align:center;color:var(--gray-400);font-size:12px">
        Map unavailable</div>`;
      return null;
    }

    // Style the SVG element.
    // The source file uses lowercase `viewbox` (non-standard); browsers won't
    // derive the intrinsic aspect ratio from it.  Copy it to the spec-correct
    // `viewBox` so that `width:100%` / no explicit height works properly.
    const vbVal = svgEl.getAttribute('viewBox') || svgEl.getAttribute('viewbox') || '0 0 2000 857';
    svgEl.setAttribute('viewBox', vbVal);
    svgEl.setAttribute('width', '100%');
    svgEl.removeAttribute('height');
    svgEl.style.cssText = [
      'display:block',
      `background:${cLrOcean()}`,
      'border-radius:0 0 6px 6px',
    ].join(';');

    // Give the SVG a stable ID so the injected style rules are scoped to it.
    // Without scoping, inline-SVG <style> rules are document-level and would
    // clobber every other <path> on the page (sidebar icons, buttons, etc.).
    svgEl.id = 'wmapSvg';

    const styleEl = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = [
      '#wmapSvg path { stroke: rgba(255,255,255,0.70); stroke-width: 0.4px; }',
      '#wmapSvg path[data-iso]:hover { filter: brightness(1.07); stroke: #FFFFFF; stroke-width: 0.8px; }',
    ].join('\n');
    svgEl.insertBefore(styleEl, svgEl.firstChild);

    // Build the surrounding shell (tooltip needs position:relative parent)
    mapEl.innerHTML = `
      <div style="position:relative;overflow:hidden;border-radius:0 0 6px 6px" id="wmapInner">
        <div id="wmapSvgHolder"></div>
        <div id="wmapTooltip" class="wmap-tooltip" style="display:none;position:absolute;z-index:20;pointer-events:none"></div>
      </div>
      <div class="wmap-legend" id="wmapLegend" style="padding:8px 20px 14px">${buildLegend(metric)}</div>`;

    mapEl.querySelector('#wmapSvgHolder').appendChild(svgEl);

    // Colour countries
    applyColors(svgEl, byIso, metric);

    // Wire up tooltips — anchor relative to #wmapInner (position:relative)
    const innerEl = mapEl.querySelector('#wmapInner');
    attachTooltips(svgEl, innerEl);

    return svgEl;
  }

  // ── Public render ─────────────────────────────────────────────────────────
  /**
   * @param {HTMLElement} container  — receives tabs + map
   * @param {Array}       rows       — from /api/stats/by-country
   * @param {string}      [initMetric='checks']
   */
  async function render(container, rows, initMetric = 'checks') {
    // Build ISO → row lookup
    const byIso = {};
    (rows || []).forEach(r => {
      const iso = nameToIso(r.country);
      if (iso) byIso[iso] = r;
    });

    const hasData = Object.keys(byIso).length > 0;

    // Tab bar
    const tabs = METRICS.map(m =>
      `<button class="wmap-tab${m.key === initMetric ? ' active' : ''}" data-metric="${m.key}">${m.label}</button>`
    ).join('');

    // The tab bar keeps the card's normal horizontal padding.
    // The map area uses negative margin to reach the card edges (card has
    // padding:18px 20px 0 set on the parent, so we pull out 20px on each side).
    container.innerHTML = `
      <div class="wmap-tabs" id="wmapTabs">${tabs}</div>
      <div id="wmapMapEl" style="position:relative;margin:0 -20px"></div>`;

    const mapEl = container.querySelector('#wmapMapEl');

    if (!hasData) {
      mapEl.innerHTML = emptyState();
      return;
    }

    let current = initMetric;
    let svgEl   = await renderMap(mapEl, byIso, current);

    // Tab switching — only recolour, don't re-fetch
    container.querySelector('#wmapTabs').addEventListener('click', e => {
      const btn = e.target.closest('.wmap-tab');
      if (!btn || !svgEl) return;
      container.querySelectorAll('.wmap-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      current = btn.dataset.metric;
      applyColors(svgEl, byIso, current);
      const legendEl = mapEl.querySelector('#wmapLegend');
      if (legendEl) legendEl.innerHTML = buildLegend(current, byIso);
    });

    // Theme changes — update ocean background colour
    if (typeof ThemeManager !== 'undefined') {
      ThemeManager.onChange(() => {
        if (svgEl) svgEl.style.background = cLrOcean();
      });
    }
  }

  return { render, METRICS };
})();
