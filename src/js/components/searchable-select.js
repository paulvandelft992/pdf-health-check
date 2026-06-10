/**
 * SearchableSelect — adds inline search to any native <select>.
 *
 * The native <select> is hidden but stays fully in sync:
 *  • .value reads work unchanged
 *  • .onchange / addEventListener('change') handlers fire as normal
 *  • options added via .add() / appendChild / innerHTML are auto-detected
 *    through a MutationObserver and reflected in the dropdown list
 *
 * Usage:
 *   const ss = new SearchableSelect(selectEl, { placeholder: 'Search…' });
 *   ss.show(); ss.hide(); ss.setValue('42'); ss.destroy();
 *
 * The component detects which visual style to apply based on the native
 * select's class:
 *   .filter-select  → compact header-bar style (height 28 px)
 *   .form-select    → full-width form style (height 34 px)
 */
class SearchableSelect {
  constructor(selectEl, opts = {}) {
    // Tear down any previous instance on the same element
    if (selectEl._ssInstance) selectEl._ssInstance.destroy();

    this._sel      = selectEl;
    this._opts     = opts;
    this._open     = false;
    this._focIdx   = -1;
    this._docDown  = null;   // outside-click listener
    this._mutObs   = null;   // MutationObserver for native <select> changes

    this._build();
    this._refresh();         // populate from existing <option> elements
    this._wireMutations();

    selectEl._ssInstance = this;
  }

  // ── Build custom UI ───────────────────────────────────────────────────────
  _build() {
    const sel    = this._sel;
    const isForm = sel.classList.contains('form-select');
    const ph     = this._opts.placeholder || 'Search…';

    // Wrapper replaces the visual slot of the native select
    const wrap = document.createElement('div');
    wrap.className = 'ss-wrap ' + (isForm ? 'ss-wrap--form' : 'ss-wrap--filter');

    // Carry over any inline min-width / width from the original element
    if (sel.style.minWidth) wrap.style.minWidth = sel.style.minWidth;
    if (sel.style.width)    wrap.style.width    = sel.style.width;

    // Mirror initial visibility (e.g. display:none on the HC picker)
    if (getComputedStyle(sel).display === 'none' || sel.style.display === 'none') {
      wrap.style.display = 'none';
    }

    sel.parentNode.insertBefore(wrap, sel);
    sel.style.display = 'none';
    this._wrap = wrap;

    // ── Trigger button ──────────────────────────────────────────────────────
    const trigger = document.createElement('div');
    trigger.className = 'ss-trigger';
    trigger.tabIndex  = 0;
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML =
      `<span class="ss-label"></span>` +
      `<svg class="ss-chevron" viewBox="0 0 12 12" fill="none" aria-hidden="true">` +
      `<path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` +
      `</svg>`;
    wrap.appendChild(trigger);
    this._trigger = trigger;
    this._labelEl = trigger.querySelector('.ss-label');

    // ── Dropdown panel ──────────────────────────────────────────────────────
    const drop = document.createElement('div');
    drop.className = 'ss-dropdown';
    drop.setAttribute('role', 'listbox');
    drop.hidden = true;
    drop.innerHTML =
      `<div class="ss-search-wrap">` +
        `<svg class="ss-search-icon" viewBox="0 0 14 14" fill="none" aria-hidden="true">` +
          `<circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1.3"/>` +
          `<path d="M9.5 9.5l2.5 2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>` +
        `</svg>` +
        `<input class="ss-search" type="text" autocomplete="off" spellcheck="false" placeholder="${ph}">` +
      `</div>` +
      `<div class="ss-list" role="group"></div>` +
      `<div class="ss-empty" hidden>No results</div>`;
    wrap.appendChild(drop);
    this._drop    = drop;
    this._search  = drop.querySelector('.ss-search');
    this._listEl  = drop.querySelector('.ss-list');
    this._emptyEl = drop.querySelector('.ss-empty');

    // ── Events ──────────────────────────────────────────────────────────────
    trigger.addEventListener('click',   () => this._toggle());
    trigger.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        this._openDrop();
      }
    });
    this._search.addEventListener('input',   () => this._filter(this._search.value));
    this._search.addEventListener('keydown', e  => this._handleKey(e));
    this._listEl.addEventListener('click', e => {
      const opt = e.target.closest('.ss-option');
      if (opt && opt.style.display !== 'none') this._pick(opt.dataset.value);
    });
  }

  // ── Sync with native <select> options ─────────────────────────────────────
  _refresh() {
    const items = [];
    for (const opt of this._sel.options) {
      items.push({
        value: opt.value,
        label: opt.text,
        group: opt.parentElement?.tagName === 'OPTGROUP'
          ? opt.parentElement.label : null,
      });
    }
    this._items = items;
    this._buildList(items);
    this._syncLabel();
  }

  _buildList(items) {
    this._listEl.innerHTML = '';
    const currentVal = this._sel.value;
    let lastGroup = null;

    items.forEach(item => {
      if (item.group !== lastGroup) {
        lastGroup = item.group;
        if (item.group) {
          const gh = document.createElement('div');
          gh.className  = 'ss-group';
          gh.textContent = item.group;
          this._listEl.appendChild(gh);
        }
      }
      const el = document.createElement('div');
      el.className    = 'ss-option';
      el.dataset.value = item.value;
      el.textContent  = item.label;
      el.setAttribute('role', 'option');
      if (item.value === currentVal) el.classList.add('ss-option--selected');
      this._listEl.appendChild(el);
    });

    this._focIdx = -1;
    this._emptyEl.hidden = true;
    // Show all options (no active query yet)
    this._listEl.querySelectorAll('.ss-option,.ss-group')
      .forEach(el => { el.style.display = ''; });
  }

  // ── Filter visible options ─────────────────────────────────────────────────
  _filter(q) {
    q = (q || '').trim().toLowerCase();
    let visCount    = 0;
    let lastGrpEl   = null;
    let grpHasMatch = false;

    for (const child of this._listEl.children) {
      if (child.classList.contains('ss-group')) {
        if (lastGrpEl) lastGrpEl.style.display = grpHasMatch ? '' : 'none';
        lastGrpEl   = child;
        grpHasMatch = false;
        continue;
      }
      if (!child.classList.contains('ss-option')) continue;
      const matches = !q || child.textContent.toLowerCase().includes(q);
      child.style.display = matches ? '' : 'none';
      if (matches) { visCount++; grpHasMatch = true; }
    }
    if (lastGrpEl) lastGrpEl.style.display = grpHasMatch ? '' : 'none';

    this._emptyEl.hidden = visCount > 0;
    // Clear keyboard focus indicators
    this._listEl.querySelectorAll('.ss-option--focused')
      .forEach(el => el.classList.remove('ss-option--focused'));
    this._focIdx = -1;
  }

  // ── Open / close ──────────────────────────────────────────────────────────
  _toggle() { this._open ? this._close() : this._openDrop(); }

  _openDrop() {
    this._open = true;
    this._drop.hidden = false;
    this._trigger.setAttribute('aria-expanded', 'true');
    this._search.value = '';
    this._filter('');

    // Scroll the currently-selected option into view
    const selected = this._listEl.querySelector('.ss-option--selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });

    requestAnimationFrame(() => this._search.focus());

    this._docDown = e => {
      if (!this._wrap.contains(e.target)) this._close();
    };
    document.addEventListener('mousedown', this._docDown, true);
  }

  _close() {
    if (!this._open) return;
    this._open = false;
    this._drop.hidden = true;
    this._trigger.setAttribute('aria-expanded', 'false');
    if (this._docDown) {
      document.removeEventListener('mousedown', this._docDown, true);
      this._docDown = null;
    }
  }

  // ── Selection ─────────────────────────────────────────────────────────────
  _pick(value) {
    this._sel.value = value;
    this._syncLabel();
    this._listEl.querySelectorAll('.ss-option').forEach(el =>
      el.classList.toggle('ss-option--selected', el.dataset.value === String(value))
    );
    this._close();
    this._trigger.focus();
    // Fire a native change event so existing .onchange / addEventListener handlers work
    this._sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  _syncLabel() {
    const sel = this._sel;
    const opt = sel.options[sel.selectedIndex];
    this._labelEl.textContent = opt ? opt.text : '';
    this._labelEl.classList.toggle('ss-placeholder', !sel.value);
  }

  // ── Keyboard navigation ───────────────────────────────────────────────────
  _handleKey(e) {
    if (e.key === 'Escape') {
      this._close();
      this._trigger.focus();
      return;
    }

    const opts = [...this._listEl.querySelectorAll('.ss-option')].filter(el => el.style.display !== 'none');
    if (!opts.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._focIdx = Math.min(this._focIdx + 1, opts.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._focIdx = Math.max(this._focIdx - 1, 0);
    } else if (e.key === 'Enter' && this._focIdx >= 0) {
      e.preventDefault();
      this._pick(opts[this._focIdx].dataset.value);
      return;
    } else if (e.key === 'Tab') {
      this._close();
      return;
    } else {
      return;
    }

    opts.forEach((o, i) =>
      o.classList.toggle('ss-option--focused', i === this._focIdx)
    );
    opts[this._focIdx]?.scrollIntoView({ block: 'nearest' });
  }

  // ── Auto-sync when native <select> options change ─────────────────────────
  _wireMutations() {
    let timer = null;
    this._mutObs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        this._refresh();
        // After options reload, re-apply the current search query if dropdown is open
        if (this._open) this._filter(this._search.value);
      }, 0);
    });
    this._mutObs.observe(this._sel, { childList: true, subtree: true });
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  /** Show the component (mirrors what showing the native select would do). */
  show() { this._wrap.style.display = ''; }

  /** Hide the component. */
  hide() { this._wrap.style.display = 'none'; this._close(); }

  /** Programmatically set the selected value and sync the label. */
  setValue(value) {
    this._sel.value = String(value);
    this._syncLabel();
    this._listEl.querySelectorAll('.ss-option').forEach(el =>
      el.classList.toggle('ss-option--selected', el.dataset.value === String(value))
    );
  }

  /** Returns the currently selected value (same as nativeSelect.value). */
  getValue() { return this._sel.value; }

  /** Remove the component and restore the original <select>. */
  destroy() {
    this._close();
    if (this._mutObs) { this._mutObs.disconnect(); this._mutObs = null; }
    if (this._wrap?.parentNode) {
      this._wrap.parentNode.insertBefore(this._sel, this._wrap);
      this._wrap.remove();
    }
    this._sel.style.display = '';
    if (this._sel._ssInstance === this) delete this._sel._ssInstance;
  }
}
