/* config.js – Shared app configuration & debug logging */

window.APP_CONFIG = { ollamaEnabled: false, debug: false, appMode: 'normal', afterPartyMode: false };

window.debugLog = function (...args) {
  if (window.APP_CONFIG.debug) console.log('[DEBUG]', ...args);
};

fetch('/api/config')
  .then(function (r) { return r.json(); })
  .then(function (config) {
    window.APP_CONFIG = config;
    if (window.APP_CONFIG.afterPartyMode) {
      document.querySelectorAll('.nav .nav-link').forEach(function (link) {
        const href = link.getAttribute('href');
        if (href === '/' || href === '/index.html' || href === '/kiosque.html') {
          link.style.display = 'none';
        }
      });
    }
    if (config.debug) console.log('[DEBUG] App config loaded:', config);
    document.dispatchEvent(new CustomEvent('app-config-loaded', { detail: config }));
  })
  .catch(function (err) { console.warn('Config loading failed:', err.message); });
