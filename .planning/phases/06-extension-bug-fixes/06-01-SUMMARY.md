---
phase: 06-extension-bug-fixes
plan: 01
subsystem: api, ui
tags: [zod, fastify, vscode-webview, pat-auth, secrets]

requires:
  - phase: 01-supervisor-container
    provides: Extension installer service and routes
  - phase: 03-platform-services
    provides: SecretStore with tryCreate pattern, home webview panel
  - phase: 05-supervisor-wiring
    provides: Lazy SecretStore pattern for routes

provides:
  - PAT token passthrough for private GitHub repo extension installs
  - Working API key banner in home webview via webview-initiated check

affects: []

tech-stack:
  added: []
  patterns:
    - "Webview-initiated status checks (postMessage request/response) to avoid race conditions"
    - "Optional token parameter on fetch calls with conditional Authorization header"

key-files:
  created: []
  modified:
    - supervisor/src/schemas/extension.ts
    - supervisor/src/services/extension-installer.ts
    - supervisor/src/routes/extensions.ts
    - supervisor/src/server.ts
    - claudeos-home/src/webview/home-panel.ts
    - claudeos-home/src/extension.ts

key-decisions:
  - "Webview-initiated API key check avoids race condition where extension.ts pushes before webview is ready"
  - "resolveSecret uses lazy SecretStore.tryCreate pattern consistent with secret routes"

patterns-established:
  - "Webview-initiated checks: webview sends request message, extension handler responds with data message"

requirements-completed: [IMP-03, HOM-04]

duration: 3min
completed: 2026-03-14
---

# Phase 6 Plan 1: Extension Bug Fixes Summary

**PAT secretName preserved through Zod validation with auth header passthrough on GitHub fetches; home webview API key banner driven by webview-initiated check**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T00:28:36Z
- **Completed:** 2026-03-15T00:31:31Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- secretName field passes through Zod validation for github-release install method
- installFromGitHub sends Authorization Bearer header on both API and VSIX download fetches when token provided
- Route handler resolves secretName via resolveSecret callback and passes token through to installer
- Home webview checkApiKeyStatus handler queries secrets extension and posts result back to webview
- Dead-end checkApiKeyStatus stub removed from extension.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix PAT secretName Zod stripping and auth header passthrough (IMP-03)** - `4a4c58c` (feat)
2. **Task 2: Fix home webview API key banner postMessage (HOM-04)** - `82dfacb` (feat)

## Files Created/Modified
- `supervisor/src/schemas/extension.ts` - Added secretName optional field to GithubReleaseInstallSchema
- `supervisor/src/services/extension-installer.ts` - Added optional token parameter with Authorization header on fetches
- `supervisor/src/routes/extensions.ts` - Added resolveSecret callback, secretName in body type, token passthrough
- `supervisor/src/server.ts` - Wired resolveSecret using lazy SecretStore.tryCreate pattern
- `supervisor/test/routes/extensions.test.ts` - Added test for secretName acceptance in request body
- `supervisor/test/services/extension-installer.test.ts` - Added tests for token auth headers and backward compat
- `claudeos-home/src/webview/home-panel.ts` - Added checkApiKeyStatus handler and webview JS initialization
- `claudeos-home/src/extension.ts` - Removed dead-end checkApiKeyStatus stub
- `claudeos-home/test/webview/home-panel.test.ts` - Added tests for checkApiKeyStatus with/without secrets extension

## Decisions Made
- Webview-initiated API key check avoids race condition where extension.ts pushes before webview is ready
- resolveSecret uses lazy SecretStore.tryCreate pattern consistent with Phase 5 secret routes
- Download call passes undefined (no options) when no token, maintaining exact backward compatibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All v1.0 requirements (IMP-03, HOM-04) now complete
- Both supervisor and claudeos-home test suites pass fully (142 + 16 tests)

---
*Phase: 06-extension-bug-fixes*
*Completed: 2026-03-14*
