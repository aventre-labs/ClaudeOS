---
phase: 01-supervisor-container-foundation
plan: 02
subsystem: api
tags: [tmux, sessions, websocket, fastify, vitest, tdd]

# Dependency graph
requires:
  - phase: 01-supervisor-container-foundation/01
    provides: Fastify server factory, types, schemas, test infrastructure
provides:
  - TmuxService wrapping all tmux CLI operations with ITmuxService interface
  - DryRunTmuxService no-op stub for testing without tmux binary
  - SessionManager with full lifecycle: create, list, stop, kill, archive, revive
  - Session REST routes under /api/v1/sessions (9 endpoints)
  - Internal /internal/session-event route for tmux hook callbacks
  - WebSocket handler with subscribe/unsubscribe, broadcastStatus, sendOutput
affects: [01-03, 01-04, 02-01, 02-02]

# Tech tracking
tech-stack:
  added: ["@types/ws"]
  patterns: [dry-run-stub-service, interface-based-dependency-injection, event-driven-status-detection, atomic-file-writes]

key-files:
  created:
    - supervisor/src/services/tmux.ts
    - supervisor/src/services/session-manager.ts
    - supervisor/src/routes/sessions.ts
    - supervisor/src/ws/handler.ts
    - supervisor/test/services/tmux.test.ts
    - supervisor/test/services/session-manager.test.ts
    - supervisor/test/routes/sessions.test.ts
  modified:
    - supervisor/src/server.ts
    - supervisor/package.json

key-decisions:
  - "ITmuxService interface with DryRunTmuxService stub enables testing and dry-run mode without tmux binary"
  - "Callback-style execFile (not promisify) for clean mockability in tests"
  - "Session IDs use ses_ prefix with crypto.randomUUID().slice(0,8) for uniqueness"
  - "Atomic file writes (write-to-temp, rename) for metadata and archive persistence"
  - "WebSocket clients tracked in module-level Map for broadcastStatus/sendOutput access"

patterns-established:
  - "Service interface + DryRunStub: ITmuxService / DryRunTmuxService pattern for testability"
  - "SessionManager constructor injection: dataDir, tmux service, status callback, port"
  - "Route 404 pattern: check getSession() null, reply.status(404).send(ErrorResponseSchema)"
  - "Internal routes: /internal/ prefix for system-internal endpoints (not /api/v1)"

requirements-completed: [SUP-02, SUP-03, SUP-04, SUP-05, SUP-06]

# Metrics
duration: 11min
completed: 2026-03-12
---

# Phase 1 Plan 02: Session Management Summary

**Full session lifecycle API with tmux service, archive/revive, REST routes, WebSocket real-time events, and event-driven status detection via tmux hooks**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-12T07:29:11Z
- **Completed:** 2026-03-12T07:41:07Z
- **Tasks:** 2 (TDD: RED-GREEN each)
- **Files modified:** 9

## Accomplishments
- TmuxService wrapping all tmux CLI operations (create, send-keys, capture-pane, kill, hooks, pipe-pane, list, has-session)
- SessionManager with full lifecycle: create, list, stop, kill, archive, revive, handleSessionEvent, sendInput, captureOutput
- 9 REST endpoints for session CRUD, I/O, archive/revive under /api/v1/sessions
- WebSocket handler with subscribe/unsubscribe, broadcastStatus to all clients, sendOutput to subscribed clients
- Internal /internal/session-event route for tmux hook callbacks (event-driven status detection)
- DryRunTmuxService no-op stub for testing without tmux binary
- 117 tests passing across 8 test files, TypeScript compiles cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement tmux service and session manager with archive/revive**
   - RED: `91e643e` (test) - failing tests for TmuxService and SessionManager
   - GREEN: `1df398f` (feat) - full implementation, 55 service tests passing

2. **Task 2: Implement session REST routes and WebSocket handler**
   - RED: `d4dacc9` (test) - failing tests for session routes
   - GREEN: `a5c8b7b` (feat) - routes, WS handler, server wiring, 117 total tests passing

## Files Created/Modified
- `supervisor/src/services/tmux.ts` - TmuxService, DryRunTmuxService, ITmuxService interface
- `supervisor/src/services/session-manager.ts` - SessionManager with full lifecycle and atomic writes
- `supervisor/src/routes/sessions.ts` - Session CRUD + I/O + archive/revive routes, internal session-event route
- `supervisor/src/ws/handler.ts` - WebSocket handler with subscribe/unsubscribe and broadcast functions
- `supervisor/src/server.ts` - Wired SessionManager, TmuxService, WebSocket, session routes
- `supervisor/test/services/tmux.test.ts` - 16 unit tests for TmuxService
- `supervisor/test/services/session-manager.test.ts` - 39 unit tests for SessionManager
- `supervisor/test/routes/sessions.test.ts` - 20 integration tests for session routes
- `supervisor/package.json` - Added @types/ws dev dependency

## Decisions Made
- Created ITmuxService interface with DryRunTmuxService no-op stub so tests and dry-run mode work without tmux binary installed
- Used callback-style execFile wrapper (not util.promisify) for TmuxService to enable clean vi.mock testing
- Session IDs generated with `ses_` prefix + crypto.randomUUID().slice(0,8)
- Atomic file writes using write-to-temp-then-rename pattern for data integrity
- WebSocket client tracking uses module-level Map for broadcastStatus/sendOutput accessibility from SessionManager callback

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed @types/ws for WebSocket type declarations**
- **Found during:** Task 2 (WebSocket handler implementation)
- **Issue:** TypeScript could not find type declarations for the 'ws' module
- **Fix:** `npm install --save-dev @types/ws`
- **Files modified:** package.json, package-lock.json
- **Verification:** `tsc --noEmit` passes cleanly
- **Committed in:** a5c8b7b (Task 2 commit)

**2. [Rule 3 - Blocking] Added DryRunTmuxService for test environment**
- **Found during:** Task 2 (route tests trying to spawn tmux)
- **Issue:** Test server instantiated real TmuxService which tried to spawn tmux (ENOENT on macOS without nix shell)
- **Fix:** Created ITmuxService interface and DryRunTmuxService no-op stub, server.ts uses stub when isDryRun=true
- **Files modified:** supervisor/src/services/tmux.ts, supervisor/src/server.ts, supervisor/src/services/session-manager.ts
- **Verification:** All 117 tests pass, tsc clean
- **Committed in:** a5c8b7b (Task 2 commit)

**3. [Rule 1 - Bug] Added ErrorResponseSchema to 404 route responses**
- **Found during:** Task 2 (tsc check after route implementation)
- **Issue:** Fastify schema only declared 200 response, sending 404 caused TypeScript type error
- **Fix:** Added 404: ErrorResponseSchema to routes that return 404
- **Files modified:** supervisor/src/routes/sessions.ts
- **Verification:** `tsc --noEmit` passes
- **Committed in:** a5c8b7b (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All auto-fixes necessary for correctness and testability. No scope creep.

## Issues Encountered
- Mock compatibility with Node.js promisify: initial approach using `promisify(execFile)` at module level lost stdout in mocked tests because promisify wraps custom `[util.promisify.custom]` behavior. Resolved by using direct callback-style wrapper function instead.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Session management API fully operational for Plans 03 (platform services) and 04 (container)
- WebSocket infrastructure ready for Phase 2 extensions to subscribe to session events
- DryRunTmuxService pattern established for testing without container environment
- SessionManager exposes all methods needed by future extension APIs

## Self-Check: PASSED

All 9 created/modified files verified present. All 4 task commits (91e643e, 1df398f, d4dacc9, a5c8b7b) verified in git log.

---
*Phase: 01-supervisor-container-foundation*
*Completed: 2026-03-12*
