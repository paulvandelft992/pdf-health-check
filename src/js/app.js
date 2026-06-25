/* ── Orphaned health check cleanup ──────────────────────────────────────────── */
// Health checks stay in 'pending' status if the app was quit during a crawl.
// On next startup we delete any that are still pending (they have no documents).
async function _cleanupOrphanedHealthChecks() {
  try {
    const res = await API.healthChecks.list({ status: 'pending' });
    const pending = res.data?.health_checks || res.data || [];
    for (const hc of pending) {
      // Only delete pending HCs that have no completed/failed documents
      // (i.e. they truly never started — just orphaned from a crashed crawl)
      const docCount = (hc.total_count || 0);
      if (docCount === 0) {
        try { await API.healthChecks.delete(hc.id); } catch {}
      }
    }
  } catch {}  // silently ignore — don't break boot if this fails
}

/* ── Admin status loader ────────────────────────────────────────────────────── */
// Calls /api/me to get server-authoritative admin flag.  Runs on boot and after
// any admin sign-in / sign-out so the UI immediately reflects the correct state.
async function _loadAdminStatus() {
  try {
    const res    = await API.auth.me();
    const isAdm  = res.data?.is_admin || false;
    // If we have a stored token but the server no longer accepts it (expired or
    // revoked), clear it so stale tokens don't linger in localStorage.
    if (!isAdm && UserProfile.getAdminToken()) {
      UserProfile.clearAdminToken();
    }
    UserProfile.setAdmin(isAdm);
    _updateAdminBadge();
  } catch {
    UserProfile.setAdmin(false);
    _updateAdminBadge();
  }
}

// Show/hide the "Admin" pill in the topbar-right flex row and keep the pref-menu
// admin item label + icon in sync with the current session state.
function _updateAdminBadge() {
  // ── Topbar pill ───────────────────────────────────────────────────────────
  let badge = document.getElementById('adminBadge');
  if (UserProfile.isAdmin()) {
    if (!badge) {
      badge = document.createElement('span');
      badge.id        = 'adminBadge';
      badge.className = 'admin-badge';
      badge.textContent = t('admin.badge');
      const menu = document.getElementById('prefMenu');
      if (menu) menu.insertAdjacentElement('beforebegin', badge);
    }
  } else {
    if (badge) badge.remove();
  }

  // ── Pref-menu admin item ──────────────────────────────────────────────────
  const lbl  = document.getElementById('adminMenuLabel');
  const icon = document.getElementById('adminMenuIcon');
  if (lbl) {
    lbl.textContent = UserProfile.isAdmin()
      ? t('admin.signOut')
      : t('admin.signIn');
  }
  if (icon) {
    // Locked = sign-in state; unlocked = sign-out state
    icon.innerHTML = UserProfile.isAdmin()
      ? /* unlocked */
        `<rect x="5" y="9.5" width="10" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
         <path d="M7 9.5V7a3 3 0 0 1 6 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`
      : /* locked */
        `<rect x="5" y="9.5" width="10" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
         <path d="M7 9.5V7a3 3 0 0 1 6 0v2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`;
  }
}

/* ── Admin login modal ──────────────────────────────────────────────────────── */
let _adminLoginCallback = null;

function showAdminLoginModal(onSuccess) {
  _adminLoginCallback = onSuccess || null;
  Modal.open({
    heading: t('admin.loginHeading'),
    content: `
      <p style="font-size:13px;color:var(--gray-600);margin-bottom:20px;line-height:1.5">
        ${t('admin.loginDesc')}
      </p>
      <div class="form-group">
        <label class="form-label">${t('profile.emailLabel')}</label>
        <input id="adminLoginEmail" class="form-input" type="email" autocomplete="username"
               placeholder="you@adobe.com">
        <div id="adminLoginErr" style="color:var(--red);font-size:12px;margin-top:4px"></div>
      </div>
      <div class="form-group" style="margin-top:14px">
        <label class="form-label">${t('admin.loginPassword')}</label>
        <input id="adminLoginPwd" class="form-input" type="password"
               autocomplete="current-password" placeholder="••••••••">
      </div>`,
    size: '',
    actions: [
      { label: t('admin.loginBtn'), cls: 'btn-primary',   onClick: _doAdminLogin },
      { label: t('common.cancel'),  cls: 'btn-secondary', onClick: Modal.close   },
    ]
  });
  requestAnimationFrame(() => document.getElementById('adminLoginEmail')?.focus());
}

async function _doAdminLogin() {
  const email = document.getElementById('adminLoginEmail')?.value.trim()  || '';
  const pwd   = document.getElementById('adminLoginPwd')?.value            || '';
  const errEl = document.getElementById('adminLoginErr');
  if (errEl) errEl.textContent = '';

  if (!email || !pwd) {
    if (errEl) errEl.textContent = t('admin.loginError');
    return;
  }

  // Disable the submit button while the request is in flight
  const footer  = document.getElementById('modalFooter');
  const loginBtn = footer?.querySelector('.btn-primary');
  if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = '…'; }

  try {
    const res = await API.auth.login(email, pwd);
    UserProfile.setAdminToken(res.data?.token || '');
    await _loadAdminStatus();
    Modal.close();
    Toast.show(t('admin.loginSuccess'), 'success');
    if (_adminLoginCallback) { const cb = _adminLoginCallback; _adminLoginCallback = null; cb(); }
  } catch (err) {
    if (errEl) errEl.textContent = err.message || t('admin.loginError');
    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = t('admin.loginBtn'); }
  }
}

async function _doAdminLogout() {
  try { await API.auth.logout(); } catch { /* best-effort */ }
  UserProfile.clearAdminToken();
  await _loadAdminStatus();
  Toast.show(t('admin.logoutSuccess'), 'info');
}

/* ── Preferences entry points ───────────────────────────────────────────────── */
function initPrefMenu() {
  // Avatar chip → open Preferences modal directly (no dropdown)
  const chip = document.getElementById('userProfileChip');
  if (chip) chip.addEventListener('click', () => SettingsModal.open('profile'));

  // Sidebar settings button → open modal
  const settingsBtn = document.getElementById('settingsNavBtn');
  if (settingsBtn) settingsBtn.addEventListener('click', () => SettingsModal.open('connection'));
}

function showContactModal() {
  const emailAddr = 'pvandelft@adobe.com';   // ← update to real address

  Modal.open({
    heading: t('contact.heading'),
    content: `
      <div style="text-align:center;padding:4px 0 20px">
        <div class="contact-avatar">
          <img src="assets/images/pvd.png" id="mepp">
        </div>
        <div style="font-size:18px;font-weight:700;color:var(--gray-900);margin-bottom:3px">Paul van Delft</div>
        <div style="font-size:13px;color:var(--gray-500)">${t('contact.role')}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="contact-link" onclick="
          if(window.electronAPI) window.electronAPI.openExternal('mailto:${emailAddr}');
          else window.open('mailto:${emailAddr}');
        ">
          <svg viewBox="0 0 20 20" fill="none">
            <rect x="2" y="5" width="16" height="12" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M2 8l8 5 8-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <div>
            <div class="contact-link-title">${t('contact.title')}</div>
            <div class="contact-link-sub">${emailAddr}</div>
          </div>
        </button>
        <button class="contact-link" onclick="
          if(window.electronAPI) window.electronAPI.openExternal('https://teams.microsoft.com');
          else window.open('https://teams.microsoft.com');
        ">
          <svg viewBox="0 0 20 20" fill="none">
            <rect x="2" y="3" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M14 7h2a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M7 8v4M9 8v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <div>
            <div class="contact-link-title">${t('contact.teamsTitle')}</div>
            <div class="contact-link-sub">${t('contact.teamsSub')}</div>
          </div>
        </button>
      </div>`,
    actions: [
      { label: t('common.close'), cls: 'btn-secondary', onClick: () => Modal.close() }
    ]
  });
}

/* ── Feedback Modal ─────────────────────────────────────────────────────────── */
function _openFeedbackModal() {
  const emailAddr = 'pvandelft@adobe.com';
  Modal.open({
    heading: 'Share Feedback',
    content: `
      <div style="display:flex;flex-direction:column;gap:14px">
        <p style="margin:0;font-size:13px;color:var(--gray-600)">Found a bug or have an idea? Let us know — your feedback shapes the next release.</p>
        <div>
          <div style="font-size:12px;font-weight:600;color:var(--gray-700);margin-bottom:6px">Type</div>
          <div style="display:flex;gap:8px">
            <button class="feedback-type-btn active" data-type="bug">Bug report</button>
            <button class="feedback-type-btn" data-type="feature">Feature request</button>
            <button class="feedback-type-btn" data-type="general">General</button>
          </div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:600;color:var(--gray-700);margin-bottom:6px">Message</div>
          <textarea id="feedbackText" rows="5" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--gray-200);border-radius:8px;font-size:13px;color:var(--gray-900);background:var(--bg-surface);resize:vertical;font-family:inherit" placeholder="Describe the issue or idea…"></textarea>
        </div>
      </div>
    `,
    actions: [
      { label: 'Cancel',  cls: 'btn-secondary', onClick: Modal.close },
      {
        label: 'Send',
        cls:   'btn-primary',
        onClick() {
          const type = document.querySelector('.feedback-type-btn.active')?.dataset.type || 'general';
          const text = document.getElementById('feedbackText')?.value.trim() || '';
          if (!text) {
            document.getElementById('feedbackText')?.focus();
            return;
          }
          const subject = encodeURIComponent(`[HC App] ${type.charAt(0).toUpperCase() + type.slice(1)}: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`);
          const body    = encodeURIComponent(`Type: ${type}\n\n${text}\n\n---\nSent from PDF Health Check Beta`);
          window.open(`mailto:${emailAddr}?subject=${subject}&body=${body}`, '_blank');
          Modal.close();
        },
      },
    ],
  });
  requestAnimationFrame(() => {
    document.querySelectorAll('.feedback-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.feedback-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  });
}

/* ── Keyboard Shortcuts ─────────────────────────────────────────────────────── */
const _isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const _mod   = _isMac ? '⌘' : 'Ctrl';

// Shortcut definitions — grouped for the modal and matched by the keydown handler.
const SHORTCUTS_DEF = [
  {
    group: 'shortcuts.groupNav',
    items: [
      { keys: [_mod, '1'],        label: 'shortcuts.dashboard' },
      { keys: [_mod, '2'],        label: 'shortcuts.customers' },
      { keys: [_mod, '3'],        label: 'shortcuts.healthChecks' },
      { keys: [_mod, '4'],        label: 'shortcuts.reports' },
      { keys: [_mod, '5'],        label: 'shortcuts.executive' },
      { keys: [_mod, ','],        label: 'shortcuts.settings' },
    ],
  },
  {
    group: 'shortcuts.groupCreate',
    items: [
      { keys: [_mod, 'N'],        label: 'shortcuts.createMenu' },
      { keys: [_mod, '⇧', 'C'],  label: 'shortcuts.newCustomer' },
      { keys: [_mod, '⇧', 'H'],  label: 'shortcuts.newHealthCheck' },
    ],
  },
  {
    group: 'shortcuts.groupUI',
    items: [
      { keys: [_mod, 'K'],        label: 'shortcuts.search'        },
      { keys: ['\\'],             label: 'shortcuts.sidebar'       },
      { keys: ['?'],              label: 'shortcuts.showShortcuts' },
    ],
  },
  {
    group: 'shortcuts.groupAI',
    items: [
      { keys: [_mod, '⇧', 'A'],  label: 'shortcuts.aiChat' },
    ],
  },
];

function showShortcutsModal() {
  const rows = (items) => items.map(s => `
    <div class="shortcut-row">
      <span class="shortcut-desc">${t(s.label)}</span>
      <span class="shortcut-keys">${s.keys.map(k => `<kbd class="shortcut-kbd">${k}</kbd>`).join('')}</span>
    </div>`).join('');

  const sections = SHORTCUTS_DEF.map(g => `
    <div class="shortcut-group">
      <div class="shortcut-group-title">${t(g.group)}</div>
      ${rows(g.items)}
    </div>`).join('');

  Modal.open({
    heading: t('shortcuts.modalTitle'),
    content: `<div class="shortcut-modal-body">${sections}</div>`,
    size: 'modal-sm',
    actions: [{ label: t('common.close'), cls: 'btn-secondary', onClick: Modal.close }],
  });
}

// ── Global keyboard shortcut handler ────────────────────────────────────────
function initShortcuts(navigate, openCreateMenu, createHcItem, createCustomerItem) {
  const isTyping = () => {
    const tag = document.activeElement?.tagName || '';
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || document.activeElement?.isContentEditable;
  };

  document.addEventListener('keydown', e => {
    const meta  = e.metaKey || e.ctrlKey;
    const shift = e.shiftKey;
    const k     = e.key;

    // ── Navigation (⌘ + digit or comma) ─────────────────────────────────────
    if (meta && !shift && !e.altKey) {
      if (k === '1') { e.preventDefault(); navigate('dashboard');    return; }
      if (k === '2') { e.preventDefault(); navigate('customers');    return; }
      if (k === '3') { e.preventDefault(); navigate('healthchecks'); return; }
      if (k === '4') { e.preventDefault(); navigate('reports');      return; }
      if (k === '5') { e.preventDefault(); navigate('exec');            return; }
      if (k === '6') { e.preventDefault(); navigate('report-builder'); return; }
      if (k === ',') { e.preventDefault(); SettingsModal.open('connection'); return; }
    }

    // ── Create (⌘+N / ⌘+⇧+C / ⌘+⇧+H) ──────────────────────────────────────
    if (meta && !e.altKey) {
      if (k === 'n' && !shift) { e.preventDefault(); openCreateMenu(); return; }
      if (k === 'c' &&  shift) { e.preventDefault(); createCustomerItem(); return; }
      if (k === 'h' &&  shift) { e.preventDefault(); createHcItem();       return; }
    }

    // ── AI Chat (⌘+⇧+A) ─────────────────────────────────────────────────────
    if (meta && shift && !e.altKey) {
      if (k === 'a' || k === 'A') {
        e.preventDefault();
        if (typeof YukonChat !== 'undefined') YukonChat.toggle();
        return;
      }
    }

    // ── Bare-key shortcuts (skip when typing in a form field) ───────────────
    if (!meta && !e.altKey && !isTyping()) {
      if (k === '\\') { e.preventDefault(); document.getElementById('sidebarCollapse')?.click(); return; }
      if (k === '?')  { e.preventDefault(); SettingsModal.open('shortcuts'); return; }
    }
  });
}

/* ── Chrome Extension modal ─────────────────────────────────────────────────── */
function showExtensionModal() {
  const isElectron = !!window.electronAPI;
  Modal.open({
    heading: t('ext.modalHeading'),
    content: `
      <div style="display:flex;flex-direction:column;gap:16px">
        <p style="font-size:13px;color:var(--gray-600);line-height:1.6">
          ${t('ext.modalDesc')}
        </p>
        <div style="background:var(--gray-75);border-radius:8px;padding:14px;font-size:12px;color:var(--gray-700);line-height:1.8">
          <div style="font-weight:700;margin-bottom:8px;font-size:13px">${t('ext.installSteps')}</div>
          <ol style="padding-left:18px;display:flex;flex-direction:column;gap:4px">
            <li>${t('ext.step1')}</li>
            <li>${t('ext.step2')}</li>
            <li>${t('ext.step3')}</li>
            <li>${t('ext.step4')}</li>
          </ol>
        </div>
        <div style="font-size:12px;color:var(--gray-500);display:flex;align-items:flex-start;gap:8px">
          <svg viewBox="0 0 16 16" fill="none" style="width:13px;height:13px;flex-shrink:0;margin-top:1px">
            <path d="M8 1v9M4.5 6.5L8 10l3.5-3.5M2 13h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>${t('ext.revealHint')}</span>
        </div>
      </div>`,
    actions: [
      {
        label: t('ext.revealBtn'),
        cls: 'btn-primary',
        onClick: async () => {
          if (isElectron) {
            try {
              const errMsg = await window.electronAPI.revealExtension();
              if (errMsg) {
                // shell.openPath returns non-empty string on failure
                Toast.show(t('ext.revealFailed'), 'warning');
              } else {
                Toast.show(t('ext.revealedToast'), 'success');
                Modal.close();
              }
            } catch {
              Toast.show(t('ext.revealFailed'), 'error');
            }
          }
        }
      },
      { label: t('common.close'), cls: 'btn-secondary', onClick: Modal.close }
    ]
  });
}

/* ── Global search with live dropdown ──────────────────────────────────────── */
function initSearch() {
  const input    = document.getElementById('globalSearch');
  const dropdown = document.getElementById('searchDropdown');
  if (!input || !dropdown) return;

  let debounceTimer = null;
  let activeIdx     = -1;

  // ── Helpers ──────────────────────────────────────────────────────────────
  function close() {
    dropdown.classList.remove('is-open');
    activeIdx = -1;
  }
  function open() { dropdown.classList.add('is-open'); }

  function getItems() { return [...dropdown.querySelectorAll('.search-result-item')]; }

  function setActive(idx) {
    const items = getItems();
    if (!items.length) return;
    activeIdx = Math.max(-1, Math.min(idx, items.length - 1));
    items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
    if (activeIdx >= 0) items[activeIdx].scrollIntoView({ block: 'nearest' });
  }

  // Wrap query matches in <mark> for highlight
  function highlight(html, q) {
    if (!q) return html;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return html.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
  }

  // ── Event listeners ───────────────────────────────────────────────────────
  input.addEventListener('keydown', e => {
    if (!dropdown.classList.contains('is-open')) return;
    if (e.key === 'ArrowDown')  { e.preventDefault(); setActive(activeIdx + 1); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(activeIdx - 1); }
    else if (e.key === 'Enter')     { e.preventDefault(); getItems()[activeIdx]?.click(); }
    else if (e.key === 'Escape')    { close(); input.blur(); }
  });

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (!q) { close(); return; }
    dropdown.innerHTML = `<div class="search-loading">${t('search.loading')}</div>`;
    open();
    debounceTimer = setTimeout(() => performSearch(q), 180);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim()) performSearch(input.value.trim());
  });

  document.addEventListener('click', e => {
    if (!input.closest('.search-wrap')?.contains(e.target)) close();
  });

  document.addEventListener('keydown', e => {
    // Cmd/Ctrl+K to focus search from anywhere
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  // ── Search execution ──────────────────────────────────────────────────────
  async function performSearch(q) {
    if (!q) { close(); return; }
    try {
      const [cusRes, hcRes] = await Promise.all([
        API.customers.list().catch(() => ({ data: [] })),
        API.healthChecks.list({ all: 1 }).catch(() => ({ data: [] }))
      ]);

      const customers    = cusRes.data  || [];
      const healthChecks = hcRes.data   || [];
      const ql           = q.toLowerCase();

      const matchedCustomers = customers.filter(c =>
        (c.display_name || '').toLowerCase().includes(ql) ||
        (c.company_name || '').toLowerCase().includes(ql) ||
        (c.country || '').toLowerCase().includes(ql) ||
        (c.vertical || '').toLowerCase().includes(ql)
      ).slice(0, 5);

      const matchedHCs = healthChecks.filter(hc =>
        (hc.name || '').toLowerCase().includes(ql) ||
        (hc.customer_name || '').toLowerCase().includes(ql)
      ).slice(0, 5);

      // DR numbers are a distinct result type so users can find a deal quickly
      const matchedDRs = healthChecks.filter(hc =>
        hc.dr_number && hc.dr_number.toLowerCase().includes(ql)
      ).slice(0, 4);

      // Reports — only completed HCs, navigate straight to the PDF report view
      const hcIdsAlreadyShown = new Set(matchedHCs.map(h => h.id));
      const matchedReports = healthChecks.filter(hc =>
        hc.status === 'completed' &&
        !hcIdsAlreadyShown.has(hc.id) &&
        ((hc.name || '').toLowerCase().includes(ql) ||
         (hc.customer_name || '').toLowerCase().includes(ql))
      ).slice(0, 4);

      renderDropdown({ customers: matchedCustomers, hcs: matchedHCs, drs: matchedDRs, reports: matchedReports, q });
    } catch {
      dropdown.innerHTML = `<div class="search-empty">${t('search.unavailable')}</div>`;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function renderDropdown({ customers, hcs, drs, reports, q }) {
    const hl = s => highlight(escHtml(s || ''), q);
    const sections = [];

    if (customers.length) sections.push(`
      <div class="search-section-label">${t('search.sectionCustomers')}</div>
      ${customers.map(c => `
        <div class="search-result-item" data-action="customer" data-id="${c.id}">
          <div class="sri-icon sri-icon--customer">
            <svg viewBox="0 0 14 14" fill="none">
              <rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
              <path d="M4.5 9.5c0-1.8 1.2-2.5 2.5-2.5s2.5.7 2.5 2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              <circle cx="7" cy="5.5" r="1.3" stroke="currentColor" stroke-width="1.2"/>
            </svg>
          </div>
          <div class="sri-text">
            <div class="sri-title">${hl(c.display_name || c.company_name)}</div>
            <div class="sri-sub">${[c.vertical, c.region, c.country].filter(Boolean).map(escHtml).join(' · ') || t('search.subCustomer')}</div>
          </div>
        </div>`).join('')}`);

    if (hcs.length) sections.push(`
      <div class="search-section-label">${t('search.sectionHc')}</div>
      ${hcs.map(hc => `
        <div class="search-result-item" data-action="healthcheck" data-id="${hc.id}">
          <div class="sri-icon sri-icon--hc">
            <svg viewBox="0 0 14 14" fill="none">
              <rect x="1.5" y="0.5" width="11" height="13" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
              <path d="M4 4.5h6M4 7h6M4 9.5h3" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="sri-text">
            <div class="sri-title">${hl(hc.name)}</div>
            <div class="sri-sub">
              ${escHtml(hc.customer_name || '—')}
              <span class="status-pill status-${hc.status}" style="font-size:9px;padding:1px 5px;line-height:1.4">${ucFirst(hc.status)}</span>
              ${hc.dr_number ? `<span style="color:var(--accent);font-weight:600">${escHtml(hc.dr_number)}</span>` : ''}
            </div>
          </div>
        </div>`).join('')}`);

    if (drs.length) sections.push(`
      <div class="search-section-label">${t('search.sectionDr')}</div>
      ${drs.map(hc => `
        <div class="search-result-item" data-action="healthcheck" data-id="${hc.id}">
          <div class="sri-icon sri-icon--dr">
            <svg viewBox="0 0 14 14" fill="none">
              <rect x="1.5" y="0.5" width="11" height="13" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
              <path d="M4 4.5h3M4 7h4M4 9.5h5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
              <path d="M9 11l1.5 1.5L12 10" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="sri-text">
            <div class="sri-title" style="color:var(--accent)">${hl(hc.dr_number)}</div>
            <div class="sri-sub">${escHtml(hc.name)} · ${escHtml(hc.customer_name || '—')}</div>
          </div>
        </div>`).join('')}`);

    if (reports.length) sections.push(`
      <div class="search-section-label">${t('search.sectionReports')}</div>
      ${reports.map(hc => `
        <div class="search-result-item" data-action="report" data-id="${hc.id}">
          <div class="sri-icon sri-icon--report">
            <svg viewBox="0 0 14 14" fill="none">
              <rect x="1.5" y="0.5" width="11" height="13" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
              <path d="M4 4.5h6M4 7h6M4 9.5h4" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
              <path d="M8 11.5l1.2 1.2 2-2" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="sri-text">
            <div class="sri-title">${hl(hc.name)}</div>
            <div class="sri-sub">${escHtml(hc.customer_name || '—')} · ${t('search.subScore', { score: hc.avg_score ?? '—' })}</div>
          </div>
        </div>`).join('')}`);

    if (!sections.length) {
      dropdown.innerHTML = `<div class="search-empty">${t('search.noResults', { q: escHtml(q) })}</div>`;
      open();
      return;
    }

    dropdown.innerHTML = sections.join('<div class="search-divider"></div>');
    open();
    activeIdx = -1;

    getItems().forEach((item, idx) => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        const id     = +item.dataset.id;
        close();
        input.value = '';
        if      (action === 'customer')    App.navigate('customers');
        else if (action === 'healthcheck') App.navigate('healthchecks', { id });
        else if (action === 'report')      App.navigate('report', { hcId: id });
      });
      item.addEventListener('mouseenter', () => {
        getItems().forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        activeIdx = idx;
      });
    });
  }
}

/* Main app controller */
const App = (() => {
  let currentView = '';
  let currentParams = {};

  const views = {
    dashboard:        DashboardView,
    customers:        CustomersView,
    healthchecks:     HealthCheckView,
    reports:          ReportsView,
    'report-builder': ReportBuilderView,
    exec:             ExecView,
    'exec-report':    ExecReportView,
    report:           CustomerReportView,
  };

  async function init() {
    // Apply saved theme immediately — before anything renders to avoid flash
    await ThemeManager.init();

    // Initialise i18n and re-render the current view on language change
    I18n.init();
    document.addEventListener('i18n:changed', () => {
      const view = App.getCurrentView();
      if (view) App.navigate(view, App.getParams());
    });

    // Set platform class
    if (window.electronAPI) {
      const p = window.electronAPI.platform;
      document.body.classList.remove('platform-mac');
      // process.platform returns 'darwin' on macOS — normalise to 'mac' for CSS
      document.body.classList.add(p === 'darwin' ? 'platform-mac' : 'platform-' + p);
    }

    // Load saved settings and initialise API.
    // APP_CONFIG (app-config.js, gitignored) provides hardcoded backend credentials
    // so users never need to configure the connection themselves.
    let settings = {};
    if (window.electronAPI) {
      settings = await window.electronAPI.getSettings() || {};
    }

    // Restore user profile from settings.json if localStorage is missing it.
    // localStorage can be cleared between sessions in Electron (especially in
    // dev mode), so settings.json is the authoritative persistent store.
    if (settings.userProfile && !UserProfile.isConfigured()) {
      UserProfile.set(settings.userProfile);
    }

    const backendUrl = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.backendUrl)
      ? APP_CONFIG.backendUrl
      : (settings.backendUrl || '');
    const apiKey = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.apiKey)
      ? APP_CONFIG.apiKey
      : (settings.apiKey || '');
    if (backendUrl) {
      API.init(backendUrl, apiKey);
      _loadAdminStatus();
    }
    if (typeof Yukon !== 'undefined') Yukon.configure(settings);

    // Initialise header upload indicator
    UploadProgress.init();

    // Clean up health checks that were left in 'pending' status from a previous
    // session (e.g. the app was quit while a crawl was running).
    if (backendUrl && apiKey) {
      _cleanupOrphanedHealthChecks();
    }

    // Initialise preferences menu (theme switcher + contact + profile)
    initPrefMenu();

    // Render current profile state in topbar chip
    UserProfile.updateTopbarChip();

    // Nav click handler — only items with data-view trigger navigation
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        navigate(item.dataset.view);
      });
    });

    // Settings nav button label + tooltip
    const settingsNavBtn = document.getElementById('settingsNavBtn');
    if (settingsNavBtn) {
      const settingsLabel = t('nav.settings') || 'Settings';
      const settingsSpan = settingsNavBtn.querySelector('span');
      if (settingsSpan) settingsSpan.textContent = settingsLabel;
      settingsNavBtn.dataset.tip = settingsLabel;
    }

    // Set nav item text from i18n and keep data-tip in sync for collapsed tooltips
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      const key  = `nav.${item.dataset.view}`;
      const span = item.querySelector('span');
      const label = t(key);
      if (span) span.textContent = label;
      item.dataset.tip = label;
    });
    // ── "Create new" dropdown ────────────────────────────────────────────
    const createBtn      = document.getElementById('createBtn');
    const createDropdown = document.getElementById('createDropdown');

    // Update button and dropdown labels from i18n
    const createBtnLabel = createBtn.querySelector('.create-btn-label');
    const createNewLabel = t('common.createNew') || 'Create new';
    if (createBtnLabel) createBtnLabel.textContent = createNewLabel;
    createBtn.dataset.tip = createNewLabel;  // collapsed sidebar tooltip
    const createHcSpan = document.querySelector('#createHcItem span');
    if (createHcSpan) createHcSpan.textContent = t('common.newHealthCheck') || 'New Health Check';
    const createCustSpan = document.querySelector('#createCustomerItem span');
    if (createCustSpan) createCustSpan.textContent = t('common.newCustomer') || 'New Customer';

    function openCreateMenu() {
      createDropdown.classList.add('open');
      // Trigger CSS transition on next frame
      requestAnimationFrame(() => createDropdown.classList.add('visible'));
      createBtn.setAttribute('aria-expanded', 'true');
      createDropdown.removeAttribute('aria-hidden');
    }

    function closeCreateMenu() {
      createDropdown.classList.remove('visible');
      createBtn.setAttribute('aria-expanded', 'false');
      createDropdown.setAttribute('aria-hidden', 'true');
      // Remove 'open' after transition ends
      const onEnd = () => { createDropdown.classList.remove('open'); createDropdown.removeEventListener('transitionend', onEnd); };
      createDropdown.addEventListener('transitionend', onEnd);
    }

    createBtn.addEventListener('click', e => {
      e.stopPropagation();
      createDropdown.classList.contains('visible') ? closeCreateMenu() : openCreateMenu();
    });

    document.getElementById('createHcItem').addEventListener('click', () => {
      closeCreateMenu();
      navigate('healthchecks', { action: 'new' });
    });

    document.getElementById('createCustomerItem').addEventListener('click', () => {
      closeCreateMenu();
      // openCustomerForm fetches its own data if needed — works from any view.
      // Use typeof check (not window.*) because top-level const isn't on window.
      if (typeof CustomersView !== 'undefined') {
        CustomersView.openCustomerForm();
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', e => {
      if (createDropdown.classList.contains('visible') &&
          !document.getElementById('createBtnWrap').contains(e.target)) {
        closeCreateMenu();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && createDropdown.classList.contains('visible')) {
        closeCreateMenu();
        createBtn.focus();
      }
    });

    // Sidebar collapse
    const sidebar = document.getElementById('sidebar');

    // Restore saved collapse state instantly — no transition on initial load
    if (localStorage.getItem('sidebarCollapsed') === '1') {
      sidebar.classList.add('no-transition', 'collapsed');
      // Remove the suppressor after the browser has painted the initial state
      requestAnimationFrame(() => requestAnimationFrame(() => {
        sidebar.classList.remove('no-transition');
      }));
    }

    document.getElementById('sidebarCollapse').onclick = () => {
      const isNowCollapsed = sidebar.classList.toggle('collapsed');
      localStorage.setItem('sidebarCollapsed', isNowCollapsed ? '1' : '0');
      // Close create menu if open when collapsing
      if (createDropdown.classList.contains('visible')) closeCreateMenu();
    };

    // Global search — live dropdown with keyboard navigation
    initSearch();

    // Show platform-correct shortcut hint inside the search bar
    const searchHint = document.getElementById('searchShortcutHint');
    if (searchHint) searchHint.textContent = _isMac ? '⌘K' : 'Ctrl K';

    // Adobe Yukon AI chat — floating button + chat panel
    if (typeof YukonChat !== 'undefined') YukonChat.init();

    // Feedback button in topbar
    const feedbackBtn = document.getElementById('feedbackBtn');
    if (feedbackBtn) feedbackBtn.addEventListener('click', () => _openFeedbackModal());

    // Global keyboard shortcuts
    initShortcuts(
      navigate,
      openCreateMenu,
      () => { closeCreateMenu(); navigate('healthchecks', { action: 'new' }); },
      () => { closeCreateMenu(); if (typeof CustomersView !== 'undefined') CustomersView.openCustomerForm(); }
    );

    // Start on dashboard (or settings if no backend configured)
    // If profile hasn't been set up yet, prompt the user before loading data.
    if (!backendUrl) {
      navigate('settings');
      Toast.show(t('toast.configureBackend'), 'info', 5000);
    } else if (!UserProfile.isConfigured()) {
      navigate('dashboard');   // load dashboard shell in background
      UserProfile.showSetupModal({
        allowCancel: false,    // first-run: must complete profile
        onSave: () => {
          // Reload the current view so data scoped to the new email is fetched
          navigate('dashboard');
          // First time ever — always show the tour after profile setup
          Tour.reset();
          Tour.startIfNew();
        }
      });
    } else {
      navigate('dashboard');
      // Returning user who has never seen the tour (e.g. upgrade)
      Tour.startIfNew();
    }
  }

  function navigate(view, params = {}) {
    if (!views[view]) return;
    currentView   = view;
    currentParams = params;

    // Clear Yukon chat context when navigating to non-detail views.
    // Views that show specific HC / customer detail will call setContext() themselves.
    const contextualViews = new Set(['healthchecks', 'customers', 'report']);
    if (!contextualViews.has(view) && typeof YukonChat !== 'undefined') {
      YukonChat.setContext(null);
    }

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });

    const container = document.getElementById('viewContainer');
    container.innerHTML = '';

    // Always catch the render promise — async views must never produce an
    // unhandled rejection, even if their internal try-catch has a gap.
    Promise.resolve(views[view].render(container, params)).catch(err => {
      console.error(`[App] Unhandled error rendering view "${view}":`, err);
      container.innerHTML = `
        <div class="connection-banner">
          <svg viewBox="0 0 16 16" fill="none" style="width:15px;height:15px;flex-shrink:0">
            <path d="M8 2L15 14H1L8 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="M8 6.5v3M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          ${escHtml(err.message || t('error.failedView'))}
          &ensp;<button class="btn btn-ghost btn-sm" onclick="App.navigate('${view}')">${t('error.retry')}</button>
        </div>`;
    });
  }

  function getCurrentView() { return currentView; }
  function getParams()       { return currentParams; }

  return { init, navigate, getCurrentView, getParams };
})();

/* ── Global helpers (available in all view modules) ─────────── */
function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ucFirst(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Global safety net — log every unhandled rejection with stack trace so we
// can identify the exact source if any slip through view-level try-catch blocks.
window.addEventListener('unhandledrejection', event => {
  console.error('[App] Unhandled promise rejection:', event.reason);
  // Prevent the generic DevTools "Uncaught (in promise)" message from also
  // firing — our log above already has the full stack.
  event.preventDefault();
});

// ── Electron drag guards ──────────────────────────────────────────────────────
// 1. Expose `dragEvent` as a global. Chromium's internal drag-region handler
//    (used by -webkit-app-region: drag on the topbar) references this global
//    when the user drags the window; without it a ReferenceError fires.
// 2. Prevent accidental file drops anywhere outside the upload zone from
//    navigating Electron to file:///… and blanking the app.
window.dragEvent = null;
window.addEventListener('dragover', e => { window.dragEvent = e; e.preventDefault(); });
window.addEventListener('drop',     e => { window.dragEvent = e; e.preventDefault(); });

// Boot — catch any error from async App.init() so it never becomes an
// unhandled rejection (DOMContentLoaded ignores the returned promise).
document.addEventListener('DOMContentLoaded', () => {
  App.init().catch(err => {
    console.error('[App] Boot error:', err);
  });
  _initUpdateListeners();
  _initMenuListeners();
});

/* ── Auto-update listeners ───────────────────────────────────────────────────── */
function _initUpdateListeners() {
  if (!window.electronAPI) return;

  // A new version has been found and is downloading in the background
  window.electronAPI.onUpdateAvailable((info) => {
    Toast.show(`Version ${info.version} is downloading in the background…`, 'info', 6000);
  });

  // Download complete — show a persistent banner with install button
  window.electronAPI.onUpdateDownloaded((info) => {
    const bar = document.createElement('div');
    bar.id = 'updateBar';
    bar.innerHTML = `
      <span>Version <strong>${info.version}</strong> is ready to install.</span>
      <div style="display:flex;gap:8px;align-items:center">
        <button id="updateBarWhatsNew" style="background:none;border:none;color:inherit;text-decoration:underline;cursor:pointer;font-size:inherit;padding:0">What's new</button>
        <button id="updateBarInstall" style="padding:4px 14px;border-radius:6px;border:none;background:white;color:#1a6cf0;font-weight:600;font-size:12px;cursor:pointer">Restart &amp; Update</button>
        <button id="updateBarDismiss" style="background:none;border:none;color:inherit;opacity:.7;cursor:pointer;font-size:16px;line-height:1;padding:0 4px">&times;</button>
      </div>`;
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#1a6cf0;color:white;font-size:13px;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;z-index:10000;gap:12px';
    document.body.appendChild(bar);
    document.getElementById('updateBarInstall').onclick  = () => window.electronAPI.updateInstallNow();
    document.getElementById('updateBarDismiss').onclick  = () => bar.remove();
    document.getElementById('updateBarWhatsNew').onclick = () => { _showWhatsNewModal(info.version); };
  });
}

/* ── OS menu-bar action listener ─────────────────────────────────────────────── */
function _initMenuListeners() {
  if (!window.electronAPI?.onMenuAction) return;

  window.electronAPI.onMenuAction((action) => {
    // toast:message shorthand used by Check for Updates
    if (action.startsWith('toast:')) {
      Toast.show(action.slice(6), 'info', 4000);
      return;
    }

    switch (action) {
      case 'nav:dashboard':       App.navigate('dashboard');      break;
      case 'nav:customers':       App.navigate('customers');      break;
      case 'nav:healthchecks':    App.navigate('healthchecks');   break;
      case 'nav:reports':         App.navigate('reports');        break;
      case 'nav:executive':       App.navigate('exec');           break;
      case 'nav:ai-chat':         App.navigate('healthchecks'); document.querySelector('[data-action="ai"]')?.click(); break;
      case 'nav:search':          document.getElementById('globalSearchBtn')?.click(); break;
      case 'nav:toggle-sidebar':  document.querySelector('.sidebar')?.classList.toggle('collapsed'); break;
      case 'nav:settings':        SettingsModal.open('connection'); break;
      case 'nav:shortcuts':       SettingsModal.open('shortcuts'); break;
      case 'nav:guide':           SettingsModal.open('guide');    break;
      case 'nav:whats-new':       SettingsModal.open('whats-new'); break;
      case 'nav:feedback':        _openFeedbackModal();           break;
      case 'nav:new-healthcheck':   App.navigate('healthchecks',     { action: 'new' }); break;
      case 'nav:report-builder':    App.navigate('report-builder');  break;
      case 'nav:new-report':        App.navigate('report-builder',   { action: 'new' }); break;
      case 'nav:new-customer':
        if (typeof CustomersView !== 'undefined') CustomersView.openCustomerForm();
        break;
    }
  });
}

function _showWhatsNewModal(highlightVersion) {
  let releases = [];
  try { releases = window.__RELEASES__ || []; } catch { releases = []; }

  const items = releases.map(r => {
    const isNew = r.version === highlightVersion;
    return `
      <div style="margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:15px;font-weight:700;color:var(--gray-900)">${r.version}</span>
          ${r.tag ? `<span style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:10px;background:${isNew ? 'var(--accent)' : 'var(--gray-100)'};color:${isNew ? 'white' : 'var(--gray-500)'}">${r.tag}</span>` : ''}
          <span style="font-size:11px;color:var(--gray-400);margin-left:auto">${r.date}</span>
        </div>
        <ul style="margin:0;padding-left:18px;color:var(--gray-700);font-size:13px;line-height:1.7">
          ${r.notes.map(n => `<li>${n}</li>`).join('')}
        </ul>
      </div>`;
  }).join('');

  Modal.open({
    heading: "What's New",
    size: 'large',
    content: `<div style="max-height:60vh;overflow-y:auto;padding-right:4px">${items || '<p style="color:var(--gray-500)">No release notes available.</p>'}</div>`,
    actions: [{ label: 'Close', cls: 'btn-secondary', onClick: Modal.close }],
  });
}
