/* i18n — lightweight translation module
 *
 * Usage:
 *   t('key')                    → translated string
 *   t('key', { name: 'Acme' }) → with variable substitution ({name})
 *
 * Language files live in src/locales/*.js and call I18n.register(lang, map).
 */
const I18n = (() => {
  const locales = {};
  let current   = 'en';

  function register(lang, strings) {
    locales[lang] = strings;
  }

  function setLanguage(lang) {
    if (!locales[lang]) { console.warn(`[i18n] language "${lang}" not registered`); return; }
    current = lang;
    try { localStorage.setItem('hcapp_lang', lang); } catch {}
    document.dispatchEvent(new CustomEvent('i18n:changed', { detail: lang }));
  }

  function t(key, vars = {}) {
    const str = (locales[current] && locales[current][key] !== undefined)
      ? locales[current][key]
      : (locales['en'] && locales['en'][key] !== undefined)
        ? locales['en'][key]
        : key;           // fallback: show the key itself
    return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
  }

  function init() {
    try {
      const saved = localStorage.getItem('hcapp_lang') || 'en';
      if (locales[saved]) current = saved;
    } catch {}
  }

  function getCurrent()   { return current; }
  function getAvailable() { return Object.keys(locales); }

  return { register, setLanguage, t, init, getCurrent, getAvailable };
})();

/** Global shorthand — all views call t() directly */
function t(key, vars) { return I18n.t(key, vars); }
