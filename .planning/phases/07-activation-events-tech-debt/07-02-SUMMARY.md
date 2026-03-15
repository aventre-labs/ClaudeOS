---
phase: 07-activation-events-tech-debt
plan: 02
subsystem: terminal
tags: [vscode-extension, terminal-manager, dedup, notification, session-exit]

requires:
  - phase: 02-session-management
    provides: TerminalManager with notifySessionExit and terminal lifecycle
provides:
  - Session exit dedup guard preventing duplicate notifications
  - User-facing exit notification message
  - Terminal tab name status prefix for stopped sessions
affects: []

tech-stack:
  added: []
  patterns:
    - "exitedSessions Set for dedup guard on idempotent event handlers"
    - "[Stopped] prefix convention for terminal tab names"

key-files:
  created: []
  modified:
    - claudeos-sessions/src/terminal/terminal-manager.ts
    - claudeos-sessions/src/extension.ts
    - claudeos-sessions/test/terminal/terminal-manager.test.ts

key-decisions:
  - "exitedSessions Set cleared on closeTerminal, handleTerminalClose, and dispose for clean reuse"
  - "vi.clearAllMocks() added to test beforeEach to prevent mock state leaking between tests"

patterns-established:
  - "Dedup guard pattern: Set<string> checked before firing, cleared on cleanup"

requirements-completed: [SES-01, TRM-01]

duration: 3min
completed: 2026-03-14
---

# Phase 7 Plan 2: Session Exit Dedup, Notification, and Status Prefix Summary

**Dedup guard on notifySessionExit with informational message and [Stopped] terminal tab prefix for ended sessions**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T01:27:46Z
- **Completed:** 2026-03-15T01:30:45Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- notifySessionExit fires exactly once per session exit via exitedSessions dedup Set
- User sees "Session '{name}' has ended" informational message on session exit
- Terminal tab name shows "[Stopped] {name}" for stopped/archived/zombie sessions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add dedup guard and exit notification (RED)** - `9beac24` (test)
2. **Task 1: Add dedup guard and exit notification (GREEN)** - `a1290c8` (feat)
3. **Task 2: Add terminal name status prefix** - `d93a8d2` (feat)

_TDD task had separate test and implementation commits._

## Files Created/Modified
- `claudeos-sessions/src/terminal/terminal-manager.ts` - Added exitedSessions Set, dedup guard, showInformationMessage on exit, cleanup in closeTerminal/handleTerminalClose/dispose
- `claudeos-sessions/src/extension.ts` - Added [Stopped] prefix to updateTerminalName, pass session.name to notifySessionExit
- `claudeos-sessions/test/terminal/terminal-manager.test.ts` - Added 3 new tests for dedup, notification message, and re-notification after close

## Decisions Made
- exitedSessions Set cleared on closeTerminal, handleTerminalClose, and dispose for clean reuse
- Added vi.clearAllMocks() to test beforeEach to prevent mock state leaking between tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added vi.clearAllMocks() to test beforeEach**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** showInformationMessage mock accumulated calls across tests, causing dedup and re-notification tests to fail
- **Fix:** Added vi.clearAllMocks() at start of beforeEach block
- **Files modified:** claudeos-sessions/test/terminal/terminal-manager.test.ts
- **Verification:** All 16 tests pass
- **Committed in:** a1290c8 (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for test correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Terminal manager now has proper dedup and notification on session exit
- Ready for remaining Phase 7 plans

---
*Phase: 07-activation-events-tech-debt*
*Completed: 2026-03-14*
