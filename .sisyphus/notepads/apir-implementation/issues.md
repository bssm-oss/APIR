# APIR Implementation Issues

(No issues yet)

# 2026-04-29 Documentation Verification Notes
- Markdown files have no configured LSP server, so `lsp_diagnostics` cannot validate `.md` files in this environment.
- `npm test` currently exits with code 1 because Jest finds zero files matching `**/test/**/*.test.js`.
# 2026-04-29 Frontend Verification Notes
- `lsp_diagnostics` for JSX/JS files could not run because `typescript-language-server` is not installed in the environment.
- Root `npm test` currently exits with code 1 because Jest finds no files matching `**/test/**/*.test.js`.
- `npm install` in `client/` reported 2 moderate dependency audit findings from the Vite/React dependency tree; no forced audit fix was applied.

# 2026-04-29 CI Workflow Verification Notes
- `lsp_diagnostics` could not validate `.github/workflows/ci.yml` because `yaml-language-server` is not installed; Markdown diagnostics are also unavailable for notepad files.
- `npx --yes actionlint .github/workflows/ci.yml` failed with `could not determine executable to run`, so workflow syntax was checked with Ruby YAML parsing instead.
- Root `npm test` currently exits with code 1 in existing tests: `test/window.test.js` uses global `jest` under ESM where it is undefined, and `test/metadata.test.js` expectations do not match current metadata behavior.
## 2026-04-29 Verification Notes
- Full `npm test` after env wiring still fails in `test/scanner.test.js` on the existing concurrent-mode GraphQL mock expectation: the implementation passes discovered GraphQL paths as a fourth argument, while one expectation only allows three arguments.
- A later `npm run lint` rerun surfaced `server/phases/graphql.js:20` (`no-empty`) outside the env-wiring edit set.

## 2026-04-29 React TypeScript Tailwind Client Notes

- `npm install` in `client/` completed but reported 2 moderate audit findings; no forced audit fix was applied because it can introduce breaking dependency changes.
- Vite dev server used `http://127.0.0.1:5175/` during manual verification because ports 5173 and 5174 were already occupied by other local apps.
