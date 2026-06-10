/**
 * ThemeManager — light / dark / system theme switching.
 *
 * Applies `data-theme="light"|"dark"` to <html> so CSS variable overrides
 * in [data-theme="dark"] kick in.  Persists the choice in Electron settings.
 *
 * Public API:
 *   ThemeManager.init()          — call once on boot (reads saved pref)
 *   ThemeManager.set('dark')     — 'light' | 'dark' | 'system'
 *   ThemeManager.get()           — returns current preference string
 *   ThemeManager.isDark()        — true when dark mode is actually active
 *   ThemeManager.onChange(fn)    — register a listener called on every change
 */
const ThemeManager = (() => {
  let _pref      = 'system';   // user preference: 'light' | 'dark' | 'system'
  const _listeners = [];

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _systemIsDark() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function isDark() {
    if (_pref === 'dark')   return true;
    if (_pref === 'light')  return false;
    return _systemIsDark();
  }

  function _applyDOM() {
    const dark = isDark();
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');

    // Sync theme-button active states (buttons may not exist yet on boot)
    document.querySelectorAll('.pref-theme-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === _pref);
    });

    _listeners.forEach(fn => { try { fn(dark); } catch {} });
  }

  // ── Public ────────────────────────────────────────────────────────────────
  async function init() {
    // Read saved preference from Electron settings
    if (window.electronAPI) {
      try {
        const s = await window.electronAPI.getSettings();
        _pref = s.theme || 'system';
      } catch {}
    }
    _applyDOM();

    // React to OS-level dark/light changes when following system
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (_pref === 'system') _applyDOM();
    });
  }

  async function set(pref) {
    _pref = pref;
    _applyDOM();

    // Persist
    if (window.electronAPI) {
      try {
        const s = await window.electronAPI.getSettings();
        await window.electronAPI.saveSettings({ ...s, theme: pref });
      } catch {}
    }
  }

  function get()         { return _pref; }
  function current()     { return _pref; }   // alias used by settings modal
  function onChange(fn)  { _listeners.push(fn); }

  return { init, set, get, current, isDark, onChange };
})();
