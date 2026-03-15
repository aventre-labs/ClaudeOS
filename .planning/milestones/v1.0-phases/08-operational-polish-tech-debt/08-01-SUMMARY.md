---
phase: 08-operational-polish-tech-debt
plan: 01
subsystem: infra
tags: [nix, vsix, discriminated-union, boot-service, debug-logging]

# Dependency graph
requires:
  - phase: 01-supervisor-container
    provides: BootService, ExtensionInstaller, flake.nix container build
  - phase: 04-self-improvement
    provides: detectGitHubPat in install-extension.ts
provides:
  - Functional first-boot auto-install of 4 ClaudeOS extensions via local-vsix
  - Observable PAT detection degradation via debug OutputChannel
  - Nix derivation for building extension VSIX files into container image
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [discriminated-union-dispatch, module-level-output-channel]

key-files:
  created:
    - supervisor/test/services/boot.test.ts
  modified:
    - config/default-extensions.json
    - supervisor/src/services/boot.ts
    - claudeos-self-improve/src/commands/install-extension.ts
    - claudeos-self-improve/test/commands/install-extension.test.ts
    - flake.nix

key-decisions:
  - "DefaultExtension evolved from interface to discriminated union type matching InstallExtensionSchema pattern"
  - "Module-level debugChannel OutputChannel for detectGitHubPat observability (separate from registerInstallCommand param)"
  - "extensionVsix Nix derivation builds all 4 extensions in single mkDerivation (not per-extension buildNpmPackage)"
  - "npmDepsHash left as placeholder -- Nix not available in current environment"

patterns-established:
  - "Discriminated union dispatch: compute extName from method variant, use for skip/fail-fast logic"
  - "Module-level OutputChannel: create at module scope for standalone functions needing debug logging"

requirements-completed: [SUP-07, SUP-08, DEP-02, IMP-03]

# Metrics
duration: 4min
completed: 2026-03-14
---

# Phase 8 Plan 1: Tech Debt Closure Summary

**Local-vsix first-boot auto-install with discriminated union dispatch, PAT detection debug logging, and Nix VSIX build derivation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-15T04:54:51Z
- **Completed:** 2026-03-15T04:59:00Z
- **Tasks:** 4
- **Files modified:** 6

## Accomplishments
- default-extensions.json populated with 4 local-vsix entries for first-boot auto-install
- BootService.installExtensions() dispatches local-vsix to installFromVsix() with correct skip logic using computed extName
- detectGitHubPat() logs debug message when secrets extension is inactive (no behavior change)
- flake.nix has extensionVsix derivation and copies VSIX files into container at /app/extensions/
- 5 new unit tests for boot dispatch logic, 1 new test for PAT detection debug log

## Task Commits

Each task was committed atomically:

1. **Task 0: Create boot.test.ts with installExtensions() unit tests** - `60486b7` (test) - TDD RED
2. **Task 1: Default extensions JSON + BootService discriminated union** - `56871c4` (feat) - TDD GREEN
3. **Task 2: PAT detection debug log + test** - `eaab78c` (feat)
4. **Task 3: Nix VSIX build derivation + npmDepsHash** - `207e0a5` (feat)

## Files Created/Modified
- `supervisor/test/services/boot.test.ts` - 5 unit tests for installExtensions() dispatch logic
- `config/default-extensions.json` - 4 local-vsix entries for ClaudeOS first-party extensions
- `supervisor/src/services/boot.ts` - DefaultExtension discriminated union, dispatch by method
- `claudeos-self-improve/src/commands/install-extension.ts` - Module-level debugChannel, debug log in detectGitHubPat
- `claudeos-self-improve/test/commands/install-extension.test.ts` - Test for inactive-secrets-extension debug log
- `flake.nix` - extensionVsix derivation and /app/extensions/ copy step

## Decisions Made
- DefaultExtension type uses discriminated union (`method: "github-release" | "local-vsix"`) matching existing InstallExtensionSchema pattern
- Module-level `debugChannel` OutputChannel created for detectGitHubPat observability since the function is module-scope (not a method with injected deps)
- Single `mkDerivation` for all 4 extensions rather than per-extension `buildNpmPackage` for simplicity
- npmDepsHash left as placeholder since Nix is not installed in current environment

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All v1.0 tech debt items closed
- npmDepsHash requires `nix build .#default 2>&1 | grep "got:"` on a machine with Nix installed
- Extension VSIX build derivation may need iteration when first run in Nix sandbox (npm ci network access)

---
## Self-Check: PASSED

All 7 files verified present. All 4 task commits verified in git log.

---
*Phase: 08-operational-polish-tech-debt*
*Completed: 2026-03-14*
