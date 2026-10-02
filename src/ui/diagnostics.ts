const TAG = '[promise-ledger]';

type StartedFlag = { __promiseLedgerStarted?: () => void };

/**
 * Logs what the app is running on, to make hosting problems easy to spot in the console.
 * Reads local browser state only; it makes no network calls.
 */
export function logBoot(): void {
  // Tells the watchdog in boot-check.js that the app mounted.
  (window as unknown as StartedFlag).__promiseLedgerStarted?.();

  window.addEventListener('error', (e) => console.error(TAG, 'Uncaught error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => console.error(TAG, 'Unhandled promise rejection', e.reason));

  const base = import.meta.env.BASE_URL;
  const info = {
    page: window.location.href,
    base,
    mode: import.meta.env.MODE,
    secureContext: window.isSecureContext,
    indexedDB: 'indexedDB' in window,
    serviceWorkerSupported: 'serviceWorker' in navigator,
    installed: window.matchMedia('(display-mode: standalone)').matches,
  };
  console.info(TAG, 'started', info);

  if (!window.location.pathname.startsWith(base)) {
    console.warn(TAG, `Page path "${window.location.pathname}" is outside the build base "${base}". Assets may fail to load.`);
  }
  if (!info.secureContext) console.warn(TAG, 'Not a secure context: the service worker and persistent storage will not work.');
  if (!info.indexedDB) console.error(TAG, 'IndexedDB is unavailable, so nothing can be saved. Private or restricted browsing can cause this.');

  void navigator.storage?.persisted?.().then((persisted) => console.info(TAG, 'persistent storage granted:', persisted));
  void navigator.serviceWorker?.getRegistrations().then((regs) =>
    console.info(TAG, 'service workers:', regs.length === 0 ? 'none registered yet' : regs.map((r) => r.scope)),
  );
}
