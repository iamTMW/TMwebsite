/* Applies a saved light/dark preference before first paint. No preference = follow the OS. */
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: fall back to the OS setting */ }
})();
