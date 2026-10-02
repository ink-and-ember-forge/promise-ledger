# Promise Ledger

Local-first, no-AI, no-server web app for turning meeting notes into a connected record of questions, tasks and commitments. See [SPEC.md](SPEC.md).

```
npm install
npm run dev        # local dev server
npm test           # unit tests (includes network-isolation)
npm run lint
npm run build      # typecheck + production build
```

Layout: `src/domain/` pure logic and types, `src/db/` IndexedDB layer, `src/ui/` React, `tests/` unit tests. Choices are logged in [DECISIONS.md](DECISIONS.md).

## Deploying to GitHub Pages

The app has to be **built** before a browser can run it, so Pages must publish the build output rather than the repository files.

1. In the repository, open **Settings > Pages** and set **Source** to **GitHub Actions**. ("Deploy from a branch" with `main` and `/ (root)` serves the raw source, which shows a blank page.)
2. Push to `main` (or run the **Deploy to GitHub Pages** workflow by hand). It lints, tests, builds with `BASE_PATH=/<repo-name>/`, checks the output, and deploys `dist/`.
3. Open `https://<owner>.github.io/<repo-name>/`.

If the page is blank, open the browser console (F12). Lines starting `[promise-ledger]` say what went wrong: unbuilt source being served, a wrong base path, a blocked script, or a missing IndexedDB. To build for a sub-path locally: `BASE_PATH=/promise-ledger/ npm run build`.
