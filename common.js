// Shared by every page's own script (scores.js, schools.js, the dashboard):
// the access gate, theme toggle, local-storage helpers, and the
// download-a-JSON-file publish mechanic. Attached to window.Common so each
// page script can stay a plain <script>, no module bundler needed.
window.Common = (function () {
  'use strict';

  function readRaw(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      return null; // storage blocked (e.g. private browsing)
    }
  }

  function writeRaw(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (err) {
      return false;
    }
  }

  function makeId() {
    return String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function sha256Hex(text) {
    var data = new TextEncoder().encode(text);
    return crypto.subtle.digest('SHA-256', data).then(function (buffer) {
      return Array.prototype.map.call(new Uint8Array(buffer), function (b) {
        return (b < 16 ? '0' : '') + b.toString(16);
      }).join('');
    });
  }

  // els: { gateForm, gatePasswordInput, gateError }. onUnlock is called once,
  // either synchronously (already unlocked / gate not required) or after a
  // correct password is submitted.
  function initGate(els, onUnlock) {
    var gateConfig = window.__examTrackerGate || { required: false, hash: '' };

    function unlock() {
      document.documentElement.dataset.locked = 'false';
      onUnlock();
    }

    if (!gateConfig.required || document.documentElement.dataset.locked === 'false') {
      unlock();
      return;
    }

    els.gatePasswordInput.focus();
    els.gateForm.addEventListener('submit', function (event) {
      event.preventDefault();
      sha256Hex(els.gatePasswordInput.value).then(function (hash) {
        if (hash === gateConfig.hash) {
          writeRaw('exam-tracker.gate', hash);
          els.gateError.hidden = true;
          unlock();
        } else {
          els.gateError.hidden = false;
          els.gatePasswordInput.select();
        }
      });
    });
  }

  // els: { themeToggle, themeLabel }
  function initTheme(els) {
    function applyTheme(theme) {
      document.documentElement.dataset.theme = theme;
      var isDark = theme === 'dark';
      els.themeLabel.textContent = isDark ? 'Light mode' : 'Dark mode';
      els.themeToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      els.themeToggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    }

    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

    els.themeToggle.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      writeRaw('exam-tracker.theme', next);
    });
  }

  // Cache-busted so a republished file shows up without a hard refresh.
  function fetchJson(url) {
    return fetch(url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + encodeURIComponent(String(Date.now())), {
      cache: 'no-store'
    }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    });
  }

  function downloadJson(filename, payload) {
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoked on a delay so the download has time to start in every browser.
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function describePublishTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return ' Last updated ' + d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    }) + '.';
  }

  return {
    readRaw: readRaw,
    writeRaw: writeRaw,
    makeId: makeId,
    sha256Hex: sha256Hex,
    initGate: initGate,
    initTheme: initTheme,
    fetchJson: fetchJson,
    downloadJson: downloadJson,
    describePublishTime: describePublishTime
  };
})();
