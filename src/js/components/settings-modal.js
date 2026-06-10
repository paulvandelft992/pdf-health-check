/* SettingsModal — unified Slack-style preferences modal
 * Consolidates: profile, appearance, language, backend connection,
 * Yukon/AI settings, admin access, keyboard shortcuts, chrome extension,
 * contact info, and onboarding tour.
 * Usage: SettingsModal.open('profile')  /  SettingsModal.close()
 */
const SettingsModal = (() => {
  let _el        = null;   // overlay DOM node
  let _section   = null;   // current section id
  let _saved     = {};     // electron-stored settings (loaded on open)

  /* ── Sidebar definition ──────────────────────────────────────────────────── */
  const GROUPS = [
    {
      id: 'profile',
      label: () => t('settings.groupProfile') || 'Your Profile',
      items: [
        { id: 'profile',    icon: iconPerson,   label: () => t('settings.tabProfile') },
        { id: 'appearance', icon: iconPalette,  label: () => t('settings.tabAppearance') },
        { id: 'language',   icon: iconGlobe,    label: () => t('settings.tabLanguage')   },
      ],
    },
    {
      id: 'admin',
      label: () => t('settings.groupAdmin') || 'Administration',
      items: [
        { id: 'admin',      icon: iconLock,     label: () => t('settings.adminSection')   },
        { id: 'connection', icon: iconServer,   label: () => t('settings.backendSection') },
        { id: 'yukon',      icon: iconSparkle,  label: () => t('settings.yukonSection')   },
      ],
    },
    {
      id: 'help',
      label: () => t('settings.groupHelp') || 'Help & More',
      items: [
        { id: 'shortcuts',  icon: iconKeyboard, label: () => t('pref.shortcuts')     },
        { id: 'whats-new',  icon: iconStar,     label: () => "What's New"            },
        { id: 'guide',      icon: iconBook,     label: () => 'Technical Guide'       },
        { id: 'extension',  icon: iconExtension,label: () => t('pref.getExtension')  },
        { id: 'contact',    icon: iconEmail,    label: () => t('pref.getInTouch')    },
        { id: 'tour',       icon: iconRefresh,  label: () => t('pref.restartTour')   },
      ],
    },
  ];

  /* ── Public API ──────────────────────────────────────────────────────────── */
  async function open(section = 'profile') {
    // Load Electron settings (best-effort)
    try {
      if (window.electronAPI) _saved = await window.electronAPI.getSettings() || {};
    } catch { _saved = {}; }

    if (_el) {
      // Already open — just switch section
      _switchSection(section);
      return;
    }

    _el = document.createElement('div');
    _el.className = 'pm-overlay';
    _el.innerHTML = _buildShell();
    document.body.appendChild(_el);

    // Close targets
    _el.querySelector('.pm-close').addEventListener('click', close);
    _el.addEventListener('mousedown', e => { if (e.target === _el) close(); });
    document.addEventListener('keydown', _onKey);

    // Nav wiring
    _el.querySelectorAll('.pm-nav-item').forEach(btn => {
      btn.addEventListener('click', () => _switchSection(btn.dataset.section));
    });

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => _el.classList.add('pm-open'));
    });

    _switchSection(section);
  }

  function close() {
    if (!_el) return;
    _el.classList.remove('pm-open');
    document.removeEventListener('keydown', _onKey);
    setTimeout(() => { _el?.remove(); _el = null; }, 200);
  }

  /* ── Internal ────────────────────────────────────────────────────────────── */
  function _onKey(e) { if (e.key === 'Escape') close(); }

  function _buildShell() {
    const nav = GROUPS.map(g => `
      <div class="pm-nav-group-label">${g.label()}</div>
      ${g.items.map(item => `
        <button class="pm-nav-item" data-section="${item.id}" type="button">
          ${item.icon()}
          <span>${item.label()}</span>
        </button>`).join('')}
    `).join('');

    return `
      <div class="pm-dialog" role="dialog" aria-modal="true">
        <nav class="pm-sidebar">
          <div class="pm-sidebar-title">${t('pref.settings')}</div>
          ${nav}
        </nav>
        <div class="pm-body"></div>
        <button class="pm-close" type="button" aria-label="Close">
          <svg viewBox="0 0 16 16" fill="none">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>`;
  }

  function _switchSection(id) {
    _section = id;
    _el.querySelectorAll('.pm-nav-item').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.section === id));
    const body = _el.querySelector('.pm-body');
    if (!body) return;
    body.innerHTML = '';
    (_renderers[id] || _renderNotFound)(body);
  }

  /* ── Section renderers ───────────────────────────────────────────────────── */
  const _renderers = {
    profile:    _renderProfile,
    appearance: _renderAppearance,
    language:   _renderLanguage,
    connection: _renderConnection,
    yukon:      _renderYukon,
    admin:      _renderAdmin,
    shortcuts:   _renderShortcuts,
    'whats-new': _renderWhatsNew,
    guide:       _renderGuide,
    extension:  _renderExtension,
    contact:    _renderContact,
    tour:       _renderTour,
  };

  function _sectionHead(title, desc) {
    return `<h2 class="pm-section-title">${title}</h2>${desc ? `<p class="pm-section-desc">${desc}</p>` : ''}`;
  }

  /* Profile ------------------------------------------------------------------ */
  function _renderProfile(body) {
    const p = UserProfile.get() || {};
    body.innerHTML = `
      ${_sectionHead(t('settings.tabProfile'))}
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${t('profile.firstName')} <span>*</span></label>
          <input id="pmProfFirst" class="form-input" placeholder="${t('profile.firstPh')}"
                 value="${escHtml(p.firstName || '')}" autocomplete="given-name">
          <div id="pmProfFirstErr" class="pm-field-err"></div>
        </div>
        <div class="form-group">
          <label class="form-label">${t('profile.lastName')} <span>*</span></label>
          <input id="pmProfLast" class="form-input" placeholder="${t('profile.lastPh')}"
                 value="${escHtml(p.lastName || '')}" autocomplete="family-name">
          <div id="pmProfLastErr" class="pm-field-err"></div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('profile.emailLabel')} <span>*</span></label>
        <input id="pmProfEmail" class="form-input" type="email" placeholder="${t('profile.emailPh')}"
               value="${escHtml(p.email || '')}" autocomplete="email">
        <div style="font-size:11px;color:var(--gray-500);margin-top:4px">${t('profile.emailHint')}</div>
        <div id="pmProfEmailErr" class="pm-field-err"></div>
      </div>
      <div class="pm-actions">
        <button class="btn btn-primary" id="pmSaveProfile">${t('profile.saveChanges')}</button>
      </div>`;

    body.querySelector('#pmSaveProfile').addEventListener('click', () => {
      const firstName = body.querySelector('#pmProfFirst')?.value.trim()            || '';
      const lastName  = body.querySelector('#pmProfLast')?.value.trim()             || '';
      const email     = body.querySelector('#pmProfEmail')?.value.trim().toLowerCase() || '';

      ['pmProfFirstErr','pmProfLastErr','pmProfEmailErr'].forEach(id => {
        const el = body.querySelector(`#${id}`); if (el) el.textContent = '';
      });
      let ok = true;
      if (!firstName) { _err(body,'#pmProfFirstErr', t('common.required')); ok = false; }
      if (!lastName)  { _err(body,'#pmProfLastErr',  t('common.required')); ok = false; }
      if (!email)     { _err(body,'#pmProfEmailErr', t('common.required')); ok = false; }
      else if (!email.endsWith('@adobe.com')) {
        _err(body,'#pmProfEmailErr', t('profile.emailErr')); ok = false;
      }
      if (!ok) return;

      UserProfile.set({ firstName, lastName, email });
      UserProfile.updateTopbarChip();
      Toast.show(t('profile.savedToast').replace('{name}', firstName), 'success');
    });
  }

  /* Appearance --------------------------------------------------------------- */
  function _renderAppearance(body) {
    const cur = ThemeManager.current();

    // Mini app-UI preview SVGs for each theme
    const previews = {
      light: `<svg viewBox="0 0 120 76" xmlns="http://www.w3.org/2000/svg">
        <rect width="120" height="76" rx="5" fill="#F0F2F5"/>
        <rect width="30" height="76" rx="5 0 0 5" fill="#E4E7EC"/>
        <rect x="5" y="14" width="20" height="3.5" rx="1.75" fill="#C4C9D4"/>
        <rect x="5" y="21" width="20" height="3.5" rx="1.75" fill="#3778F5" opacity=".85"/>
        <rect x="5" y="28" width="20" height="3.5" rx="1.75" fill="#C4C9D4"/>
        <rect x="5" y="35" width="20" height="3.5" rx="1.75" fill="#C4C9D4"/>
        <rect x="30" y="0" width="90" height="12" fill="#FFFFFF"/>
        <rect x="30" y="12" width="90" height=".75" fill="#DDE1E8"/>
        <rect x="36" y="18" width="78" height="18" rx="3" fill="#FFFFFF" stroke="#DDE1E8" stroke-width=".75"/>
        <rect x="39" y="22" width="28" height="3" rx="1.5" fill="#D0D5DE"/>
        <rect x="39" y="27" width="18" height="2" rx="1" fill="#E4E7EC"/>
        <rect x="36" y="40" width="78" height="18" rx="3" fill="#FFFFFF" stroke="#DDE1E8" stroke-width=".75"/>
        <rect x="39" y="44" width="36" height="3" rx="1.5" fill="#D0D5DE"/>
        <rect x="39" y="49" width="22" height="2" rx="1" fill="#E4E7EC"/>
        <rect x="36" y="62" width="78" height="8" rx="3" fill="#FFFFFF" stroke="#DDE1E8" stroke-width=".75"/>
      </svg>`,

      dark: `<svg viewBox="0 0 120 76" xmlns="http://www.w3.org/2000/svg">
        <rect width="120" height="76" rx="5" fill="#1C1F24"/>
        <rect width="30" height="76" rx="5 0 0 5" fill="#13161A"/>
        <rect x="5" y="14" width="20" height="3.5" rx="1.75" fill="#2E333B"/>
        <rect x="5" y="21" width="20" height="3.5" rx="1.75" fill="#3778F5" opacity=".85"/>
        <rect x="5" y="28" width="20" height="3.5" rx="1.75" fill="#2E333B"/>
        <rect x="5" y="35" width="20" height="3.5" rx="1.75" fill="#2E333B"/>
        <rect x="30" y="0" width="90" height="12" fill="#1C1F24"/>
        <rect x="30" y="12" width="90" height=".75" fill="#2A2F38"/>
        <rect x="36" y="18" width="78" height="18" rx="3" fill="#23282F" stroke="#2A2F38" stroke-width=".75"/>
        <rect x="39" y="22" width="28" height="3" rx="1.5" fill="#363C46"/>
        <rect x="39" y="27" width="18" height="2" rx="1" fill="#2A2F38"/>
        <rect x="36" y="40" width="78" height="18" rx="3" fill="#23282F" stroke="#2A2F38" stroke-width=".75"/>
        <rect x="39" y="44" width="36" height="3" rx="1.5" fill="#363C46"/>
        <rect x="39" y="49" width="22" height="2" rx="1" fill="#2A2F38"/>
        <rect x="36" y="62" width="78" height="8" rx="3" fill="#23282F" stroke="#2A2F38" stroke-width=".75"/>
      </svg>`,

      system: `<svg viewBox="0 0 120 76" xmlns="http://www.w3.org/2000/svg">
        <clipPath id="lhalf"><rect width="60" height="76" rx="5"/></clipPath>
        <clipPath id="rhalf"><rect x="60" width="60" height="76" rx="0 5 5 0"/></clipPath>
        <!-- Light half -->
        <g clip-path="url(#lhalf)">
          <rect width="60" height="76" fill="#F0F2F5"/>
          <rect width="30" height="76" fill="#E4E7EC"/>
          <rect x="5" y="14" width="20" height="3.5" rx="1.75" fill="#C4C9D4"/>
          <rect x="5" y="21" width="20" height="3.5" rx="1.75" fill="#3778F5" opacity=".85"/>
          <rect x="5" y="28" width="20" height="3.5" rx="1.75" fill="#C4C9D4"/>
          <rect x="30" y="0" width="30" height="12" fill="#FFFFFF"/>
          <rect x="30" y="12" width="30" height=".75" fill="#DDE1E8"/>
          <rect x="36" y="18" width="18" height="18" rx="3" fill="#FFFFFF" stroke="#DDE1E8" stroke-width=".75"/>
          <rect x="36" y="40" width="18" height="18" rx="3" fill="#FFFFFF" stroke="#DDE1E8" stroke-width=".75"/>
        </g>
        <!-- Dark half -->
        <g clip-path="url(#rhalf)">
          <rect x="60" width="60" height="76" fill="#1C1F24"/>
          <rect x="60" y="0" width="30" height="12" fill="#1C1F24"/>
          <rect x="60" y="12" width="30" height=".75" fill="#2A2F38"/>
          <rect x="66" y="18" width="18" height="18" rx="3" fill="#23282F" stroke="#2A2F38" stroke-width=".75"/>
          <rect x="66" y="40" width="18" height="18" rx="3" fill="#23282F" stroke="#2A2F38" stroke-width=".75"/>
        </g>
        <!-- Centre divider -->
        <line x1="60" y1="0" x2="60" y2="76" stroke="#00000022" stroke-width="1"/>
      </svg>`,
    };

    const themes = [
      { k: 'light',  label: t('pref.themeLight')  },
      { k: 'dark',   label: t('pref.themeDark')   },
      { k: 'system', label: t('pref.themeSystem') },
    ];

    body.innerHTML = `
      ${_sectionHead(t('settings.tabAppearance'), t('settings.appearanceDesc'))}
      <div class="pm-theme-cards" id="pmThemeGroup">
        ${themes.map(th => `
          <button class="pm-theme-card${cur === th.k ? ' active' : ''}" data-theme="${th.k}" type="button">
            <div class="pm-theme-preview">${previews[th.k]}</div>
            <span class="pm-theme-label">${escHtml(th.label)}</span>
          </button>`).join('')}
      </div>`;

    body.querySelectorAll('.pm-theme-card').forEach(btn => {
      btn.addEventListener('click', () => {
        ThemeManager.set(btn.dataset.theme);
        body.querySelectorAll('.pm-theme-card').forEach(b =>
          b.classList.toggle('active', b.dataset.theme === btn.dataset.theme));
      });
    });
  }

  /* Language ----------------------------------------------------------------- */
  function _renderLanguage(body) {
    const langs = {
      en: { name: 'English',    flag: '🇬🇧' },
      nl: { name: 'Nederlands', flag: '🇳🇱' },
      de: { name: 'Deutsch',    flag: '🇩🇪' },
      fr: { name: 'Français',   flag: '🇫🇷' },
      sv: { name: 'Svenska',    flag: '🇸🇪' },
      es: { name: 'Español',    flag: '🇪🇸' },
      it: { name: 'Italiano',   flag: '🇮🇹' },
    };
    const available = I18n.getAvailable();
    const cur       = I18n.getCurrent();

    body.innerHTML = `
      ${_sectionHead(t('settings.tabLanguage'), t('settings.languageDesc'))}
      <div class="pm-lang-list" id="pmLangList">
        ${available.map(lang => {
          const info = langs[lang] || { name: lang, flag: '🌐' };
          const active = lang === cur;
          return `
            <button class="pm-lang-item${active ? ' active' : ''}" data-lang="${lang}" type="button">
              <span class="pm-lang-flag">${info.flag}</span>
              <span class="pm-lang-name">${info.name}</span>
              ${active ? `<svg viewBox="0 0 14 14" fill="none" style="width:13px;height:13px;margin-left:auto;flex-shrink:0"><path d="M2 7l4 4 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
            </button>`;
        }).join('')}
      </div>`;

    body.querySelectorAll('[data-lang]').forEach(btn => {
      btn.addEventListener('click', () => { I18n.setLanguage(btn.dataset.lang); close(); });
    });
  }

  /* Admin gate — shown when a section requires admin login ------------------- */
  function _renderAdminGate(body, sectionId) {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                  padding:48px 24px;gap:16px;text-align:center">
        <div style="width:48px;height:48px;border-radius:50%;background:var(--gray-100);
                    display:flex;align-items:center;justify-content:center;color:var(--gray-500)">
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="9" width="12" height="9" rx="2" stroke="currentColor" stroke-width="1.4"/>
            <path d="M7 9V6a3 3 0 0 1 6 0v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
        </div>
        <div>
          <div style="font-size:14px;font-weight:600;color:var(--gray-800);margin-bottom:4px">
            Admin access required
          </div>
          <div style="font-size:13px;color:var(--gray-500);max-width:280px">
            These settings are managed centrally. Sign in as admin to view or change them.
          </div>
        </div>
        <button class="btn btn-primary btn-sm" id="pmGateLoginBtn">Admin sign in</button>
      </div>`;
    body.querySelector('#pmGateLoginBtn').addEventListener('click', () => {
      if (typeof showAdminLoginModal === 'function') {
        showAdminLoginModal(() => _switchSection(sectionId));
      }
    });
  }

  /* Backend connection ------------------------------------------------------- */
  function _renderConnection(body) {
    if (!UserProfile.isAdmin()) { _renderAdminGate(body, 'connection'); return; }
    body.innerHTML = `
      ${_sectionHead(t('settings.backendSection'))}
      <div class="form-group">
        <label class="form-label">${t('settings.backendUrlLabel')} <span>*</span></label>
        <input id="pmBackendUrl" class="form-input" placeholder="${t('settings.backendUrlPh')}"
               value="${escHtml(_saved.backendUrl || '')}">
        <div class="pm-hint">${t('settings.backendUrlHint')}</div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('settings.apiKeyLabel')}</label>
        <input id="pmApiKey" class="form-input" type="password" placeholder="${t('settings.apiKeyElectronPh')}"
               value="${escHtml(_saved.apiKey || '')}">
        <div class="pm-hint">${t('settings.apiKeyHint')}</div>
      </div>
      <div class="pm-inline-action">
        <button class="btn btn-secondary btn-sm" id="pmTestConn" type="button">${t('settings.testConnBtn')}</button>
        <span id="pmConnStatus" class="pm-status"></span>
      </div>
      <div class="pm-actions">
        <button class="btn btn-primary" id="pmSaveConn" type="button">${t('settings.saveBtn')}</button>
      </div>`;

    body.querySelector('#pmTestConn').addEventListener('click', async () => {
      const url    = body.querySelector('#pmBackendUrl').value.trim();
      const key    = body.querySelector('#pmApiKey').value.trim();
      const status = body.querySelector('#pmConnStatus');
      if (!url) { Toast.show(t('settings.enterUrl'), 'warning'); return; }
      status.textContent = t('settings.testingConn');
      status.className = 'pm-status';
      try {
        const res  = await fetch(`${url}/api/ping`, { headers: { 'X-API-Key': key } });
        const data = await res.json();
        if (res.ok) {
          status.textContent = '✓ ' + t('settings.connOk', { version: data.data?.version || data.version || 'OK' });
          status.className = 'pm-status ok';
        } else {
          status.textContent = '✗ ' + (data.error || 'Error');
          status.className = 'pm-status err';
        }
      } catch {
        status.textContent = t('settings.connFail');
        status.className = 'pm-status err';
      }
    });

    body.querySelector('#pmSaveConn').addEventListener('click', () => _saveAll(body));
  }

  /* Yukon/AI ----------------------------------------------------------------- */
  async function _renderYukon(body) {
    if (!UserProfile.isAdmin()) { _renderAdminGate(body, 'yukon'); return; }

    // Show a spinner while fetching current values from the backend
    body.innerHTML = `<div style="padding:32px;color:var(--gray-400);font-size:13px">Loading…</div>`;

    let srv = {};
    try {
      const res = await API.appSettings.get();
      srv = res.data || res;
    } catch { /* proceed with empty — fields will be blank */ }

    const sel = (key, opts, def) => opts.map(v =>
      `<option value="${v}"${(srv[key]||def)===v?' selected':''}>${v.replace(/_/g,' ')}</option>`
    ).join('');

    const tokenSet  = !!srv.yukon_token;
    const tokenBadge = tokenSet
      ? `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--green);font-weight:600">
           <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="6" stroke="currentColor" stroke-width="1.2"/><path d="M4 6.5l2 2 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
           Configured on server
         </span>`
      : `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--orange,#e8861a);font-weight:600">
           <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="6" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 4v3.5M6.5 9.5v.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
           Not set — add via server config
         </span>`;

    body.innerHTML = `
      ${_sectionHead(t('settings.yukonSection'), t('settings.yukonDesc'))}
      <div class="form-group">
        <label class="form-label">${t('settings.yukonTokenLabel') || 'Bearer Token'}</label>
        <div style="margin-top:4px">${tokenBadge}</div>
        <div class="pm-hint" style="margin-top:6px">The token is stored on the server and never transmitted to the app. To update it, use the backend admin panel.</div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('settings.yukonBaseUrlLabel')}</label>
        <input id="pmYukonUrl" class="form-input" placeholder="${t('settings.yukonBaseUrlPh')}"
               value="${escHtml(srv.yukon_base_url || '')}">
        <div class="pm-hint">${t('settings.yukonBaseUrlHint')}</div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('settings.yukonCollectionLabel')}</label>
        <input id="pmYukonCol" class="form-input" placeholder="${t('settings.yukonCollectionPh')}"
               value="${escHtml(srv.yukon_collection_id || '')}">
        <div class="pm-hint">${t('settings.yukonCollectionHint')}</div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('settings.yukonApiKeyLabel') || 'API Key (x-api-key)'}
          <span style="font-weight:400;color:var(--gray-400)">${t('settings.yukonApiKeyOptional') || '— optional'}</span>
        </label>
        <input id="pmYukonApiKey" class="form-input" type="password"
               placeholder="${t('settings.yukonApiKeyPh') || 'Adobe client ID / API key'}"
               value="${escHtml(srv.yukon_api_key || '')}">
        <div class="pm-hint">${t('settings.yukonApiKeyHint') || 'Required by some Yukon deployments. Leave blank if not needed.'}</div>
      </div>
      <div class="pm-inline-action">
        <button class="btn btn-secondary btn-sm" id="pmTestYukon" type="button">${t('settings.yukonTestBtn')}</button>
        <span id="pmYukonStatus" class="pm-status"></span>
      </div>

      <div class="pm-subsection-label">${t('settings.yukonInferenceSection')}</div>
      <div class="pm-grid-4">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">${t('settings.yukonInferenceModeLabel')}</label>
          <select id="pmYukonMode" class="form-input">
            ${sel('yukon_inference_mode', ['LITE','STANDARD','FAST_REASONING','ADVANCED'], 'STANDARD')}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">${t('settings.yukonResponseFormatLabel')}</label>
          <select id="pmYukonFormat" class="form-input">
            ${sel('yukon_response_format', ['AUTO','PARAGRAPH','BULLETS','NUMBERED','TABLE'], 'PARAGRAPH')}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">${t('settings.yukonResponseStyleLabel')}</label>
          <select id="pmYukonStyle" class="form-input">
            ${sel('yukon_response_style', ['AUTO','DESCRIPTIVE','CONCISE','BULLET_POINTS'], 'DESCRIPTIVE')}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">${t('settings.yukonResponseToneLabel')}</label>
          <select id="pmYukonTone" class="form-input">
            ${sel('yukon_response_tone', ['AUTO','NARRATIVE','EMPATHETIC','DIRECT','SBF'], 'DIRECT')}
          </select>
        </div>
      </div>

      <div class="pm-actions">
        <button class="btn btn-primary" id="pmSaveYukon" type="button">${t('settings.saveBtn')}</button>
      </div>

      <!-- App Guide upload -->
      <div class="pm-subsection-label">${t('settings.yukonGuideSection') || 'App Guide'}</div>
      <p class="pm-hint" style="margin-bottom:10px">${t('settings.yukonGuideHint') || 'Upload a how-to guide document so the AI can answer questions about the app.'}</p>
      <div class="pm-inline-action">
        <button class="btn btn-secondary btn-sm" id="pmUploadGuide" type="button">${t('yukon.uploadGuide') || 'Upload App Guide'}</button>
        <span id="pmGuideStatus" class="pm-status"></span>
      </div>

      <!-- Conversation history -->
      <div class="pm-subsection-label" style="margin-top:24px">${t('settings.yukonHistorySection') || 'Conversation History'}</div>
      <div id="pmYukonHistory" class="yukon-hist-list"></div>`;

    body.querySelector('#pmTestYukon').addEventListener('click', async () => {
      const status = body.querySelector('#pmYukonStatus');
      status.textContent = t('settings.yukonTesting') || 'Testing…';
      status.className = 'pm-status';
      // Fetch actual credentials from the backend (token is not in the form)
      let cfg;
      try { const r = await API.yukon.config(); cfg = r.data || r; }
      catch (e) { status.textContent = '✗ ' + e.message; status.className = 'pm-status err'; return; }
      const baseUrl      = body.querySelector('#pmYukonUrl')?.value.trim() || cfg.yukon_base_url;
      const collectionId = body.querySelector('#pmYukonCol')?.value.trim() || cfg.yukon_collection_id;
      const apiKey       = body.querySelector('#pmYukonApiKey')?.value.trim() || cfg.yukon_api_key;
      if (!baseUrl || !cfg.yukon_token || !collectionId) {
        status.textContent = '✗ Token not configured on server'; status.className = 'pm-status err'; return;
      }
      const result = await Yukon.testConnection(baseUrl, cfg.yukon_token, collectionId, apiKey);
      if (result.ok) {
        status.textContent = '✓ ' + (t('settings.yukonConnOk') || 'Connection successful');
        status.className = 'pm-status ok';
      } else {
        status.textContent = '✗ ' + result.error;
        status.className = 'pm-status err';
      }
    });

    body.querySelector('#pmSaveYukon').addEventListener('click', async () => {
      const apiKey = body.querySelector('#pmYukonApiKey')?.value.trim() || '';
      const payload = {
        yukon_base_url:        body.querySelector('#pmYukonUrl')?.value.trim(),
        yukon_collection_id:   body.querySelector('#pmYukonCol')?.value.trim(),
        yukon_inference_mode:  body.querySelector('#pmYukonMode')?.value,
        yukon_response_format: body.querySelector('#pmYukonFormat')?.value,
        yukon_response_style:  body.querySelector('#pmYukonStyle')?.value,
        yukon_response_tone:   body.querySelector('#pmYukonTone')?.value,
      };
      if (apiKey && apiKey !== '••••••••') payload.yukon_api_key = apiKey;
      try {
        await API.appSettings.save(payload);
        Yukon.configure(null); // bust the client-side cache so next call re-fetches
        Toast.show(t('toast.settingsSaved'), 'success');
      } catch (e) {
        Toast.show(e.message, 'error');
      }
    });

    body.querySelector('#pmUploadGuide').addEventListener('click', async () => {
      const btn    = body.querySelector('#pmUploadGuide');
      const status = body.querySelector('#pmGuideStatus');
      btn.disabled = true;
      status.textContent = 'Uploading…';
      status.className = 'pm-status';
      const result = await Yukon.uploadGuideDocument();
      btn.disabled = false;
      if (result.ok) {
        status.textContent = '✓ ' + (t('yukon.uploadGuideOk') || 'App guide uploaded successfully');
        status.className = 'pm-status ok';
      } else {
        status.textContent = '✗ ' + result.error;
        status.className = 'pm-status err';
      }
    });

    _renderYukonHistory(body);
  }

  function _renderYukonHistory(body) {
    const histEl   = body.querySelector('#pmYukonHistory');
    if (!histEl) return;
    const sessions = (typeof YukonChat !== 'undefined') ? YukonChat.getSessionsList() : [];

    if (!sessions.length) {
      histEl.innerHTML = `<p class="yukon-hist-empty">${t('yukon.historyEmpty') || 'No saved conversations yet. Start a conversation and clear it to archive it here.'}</p>`;
      return;
    }

    histEl.innerHTML = sessions.map((s, i) => `
      <div class="yukon-hist-item" data-idx="${i}">
        <div class="yukon-hist-preview">${escHtml(s.preview || '')}</div>
        <div class="yukon-hist-meta">
          <span>${_histDate(s.lastAt)}</span>
          <span>${s.messageCount || 0} msg${(s.messageCount || 0) !== 1 ? 's' : ''}</span>
        </div>
        <button class="btn btn-secondary btn-sm yukon-hist-restore" data-idx="${i}" type="button">
          ${t('yukon.historyRestore') || 'Restore'}
        </button>
      </div>`).join('');

    histEl.querySelectorAll('.yukon-hist-restore').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = +btn.dataset.idx;
        if (typeof YukonChat !== 'undefined') {
          YukonChat.restoreSession(sessions[idx]);
        }
        close();   // close settings modal, chat panel opens automatically
      });
    });
  }

  function _histDate(ts) {
    if (!ts) return '';
    const d   = new Date(ts);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7)  return `${diffDays} days ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* Admin -------------------------------------------------------------------- */
  function _renderAdmin(body) {
    const isAdmin = UserProfile.isAdmin();
    body.innerHTML = `
      ${_sectionHead(t('settings.adminSection'), t('settings.adminDesc'))}
      <div class="pm-card-row" style="margin-top:6px">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--gray-800)">${t('admin.loginHeading')}</div>
          <div style="font-size:12px;color:var(--gray-500);margin-top:2px">
            ${isAdmin ? (t('admin.signedInAs') || 'You are signed in as admin') : (t('admin.loginDesc') || 'Sign in to access administrative functions')}
          </div>
        </div>
        <button class="btn ${isAdmin ? 'btn-secondary' : 'btn-primary'} btn-sm" id="pmAdminToggle" type="button">
          ${isAdmin ? (t('admin.signOut') || 'Sign out') : (t('admin.loginBtn') || 'Admin sign in')}
        </button>
      </div>

      ${isAdmin ? `
      <div style="margin-top:24px">
        <div style="font-size:12px;font-weight:600;color:var(--gray-600);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px">
          ${t('settings.adminSection')}
        </div>
        <div class="pm-card-row">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--gray-800)">${t('settings.openAdminBtn') || 'Web Admin Panel'}</div>
            <div style="font-size:12px;color:var(--gray-500);margin-top:2px">${t('settings.adminDesc')}</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="pmOpenAdmin" type="button">
            <svg viewBox="0 0 16 16" fill="none" style="width:12px;height:12px">
              <path d="M7 2H2v12h12v-5M9 2h5v5M9 7l6-6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            ${t('settings.openAdminBtn') || 'Open'}
          </button>
        </div>
      </div>` : ''}`;

    body.querySelector('#pmAdminToggle').addEventListener('click', async () => {
      if (isAdmin) {
        try { await API.auth.logout(); } catch { /* best-effort */ }
        UserProfile.clearAdminToken();
        Toast.show(t('admin.logoutSuccess'), 'info');
        _switchSection('admin'); // re-render
      } else {
        close();
        // Show the admin login modal (defined in app.js)
        if (typeof showAdminLoginModal === 'function') showAdminLoginModal();
      }
    });

    body.querySelector('#pmOpenAdmin')?.addEventListener('click', () => {
      const url = (_saved.backendUrl || '').replace(/\/$/, '') + '/admin.php';
      if (window.electronAPI) window.electronAPI.openExternal(url);
      else window.open(url, '_blank');
    });
  }

  /* Keyboard shortcuts ------------------------------------------------------- */
  function _renderShortcuts(body) {
    // Use the canonical SHORTCUTS_DEF from app.js (single source of truth).
    // Translate i18n keys → display strings for rendering.
    const groups = (typeof SHORTCUTS_DEF !== 'undefined' ? SHORTCUTS_DEF : []).map(g => ({
      label: t(g.group),
      items: g.items.map(s => ({ keys: s.keys, label: t(s.label) })),
    }));

    body.innerHTML = `
      ${_sectionHead(t('pref.shortcuts'))}
      <div class="shortcut-modal-body" style="margin-top:4px">
        ${groups.map(g => `
          <div class="shortcut-group">
            <div class="shortcut-group-title">${g.label}</div>
            ${g.items.map(s => `
              <div class="shortcut-row">
                <span class="shortcut-desc">${s.label}</span>
                <span class="shortcut-keys">${s.keys.map(k => `<kbd class="shortcut-kbd">${k}</kbd>`).join('')}</span>
              </div>`).join('')}
          </div>`).join('')}
      </div>`;
  }

  /* Chrome Extension --------------------------------------------------------- */
  function _renderExtension(body) {
    const isElectron = !!window.electronAPI;
    body.innerHTML = `
      ${_sectionHead(t('ext.modalHeading'))}
      <p style="font-size:13px;color:var(--gray-600);line-height:1.6;margin-bottom:16px">${t('ext.modalDesc')}</p>
      <div style="background:var(--gray-75);border-radius:8px;padding:14px;font-size:12px;color:var(--gray-700);line-height:1.8;margin-bottom:16px">
        <div style="font-weight:700;margin-bottom:8px;font-size:13px">${t('ext.installSteps')}</div>
        <ol style="padding-left:18px;display:flex;flex-direction:column;gap:4px">
          <li>${t('ext.step1')}</li>
          <li>${t('ext.step2')}</li>
          <li>${t('ext.step3')}</li>
          <li>${t('ext.step4')}</li>
        </ol>
      </div>
      <div style="font-size:12px;color:var(--gray-500);display:flex;align-items:flex-start;gap:8px;margin-bottom:20px">
        <svg viewBox="0 0 16 16" fill="none" style="width:13px;height:13px;flex-shrink:0;margin-top:1px">
          <path d="M8 1v9M4.5 6.5L8 10l3.5-3.5M2 13h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>${t('ext.revealHint')}</span>
      </div>
      ${isElectron ? `<button class="btn btn-secondary btn-sm" id="pmRevealExt" type="button">${t('ext.revealBtn') || 'Reveal in Finder'}</button>` : ''}`;

    body.querySelector('#pmRevealExt')?.addEventListener('click', () => {
      window.electronAPI?.revealExtension?.();
    });
  }

  /* Contact ------------------------------------------------------------------ */
  function _renderContact(body) {
    const email = 'pvandelft@adobe.com';
    body.innerHTML = `
      ${_sectionHead(t('pref.getInTouch'))}
      <div style="display:flex;flex-direction:column;align-items:center;padding:12px 0 24px">
        <div class="contact-avatar" style="margin-bottom:12px">
          <img src="assets/images/pvd.png" id="mepp" style="width:100%;height:100%;object-fit:cover;border-radius:50%">
        </div>
        <div style="font-size:18px;font-weight:700;color:var(--gray-900);margin-bottom:3px">Paul van Delft</div>
        <div style="font-size:13px;color:var(--gray-500)">${t('contact.role')}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="contact-link" id="pmContactEmail" type="button">
          <svg viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="12" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M2 8l8 5 8-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          <div>
            <div class="contact-link-title">${t('contact.title')}</div>
            <div class="contact-link-sub">${email}</div>
          </div>
        </button>
        <button class="contact-link" id="pmContactTeams" type="button">
          <svg viewBox="0 0 20 20" fill="none"><rect x="2" y="3" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M14 7h2a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M7 8v4M9 8v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          <div>
            <div class="contact-link-title">${t('contact.teamsTitle')}</div>
            <div class="contact-link-sub">${t('contact.teamsSub')}</div>
          </div>
        </button>
      </div>`;

    body.querySelector('#pmContactEmail').addEventListener('click', () => {
      const url = `mailto:${email}`;
      if (window.electronAPI) window.electronAPI.openExternal(url); else window.open(url);
    });
    body.querySelector('#pmContactTeams').addEventListener('click', () => {
      const url = 'https://teams.microsoft.com';
      if (window.electronAPI) window.electronAPI.openExternal(url); else window.open(url);
    });
  }

  /* Tour --------------------------------------------------------------------- */
  function _renderTour(body) {
    body.innerHTML = `
      ${_sectionHead(t('settings.guideSection'), t('settings.guideDesc'))}
      <div class="pm-actions" style="margin-top:8px">
        <button class="btn btn-primary" id="pmStartTour" type="button">
          <svg viewBox="0 0 16 16" fill="none" style="width:13px;height:13px;flex-shrink:0">
            <path d="M2 8a6 6 0 1 1 1.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 12V8h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          ${t('settings.restartGuideBtn')}
        </button>
      </div>`;

    body.querySelector('#pmStartTour').addEventListener('click', () => {
      close();
      setTimeout(() => { Tour.reset(); Tour.start(0); }, 250);
    });
  }

  function _renderWhatsNew(body) {
    const releases = window.__RELEASES__ || [];
    const appVersion = window.electronAPI?.appVersion || '';

    const items = releases.map((r, i) => {
      const isCurrent = r.version === appVersion;
      return `
        <div style="padding:16px 0;${i > 0 ? 'border-top:1px solid var(--gray-100);' : ''}">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:15px;font-weight:700;color:var(--gray-900)">v${r.version}</span>
            ${r.tag ? `<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;background:${isCurrent ? 'color-mix(in srgb,var(--accent) 15%,transparent)' : 'var(--gray-100)'};color:${isCurrent ? 'var(--accent)' : 'var(--gray-500)'}">${r.tag}</span>` : ''}
            ${isCurrent ? `<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;background:var(--green-light,#e8f5e9);color:var(--green,#2e7d32)">Current</span>` : ''}
            <span style="font-size:12px;color:var(--gray-400);margin-left:auto">${r.date}</span>
          </div>
          <ul style="margin:0;padding-left:18px;color:var(--gray-700);font-size:13px;line-height:1.75">
            ${r.notes.map(n => `<li>${n}</li>`).join('')}
          </ul>
        </div>`;
    }).join('');

    body.innerHTML = `
      ${_sectionHead("What's New")}
      ${items || `<p style="color:var(--gray-400);font-size:13px;padding:24px 0">No release notes available.</p>`}`;
  }

  function _renderGuide(body) {
    body.innerHTML = `
      <div class="tg-wrap">
        <h2 class="tg-title">PDF Health Check — Technical Guide</h2>
        <p class="tg-intro">Internal reference for administrators and power users. All features, settings, and integration details in one place.</p>

        <details class="tg-section" open>
          <summary class="tg-summary">Architecture Overview</summary>
          <div class="tg-body">
            <p>PDF Health Check is an <strong>Electron desktop application</strong> (macOS). It bundles a local <strong>Node.js/Express backend</strong> and a <strong>vanilla-JS frontend</strong> — no external runtime dependencies at run time.</p>
            <table class="tg-table">
              <tr><th>Layer</th><th>Technology</th></tr>
              <tr><td>Shell</td><td>Electron main process (Node 20)</td></tr>
              <tr><td>Backend</td><td>Express 4 · pdfjs-dist · pdf-lib · sharp</td></tr>
              <tr><td>Frontend</td><td>Vanilla JS ES2022 · CSS custom properties</td></tr>
              <tr><td>AI</td><td>Adobe Yukon (RAG) via REST API</td></tr>
            </table>
          </div>
        </details>

        <details class="tg-section">
          <summary class="tg-summary">Data Flow</summary>
          <div class="tg-body">
            <ol class="tg-ol">
              <li>User drops PDF(s) onto the upload zone.</li>
              <li>Frontend POSTs the file to the local Express server (<code>/api/analyze</code>).</li>
              <li>Express extracts text &amp; metadata with <strong>pdfjs-dist</strong>, applies scoring rules, and returns a structured JSON report.</li>
              <li>Frontend renders the report (scorecard, issues list, per-page preview).</li>
              <li>User may export a Markdown or HTML report, or ask the Yukon AI assistant follow-up questions about the analysis.</li>
            </ol>
          </div>
        </details>

        <details class="tg-section">
          <summary class="tg-summary">Scoring Model</summary>
          <div class="tg-body">
            <p>Each PDF receives a <strong>0–100 score</strong> built from weighted checks:</p>
            <table class="tg-table">
              <tr><th>Check</th><th>Weight</th><th>Details</th></tr>
              <tr><td>Text extractability</td><td>30 pts</td><td>Selectable text present; not purely image-based</td></tr>
              <tr><td>Metadata completeness</td><td>15 pts</td><td>Title, Author, Subject populated</td></tr>
              <tr><td>PDF/A or PDF/UA compliance</td><td>20 pts</td><td>XMP metadata declares conformance level</td></tr>
              <tr><td>Tagged PDF (accessibility)</td><td>20 pts</td><td>MarkInfo dictionary present</td></tr>
              <tr><td>Bookmark structure</td><td>10 pts</td><td>Outline tree with ≥ 1 bookmark</td></tr>
              <tr><td>File size efficiency</td><td>5 pts</td><td>Pages-to-MB ratio within threshold</td></tr>
            </table>
            <p>Scores ≥ 80 are <strong>Pass</strong>, 60–79 are <strong>Warning</strong>, below 60 are <strong>Fail</strong>.</p>
          </div>
        </details>

        <details class="tg-section">
          <summary class="tg-summary">Backend API Reference</summary>
          <div class="tg-body">
            <p>The embedded Express server listens on a random port (stored in <code>window.__BACKEND_PORT__</code>). All endpoints are local-only.</p>
            <table class="tg-table">
              <tr><th>Method</th><th>Path</th><th>Description</th></tr>
              <tr><td>POST</td><td><code>/api/analyze</code></td><td>Accepts <code>multipart/form-data</code> with one or more PDF files; returns JSON report array</td></tr>
              <tr><td>POST</td><td><code>/api/export/md</code></td><td>Converts report JSON → Markdown</td></tr>
              <tr><td>POST</td><td><code>/api/export/html</code></td><td>Converts report JSON → styled HTML</td></tr>
              <tr><td>GET</td><td><code>/api/health</code></td><td>Liveness probe — returns <code>{ ok: true }</code></td></tr>
            </table>
          </div>
        </details>

        <details class="tg-section">
          <summary class="tg-summary">Yukon AI Integration</summary>
          <div class="tg-body">
            <p>The <strong>Yukon</strong> panel streams answers from Adobe's internal RAG platform. Configuration lives in <em>Settings → Connections → Yukon</em>.</p>
            <table class="tg-table">
              <tr><th>Setting</th><th>Field ID</th><th>Notes</th></tr>
              <tr><td>Base URL</td><td><code>pmYukonUrl</code></td><td>e.g. <code>https://yukon.adobe.io</code></td></tr>
              <tr><td>Bearer Token</td><td><code>pmYukonToken</code></td><td>Adobe IMS token — expires ~24 h; never committed to source</td></tr>
              <tr><td>Collection ID</td><td><code>pmYukonCol</code></td><td>UUID of the HC knowledge collection</td></tr>
              <tr><td>API Key (x-api-key)</td><td><code>pmYukonApiKey</code></td><td>Optional gateway key</td></tr>
              <tr><td>Inference Mode</td><td><code>pmYukonMode</code></td><td>STANDARD · ADVANCED · EXPERT</td></tr>
              <tr><td>Response Format</td><td><code>pmYukonFormat</code></td><td>PARAGRAPH · BULLET · TABLE</td></tr>
              <tr><td>Response Style</td><td><code>pmYukonStyle</code></td><td>DESCRIPTIVE · CONCISE · TECHNICAL</td></tr>
            </table>
            <p>Tokens are stored in Electron's encrypted user-data store and are <strong>never</strong> written to source files or version control.</p>
          </div>
        </details>

        <details class="tg-section">
          <summary class="tg-summary">Settings Reference</summary>
          <div class="tg-body">
            <table class="tg-table">
              <tr><th>Key</th><th>Default</th><th>Description</th></tr>
              <tr><td>backendUrl</td><td>auto</td><td>Override local backend URL (advanced)</td></tr>
              <tr><td>apiKey</td><td>—</td><td>Backend API key if server requires auth</td></tr>
              <tr><td>yukonBaseUrl</td><td>—</td><td>Yukon REST base URL</td></tr>
              <tr><td>yukonToken</td><td>—</td><td>Adobe IMS Bearer token</td></tr>
              <tr><td>yukonCollectionId</td><td>—</td><td>Target Yukon collection UUID</td></tr>
              <tr><td>yukonApiKey</td><td>—</td><td>Optional x-api-key header value</td></tr>
              <tr><td>yukonInferenceMode</td><td>STANDARD</td><td>LLM reasoning depth</td></tr>
              <tr><td>yukonResponseFormat</td><td>PARAGRAPH</td><td>Answer formatting preference</td></tr>
              <tr><td>yukonResponseStyle</td><td>DESCRIPTIVE</td><td>Tone/verbosity preference</td></tr>
              <tr><td>locale</td><td>en</td><td>UI language (en · es · it)</td></tr>
              <tr><td>theme</td><td>system</td><td>light · dark · system</td></tr>
            </table>
          </div>
        </details>

        <details class="tg-section">
          <summary class="tg-summary">Keyboard Shortcuts</summary>
          <div class="tg-body">
            <table class="tg-table">
              <tr><th>Shortcut</th><th>Action</th></tr>
              <tr><td><kbd class="tg-kbd">⌘ ,</kbd></td><td>Open Settings</td></tr>
              <tr><td><kbd class="tg-kbd">⌘ Y</kbd></td><td>Toggle Yukon chat panel</td></tr>
              <tr><td><kbd class="tg-kbd">⌘ U</kbd></td><td>Open file picker (upload PDFs)</td></tr>
              <tr><td><kbd class="tg-kbd">⌘ R</kbd></td><td>Clear current analysis</td></tr>
              <tr><td><kbd class="tg-kbd">Enter</kbd></td><td>Send Yukon message</td></tr>
              <tr><td><kbd class="tg-kbd">Shift Enter</kbd></td><td>New line in Yukon input</td></tr>
              <tr><td><kbd class="tg-kbd">Esc</kbd></td><td>Close modal / dismiss panel</td></tr>
            </table>
          </div>
        </details>

        <details class="tg-section">
          <summary class="tg-summary">Deployment &amp; Distribution</summary>
          <div class="tg-body">
            <ol class="tg-ol">
              <li>Bump version in <code>package.json</code> (follows semver).</li>
              <li>Run <code>npm run build:mac</code> — outputs a signed <code>.dmg</code> to <code>dist/</code>.</li>
              <li>Distribute <code>.dmg</code> via the internal software portal or direct download link.</li>
              <li>On first launch, Electron migrates stored settings from previous versions automatically.</li>
            </ol>
            <p class="tg-note"><strong>Note:</strong> The app is currently in <strong>Beta</strong>. Breaking changes to the report JSON schema may occur between minor versions.</p>
          </div>
        </details>

        <details class="tg-section">
          <summary class="tg-summary">Troubleshooting</summary>
          <div class="tg-body">
            <table class="tg-table">
              <tr><th>Symptom</th><th>Likely cause</th><th>Fix</th></tr>
              <tr><td>Yukon returns 401</td><td>IMS token expired</td><td>Paste a fresh Bearer token in Settings → Connections → Yukon</td></tr>
              <tr><td>Yukon returns 403</td><td>Wrong collection or missing permissions</td><td>Verify Collection ID and that your Adobe account has read access</td></tr>
              <tr><td>Analysis hangs</td><td>Backend not started</td><td>Restart the app; check Console for port-binding errors</td></tr>
              <tr><td>Score always 0</td><td>Encrypted or password-locked PDF</td><td>Unlock PDF before dropping it into the app</td></tr>
              <tr><td>Export fails silently</td><td>Write permission denied</td><td>Choose a writable destination folder</td></tr>
            </table>
          </div>
        </details>
      </div>
    `;
  }

  function _renderNotFound(body) {
    body.innerHTML = `<div style="color:var(--gray-500);padding:24px">Section not found.</div>`;
  }

  /* ── Shared save (all settings keys merged) ──────────────────────────────── */
  async function _saveAll(body) {
    const get = id => body?.querySelector(`#${id}`)?.value?.trim() ?? null;

    const backendUrl = get('pmBackendUrl') ?? _saved.backendUrl ?? '';
    const apiKey     = get('pmApiKey')     ?? _saved.apiKey     ?? '';

    if (_section === 'connection' && !backendUrl) {
      Toast.show(t('settings.backendRequired'), 'warning'); return;
    }

    // Only backend connection credentials are stored locally — Yukon settings live on the server
    const settings = { ..._saved, backendUrl, apiKey };
    try {
      if (window.electronAPI) await window.electronAPI.saveSettings(settings);
      _saved = settings;
      API.init(backendUrl, apiKey);
      Toast.show(t('toast.settingsSaved'), 'success');
    } catch (e) { Toast.show(e.message, 'error'); }
  }

  /* ── Utility ─────────────────────────────────────────────────────────────── */
  function _err(body, sel, msg) {
    const el = body.querySelector(sel); if (el) el.textContent = msg;
  }

  /* ── SVG icon helpers ────────────────────────────────────────────────────── */
  function iconPerson()    { return `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M18.571 10.0428C17.6051 9.25132 16.1178 9.35434 15.192 10.2821L11.0094 14.4647C10.7614 14.7123 10.5768 15.0204 10.4762 15.3553L9.52211 18.515C9.44203 18.7797 9.5143 19.0668 9.70961 19.2621C9.85219 19.4047 10.0436 19.4818 10.2399 19.4818C10.3122 19.4818 10.3854 19.4716 10.4567 19.4496L13.6149 18.496C13.9508 18.3949 14.2594 18.2108 14.5055 17.9633C14.5055 17.9633 18.6305 13.8387 18.7584 13.7103C19.2516 13.2176 19.5153 12.535 19.4801 11.8383C19.4459 11.1415 19.1139 10.4872 18.571 10.0428ZM11.362 17.6092L11.9128 15.788C11.9298 15.7306 11.9706 15.6861 12.0031 15.6363L13.3354 16.9685C13.2853 17.0013 13.2406 17.0422 13.1823 17.0599L11.362 17.6092ZM17.6969 12.6507C17.6042 12.744 15.4457 14.9022 14.2411 16.1066L12.8647 14.7306L16.2526 11.3426C16.4743 11.121 16.7653 11.0057 17.0456 11.0057C17.2555 11.0057 17.4587 11.0707 17.6217 11.204C17.8405 11.3827 17.9684 11.6346 17.9821 11.9125C17.9958 12.1908 17.8952 12.4525 17.6969 12.6507Z" fill="currentColor"/>
<path d="M8.99982 11.2497C6.38068 11.2497 4.24982 9.00653 4.24982 6.24969C4.24982 3.49285 6.38068 1.24969 8.99982 1.24969C11.619 1.24969 13.7498 3.49285 13.7498 6.24969C13.7498 9.00653 11.619 11.2497 8.99982 11.2497ZM8.99982 2.74969C7.20783 2.74969 5.74982 4.32 5.74982 6.24969C5.74982 8.17938 7.20783 9.74969 8.99982 9.74969C10.7918 9.74969 12.2498 8.17938 12.2498 6.24969C12.2498 4.32 10.7918 2.74969 8.99982 2.74969Z" fill="currentColor"/>
<path d="M1.75079 18.7497C1.72686 18.7497 1.70245 18.7487 1.67804 18.7458C1.26544 18.7067 0.963681 18.3405 1.00324 17.9274C1.30988 14.7438 4.82258 12.2497 8.99982 12.2497C9.24787 12.2497 9.49298 12.2585 9.7342 12.2751C10.1473 12.3034 10.4588 12.6618 10.43 13.0749C10.4012 13.488 10.0487 13.7858 9.62971 13.7712C9.42268 13.7565 9.21272 13.7497 8.99983 13.7497C5.58674 13.7497 2.72981 15.6481 2.49641 18.072C2.45881 18.4597 2.13263 18.7497 1.75079 18.7497Z" fill="currentColor"/>
</svg>

    `; }
  function iconPalette()   { return `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<g clip-path="url(#clip0_353_596)">
<path d="M10 2.24122C9.58594 2.24122 9.25 1.90528 9.25 1.49122V0.791016C9.25 0.376956 9.58594 0.0410156 10 0.0410156C10.4141 0.0410156 10.75 0.376956 10.75 0.791016V1.49122C10.75 1.90528 10.4141 2.24122 10 2.24122Z" fill="currentColor"/>
<path d="M18.4541 10.0215H17.7539C17.3398 10.0215 17.0039 9.68554 17.0039 9.27148C17.0039 8.85742 17.3398 8.52148 17.7539 8.52148H18.4541C18.8682 8.52148 19.2041 8.85742 19.2041 9.27148C19.2041 9.68554 18.8682 10.0215 18.4541 10.0215Z" fill="currentColor"/>
<path d="M2.23243 10.0215H1.53223C1.11817 10.0215 0.782227 9.68554 0.782227 9.27148C0.782227 8.85742 1.11817 8.52148 1.53223 8.52148H2.23243C2.64649 8.52148 2.98243 8.85742 2.98243 9.27148C2.98243 9.68554 2.64649 10.0215 2.23243 10.0215Z" fill="currentColor"/>
<path d="M4.51074 4.53907C4.31836 4.53907 4.12695 4.46583 3.98047 4.31934L3.48535 3.82422C3.19238 3.53125 3.19238 3.05664 3.48535 2.76367C3.77832 2.4707 4.25293 2.4707 4.5459 2.76367L5.04102 3.25879C5.33399 3.55176 5.33399 4.02637 5.04102 4.31934C4.89454 4.46582 4.70312 4.53907 4.51074 4.53907Z" fill="currentColor"/>
<path d="M15.4756 4.53907C15.2832 4.53907 15.0918 4.46583 14.9453 4.31934C14.6523 4.02637 14.6523 3.55176 14.9453 3.25879L15.4404 2.76367C15.7334 2.4707 16.208 2.4707 16.501 2.76367C16.794 3.05664 16.794 3.53125 16.501 3.82422L16.0059 4.31934C15.8594 4.46582 15.668 4.53907 15.4756 4.53907Z" fill="currentColor"/>
<path d="M16 9.5C16 6.19141 13.3086 3.5 10 3.5C6.69141 3.5 4 6.19141 4 9.5C4 11.7157 5.21021 13.6499 7.00122 14.689C7.00122 14.6913 7 14.6931 7 14.6953V16.5C7 18.1543 8.3457 19.5 10 19.5C11.6543 19.5 13 18.1543 13 16.5V14.6882C14.7904 13.6489 16 11.7151 16 9.5ZM11.5 16.5C11.5 17.3272 10.8271 18 10 18C9.17285 18 8.5 17.3272 8.5 16.5V15.3025C8.98047 15.4269 9.4812 15.5 10 15.5C10.5188 15.5 11.0195 15.4269 11.5 15.3025V16.5ZM10 14C7.51855 14 5.5 11.9815 5.5 9.5C5.5 7.01855 7.51855 5 10 5C12.4815 5 14.5 7.01855 14.5 9.5C14.5 11.9815 12.4815 14 10 14Z" fill="currentColor"/>
</g>
<defs>
<clipPath id="clip0_353_596">
<rect width="20" height="20" fill="white"/>
</clipPath>
</defs>
</svg>

    `; }
  function iconGlobe()     { return `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12.25 2.5H7.83398V1.75C7.83398 1.33594 7.49804 1 7.08398 1C6.66992 1 6.33398 1.33594 6.33398 1.75V2.5H1.75C1.33594 2.5 1 2.83594 1 3.25C1 3.66406 1.33594 4 1.75 4H9.62756C9.17071 6.271 7.79168 7.87573 6.27166 8.93359C5.79333 8.06543 5.42852 7.17382 5.20409 6.28906C5.10253 5.88769 4.69384 5.64062 4.29247 5.74707C3.8911 5.84863 3.64843 6.25684 3.74999 6.6582C4.00866 7.67773 4.42656 8.70288 4.97844 9.69677C4.18498 10.0923 3.41539 10.3572 2.7827 10.499C2.3784 10.5889 2.12401 10.9902 2.21434 11.3945C2.29246 11.7432 2.60204 11.9805 2.94579 11.9805C2.99999 11.9805 3.05517 11.9746 3.10985 11.9619C3.87621 11.7905 4.81487 11.4631 5.77873 10.9661C6.60264 12.1567 7.60875 13.2773 8.76707 14.25C8.90769 14.3682 9.07908 14.4258 9.249 14.4258C9.46287 14.4258 9.67527 14.335 9.82371 14.1582C10.0903 13.8408 10.0488 13.3682 9.73191 13.1016C8.7006 12.2354 7.80491 11.2442 7.06791 10.1956C8.94627 8.90577 10.6705 6.90259 11.1558 4H12.25C12.664 4 13 3.66406 13 3.25C13 2.83594 12.6641 2.5 12.25 2.5Z" fill="currentColor"/>
<path d="M18.9409 17.958L14.9219 8.45801C14.8042 8.18067 14.5322 8 14.231 8C13.9297 8 13.6577 8.18066 13.54 8.45801L9.52051 17.958C9.35938 18.3389 9.5376 18.7793 9.91895 18.9404C10.3032 19.1055 10.7412 18.9238 10.9024 18.542L12.1829 15.5156H16.2788L17.5591 18.542C17.6802 18.8281 17.958 19 18.2505 19C18.3477 19 18.4468 18.9815 18.542 18.9404C18.9238 18.7793 19.1021 18.3389 18.9409 17.958ZM12.8175 14.0156L14.231 10.6748L15.6442 14.0156H12.8175Z" fill="currentColor"/>
</svg>

    `; }
  function iconServer()    { return `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M18.7315 12.8887L18.0405 12.8281C17.9536 12.6445 17.853 12.4678 17.7393 12.2998L18.0371 11.6748C18.3394 11.041 18.1011 10.2685 17.4951 9.91502L17.0147 9.63475C16.4072 9.28026 15.6167 9.45409 15.2158 10.0293L14.8189 10.5947C14.7188 10.5869 14.6172 10.582 14.5147 10.581C14.4048 10.5703 14.3101 10.585 14.209 10.5928L13.8179 10.0225C13.4141 9.43554 12.6426 9.25878 12.022 9.61327L11.5401 9.88866C10.9297 10.2373 10.6851 11.0078 10.9819 11.6426L11.2739 12.2705C11.1587 12.4375 11.0566 12.6133 10.9683 12.7969L10.2783 12.8516C9.57766 12.9053 9.02736 13.498 9.02443 14.2002L9.02199 14.7568C9.01857 15.459 9.56349 16.0566 10.2627 16.1182L10.9531 16.1787C11.0396 16.3623 11.1406 16.5391 11.2544 16.707L10.9566 17.3311C10.6538 17.9648 10.8921 18.7383 11.499 19.0918L11.9795 19.3721C12.586 19.7236 13.375 19.5518 13.7783 18.9775L14.1743 18.4111C14.2749 18.4199 14.3765 18.4248 14.4795 18.4258C14.5762 18.418 14.6836 18.4219 14.7847 18.4141L15.1763 18.9844C15.437 19.3633 15.8662 19.5713 16.3023 19.5713C16.5313 19.5713 16.7617 19.5137 16.9717 19.3935L17.4536 19.1182C18.063 18.7705 18.3081 18 18.0122 17.3633L17.7197 16.7344C17.8355 16.5683 17.9375 16.3926 18.0254 16.21L18.7168 16.1553C19.4165 16.0996 19.9663 15.5068 19.9693 14.8057L19.9717 14.249C19.9751 13.5478 19.4302 12.9502 18.7315 12.8887ZM18.7192 14.8008C18.7192 14.8564 18.6743 14.9043 18.6187 14.9092L17.5483 14.9932C17.3027 15.0127 17.0918 15.1738 17.0088 15.4053C16.898 15.7158 16.7334 15.998 16.5195 16.2461C16.3589 16.4326 16.3223 16.6953 16.4263 16.918L16.8789 17.8906C16.9033 17.9424 16.8843 18.0039 16.8335 18.0332L16.3511 18.3086C16.3013 18.3369 16.2383 18.3223 16.2066 18.2754L15.5986 17.3916C15.4805 17.2207 15.2871 17.1211 15.0835 17.1211C15.0469 17.1211 15.0098 17.124 14.9727 17.1309C14.8179 17.1592 14.6592 17.1758 14.4966 17.1758C14.311 17.1631 14.1597 17.1572 13.9981 17.126C13.7559 17.083 13.5103 17.1807 13.3691 17.3818L12.7544 18.2598C12.7217 18.3067 12.6582 18.3193 12.6089 18.292L12.1284 18.0117C12.0791 17.9834 12.0601 17.9209 12.0845 17.8701L12.5464 16.9024C12.6523 16.6797 12.6182 16.417 12.4595 16.2285C12.2476 15.9785 12.085 15.6944 11.977 15.3838C11.896 15.1514 11.6865 14.9873 11.4414 14.9658L10.3716 14.8721C10.3154 14.8672 10.2715 14.8194 10.272 14.7627L10.2744 14.2051C10.2744 14.1494 10.3184 14.1025 10.3755 14.0977L11.4458 14.0127C11.6909 13.9932 11.9018 13.832 11.9849 13.6006C12.0962 13.29 12.2607 13.0068 12.4741 12.7598C12.6348 12.5742 12.6714 12.3106 12.5674 12.0879L12.1147 11.1143C12.0903 11.0625 12.1099 11.0029 12.1601 10.9736L12.6421 10.6983C12.6919 10.6709 12.7549 10.6846 12.7876 10.7305L13.395 11.6153C13.5342 11.8164 13.7764 11.918 14.021 11.876C14.1758 11.8477 14.3349 11.8311 14.4975 11.8311C14.6587 11.8408 14.8354 11.8496 14.9985 11.8799C15.2422 11.9239 15.4839 11.8252 15.624 11.624L16.2397 10.7461C16.2724 10.6992 16.3349 10.6846 16.3848 10.7149L16.8652 10.9951C16.915 11.0235 16.9336 11.085 16.9087 11.1367L16.4473 12.1055C16.3418 12.3272 16.376 12.5899 16.5342 12.7774C16.7461 13.0283 16.9087 13.3125 17.0166 13.6231C17.0976 13.8545 17.3071 14.0176 17.5517 14.0401L18.6221 14.1348C18.6792 14.1397 18.7222 14.1856 18.7217 14.2432L18.7192 14.8008Z" fill="currentColor"/>
<path d="M14.5018 13.3922C13.8882 13.3895 13.3887 13.8848 13.3859 14.4983C13.3832 15.1118 13.8784 15.6115 14.4919 15.6141C15.1055 15.617 15.6051 15.1216 15.6078 14.5081C15.6105 13.8945 15.1153 13.395 14.5018 13.3922Z" fill="currentColor"/>
<path d="M7.82617 16.3975C4.72265 16.083 3.55127 15.249 3.49707 15.0029V11.8562C4.74213 12.478 6.45752 12.7527 7.42139 12.8623C7.4502 12.8652 7.47852 12.8672 7.50684 12.8672C7.8833 12.8672 8.20752 12.585 8.25098 12.2021C8.29786 11.79 8.00196 11.4189 7.59034 11.3721C4.65626 11.0391 3.54835 10.2363 3.49708 10.0029V6.72742C5.02693 7.56958 7.52101 8.00293 9.99708 8.00293C12.4732 8.00293 14.9672 7.56958 16.4971 6.72742V7.34668C16.4971 7.76074 16.833 8.09668 17.2471 8.09668C17.6611 8.09668 17.9971 7.76074 17.9971 7.34668V5.06445C17.9971 5.02343 17.9801 4.98816 17.9738 4.94897C17.9816 4.88366 17.9971 4.82031 17.9971 4.75293C17.9971 2.61914 13.9727 1.50293 9.99708 1.50293C6.02149 1.50293 1.99707 2.61915 1.99707 4.75294C1.99707 4.82032 2.01251 4.88368 2.02039 4.94898C2.01404 4.98816 1.99707 5.02344 1.99707 5.06446V15.0029C1.99707 17.1484 6.34277 17.7549 7.6748 17.8897C7.70068 17.8926 7.72607 17.8936 7.75146 17.8936C8.13183 17.8936 8.45751 17.6055 8.49658 17.2188C8.53857 16.8067 8.23828 16.4395 7.82617 16.3975ZM9.99707 3.00294C14.2856 3.00294 16.4971 4.2295 16.4971 4.75294C16.4971 5.27638 14.2856 6.50294 9.99707 6.50294C5.7085 6.50294 3.49707 5.27638 3.49707 4.75294C3.49707 4.2295 5.7085 3.00294 9.99707 3.00294Z" fill="currentColor"/>
</svg>
    `; }
  function iconSparkle()   { return `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M16 8.75C16.4142 8.75 16.75 8.41421 16.75 8C16.75 7.58579 16.4142 7.25 16 7.25C15.5858 7.25 15.25 7.58579 15.25 8C15.25 8.41421 15.5858 8.75 16 8.75Z" fill="currentColor"/>
<path d="M11.5 9.875C10.7417 9.875 10.125 9.2583 10.125 8.5C10.125 7.7417 10.7417 7.125 11.5 7.125C12.2583 7.125 12.875 7.7417 12.875 8.5C12.875 9.2583 12.2583 9.875 11.5 9.875ZM11.5 8.125C11.2935 8.125 11.125 8.29346 11.125 8.5C11.125 8.70654 11.2935 8.875 11.5 8.875C11.7065 8.875 11.875 8.70654 11.875 8.5C11.875 8.29346 11.7065 8.125 11.5 8.125Z" fill="currentColor"/>
<path d="M15.75 11H4.99475L10.7134 4.3657C11.4951 3.45847 11.4424 2.12644 10.5947 1.39597L10.2725 1.11863C9.85108 0.75486 9.30176 0.59519 8.73144 0.66795C8.18896 0.7368 7.68701 1.01072 7.31835 1.43895L1.43945 8.25975C0.657224 9.16698 0.710454 10.4985 1.55713 11.2285L1.87988 11.5068C2.06311 11.6648 2.27075 11.7827 2.49316 11.8615C2.1892 12.2452 2 12.7236 2 13.25V16.25C2 17.7666 3.2334 19 4.75 19H15.25C16.7666 19 18 17.7666 18 16.25V13.25C18 12.0093 16.9907 11 15.75 11ZM2.5752 9.23924L8.45411 2.41844C8.58106 2.27147 8.74708 2.17772 8.9214 2.15574C8.94142 2.1533 8.96632 2.15086 8.99415 2.15086C9.08058 2.15086 9.19582 2.17088 9.29348 2.25486L9.61574 2.5322C9.83254 2.71921 9.81545 3.11032 9.57765 3.3862L3.69826 10.207C3.57131 10.354 3.40529 10.4477 3.23097 10.4697C3.1504 10.4799 2.98829 10.4814 2.85939 10.3711L2.53664 10.0927C2.31984 9.90574 2.3379 9.51512 2.5752 9.23924ZM16.5 16.25C16.5 16.9394 15.9395 17.5 15.25 17.5H4.75C4.06055 17.5 3.5 16.9394 3.5 16.25V13.25C3.5 12.8364 3.83643 12.5 4.25 12.5H15.75C16.1636 12.5 16.5 12.8364 16.5 13.25V16.25Z" fill="currentColor"/>
<path d="M11.5 15.5H8.5C8.08594 15.5 7.75 15.1641 7.75 14.75C7.75 14.3359 8.08594 14 8.5 14H11.5C11.9141 14 12.25 14.3359 12.25 14.75C12.25 15.1641 11.9141 15.5 11.5 15.5Z" fill="currentColor"/>
<path d="M14.6275 5.94675C14.5235 5.94675 14.4199 5.92087 14.3272 5.8696C14.1817 5.79001 14.0737 5.65573 14.0274 5.49704L13.271 2.90475C13.1743 2.57321 13.3648 2.22604 13.6958 2.12936L16.2876 1.37301C16.6211 1.27682 16.9663 1.46676 17.063 1.79781L17.8194 4.38961C17.916 4.72115 17.7256 5.06832 17.3946 5.165L14.8028 5.92184C14.7451 5.93844 14.686 5.94675 14.6275 5.94675ZM14.646 3.15427L15.0523 4.54636L16.4444 4.14011L16.0381 2.74802L14.646 3.15427Z" fill="currentColor"/>
</svg>

    `; }
  function iconLock()      { return `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M1.75 6.77148H4.4187C4.75934 8.20166 6.03998 9.27148 7.57275 9.27148C9.10552 9.27148 10.3862 8.20166 10.7268 6.77148H18.25C18.6641 6.77148 19 6.43554 19 6.02148C19 5.60742 18.6641 5.27148 18.25 5.27148H10.7268C10.3862 3.8413 9.10552 2.77148 7.57275 2.77148C6.03998 2.77148 4.75933 3.8413 4.4187 5.27148H1.75C1.33594 5.27148 1 5.60742 1 6.02148C1 6.43554 1.33594 6.77148 1.75 6.77148ZM7.57275 4.27148C8.53759 4.27148 9.32275 5.05664 9.32275 6.02148C9.32275 6.98632 8.53759 7.77148 7.57275 7.77148C6.60791 7.77148 5.82275 6.98632 5.82275 6.02148C5.82275 5.05664 6.60791 4.27148 7.57275 4.27148Z" fill="currentColor"/>
<path d="M18.25 13.2715H15.7268C15.3862 11.8413 14.1055 10.7715 12.5728 10.7715C11.04 10.7715 9.75934 11.8413 9.41871 13.2715H1.75C1.33594 13.2715 1 13.6074 1 14.0215C1 14.4355 1.33594 14.7715 1.75 14.7715H9.4187C9.75934 16.2017 11.04 17.2715 12.5728 17.2715C14.1055 17.2715 15.3862 16.2017 15.7268 14.7715H18.25C18.6641 14.7715 19 14.4355 19 14.0215C19 13.6074 18.6641 13.2715 18.25 13.2715ZM12.5728 15.7715C11.6079 15.7715 10.8228 14.9863 10.8228 14.0215C10.8228 13.0566 11.6079 12.2715 12.5728 12.2715C13.5376 12.2715 14.3228 13.0566 14.3228 14.0215C14.3228 14.9863 13.5376 15.7715 12.5728 15.7715Z" fill="currentColor"/>
</svg>

    `; }
  function iconKeyboard()  { return `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M16.75 15H3.25C2.00928 15 1 13.9902 1 12.75V6.25C1 5.00977 2.00928 4 3.25 4H16.75C17.9907 4 19 5.00977 19 6.25V12.75C19 13.9902 17.9907 15 16.75 15ZM3.25 5.5C2.83643 5.5 2.5 5.83691 2.5 6.25V12.75C2.5 13.1631 2.83643 13.5 3.25 13.5H16.75C17.1636 13.5 17.5 13.1631 17.5 12.75V6.25C17.5 5.83691 17.1636 5.5 16.75 5.5H3.25Z" fill="currentColor"/>
<path d="M12.25 12H7.75C7.33594 12 7 11.6641 7 11.25C7 10.8359 7.33594 10.5 7.75 10.5H12.25C12.6641 10.5 13 10.8359 13 11.25C13 11.6641 12.6641 12 12.25 12Z" fill="currentColor"/>
<path d="M5 9C5.55228 9 6 8.55228 6 8C6 7.44772 5.55228 7 5 7C4.44772 7 4 7.44772 4 8C4 8.55228 4.44772 9 5 9Z" fill="currentColor"/>
<path d="M8.33334 9C8.88563 9 9.33334 8.55228 9.33334 8C9.33334 7.44772 8.88563 7 8.33334 7C7.78106 7 7.33334 7.44772 7.33334 8C7.33334 8.55228 7.78106 9 8.33334 9Z" fill="currentColor"/>
<path d="M11.6667 9C12.2189 9 12.6667 8.55228 12.6667 8C12.6667 7.44772 12.2189 7 11.6667 7C11.1144 7 10.6667 7.44772 10.6667 8C10.6667 8.55228 11.1144 9 11.6667 9Z" fill="currentColor"/>
<path d="M15 9C15.5523 9 16 8.55228 16 8C16 7.44772 15.5523 7 15 7C14.4477 7 14 7.44772 14 8C14 8.55228 14.4477 9 15 9Z" fill="currentColor"/>
<path d="M5 12C5.55228 12 6 11.5523 6 11C6 10.4477 5.55228 10 5 10C4.44772 10 4 10.4477 4 11C4 11.5523 4.44772 12 5 12Z" fill="currentColor"/>
<path d="M15 12C15.5523 12 16 11.5523 16 11C16 10.4477 15.5523 10 15 10C14.4477 10 14 10.4477 14 11C14 11.5523 14.4477 12 15 12Z" fill="currentColor"/>
</svg>

    `; }
  function iconExtension() { return `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M16.75 4H16V3.24902C16 2.28418 15.2148 1.49902 14.25 1.49902H12.75C11.7852 1.49902 11 2.28418 11 3.24902V4H9V3.24902C9 2.28418 8.21484 1.49902 7.25 1.49902H5.75C4.78516 1.49902 4 2.28418 4 3.24902V4H3.25C2.00928 4 1 5.00977 1 6.25V14.75C1 15.9902 2.00928 17 3.25 17H16.75C17.9907 17 19 15.9902 19 14.75V6.25C19 5.00977 17.9907 4 16.75 4ZM12.5 3.24902C12.5 3.11132 12.6123 2.99902 12.75 2.99902H14.25C14.3877 2.99902 14.5 3.11132 14.5 3.24902V4H12.5V3.24902ZM5.5 3.24902C5.5 3.11132 5.6123 2.99902 5.75 2.99902H7.25C7.3877 2.99902 7.5 3.11132 7.5 3.24902V4H5.5V3.24902ZM17.5 14.75C17.5 15.1631 17.1636 15.5 16.75 15.5H3.25C2.83643 15.5 2.5 15.1631 2.5 14.75V6.25C2.5 5.83691 2.83643 5.5 3.25 5.5H16.75C17.1636 5.5 17.5 5.83691 17.5 6.25V14.75Z" fill="currentColor"/>
</svg>

    `; }
  function iconEmail()     { return `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M16.75 2.99316H3.25C2.00977 2.99316 1 4.00293 1 5.24316V14.7432C1 15.9834 2.00977 16.9932 3.25 16.9932H16.75C17.9902 16.9932 19 15.9834 19 14.7432V5.24316C19 4.00293 17.9902 2.99316 16.75 2.99316ZM16.3293 4.49316L10.4922 9.57617C10.2129 9.82031 9.78809 9.82031 9.50684 9.57617L3.67065 4.49316H16.3293ZM16.75 15.4932H3.25C2.83691 15.4932 2.5 15.1563 2.5 14.7432V5.46191L8.52148 10.707C8.94336 11.0742 9.47168 11.2578 10 11.2578C10.5283 11.2578 11.0566 11.0742 11.4775 10.707L17.5 5.46191V14.7432C17.5 15.1563 17.1631 15.4932 16.75 15.4932Z" fill="currentColor"/>
</svg>

    `; }
  function iconStar()      { return `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 2l2.39 4.84 5.34.78-3.87 3.77.91 5.32L10 14.27l-4.77 2.44.91-5.32L2.27 7.62l5.34-.78L10 2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
    </svg>
    `; }

  function iconBook()      { return `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 3h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.4"/>
      <path d="M7 3v13M10 7h3M10 10h3M10 13h2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>
    `; }

  function iconRefresh()   { return `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M18.2065 3.89745C17.8013 3.80272 17.3984 4.04784 17.3013 4.45116L16.9208 6.02587C15.5231 3.59399 12.919 2.02148 10 2.02148C6.31544 2.02148 3.12452 4.52148 2.24073 8.10156C2.14112 8.5039 2.38673 8.91015 2.78907 9.00976C3.19044 9.10937 3.59766 8.86328 3.69678 8.46093C4.41504 5.55273 7.00684 3.52148 10 3.52148C12.5168 3.52148 14.735 4.96777 15.809 7.1538L13.7065 6.6455C13.3032 6.55175 12.8989 6.79589 12.8013 7.19921C12.7041 7.60155 12.9517 8.00683 13.354 8.10448L16.5992 8.88866C16.724 8.97728 16.8729 9.03124 17.0308 9.03124C17.0903 9.03124 17.1509 9.0244 17.2109 9.00976C17.2592 8.9978 17.2968 8.96874 17.3401 8.94872C17.4097 8.93017 17.4835 8.92919 17.5459 8.89061C17.7153 8.78709 17.8369 8.6201 17.8838 8.42674L18.7593 4.80272C18.8564 4.40038 18.6089 3.9951 18.2065 3.89745Z" fill="currentColor"/>
<path d="M17.2109 11.0322C16.8139 10.9355 16.4028 11.1787 16.3032 11.5811C15.5849 14.4902 12.9931 16.5215 9.99998 16.5215C7.48295 16.5215 5.26475 15.075 4.19084 12.8879L6.29344 13.3965C6.69627 13.4883 7.10155 13.2461 7.19871 12.8428C7.29588 12.4404 7.04832 12.0352 6.64598 11.9375L3.39104 11.1509C3.22002 11.0327 3.00573 10.9795 2.78905 11.0322C2.77385 11.0361 2.76305 11.0469 2.74834 11.0515C2.64513 11.0647 2.54442 11.0957 2.45409 11.1514C2.28466 11.2549 2.16307 11.4219 2.1162 11.6152L1.24071 15.2393C1.14354 15.6416 1.3911 16.0469 1.79344 16.1445C1.85301 16.1582 1.91209 16.165 1.9702 16.165C2.30858 16.165 2.61571 15.9346 2.69872 15.5908L3.07915 14.0161C4.47679 16.4482 7.08104 18.0215 9.99999 18.0215C13.6846 18.0215 16.8755 15.5205 17.7593 11.9404C17.8589 11.5381 17.6133 11.1318 17.2109 11.0322Z" fill="currentColor"/>
</svg>

    `; }

  return { open, close };
})();
