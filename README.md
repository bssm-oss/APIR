# APIR (API Hunter)

APIR(API Hunter)는 웹사이트 URL만 입력하면 프론트엔드 번들, Source Map, metadata, browser runtime, GraphQL, Service Worker, Phantom Flow를 분석해 노출되었거나 숨겨진 API endpoint를 찾아 JSON report로 정리하는 비침투적 API discovery 도구입니다.

## 법적 고지

⚠️ 법적 고지
이 도구는 교육 및 소유자가 승인한 보안 감사 목적으로만 사용하십시오.
타인의 동의 없이 웹사이트를 스캔하는 것은 컴퓨터 사기 및 남용 법률에 저촉될 수 있습니다.
사용자는 본 도구 사용으로 인한 모든 법적 책임을 집니다.

## 주요 기능

- Phase 1 Source Map 분석: script의 `sourceMappingURL`을 따라 원본 source에서 `/api`, `/graphql`, `fetch`, `axios` 호출을 복구합니다.
- Phase 2 Window Object 수집: inline script와 framework state(`__NEXT_DATA__`, `__NUXT__`, Redux/Apollo state 등)를 sandbox에서 분석합니다.
- Phase 3 Chunk 분석: dynamic import, `require.ensure`, `React.lazy`로 발견한 lazy-loaded chunk에서 API-like URL을 추출합니다.
- Phase 4 Metadata 분석: `robots.txt`, `sitemap.xml`, JSON-LD, Open Graph, Swagger/OpenAPI/Redoc endpoint를 확인합니다.
- Phase 5 Dynamic Trigger 분석: Puppeteer로 scroll, click, form fill, search payload 입력을 수행하며 XHR/fetch/API-like network request를 캡처합니다.
- Phase 6 GraphQL 분석: `/graphql` introspection과 Source Map 내 `__typename` fragment를 통해 GraphQL 사용 여부와 schema evidence를 수집합니다.
- Phase 7 Service Worker 분석: Service Worker 등록 여부와 Cache Storage 안의 API-like request URL을 확인합니다.
- Phantom Flow: hypermedia interaction mapping, state transition tracking, redirect chain reconstruction을 병렬로 수행합니다.
- 추가 기능: JWT token 탐지/decode, CORS misconfiguration check, server fingerprint, documented API와 buried API 분리, risk score 계산, Express API server mode, CLI JSON output.

## 기술 스택

- Runtime: Node.js 18+, ES Modules
- Backend: Express, CORS middleware
- CLI: Commander
- HTTP client: Axios
- Browser automation: Puppeteer, Chrome/Chromium
- Static parsing: Cheerio, Acorn, source-map, xml2js
- Security utilities: jwt-decode 기반 JWT analyzer, CORS checker, server fingerprint
- Test/Lint toolchain: Jest, ESLint, Prettier
- Frontend: React/Vite 구조를 위한 `client` workspace script가 정의되어 있습니다.

## 필수 요구사항

- Node.js 18 이상
- npm
- Chrome 또는 Chromium: Puppeteer가 browser-based phase(dynamic, serviceworker, phantom)를 실행할 때 필요합니다.
- 스캔 대상 소유자 또는 운영자의 명시적 승인

## 설치 방법

1. Repository를 clone합니다.

   `git clone <repository-url>`

2. Project directory로 이동합니다.

   `cd APIR`

3. Dependency를 설치합니다.

   `npm install`

4. 필요한 경우 환경변수를 설정합니다.

   `.env.example`을 참고해 `.env`를 만들 수 있습니다. 현재 server code는 `PORT`를 직접 사용합니다.

## 사용법

### CLI scan

`npm run scan -- scan https://example.com`

### CLI scan with output file

`npm run scan -- scan https://example.com --output report.json`

### 특정 phase 제외

`npm run scan -- scan https://example.com --skip dynamic,phantom`

사용 가능한 phase 이름은 `sourcemap`, `window`, `chunks`, `metadata`, `dynamic`, `graphql`, `serviceworker`, `phantom`입니다.

### Server mode

`npm run scan -- scan https://example.com --server`

또는 다음 명령으로 Express server를 시작할 수 있습니다.

`npm start`

Server는 기본적으로 `PORT` 환경변수 또는 `3001` port를 사용합니다. Health check endpoint는 `GET /api/health`, scan endpoint는 `POST /api/scan`입니다.

### Web UI

`npm run client`

이 command는 root `package.json`에 정의되어 있으며 `client` directory에서 React frontend dev server를 실행하도록 설계되어 있습니다. 현재 repository 상태에서 `client/package.json`이 없으면 먼저 frontend package가 준비되어야 합니다.

## 출력 형식

CLI와 `POST /api/scan`은 JSON report를 반환합니다. 최상위 구조는 다음 필드를 포함합니다.

- `target`: scan 대상 URL
- `scanTime`: report 생성 ISO timestamp
- `surfaceApis`: Swagger/OpenAPI/Redoc 등 documented source에서 확인된 endpoint 목록
- `buriedApis`: Source Map, chunk, browser interaction, Service Worker, Phantom Flow 등에서 발견된 undocumented endpoint 목록
- `schemaInference`: GraphQL introspection 또는 `__typename` fragment 기반 schema inference
- `jwtAnalysis`: 발견된 JWT token의 decoded header, payload, signature, expiry, source
- `corsReport`: `Origin: https://evil.com` 테스트에서 취약하게 보이는 CORS endpoint 목록
- `serverFingerprint`: `server`, `x-powered-by`, `x-cf-via` header 기반 stack 추정
- `riskScore`: 전체 endpoint 중 documented endpoint 비율을 기반으로 계산한 0-100 점수
- `metadata`: phase timing, skipped phase, concurrency, utility error 정보

각 phase 내부 result는 scanner metadata에 보존되며 기본 shape는 `apis`, `errors`, `metadata`입니다.

## 폴더 구조

- `server/index.js`: Express app factory, server bootstrap, `/api/health`, `/api/scan`
- `server/cli.js`: Commander 기반 CLI entry point
- `server/scanner.js`: phase orchestration, option normalization, utility analysis, report generation
- `server/phases/`: Source Map, window, chunk, metadata, dynamic, GraphQL, Service Worker, Phantom Flow phase 구현
- `lib/`: JWT analyzer, CORS checker, fingerprint, reporter utility
- `client/`: React frontend workspace 위치
- `docs/architecture/`: architecture documentation
- `test/`: Jest test 위치
- `.sisyphus/`: implementation plan과 작업 notepad

## 실행 명령어 정리

- `npm install`: dependency 설치
- `npm start`: Express server 실행
- `npm run scan -- scan https://example.com`: CLI scan 실행
- `npm run scan -- scan https://example.com --output report.json`: JSON report file 저장
- `npm run scan -- scan https://example.com --skip dynamic,phantom`: 일부 phase 제외
- `npm run scan -- scan https://example.com --server`: CLI를 통해 server mode 실행
- `npm run client`: React frontend dev server 실행 시도
- `npm test`: Jest test 실행
- `npm run lint`: `server/` ESLint 실행
- `npm run format`: `server/**/*.js` Prettier format 적용

## 환경변수

- `PORT`: Express server port. `server/index.js`는 기본값 `3001`을 사용합니다.
- `CLIENT_ORIGIN`: `.env.example`에 정의되어 있지만 현재 server code에서는 직접 사용하지 않습니다.
- `SCAN_TIMEOUT_MS`: `.env.example`에 정의되어 있지만 현재 scanner timeout은 code 상수 `30000ms`입니다.
- `PUPPETEER_HEADLESS`: `.env.example`에 정의되어 있지만 현재 Puppeteer 실행은 code에서 `headless: 'new'`로 고정되어 있습니다.
- `LOG_LEVEL`: `.env.example`에 정의되어 있지만 현재 logging level 제어에는 연결되어 있지 않습니다.

## 알려진 제한 사항

- 이 도구는 승인된 환경에서만 사용해야 하며 인증이 필요한 화면이나 rate limit이 있는 서비스에서는 결과가 제한될 수 있습니다.
- Dynamic, Service Worker, Phantom Flow phase는 Puppeteer와 Chrome/Chromium 실행 환경에 의존합니다.
- `concurrency` option이 `1`보다 크면 독립 phase는 병렬 batch로 실행되고, GraphQL phase는 Source Map 결과가 기록된 뒤 실행됩니다.
- Source Map phase는 script 마지막 줄의 `sourceMappingURL`이 있고 source content가 포함된 경우에 가장 잘 동작합니다.
- GraphQL phase는 기본 `/graphql` endpoint만 introspection 대상으로 사용합니다.
- CORS check는 발견된 endpoint에 `OPTIONS`와 `GET`을 보내며, 인증이 필요한 API에서는 판단이 제한될 수 있습니다.
- React frontend command는 root script에 정의되어 있지만 현재 `client/package.json`이 없는 상태에서는 실행되지 않습니다.
- `CLIENT_ORIGIN`, `SCAN_TIMEOUT_MS`, `PUPPETEER_HEADLESS`, `LOG_LEVEL`은 예시 환경변수이며 현재 구현과 직접 연결되지 않았습니다.

## 라이선스

MIT
