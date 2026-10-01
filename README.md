# Promise Ledger

Local-first, no-AI, no-server web app for turning meeting notes into a connected record of questions, tasks and commitments. See [SPEC.md](SPEC.md).

```
npm install
npm run dev        # local dev server
npm test           # unit tests
npm run build      # typecheck + production build
```

Layout: `src/domain/` pure logic and types, `src/db/` IndexedDB layer, `src/ui/` React, `tests/` unit tests. Choices are logged in [DECISIONS.md](DECISIONS.md).
