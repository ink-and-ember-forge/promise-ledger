# Decisions

Non-obvious choices and deviations from SPEC.md, with reasons (SPEC section 12).

## Scaffold (M0, partial)
- **Minimal dependency set.** Only React, Vite, TypeScript and Vitest so far. Dexie, `vite-plugin-pwa` and Playwright are added in the milestone that first needs them (M1 / M0-PWA step / M4), per "do not add dependencies without a stated reason".
- **CSP via `<meta>` tag** in `index.html` (`default-src 'self'; connect-src 'none'`). `style-src 'unsafe-inline'` is allowed for now because React inline styles need it; revisit when styling is settled.
- **`src/domain/` is framework-free**; `src/db/` and `src/ui/` may depend on it, never the reverse.

## M0 completion
- **PWA** via `vite-plugin-pwa` (generateSW, autoUpdate). Registration is an external `registerSW.js`, so the CSP needs no `script-src 'unsafe-inline'`. Icon is a single SVG (`purpose: any maskable`); add PNG sizes if an install target rejects SVG.
- **Network isolation**: `tests/setup-no-network.ts` replaces `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `sendBeacon` with throwing stubs for every test; `tests/network-isolation.test.ts` also checks the CSP and scans `src/` for network APIs and remote URLs. Runs in CI and must not be removed.
- **Lint**: ESLint 9 flat config with typescript-eslint and react-hooks. `src/domain/` is barred from importing React, Dexie, `ui/` or `db/`.
- **CI**: `.github/workflows/ci.yml` runs lint, typecheck, test and build on PRs and pushes to `main`.
- **`@types/node`** is a dev dependency only for the isolation test's file scan.

## Not yet verified
- Offline load and installability in a real browser (needs a Playwright check, planned for M4).
