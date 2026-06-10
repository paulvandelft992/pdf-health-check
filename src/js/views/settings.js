/* Settings View — delegates to the unified SettingsModal */
const SettingsView = (() => {

  function render(container) {
    container.innerHTML = '';
    SettingsModal.open('connection');
  }

  return { render };
})();
