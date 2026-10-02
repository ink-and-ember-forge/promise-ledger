/*
 * Boot diagnostics for GitHub Pages and other static hosts.
 *
 * This is a plain script on purpose: it is not bundled, so it still runs when the app bundle
 * cannot load (wrong base path, wrong Pages source, blocked script). It makes no network calls.
 * The app itself calls window.__promiseLedgerStarted() once it mounts.
 */
(function () {
  var TAG = '[promise-ledger]';
  var started = false;
  var WAIT_MS = 4000;

  function log(level, message, data) {
    try {
      if (data === undefined) console[level](TAG + ' ' + message);
      else console[level](TAG + ' ' + message, data);
    } catch {
      /* console unavailable */
    }
  }

  function banner(title, lines) {
    var root = document.getElementById('root');
    if (!root || root.childNodes.length > 0) return;
    var box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.maxWidth = '40rem';
    box.style.margin = '2rem auto';
    box.style.padding = '1rem';
    box.style.border = '2px solid currentColor';
    box.style.font = '16px/1.5 system-ui, sans-serif';
    var h = document.createElement('strong');
    h.textContent = title;
    box.appendChild(h);
    for (var i = 0; i < lines.length; i++) {
      var p = document.createElement('p');
      p.textContent = lines[i];
      box.appendChild(p);
    }
    root.appendChild(box);
  }

  function problem(title, hints) {
    log('error', title);
    for (var i = 0; i < hints.length; i++) log('error', '  - ' + hints[i]);
    banner(title, hints.concat(['Open the browser console (F12) for details.']));
  }

  window.__promiseLedgerStarted = function () {
    started = true;
  };

  // A script or stylesheet that failed to load (404, wrong MIME type, blocked).
  window.addEventListener(
    'error',
    function (e) {
      var t = e.target;
      if (t && t !== window && (t.src || t.href)) {
        log('error', 'Failed to load <' + String(t.tagName).toLowerCase() + '> ' + (t.src || t.href), {
          page: location.href,
        });
      }
    },
    true,
  );

  document.addEventListener('securitypolicyviolation', function (e) {
    log('error', 'Blocked by the Content Security Policy', {
      directive: e.violatedDirective,
      blocked: e.blockedURI,
    });
  });

  document.addEventListener('DOMContentLoaded', function () {
    // The unbuilt index.html points at the TypeScript entry. Browsers cannot run that.
    if (document.querySelector('script[src$="src/main.tsx"]')) {
      problem('This is the unbuilt source, not the app.', [
        'index.html still references src/main.tsx, so this host is serving the repository files as they are.',
        'GitHub Pages must publish the build output: Settings > Pages > Source > "GitHub Actions".',
        '"Deploy from a branch" (main, root) serves source files and cannot run this app.',
      ]);
    }
  });

  setTimeout(function () {
    if (started) return;
    problem('The app did not start within ' + WAIT_MS / 1000 + ' seconds.', [
      'Page URL: ' + location.href,
      'Check the Network tab for failed requests under this path (404 usually means a wrong base path).',
      'A MIME type error on the script means source files are being served instead of a build.',
    ]);
  }, WAIT_MS);
})();
