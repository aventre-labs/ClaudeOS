---
phase: 13-launch-integration
plan: 01
subsystem: boot
tags: [credential-writer, code-server, sse, launch, wizard, boot-fast-path]

# Dependency graph
requires:
  - phase: 11-auth-services-and-wizard-backend
    provides: SecretStore, WizardStateService, auth services (railway/anthropic)
  - phase: 12-wizard-ui-and-build-progress
    provides: Wizard routes, SSE broadcast, build progress polling
provides:
  - CredentialWriter service reads SecretStore, writes to ~/.claude/settings.json and ~/.railway/config.json
  - POST /wizard/launch endpoint validates auth, writes credentials, starts code-server in background
  - BootService.startCodeServer auth:none option for wizard-launched code-server
  - BootService.waitForCodeServer health check polling
  - Setup server port handoff (getSetupServer + close before code-server binds)
  - Container restart fast-path (completed wizard -> credential write -> auth:none code-server)
  - launch:ready and launch:error SSE events
affects: [13-02-PLAN, frontend-launch-transition]

# Tech tracking
tech-stack:
  added: []
  patterns: [credential-writer-service, boot-fast-path, background-async-launch, port-handoff]

key-files:
  created:
    - supervisor/src/services/credential-writer.ts
    - supervisor/test/services/credential-writer.test.ts
  modified:
    - supervisor/src/routes/wizard.ts
    - supervisor/src/schemas/wizard.ts
    - supervisor/src/services/boot.ts
    - supervisor/src/index.ts
    - supervisor/src/server.ts
    - supervisor/test/routes/wizard.test.ts
    - supervisor/test/boot-wiring.test.ts

key-decisions:
  - "BootService created in buildServer() and shared with wizard routes via Fastify decorate pattern"
  - "startCodeServer auth: none for wizard-launched instances (Railway auth cookie gates access)"
  - "Background async launch: POST /wizard/launch returns 200 immediately, code-server start + health check fires in background void promise"
  - "Setup server closes (stop accepting) before code-server binds; existing SSE connections stay alive for launch:ready delivery"

patterns-established:
  - "Credential writer: atomic tmp+rename writes to native config locations, merge-not-overwrite for settings.json"
  - "Background async launch: fire-and-forget with error logging, SSE event delivery on completion"
  - "Boot fast-path: check wizard-state.json at boot, skip wizard UI if completed, re-write credentials from SecretStore"

requirements-completed: [DEPLOY-02]

# Metrics
duration: 6min
completed: 2026-03-16
---

# Phase 13 Plan 01: Launch Integration Backend Summary

**CredentialWriter service, POST /wizard/launch endpoint with background code-server start, health check polling, setup server port handoff, and container restart fast-path with auth:none**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-16T02:45:05Z
- **Completed:** 2026-03-16T02:51:18Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- CredentialWriter service reads SecretStore and writes Anthropic API key to ~/.claude/settings.json (env block merge) and optionally Railway token to ~/.railway/config.json
- POST /wizard/launch validates auth completion, writes credentials, returns 200, then fires background code-server start with health check and SSE broadcast
- Boot fast-path: on container restart with completed wizard, re-writes credentials from SecretStore and starts code-server with --auth none
- BootService enhanced with auth option, waitForCodeServer health check, and getSetupServer for port handoff

## Task Commits

Each task was committed atomically:

1. **Task 1: CredentialWriter service and launch endpoint** - `400f9b7` (feat)
2. **Task 2: Code-server launch flow, port handoff, health check, and boot fast path** - `be26f19` (feat)

## Files Created/Modified
- `supervisor/src/services/credential-writer.ts` - Reads SecretStore, writes Anthropic key to ~/.claude/settings.json and Railway token to ~/.railway/config.json
- `supervisor/src/routes/wizard.ts` - POST /wizard/launch endpoint with background async code-server start
- `supervisor/src/schemas/wizard.ts` - WizardLaunchResponseSchema Zod schema
- `supervisor/src/services/boot.ts` - auth:none option, waitForCodeServer, getSetupServer, setupServerInstance storage
- `supervisor/src/index.ts` - Wizard fast-path boot: credential write + auth:none on completed wizard restart
- `supervisor/src/server.ts` - BootService created in buildServer, passed to wizard routes
- `supervisor/test/services/credential-writer.test.ts` - 9 tests: write, merge, railway, writeAll, error cases
- `supervisor/test/routes/wizard.test.ts` - 3 new launch tests: 400 incomplete, 200 success, no wizard:completed broadcast
- `supervisor/test/boot-wiring.test.ts` - 3 new fast-path tests: credential write, auth:none, normal boot default

## Decisions Made
- BootService created in buildServer() and shared with wizard routes via Fastify decorate pattern (avoids creating duplicate BootService instances)
- startCodeServer uses auth: "none" for wizard-launched instances since Railway auth cookie already gates access
- Background async launch pattern: POST /wizard/launch returns 200 immediately, code-server start + health check fires as void promise with error logging (prevents HTTP timeout during ~30s health check)
- Setup server closes (stop accepting new connections) before code-server binds to port 8080; existing SSE connections stay alive for launch:ready delivery, then force-closed 2s after broadcast

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Boot-wiring test: vitest `expect.stringContaining` asymmetric matcher doesn't work with `toContain` on arrays. Replaced with `calls.some(c => c.includes(...))` pattern.
- Fastify decorator `bootService` not typed on FastifyInstance interface. Used `(server as unknown as { bootService: BootService }).bootService` type assertion (same pattern as existing extensionInstaller/setBootState decorators).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Launch backend fully wired: credential write, code-server start, health check, SSE events
- Ready for Phase 13 Plan 02: frontend launch transition animation, useSSE hook updates, and LaunchStep wiring
- All 222 tests passing, no new TypeScript errors

---
*Phase: 13-launch-integration*
*Completed: 2026-03-16*
