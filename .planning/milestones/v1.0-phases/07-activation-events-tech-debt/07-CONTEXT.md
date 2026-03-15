# Phase 7: Activation Events & Tech Debt Hardening - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Close all non-critical integration gaps (lazy activation edge cases), add missing error guards, and fix accumulated tech debt across phases 1-4. Every fix is documented in the v1.0 milestone audit with specific before/after states. No new features, no new UI — hardening only.

</domain>

<decisions>
## Implementation Decisions

### Activation event gaps (INT-01, INT-02)
- Add `onCommand:claudeos.sessions.create` and `onCommand:claudeos.sessions.openTerminal` to `claudeos-sessions/package.json` activationEvents array
- Add `onCommand:claudeos.secrets.openEditor` to `claudeos-secrets/package.json` activationEvents array
- Keep existing `onView:` triggers — these are additive, not replacements
- Fix ensures home page commands work before sidebar is opened

### MCP handleList error guard (INT-03)
- Add `if (!res.ok)` guard in `handleList()` in `claudeos-self-improve/mcp-server/src/tools.ts`
- Match exact pattern from `handleInstall()` and `handleUninstall()`: check res.ok, read error as text, return error message string
- Return format: `"List failed: ${err}"` matching sibling handler convention

### Session exit dedup guard
- Add guard in `notifySessionExit()` in `claudeos-sessions/src/terminal/terminal-manager.ts` to track which sessions have already been notified
- Use a Set<string> of already-exited session IDs to prevent repeated notifications
- Clear session from the set when terminal is disposed

### Session exit notification and terminal name
- Add `vscode.window.showInformationMessage` call when session exits (as originally planned in Phase 2)
- Message format: "Session '{name}' has ended"
- Update `updateTerminalName` call in `extension.ts` to include status prefix (e.g., "[Stopped] My Session")
- Both changes are in `claudeos-sessions` — onSessionExit in session-terminal.ts and status handler in extension.ts

### Claude's Discretion
- Exact notification message wording
- Whether to use bracket prefix "[Stopped]" or codicon prefix in terminal name
- Whether dedup Set needs periodic cleanup or if terminal disposal is sufficient
- npmDepsHash placeholder in flake.nix — fix if straightforward, skip if requires Nix build environment

</decisions>

<specifics>
## Specific Ideas

No specific requirements — all fixes are documented in the v1.0 milestone audit with clear remediation steps. Apply fixes exactly as documented.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `claudeos-self-improve/mcp-server/src/tools.ts` lines 32-35: `handleInstall()` res.ok guard pattern — copy for handleList
- `claudeos-sessions/src/terminal/terminal-manager.ts`: existing notifySessionExit at lines 121-126
- `claudeos-sessions/src/terminal/session-terminal.ts`: existing onSessionExit at lines 123-125
- `claudeos-sessions/src/extension.ts`: status change handler at lines 280-293

### Established Patterns
- `onView:` activation in package.json — supplement with `onCommand:` triggers
- Error guard pattern: `if (!res.ok) { const err = await res.text(); return \`Failed: ${err}\`; }`
- `vscode.window.showInformationMessage` for user notifications (used elsewhere in session management)
- Terminal name set via `updateTerminalName(sessionId, name)` in terminal-manager.ts

### Integration Points
- `claudeos-sessions/package.json` activationEvents array
- `claudeos-secrets/package.json` activationEvents array
- `claudeos-self-improve/mcp-server/src/tools.ts` handleList function
- `claudeos-sessions/src/terminal/terminal-manager.ts` notifySessionExit
- `claudeos-sessions/src/terminal/session-terminal.ts` onSessionExit
- `claudeos-sessions/src/extension.ts` session status change handler

</code_context>

<deferred>
## Deferred Ideas

- npmDepsHash placeholder in flake.nix (Phase 1 tech debt) — requires actual Nix build to generate correct hash, may not be fixable without build environment

</deferred>

---

*Phase: 07-activation-events-tech-debt*
*Context gathered: 2026-03-14*
