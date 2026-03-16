---
phase: 12-wizard-ui-and-build-progress
plan: 03
subsystem: infra
tags: [boot-service, static-serving, api-proxy, nix, vite, container]

requires:
  - phase: 12-wizard-ui-and-build-progress
    provides: Wizard React build output (wizard-dist/) with stepper UI, auth steps, build progress
provides:
  - BootService serves wizard React build from wizard-dist/ instead of setup.html
  - API proxy from setup server (port 8080) to Fastify (port 3100)
  - SSE streaming proxy for wizard events
  - Nix container derivation for wizard build
affects: [13-deployment]

tech-stack:
  added: []
  patterns: [HTTP API proxy with SSE streaming, multi-location static file resolution, MIME type serving]

key-files:
  created: []
  modified:
    - supervisor/src/services/boot.ts
    - flake.nix

key-decisions:
  - "Keep POST /api/v1/setup as direct handler (not proxied) since it controls setup server lifecycle"
  - "wizardDist uses lib.fakeHash placeholder -- real hash computed on first Linux nix build"
  - "Old setup.html kept in container for backward compatibility fallback"

patterns-established:
  - "proxyToFastify helper with special SSE streaming mode for unbuffered event forwarding"
  - "getWizardDistDir multi-location resolution: container path, CWD-relative, project-root-relative"

requirements-completed: [SETUP-01, SETUP-02]

duration: 4min
completed: 2026-03-15
---

# Phase 12 Plan 03: Wizard Integration and Container Build Summary

**BootService serves wizard React build with API proxy to Fastify and Nix container derivation for automated wizard packaging**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-16T01:00:51Z
- **Completed:** 2026-03-16T01:04:57Z
- **Tasks:** 3 (2 auto + 1 auto-approved checkpoint)
- **Files modified:** 2

## Accomplishments
- BootService rewritten to serve wizard-dist/ static files with MIME types instead of setup.html
- HTTP proxy forwards all /api/v1/* to Fastify on port 3100 with special SSE streaming support
- Nix flake updated with wizardDist buildNpmPackage derivation and container copy step
- All 207 supervisor tests pass including race condition protection tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Update BootService to serve wizard static files and proxy API requests** - `029b26d` (feat)
2. **Task 2: Add wizard build step to Nix container and update container config** - `8b531f0` (feat)
3. **Task 3: Verify wizard loads in browser** - auto-approved (checkpoint)

## Files Created/Modified
- `supervisor/src/services/boot.ts` - Rewritten with wizard-dist serving, MIME types, API proxy, SSE streaming
- `flake.nix` - Added wizardDist derivation, container wizard-dist copy, standalone package target

## Decisions Made
- POST /api/v1/setup kept as direct handler (not proxied) because it controls setup server lifecycle and must close the server on successful claim
- wizardDist npmDepsHash uses lib.fakeHash placeholder since correct hash requires Linux nix build (computed on first attempt)
- Old setup.html preserved in container for fallback if wizard-dist fails to load

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restored direct /api/v1/setup handler before API proxy**
- **Found during:** Task 1 (BootService rewrite)
- **Issue:** Initial implementation proxied all /api/v1/* including setup endpoint, breaking race condition tests (502 with no Fastify running)
- **Fix:** Added direct POST /api/v1/setup handler before the /api/v1/* proxy catch-all
- **Files modified:** supervisor/src/services/boot.ts
- **Verification:** All 207 tests pass including both race condition tests
- **Committed in:** 029b26d (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix necessary for correctness -- setup endpoint must control server lifecycle directly. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Wizard UI fully integrated into BootService serving pipeline
- Container build pipeline ready for wizard packaging
- All backend and frontend tests passing
- Ready for Phase 13 deployment

## Self-Check: PASSED

All modified files verified present. Both task commits (029b26d, 8b531f0) confirmed in git log.

---
*Phase: 12-wizard-ui-and-build-progress*
*Completed: 2026-03-15*
