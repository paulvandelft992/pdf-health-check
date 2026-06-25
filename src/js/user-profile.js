/* User Profile — stores Adobe consultant identity in localStorage.
 *
 * No authentication is required. Identity is self-declared and stored locally.
 * The email address is sent as X-User-Email on every API request, which the
 * backend uses to scope customers and health checks to the owning consultant.
 *
 * Access via: UserProfile.get() / .getEmail() / .showSetupModal() / etc.
 */
const UserProfile = (() => {
  const KEY       = 'hcapp_user_profile';
  const TOKEN_KEY = 'hcapp_admin_token';

  // Spectrum-aligned palette (matches Customers view)
  const COLORS = ['#1473E6','#2D9D78','#E68619','#9B59B6','#E34850','#00B5CC','#E67E22','#378EF0'];
  function avatarColor(name) {
    if (!name) return COLORS[0];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return COLORS[h % COLORS.length];
  }

  // ── Admin session token — persisted in localStorage ──────────────────────────
  // The token is obtained by authenticating via POST /api/auth/login and is sent
  // as X-Admin-Token on every request.  The server validates it against the
  // admin_sessions table; if valid, is_admin is true in the /api/me response.
  function getAdminToken()      { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setAdminToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else       localStorage.removeItem(TOKEN_KEY);
  }
  function clearAdminToken()    { localStorage.removeItem(TOKEN_KEY); }

  // ── Admin status (set from server response on boot, not stored locally) ─────
  // Kept in memory only — the server is the authority on who is an admin.
  let _isAdmin = false;
  function setAdmin(val) { _isAdmin = !!val; }
  function isAdmin()     { return _isAdmin; }

  // ── Storage ─────────────────────────────────────────────────────────────────
  function get() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; }
    catch { return null; }
  }

  function set(profile) {
    localStorage.setItem(KEY, JSON.stringify(profile));
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  function isConfigured() {
    const p = get();
    return !!(p && p.email && p.firstName && p.lastName);
  }

  // ── Accessors ────────────────────────────────────────────────────────────────
  function getEmail()     { return get()?.email     || ''; }
  function getFirstName() { return get()?.firstName || ''; }
  function getLastName()  { return get()?.lastName  || ''; }
  function getFullName()  {
    const p = get();
    return p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : '';
  }
  function getInitials() {
    const p = get();
    if (!p) return '?';
    return [(p.firstName||'')[0], (p.lastName||'')[0]].filter(Boolean).join('').toUpperCase() || '?';
  }

  // ── Topbar chip ──────────────────────────────────────────────────────────────
  // Called whenever the profile changes or on app boot to reflect current state.
  function updateTopbarChip() {
    const chip = document.getElementById('userProfileChip');
    if (!chip) return;
    const p = get();
    if (p) {
      chip.textContent     = getInitials();
      chip.title           = `${getFullName()} · ${p.email}\n${t('profile.chipEdit')}`;
      chip.style.background = avatarColor(getFullName());
    } else {
      chip.textContent     = '?';
      chip.title           = t('profile.chipSetup');
      chip.style.background = 'var(--gray-300)';
    }
  }

  // ── First-run setup modal (no tabs — must complete profile) ─────────────────
  // opts.onSave(profile)  — called after a successful save
  // opts.allowCancel      — show Cancel button and X; defaults false (first-run)
  function showSetupModal(opts = {}) {
    const { onSave, allowCancel = false } = opts;
    const p = get() || {};
    const isEdit = !!p.email;

    Modal.open({
      heading: isEdit ? t('profile.editHeading') : t('profile.setupHeading'),
      content: `
        <p style="font-size:13px;color:var(--gray-600);margin-bottom:18px;line-height:1.5">
          ${isEdit ? t('profile.editDesc') : t('profile.setupDesc')}
        </p>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">${t('profile.firstName')} <span>*</span></label>
            <input id="profFirst" class="form-input" placeholder="${t('profile.firstPh')}" value="${escHtml(p.firstName || '')}" autocomplete="given-name">
            <div id="profFirstErr" style="color:var(--red);font-size:12px;margin-top:3px"></div>
          </div>
          <div class="form-group">
            <label class="form-label">${t('profile.lastName')} <span>*</span></label>
            <input id="profLast" class="form-input" placeholder="${t('profile.lastPh')}" value="${escHtml(p.lastName || '')}" autocomplete="family-name">
            <div id="profLastErr" style="color:var(--red);font-size:12px;margin-top:3px"></div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">${t('profile.emailLabel')} <span>*</span></label>
          <input id="profEmail" class="form-input" type="email" placeholder="${t('profile.emailPh')}"
                 value="${escHtml(p.email || '')}" autocomplete="email">
          <div style="font-size:11px;color:var(--gray-500);margin-top:4px">${t('profile.emailHint')}</div>
          <div id="profEmailErr" style="color:var(--red);font-size:12px;margin-top:3px"></div>
        </div>`,
      size: '',
      closeOnOverlay: allowCancel,
      actions: [
        {
          label: isEdit ? t('profile.saveChanges') : t('profile.saveContinue'),
          cls: 'btn-primary',
          onClick: () => _saveProfileFields(onSave)
        },
        ...(allowCancel ? [{ label: t('common.cancel'), cls: 'btn-secondary', onClick: Modal.close }] : [])
      ]
    });

    // Hide the × close button when allowCancel is false (first-run: must complete setup)
    if (!allowCancel) {
      requestAnimationFrame(() => {
        const closeBtn = document.getElementById('modalClose');
        if (closeBtn) closeBtn.style.display = 'none';
      });
    }
  }

  // ── Tabbed Settings modal (Profile + Appearance + Language) ─────────────────
  function showSettingsModal(opts = {}) {
    // Delegate to the unified preferences modal
    if (typeof SettingsModal !== 'undefined') {
      SettingsModal.open('profile');
      return;
    }
    // Fallback (SettingsModal not yet loaded) ─────────────────────────────────
    const { onSave } = opts;
    const p = get() || {};
    const langNames = { en: 'English', nl: 'Nederlands', de: 'Deutsch', fr: 'Français', sv: 'Svenska', es: 'Español', ja: '日本語' };
    const available = I18n.getAvailable();
    const cur       = I18n.getCurrent();
    const curTheme  = ThemeManager.current();

    Modal.open({
      heading: t('pref.settings'),
      content: `
        <!-- Tab bar -->
        <div class="settings-modal-tabs" style="display:flex;gap:0;border-bottom:2px solid var(--gray-200);margin:-4px -2px 20px">
          ${[
            { id: 'tabProfile',    label: t('settings.tabProfile')    },
            { id: 'tabAppearance', label: t('settings.tabAppearance') },
            { id: 'tabLanguage',   label: t('settings.tabLanguage')   },
          ].map(tab => `
            <button class="settings-modal-tab${tab.id === 'tabProfile' ? ' active' : ''}"
                    id="${tab.id}"
                    style="padding:8px 16px;background:none;border:none;cursor:pointer;font-size:13px;font-weight:600;
                           color:var(--gray-500);border-bottom:2px solid transparent;margin-bottom:-2px;
                           white-space:nowrap;transition:color 120ms,border-color 120ms">
              ${escHtml(tab.label)}
            </button>`).join('')}
        </div>

        <!-- Profile tab -->
        <div id="panelProfile">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">${t('profile.firstName')} <span>*</span></label>
              <input id="profFirst" class="form-input" placeholder="${t('profile.firstPh')}" value="${escHtml(p.firstName || '')}" autocomplete="given-name">
              <div id="profFirstErr" style="color:var(--red);font-size:12px;margin-top:3px"></div>
            </div>
            <div class="form-group">
              <label class="form-label">${t('profile.lastName')} <span>*</span></label>
              <input id="profLast" class="form-input" placeholder="${t('profile.lastPh')}" value="${escHtml(p.lastName || '')}" autocomplete="family-name">
              <div id="profLastErr" style="color:var(--red);font-size:12px;margin-top:3px"></div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">${t('profile.emailLabel')} <span>*</span></label>
            <input id="profEmail" class="form-input" type="email" placeholder="${t('profile.emailPh')}"
                   value="${escHtml(p.email || '')}" autocomplete="email">
            <div style="font-size:11px;color:var(--gray-500);margin-top:4px">${t('profile.emailHint')}</div>
            <div id="profEmailErr" style="color:var(--red);font-size:12px;margin-top:3px"></div>
          </div>
        </div>

        <!-- Appearance tab -->
        <div id="panelAppearance" style="display:none">
          <div style="font-size:12px;color:var(--gray-500);margin-bottom:14px">${t('settings.appearanceDesc')}</div>
          <div class="pref-theme-group" id="settingsThemeGroup" style="justify-content:flex-start">
            ${[
              { k: 'light',  label: t('pref.themeLight'),  svg: `<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="3.5" stroke="currentColor" stroke-width="1.5"/><path d="M10 2.5v1.75M10 15.75V17.5M2.5 10h1.75M15.75 10H17.5M4.7 4.7l1.24 1.24M14.06 14.06l1.24 1.24M4.7 15.3l1.24-1.24M14.06 5.94l1.24-1.24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>` },
              { k: 'dark',   label: t('pref.themeDark'),   svg: `<svg viewBox="0 0 20 20" fill="none"><path d="M17 12.3A8 8 0 0 1 7.7 3a7 7 0 1 0 9.3 9.3z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
              { k: 'system', label: t('pref.themeSystem'), svg: `<svg viewBox="0 0 20 20" fill="none"><rect x="2" y="3" width="16" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M7 18h6M10 14v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>` },
            ].map(th => `
              <button class="pref-theme-btn settings-theme-btn${curTheme === th.k ? ' active' : ''}"
                      data-theme="${th.k}" title="${escHtml(th.label)}">
                ${th.svg}<span>${escHtml(th.label)}</span>
              </button>`).join('')}
          </div>
        </div>

        <!-- Language tab -->
        <div id="panelLanguage" style="display:none">
          <div style="font-size:12px;color:var(--gray-500);margin-bottom:14px">${t('settings.languageDesc')}</div>
          <div style="display:flex;flex-direction:column;gap:4px" id="settingsLangList">
            ${available.map(lang => `
              <button class="pref-item${lang === cur ? ' active' : ''}" data-lang="${lang}"
                      style="border-radius:6px;${lang === cur ? 'background:var(--accent-light,#EBF3FF);color:var(--accent)' : ''}">
                <span>${langNames[lang] || lang}</span>
                ${lang === cur ? `<svg viewBox="0 0 14 14" fill="none" style="width:12px;height:12px;margin-left:auto;flex-shrink:0"><path d="M2 7l4 4 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
              </button>`).join('')}
          </div>
        </div>`,
      size: '',
      actions: [
        { label: t('profile.saveChanges'), cls: 'btn-primary', onClick: () => _saveProfileFields(onSave) },
        { label: t('common.cancel'),       cls: 'btn-secondary', onClick: Modal.close },
      ]
    });

    // ── Wire tabs ────────────────────────────────────────────────────────────
    requestAnimationFrame(() => {
      const tabs   = ['tabProfile','tabAppearance','tabLanguage'];
      const panels = ['panelProfile','panelAppearance','panelLanguage'];

      function activateTab(idx) {
        tabs.forEach((id, i) => {
          const btn = document.getElementById(id);
          if (!btn) return;
          const isActive = i === idx;
          btn.classList.toggle('active', isActive);
          btn.style.color       = isActive ? 'var(--gray-800)' : 'var(--gray-500)';
          btn.style.borderColor = isActive ? 'var(--accent)'   : 'transparent';
          const panel = document.getElementById(panels[i]);
          if (panel) panel.style.display = isActive ? '' : 'none';
        });
        // Show/hide Save button depending on active tab
        const footer = document.getElementById('modalFooter');
        if (footer) {
          const saveBtn = footer.querySelector('.btn-primary');
          if (saveBtn) saveBtn.style.display = (idx === 0) ? '' : 'none';
        }
      }

      tabs.forEach((id, i) => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => activateTab(i));
      });
      activateTab(0);

      // Theme buttons inside the modal
      document.querySelectorAll('.settings-theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          ThemeManager.set(btn.dataset.theme);
          document.querySelectorAll('.settings-theme-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.theme === btn.dataset.theme);
          });
        });
      });

      // Language buttons inside the modal
      const langList = document.getElementById('settingsLangList');
      if (langList) {
        langList.querySelectorAll('[data-lang]').forEach(btn => {
          btn.addEventListener('click', () => {
            I18n.setLanguage(btn.dataset.lang);
            Modal.close();
          });
        });
      }
    });
  }

  // ── Shared: validate + save profile fields ───────────────────────────────────
  function _saveProfileFields(onSave) {
    const firstName = document.getElementById('profFirst')?.value.trim() || '';
    const lastName  = document.getElementById('profLast')?.value.trim()  || '';
    const email     = document.getElementById('profEmail')?.value.trim().toLowerCase() || '';

    ['profFirstErr','profLastErr','profEmailErr'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });

    let valid = true;
    if (!firstName) { const e = document.getElementById('profFirstErr'); if (e) e.textContent = t('common.required'); valid = false; }
    if (!lastName)  { const e = document.getElementById('profLastErr');  if (e) e.textContent = t('common.required'); valid = false; }
    if (!email)     { const e = document.getElementById('profEmailErr'); if (e) e.textContent = t('common.required'); valid = false; }
    else if (!email.endsWith('@adobe.com')) {
      const e = document.getElementById('profEmailErr');
      if (e) e.textContent = t('profile.emailErr');
      valid = false;
    }
    if (!valid) return;

    const profile = { firstName, lastName, email };
    set(profile);
    updateTopbarChip();
    // Persist to settings.json so it survives localStorage being cleared between sessions
    if (window.electronAPI?.getSettings && window.electronAPI?.saveSettings) {
      window.electronAPI.getSettings().then(s => {
        window.electronAPI.saveSettings({ ...(s || {}), userProfile: profile });
      }).catch(() => {});
    }
    Modal.close();
    Toast.show(t('profile.savedToast').replace('{name}', firstName), 'success');
    if (onSave) onSave(profile);
  }

  return {
    get, set, clear, isConfigured,
    getEmail, getFirstName, getLastName, getFullName, getInitials,
    getAdminToken, setAdminToken, clearAdminToken,
    setAdmin, isAdmin,
    showSetupModal, showSettingsModal, updateTopbarChip,
  };
})();
