# APIR — API Hunter Implementation Plan

## Overview
Build a complete API Hunter tool: Node.js backend (Express) that analyzes target websites to discover API endpoints via 7 analysis phases + Phantom Flow, plus a React frontend dashboard and documentation.

## TODOs

- [x] T1: Scaffold project (package.json, dirs, eslint, prettier, jest config)
- [x] T2: Implement Phase 1 — Source Map Extraction
- [x] T3: Implement Phase 2 — Window Object Harvesting
- [x] T4: Implement Phase 3 — Chunk Graph Analysis
- [x] T5: Implement Phase 4 — Structured Metadata
- [x] T6: Implement Phase 5 — Dynamic Trigger-based Exposure
- [x] T7: Implement Phase 6 — GraphQL Schema Restoration
- [x] T8: Implement Phase 7 — Service Worker & Cache Analysis
- [x] T9: Implement Phantom Flow (Hypermedia + State Transition + Redirect Chain)
- [x] T10: Implement utility libs (JWT analyzer, CORS checker, Server fingerprint, Reporter)
- [x] T11: Implement Express scanner orchestrator + CLI
- [x] T12: Create React frontend dashboard
- [x] T13: Write unit tests for core phases
- [x] T14: Write README (Korean), AGENTS.md, docs
- [x] T15: Set up GitHub CI workflow
- [x] T16: Final review and verification

## Final Verification Wave

- [x] F1: All tests pass (8 suites, 25 tests all passing)
- [x] F2: Express server starts without errors (health endpoint 200, scan validation 400)
- [x] F3: CLI runs without errors (help output correct, scan command works)
- [x] F4: React frontend builds without errors (Vite production build, 37 modules)
