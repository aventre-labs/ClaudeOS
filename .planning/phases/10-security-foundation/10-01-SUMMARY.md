---
phase: 10-security-foundation
plan: 01
subsystem: auth
tags: [scrypt, race-condition, mutex, env-var, encryption, aes-256-gcm]

# Dependency graph
requires: []
provides:
  - Race-condition-protected BootService with env-var-based auth
  - SecretStore with scrypt-derived encryption key from CLAUDEOS_AUTH_TOKEN
  - Eliminated auth.json from entire codebase
affects: [11-onboarding-wizard, 12-railway-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [env-var-based auth, scrypt key derivation, in-memory mutex for setup endpoint]

key-files:
  created: []
  modified:
    - supervisor/src/services/boot.ts
    - supervisor/src/services/secret-store.ts
    - supervisor/src/server.ts
    - supervisor/test/services/boot.test.ts
    - supervisor/test/services/secret-store.test.ts
    - supervisor/test/routes/secrets-unconditional.test.ts

key-decisions:
  - "In-memory mutex (setupInProgress flag) chosen over file lock for race condition protection — simpler, sufficient for single-process Node.js"
  - "setupInProgress stays true after claim (not reset in finally) to reject requests from already-accepted connections"
  - "Fixed scrypt salt 'claudeos-encryption-key-v1' for deterministic key derivation — enables same key across restarts"

patterns-established:
  - "Auth via CLAUDEOS_AUTH_TOKEN env var: all auth checks use process.env.CLAUDEOS_AUTH_TOKEN, never file-based auth"
  - "Encryption key derivation: scryptSync(token, fixed-salt, 32) for deterministic 256-bit keys"

requirements-completed: [SETUP-04]

# Metrics
duration: 7min
completed: 2026-03-15
---

# Phase 10 Plan 01: Setup Race Condition Fix and Auth Migration Summary

**Race-condition-protected setup endpoint with scrypt-derived encryption key from CLAUDEOS_AUTH_TOKEN, eliminating auth.json entirely**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-15T22:55:44Z
- **Completed:** 2026-03-15T23:02:19Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Setup endpoint protected by in-memory mutex — concurrent POST requests result in exactly one 200 and one 409
- Auth model migrated from auth.json to CLAUDEOS_AUTH_TOKEN env var across boot.ts, secret-store.ts, and server.ts
- SecretStore encryption key deterministically derived via scryptSync with fixed salt
- All 155 tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate BootService auth model and add race condition protection**
   - `de02ec9` (test) — Failing tests for isConfigured, race condition, startCodeServer
   - `90bc7fa` (feat) — Implementation: env-var auth, mutex, removed getStoredPassword
2. **Task 2: Migrate SecretStore to scrypt-derived encryption key and update server wiring**
   - `f017b90` (feat) — scrypt key derivation, auth.json removal, server.ts dry-run update

**Plan metadata:** (pending)

## Files Created/Modified
- `supervisor/src/services/boot.ts` — Removed AuthConfig, authPath, getStoredPassword; added setupInProgress mutex; isConfigured checks env var
- `supervisor/src/services/secret-store.ts` — scrypt-derived masterKey from CLAUDEOS_AUTH_TOKEN; removed generateMasterKey and auth.json reads
- `supervisor/src/server.ts` — Dry-run sets CLAUDEOS_AUTH_TOKEN env var instead of writing auth.json; removed authPath/existsSync/writeFileSync
- `supervisor/test/services/boot.test.ts` — Added isConfigured, race condition, and startCodeServer env var tests (11 total)
- `supervisor/test/services/secret-store.test.ts` — Migrated to env-var-based setup; added scrypt determinism and tryCreate tests (17 total)
- `supervisor/test/routes/secrets-unconditional.test.ts` — Updated to use CLAUDEOS_AUTH_TOKEN instead of auth.json

## Decisions Made
- In-memory mutex (boolean flag) chosen over file-based locks — Node.js is single-threaded, so a synchronous flag check before any async work is sufficient
- setupInProgress flag intentionally NOT reset after successful claim — server is closing anyway, and resetting would allow late-arriving requests on already-accepted connections to sneak through
- Fixed scrypt salt string enables deterministic key derivation across process restarts without storing state

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed setupInProgress mutex reset timing**
- **Found during:** Task 1 (race condition implementation)
- **Issue:** `finally { this.setupInProgress = false }` reset the flag immediately, allowing second request on an already-accepted connection to pass the check
- **Fix:** Removed finally block; flag stays true after successful claim. Only reset on error.
- **Files modified:** supervisor/src/services/boot.ts
- **Verification:** Race condition test passes — exactly one 200, one 409
- **Committed in:** 90bc7fa (Task 1 commit)

**2. [Rule 1 - Bug] Updated secrets-unconditional tests for new auth model**
- **Found during:** Task 2 (full test suite verification)
- **Issue:** Tests created auth.json files instead of setting CLAUDEOS_AUTH_TOKEN env var, causing 503 responses
- **Fix:** Migrated test setup to use process.env.CLAUDEOS_AUTH_TOKEN with proper save/restore
- **Files modified:** supervisor/test/routes/secrets-unconditional.test.ts
- **Verification:** All 155 tests pass
- **Committed in:** f017b90 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Auth model fully migrated to CLAUDEOS_AUTH_TOKEN env var
- Ready for Phase 11 (onboarding wizard) to build the Railway login UI
- Ready for Phase 12 (Railway integration) to wire CLAUDEOS_AUTH_TOKEN as template variable

## Self-Check: PASSED

All files verified present. All commit hashes (de02ec9, 90bc7fa, f017b90) confirmed in git log.

---
*Phase: 10-security-foundation*
*Completed: 2026-03-15*
