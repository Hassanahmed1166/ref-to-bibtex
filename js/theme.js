/** Shared theme handling: stored choice, else the OS preference. Loaded in <head> to avoid a flash. */
(function () {
  var KEY = 'authenticite-theme', root = document.documentElement;
  function stored() { try { return localStorage.getItem(KEY); } catch (_) { return null; } }
  function current() { return stored() || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); }
  function apply(t) {
    root.setAttribute('data-theme', t);
    var b = document.getElementById('themeBtn');
    if (b) { b.textContent = t === 'dark' ? '☀ Light' : '☾ Dark'; b.setAttribute('aria-label', 'Switch to ' + (t === 'dark' ? 'light' : 'dark') + ' theme'); }
  }
  apply(current());
  document.addEventListener('DOMContentLoaded', function () {
    apply(root.getAttribute('data-theme'));
    var b = document.getElementById('themeBtn');
    if (b) b.addEventListener('click', function () {
      var t = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, t); } catch (_) {}
      apply(t);
    });
  });
})();
