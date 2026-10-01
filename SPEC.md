# Promise Ledger: Project Specification

Working title. A local-first, no-AI, no-server web app for turning handwritten meeting notes into a connected record of questions, tasks and commitments, and surfacing the right slice of it for whatever context the user is about to walk into.

This document is written to be handed to an AI coding agent. Read the whole thing before writing code. Section 12 lists how to work.

---

## 1. Purpose and the problem being solved

### The user
One person (the "owner"), a programme manager with back-to-back meetings, often 5 to 11 a day, across several projects, stakeholders and a small team. They take handwritten notes on an e-ink tablet during meetings.

### The problem
**Capture already works. Processing is what fails.** Their handwritten notes contain everything they need, but the notes sit in one place and nothing turns them into a system that tells them what to do next. Past attempts (a Notion tracker, a custom-built system) failed for the same reasons:

1. Notes are born in one place and the system lives in another, so every item costs a manual transfer at the moment they have the least time.
2. Each processing session turned into a redesign session, because there was no single obviously correct place to file an item.
3. Systems filed things one primary way (by project, or one central list), so every other view was manual work.
4. Forms asking for lots of metadata at filing time were abandoned.

What currently works as a safety net is a colleague noticing a dropped action in a catch-up. The system should do that job: surface what the owner promised, to whom, in their own words, at the moment they need it.

### Core design principles (non-negotiable)
1. **File once, view many ways.** Every item is stored once and appears in every relevant lens (person, project, meeting prep, free time, overview). No duplicate entry, ever.
2. **Cheap to capture, optional to enrich.** The minimum record must be completable in seconds while a meeting is fresh. Everything else can wait until it matters.
3. **Pull, not push.** The app never sends notifications. The owner opens it and states a context; it answers. (Exception: the "Today" screen on open, section 6.5.)
4. **Commitments, not due dates, are the lever.** Nudges are phrased as what the owner said, to whom, and when. They never use blame language (see section 8).
5. **No composite priority score.** Show parallel lenses and let the owner choose which to trust. Do not implement RICE, Eisenhower scoring or any hidden formula.
6. **Link, don't copy.** Tasks that live in an external tool (ClickUp) are referenced by URL. The app never duplicates or syncs their data.
7. **Local only.** The data contains notes about named colleagues and stakeholders in a public health body. It never leaves the device. No network calls at runtime (section 4).

### Non-goals (v1)
- No AI, LLM or machine-learning features of any kind, and nothing in the design that depends on them.
- No accounts, login, sync, multi-user or sharing.
- No calendar, ClickUp, Notion or e-mail integrations.
- No push notifications, streaks, points, progress bars, percentage-complete counters or other gamified scoring.
- No handwriting recognition or direct import of handwritten notes. The owner pastes typed text.

---

## 2. Domain model

Use TypeScript. All IDs are UUIDv4 strings. All timestamps are ISO 8601 strings. Soft-delete via `deletedAt`; never hard-delete user data except via an explicit "erase everything" action.

```ts
type ItemType = 'note' | 'task' | 'question';
type ItemState = 'open' | 'resolved' | 'dropped';
type PersonRole = 'owner' | 'recipient' | 'involved';
type Flag = 'decision' | 'risk' | 'issue';

interface Person {
  id: string;
  name: string;
  isSelf: boolean;          // exactly one person has isSelf = true ("Me")
  roleDescription?: string; // e.g. "Stakeholder", "Team member"
  createdAt: string;
  deletedAt?: string;
}

interface Project {
  id: string;
  name: string;
  purpose?: string;         // short statement of what the project is trying to achieve
  status: 'active' | 'archived';
  createdAt: string;
  deletedAt?: string;
}

interface Meeting {
  id: string;
  title: string;
  date: string;
  status: 'upcoming' | 'held';
  kind: 'project' | 'one-to-one' | 'team' | 'other';
  attendeeIds: string[];    // Person ids
  projectIds: string[];     // Project ids
  rawNotes?: string;        // the pasted block, kept verbatim for provenance
  createdAt: string;
  deletedAt?: string;
}

interface ItemPersonLink {
  personId: string;
  role: PersonRole;
  // Only meaningful for role = 'recipient' on a resolved item:
  reportedBackAt?: string;  // set when the owner has told this person the outcome
}

interface Commitment {
  toPersonId: string;       // who the promise was made to
  madeOn: string;           // defaults to the origin meeting's date
}

interface ItemUpdate {
  at: string;
  text: string;             // "As of this date, brief status"
}

interface ExternalLink {
  url: string;
  label?: string;           // e.g. "ClickUp: build pages"
}

interface Item {
  id: string;

  // REQUIRED MINIMUM RECORD
  text: string;
  type: ItemType;
  originMeetingId: string;

  // Association (strongly encouraged, see "Needs a home" lens)
  projectIds: string[];
  people: ItemPersonLink[];

  // Lifecycle
  state: ItemState;
  resolvedAt?: string;
  answerText?: string;      // for resolved questions
  parentId?: string;        // the question that spawned this item (chains, 6.3)
  updates: ItemUpdate[];

  // Optional enrichment (never required)
  commitment?: Commitment;
  dueBy?: string;
  importance?: 'low' | 'normal' | 'high';
  effortMinutes?: number;   // rough estimate, powers "fits your window"
  flags: Flag[];            // supports the RAID view
  pinned: boolean;          // human context to remember to raise, e.g. "ask how the house viewing went"
  externalLinks: ExternalLink[];

  createdAt: string;
  touchedAt: string;        // updated on any edit or update; powers "going stale"
  deletedAt?: string;
}
```

### Derived concepts (compute, don't store)
- **Chain**: a root question (no `parentId`) plus all descendants. A chain is **closed** when every item in the tree has `state` of `resolved` or `dropped`. Notes cannot be parents.
- **Unhomed item**: an open item with no `projectIds` and no `people` links. Shown in the "Needs a home" gap list.
- **Unowned question**: an open question with no link of role `owner`. Shown in gaps.
- **Done but not told**: a resolved item with a `recipient` link where `reportedBackAt` is unset.
- **Associated projects of a person**: the distinct projects across all items linked to that person.

---

## 3. Screens

1. **Today**: landing screen (6.5).
2. **Capture**: register a meeting and sort pasted notes (6.1).
3. **Context picker + lens view**: choose Person, Project, Upcoming meeting, Free time, or Overview (6.2).
4. **Item detail**: edit, add updates, enrich, link, resolve.
5. **Chains / Fog map**: per project (6.3, 6.4).
6. **People, Projects, Meetings**: simple list/CRUD screens.
7. **Backup and settings**: export/import, erase, storage status (6.6).

Design for keyboard-first use on desktop and comfortable touch use on a tablet or phone. Clean, calm, low-chrome. Light and dark themes via `prefers-color-scheme`.

---

## 4. Technical constraints and recommended stack

### Hard constraints
- **Zero network requests at runtime.** Set a strict Content Security Policy (`default-src 'self'; connect-src 'none'`), bundle all fonts and assets locally, include no analytics, telemetry, CDN or third-party scripts. A test must fail if any `fetch`/XHR/WebSocket is attempted.
- Works fully offline after first load (installable PWA with a service worker).
- All data stored in the browser on the owner's device (IndexedDB). On first run, call `navigator.storage.persist()` and surface the result in Settings, because browsers may evict non-persistent storage.
- Must handle several thousand items without noticeable lag.

### Recommended stack (substitute only with a stated reason in DECISIONS.md)
- TypeScript, Vite, React.
- Dexie for IndexedDB.
- `vite-plugin-pwa` for the service worker and manifest.
- Plain CSS variables or Tailwind. Do not add a heavy component library.
- Vitest for unit tests, Playwright for end-to-end tests.
- WebCrypto (AES-GCM, PBKDF2) for optional passphrase-protected exports.

Keep all query and chain logic in a pure, framework-free `domain/` module with no UI or database imports, so it is trivially unit-testable.

---

## 5. Seed and demo data
Provide a "Load demo data" action in Settings that creates **fictional** people (e.g. Alex, Sam, Jordan, Priya), two fictional projects and about 30 items covering every type, a chain of three questions, a resolved-but-not-reported item and an unhomed item. Never include real names anywhere in the codebase, tests or fixtures.

---

## 6. Features

### 6.1 Capture and sorting (the heart of the app)
Goal: after a meeting, the owner pastes their typed-up notes and has everything stored correctly in under two minutes, with no thinking about structure.

Flow:
1. Create a meeting (title, date, kind, attendees, projects). Attendees and projects are chosen from existing records or created inline.
2. Paste a block of text. It is saved verbatim to `meeting.rawNotes` immediately (autosave, so nothing is lost if the tab closes).
3. The text splits into **one draft row per non-empty line**. Each row shows an editable text field, a **type dropdown** (note / task / question), and quick tags for people and projects.
4. **Deterministic shortcuts only (no AI):**
   - Line starting with `?` or `Q:` defaults to **question**.
   - Line starting with `[]`, `- [ ]`, `T:` or `todo:` defaults to **task**.
   - Otherwise **note**.
   - `@Name` links a person (fuzzy match against existing people, case-insensitive; unmatched names offer "create person").
   - `#Project` links a project the same way.
   - If the meeting has exactly one project or one non-self attendee, offer a one-click "apply to all rows".
5. Keyboard: `Tab` moves between fields, a single key cycles the type, `Enter` on the last field moves to the next row, `Cmd/Ctrl+Enter` commits all rows.
6. **Commit** creates `Item` records with `originMeetingId` set. Validation requires only `text`, `type` and origin. Rows left unassociated are saved but will appear under "Needs a home".
7. **Uncommitted drafts persist.** A meeting with pasted notes that have not been committed shows as "still to sort" on the Today screen (6.5). This is the fallback mechanism for days when processing could not happen.

After commit, offer an optional, skippable **enrichment pass**: a list of just-created items with inline fields for owner, recipient, commitment ("I told [person] I'd do this"), deadline, importance, effort and external link. Skipping must be one click and must lose nothing.

### 6.2 Context lenses (the heart of retrieval)
The owner states a context; the app composes a view. Every lens is a query over the same items. **No lens ever sorts by a composite score.**

**Person lens** (selecting person P):
- Projects P is associated with.
- Notes and raw notes from the last held meeting P attended, for continuity.
- **Pinned human context** about P (pinned notes), shown prominently as "Worth raising".
- Open items where P is `owner` ("P is doing or answering").
- Open items where the owner (`isSelf`) is `owner` and P is `recipient` or the commitment target ("I owe P").
- Resolved items where P is `recipient` and `reportedBackAt` is unset ("Done but not yet told to P").
- Button: **Register a meeting with P** (jumps to Capture with P pre-selected).

**Project lens** (selecting project X):
- Purpose statement (editable inline).
- RAID view: Risks, Actions (open tasks), Issues, Decisions, grouped by `flags` and `type`.
- Open question chains (tree view).
- "Who is waiting on whom": open items grouped by owner.
- "Done but not yet told" for this project.
- Latest meeting activity touching the project.

**Meeting-prep lens** (selecting an upcoming `Meeting`):
- The union of the Person lens for each attendee and the Project lens for each linked project, de-duplicated, with each section labelled by why it appears.
- Selecting a person or project directly (no meeting record) gives the same composition for ad hoc prep.

**Free-time lens** (input: minutes available):
Three parallel lists, each independently useful, none merged:
1. **Ahead of upcoming meetings**: open items linked to people or projects of upcoming meetings in the next 7 days, grouped by meeting.
2. **Going stale**: open items sorted by oldest `touchedAt`.
3. **Fits your window**: open tasks whose `effortMinutes` is at most the window; tasks without an estimate shown in a separate collapsed group.
A fourth optional list, **Due soon**, uses `dueBy` only.

**Overview lens**: counts per project of open questions, open tasks, and items waiting on others; plus links into each. Counts are plain facts and not a progress measure.

**Gaps panel** (available inside every lens and on Today). Lists, with one-click fixes:
- Unhomed items.
- Unowned open questions.
- Open tasks with no owner.
- Resolved items with a recipient not yet told.

### 6.3 Question chains
- Any item may be created as a **child** of a question ("this task came out of answering that question"). Resolving a question prompts: "Anything that came out of this answer?" with a fast add for child tasks or questions, skippable.
- Project lens shows chains as collapsible trees. A **closed** chain collapses to a single line showing the root question and closing date.
- A chain is closed only when every item in it is resolved or dropped (computed, never manually set).
- Resolving the last open item in a chain should give a small, quiet acknowledgment. Make the moment of closure visible and satisfying (see 6.4) but never with confetti, points or percentages.

### 6.4 Fog map (v1.5, build after everything else is solid)
A per-project visual map where each question is a cell. **Open questions are fogged; resolved questions are revealed.** Child questions appear as cells adjacent to their parent when the parent is resolved, so answering a question visibly opens new territory.

Hard rules:
- Do **not** show a percentage, a progress bar, a "completion" number, or any gauge.
- Layout may be a simple hex or grid arrangement generated deterministically from the chain structure. Keep it small, calm and legible; a clean tree-like layout is acceptable if hex is too costly.
- Clicking any cell opens the item detail.
- This feature is the lowest priority and may be cut without affecting other features.

### 6.5 Today screen and nudges
Shown on open. Never a notification, never a badge count. Sections, each hidden when empty:
1. **Still to sort**: meetings with uncommitted drafts ("Notes from *Release planning* on *Mon 28 Sep* are waiting to be sorted").
2. **Your own words**: open items that carry a `commitment`, oldest first. Format: *"On Tue 22 Sep you told Sam you'd set up the QA meeting."* Include a one-tap action to resolve, add an update or reschedule.
3. **Done, not yet told**: resolved items with an un-reported recipient.
4. **Gaps**: collapsed summary linking to the Gaps panel.
5. **Backup status**: only shown if the last export is older than 14 days.

Items without a commitment do **not** appear in "Your own words". They live in the lenses.

### 6.6 External links, updates, backup
- Items can hold `externalLinks`. The UI shows a prominent "Open in ClickUp" style button. The app never fetches or syncs anything.
- Any item can hold dated `updates` ("As of 1 Oct: build is in review") so the owner can record a status after checking the external tool, without losing the open question.
- **Export** the entire database as JSON; **import** it to restore (with a confirmation that shows counts, and a choice of merge or replace). Offer an optional passphrase using WebCrypto. Show last export date in Settings.
- **Erase everything**: a clearly separated, double-confirmed action.

---

## 7. Data integrity rules
- Exactly one `Person` has `isSelf = true`; create "Me" automatically on first run.
- Deleting a person, project or meeting is a soft delete and must not orphan items: items remain, unhomed if necessary, with the missing reference simply omitted from views.
- `touchedAt` updates on any change to an item including adding an update.
- Chain closure and all lens queries are derived at read time from stored data, and are never cached as source-of-truth fields.
- Schema versioning: use Dexie migrations from day one, and include a `schemaVersion` in exports.

---

## 8. Language and tone (microcopy rules)
The owner responds to accountability phrased as their own commitment, and not to blame.

- Use: "You told Sam on Tuesday…", "Still open since 22 Sep", "Waiting on Priya since Monday".
- Never use: "overdue", "late", "behind", "failed", "you missed", "incomplete", exclamation-mark urgency, red alarm styling for missing optional fields.
- Missing optional metadata is described as an **opening**, not a failure ("No owner yet"), and never as an error.
- No streaks, scores, badges or percentages anywhere.

---

## 9. Accessibility and UX quality bar
- Full keyboard operation of Capture; visible focus states; WCAG AA contrast in both themes.
- Screen-reader labels on all controls and drafts.
- Respect `prefers-reduced-motion`.
- Capture must remain usable at phone width.
- Empty states should explain what the screen is for in one sentence and offer the next action.

---

## 10. Milestones and acceptance criteria

**M0, Scaffold.** Vite/React/TS project, PWA installable, strict CSP, offline load, a test that fails on any network call, lint and test pipelines.

**M1, Data and capture.** Domain types, Dexie schema and migrations, People/Projects/Meetings CRUD, the full Capture flow (6.1) including shortcuts, autosave of pasted drafts and enrichment pass. *Acceptance: pasting 20 lines, tagging and committing takes under two minutes with the keyboard alone; closing the tab mid-capture loses nothing.*

**M2, Lenses.** Person, Project, Meeting-prep, Free-time, Overview and Gaps (6.2). *Acceptance: one item linked to a project and two people appears correctly in all three relevant lenses with no duplication of the underlying record; unit tests cover every lens query, including the bi-directional case where the same item appears in a person's view and the project's view.*

**M3, Chains and Today.** Parent/child chains, computed closure, chain trees, resolve-and-spawn prompt, Today screen, commitment nudges, "done but not told" workflow (6.3, 6.5). *Acceptance: a three-question chain closes only when all three are resolved or dropped; nudge copy matches section 8 exactly.*

**M4, Backup and hardening.** Export/import with optional passphrase, persistent-storage request, erase-all, demo data, accessibility pass, Playwright end-to-end suite for the capture-to-lens path (6.6).

**M5 (optional), Fog map.** As specified in 6.4. Cut freely.

---

## 11. Testing requirements
- Unit tests for every function in `domain/` (chain closure, each lens query, gap detection, line-parsing and shortcut rules, fuzzy person matching).
- Property-style tests where cheap: closing every item in a chain always yields a closed chain; an item is never returned twice by one lens.
- End-to-end test of: create meeting, paste notes, commit, open person lens, resolve a question with a spawned child, see it in the Project lens.
- The network-isolation test from M0 runs in CI and must never be removed.

---

## 12. How to work

1. Read this entire document first, then summarise your understanding and your planned folder structure back before building.
2. Work milestone by milestone, committing small and often with clear messages. Do not start a milestone until the previous one's acceptance criteria pass.
3. Keep a `DECISIONS.md` recording every non-obvious choice and every deviation from this spec, with the reason.
4. Do not add dependencies without a stated reason. Prefer the platform's own capabilities.
5. **Do not silently resolve the open questions below.** Implement the stated default, note it in `DECISIONS.md`, and make the choice easy to change.
6. If anything in this spec seems to conflict with itself, stop and ask rather than guessing.

### Open questions (defaults chosen; the owner may change them)
1. **Reachability rule.** Default: only `text`, `type` and origin are required to save; items without a person or project are saved but flagged "Needs a home". The alternative is to require at least one person or project at commit.
2. **Upcoming meetings** are entered manually (title, date, attendees). Default: no calendar import. A later `.ics` file import is a reasonable extension.
3. **Handwritten-note import.** Default: the owner pastes typed text. Revisit if the e-ink tablet's export format turns out to be convenient to parse.
4. **Information-governance check.** The data concerns named NHS colleagues and stakeholders. Default: local-only storage with no network access. Before real use, the owner should confirm that this is acceptable on the device they intend to use, and what their organisation expects of work notes kept locally.
5. **Fog map layout.** Default: a deterministic hex or tree layout. Choose whichever is simpler to make legible.
