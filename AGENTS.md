# APIR Agent Guide

## Project Purpose

APIR (API Hunter) is a non-invasive API discovery and documentation tool. Given a target website URL, it runs static and browser-driven analysis phases to find documented surface APIs, buried API endpoints, GraphQL evidence, JWTs, CORS issues, and server fingerprint hints, then emits a standardized JSON report.

Use this project only for educational work and authorized security audits.

## Quick Start Commands

- Install dependencies: `npm install`
- Run a CLI scan: `npm run scan -- scan https://example.com`
- Write a report file: `npm run scan -- scan https://example.com --output report.json`
- Skip phases: `npm run scan -- scan https://example.com --skip dynamic,phantom`
- Start Express server: `npm start`
- Start server through CLI: `npm run scan -- scan https://example.com --server`
- Run client script: `npm run client`
- Run tests: `npm test`
- Run lint: `npm run lint`
- Format server code: `npm run format`

Note: `npm run client` is defined in the root package, but the current repository state does not include `client/package.json`. Do not claim the frontend is runnable until that package exists.

## Phase Implementations

- `server/phases/sourcemap.js`: recovers source maps from script `sourceMappingURL` comments, reads original sources, and extracts `/api`, `/graphql`, `fetch`, `axios`, and TODO/FIXME/HACK evidence.
- `server/phases/window.js`: fetches HTML, evaluates inline scripts in a constrained Node `vm` sandbox, inspects framework state keys such as `__NEXT_DATA__`, `__NUXT__`, `__APOLLO_STATE__`, and `__REDUX_STATE__`, then extracts API-like strings.
- `server/phases/chunks.js`: parses entry scripts with Acorn, finds dynamic imports, `require.ensure`, and `React.lazy`, fetches discovered chunks, and extracts API-like URL literals.
- `server/phases/metadata.js`: checks `robots.txt`, `sitemap.xml`, JSON-LD, Open Graph metadata, `/swagger.json`, `/openapi.json`, `/api-docs`, and `/redoc`.
- `server/phases/dynamic.js`: uses Puppeteer to navigate, scroll, click interactive elements, fill forms, inject a SQL-like search payload, and capture API-like network requests.
- `server/phases/graphql.js`: probes `${origin}/graphql` with POST and GET introspection and extracts `__typename` snippets from sourcemap output.
- `server/phases/serviceworker.js`: uses Puppeteer to inspect service worker registration and Cache Storage request URLs.
- `server/phases/phantom.js`: runs Phantom Flow, combining hypermedia mapping, state transition tracking, and redirect chain reconstruction.

## Utility Implementations

- `lib/jwt-analyzer.js`: recursively searches scan data for JWT-looking tokens, decodes header and payload, and returns token metadata.
- `lib/cors-checker.js`: sends `OPTIONS` and `GET` requests with `Origin: https://evil.com` and reports permissive `access-control-allow-origin` responses.
- `lib/fingerprint.js`: parses `server`, `x-powered-by`, and `x-cf-via` headers into a server/framework/via estimate.
- `lib/reporter.js`: converts raw scan results into `surfaceApis`, `buriedApis`, `schemaInference`, `jwtAnalysis`, `corsReport`, `serverFingerprint`, and `riskScore`.

## Orchestration Files

- `server/scanner.js`: validates the target URL, runs phases in fixed order, records phase timings, applies skip options, runs utility analysis, and calls the reporter.
- `server/cli.js`: exposes the `apir scan` command, `--skip`, `--output`, `--server`, and `--port`.
- `server/index.js`: builds the Express app, exposes `GET /api/health` and `POST /api/scan`, and serves `client/dist` when it exists.

## Code Style Principles

- Keep the project ES module only. `package.json` sets `type: "module"`.
- Prefer named exports for reusable modules and keep existing default exports when present.
- Preserve the phase result contract: every phase should return an object with `apis`, `errors`, and `metadata`.
- Treat per-phase failures as reportable errors instead of crashing the whole scanner.
- Keep records serializable as JSON.
- Do not add broad refactors while changing a single phase.
- Use clear names; avoid one-letter variables in new code.
- Avoid inline comments unless the logic is non-obvious.

## File Structure Conventions

- Add scanner phases under `server/phases/`.
- Add shared analysis/reporting helpers under `lib/`.
- Keep HTTP server concerns in `server/index.js` and CLI concerns in `server/cli.js`.
- Keep pipeline orchestration in `server/scanner.js`; do not duplicate phase ordering elsewhere.
- Place architecture documentation under `docs/architecture/`.
- Place tests under `test/` when test infrastructure exists for the changed behavior.

## Documentation Principles

- Document implemented behavior only.
- Distinguish runnable commands from planned or placeholder commands.
- Keep the legal warning visible in user-facing documentation.
- Include limitations when environment variables or scripts exist but are not wired into implementation.
- Use English for agent and architecture documentation unless a task explicitly requires Korean.
- Use Korean for the public README in this repository.

## Test Principles

- Run the most focused test available for the changed module first.
- Run `npm test` before declaring code changes complete when tests exist.
- Run `npm run lint` for JavaScript changes when feasible.
- For documentation-only changes, verify file presence and Markdown readability; LSP diagnostics may not apply.
- Never delete or weaken a failing test to make verification pass.

## Absolute Rules

- Do not modify phase interfaces unless explicitly requested; `Scanner` expects phase outputs to contain `apis`, `errors`, and `metadata`.
- Do not add dependencies without explicit approval.
- Do not remove the legal/authorized-use disclaimer from README-level docs.
- Do not invent frontend behavior while `client/package.json` is absent.
- Do not make browser automation more aggressive than the current non-invasive interactions without approval.
- Do not store scan outputs containing secrets in the repository.
- Do not edit `.sisyphus/plans/*.md`; plan files are read-only and managed by the orchestrator.
- Do not commit, amend, or push unless explicitly asked.
