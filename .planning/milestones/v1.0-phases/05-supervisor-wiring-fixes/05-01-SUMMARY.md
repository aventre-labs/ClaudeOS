---
phase: 05-supervisor-wiring-fixes
plan: 01
subsystem: supervisor
tags: [boot, websocket, secrets, wiring, fastify]

# Dependency graph
requires:
  - phase: 01-supervisor-container
    provides: BootService, SecretStore, server.ts, WsClient
provides:
  - BootService invocation from index.ts with two-phase boot
  - Corrected WsClient default WebSocket URL
  - Unconditional secrets route registration with lazy SecretStore
affects: [supervisor, claudeos-sessions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy service initialization with tryCreate() factory for optional dependencies"
    - "Exported boot() function for testability, main() as thin CLI entry"
    - "VITEST env guard to prevent side-effect execution during testing"

key-files:
  created:
    - supervisor/test/boot-wiring.test.ts
    - supervisor/test/routes/secrets-unconditional.test.ts
  modified:
    - supervisor/src/index.ts
    - supervisor/src/server.ts
    - supervisor/src/services/secret-store.ts
    - supervisor/src/routes/secrets.ts
    - claudeos-sessions/src/supervisor/ws-client.ts
    - claudeos-sessions/test/supervisor/ws-client.test.ts

key-decisions:
  - "Exported boot() function from index.ts for testability; main() is thin CLI wrapper with VITEST env guard"
  - "SecretStore.tryCreate() static factory returns null instead of throwing for lazy initialization"
  - "SecretRouteOptions changed from secretStore to dataDir; routes lazily resolve store on first request"

patterns-established:
  - "Lazy service init: use tryCreate() factory when service depends on runtime state (auth.json existence)"
  - "Two-phase boot: pre-server setup (blocking) then post-server launch (async)"

requirements-completed: [SUP-01, DEP-04, HOM-01, SES-01, SES-03, SES-06, SES-09, TRM-01, TRM-02, SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06]

# Metrics
duration: 5min
completed: 2026-03-14
---

# Phase 05 Plan 01: Supervisor Wiring Fixes Summary

**Three surgical fixes for cross-phase integration bugs: BootService invocation wiring, WebSocket URL correction, and unconditional secrets route registration with lazy SecretStore**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-14T20:51:49Z
- **Completed:** 2026-03-14T20:56:47Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- BootService properly wired from index.ts with two-phase boot (pre-server first-boot detection, post-server extension install + code-server launch)
- WsClient default URL corrected from /ws to /api/v1/ws matching server's registered handler path
- Secrets routes always registered; return 503 when auth.json missing, 200 when present -- no conditional registration

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire BootService invocation from index.ts** - `ebee4e4` (feat)
2. **Task 2: Fix WebSocket URL mismatch in WsClient** - `b7b188f` (fix)
3. **Task 3: Register secrets routes unconditionally** - `7507ecd` (feat)

## Files Created/Modified
- `supervisor/src/index.ts` - Refactored with exported boot() function, two-phase BootService invocation
- `supervisor/src/server.ts` - Removed conditional secretRoutes registration, removed SecretStore import
- `supervisor/src/services/secret-store.ts` - Added tryCreate() static factory method
- `supervisor/src/routes/secrets.ts` - Changed to accept dataDir, lazy SecretStore creation, 503 on unavailable
- `claudeos-sessions/src/supervisor/ws-client.ts` - Fixed default URL to /api/v1/ws
- `supervisor/test/boot-wiring.test.ts` - Tests for boot() function wiring
- `supervisor/test/routes/secrets-unconditional.test.ts` - Tests for 503/200 behavior
- `claudeos-sessions/test/supervisor/ws-client.test.ts` - Added default URL test

## Decisions Made
- Exported boot() function from index.ts for testability; main() wraps it with CLI arg parsing and VITEST env guard
- SecretStore.tryCreate() static factory returns null instead of throwing, enabling lazy initialization in routes
- SecretRouteOptions changed from accepting a pre-built SecretStore to accepting dataDir; routes lazily create store

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three P0/P1 wiring bugs fixed with tests
- Full supervisor test suite (138 tests) and claudeos-sessions test suite (122 tests) passing
- Ready for any remaining Phase 05 plans

## Self-Check: PASSED

All 9 files verified present. All 3 task commits verified in git log.

---
*Phase: 05-supervisor-wiring-fixes*
*Completed: 2026-03-14*
