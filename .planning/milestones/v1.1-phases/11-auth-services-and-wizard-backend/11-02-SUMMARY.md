---
phase: 11-auth-services-and-wizard-backend
plan: 02
subsystem: auth
tags: [railway-cli, anthropic-api, subprocess, child-process, secret-store, tdd]

requires:
  - phase: 11-auth-services-and-wizard-backend
    provides: WizardState types, WizardSSEEvents, SecretStore interface
provides:
  - RailwayAuthService with subprocess login, token extraction, SecretStore persistence
  - AnthropicAuthService with zero-cost API key validation, claude login subprocess, fallback handling
affects: [11-03]

tech-stack:
  added: []
  patterns: [subprocess-auth-flow, zero-cost-api-validation, cli-enoent-handling]

key-files:
  created:
    - supervisor/src/services/auth-railway.ts
    - supervisor/src/services/auth-anthropic.ts
    - supervisor/test/services/auth-railway.test.ts
    - supervisor/test/services/auth-anthropic.test.ts
  modified: []

key-decisions:
  - "Railway stdout parsed incrementally for URL and 3-4 word hyphenated pairing code"
  - "Anthropic API key validated via POST to messages endpoint, checking 401 vs non-401 (any non-401 = valid key)"
  - "Claude login has 10-second URL capture timeout with fallback suggestion to API key method"

patterns-established:
  - "Subprocess auth flow: spawn CLI, parse stdout, notify callbacks, track process for cancel/cleanup"
  - "ENOENT handling: detect missing CLI binary and return user-friendly error with install instructions"
  - "Concurrent run prevention: throw if subprocess already active, reset on exit/error"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03]

duration: 2min
completed: 2026-03-15
---

# Phase 11 Plan 02: Auth Services Summary

**Railway and Anthropic auth services with subprocess management, zero-cost API key validation, and SecretStore credential persistence**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-16T00:02:25Z
- **Completed:** 2026-03-16T00:04:50Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- RailwayAuthService: spawns `railway login --browserless`, parses stdout for pairing code + URL, extracts token from ~/.railway/config.json, stores in SecretStore
- AnthropicAuthService: validates API keys via HTTP POST (zero-cost, 401 = invalid), stores keys encrypted, manages `claude login` subprocess with 10s URL timeout
- Both services handle missing CLI binaries (ENOENT), prevent concurrent runs, support cancellation
- 28 unit tests total (13 railway + 15 anthropic) with mocked child_process, fs, and fetch
- Full TDD cycle (RED -> GREEN) for both tasks
- 196 total tests pass, zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement RailwayAuthService with subprocess management** - `55cc3b7` (feat)
2. **Task 2: Implement AnthropicAuthService with API key validation and claude login** - `8d0cda6` (feat)

## Files Created/Modified
- `supervisor/src/services/auth-railway.ts` - Railway CLI subprocess auth with token extraction and SecretStore persistence
- `supervisor/src/services/auth-anthropic.ts` - Anthropic API key validation via HTTP, claude login subprocess with timeout fallback
- `supervisor/test/services/auth-railway.test.ts` - 13 unit tests covering spawn, stdout parsing, cancel, ENOENT, token extract/store
- `supervisor/test/services/auth-anthropic.test.ts` - 15 unit tests covering API validation, key storage, claude login, timeout, ENOENT

## Decisions Made
- Railway stdout parsed incrementally for URL (`https://railway.com/cli-login...`) and pairing code (3-4 hyphenated words regex)
- Anthropic API key validated by checking HTTP status: 401 = invalid key, any other status (200, 400, 429) = valid key (zero credit consumption)
- Claude login gets 10-second timeout for URL capture; if no URL appears, onComplete fires with `fallbackToApiKey: true`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both auth services ready for Plan 03 (wizard routes) to call via REST endpoints
- RailwayAuthService.startLogin() provides callbacks for SSE event emission
- AnthropicAuthService.validateApiKey() and startClaudeLogin() ready for route integration
- All 196 existing tests pass (zero regressions)

---
*Phase: 11-auth-services-and-wizard-backend*
*Completed: 2026-03-15*
