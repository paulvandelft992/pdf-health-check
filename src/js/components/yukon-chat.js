/* ── Adobe Yukon Chat ─────────────────────────────────────────────────────────
 * Floating chat button (bottom-right) + slide-up chat panel.
 *
 * Features:
 *   • Persistent per-user history in localStorage (capped at 100 messages)
 *   • Session archive — clearing starts a new session; previous sessions are
 *     browsable and restorable from the Settings > Yukon tab
 *   • Context awareness — views call YukonChat.setContext({...}) so questions
 *     are scoped to the current HC / customer automatically
 *   • Suggested prompts — 3 clickable chips that change with the context
 *   • Copy-to-clipboard button on every assistant response
 *   • Timestamps on all messages (rendered relative to "today")
 *
 * Uses Yukon.streamAnswer() for real-time Q&A against the configured collection.
 * ---------------------------------------------------------------------------- */
const YukonChat = (() => {

  let _panel        = null;   // the chat panel element
  let _isOpen       = false;
  let _isStreaming  = false;
  let _messages     = [];     // { role, text, ts } — in-memory mirror of localStorage
  let _context      = null;   // set by views: { view, label, hcId, hcName, customerName, avgScore, status, docCount }
  let _historyLoaded = false; // guard — only load from localStorage once per session open

  const MAX_HISTORY  = 100;
  const MAX_SESSIONS = 10;   // archived conversations stored

  // ── Storage keys ─────────────────────────────────────────────────────────
  function _email() {
    return (typeof UserProfile !== 'undefined') ? UserProfile.getEmail() : '';
  }
  function _historyKey()  { return 'yukon_history'  + (_email() ? '_' + _email() : ''); }
  function _sessionsKey() { return 'yukon_sessions' + (_email() ? '_' + _email() : ''); }

  // ── History (active conversation) ─────────────────────────────────────────
  function _loadHistory() {
    try {
      const raw = localStorage.getItem(_historyKey());
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function _saveHistory() {
    try {
      localStorage.setItem(_historyKey(), JSON.stringify(_messages.slice(-MAX_HISTORY)));
    } catch { /* localStorage full — ignore */ }
  }

  // ── Session archive ───────────────────────────────────────────────────────
  // A "session" is a snapshot of _messages taken when the user clears the chat
  // or restores a different session. Previous sessions are surfaced in Settings.
  function _loadSessions() {
    try {
      const raw = localStorage.getItem(_sessionsKey());
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function _saveSessions(sessions) {
    try {
      localStorage.setItem(_sessionsKey(), JSON.stringify(sessions));
    } catch { /* ignore */ }
  }

  function _archiveSession() {
    if (!_messages.length) return;
    const userMsgs = _messages.filter(m => m.role === 'user');
    if (!userMsgs.length) return;                // nothing worth archiving

    const preview = userMsgs[0].text.slice(0, 90) + (userMsgs[0].text.length > 90 ? '…' : '');
    const sessions = _loadSessions();
    sessions.unshift({
      id:           Date.now(),
      startedAt:    _messages[0].ts || Date.now(),
      lastAt:       _messages[_messages.length - 1].ts || Date.now(),
      preview,
      messageCount: _messages.length,
      messages:     _messages.slice(-50),         // cap each stored session at 50 msgs
    });
    _saveSessions(sessions.slice(0, MAX_SESSIONS));
  }

  // Public — called by the settings modal to render the history list
  function getSessionsList() { return _loadSessions(); }

  // Public — called by settings modal when user clicks "Restore"
  function restoreSession(session) {
    if (!session || !session.messages) return;
    _archiveSession();          // stash current before replacing
    _messages = session.messages;
    _saveHistory();
    _rebuildMessageList();
    if (!_isOpen) open();
  }

  // ── Context ───────────────────────────────────────────────────────────────
  function setContext(ctx) {
    _context = ctx || null;
    if (_panel) {
      _updateContextBanner();
      _updateSuggestedPrompts();
    }
  }

  // ── Init — injects the floating button + panel ────────────────────────────
  function init() {
    const btn = document.createElement('button');
    btn.id        = 'yukonChatBtn';
    btn.className = 'yukon-chat-fab';
    btn.title     = t('yukon.chatBtnTitle') || 'Ask AI about your health checks';
    btn.innerHTML = _fabIcon();
    btn.addEventListener('click', toggle);
    document.body.appendChild(btn);

    _panel = document.createElement('div');
    _panel.id        = 'yukonChatPanel';
    _panel.className = 'yukon-chat-panel';
    _panel.innerHTML = _panelHtml();
    document.body.appendChild(_panel);

    _panel.querySelector('#yukonChatClose').addEventListener('click', close);
    _panel.querySelector('#yukonChatClear').addEventListener('click', _clearHistory);
    _panel.querySelector('#yukonChatSend').addEventListener('click', _send);
    _panel.querySelector('#yukonChatInput').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _send(); }
    });

    // Auto-resize textarea
    _panel.querySelector('#yukonChatInput').addEventListener('input', _autoResize);
  }

  // ── Open / close ──────────────────────────────────────────────────────────
  function open() {
    if (_isOpen) return;
    _isOpen = true;
    _panel.classList.add('open');

    // Load history from localStorage the first time the panel is opened
    if (!_historyLoaded) {
      _historyLoaded = true;
      _messages = _loadHistory();
      _rebuildMessageList();   // uses instant scroll — no animation on history load
    }

    _updateContextBanner();
    _updateSuggestedPrompts();
    _panel.querySelector('#yukonChatInput').focus();
  }

  function close() {
    if (!_isOpen) return;
    _isOpen = false;
    _panel.classList.remove('open');
  }

  function toggle() {
    _isOpen ? close() : open();
  }

  // ── Rebuild message list from _messages ───────────────────────────────────
  function _rebuildMessageList() {
    const list = _panel.querySelector('#yukonChatMessages');
    if (_messages.length === 0) {
      list.innerHTML = _emptyState();
      return;
    }
    list.innerHTML = '';
    _messages.forEach(m => {
      list.appendChild(_buildMessageEl(m));
    });
    _scrollToBottom(true);   // instant — no animated scroll when restoring history
  }

  // Build a complete message DOM element (used for history rebuild)
  function _buildMessageEl(m) {
    const el  = document.createElement('div');
    el.className = `yukon-msg yukon-msg-${m.role}`;

    const timeStr = m.ts ? _formatTime(m.ts) : '';

    if (m.role === 'user') {
      el.innerHTML = `
        <div class="yukon-msg-text">${escHtml(m.text)}</div>
        ${timeStr ? `<div class="yukon-msg-time yukon-msg-time--user">${timeStr}</div>` : ''}`;
    } else {
      el.dataset.rawText = m.text;
      el.innerHTML = `
        <div class="yukon-msg-text">${_renderMarkdown(m.text)}</div>
        <div class="yukon-msg-actions">
          ${timeStr ? `<span class="yukon-msg-time">${timeStr}</span>` : ''}
          <button class="yukon-copy-btn" title="${t('yukon.copyBtn') || 'Copy response'}" type="button">
            ${_copyIcon()}
          </button>
        </div>`;
      el.querySelector('.yukon-copy-btn').addEventListener('click', () => _copyMessage(el));
    }
    return el;
  }

  // ── Clear history ─────────────────────────────────────────────────────────
  function _clearHistory() {
    _archiveSession();          // save current conversation before wiping
    _messages = [];
    localStorage.removeItem(_historyKey());
    _panel.querySelector('#yukonChatMessages').innerHTML = _emptyState();
    _updateSuggestedPrompts();
  }

  // ── Copy message text to clipboard ────────────────────────────────────────
  function _copyMessage(msgEl) {
    const text = msgEl.dataset.rawText || '';
    if (!text) return;
    const btn = msgEl.querySelector('.yukon-copy-btn');
    navigator.clipboard.writeText(text).then(() => {
      btn.innerHTML = _checkIcon();
      btn.classList.add('copied');
      Toast.show(t('yukon.copied') || 'Copied to clipboard', 'success', 2000);
      setTimeout(() => {
        btn.innerHTML = _copyIcon();
        btn.classList.remove('copied');
      }, 2000);
    }).catch(() => {
      // Fallback for browsers without clipboard API (shouldn't happen in Electron)
      Toast.show('Could not copy to clipboard', 'error', 2000);
    });
  }

  // ── Context banner ────────────────────────────────────────────────────────
  function _updateContextBanner() {
    const banner = _panel.querySelector('#yukonContextBanner');
    if (!banner) return;
    if (!_context) {
      banner.style.display = 'none';
      banner.innerHTML = '';
      return;
    }
    banner.style.display = '';
    banner.innerHTML = `
      <svg viewBox="0 0 14 14" fill="none" style="width:11px;height:11px;flex-shrink:0;color:var(--accent)">
        <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.4"/>
        <path d="M7 6v4M7 4.5v.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
      <span>${escHtml(_context.label || _context.hcName || _context.customerName || '')}</span>`;
  }

  // ── Suggested prompts ─────────────────────────────────────────────────────
  function _suggestionsForContext() {
    const ctx = _context;
    if (!ctx) {
      return [
        t('yukon.suggest.topIssues')       || 'What are the most common PDF issues?',
        t('yukon.suggest.lowestScores')    || 'Which health checks have the lowest scores?',
        t('yukon.suggest.recentSummary')   || 'Summarise the most recent health checks',
      ];
    }
    if (ctx.view === 'healthcheck') {
      const name = ctx.hcName || 'this health check';
      return [
        `What are the main security issues found in "${name}"?`,
        `Which documents in "${name}" need the most attention?`,
        `What accessibility improvements are recommended for "${name}"?`,
      ];
    }
    if (ctx.view === 'customer') {
      const cust = ctx.customerName || 'this customer';
      return [
        `Summarise all health checks for ${cust}`,
        `What patterns do you see across ${cust}'s documents?`,
        `Which of ${cust}'s documents scored the lowest?`,
      ];
    }
    if (ctx.view === 'report') {
      const name = ctx.hcName || 'this health check';
      return [
        `Explain the score breakdown for "${name}"`,
        `What are the top three improvements for "${name}"?`,
        `How does "${name}" compare to industry best practices?`,
      ];
    }
    return [
      t('yukon.suggest.topIssues')    || 'What are the most common PDF issues?',
      t('yukon.suggest.lowestScores') || 'Which health checks have the lowest scores?',
      t('yukon.suggest.recentSummary')|| 'Summarise the most recent health checks',
    ];
  }

  function _updateSuggestedPrompts() {
    const wrap = _panel.querySelector('#yukonSuggestions');
    if (!wrap) return;
    const prompts = _suggestionsForContext();
    wrap.innerHTML = prompts.map(p =>
      `<button class="yukon-suggest-chip" type="button">${escHtml(p)}</button>`
    ).join('');
    wrap.querySelectorAll('.yukon-suggest-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (_isStreaming) return;
        const input = _panel.querySelector('#yukonChatInput');
        input.value = chip.textContent;
        _autoResize.call(input);
        _send();
      });
    });
  }

  // ── Build the question sent to Yukon (context-enriched) ───────────────────
  function _buildYukonQuestion(userQ) {
    if (!_context) return userQ;
    const parts = [];
    if (_context.hcName)       parts.push(`Health check: "${_context.hcName}"`);
    if (_context.customerName) parts.push(`Customer: "${_context.customerName}"`);
    if (_context.status)       parts.push(`Status: ${_context.status}`);
    if (_context.avgScore != null) parts.push(`Average score: ${_context.avgScore}/100`);
    if (_context.docCount != null) parts.push(`Documents analysed: ${_context.docCount}`);
    if (!parts.length) return userQ;
    return `[Context: ${parts.join(', ')}]\n\n${userQ}`;
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function _send() {
    if (_isStreaming) return;
    const input = _panel.querySelector('#yukonChatInput');
    const q     = input.value.trim();
    if (!q) return;

    input.value = '';
    _autoResize.call(input);

    // Dismiss suggestions on first send
    const suggestWrap = _panel.querySelector('#yukonSuggestions');
    if (suggestWrap) suggestWrap.innerHTML = '';

    _appendUserMessage(q);

    const assistantEl = _appendStreamingPlaceholder();
    _isStreaming = true;
    _setSendDisabled(true);

    let fullText = '';
    let statusEl = assistantEl.querySelector('.yukon-msg-status');

    try {
      const yukonQ = _buildYukonQuestion(q);
      for await (const chunk of Yukon.streamAnswer(yukonQ)) {
        if (chunk.progressEvent && statusEl) {
          statusEl.querySelector('.yukon-status-text').textContent = _friendlyEvent(chunk.progressEvent);
        }
        if (chunk.text != null && chunk.text !== '') {
          fullText += chunk.text;
          if (statusEl) { statusEl.remove(); statusEl = null; }
          assistantEl.querySelector('.yukon-msg-text').innerHTML = _renderMarkdown(fullText);
          _scrollToBottom(true);   // instant while streaming — avoids animation lag
        }
        if (chunk.done) {
          assistantEl.dataset.rawText = fullText;
          _messages.push({ role: 'assistant', text: fullText, ts: Date.now() });
          _saveHistory();
          _renderSources(assistantEl, chunk.sources);
          _addMessageActions(assistantEl);
          break;
        }
      }
    } catch (e) {
      if (statusEl) statusEl.remove();
      assistantEl.querySelector('.yukon-msg-text').innerHTML =
        `<span class="yukon-msg-error">${escHtml(e.message)}</span>`;
    }

    _isStreaming = false;
    _setSendDisabled(false);
    _scrollToBottom(true);

    // Restore suggestions after answer — re-scroll after they take up space
    _updateSuggestedPrompts();
    requestAnimationFrame(() => _scrollToBottom(true));
    input.focus();
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────
  function _appendUserMessage(text) {
    _messages.push({ role: 'user', text, ts: Date.now() });
    _saveHistory();
    const list = _panel.querySelector('#yukonChatMessages');
    list.querySelector('.yukon-empty')?.remove();
    const el = document.createElement('div');
    el.className = 'yukon-msg yukon-msg-user yukon-msg--new';
    el.innerHTML = `
      <div class="yukon-msg-text">${escHtml(text)}</div>
      <div class="yukon-msg-time yukon-msg-time--user">${_formatTime(Date.now())}</div>`;
    list.appendChild(el);
    // Trigger enter animation on next frame
    requestAnimationFrame(() => el.classList.remove('yukon-msg--new'));
    _scrollToBottom(false);
    return el;
  }

  function _appendStreamingPlaceholder() {
    const list = _panel.querySelector('#yukonChatMessages');
    list.querySelector('.yukon-empty')?.remove();
    const el = document.createElement('div');
    el.className = 'yukon-msg yukon-msg-assistant yukon-msg--new';
    el.innerHTML = `
      <div class="yukon-msg-status">
        <span class="yukon-typing-dots"><span></span><span></span><span></span></span>
        <span class="yukon-status-text">${t('yukon.thinking') || 'Thinking…'}</span>
      </div>
      <div class="yukon-msg-text"></div>`;
    list.appendChild(el);
    requestAnimationFrame(() => el.classList.remove('yukon-msg--new'));
    _scrollToBottom(false);
    return el;
  }

  // Appended to assistant messages once streaming completes
  function _addMessageActions(msgEl) {
    const actionsEl = document.createElement('div');
    actionsEl.className = 'yukon-msg-actions';
    actionsEl.innerHTML = `
      <span class="yukon-msg-time">${_formatTime(Date.now())}</span>
      <button class="yukon-copy-btn" title="${t('yukon.copyBtn') || 'Copy response'}" type="button">
        ${_copyIcon()}
      </button>`;
    actionsEl.querySelector('.yukon-copy-btn').addEventListener('click', () => _copyMessage(msgEl));
    msgEl.appendChild(actionsEl);
  }

  function _renderSources(msgEl, sources) {
    if (!sources || !Object.keys(sources).length) return;
    const sourceList = Object.values(sources);
    if (!sourceList.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'yukon-msg-sources';
    wrap.innerHTML = `<span class="yukon-sources-label">${t('yukon.sourcesLabel') || 'Sources:'}</span>`;
    sourceList.forEach(s => {
      const chip = document.createElement('span');
      chip.className = 'yukon-source-chip';
      chip.textContent = s.document_name || s.document_id || 'Source';
      chip.title = s.document_name || '';
      wrap.appendChild(chip);
    });
    msgEl.appendChild(wrap);
  }

  // instant=true → browser jumps without animation (used on history load / restore)
  // instant=false → smooth scroll (used during streaming / new messages)
  function _scrollToBottom(instant) {
    const list = _panel.querySelector('#yukonChatMessages');
    list.scrollTo({ top: list.scrollHeight, behavior: instant ? 'instant' : 'smooth' });
  }

  function _setSendDisabled(disabled) {
    const btn   = _panel.querySelector('#yukonChatSend');
    const input = _panel.querySelector('#yukonChatInput');
    btn.disabled   = disabled;
    input.disabled = disabled;
    btn.innerHTML  = disabled ? _spinnerIcon() : _sendIcon();
  }

  function _autoResize() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  }

  // ── Time formatter ─────────────────────────────────────────────────────────
  function _formatTime(ts) {
    if (!ts) return '';
    const d   = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday)     return time;
    if (isYesterday) return `Yesterday ${time}`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + time;
  }

  // ── Simple markdown renderer ───────────────────────────────────────────────
  function _renderMarkdown(text) {
    if (!text) return '';
    let html = escHtml(text);
    // Strip footnote references
    html = html.replace(/\[\^\d+\]/g, '').replace(/\[\^[^\]]+\]/g, '');
    // Code blocks (must come first)
    html = html.replace(/```[\s\S]*?```/g, m =>
      `<pre class="yukon-pre">${m.slice(3, -3).replace(/^\n/, '')}</pre>`);
    // Headings
    html = html.replace(/^### (.+)$/gm, '<p class="yukon-h3">$1</p>');
    html = html.replace(/^## (.+)$/gm,  '<p class="yukon-h2">$1</p>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="yukon-code">$1</code>');
    // Bold / italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Numbered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ol>${m}</ol>`);
    // Unordered lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function _friendlyEvent(evt) {
    if (!evt) return t('yukon.thinking') || 'Thinking…';
    const map = {
      'response.created':     t('yukon.thinking')          || 'Thinking…',
      'response.in_progress': t('yukon.thinking')          || 'Thinking…',
      'documents.searching':  t('yukon.searchingDocs')     || 'Searching documents…',
      'documents.found':      t('yukon.docsFound')         || 'Documents found…',
      'answer.generating':    t('yukon.generatingAnswer')  || 'Generating answer…',
      'answer.streaming':     t('yukon.streamingAnswer')   || 'Streaming answer…',
      'question.analyzing':   t('yukon.analyzingQuestion') || 'Analysing question…',
      'sources.linking':      t('yukon.linkingSources')    || 'Linking sources…',
    };
    return map[evt] || t('yukon.thinking') || 'Thinking…';
  }

  // ── HTML / SVG helpers ────────────────────────────────────────────────────
  function _copyIcon() {
    return `<svg viewBox="0 0 16 16" fill="none" style="width:12px;height:12px">
      <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
      <path d="M3 11V3a1 1 0 0 1 1-1h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>`;
  }

  function _checkIcon() {
    return `<svg viewBox="0 0 16 16" fill="none" style="width:12px;height:12px">
      <path d="M3 8l4 4 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  function _fabIcon() {
    return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M6.25 18.9981C6.15039 18.9981 6.05078 18.9785 5.95605 18.9385C5.67968 18.8203 5.5 18.5488 5.5 18.2481V14.9981H4.75C2.68262 14.9981 1 13.3154 1 11.2481V5.74805C1 3.68067 2.68262 1.99805 4.75 1.99805H8.70312C9.11718 1.99805 9.45312 2.33399 9.45312 2.74805C9.45312 3.16211 9.11718 3.49805 8.70312 3.49805H4.75C3.50977 3.49805 2.5 4.50782 2.5 5.74805V11.2481C2.5 12.4883 3.50977 13.4981 4.75 13.4981H6.25C6.66406 13.4981 7 13.834 7 14.2481V16.4844L9.88379 13.708C10.0234 13.5732 10.21 13.4981 10.4043 13.4981H15.25C16.4902 13.4981 17.5 12.4883 17.5 11.2481V9.97657C17.5 9.56251 17.8359 9.22657 18.25 9.22657C18.6641 9.22657 19 9.56251 19 9.97657V11.2481C19 13.3154 17.3174 14.9981 15.25 14.9981H10.707L6.77051 18.7881C6.62793 18.9258 6.44043 18.9981 6.25 18.9981Z" fill="currentColor"/>
<path d="M13.2783 9.08301C13.0898 9.08301 12.9004 9.03418 12.7295 8.93555C12.3135 8.69629 12.1025 8.22071 12.2031 7.75196L12.6631 5.62696L11.2031 4.01661C10.8809 3.66114 10.8252 3.14454 11.0645 2.7295C11.3047 2.31446 11.7852 2.10352 12.248 2.20313L14.373 2.66309L15.9834 1.20313C16.3389 0.881839 16.8584 0.827149 17.2705 1.06446C17.6865 1.30372 17.8975 1.7793 17.7969 2.24805L17.3369 4.37305L18.7969 5.9834C19.1191 6.33887 19.1748 6.85547 18.9355 7.27051C18.6953 7.68653 18.2187 7.89942 17.752 7.79688L15.627 7.33692L14.0166 8.79688C13.8086 8.98536 13.5449 9.08301 13.2783 9.08301ZM13.1523 3.93359L13.9121 4.77148C14.1484 5.02929 14.2471 5.39257 14.1729 5.74023L13.9336 6.84766L14.7715 6.08789C15.0303 5.85156 15.3975 5.75391 15.7402 5.82715L16.8477 6.06641L16.0879 5.22852C15.8516 4.97071 15.7529 4.60743 15.8271 4.25977L16.0664 3.15235L15.2285 3.91212C14.9707 4.14942 14.6055 4.24903 14.2598 4.17286L13.1523 3.93359Z" fill="currentColor"/>
<path d="M7.93263 11.5039C7.80372 11.5039 7.67482 11.4707 7.55763 11.4033C7.2754 11.2402 7.13087 10.9141 7.19923 10.5957L7.37696 9.77539L6.81348 9.1543C6.59473 8.91309 6.55664 8.55762 6.71973 8.27539C6.88282 7.99316 7.21094 7.85449 7.52735 7.91699L8.34766 8.09472L8.96875 7.53124C9.21094 7.31249 9.56445 7.2744 9.84766 7.43749C10.1299 7.60058 10.2744 7.92675 10.2061 8.24511L10.0283 9.06542L10.5918 9.68651C10.8106 9.92772 10.8486 10.2832 10.6856 10.5654C10.5225 10.8477 10.1934 10.9893 9.87794 10.9238L9.05763 10.7461L8.43654 11.3096C8.29494 11.4375 8.11427 11.5039 7.93263 11.5039Z" fill="currentColor"/>
</svg>`;
  }

  function _sendIcon() {
    return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M18.7793 1.21876C18.5674 1.00782 18.252 0.943371 17.9746 1.05274L1.47462 7.56153C1.20509 7.667 1.0215 7.91993 1.00196 8.20899C0.982421 8.49805 1.13087 8.77247 1.3838 8.91309L7.63868 12.4082L11.1602 18.6201C11.294 18.8555 11.544 19 11.8125 19C11.8301 19 11.8486 18.999 11.8662 18.9981C12.1553 18.9775 12.4063 18.792 12.5107 18.5225L18.9483 2.02247C19.0567 1.74513 18.9903 1.42872 18.7793 1.21876ZM15.1691 3.77149L8.05616 10.9231L3.49708 8.37598L15.1691 3.77149ZM11.6875 16.5078L9.1211 11.9812L16.2495 4.81397L11.6875 16.5078Z" fill="currentColor"/>
</svg>`;
  }

  function _spinnerIcon() {
    return `<div class="loading-spinner sm" style="width:16px;height:16px;border-width:2px"></div>`;
  }

  function _emptyState() {
    return `<div class="yukon-empty">
      <svg viewBox="0 0 48 48" fill="none" style="width:44px;height:44px;color:var(--gray-300)">
        <path d="M42 30a4 4 0 0 1-4 4H14L6 42V10a4 4 0 0 1 4-4h28a4 4 0 0 1 4 4z"
          stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M16 20h16M16 27h10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
      <div class="yukon-empty-title">${t('yukon.chatTitle') || 'AI Assistant'}</div>
      <p>${t('yukon.emptyHint') || 'Ask anything about your health checks, customers, or documents.'}</p>
    </div>`;
  }

  function _panelHtml() {
    return `
      <div class="yukon-chat-header">
        <div class="yukon-chat-title">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M16.75 1.99999H8.75C7.50736 1.99999 6.5 3.00735 6.5 4.24999V4.74999C6.5 5.16405 6.83594 5.49999 7.25 5.49999C7.66406 5.49999 8 5.16405 8 4.74999V4.24999C8 3.8369 8.33691 3.49999 8.75 3.49999H16.75C17.1625 3.49999 17.5 3.83749 17.5 4.24999V8.74999C17.5 9.16249 17.1625 9.49999 16.75 9.49999H16C15.5858 9.49999 15.25 9.83578 15.25 10.25V11.9014L13.5 10.3594V9.24999C13.5 8.00735 12.4926 6.99999 11.25 6.99999H3.25C2.00736 6.99999 1 8.00735 1 9.24999V13.75C1 14.9902 2.00977 16 3.25 16V18.1367C3.25 18.5195 3.47754 18.8603 3.83008 19.0059C3.94922 19.0547 4.07422 19.0781 4.19531 19.0781C4.43359 19.0781 4.66113 18.9893 4.81347 18.833L8.0332 16H11.25C12.4926 16 13.5 14.9926 13.5 13.75V12.3572L15.1397 13.8008C15.3203 13.9814 15.5596 14.0762 15.8047 14.0762C15.9268 14.0762 16.0508 14.0527 16.1689 14.0039C16.5215 13.8574 16.75 13.5176 16.75 13.1367V11C17.9902 11 19 9.99022 19 8.74999V4.24998C19 3.00734 17.9926 1.99999 16.75 1.99999ZM12 13.75C12 14.1625 11.6625 14.5 11.25 14.5H7.4668L4.75 16.8935V15.25C4.75 14.8358 4.41421 14.5 4 14.5H3.25C2.8375 14.5 2.5 14.1625 2.5 13.75V9.24999C2.5 8.83749 2.8375 8.49999 3.25 8.49999H11.25C11.6625 8.49999 12 8.83749 12 9.24999V13.75Z" fill="currentColor"/>
</svg>
          <div>
            <div class="yukon-chat-title-text">${t('yukon.chatTitle') || 'AI Assistant'}</div>
            <div class="yukon-chat-subtitle">Adobe Yukon</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <button class="yukon-icon-btn" id="yukonChatClear" title="${t('yukon.clearHistory') || 'Clear conversation'}">
            <svg viewBox="0 0 16 16" fill="none" style="width:14px;height:14px">
              <path d="M2 4h12M6 4V2h4v2M4 4l.8 10h6.4L12 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="yukon-icon-btn" id="yukonChatClose" title="${t('common.close') || 'Close'}">
            <svg viewBox="0 0 16 16" fill="none" style="width:14px;height:14px">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Context banner: shown only when a specific HC/customer is active -->
      <div id="yukonContextBanner" class="yukon-context-banner" style="display:none"></div>

      <div class="yukon-chat-messages" id="yukonChatMessages">
        ${_emptyState()}
      </div>

      <!-- Suggested prompt chips -->
      <div class="yukon-suggestions" id="yukonSuggestions"></div>

      <div class="yukon-chat-footer">
        <textarea
          id="yukonChatInput"
          class="yukon-chat-input"
          placeholder="${t('yukon.inputPlaceholder') || 'Ask a question about your health checks…'}"
          rows="1"
          maxlength="2000"
        ></textarea>
        <button class="yukon-chat-send" id="yukonChatSend" title="${t('yukon.sendBtn') || 'Send'}">
          ${_sendIcon()}
        </button>
      </div>
      <div class="yukon-chat-hint">${t('yukon.inputHint') || 'Shift+Enter for new line'}</div>`;
  }

  return { init, open, close, toggle, setContext, getSessionsList, restoreSession };
})();
