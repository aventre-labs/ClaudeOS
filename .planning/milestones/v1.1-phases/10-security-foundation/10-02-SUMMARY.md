---
phase: 10-security-foundation
plan: 02
subsystem: infra
tags: [railway, github-actions, deploy, ci]

requires:
  - phase: none
    provides: n/a
provides:
  - Fork-friendly deploy button URL in README
  - GitHub Action to auto-patch deploy button URL on forks
  - railway.json with template variable support (CLAUDEOS_AUTH_TOKEN auto-generation)
affects: [deploy, onboarding]

tech-stack:
  added: [railway.json template format]
  patterns: [GitHub Actions for fork-specific automation]

key-files:
  created:
    - .github/workflows/patch-fork-readme.yml
    - railway.json
  modified:
    - README.md
    - railway.toml (deleted)

key-decisions:
  - "Used dockerImage builder in railway.json instead of DOCKERFILE since project has no Dockerfile (pre-built GHCR image)"
  - "Omitted startCommand since image entrypoint is baked into the pre-built container"

patterns-established:
  - "Fork patching: GitHub Actions that auto-configure repo-specific URLs on push to main"

requirements-completed: [DEPLOY-01]

duration: 1min
completed: 2026-03-15
---

# Phase 10 Plan 02: Deploy Button and Railway Template Summary

**Fork-friendly deploy button with GitHub Action auto-patching and railway.json template config with secret(32) auth token generation**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-15T22:55:48Z
- **Completed:** 2026-03-15T22:56:56Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- README deploy button now uses `?template=https://github.com/OWNER/REPO` format that works on any fork
- GitHub Action auto-patches the deploy URL when a fork pushes to main (with no-op guard to prevent infinite commits)
- railway.json replaces railway.toml, adding template variable support with `secret(32)` generator for CLAUDEOS_AUTH_TOKEN

## Task Commits

Each task was committed atomically:

1. **Task 1: Update README deploy button and create GitHub Action for fork patching** - `16fa6c5` (feat)
2. **Task 2: Create railway.json and remove railway.toml** - `be013f4` (feat)

## Files Created/Modified
- `README.md` - Updated deploy button URL to use template format
- `.github/workflows/patch-fork-readme.yml` - GitHub Action that auto-patches deploy URL on forks
- `railway.json` - Railway template configuration with CLAUDEOS_AUTH_TOKEN secret generator
- `railway.toml` - Deleted (replaced by railway.json)

## Decisions Made
- Used `dockerImage` builder in railway.json instead of `DOCKERFILE` builder since the project has no Dockerfile -- it pulls a pre-built image from GHCR
- Omitted `startCommand` since the container entrypoint is baked into the pre-built GHCR image

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected builder type from DOCKERFILE to dockerImage**
- **Found during:** Task 2 (Create railway.json)
- **Issue:** Plan specified `builder: "DOCKERFILE"` but the project has no Dockerfile; it uses a pre-built GHCR image (`ghcr.io/aventre-labs/claudeos:latest`)
- **Fix:** Used `dockerImage` field matching the existing railway.toml configuration
- **Files modified:** railway.json
- **Verification:** railway.json created with correct builder config
- **Committed in:** be013f4 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Auto-fix necessary for correctness. The DOCKERFILE builder would have failed since no Dockerfile exists. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Deploy infrastructure is configured for fork-friendly deployment
- Railway template variables support auto-generation of auth tokens
- Ready for remaining Phase 10 plans (auth flow, setup wizard)

---
*Phase: 10-security-foundation*
*Completed: 2026-03-15*
