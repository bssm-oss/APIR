# APIR Implementation Learnings

Project: APIR (API Hunter) — Automated API endpoint discovery tool
Stack: Node.js (Express), React, Puppeteer, source-map, acorn, cheerio

## Architecture Decisions
- All phases are independent modules that return structured data
- Scanner orchestrator runs phases sequentially with configurable skip
- CLI uses commander for argument parsing
- Output format is standardized JSON (as defined in spec)
- Frontend is a separate React app in /client

## Conventions
- ES modules throughout (type: "module" in package.json)
- Phase files export a single async function
- Error handling per-phase: never crash the scanner, collect errors in report

## 2026-04-29 Scaffold
- Project scaffold keeps root configs ES-module aware: `jest.config.js` exports default config and `package.json` test scripts use `node --experimental-vm-modules`.
- Required foundation directories are intentionally empty placeholders for later implementation: `server/phases`, `lib`, `test`, `client`, `docs/architecture`, `docs/changes`, and `.github/workflows`.

## 2026-04-29 Frontend Dashboard
- `client/` now contains a plain JSX Vite React app with `src/main.jsx`, `src/App.jsx`, and componentized dashboard files under `src/components/`.
- The frontend posts `{ targetUrl }` to `/api/scan`; `client/vite.config.js` proxies `/api` to `http://localhost:3001` for local development.
- Report visualization normalizes `surfaceApis` and `buriedApis`, groups endpoints by source, generates cURL snippets, and exports all findings as Markdown from `src/lib/reportUtils.js`.

## 2026-04-29 Documentation Pass
- Public README should remain Korean and explicitly distinguish implemented commands from placeholders; `npm run client` is defined but requires a future `client/package.json`.
- Architecture docs should describe the actual scanner order: `sourcemap`, `window`, `chunks`, `metadata`, `dynamic`, `graphql`, `serviceworker`, `phantom`.
- Only `PORT` is currently consumed from `.env.example`; other environment variables are documented as examples or limitations until wired into implementation.
- Scanner entrypoints use `server/scanner.js` as the shared orchestration layer for CLI and Express. It runs known phases in fixed order, treats `graphql` as dependent on the `sourcemap` result, and appends phase timing/skipped-phase metadata to the generated report.

## 2026-04-29 Unit Test Coverage
- Phase and utility unit tests live under `test/*.test.js` and run through the existing ESM Jest command (`npm test`).
- HTTP-dependent tests use `nock` for default axios paths or injected lightweight clients for phase unit seams; Puppeteer phases are mocked at the scanner boundary rather than launched.
- `Scanner` can be tested with `jest.unstable_mockModule` before dynamically importing `server/scanner.js`, which avoids invoking browser phases and keeps phase order/skip/failure behavior deterministic.

## 2026-04-29 CI Workflow
- GitHub CI lives at `.github/workflows/ci.yml` with separate `lint-test` and `client-build` jobs. Root lint/test runs on Node 18, 20, and 22; client build runs on Node 20. Both jobs use `npm ci`, `actions/setup-node@v4` npm caching, explicit `node_modules` cache paths, and `PUPPETEER_SKIP_DOWNLOAD: true`.

## 2026-04-29 Scanner Concurrency
- `server/scanner.js` preserves original ordered execution when `concurrency` is `1`; when `concurrency` is greater than `1`, it runs all phases except `graphql` in one parallel batch, then runs `graphql` after the `sourcemap` result has been recorded.
- Scanner phase tests now include a concurrency regression that keeps `sourcemap` pending and verifies independent phases start while `graphql` waits for normalized `sourcemap` output.

## 2026-04-29 GraphQL Custom Paths
- `Scanner` can pass `metadata.metadata.discoveredGraphQLPaths` into `analyzeGraphQL` as a fourth argument while preserving the existing sourcemap dependency.
- `analyzeGraphQL` keeps `/graphql` as the default endpoint, resolves metadata-discovered relative or absolute paths against the target URL, deduplicates endpoint URLs, and probes each candidate with the existing POST-then-GET introspection flow.

## 2026-04-29 Puppeteer Phase Tests
- Puppeteer-backed phase unit tests should call `jest.resetModules()`, register `jest.unstable_mockModule('puppeteer', () => ({ default: puppeteer }))`, then dynamically import the phase module so no real browser is launched.
- Invalid URL assertions are the safest browser-free contract checks for `dynamicTriggerExposure`, `analyzeServiceWorker`, and `phantomFlow`; valid URL tests can use lightweight page/browser mocks to verify launch, navigation, and close behavior.

## 2026-04-29 Client Package Verification
- `client/package.json` exists with Vite React scripts (`dev`, `build`, `preview`) and expected React/Vite dependencies; root `npm run client` already delegates to `cd client && npm run dev`.
- `npm run build` from `client/` completed successfully and emitted `client/dist` assets.

## 2026-04-29 Environment Wiring
- Runtime env vars from `.env.example` are now consumed directly by implementation: `SCAN_TIMEOUT_MS` in the scanner HTTP client, `CLIENT_ORIGIN` in Express CORS, `LOG_LEVEL=debug` for basic scanner/CLI logging, and `PUPPETEER_HEADLESS=false` to run browser phases visibly.
- Puppeteer phases keep the default `headless: 'new'` behavior unless `PUPPETEER_HEADLESS` is exactly `false`.
