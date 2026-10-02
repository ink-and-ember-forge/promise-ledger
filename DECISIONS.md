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

## M1 plan (agreed before building)
- **Drafts table.** Edited capture rows (type, tags) autosave per meeting in a separate Dexie `drafts` table, keyed by `meetingId`, and are deleted on commit. `meeting.rawNotes` stays as the verbatim paste for provenance. Reason: SPEC 6.1 says closing the tab must lose nothing, which `rawNotes` alone cannot guarantee for edited rows.
- **Name matching.** `@Name` / `#Project` auto-link only on a single unambiguous match; several matches show a pick list; no match offers to create. Reason: a silent wrong guess would link the wrong colleague. Easy to change in `domain/matchName.ts`.
- **Type-cycle key.** `Alt+T` inside the text field, a bare key when the row itself is focused. Reason: a bare key in a text field is just typing.
- **No indexes on link fields.** `Item.people` is an array of objects, which Dexie cannot multi-index, and a duplicated id array would break "store once". Index only `state`, `originMeetingId`, `parentId`; lens queries (M2) are pure functions over loaded arrays.
- **Commit is one transaction** that creates all items and removes the draft, so a crash cannot half-commit.
- **New dependencies for M1:** `dexie` and `dexie-react-hooks` (live queries), `fake-indexeddb` (dev only, db tests in Node). Router is a small hash router, no dependency.
- **Deferred:** GitHub Pages deployment (needs `base: '/promise-ledger/'` and a deploy workflow) waits until after M1; offline/install check on the live URL happens then.
