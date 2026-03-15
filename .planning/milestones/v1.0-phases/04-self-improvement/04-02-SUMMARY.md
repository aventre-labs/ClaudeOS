---
phase: 04-self-improvement
plan: 02
subsystem: extensions
tags: [vscode-extension, quickpick, github-pat, secrets-integration, progress-notification]

# Dependency graph
requires:
  - phase: 04-self-improvement
    provides: SupervisorClient, ExtensionRecord types, extension scaffold with vscode mock
  - phase: 03-platform-services
    provides: claudeos-secrets public API for PAT detection
provides:
  - "ClaudeOS: Install Extension" command palette flow with 3 install methods
  - GitHub PAT auto-detection from claudeos-secrets extension
  - Post-install reload behavior per supervisor settings
affects: [04-03]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Multi-step QuickPick/InputBox command flow", "Cross-extension API consumption for PAT detection", "Supervisor settings fetch for reload behavior"]

key-files:
  created:
    - claudeos-self-improve/src/commands/install-extension.ts
  modified:
    - claudeos-self-improve/test/commands/install-extension.test.ts
    - claudeos-self-improve/test/__mocks__/vscode.ts

key-decisions:
  - "secretName passed in install body for forward-compatible PAT support (supervisor ignores until implemented)"
  - "Single PAT auto-used; multiple PATs presented in QuickPick for user selection"
  - "showOpenDialog added to vscode mock for folder/file picker tests"

patterns-established:
  - "captureHandler pattern: extract command handler from registerCommand mock for direct invocation in tests"
  - "vi.clearAllMocks with explicit re-mock of withProgress to preserve callback execution"

requirements-completed: [IMP-02, IMP-03, IMP-04]

# Metrics
duration: 4min
completed: 2026-03-14
---

# Phase 4 Plan 2: Install Extension Command Summary

**Command palette install flow with 3 methods, GitHub PAT auto-detection from claudeos-secrets, progress notifications, and supervisor-driven reload behavior**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-14T18:31:19Z
- **Completed:** 2026-03-14T18:35:00Z
- **Tasks:** 1 (TDD: red + green)
- **Files modified:** 3

## Accomplishments
- Full "ClaudeOS: Install Extension" command with QuickPick for GitHub Release, Local Source, and VSIX File methods
- GitHub PAT auto-detection from claudeos-secrets: single PAT auto-used, multiple PATs shown in picker
- Progress notification with timestamped OutputChannel logging
- Post-install reload follows supervisor reloadBehavior setting (force or notification), defaults to force on fetch failure
- 21 comprehensive tests covering all flows, cancellation, PAT detection, and reload behavior

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for install command** - `eb23ec8` (test)
2. **Task 1 (GREEN): Implement install-extension command** - `8f2f3e8` (feat)

## Files Created/Modified
- `claudeos-self-improve/src/commands/install-extension.ts` - Command handler with registerInstallCommand, detectGitHubPat, triggerReload
- `claudeos-self-improve/test/commands/install-extension.test.ts` - 21 unit tests for the full install flow
- `claudeos-self-improve/test/__mocks__/vscode.ts` - Added showOpenDialog mock for file/folder pickers

## Decisions Made
- secretName passed in request body for forward-compatible PAT support (supervisor will ignore until it implements PAT-based auth for GitHub downloads)
- Single PAT auto-used without prompt; multiple PATs shown in QuickPick for user selection
- Used vi.clearAllMocks instead of vi.resetAllMocks to preserve mock implementations, with explicit re-mock of withProgress callback execution

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added showOpenDialog to vscode mock**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Tests for build-from-source and local-vsix needed showOpenDialog which was missing from the vscode mock
- **Fix:** Added showOpenDialog mock to the window object in test/__mocks__/vscode.ts
- **Files modified:** claudeos-self-improve/test/__mocks__/vscode.ts
- **Verification:** All 21 tests pass
- **Committed in:** 8f2f3e8 (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary mock addition for test infrastructure. No scope creep.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Install command ready for wiring into extension.ts activate() in Plan 03
- MCP server can call SupervisorClient.installExtension with same parameters
- PAT detection pattern established for reuse in MCP tool context

---
*Phase: 04-self-improvement*
*Completed: 2026-03-14*
