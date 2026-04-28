# APIR Analysis Pipeline

## Overview

APIR runs a fixed sequence of discovery phases, then applies utility analysis and report normalization. Each phase returns `apis`, `errors`, and `metadata`. The scanner records phase timings and keeps going when an individual phase fails.

```text
Target URL
    |
    v
+-------------------+
| Scanner           |
+-------------------+
    |
    v
+-----------+   +--------+   +--------+   +----------+
| sourcemap |-> | window |-> | chunks |-> | metadata |
+-----------+   +--------+   +--------+   +----------+
    |              |           |             |
    v              v           v             v
+---------+   +---------+   +---------------+   +---------+
| dynamic |-> | graphql |-> | serviceworker |-> | phantom |
+---------+   +---------+   +---------------+   +---------+
    |
    v
+-------------------------------+
| JWT / CORS / Fingerprint      |
+-------------------------------+
    |
    v
+-------------------------------+
| Reporter JSON                 |
+-------------------------------+
```

The implemented phase order is `sourcemap`, `window`, `chunks`, `metadata`, `dynamic`, `graphql`, `serviceworker`, and `phantom`.

## Phase 1: Source Map Recovery

File: `server/phases/sourcemap.js`

The Source Map phase fetches the target HTML, extracts script URLs, downloads each script, and checks the final line for a `sourceMappingURL` reference. It supports external source maps and inline `data:` source maps. Source contents are read with `SourceMapConsumer`.

It extracts API evidence with these patterns:

- API literal: quoted `/api...` paths containing letters, numbers, slash, underscore, or dash.
- GraphQL literal: quoted `/graphql...` paths containing letters, numbers, slash, underscore, or dash.
- Fetch call: `fetch("...")`, `fetch('...')`, or template-quoted equivalent with a literal first argument.
- Axios call: `axios.get`, `axios.post`, `axios.put`, `axios.delete`, or `axios.patch` with a literal URL argument.
- Notes: `TODO`, `FIXME`, or `HACK` comment text is preserved as recovered source comment evidence.
- Source map trailer: final-line `sourceMappingURL` comments using `//#`, `//@`, and optional whitespace.

Output records use `source: sourcemap`, usually `confidence: high`, method when known, path, source location, headers, sample request placeholder, and note.

## Phase 2: Window Object Harvesting

File: `server/phases/window.js`

The Window phase fetches HTML and extracts inline script blocks. JSON scripts are parsed directly when their IDs match known framework state keys. Non-JSON inline scripts run inside a constrained Node `vm` context with stubbed `window`, `document`, `location`, `localStorage`, `sessionStorage`, timers, and console methods.

It inspects framework state keys including:

- `__NUXT__`
- `__NEXT_DATA__`
- `__INITIAL_STATE__`
- `__initialState__`
- `__INITIALSTATE__`
- `__initialstate__`
- `initialState`
- `INITIAL_STATE`
- `__APOLLO_STATE__`
- `__REDUX_STATE__`

It treats strings or object keys as API evidence when they match these concepts:

- `/api/` paths
- `https://api.` hosts
- `graphql`
- `endpoint`

Output records use `source: window`, `confidence: medium`, an `endpoint`, the state key where it was found, and a path inside the state object.

## Phase 3: Chunk Analysis

File: `server/phases/chunks.js`

The Chunk phase fetches target HTML, extracts script sources, parses each script with Acorn, and walks the AST to discover lazy-loaded chunks.

Chunk discovery supports:

- Dynamic import expressions with literal module specifiers.
- Legacy import call shapes.
- `require.ensure` with literal values or arrays of literal values.
- `React.lazy` wrappers that return dynamic imports.

After fetching each discovered chunk, it extracts API-like URLs with these patterns:

- Absolute URLs containing `/api`, `/graphql`, `/rest`, or `/v<number>` path segments.
- Quoted relative paths beginning with `/`, `./`, or `../` and then `api`, `graphql`, `rest`, or versioned paths.
- Quoted relative paths containing keywords such as `api`, `graphql`, `endpoint`, or `rpc`.

The phase marks chunks as more sensitive when their URL includes `admin`, `dashboard`, `settings`, `billing`, or `internal`. Sensitive chunks produce `confidence: high`; other chunk findings use `confidence: medium`.

## Phase 4: Metadata Discovery

File: `server/phases/metadata.js`

The Metadata phase checks public metadata surfaces at the target origin.

It performs these probes:

- `/robots.txt`: extracts `Disallow` paths and keeps paths matching `/api` or `/v<number>`.
- `/sitemap.xml`: parses XML and collects `loc` values matching `/api` or `/v<number>`.
- Target HTML: parses JSON-LD scripts and recursively collects `@id` fields matching API path patterns.
- Target HTML: parses Open Graph meta tags whose content includes `api` or `endpoint`.
- Documentation endpoints: probes `/swagger.json`, `/openapi.json`, `/api-docs`, and `/redoc`.

Documentation probes that respond successfully are recorded as high-confidence structured API documentation. The reporter later uses these schemas to populate `surfaceApis` when OpenAPI `paths` are available.

## Phase 5: Dynamic Trigger Exposure

File: `server/phases/dynamic.js`

The Dynamic phase launches Puppeteer, opens the target page, enables request interception, and captures API-like network requests while trying safe UI interactions.

API request detection includes:

- Any Puppeteer request whose resource type is `xhr` or `fetch`.
- URLs containing `/api`, `/graphql`, `/rest`, `/rpc`, `/v<number>`, or generic API keywords such as `api`, `graphql`, `endpoint`, `rpc`, `ajax`, or `json`.
- Responses whose content type suggests JSON, XML, or GraphQL.
- Static assets such as CSS, images, fonts, media, PDFs, ZIPs, and source maps are excluded.

Interaction sequence:

- Navigate to the target and wait for network idle.
- Scroll to the bottom of the page.
- Click visible buttons, tabs, menu items, dropdown/modal triggers, and similar interactive elements.
- Fill login, registration, and other forms with synthetic test values.
- Enter a SQL-like payload into search fields and capture limited error response body text for that action.

Output records use `source: dynamic`, method, URL, action evidence, post data, resource type, status, content type, and optional captured response snippet.

## Phase 6: GraphQL Analysis

File: `server/phases/graphql.js`

The GraphQL phase resolves the endpoint as `/graphql` on the target origin. It attempts introspection with POST first and GET second. If a schema is returned under `data.__schema` or root `__schema`, the endpoint is recorded with high confidence.

It also recursively scans source map output for JavaScript-like source content containing `__typename`. Around each `__typename` occurrence, it captures a snippet of surrounding text and records medium-confidence GraphQL evidence.

Metadata includes whether GraphQL evidence exists, whether introspection was possible, the serialized full schema when available, and typename fragments.

## Phase 7: Service Worker Analysis

File: `server/phases/serviceworker.js`

The Service Worker phase uses Puppeteer to load the target page, check for a service worker registration, enumerate Cache Storage names, open each cache, and inspect cached request URLs.

Cached request URLs are considered API-like when their path or raw string includes:

- `/api`
- `/graphql`
- `/rest`
- `/v<number>`
- API-related keywords such as `api`, `graphql`, `endpoint`, or `rpc`

Findings use `source: serviceworker`, `confidence: high`, and cache name evidence.

## Phantom Flow

File: `server/phases/phantom.js`

Phantom Flow runs three browser-driven subphases in parallel and merges their outputs.

### Hypermedia Mapping

Hypermedia mapping loads the page, enumerates `a`, `form`, and `button` elements, records descriptors for each element, then reloads the page before replaying each interaction. It captures every request triggered by the interaction and stores the element descriptor and request snapshot as evidence.

Output source is `phantom-hypermedia` with medium confidence.

### State Transition Tracking

State transition tracking injects instrumentation before app scripts run. It hooks common global store names and wraps dispatch methods when possible. It also tries to subscribe to stores that expose `subscribe`.

Observed action names are converted into inferred endpoints by preserving values that already look like paths or URLs and otherwise stripping common action suffixes such as request, success, failure, pending, fulfilled, and rejected.

Output source is `phantom-state` with low confidence because action names are indirect evidence.

### Redirect Chain Reconstruction

Redirect reconstruction listens for HTTP 301 and 302 responses while navigating. It records the request, response status, response URL, response headers, and resolved `Location` target.

Output source is `phantom-redirect` with high confidence.

## Utility Functions

### JWT Analyzer

File: `lib/jwt-analyzer.js`

The JWT analyzer recursively walks scan data, finds JWT-looking strings that begin with encoded JSON header and payload segments, decodes header and payload with `jwt-decode`, extracts signature, and derives `expiresAt` from numeric `exp` claims when present.

### CORS Checker

File: `lib/cors-checker.js`

The CORS checker normalizes discovered endpoints, then sends `OPTIONS` and `GET` requests with `Origin: https://evil.com`. It reports endpoints whose `access-control-allow-origin` response is `*` or exactly the test origin.

### Fingerprint

File: `lib/fingerprint.js`

The fingerprint utility reads response headers case-insensitively and derives server, framework, via, and estimated stack values from `server`, `x-powered-by`, and `x-cf-via`.

### Reporter

File: `lib/reporter.js`

The reporter turns scanner output into the final JSON report. It extracts documented APIs from OpenAPI-style `paths`, classifies non-documented phase findings as buried APIs, deduplicates by path and method, normalizes JWT and CORS arrays, carries GraphQL schema inference, and computes risk score from the documented versus total endpoint ratio.

## Data Flow

```text
CLI / Express API
    |
    v
Scanner.scan(targetUrl, options)
    |
    +--> validate URL
    +--> normalize skipPhases and concurrency metadata
    +--> run phase sequence
    |       |
    |       +--> each phase returns apis/errors/metadata
    |       +--> failures become phase errors
    |
    +--> collect endpoints from non-skipped phases
    +--> fetch target headers
    +--> analyze JWTs across phase data
    +--> check CORS for discovered endpoints
    +--> fingerprint response headers
    |
    v
generateReport(targetUrl, scanResults)
    |
    +--> surfaceApis from structured docs
    +--> buriedApis from non-documentation findings
    +--> schemaInference from GraphQL phase
    +--> jwtAnalysis / corsReport / serverFingerprint
    +--> riskScore
    |
    v
JSON response or output file
```

## Output Format Specification

Final reports contain these top-level fields:

- `target`: target URL string.
- `scanTime`: ISO timestamp generated when the report is created.
- `surfaceApis`: documented endpoint records extracted from structured API documentation.
- `buriedApis`: discovered endpoint records from non-documentation sources, normalized with uppercase method and path when possible.
- `schemaInference`: GraphQL evidence including introspection status, full schema when available, and typename fragments.
- `jwtAnalysis`: decoded JWT token entries with header, payload, signature, expiry, and source.
- `corsReport`: CORS findings that accepted wildcard or reflected test origin.
- `serverFingerprint`: parsed server, framework, via, and estimated stack information.
- `riskScore`: 0 when no endpoints are found; otherwise the rounded percentage of endpoints not represented in documented surface APIs.
- `metadata`: scanner metadata added after report generation, including phase timings, skipped phases, concurrency metadata, and utility errors.

Phase results use these common fields before report normalization:

- `apis`: phase-specific API evidence records.
- `errors`: non-fatal error messages captured during that phase.
- `metadata`: phase-specific metrics and context. The scanner augments this with `phase` and `durationMs`.

The scanner can mark skipped phases with empty `apis`, empty `errors`, and metadata containing `skipped: true`.
