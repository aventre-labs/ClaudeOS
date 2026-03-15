---
phase: 04-self-improvement
plan: 03
subsystem: extensions
tags: [mcp, stdio, claude-cli, skill-file, vscode-extension, esbuild]

# Dependency graph
requires:
  - phase: 04-self-improvement
    provides: SupervisorClient, ExtensionRecord types, extension scaffold, install command
provides:
  - MCP server with 4 tools (install, uninstall, list, template) via stdio transport
  - MCP registration/deregistration via claude CLI on activate/deactivate
  - Claude Code skill file at /data/config/claudeos-skill.md
  - Fully wired extension.ts with all Plan 01-03 outputs connected
affects: []

# Tech tracking
tech-stack:
  added: ["@types/node (devDependency)"]
  patterns: ["Extracted MCP tool handlers into testable tools.ts module", "ESM format for MCP server bundle (top-level await)", "Skill file written on activation with graceful failure"]

key-files:
  created:
    - claudeos-self-improve/mcp-server/src/index.ts
    - claudeos-self-improve/mcp-server/src/tools.ts
    - claudeos-self-improve/mcp-server/package.json
    - claudeos-self-improve/src/mcp/register.ts
    - claudeos-self-improve/src/skill/skill-content.ts
    - claudeos-self-improve/test/mcp-server/tools.test.ts
  modified:
    - claudeos-self-improve/src/extension.ts
    - claudeos-self-improve/esbuild.mjs
    - claudeos-self-improve/package.json

key-decisions:
  - "MCP server bundled as ESM (not CJS) for top-level await support"
  - "Tool logic extracted into tools.ts for direct testability without MCP SDK mocking"
  - "Skill file writes to /data/config/claudeos-skill.md with graceful failure in dev"

patterns-established:
  - "MCP tool handler extraction: pure async functions in tools.ts, registered in index.ts"
  - "ESM esbuild for MCP server entry point (overrides shared CJS config)"

requirements-completed: [IMP-06, IMP-07, IMP-08]

# Metrics
duration: 4min
completed: 2026-03-14
---

# Phase 4 Plan 3: MCP Server, Registration, Skill File, and Extension Wiring Summary

**MCP server with 4 tools (stdio transport), claude CLI registration lifecycle, Claude Code skill file, and fully wired extension.ts connecting all Plan 01-03 outputs**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-14T18:37:20Z
- **Completed:** 2026-03-14T18:41:17Z
- **Tasks:** 2 (Task 1 TDD: red + green)
- **Files modified:** 9

## Accomplishments
- MCP server with install_extension, uninstall_extension, list_extensions, get_extension_template tools delegating to supervisor API
- MCP registration via `claude mcp add-json` on activate, `claude mcp remove` on deactivate
- Skill file teaches Claude Code about ClaudeOS self-improvement capabilities
- extension.ts fully wired: OutputChannel, SupervisorClient, install command, MCP, skill file
- 39 total tests passing across all test suites, both entry points compile, VSIX packages

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for MCP tools** - `8ca7a06` (test)
2. **Task 1 (GREEN): MCP server with 4 tools** - `59cd572` (feat)
3. **Task 2: MCP registration, skill file, extension wiring** - `76b1ab8` (feat)

## Files Created/Modified
- `claudeos-self-improve/mcp-server/src/tools.ts` - 4 tool handler functions (install, uninstall, list, template)
- `claudeos-self-improve/mcp-server/src/index.ts` - MCP server entry point with stdio transport
- `claudeos-self-improve/mcp-server/package.json` - Minimal package for dependency tracking
- `claudeos-self-improve/src/mcp/register.ts` - MCP server register/deregister via claude CLI
- `claudeos-self-improve/src/skill/skill-content.ts` - Skill markdown content + writeSkillFile
- `claudeos-self-improve/src/extension.ts` - Full activation wiring (replaced skeleton)
- `claudeos-self-improve/test/mcp-server/tools.test.ts` - 12 unit tests for MCP tool handlers
- `claudeos-self-improve/esbuild.mjs` - MCP server build uses ESM format
- `claudeos-self-improve/package.json` - Added @types/node devDependency

## Decisions Made
- MCP server bundled as ESM (not CJS) because index.ts uses top-level await for server.connect()
- Tool logic extracted into separate tools.ts for testability; index.ts just registers them with McpServer
- Skill file path is /data/config/claudeos-skill.md; write fails gracefully in dev environments without /data mount

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Changed MCP server esbuild format to ESM**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** esbuild shared config uses CJS format, but MCP server index.ts uses top-level await which is not supported in CJS
- **Fix:** Added `format: "esm"` override to the MCP server build config in esbuild.mjs
- **Files modified:** claudeos-self-improve/esbuild.mjs
- **Verification:** `npm run compile` succeeds, out/mcp-server.js produced
- **Committed in:** 59cd572 (Task 1 GREEN commit)

**2. [Rule 3 - Blocking] Added @types/node devDependency**
- **Found during:** Task 2
- **Issue:** tsc --noEmit failed: Cannot find module 'node:child_process', 'node:util', 'node:path', 'node:fs/promises'
- **Fix:** `npm install --save-dev @types/node`
- **Files modified:** claudeos-self-improve/package.json, package-lock.json
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** 76b1ab8 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for build/type-check to succeed. No scope creep.

## Issues Encountered
None beyond the deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 4 is complete: all 3 plans delivered
- Self-improvement loop ready: MCP tools + skill file + install command + supervisor API
- Extension packages as .vsix for container deployment

## Self-Check: PASSED

All 6 created files verified on disk. All 3 commits (8ca7a06, 59cd572, 76b1ab8) verified in git log.

---
*Phase: 04-self-improvement*
*Completed: 2026-03-14*
