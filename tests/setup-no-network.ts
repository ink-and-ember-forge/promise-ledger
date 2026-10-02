// Network isolation (SPEC sections 4 and 11): any attempt to reach the network during a test fails it.
// Loaded for every test via vite.config.ts. Do not remove.
const blocked = (api: string) =>
  function () {
    throw new Error(`Network access attempted via ${api}; Promise Ledger must make no network calls.`);
  };

const g = globalThis as Record<string, unknown>;
g.fetch = blocked('fetch');
g.XMLHttpRequest = blocked('XMLHttpRequest');
g.WebSocket = blocked('WebSocket');
g.EventSource = blocked('EventSource');
if (typeof g.navigator === 'object' && g.navigator) {
  Object.defineProperty(g.navigator, 'sendBeacon', { value: blocked('sendBeacon'), configurable: true });
}
