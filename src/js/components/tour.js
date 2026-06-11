/* Tour — first-time user walkthrough
 *
 * Renders a spotlight overlay that highlights each UI element in turn,
 * with a tooltip card explaining what it does.
 *
 * State is persisted in localStorage so the tour only auto-starts once.
 * Call Tour.start() to re-launch it manually (e.g. from Settings).
 *
 * Public API:
 *   Tour.startIfNew()  — auto-start only if the tour has never been completed
 *   Tour.start(step?)  — launch immediately at the given step (default 0)
 *   Tour.reset()       — clear the "done" flag (next startIfNew() will show it again)
 *   Tour.isDone()      — returns true if the user has already completed the tour
 */
const Tour = (() => {
  const DONE_KEY = 'hcapp_tour_done';

  /* ── Step definitions ──────────────────────────────────────────────────── */
  const STEPS = [
    {
      target: null,
      title:  'Welcome to PDF Health Check',
      body:   'This quick tour walks you through the main features — it takes less than a minute. You can skip at any time and restart it from Preferences → Restart tour.',
    },
    {
      target: '#userProfileChip',
      title:  'Your Profile & Preferences',
      body:   'Click your avatar to open Preferences — set your name and Adobe email, pick a theme, switch language, manage your backend connection, and access all app settings from one place.',
    },
    {
      target: '#createBtn',
      title:  'Create New',
      body:   'Your main entry point. Start a new Health Check for a customer, or add a new Customer to your list. Use <kbd style="font-family:monospace;background:var(--gray-100);padding:1px 4px;border-radius:3px">⌘N</kbd> as a shortcut.',
    },
    {
      target: '[data-view="dashboard"]',
      title:  'Dashboard',
      body:   'Your home base. Real-time KPIs — total PDFs analysed, average scores, accessibility trends, PII exposure and a geographic breakdown of your customers.',
    },
    {
      target: '[data-view="customers"]',
      title:  'Customers',
      body:   'Manage the Adobe accounts you work with. Add logos, regions, verticals and segments to keep everything organised and easily filterable.',
    },
    {
      target: '[data-view="healthchecks"]',
      title:  'Health Checks',
      body:   'A Health Check is a batch of PDFs analysed together for one customer. Upload PDFs to get instant quality scoring, detailed accessibility analysis and author PII detection.',
    },
    {
      target: '[data-view="reports"]',
      title:  'Reports',
      body:   'Surface patterns across all Health Checks — top accessibility issues, PII exposure, score distributions, timelines and breakdowns by region or vertical.',
    },
    {
      target: '[data-view="exec"]',
      title:  'Executive View',
      body:   'Generate a polished portfolio summary across multiple customers and health checks — ideal for sharing with management or stakeholders.',
    },
    {
      target: '#yukonChatBtn',
      title:  'AI Chat — Adobe Yukon',
      body:   'Ask the AI assistant questions about your health checks in natural language. When you\'re viewing a specific health check the chat automatically uses it as context, and suggests relevant prompts to get you started. Press <kbd style="font-family:monospace;background:var(--gray-100);padding:1px 4px;border-radius:3px">⌘⇧A</kbd> to toggle.',
    },
    {
      target: '#settingsNavBtn',
      title:  'Preferences',
      body:   'Configure your backend connection, Adobe Yukon AI, profile, appearance and language — all in one place. Also sign in as admin to adjust scoring weights and crawler settings. Press <kbd style="font-family:monospace;background:var(--gray-100);padding:1px 4px;border-radius:3px">⌘,</kbd> to open.',
    },
  ];

  /* ── State ─────────────────────────────────────────────────────────────── */
  let _step     = 0;
  let _overlay  = null;
  let _resizeTm = null;

  /* ── Public API ─────────────────────────────────────────────────────────── */
  function isDone()    { return localStorage.getItem(DONE_KEY) === '1'; }
  function reset()     { localStorage.removeItem(DONE_KEY); }
  function _markDone() { localStorage.setItem(DONE_KEY, '1'); }

  function startIfNew() {
    if (!isDone()) setTimeout(() => start(0), 900);
  }

  function start(step = 0) {
    _step = step;
    _build();
    _render();
  }

  /* ── DOM construction ───────────────────────────────────────────────────── */
  function _build() {
    _teardown();

    _overlay = document.createElement('div');
    _overlay.id = 'tourOverlay';
    _overlay.innerHTML = `
      <svg id="tourSvg" class="tour-svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <mask id="tourMask">
            <rect id="tourMaskBg"  fill="white"/>
            <rect id="tourMaskHole" rx="10" fill="black"/>
          </mask>
        </defs>
        <rect id="tourDim" class="tour-dim" mask="url(#tourMask)"/>
        <rect id="tourGlow" class="tour-glow" rx="10" fill="none"/>
      </svg>
      <div id="tourCard" class="tour-card" role="dialog" aria-modal="true" aria-label="Product tour">
        <button class="tour-card-close" id="tourClose" aria-label="Skip tour" title="Skip tour">
          <svg viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        </button>
        <div class="tour-progress-wrap" id="tourProgress"></div>
        <div class="tour-title"  id="tourTitle"></div>
        <div class="tour-body"   id="tourBody"></div>
        <div class="tour-footer">
          <button class="tour-btn-skip" id="tourSkip">Skip tour</button>
          <div class="tour-btn-group">
            <button class="tour-btn-back" id="tourPrev">Back</button>
            <button class="tour-btn-next" id="tourNext">Next</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(_overlay);

    document.getElementById('tourClose').addEventListener('click', _finish);
    document.getElementById('tourSkip').addEventListener('click', _finish);
    document.getElementById('tourPrev').addEventListener('click', () => _go(_step - 1));
    document.getElementById('tourNext').addEventListener('click', () => {
      if (_step === STEPS.length - 1) _finish(); else _go(_step + 1);
    });

    window.addEventListener('keydown', _onKey);
    window.addEventListener('resize',  _onResize);
  }

  /* ── Rendering ──────────────────────────────────────────────────────────── */
  function _go(idx) {
    _step = Math.max(0, Math.min(STEPS.length - 1, idx));
    _render();
  }

  function _render() {
    if (!_overlay) return;
    const step    = STEPS[_step];
    const isFirst = _step === 0;
    const isLast  = _step === STEPS.length - 1;

    // Progress dots
    document.getElementById('tourProgress').innerHTML =
      STEPS.map((_, i) =>
        `<span class="tour-dot${i === _step ? ' active' : ''}"></span>`
      ).join('');

    // Text
    document.getElementById('tourTitle').textContent = step.title;
    document.getElementById('tourBody').innerHTML    = step.body;

    // Buttons
    const prevBtn = document.getElementById('tourPrev');
    const nextBtn = document.getElementById('tourNext');
    prevBtn.style.visibility = isFirst ? 'hidden' : '';
    nextBtn.textContent      = isLast  ? 'Done' : 'Next';
    nextBtn.classList.toggle('tour-btn-next-last', isLast);

    // Spotlight & card position (wait one frame so card height is measured)
    requestAnimationFrame(() => {
      _updateSpotlight(step);
      _positionCard(step);
      // Fade-in animation
      const card = document.getElementById('tourCard');
      if (card) {
        card.classList.remove('tour-card-visible');
        void card.offsetWidth;
        card.classList.add('tour-card-visible');
      }
    });
  }

  /* ── Spotlight (SVG mask approach) ─────────────────────────────────────── */
  function _updateSpotlight(step) {
    const svg   = document.getElementById('tourSvg');
    const dim   = document.getElementById('tourDim');
    const bg    = document.getElementById('tourMaskBg');
    const hole  = document.getElementById('tourMaskHole');
    const glow  = document.getElementById('tourGlow');
    const W     = window.innerWidth;
    const H     = window.innerHeight;

    svg.setAttribute('width',   W);
    svg.setAttribute('height',  H);
    bg.setAttribute('width',    W);
    bg.setAttribute('height',   H);
    dim.setAttribute('width',   W);
    dim.setAttribute('height',  H);

    const el = step.target ? document.querySelector(step.target) : null;

    if (!el) {
      // No spotlight — hide hole and glow
      hole.setAttribute('width',  0);
      hole.setAttribute('height', 0);
      glow.setAttribute('width',  0);
      glow.setAttribute('height', 0);
      return;
    }

    const r   = el.getBoundingClientRect();
    const pad = 8;
    const x   = r.left   - pad;
    const y   = r.top    - pad;
    const w   = r.width  + pad * 2;
    const h   = r.height + pad * 2;

    // Mask hole (black inside mask = transparent in result)
    hole.setAttribute('x', x); hole.setAttribute('y', y);
    hole.setAttribute('width', w); hole.setAttribute('height', h);

    // Glow ring around the spotlight
    glow.setAttribute('x', x - 1); glow.setAttribute('y', y - 1);
    glow.setAttribute('width', w + 2); glow.setAttribute('height', h + 2);
    glow.setAttribute('rx', 11);
  }

  /* ── Card positioning ───────────────────────────────────────────────────── */
  function _positionCard(step) {
    const card = document.getElementById('tourCard');
    if (!card) return;

    const W   = window.innerWidth;
    const H   = window.innerHeight;
    const pad = 20;
    const CW  = 320;
    const CH  = card.offsetHeight || 230;
    const gap = 20;

    // Reset inline styles
    card.style.left      = '';
    card.style.top       = '';
    card.style.right     = '';
    card.style.bottom    = '';
    card.style.transform = '';

    const el = step.target ? document.querySelector(step.target) : null;

    if (!el) {
      card.style.left      = '50%';
      card.style.top       = '50%';
      card.style.transform = 'translate(-50%, -50%)';
      return;
    }

    const r = el.getBoundingClientRect();

    function clampX(l) { return Math.max(pad, Math.min(W - CW - pad, l)); }
    function clampY(t) { return Math.max(pad, Math.min(H - CH - pad, t)); }
    const midY = r.top + r.height / 2 - CH / 2;
    const midX = r.left + r.width / 2 - CW / 2;

    // Prefer right
    if (r.right + gap + CW < W - pad) {
      card.style.left = (r.right + gap) + 'px';
      card.style.top  = clampY(midY) + 'px';
      return;
    }
    // Left
    if (r.left - gap - CW > pad) {
      card.style.left = (r.left - gap - CW) + 'px';
      card.style.top  = clampY(midY) + 'px';
      return;
    }
    // Below
    if (r.bottom + gap + CH < H - pad) {
      card.style.top  = (r.bottom + gap) + 'px';
      card.style.left = clampX(midX) + 'px';
      return;
    }
    // Above
    if (r.top - gap - CH > pad) {
      card.style.top  = (r.top - gap - CH) + 'px';
      card.style.left = clampX(midX) + 'px';
      return;
    }
    // Fallback: center
    card.style.left      = '50%';
    card.style.top       = '50%';
    card.style.transform = 'translate(-50%, -50%)';
  }

  /* ── Event handlers ─────────────────────────────────────────────────────── */
  function _onKey(e) {
    if (e.key === 'Escape')                               _finish();
    if (e.key === 'ArrowRight' || e.key === 'Enter') {
      if (_step === STEPS.length - 1) _finish(); else _go(_step + 1);
    }
    if (e.key === 'ArrowLeft')                            _go(_step - 1);
  }

  function _onResize() {
    clearTimeout(_resizeTm);
    _resizeTm = setTimeout(_render, 80);
  }

  /* ── Teardown ───────────────────────────────────────────────────────────── */
  function _finish() {
    _markDone();
    _teardown();
  }

  function _teardown() {
    window.removeEventListener('keydown', _onKey);
    window.removeEventListener('resize',  _onResize);
    clearTimeout(_resizeTm);
    if (_overlay) { _overlay.remove(); _overlay = null; }
  }

  return { start, startIfNew, reset, isDone };
})();
