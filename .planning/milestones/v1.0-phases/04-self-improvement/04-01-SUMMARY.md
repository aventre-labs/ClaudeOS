---
phase: 04-self-improvement
plan: 01
subsystem: extensions
tags: [supervisor, vscode-extension, fetch, esbuild, vitest, mcp]

# Dependency graph
requires:
  - phase: 01-supervisor-container-foundation
    provides: Extension installer service, extensions API routes
  - phase: 03-platform-services
    provides: Secrets extension pattern (package.json, tsconfig, vitest, vscode mock)
provides:
  - Supervisor DELETE /extensions/:id endpoint for extension uninstall
  - claudeos-self-improve extension scaffold with types, SupervisorClient, test infra
  - ExtensionRecord and SecretsPublicApi type contracts for self-improve extension
affects: [04-02, 04-03]

# Tech tracking
tech-stack:
  added: ["@modelcontextprotocol/sdk ^1.27.0", "zod ^3.24.0 (self-improve)"]
  patterns: ["SupervisorClient typed fetch wrapper for extensions API", "Two-entrypoint esbuild (extension + mcp-server)"]

key-files:
  created:
    - claudeos-self-improve/package.json
    - claudeos-self-improve/tsconfig.json
    - claudeos-self-improve/vitest.config.ts
    - claudeos-self-improve/esbuild.mjs
    - claudeos-self-improve/src/types.ts
    - claudeos-self-improve/src/supervisor/client.ts
    - claudeos-self-improve/src/extension.ts
    - claudeos-self-improve/test/__mocks__/vscode.ts
    - claudeos-self-improve/test/supervisor/client.test.ts
  modified:
    - supervisor/src/services/extension-installer.ts
    - supervisor/src/routes/extensions.ts
    - supervisor/test/services/extension-installer.test.ts
    - supervisor/test/routes/extensions.test.ts

key-decisions:
  - "uninstallExtension uses record.name for code-server --uninstall-extension (not internal ID)"
  - "Route tests mock node:child_process to avoid code-server dependency in test"
  - "esbuild.mjs has two entry points: extension.ts and mcp-server/src/index.ts (latter fails until Plan 03)"

patterns-established:
  - "SupervisorClient pattern: typed fetch wrapper with encodeURIComponent for IDs"
  - "Extension scaffold pattern: package.json + tsconfig + vitest + esbuild + vscode mock"

requirements-completed: [IMP-01, IMP-05]

# Metrics
duration: 4min
completed: 2026-03-14
---

# Phase 4 Plan 1: Supervisor Uninstall + Self-Improve Extension Scaffold Summary

**Supervisor extension uninstall endpoint via code-server CLI + claudeos-self-improve extension scaffold with SupervisorClient and 6 passing tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-14T18:24:30Z
- **Completed:** 2026-03-14T18:28:38Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Supervisor DELETE /api/v1/extensions/:id now uninstalls via code-server CLI and removes from install-state.json
- New claudeos-self-improve extension project with full build/test toolchain
- SupervisorClient with installExtension, listExtensions, uninstallExtension methods (all tested)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement supervisor extension uninstall** - `f4970fd` (feat) - TDD: red/green
2. **Task 2: Scaffold claudeos-self-improve extension** - `6311478` (feat)

## Files Created/Modified
- `supervisor/src/services/extension-installer.ts` - Added uninstallExtension method + runCodeServerUninstall
- `supervisor/src/routes/extensions.ts` - Replaced DELETE stub with working uninstall route
- `supervisor/test/services/extension-installer.test.ts` - 3 new uninstall tests
- `supervisor/test/routes/extensions.test.ts` - 2 new DELETE endpoint tests + execFile mock
- `claudeos-self-improve/package.json` - Extension manifest with MCP SDK dependency
- `claudeos-self-improve/tsconfig.json` - TypeScript config matching secrets pattern
- `claudeos-self-improve/vitest.config.ts` - Test config with vscode alias
- `claudeos-self-improve/esbuild.mjs` - Two-entry build (extension + mcp-server)
- `claudeos-self-improve/src/types.ts` - ExtensionRecord + SecretsPublicApi contracts
- `claudeos-self-improve/src/supervisor/client.ts` - Typed fetch wrapper for extensions API
- `claudeos-self-improve/src/extension.ts` - Minimal activation skeleton
- `claudeos-self-improve/test/__mocks__/vscode.ts` - VS Code mock with showQuickPick
- `claudeos-self-improve/test/supervisor/client.test.ts` - 6 unit tests for SupervisorClient

## Decisions Made
- uninstallExtension uses record.name (e.g., "org/repo") for code-server CLI, not the internal ID (e.g., "github:org/repo@tag")
- Route tests needed execFile mock since code-server is not available in test environment
- esbuild.mjs configured with two entry points; mcp-server entry intentionally fails until Plan 03 creates the source file

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added execFile mock to route tests**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Route tests use real server via test-server helper; code-server binary unavailable in test causing DELETE to return 500
- **Fix:** Added vi.mock("node:child_process") to extensions route test file
- **Files modified:** supervisor/test/routes/extensions.test.ts
- **Verification:** DELETE route test passes with 200
- **Committed in:** f4970fd (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for tests to pass without code-server binary. No scope creep.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Extension scaffold ready for Plan 02 (MCP tools: install/list/uninstall)
- Extension scaffold ready for Plan 03 (MCP server lifecycle, activate/deactivate)
- Supervisor uninstall endpoint ready for consumption by both MCP tool and VS Code command

---
*Phase: 04-self-improvement*
*Completed: 2026-03-14*
