/* Customers View */
const CustomersView = (() => {

  /* ── Geographic data ────────────────────────────────────────────────────── */
  const GEO = {
    EMEA: [
      'Austria','Belgium','Czech Republic','Denmark','Egypt','Finland',
      'France','Germany','Greece','Hungary','Ireland','Israel','Italy',
      'Kenya','Morocco','Netherlands','Nigeria','Norway','Poland',
      'Portugal','Qatar','Romania','Saudi Arabia','South Africa',
      'Spain','Sweden','Switzerland','Turkey','UAE','United Kingdom',
    ],
    APAC: [
      'Australia','China','Hong Kong','India','Indonesia','Japan',
      'Malaysia','New Zealand','Philippines','Singapore','South Korea',
      'Taiwan','Thailand','Vietnam',
    ],
    Americas: [
      'Argentina','Brazil','Canada','Chile','Colombia','Mexico',
      'Peru','United States',
    ],
  };

  const US_STATES = [
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado',
    'Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho',
    'Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana',
    'Maine','Maryland','Massachusetts','Michigan','Minnesota',
    'Mississippi','Missouri','Montana','Nebraska','Nevada',
    'New Hampshire','New Jersey','New Mexico','New York',
    'North Carolina','North Dakota','Ohio','Oklahoma','Oregon',
    'Pennsylvania','Rhode Island','South Carolina','South Dakota',
    'Tennessee','Texas','Utah','Vermont','Virginia','Washington',
    'Washington D.C.','West Virginia','Wisconsin','Wyoming',
  ];

  /* ── Location display helper ────────────────────────────────────────────── */
  // Returns e.g. "California, United States · EMEA · Finance"
  // or just "Netherlands · EMEA · Finance" for non-US customers.
  function locationLabel(c) {
    const loc = c.state
      ? `${escHtml(c.state)}, ${escHtml(c.country)}`
      : escHtml(c.country || '');
    return [loc, escHtml(c.region || ''), escHtml(c.vertical || '')].filter(Boolean).join(' · ') || t('customers.noDetails');
  }

  /* ── Customer avatar SVG ────────────────────────────────────────────────────
   * Generates a brand-style gradient blob SVG avatar, unique per customer name.
   * Each call gets a unique ID suffix so masks/gradients don't collide on page.
   *
   * size  — rendered width/height in px (SVG viewBox is always 0 0 40 40)
   * rxPx  — border-radius in px at the rendered size; null = full circle (20 in vb units)
   */
  let _avatarSeq = 0;

  const AVATAR_PALETTES = [
    //  bg          accent      highlight   slash
    ['#A7B2FF', '#7A6AFD', '#DDC1F6', '#7155FA'], // purple (original)
    ['#93C5FD', '#3B82F6', '#BFDBFE', '#2563EB'], // blue
    ['#6EE7B7', '#10B981', '#D1FAE5', '#059669'], // green
    ['#FCD34D', '#F59E0B', '#FEF3C7', '#D97706'], // amber
    ['#FCA5A5', '#EF4444', '#FEE2E2', '#DC2626'], // red
    ['#5EEAD4', '#14B8A6', '#CCFBF1', '#0D9488'], // teal
    ['#A5B4FC', '#6366F1', '#E0E7FF', '#4F46E5'], // indigo
    ['#FDA4AF', '#F43F5E', '#FFE4E6', '#E11D48'], // rose
  ];

  function _palettePick(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
  }

  /** Derive a 4-stop palette [bg, accent, highlight, slash] from any hex color. */
  function _paletteFromColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const tint  = (t) => '#' + [r, g, b].map(c => Math.round(c + (255 - c) * (1 - t)).toString(16).padStart(2, '0')).join('');
    const shade = (t) => '#' + [r, g, b].map(c => Math.round(c * t).toString(16).padStart(2, '0')).join('');
    return [tint(0.55), hex, tint(0.28), shade(0.82)];
  }

  function _initials(name) {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  /**
   * Returns a CSS color string for initials text that contrasts well against
   * the given hex background color using the perceived-brightness formula.
   */
  function _initialsColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    // W3C perceived brightness: 0–255
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 155 ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.92)';
  }

  /**
   * @param {string}      name        Customer display name
   * @param {number}      size        Rendered size in px (default 40)
   * @param {number|null} rxPx        Border-radius in px; null = full circle
   * @param {string|null} customColor Hex color override, e.g. '#3B82F6'; null = auto from name
   */
  function customerAvatarSVG(name, size = 40, rxPx = null, customColor = null) {
    const [bg, accent, highlight, slash] = customColor ? _paletteFromColor(customColor) : _palettePick(name);
    const u        = ++_avatarSeq;
    const ini      = _initials(name);
    const textFill = _initialsColor(accent);
    // rx in viewBox units (0–40 space); null → full circle (rx=20)
    const rx  = rxPx === null ? 20 : Math.round(rxPx * 40 / size * 10) / 10;
    // font-size scaled to viewBox so it stays proportional at all display sizes
    const fs  = ini.length > 1 ? 13 : 15;
    return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;flex-shrink:0">
<rect width="40" height="40" rx="${rx}" fill="white"/>
<g clip-path="url(#ca_c${u})">
<rect width="40" height="40" rx="${rx}" fill="${bg}"/>
<mask id="ca_m0${u}" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="12" y="8" width="52" height="51">
<circle cx="37.8376" cy="33.3854" r="25.2534" fill="url(#ca_p0${u})"/></mask>
<g mask="url(#ca_m0${u})"><circle cx="37.8376" cy="33.3854" r="25.2534" fill="${accent}"/></g>
<mask id="ca_m1${u}" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="-8" y="-23" width="51" height="51">
<circle cx="17.4407" cy="2.59711" r="25.2534" fill="url(#ca_p1${u})"/></mask>
<g mask="url(#ca_m1${u})"><circle cx="17.4407" cy="2.59711" r="25.2534" fill="${highlight}"/></g>
<mask id="ca_m2${u}" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="9" y="-9" width="48" height="48">
<path d="M39.411 37.583C51.8901 34.0182 59.1165 21.012 55.5517 8.53289C51.9868 -3.94621 38.9806 -11.1726 26.5015 -7.6078C14.0224 -4.04295 6.796 8.96323 10.3608 21.4423C13.9257 33.9214 26.9319 41.1479 39.411 37.583Z" fill="url(#ca_p2${u})"/></mask>
<g mask="url(#ca_m2${u})"><path d="M39.411 37.583C51.8901 34.0182 59.1165 21.012 55.5517 8.53289C51.9868 -3.94621 38.9806 -11.1726 26.5015 -7.6078C14.0224 -4.04295 6.796 8.96323 10.3608 21.4423C13.9257 33.9214 26.9319 41.1479 39.411 37.583Z" fill="${slash}"/></g>
<mask id="ca_m3${u}" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="-20" y="0" width="59" height="37">
<path d="M13.4283 35.7617C11.1044 37.1998 8.15997 37.2086 5.82738 35.7844L-17.5027 21.5399C-19.7876 20.1448 -19.7914 16.8518 -17.5096 15.4514L5.66631 1.22703C7.9954 -0.202239 10.9398 -0.200537 13.2669 1.23213L36.3951 15.4698C38.6648 16.8672 38.6689 20.1418 36.402 21.5444L13.4283 35.7617Z" fill="url(#ca_p3${u})"/></mask>
<g mask="url(#ca_m3${u})"><path d="M13.4291 35.7617C11.1051 37.1998 8.1607 37.2086 5.82812 35.7844L-17.5019 21.5399C-19.7868 20.1448 -19.7906 16.8518 -17.5089 15.4514L5.66704 1.22704C7.99613 -0.202235 10.9406 -0.200537 13.2677 1.23213L36.3958 15.4698C38.6655 16.8672 38.6697 20.1418 36.4027 21.5444L13.4291 35.7617Z" fill="${accent}"/></g>
<text x="20" y="20" text-anchor="middle" dominant-baseline="central"
  font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
  font-size="${fs}" font-weight="700" fill="${textFill}">${ini}</text>
</g>
<defs>
<radialGradient id="ca_p0${u}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(37.8376 33.3854) rotate(90) scale(25.2534)"><stop offset="0.166667"/><stop offset="1" stop-opacity="0"/></radialGradient>
<radialGradient id="ca_p1${u}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(17.4407 2.59711) rotate(90) scale(25.2534)"><stop offset="0.166667"/><stop offset="1" stop-opacity="0"/></radialGradient>
<linearGradient id="ca_p2${u}" x1="53.3293" y1="29.8313" x2="12.8189" y2="1.93013" gradientUnits="userSpaceOnUse"><stop/><stop offset="1" stop-opacity="0"/></linearGradient>
<linearGradient id="ca_p3${u}" x1="2.24839" y1="14.8955" x2="21.9222" y2="30.6778" gradientUnits="userSpaceOnUse"><stop/><stop offset="1" stop-opacity="0"/></linearGradient>
<clipPath id="ca_c${u}"><rect width="40" height="40" rx="${rx}" fill="white"/></clipPath>
</defs>
</svg>`;
  }

  // ── Logo localStorage helpers ─────────────────────────────────────────────
  // The backend doesn't store logo_url / logo_scale_fit, so we keep them
  // client-side in localStorage, keyed by customer ID.
  function _logoKey(id)    { return `hcapp_logo_${id}`; }
  function _logoFitKey(id) { return `hcapp_logo_fit_${id}`; }

  function saveLogo(id, url, scaleFit) {
    try {
      if (url) {
        localStorage.setItem(_logoKey(id), url);
        localStorage.setItem(_logoFitKey(id), scaleFit ? '1' : '0');
      } else {
        localStorage.removeItem(_logoKey(id));
        localStorage.removeItem(_logoFitKey(id));
      }
    } catch (e) {
      // localStorage may be full (logos are base64 — can be large)
      Toast.show(t('customers.logoSizeError'), 'warning');
    }
  }

  function loadLogo(id) {
    try {
      const url = localStorage.getItem(_logoKey(id));
      if (!url) return null;
      return { logo_url: url, logo_scale_fit: localStorage.getItem(_logoFitKey(id)) !== '0' };
    } catch { return null; }
  }

  function deleteLogo(id) {
    try {
      localStorage.removeItem(_logoKey(id));
      localStorage.removeItem(_logoFitKey(id));
    } catch {}
  }

  // ── Avatar color localStorage helpers ────────────────────────────────────
  // Stores a custom hex color per customer ID so the avatar color persists.
  function _colorKey(id) { return `hcapp_avatar_color_${id}`; }

  function saveColor(id, hex) {
    try {
      if (hex) localStorage.setItem(_colorKey(id), hex);
      else     localStorage.removeItem(_colorKey(id));
    } catch {}
  }

  function loadColor(id) {
    try { return localStorage.getItem(_colorKey(id)) || null; } catch { return null; }
  }

  function deleteColor(id) {
    try { localStorage.removeItem(_colorKey(id)); } catch {}
  }

  /** Inject stored logos into a customer array before rendering */
  function withLogos(customers) {
    return customers.map(c => {
      const logo = loadLogo(c.id);
      return logo ? { ...c, ...logo } : c;
    });
  }

  // Tracks whether admin is viewing all customers or just their own
  let showAllCustomers = false;
  let allCustomers     = [];

  // ── View mode: 'cards' (default) or 'table' ───────────────────────────────
  let _custView = localStorage.getItem('hcapp_cust_view') || 'cards';

  // ── Pagination ────────────────────────────────────────────────────────────
  const CUST_PAGE_SIZE  = 25;
  let   _custPage       = 1;
  let   _custFiltered   = [];   // last filtered set, used for page nav

  function custPaginationHtml(total, page, size) {
    if (total <= size) return '';
    const pages = Math.ceil(total / size);
    const start = (page - 1) * size + 1;
    const end   = Math.min(page * size, total);
    return `<div class="pagination-bar">
      <span class="pagination-info">${t('common.showing') || 'Showing'} ${start}–${end} ${t('common.of') || 'of'} ${total}</span>
      <div class="pagination-btns">
        <button class="btn btn-ghost btn-sm" id="custPagePrev" ${page <= 1 ? 'disabled' : ''}>&lsaquo; ${t('common.prev') || 'Prev'}</button>
        <span class="pagination-info" style="min-width:60px;text-align:center">${page} / ${pages}</span>
        <button class="btn btn-ghost btn-sm" id="custPageNext" ${page >= pages ? 'disabled' : ''}>${t('common.next') || 'Next'} &rsaquo;</button>
      </div>
    </div>`;
  }

  async function render(container, params = {}) {
    const admin = (typeof UserProfile !== 'undefined') && UserProfile.isAdmin();

    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-row">
          <div>
            <h1>${t('customers.title')}</h1>
            <p>${t('customers.subtitle')}</p>
          </div>
          <button class="btn btn-primary" id="addCustomerBtn">
            <svg viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            ${t('customers.addCustomer')}
          </button>
        </div>
      </div>
      <div class="filter-bar">
        ${admin ? `
        <div class="scope-toggle">
          <button class="scope-toggle-btn ${!showAllCustomers ? 'active' : ''}" id="custScopeMine">${t('customers.myCustomers')}</button>
          <button class="scope-toggle-btn ${showAllCustomers  ? 'active' : ''}" id="custScopeAll">${t('customers.allCustomers')}</button>
        </div>` : ''}
        <input type="text" id="custSearch" class="form-input" placeholder="${t('customers.searchPlaceholder')}" style="max-width:260px;height:32px">
        <select class="filter-select" id="custRegion"><option value="">${t('customers.allRegions')}</option></select>
        <select class="filter-select" id="custVertical"><option value="">${t('customers.allVerticals')}</option></select>
        <div class="view-toggle" id="custViewToggle">
          <button class="view-toggle-btn ${_custView === 'cards' ? 'active' : ''}" data-view="cards" title="Card view">
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14"><rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.4"/></svg>
          </button>
          <button class="view-toggle-btn ${_custView === 'table' ? 'active' : ''}" data-view="table" title="Table view">
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14"><path d="M1 4h14M1 8h14M1 12h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
      <div id="custGrid"><div class="flex items-center gap-8" style="color:var(--gray-400);font-size:13px"><div class="loading-spinner"></div> ${t('customers.loading')}</div></div>`;

    document.getElementById('addCustomerBtn').onclick = () => openCustomerForm();

    if (admin) {
      document.getElementById('custScopeMine').onclick = () => { showAllCustomers = false; _custPage = 1; render(container, params); };
      document.getElementById('custScopeAll').onclick  = () => { showAllCustomers = true;  _custPage = 1; render(container, params); };
    }

    try {
      const apiParams = showAllCustomers ? { all: 1 } : {};
      const res = await API.customers.list(apiParams);
      allCustomers = res.data || [];
      populateFilters(allCustomers);
      renderGrid(withLogos(allCustomers));

      document.getElementById('custSearch').oninput = filterCustomers;
      document.getElementById('custRegion').onchange = filterCustomers;
      document.getElementById('custVertical').onchange = filterCustomers;

      document.querySelectorAll('#custViewToggle .view-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          _custView = btn.dataset.view;
          _custPage = 1;
          localStorage.setItem('hcapp_cust_view', _custView);
          document.querySelectorAll('#custViewToggle .view-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
          filterCustomers();
        });
      });

      if (params.id) openCustomerDetail(params.id);
    } catch (e) {
      document.getElementById('custGrid').innerHTML = `<div class="connection-banner">${e.message}</div>`;
    }
  }

  function populateFilters(customers) {
    const regions   = [...new Set(customers.map(c => c.region).filter(Boolean))].sort();
    const verticals = [...new Set(customers.map(c => c.vertical).filter(Boolean))].sort();
    const rSel = document.getElementById('custRegion');
    const vSel = document.getElementById('custVertical');
    regions.forEach(r   => rSel.add(new Option(r, r)));
    verticals.forEach(v => vSel.add(new Option(v, v)));
  }

  function filterCustomers() {
    const q = (document.getElementById('custSearch').value || '').toLowerCase();
    const r = document.getElementById('custRegion').value;
    const v = document.getElementById('custVertical').value;
    const filtered = allCustomers.filter(c => {
      const matchQ = !q || c.display_name.toLowerCase().includes(q);
      const matchR = !r || c.region === r;
      const matchV = !v || c.vertical === v;
      return matchQ && matchR && matchV;
    });
    _custPage = 1;
    renderGrid(withLogos(filtered));
  }

  function renderGrid(customers) {
    const grid = document.getElementById('custGrid');
    if (!customers.length) {
      grid.className = '';
      grid.innerHTML = `<div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="5" stroke="currentColor" stroke-width="1.5"/><path d="M3 20c0-3.87 2.69-7 6-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="17" cy="15" r="4" stroke="currentColor" stroke-width="1.5"/><path d="M13 22c0-2.21 1.79-4 4-4s4 1.79 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <h3>${t('customers.noFound')}</h3>
        <p>${t('customers.noFoundSub')}</p>
        <button class="btn btn-primary mt-16" onclick="CustomersView.openCustomerForm()">${t('customers.addCustomer')}</button>
      </div>`;
      _custFiltered = [];
      return;
    }

    _custFiltered = customers;
    const page   = _custPage;
    const size   = CUST_PAGE_SIZE;
    const slice  = customers.slice((page - 1) * size, page * size);

    if (_custView === 'table') {
      renderCustomerTable(grid, slice);
    } else {
      renderCustomerCards(grid, slice);
    }

    // Append pagination below the grid content
    const pagHtml = custPaginationHtml(customers.length, page, size);
    if (pagHtml) {
      const pagDiv = document.createElement('div');
      pagDiv.innerHTML = pagHtml;
      grid.appendChild(pagDiv.firstElementChild);

      document.getElementById('custPagePrev').onclick = () => { _custPage--; renderGrid(_custFiltered); };
      document.getElementById('custPageNext').onclick = () => { _custPage++; renderGrid(_custFiltered); };
    }
  }

  function renderCustomerCards(grid, customers) {
    grid.className = 'customer-grid';
    grid.innerHTML = customers.map(c => {
      const score = c.avg_score != null ? c.avg_score : null;
      const cls   = score != null ? (score >= 75 ? 'good' : score >= 50 ? 'warn' : 'poor') : '';
      const ownerTag = showAllCustomers && c.owner_email
        ? `<div style="font-size:10px;color:var(--gray-400);margin-top:3px">${escHtml(c.owner_email)}</div>`
        : '';
      const avatarHtml = c.logo_url
        ? `<img class="customer-avatar customer-logo" src="${escHtml(c.logo_url)}"
               style="object-fit:${c.logo_scale_fit !== false ? 'contain' : 'cover'};background:var(--gray-75)" alt="">`
        : customerAvatarSVG(c.display_name, 40, null, loadColor(c.id));
      return `
        <div class="customer-card" onclick="CustomersView.openCustomerDetail(${c.id})">
          <div class="customer-card-header">
            ${avatarHtml}
            <div>
              <div class="customer-name">${escHtml(c.display_name)}</div>
              <div class="customer-meta">${locationLabel(c)}</div>
              ${ownerTag}
            </div>
            ${score != null ? `<span class="score-pill ${cls}" style="margin-left:auto">${score}</span>` : ''}
          </div>
          <div class="customer-stats">
            <div class="customer-stat"><div class="val">${c.health_check_count || 0}</div><div class="lbl">${t('customers.statChecks')}</div></div>
            <div class="customer-stat"><div class="val">${c.pdf_count || 0}</div><div class="lbl">${t('customers.statPdfs')}</div></div>
            <div class="customer-stat"><div class="val">${score != null ? score : '—'}</div><div class="lbl">${t('customers.statAvgScore')}</div></div>
          </div>
        </div>`;
    }).join('');
  }

  function renderCustomerTable(grid, customers) {
    grid.className = '';
    grid.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden">
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>${t('customers.thName') || 'Customer'}</th>
              <th>${t('customers.allRegions').replace('All ','') || 'Location'}</th>
              <th>${t('customers.formVerticalLabel') || 'Vertical'}</th>
              <th>${t('customers.formSegmentLabel') || 'Segment'}</th>
              <th>${t('customers.statChecks')}</th>
              <th>${t('customers.statPdfs')}</th>
              <th>${t('customers.statAvgScore')}</th>
              ${showAllCustomers ? `<th>${t('hc.thOwner') || 'Owner'}</th>` : ''}
            </tr></thead>
            <tbody>
              ${customers.map(c => {
                const score = c.avg_score != null ? c.avg_score : null;
                const cls   = score != null ? (score >= 75 ? 'good' : score >= 50 ? 'warn' : 'poor') : '';
                const avatarHtml = c.logo_url
                  ? `<img class="customer-avatar" src="${escHtml(c.logo_url)}"
                         style="width:28px;height:28px;object-fit:${c.logo_scale_fit !== false ? 'contain' : 'cover'};background:var(--gray-75)" alt="">`
                  : customerAvatarSVG(c.display_name, 28, null, loadColor(c.id));
                return `<tr style="cursor:pointer" onclick="CustomersView.openCustomerDetail(${c.id})">
                  <td>
                    <div style="display:flex;align-items:center;gap:10px">
                      ${avatarHtml}
                      <div class="font-medium">${escHtml(c.display_name)}</div>
                    </div>
                  </td>
                  <td class="text-sm text-muted">${locationLabel(c)}</td>
                  <td class="text-sm">${escHtml(c.vertical || '—')}</td>
                  <td class="text-sm">${escHtml(c.segment || '—')}</td>
                  <td class="text-sm">${c.health_check_count || 0}</td>
                  <td class="text-sm">${c.pdf_count || 0}</td>
                  <td>${score != null ? `<span class="score-pill ${cls}">${score}</span>` : '<span class="text-muted text-sm">—</span>'}</td>
                  ${showAllCustomers ? `<td class="text-sm text-muted">${escHtml(c.owner_email || '—')}</td>` : ''}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  async function openCustomerDetail(id) {
    const customer = allCustomers.find(c => c.id === id) || { id };
    Modal.open({
      heading: t('customers.detailHeading'),
      content: `<div style="display:flex;align-items:center;justify-content:center;padding:20px"><div class="loading-spinner"></div></div>`,
      size: 'modal-lg',
      actions: [
        { label: t('customers.newHcBtn'), cls: 'btn-primary', onClick: () => { Modal.close(); App.navigate('healthchecks', { action: 'new', customerId: id }); } },
        { label: t('customers.editBtn'), cls: 'btn-secondary', onClick: () => { Modal.close(); openCustomerForm(id); } },
        { label: t('customers.deleteBtn'), cls: 'btn-danger', onClick: () => openDeleteConfirm(id) },
        { label: t('common.close'), cls: 'btn-secondary', onClick: Modal.close }
      ]
    });

    try {
      const [cust_res, hcRes] = await Promise.all([
        API.customers.get(id),
        API.healthChecks.list({ customer_id: id, limit: 20 })
      ]);
      const cust = cust_res.data || {};
      // Merge in locally-stored logo
      Object.assign(cust, loadLogo(id) || {});

      // Set Yukon context so chat questions are scoped to this customer
      if (typeof YukonChat !== 'undefined') {
        YukonChat.setContext({
          view:         'customer',
          label:        cust.display_name || 'Customer',
          customerName: cust.display_name || null,
        });
      }
      const hcs = hcRes.data || [];
      const detailAvatar = cust.logo_url
        ? `<img src="${escHtml(cust.logo_url)}" class="customer-avatar"
               style="width:52px;height:52px;border-radius:12px;object-fit:${cust.logo_scale_fit !== false ? 'contain' : 'cover'};background:var(--gray-75)" alt="">`
        : customerAvatarSVG(cust.display_name || 'Customer', 52, null, loadColor(id));

      document.getElementById('modalBody').innerHTML = `
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--gray-200)">
          ${detailAvatar}
          <div>
            <div style="font-size:17px;font-weight:600">${escHtml(cust.display_name || '—')}</div>
            <div style="font-size:13px;color:var(--gray-500);margin-top:4px">
              ${locationLabel(cust)}
            </div>
          </div>
          ${cust.avg_score != null ? `<span class="score-pill ${cust.avg_score >= 75 ? 'good' : cust.avg_score >= 50 ? 'warn' : 'poor'}" style="margin-left:auto;font-size:14px;padding:4px 12px">${cust.avg_score}</span>` : ''}
        </div>
        <div class="section-title"><span>${t('customers.hcSection', { count: hcs.length })}</span></div>
        ${hcs.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>${t('customers.thName')}</th><th>${t('customers.thPdfs')}</th><th>${t('customers.thScore')}</th><th>${t('customers.thStatus')}</th><th>${t('customers.thDate')}</th><th></th></tr></thead>
            <tbody>
              ${hcs.map(hc => `<tr style="cursor:pointer" onclick="Modal.close();App.navigate('healthchecks',{id:${hc.id}})">
                <td class="font-medium">${escHtml(hc.name)}</td>
                <td>${hc.doc_count || 0}</td>
                <td>${hc.avg_score != null ? `<span class="score-pill ${hc.avg_score >= 75 ? 'good' : hc.avg_score >= 50 ? 'warn' : 'poor'}">${hc.avg_score}</span>` : '—'}</td>
                <td><span class="status-pill status-${hc.status}">${ucFirst(hc.status)}</span></td>
                <td class="text-sm text-muted">${formatDate(hc.created_at)}</td>
                <td style="white-space:nowrap">
                  <button class="btn btn-ghost btn-sm">${t('common.view')}</button>
                  ${hc.status === 'completed' ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();Modal.close();App.navigate('report',{hcId:${hc.id}})">${t('common.report')}</button>` : ''}
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `<div class="empty-state" style="padding:24px"><h3>${t('customers.noHc')}</h3><p>${t('customers.noHcSub')}</p></div>`}`;
    } catch (e) {
      document.getElementById('modalBody').innerHTML = `<div class="connection-banner">${e.message}</div>`;
    }
  }

  async function openCustomerForm(id = null, { onCreate } = {}) {
    const isEdit = !!id;
    const _base  = isEdit ? allCustomers.find(c => c.id === id) || {} : {};
    // Merge in any locally-stored logo so the form shows the current logo
    const cust   = isEdit ? { ..._base, ...(loadLogo(id) || {}) } : _base;

    // Ensure we have vertical suggestions even when opened from another view.
    if (!allCustomers.length) {
      try { const r = await API.customers.list(); allCustomers = r.data || []; } catch {}
    }

    // ── Country options for a given region ──────────────────────────────────
    function countryOptions(region, selected) {
      const list = GEO[region] || [];
      return `<option value="">${t('customers.selectCountry')}</option>` +
        list.map(c => `<option value="${c}"${c === selected ? ' selected' : ''}>${c}</option>`).join('');
    }

    // ── State options ────────────────────────────────────────────────────────
    const stateOptions = `<option value="">${t('customers.selectState')}</option>` +
      US_STATES.map(s => `<option value="${s}"${s === (cust.state||'') ? ' selected' : ''}>${s}</option>`).join('');

    // ── Initial values ───────────────────────────────────────────────────────
    const initRegion  = cust.region  || '';
    const initCountry = cust.country || '';
    const initState   = cust.state   || '';
    const isUS        = initCountry === 'United States';

    // Avatar color: stored color for edit; shuffle-deck random accent for new (never repeats until all 8 seen).
    _avatarColor = isEdit ? loadColor(id) : _nextRandomColor();
    const initAvatarName = cust.display_name || '';
    // Picker's initial value always matches _avatarColor (never falls back to name-hash here).
    const initPickerColor = _avatarColor;

    Modal.open({
      heading: isEdit ? t('customers.formEditHeading') : t('customers.formAddHeading'),
      content: `
        <div class="form-group">
          <label class="form-label">${t('customers.formNameLabel')} <span>*</span></label>
          <input id="formName" class="form-input" placeholder="${t('customers.formNamePlaceholder')}" value="${escHtml(cust.display_name || '')}">
          <div id="formNameErr" style="color:var(--red);font-size:12px;margin-top:4px"></div>
        </div>

        <!-- Region → Country → State cascade -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">${t('customers.formRegionLabel')}</label>
            <select id="formRegion" class="form-select">
              <option value="">${t('customers.selectRegion')}</option>
              ${Object.keys(GEO).map(r =>
                `<option value="${r}"${r === initRegion ? ' selected' : ''}>${r}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">${t('customers.formCountryLabel')}</label>
            <select id="formCountry" class="form-select"
                    ${!initRegion ? 'disabled' : ''}>
              ${initRegion
                ? countryOptions(initRegion, initCountry)
                : `<option value="">${t('customers.selectRegionFirst')}</option>`}
            </select>
          </div>
        </div>

        <!-- US State — only visible when country = United States -->
        <div class="form-group" id="formStateGroup" style="${isUS ? '' : 'display:none'}">
          <label class="form-label">${t('customers.formStateLabel')} <span>*</span></label>
          <select id="formState" class="form-select">
            ${stateOptions}
          </select>
          <div id="formStateErr" style="color:var(--red);font-size:12px;margin-top:4px"></div>
        </div>

        <div class="form-group">
          <label class="form-label">${t('customers.formVerticalLabel')}</label>
          <select id="formVertical" class="form-select">
            <option value="">${t('customers.formVerticalPlaceholder')}</option>
            ${[
              'Agriculture and Forestry',
              'Advertising',
              'Construction',
              'Education - Higher Ed',
              'Education - K12',
              'Energy, Mining, Oil & Gas',
              'Financial Services',
              'Government - Federal',
              'Government - Local',
              'Government - Military',
              'Government - State',
              'Health Care',
              'Insurance',
              'Logistics / Transportation',
              'Manufacturing - Aerospace',
              'Manufacturing - Automotive',
              'Manufacturing - Consumer Goods',
              'Manufacturing - Industrial',
              'Media and Entertainment',
              'Membership Organizations',
              'Non-Profit',
              'Pharmaceuticals & Biotech',
              'Professional and Technical Services',
              'Real Estate, Rental & Leasing',
              'Retail',
              'Technology Hardware',
              'Technology Software & Services',
              'Telecommunications',
              'Transportation and Warehousing',
              'Travel, Leisure and Hospitality',
              'Utilities',
            ].map(v => `<option value="${escHtml(v)}"${cust.vertical === v ? ' selected' : ''}>${escHtml(v)}</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">${t('customers.formSegmentLabel')}</label>
          <select id="formSegment" class="form-select">
            <option value="">${t('customers.formSegmentPlaceholder')}</option>
            ${['Commercial', 'Government', 'Education']
              .map(s => `<option value="${s}"${cust.segment === s ? ' selected' : ''}>${escHtml(t('customers.segment' + s) || s)}</option>`)
              .join('')}
          </select>
        </div>

        <!-- Branding card: Avatar color + Customer logo -->
        <div style="border:1px solid var(--gray-200);border-radius:10px;overflow:hidden;margin-bottom:4px">

          <!-- Row 1: Avatar color -->
          <div style="display:flex;align-items:center;gap:14px;padding:14px 16px">
            <div id="avatarColorPreview" style="line-height:0;flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
              <div class="form-label" style="margin-bottom:8px">${t('customers.avatarColorLabel')}</div>
              <div style="display:flex;align-items:center;gap:10px">
                <input type="color" id="avatarColorInput" value="${initPickerColor}"
                  style="width:36px;height:36px;border:2px solid var(--gray-200);border-radius:8px;
                         padding:2px;cursor:pointer;background:none;flex-shrink:0">
                <button type="button" class="btn btn-ghost btn-sm" id="avatarColorReset"
                        style="${_avatarColor ? '' : 'display:none'}">${t('customers.avatarColorReset')}</button>
              </div>
            </div>
          </div>

          <!-- Divider -->
          <div style="height:1px;background:var(--gray-200)"></div>

          <!-- Row 2: Customer logo -->
          <div style="padding:14px 16px">
            <div class="form-label" style="margin-bottom:8px">${t('customers.logoLabel')}</div>
            <div class="logo-upload-wrap">
              <div class="logo-preview-box" id="logoPreviewBox">
                ${cust.logo_url
                  ? `<img id="logoPreviewImg" src="${escHtml(cust.logo_url)}"
                         style="object-fit:${cust.logo_scale_fit !== false ? 'contain' : 'cover'}">`
                  : `<span id="logoPlaceholder" class="logo-placeholder-text">
                       <svg viewBox="0 0 24 24" fill="none" style="width:28px;height:28px;opacity:.3">
                         <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
                         <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.5"/>
                         <path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                       </svg>
                     </span>`}
              </div>
              <div class="logo-upload-controls">
                <input type="file" id="logoFileInput" accept=".png,.svg,.jpg,.jpeg,.webp,image/png,image/svg+xml,image/jpeg,image/webp" style="display:none">
                <button type="button" class="btn btn-secondary btn-sm" id="logoUploadBtn">${cust.logo_url ? t('customers.logoChangeBtn') : t('customers.logoUploadBtn')}</button>
                <button type="button" class="btn btn-ghost btn-sm" id="logoRemoveBtn" style="${cust.logo_url ? '' : 'display:none'}">${t('customers.logoRemoveBtn')}</button>
                <label class="logo-scale-label" id="logoScaleWrap" style="${cust.logo_url ? '' : 'display:none'}">
                  <input type="checkbox" id="logoScaleFit" ${cust.logo_scale_fit !== false ? 'checked' : ''}>
                  <span>${t('customers.logoScaleFit')}</span>
                </label>
                <div class="logo-hint">${t('customers.logoHint')}</div>
                <div id="logoError" style="color:var(--red);font-size:12px;margin-top:2px"></div>
              </div>
            </div>
          </div>

        </div>`,
      size: '',
      actions: [
        {
          label: isEdit ? t('customers.saveBtn') : t('customers.createBtn'),
          cls: 'btn-primary',
          onClick: async () => {
            const name    = document.getElementById('formName').value.trim();
            const region  = document.getElementById('formRegion').value;
            const country = document.getElementById('formCountry').value;
            const state   = document.getElementById('formState')?.value || '';
            const vertical= document.getElementById('formVertical').value.trim();
            const segment = document.getElementById('formSegment').value;

            // Validation
            let valid = true;
            document.getElementById('formNameErr').textContent = '';
            if (document.getElementById('formStateErr'))
              document.getElementById('formStateErr').textContent = '';

            if (!name) {
              document.getElementById('formNameErr').textContent = t('customers.nameRequired');
              valid = false;
            }
            if (country === 'United States' && !state) {
              document.getElementById('formStateErr').textContent = t('customers.stateRequired');
              valid = false;
            }
            if (!valid) return;

            try {
              const logoScaleFit = document.getElementById('logoScaleFit')?.checked !== false;
              // Logo is stored locally — not sent to the backend
              const payload = { name, region, country, vertical, segment };
              if (country === 'United States' && state) payload.state = state;

              if (isEdit) {
                await API.customers.update(id, payload);
                saveLogo(id, _logoDataUrl, logoScaleFit);
                saveColor(id, _avatarColor);
              } else {
                const created = await API.customers.create(payload);
                const newId   = created.data?.id || created.id;
                saveLogo(newId, _logoDataUrl, logoScaleFit);
                saveColor(newId, _avatarColor);
                if (onCreate) onCreate({ id: newId, display_name: name, ...payload });
              }
              Modal.close();
              Toast.show(isEdit ? t('toast.customerUpdated') : t('toast.customerCreated'), 'success');
              const res = await API.customers.list();
              allCustomers = res.data || [];
              if (document.getElementById('custGrid')) {
                populateFilters(allCustomers);
                renderGrid(withLogos(allCustomers));
              }
            } catch (e) {
              Toast.show(e.message, 'error');
            }
          }
        },
        { label: t('common.cancel'), cls: 'btn-secondary', onClick: Modal.close }
      ]
    });

    // ── Avatar color picker wiring ────────────────────────────────────────────
    const colorInput   = document.getElementById('avatarColorInput');
    const colorReset   = document.getElementById('avatarColorReset');
    const colorPreview = document.getElementById('avatarColorPreview');

    function refreshAvatarPreview() {
      const name = document.getElementById('formName')?.value.trim() || '?';
      colorPreview.innerHTML = customerAvatarSVG(name, 40, null, _avatarColor);
    }

    colorInput.addEventListener('input', () => {
      _avatarColor = colorInput.value;
      colorReset.style.display = '';
      refreshAvatarPreview();
    });

    colorReset.addEventListener('click', () => {
      _avatarColor = null;
      colorReset.style.display = 'none';
      // Sync the picker back to the auto-derived color — same '?' fallback as refreshAvatarPreview
      const autoName = document.getElementById('formName')?.value.trim() || '?';
      colorInput.value = _palettePick(autoName)[1];
      refreshAvatarPreview();
    });

    document.getElementById('formName').addEventListener('input', () => {
      // If no custom color, keep the picker in sync with the auto colour
      if (!_avatarColor) {
        const n = document.getElementById('formName').value.trim() || '?';
        colorInput.value = _palettePick(n)[1];
      }
      refreshAvatarPreview();
    });

    // Render initial preview
    refreshAvatarPreview();

    // ── Wire cascading dropdowns (after Modal.open renders content) ──────────
    const regionSel = document.getElementById('formRegion');
    const countrySel= document.getElementById('formCountry');
    const stateGroup= document.getElementById('formStateGroup');
    const stateSel  = document.getElementById('formState');

    regionSel.addEventListener('change', () => {
      const r = regionSel.value;
      if (r) {
        countrySel.innerHTML = countryOptions(r, '');
        countrySel.disabled  = false;
      } else {
        countrySel.innerHTML = `<option value="">${t('customers.selectRegionFirst')}</option>`;
        countrySel.disabled  = true;
      }
      stateGroup.style.display = 'none';
      stateSel.value = '';
    });

    countrySel.addEventListener('change', () => {
      const isUS = countrySel.value === 'United States';
      stateGroup.style.display = isUS ? '' : 'none';
      if (!isUS) stateSel.value = '';
    });

    // ── Logo upload wiring ────────────────────────────────────────────────────
    _logoDataUrl = cust.logo_url || null;

    const fileInput    = document.getElementById('logoFileInput');
    const uploadBtn    = document.getElementById('logoUploadBtn');
    const removeBtn    = document.getElementById('logoRemoveBtn');
    const scaleWrap    = document.getElementById('logoScaleWrap');
    const scaleCb      = document.getElementById('logoScaleFit');
    const previewBox   = document.getElementById('logoPreviewBox');
    const errorEl      = document.getElementById('logoError');

    function refreshLogoPreview() {
      const fit = scaleCb?.checked !== false ? 'contain' : 'cover';
      let img = previewBox.querySelector('img');
      if (_logoDataUrl) {
        if (!img) {
          previewBox.innerHTML = '';
          img = document.createElement('img');
          img.id = 'logoPreviewImg';
          previewBox.appendChild(img);
        }
        img.src = _logoDataUrl;
        img.style.objectFit = fit;
        uploadBtn.textContent = t('customers.logoChangeBtn');
        removeBtn.style.display = '';
        scaleWrap.style.display  = '';
      } else {
        previewBox.innerHTML = `<span class="logo-placeholder-text">
          <svg viewBox="0 0 24 24" fill="none" style="width:28px;height:28px;opacity:.3">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg></span>`;
        uploadBtn.textContent    = t('customers.logoUploadBtn');
        removeBtn.style.display  = 'none';
        scaleWrap.style.display  = 'none';
      }
    }

    if (uploadBtn) uploadBtn.addEventListener('click', () => fileInput?.click());

    if (fileInput) fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      errorEl.textContent = '';
      const ok = ['image/png','image/svg+xml','image/jpeg','image/webp','image/gif'];
      if (!ok.includes(file.type)) { errorEl.textContent = t('customers.logoTypeError'); return; }
      if (file.size > 2 * 1024 * 1024) { errorEl.textContent = t('customers.logoSizeError'); return; }
      const reader = new FileReader();
      reader.onload = e => { _logoDataUrl = e.target.result; refreshLogoPreview(); };
      reader.readAsDataURL(file);
      fileInput.value = ''; // allow re-selecting same file
    });

    if (removeBtn) removeBtn.addEventListener('click', () => {
      _logoDataUrl = null;
      refreshLogoPreview();
    });

    if (scaleCb) scaleCb.addEventListener('change', refreshLogoPreview);
  }

  // ── Logo data URL & avatar color — reset each time the form opens ──────────
  let _logoDataUrl = null;
  let _avatarColor = null;  // hex string or null (= auto from name)

  // ── Shuffle-deck for new-customer color randomisation ────────────────────
  // Guarantees every palette is seen before any repeats, unlike pure Math.random().
  let _colorDeck = [];
  function _nextRandomColor() {
    if (!_colorDeck.length) {
      // Refill with indices 0-7 and Fisher-Yates shuffle
      _colorDeck = AVATAR_PALETTES.map((_, i) => i);
      for (let i = _colorDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [_colorDeck[i], _colorDeck[j]] = [_colorDeck[j], _colorDeck[i]];
      }
    }
    return AVATAR_PALETTES[_colorDeck.pop()][1];
  }

  // ── Delete customer confirmation ──────────────────────────────────────────
  function openDeleteConfirm(id) {
    const cust = allCustomers.find(c => c.id === id) || {};
    const name = cust.display_name || String(id);
    const count = cust.health_check_count || 0;

    const body = count > 0
      ? t('customers.deleteConfirmBody', { name: escHtml(name), count, s: count !== 1 ? 's' : '' })
      : t('customers.deleteConfirmBodyZero', { name: escHtml(name) });

    Modal.open({
      heading: t('customers.deleteConfirmHeading'),
      content: `<p style="font-size:14px;line-height:1.6;color:var(--gray-700)">${body}</p>`,
      actions: [
        {
          label: t('customers.confirmDelete'),
          cls: 'btn-danger',
          onClick: async (btn) => {
            btn.disabled = true;
            btn.textContent = t('customers.deleting');
            try {
              await API.customers.delete(id);
              Modal.close();
              Toast.show(t('customers.deleteSuccess'), 'success');
              allCustomers = allCustomers.filter(c => c.id !== id);
              deleteLogo(id);
              deleteColor(id);
              if (document.getElementById('custGrid')) renderGrid(withLogos(allCustomers));
            } catch (e) {
              btn.disabled = false;
              btn.textContent = t('customers.confirmDelete');
              Toast.show(e.message, 'error');
            }
          }
        },
        { label: t('common.cancel'), cls: 'btn-secondary', onClick: Modal.close }
      ]
    });
  }

  return { render, openCustomerDetail, openCustomerForm, customerAvatarSVG };
})();
