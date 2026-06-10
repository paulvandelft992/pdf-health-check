/**
 * Background service worker — minimal.
 * Handles cross-tab state and messaging if needed in future.
 */

// Keep the service worker alive during long import operations
chrome.runtime.onMessage.addListener((_msg, _sender, _sendResponse) => {
  // no-op — just prevent GC of service worker
});
