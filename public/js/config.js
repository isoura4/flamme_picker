/* config.js – Shared app configuration & debug logging */

window.APP_CONFIG = { ollamaEnabled: false, debug: false };

window.debugLog = function (...args) {
  if (window.APP_CONFIG.debug) console.log('[DEBUG]', ...args);
};

fetch('/api/config')
  .then(function (r) { return r.json(); })
  .then(function (config) {
    window.APP_CONFIG = config;
    if (config.debug) console.log('[DEBUG] App config loaded:', config);
    document.dispatchEvent(new CustomEvent('app-config-loaded', { detail: config }));
  })
  .catch(function () {});
