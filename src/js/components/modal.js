/* Modal & Toast helpers */
const Modal = (() => {
  const overlay = () => document.getElementById('modalOverlay');
  const modal   = () => document.getElementById('modal');
  const title   = () => document.getElementById('modalTitle');
  const body    = () => document.getElementById('modalBody');
  const footer  = () => document.getElementById('modalFooter');

  // Single Escape handler — replaced each open(), removed each close()
  let _escHandler = null;

  function open({ heading, content, actions = [], size = '' }) {
    title().textContent = heading;
    body().innerHTML    = content;
    footer().innerHTML  = '';

    if (actions.length) {
      actions.forEach(a => {
        const btn = document.createElement('button');
        btn.className = `btn ${a.cls || 'btn-secondary'}`;
        btn.textContent = a.label;
        btn.onclick = () => { if (a.onClick) a.onClick(btn); };
        footer().appendChild(btn);
      });
    }
    footer().style.display = actions.length ? '' : 'none';

    const m = modal();
    m.className = 'modal' + (size ? ' ' + size : '');

    // Ensure any previous close is fully done before re-opening
    overlay().classList.remove('is-open');
    // Double rAF gives the browser one frame to apply the closed state, then
    // adding is-open triggers the enter transition from scratch.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      overlay().classList.add('is-open');
    }));

    document.getElementById('modalClose').onclick = close;
    overlay().onclick = e => { if (e.target === overlay()) close(); };

    // Escape key — remove any previous listener first, then attach a fresh one
    if (_escHandler) document.removeEventListener('keydown', _escHandler);
    _escHandler = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', _escHandler);
  }

  function close() {
    if (_escHandler) { document.removeEventListener('keydown', _escHandler); _escHandler = null; }
    overlay().classList.remove('is-open');
    // Wait for the exit transition to finish before clearing content
    setTimeout(() => {
      body().innerHTML    = '';
      footer().innerHTML  = '';
    }, 180);
  }

  return { open, close };
})();

const Toast = (() => {
  function show(message, type = 'info', duration = 3500) {
    const icons = {
      success: `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      error:   `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
      warning: `<svg viewBox="0 0 16 16" fill="none"><path d="M8 2L15 14H1L8 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 7v3M8 12v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
      info:    `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M8 7v4M8 5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
    };

    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
    document.getElementById('toastContainer').appendChild(t);

    setTimeout(() => {
      t.classList.add('fade-out');
      setTimeout(() => t.remove(), 220);
    }, duration);
  }

  return { show };
})();
