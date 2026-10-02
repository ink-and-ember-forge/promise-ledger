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

## M1 step 1: domain/ (line parsing, matching, draft rows)
- **Exact name beats prefix matches.** `@Sam` links to "Sam" even when "Samantha" exists; ambiguity is only reported when the deciding tier has several hits (e.g. two "Alex"). Refines the "unambiguous only" rule so a person with a short exact name stays taggable.
- **"Fuzzy" means exact / word / prefix, case- and accent-insensitive.** No typo tolerance (edit distance) in v1: it would raise wrong-link risk. Add later in `matchName.ts` if mistyped names prove common.
- **Mention sigils are dropped from item text, names stay as plain words** ("ask @Sam" becomes "ask Sam"), so items read naturally in lenses. The link lives in `people` / `projectIds`.
- **Not mentions:** `#12`-style numeric references and `@` inside e-mail addresses.
- **Bare prefixes** (a line that is only `?` or `T:`) produce no row.
- **Apply-to-all** adds to every row without duplicating tags and never mutates its input.

## M1 step 2: Dexie schema and repo
- **`Repo` class over a `LedgerDB`.** All writes go through `src/db/repo.ts` so invariants (one "Me", required text/title, soft delete, `touchedAt`) live in one place. Clock and id generators are injectable for deterministic tests.
- **Schema v1** indexes only `meetings.date/status` and `items.state/originMeetingId/parentId`. Further versions must be new `version(n)` blocks, never edits to a released one.
- **Tagged people commit as `involved`.** An `@Name` mention says who is connected, not who owns or is owed; the enrichment pass can promote them to `owner` / `recipient`.
- **`commitDraft` validates every row first, then writes items and clears the draft in one transaction.** One bad row means nothing is written and the draft is kept.
- **"Me" cannot be removed** (SPEC section 7: exactly one `isSelf`).
- **`dexie`** (runtime) and **`fake-indexeddb`** (dev only, so db tests run in Node) added, as planned. `dexie-react-hooks` waits for the UI step.
- **Not done here:** export/import and `schemaVersion` in exports (M4); the constant `SCHEMA_VERSION` is defined for it.

## M1 step 3: People, Projects and Meetings screens
- **Hash router** (`src/ui/router.ts`), no dependency; works on any static host, including GitHub Pages later. Default route is Meetings, the closest screen to Capture until Today exists.
- **`dexie-react-hooks`** added for `useLiveQuery`, so lists update when the database changes. Screens read through the same `Repo` as everything else.
- **Meeting dates are stored as `YYYY-MM-DD`** (valid ISO 8601, from the date input in local time) rather than a full timestamp, so a meeting never shifts day across time zones.
- **"Me" is pre-ticked as an attendee** on new meetings and has no Remove button. Apply-to-all in Capture ignores self, as the spec says.
- **Removing a person or project keeps the meetings and items** that referenced them; the missing name is simply omitted from the list (SPEC section 7). Verified in a real browser.
- **Empty states** are one sentence plus the next action (SPEC section 9).
- **No component tests yet.** The UI was verified by driving the built app in Chromium (create person, project and meeting; reload; soft-delete; no external requests, no console errors) using a throwaway Playwright install outside the repo. A committed end-to-end suite arrives in M4; a jsdom component-test setup was not added, to avoid a dependency for three simple forms.
- **Added `<link rel="icon">`** to `index.html` after the browser check showed a 404 on the automatic favicon request.
