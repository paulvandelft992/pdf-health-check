/**
 * Content script — injected into every page.
 * Detects whether the current page is a PDF and reports to the popup.
 */
(function () {
  // A page is a PDF viewer if:
  // 1. The document content-type is application/pdf (Chrome's built-in viewer sets a body attribute)
  // 2. OR the URL ends in .pdf
  // 3. OR the page embed/object references a PDF
  function isPdfPage() {
    const url = window.location.href;
    if (/\.pdf(\?.*)?$/i.test(url)) return true;
    // Chrome's built-in PDF viewer renders a minimal HTML shell
    if (document.contentType === 'application/pdf') return true;
    if (document.body && document.body.getAttribute('type') === 'application/pdf') return true;
    return false;
  }

  function getPageInfo() {
    return {
      isPdf:    isPdfPage(),
      url:      window.location.href,
      title:    document.title || '',
      domain:   window.location.hostname,
      protocol: window.location.protocol,
    };
  }

  // Extract all PDF links from the already-rendered DOM.
  // Runs in the page context so JavaScript-rendered links are included.
  function extractPagePdfs() {
    const seen = new Set();
    const pdfs = [];

    function add(url) {
      try {
        const abs = new URL(url, window.location.href).href;
        if (/\.pdf(\?.*)?$/i.test(abs) && !seen.has(abs)) {
          seen.add(abs);
          const filename = abs.split('/').pop().split('?')[0] || 'document.pdf';
          pdfs.push({ url: abs, filename });
        }
      } catch {}
    }

    document.querySelectorAll('a[href]').forEach(a => add(a.getAttribute('href') || ''));
    document.querySelectorAll('iframe[src],embed[src],object[data]').forEach(el =>
      add(el.getAttribute('src') || el.getAttribute('data') || '')
    );

    return pdfs;
  }

  // Respond to popup requests
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_PAGE_INFO') {
      sendResponse(getPageInfo());
    }
    if (msg.type === 'GET_PAGE_PDFS') {
      sendResponse({ pdfs: extractPagePdfs(), pageUrl: window.location.href });
    }
    return true; // keep channel open for async use
  });
})();
