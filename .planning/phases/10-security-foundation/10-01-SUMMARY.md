---
phase: 10-security-foundation
plan: 01
subsystem: auth
tags: [security, race-condition, auth-migration, encryption]

requires:
  - phase: none
    provides: n/a
provides:
  - Race-condition-protected setup endpoint (in-memory mutex)
  - CLAUDEOS_AUTH_TOKEN-based auth model (replaces auth.json)
  - SecretStore with scrypt-derived encryption key
affects: [boot, secrets, code-server]

tech-stack:
  added: [scryptSync key derivation]
  patterns: [env-var-based auth, in-memory mutex for single-process Node.js]

key-files:
  created: []
  modified:
    - supervisor/src/services/boot.ts
    - supervisor/src/services/secret-store.ts
    - supervisor/src/server.ts
    - supervisor/src/routes/secrets.ts
    - supervisor/test/services/boot.test.ts
    - supervisor/test/services/secret-store.test.ts
    - supervisor/test/routes/secrets-unconditional.test.ts

key-decisions:
  - "auth.json eliminated entirely — CLAUDEOS_AUTH_TOKEN env var is the sole auth source"
  - "SecretStore encryption key derived via scryptSync(token, fixed_salt, 32) for deterministic key"
  - "In-memory setupInProgress boolean as mutex — sufficient for single-process Node.js"

patterns-established:
  - "Env-var-based auth: check process.env.CLAUDEOS_AUTH_TOKEN for configured state"
  - "Deterministic key derivation: same token always produces same encryption key"

requirements-completed: [SETUP-04]

duration: 3min
completed: 2026-03-15
---

# Phase 10 Plan 01: Race Condition Protection and Auth Model Migration

**Setup endpoint mutex protection and migration from auth.json to CLAUDEOS_AUTH_TOKEN env var**

## Performance

- **Duration:** 3 min
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- BootService.isConfigured() now checks CLAUDEOS_AUTH_TOKEN env var instead of auth.json existence
- In-memory mutex (setupInProgress flag) prevents concurrent setup claims — second request gets 409
- SecretStore derives encryption key from CLAUDEOS_AUTH_TOKEN via scryptSync with fixed salt
- code-server receives CLAUDEOS_AUTH_TOKEN directly as PASSWORD env var
- auth.json references removed from all source files
- generateMasterKey() and getStoredPassword() methods removed

## Task Commits

1. **Task 1: Migrate BootService and add race condition protection** - `de02ec9` (tests) + boot.ts already modified
2. **Task 2: Migrate SecretStore and update server wiring** - `f017b90` (feat)

## Files Modified
- `supervisor/src/services/boot.ts` - Removed auth.json logic, added setupInProgress mutex, env-var-based isConfigured()
- `supervisor/src/services/secret-store.ts` - scryptSync key derivation, removed auth.json/generateMasterKey
- `supervisor/src/server.ts` - Dry-run mode sets CLAUDEOS_AUTH_TOKEN instead of writing auth.json
- `supervisor/src/routes/secrets.ts` - Updated comment
- `supervisor/test/services/boot.test.ts` - Race condition and isConfigured tests
- `supervisor/test/services/secret-store.test.ts` - scrypt-derived key tests
- `supervisor/test/routes/secrets-unconditional.test.ts` - Updated to use env var instead of auth.json

## Verification

- 155 tests pass (12 test files)
- `grep -r "auth.json" supervisor/src/` returns no matches
- `grep -r "getStoredPassword" supervisor/src/` returns no matches
- `grep -r "generateMasterKey" supervisor/src/` returns no matches

---
*Phase: 10-security-foundation*
*Completed: 2026-03-15*
