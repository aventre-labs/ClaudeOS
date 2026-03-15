---
phase: 02-session-management
plan: 03
subsystem: ui, terminal
tags: [vscode-extension, pseudoterminal, terminal-manager, extension-wiring, esbuild, vsce, vitest]

# Dependency graph
requires:
  - phase: 02-session-management
    provides: SupervisorClient, WsClient, SessionStore, SessionTreeProvider, TreeItem factories, package.json contributes manifest
provides:
  - "SessionPseudoterminal: Pseudoterminal proxying I/O to tmux session via supervisor with input buffering and backspace handling"
  - "TerminalManager: terminal lifecycle manager tracking open terminals, preventing duplicates, handling close cleanup"
  - "extension.ts activate/deactivate: full wiring of supervisor clients, session store, tree provider, terminal manager, 9 command handlers, status change flow"
  - "Complete claudeos-sessions extension: compiles, bundles (151.5kb), packages to .vsix (60KB, 25 files)"
affects: [03-01-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [pseudoterminal-input-buffering, terminal-manager-dedup, extension-activate-wiring, output-channel-logging]

key-files:
  created:
    - "claudeos-sessions/src/terminal/session-terminal.ts"
    - "claudeos-sessions/src/terminal/terminal-manager.ts"
    - "claudeos-sessions/test/terminal/session-terminal.test.ts"
    - "claudeos-sessions/test/terminal/terminal-manager.test.ts"
  modified:
    - "claudeos-sessions/src/extension.ts"
    - "claudeos-sessions/test/__mocks__/vscode.ts"

key-decisions:
  - "Input buffering with line-at-a-time flush: handleInput buffers keystrokes and sends on Enter, matching Claude Code's line-based input expectation"
  - "Session exit keeps terminal open: onSessionExit writes end message but does not fire closeEmitter, preserving scrollback for user review"
  - "OutputChannel (ClaudeOS Sessions) for debug logging in all command handlers, separate from user-facing error toasts"

patterns-established:
  - "Pseudoterminal input buffering: buffer characters, echo locally, flush on Enter to supervisor sendInput"
  - "Terminal dedup pattern: TerminalManager checks Map before creating, focuses existing terminal on repeat open"
  - "Extension wiring pattern: activate creates all services, registers all commands with error-handling wrappers, pushes disposables to subscriptions"
  - "Status change flow: sessionStore.onDidChange triggers terminal name updates and session exit notifications"

requirements-completed: [TRM-01, TRM-02, TRM-03, TRM-04, SES-04, SES-02, SES-07]

# Metrics
duration: 15min
completed: 2026-03-12
---

# Phase 2 Plan 3: Terminal Tabs and Extension Wiring Summary

**SessionPseudoterminal with input buffering, TerminalManager with dedup, full extension.ts wiring of 9 commands, and verified .vsix packaging**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-12T09:24:00Z
- **Completed:** 2026-03-12T09:39:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- SessionPseudoterminal implements VS Code Pseudoterminal interface with input buffering (line-at-a-time flush), backspace handling, Ctrl+C support, and WebSocket output subscription
- TerminalManager tracks open terminals in a Map, prevents duplicate tabs for the same session, handles tab close cleanup, and supports terminal name updates
- extension.ts fully wired: creates SupervisorClient, WsClient, SessionStore, SessionTreeProvider, TerminalManager; registers 9 commands (create, rename, openTerminal, stop, kill, archive, delete, revive, refresh); wires status change flow to terminal updates
- Complete build pipeline verified: TypeScript compiles cleanly, esbuild bundles to 151.5kb, vsce packages to .vsix (60KB, 25 files), 121 extension tests pass, 120 supervisor tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Build SessionPseudoterminal and TerminalManager** - `386c79a` (test), `aeaf866` (feat)
2. **Task 2: Wire extension.ts with all commands, providers, and lifecycle** - `cee7ae6` (feat)
3. **Task 3: Verify complete sessions extension builds and packages correctly** - checkpoint (human-verify, approved)

_Note: TDD Task 1 has separate test and implementation commits. Task 3 was a verification checkpoint with no code changes._

## Files Created/Modified
- `claudeos-sessions/src/terminal/session-terminal.ts` - SessionPseudoterminal with input buffering, backspace, Ctrl+C, WebSocket output subscription, session exit handling
- `claudeos-sessions/src/terminal/terminal-manager.ts` - TerminalManager with open/focus/close, dedup Map, onDidCloseTerminal cleanup, name update propagation
- `claudeos-sessions/src/extension.ts` - Full activate/deactivate: service creation, 9 command registrations, status change wiring, OutputChannel logging, disposable tracking
- `claudeos-sessions/test/terminal/session-terminal.test.ts` - 18 tests for Pseudoterminal (open, input buffering, backspace, Ctrl+C, close, name update, session exit)
- `claudeos-sessions/test/terminal/terminal-manager.test.ts` - 10 tests for TerminalManager (open, dedup focus, close, tab close cleanup, name update)
- `claudeos-sessions/test/__mocks__/vscode.ts` - Added OutputChannel mock for extension.ts logging tests

## Decisions Made
- Input buffering with line-at-a-time flush: handleInput buffers keystrokes and sends complete lines on Enter, matching Claude Code's expectation for line-based input via tmux send-keys
- Session exit keeps terminal open: onSessionExit writes "[Session ended]" message but does not fire onDidClose, so users can scroll back and review output
- OutputChannel ("ClaudeOS Sessions") used for debug logging in all command error handlers, keeping debug output separate from user-facing error toasts via showErrorMessage
- Verification checkpoint confirmed complete build: TypeScript, esbuild, vsce, and all tests pass across both packages

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 2 is fully complete: all 3 plans delivered, all 13 requirements (SES-01 through SES-09, TRM-01 through TRM-04) implemented
- claudeos-sessions extension builds and packages into a .vsix ready for installation in code-server
- Phase 3 (Platform Services) can begin: extension architecture established, supervisor API complete, session management fully functional

## Self-Check: PASSED

All 7 key files verified on disk. All 3 task commits (386c79a, aeaf866, cee7ae6) found in git log.

---
*Phase: 02-session-management*
*Completed: 2026-03-12*
