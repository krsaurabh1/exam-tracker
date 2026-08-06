// Loaded as a blocking <script src> in <head>, before style.css, so theme and
// lock state are resolved before first paint — no flash of the wrong theme or
// of real content on a locked page. Kept out of each page's own script so the
// password hash lives in exactly one place across the whole site.
(function () {
  try {
    var stored = localStorage.getItem('exam-tracker.theme');
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.dataset.theme = stored;
    } else {
      var prefersDark = window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
    }
  } catch (err) {}

  // Single source of truth for the access gate — flip "required" to false
  // (and redeploy) to remove the password requirement entirely.
  // The password itself is never stored here, only its SHA-256 hash.
  window.__examTrackerGate = {
    required: true,
    hash: 'adf40e4366c6838f43cdf1bbd2ded885259943561e24e430f276c0497fb40cc8'
  };

  var g = window.__examTrackerGate;
  var locked = g.required;
  if (g.required) {
    try {
      locked = localStorage.getItem('exam-tracker.gate') !== g.hash;
    } catch (err) {}
  }
  document.documentElement.dataset.locked = locked ? 'true' : 'false';
})();
