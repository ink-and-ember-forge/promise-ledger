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

## M1 step 4: Capture screen
- **Route `#/capture/<meetingId>`**, reached from "Sort notes" on each meeting. The meetings list also shows "notes waiting to be sorted" for meetings with uncommitted rows (the Today screen's "still to sort" arrives in M3).
- **Two stages: paste, then rows.** `Ctrl/Cmd+Enter` sorts the paste into rows; in the rows stage the same chord saves all rows, from anywhere on the screen. "Back to pasted notes" asks first, since it discards row edits.
- **Autosave.** The pasted block is saved verbatim to `rawNotes` and the rows to the `drafts` table, both debounced by 250 ms, with an immediate flush when the page is hidden. On return the screen restores the draft, including edits and open prompts.
- **Unresolved mentions persist on the row** (`DraftRow.unresolved`), so an ambiguous `@Alex` still asks "which one?" after a closed tab. Choices per mention: pick a candidate, add a new person/project from the mention's name, or leave untagged.
- **Keyboard model.** `Alt+T` cycles the type from the text field (`cycleType` in `domain/`). On the type dropdown itself the browser's own type-ahead (n / t / q) acts as the "single key". `Enter` moves to the next row and adds a blank row after the last; blank rows are dropped on save.
- **Apply to all** appears only when the meeting has exactly one project or one non-self attendee, as the spec says.
- **Untagged rows are saved** and will surface under "Needs a home" (M2).
- **After saving, the screen lists what was created** with "Add more notes". The optional enrichment pass (owner, recipient, commitment, deadline, importance, effort, link) is the next PR and will plug in here.
- **Known limit:** each row is a single-line input, so very long lines scroll rather than wrap. A growing textarea per row would fix that; deferred to keep Enter-to-next-row simple.
- **Verified in Chromium** (throwaway Playwright install, not committed): 20 pasted lines sorted, tagged and saved with the keyboard; tab closed mid-capture and reopened with all edits restored; 20 items stored with origin set, 0 drafts left, `rawNotes` identical to the paste; no horizontal overflow at 390 px; 0 external requests, no console errors. That run found and fixed a bug where `Ctrl+Enter` only worked from the buttons, not from a text field.

## M1 step 5: enrichment pass
- **Shown right after saving rows**, as its own stage. The items are already stored, so "Skip for now" is one click and loses nothing; "Save details" (or `Ctrl/Cmd+Enter`) applies everything filled in. Both ends of the list have both buttons.
- **Only what is filled in is touched** (`domain/enrichment.ts`). A blank field never erases a value already there.
- **Fields by type (a refinement of SPEC 6.1):** tasks and questions get owner, who it's for, "I told them", deadline, importance, effort and link; notes get only importance and link, since owner or effort on a note is rarely meaningful. One function, `enrichmentFieldsFor`, so it is easy to widen.
- **Owner and recipient are exclusive per role.** Choosing one replaces an earlier owner or recipient, and promotes someone who was only "involved" (from an `@Name` tag). Re-choosing the same recipient keeps its `reportedBackAt`.
- **"I told [person] I'd do this"** needs a recipient, records `commitment.toPersonId` with `madeOn` defaulting to the origin meeting's date, and makes "Me" the owner (the Person lens's "I owe P" depends on that). The owner dropdown shows Me and locks while it is ticked, so the screen never shows a contradiction.
- **Links must start with http or https.** Anything else (including `javascript:`) is refused. A bad link is flagged and blocks the save with a plain message, rather than being silently dropped.
- **All details save in one transaction** (`Repo.updateItems`), so a failure leaves nothing half-applied; it bumps `touchedAt` like any edit.
- **Not offered here:** pinning a note as "worth raising", flags (decision/risk/issue) and updates. They belong on the item detail screen (SPEC screen 4).
- **Accessibility fix found while testing:** the "I told…" checkbox's accessible name now matches its visible text, including the person's name.
- **Verified in Chromium** (throwaway Playwright install, not committed): task given recipient, commitment, deadline, importance, effort and link; question given an owner; note offers only importance and link; a link without a scheme blocks save; the skip path stores nothing extra and keeps the `@` tag as "involved"; 0 external requests, no console errors.

## GitHub Pages deployment fix
- **Root cause of the blank page:** Pages was set to "Deploy from a branch" (`main`, root), which publishes the repository files as they are. The root `index.html` is the Vite *source* template: it loads `/src/main.tsx` (a 404 under a project site, and a MIME-type error even when the path resolves, since browsers cannot run TSX). `dist/` is gitignored, so there was never built output to serve. Reproduced locally by serving a `git archive` of `main` under `/promise-ledger/` in Chromium.
- **Fix: deploy by GitHub Actions** (`.github/workflows/deploy.yml`), publishing `dist/`. This needs a one-time change in Settings > Pages > Source to "GitHub Actions"; it cannot be done from the repository. Committing `dist/` to `main` was rejected: it would put generated files in the history and still need a base path.
- **`base` from `BASE_PATH`** in `vite.config.ts` (default `/`), set by the workflow to `/<repo-name>/`. Local dev, tests and `npm run build` are unchanged. The service worker scope, manifest and asset URLs all follow it.
- **The deploy workflow fails loudly:** after building it prints `dist/` and `dist/index.html`, and errors if the output still references `src/main.tsx`, does not load its bundle from the base path, or is missing `boot-check.js`, the manifest, the service worker or the icon.
- **`boot-check.js`** is a plain, deliberately unbundled script (referenced by relative path, copied into `dist/` by a small Vite plugin), because logging inside the app cannot help when the app never starts. It logs failed script/stylesheet loads and Content Security Policy blocks, detects the unbuilt-source case and says how to fix it, and after 4 seconds without the app starting shows a plain on-page message. It makes no network calls and is covered by the network-isolation scan. Vite's "can't be bundled" warning for it is filtered out in `vite.config.ts`.
- **`src/ui/diagnostics.ts`** logs one `[promise-ledger] started` line (page URL, base, mode, secure context, IndexedDB, service worker support, installed or not), warns if the page path is outside the base, and logs uncaught errors and unhandled rejections. `App` now logs a clear error if the local database cannot be opened instead of failing silently.
- **Verified in Chromium** with a Pages-style build served under `/promise-ledger/`: renders, zero failed requests, service worker scoped to `/promise-ledger/`, an offline reload works and the saved data is still there. The misconfigured case (source files served) now shows the explanation in both the console and the page.
- **Not verified:** the live site itself. The sandbox's egress policy blocks `github.io`, so the real Pages settings and deployment could not be inspected from here.
