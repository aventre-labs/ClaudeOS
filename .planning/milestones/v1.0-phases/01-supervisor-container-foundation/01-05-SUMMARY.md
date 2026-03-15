---
phase: 01-supervisor-container-foundation
plan: 05
subsystem: infra
tags: [vscode-extension, template, esbuild, vsce, typescript, mcp]

# Dependency graph
requires: []
provides:
  - Complete VS Code extension template scaffold with build chain
  - AGENTS.md documenting full supervisor API contract for extension developers
  - README.md with quick start and development workflow
  - webview/ and mcp-server/ optional directory placeholders
affects: [02-session-management, 03-platform-services, 04-self-improvement]

# Tech tracking
tech-stack:
  added: [esbuild, "@vscode/vsce", vitest, "@types/vscode"]
  patterns: [esbuild-bundled-extension, vsce-no-dependencies-packaging, supervisor-api-fetch-pattern]

key-files:
  created:
    - extension-template/package.json
    - extension-template/tsconfig.json
    - extension-template/src/extension.ts
    - extension-template/AGENTS.md
    - extension-template/README.md
    - extension-template/.vscodeignore
    - extension-template/.gitignore
    - extension-template/webview/.gitkeep
    - extension-template/mcp-server/.gitkeep
  modified: []

key-decisions:
  - "Used lowercase kebab-case placeholder names (extension-name) instead of UPPER_CASE (EXTENSION_NAME) because vsce rejects non-lowercase extension names"

patterns-established:
  - "Extension naming: claudeos-{name} for package name, ClaudeOS {Name} for display name"
  - "Build chain: esbuild for bundling, vsce --no-dependencies for packaging, vitest for testing"
  - "Supervisor API communication: fetch() to localhost:3100/api/v1, WebSocket for real-time events"
  - "Data storage: /data/extensions/{extension-name}/ on persistent volume"
  - "MCP server: separate process in mcp-server/ directory using @modelcontextprotocol/sdk"

requirements-completed: [TPL-01, TPL-02, TPL-03, TPL-04]

# Metrics
duration: 4min
completed: 2026-03-12
---

# Phase 1 Plan 5: Extension Template Summary

**Buildable VS Code extension scaffold with esbuild bundling, vsce packaging, and 269-line AGENTS.md documenting the full supervisor API contract**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-12T07:17:46Z
- **Completed:** 2026-03-12T07:22:09Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Complete extension template that compiles with `npm run compile` and packages with `npm run package` to produce a working .vsix file
- Comprehensive AGENTS.md (269 lines) documenting kernel principles, full supervisor API contract, extension development patterns, MCP server pattern, and GitHub Actions CI
- README.md with quick start, scripts reference, project structure, local testing, and release workflow
- Optional webview/ and mcp-server/ directories for extensions that need UI or Claude Code tool integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Create extension template scaffold with all files** - `f2896e9` (feat)
2. **Task 2: Write AGENTS.md and README.md** - `f0aa3b3` (docs)

**Plan metadata:** `074b775` (docs: complete extension template plan)

## Files Created/Modified
- `extension-template/package.json` - VS Code extension manifest with compile, watch, package, test, lint scripts
- `extension-template/tsconfig.json` - TypeScript config targeting ES2022 with Node16 module resolution
- `extension-template/src/extension.ts` - Extension entry point with activate/deactivate and supervisor API constant
- `extension-template/AGENTS.md` - 269-line AI agent guide: kernel principles, supervisor API, patterns, MCP, CI
- `extension-template/README.md` - Developer-facing quick start and workflow documentation
- `extension-template/.vscodeignore` - Excludes source/config from VSIX, includes only compiled output
- `extension-template/.gitignore` - Ignores out/, node_modules/, *.vsix, .vscode-test/
- `extension-template/webview/.gitkeep` - Optional webview directory placeholder
- `extension-template/mcp-server/.gitkeep` - Optional MCP server directory placeholder

## Decisions Made
- Used lowercase kebab-case placeholder names (`extension-name`) instead of UPPER_CASE (`EXTENSION_NAME`) because vsce validates extension names and rejects non-lowercase characters. The plan specified uppercase placeholders, but these prevent the template from building and packaging successfully.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed extension name casing for vsce compatibility**
- **Found during:** Task 1 (extension template scaffold)
- **Issue:** Plan specified `EXTENSION_NAME` as the placeholder in package.json, but vsce rejects extension names containing uppercase letters or underscores
- **Fix:** Changed to lowercase kebab-case `extension-name` as the placeholder throughout package.json and src/extension.ts. Added TODO comment in extension.ts for clarity.
- **Files modified:** extension-template/package.json, extension-template/src/extension.ts
- **Verification:** `npm run package` now produces .vsix successfully
- **Committed in:** f2896e9 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for the build chain to work. The template still clearly indicates placeholder names for replacement.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Extension template scaffold is complete and ready to push as aventre-labs/claudeos-extension-template
- AGENTS.md documents the supervisor API contract that Plans 01-02 and 01-03 implement
- All future extensions (sessions sidebar, secrets manager, extension manager) will be scaffolded from this template
- Phase 2 extensions will use the patterns and API contract documented in AGENTS.md

## Self-Check: PASSED

All 10 created files verified present. Both task commits (f2896e9, f0aa3b3) verified in git log.

---
*Phase: 01-supervisor-container-foundation*
*Completed: 2026-03-12*
