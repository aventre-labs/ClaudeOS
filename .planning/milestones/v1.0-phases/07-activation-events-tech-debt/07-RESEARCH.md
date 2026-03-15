# Phase 7: Activation Events & Tech Debt Hardening - Research

**Researched:** 2026-03-14
**Domain:** VS Code extension activation events, error guards, session lifecycle hardening
**Confidence:** HIGH

## Summary

Phase 7 is a hardening-only phase with no new features. All changes are documented in the v1.0 milestone audit with precise before/after states. The work spans three extensions (claudeos-sessions, claudeos-secrets, claudeos-self-improve) and involves five discrete fixes: two activation event additions, one error guard, one dedup guard, and one session exit notification enhancement.

Every fix follows existing patterns already established in the codebase. The activation event changes are JSON-only edits to package.json files. The error guard is a copy of an existing pattern from sibling functions. The dedup guard and notification changes are small additions to existing TypeScript files with clear integration points.

**Primary recommendation:** Treat each fix as an independent, atomic change. All five fixes are independent of each other and can be planned as a single plan with parallel tasks.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Add `onCommand:claudeos.sessions.create` and `onCommand:claudeos.sessions.openTerminal` to `claudeos-sessions/package.json` activationEvents array
- Add `onCommand:claudeos.secrets.openEditor` to `claudeos-secrets/package.json` activationEvents array
- Keep existing `onView:` triggers -- these are additive, not replacements
- Add `if (!res.ok)` guard in `handleList()` in `claudeos-self-improve/mcp-server/src/tools.ts`
- Match exact pattern from `handleInstall()` and `handleUninstall()`: check res.ok, read error as text, return error message string
- Return format: `"List failed: ${err}"` matching sibling handler convention
- Add guard in `notifySessionExit()` in `claudeos-sessions/src/terminal/terminal-manager.ts` to track which sessions have already been notified
- Use a Set<string> of already-exited session IDs to prevent repeated notifications
- Clear session from the set when terminal is disposed
- Add `vscode.window.showInformationMessage` call when session exits
- Message format: "Session '{name}' has ended"
- Update `updateTerminalName` call in `extension.ts` to include status prefix

### Claude's Discretion
- Exact notification message wording
- Whether to use bracket prefix "[Stopped]" or codicon prefix in terminal name
- Whether dedup Set needs periodic cleanup or if terminal disposal is sufficient
- npmDepsHash placeholder in flake.nix -- fix if straightforward, skip if requires Nix build environment

### Deferred Ideas (OUT OF SCOPE)
- npmDepsHash placeholder in flake.nix (Phase 1 tech debt) -- requires actual Nix build to generate correct hash, may not be fixable without build environment
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SES-01 | User can see all Claude Code sessions in sidebar tree view | Activation event fix ensures sessions extension activates when home page triggers session commands |
| TRM-01 | User can click session to open terminal tab | Activation event fix ensures openTerminal command works before sidebar is opened |
| HOM-01 | User sees welcome webview tab on startup | Activation events ensure home page session commands work regardless of sidebar state |
| HOM-03 | User can see recent sessions on home page | Same activation event fix as HOM-01 |
| HOM-04 | User can access shortcuts grid | Activation event fix for secrets ensures API key banner shortcut works before sidebar is opened |
| SEC-02 | User can add/edit/delete secrets via webview form | Activation event fix ensures openEditor command works before sidebar is opened |
| IMP-06 | MCP server exposes install/uninstall/list/template tools | Error guard fix for handleList() ensures list_extensions returns proper error messages |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vscode | ^1.85.0 | Extension API (activationEvents, showInformationMessage) | Target runtime |
| vitest | ^3.0.0 | Unit testing | Already used across all extensions |
| esbuild | ^0.27.0 | Build/bundle | Already configured per extension |

No new libraries are needed. All fixes use existing dependencies.

## Architecture Patterns

### Fix 1: Activation Events (package.json only)

**What:** Add `onCommand:` activation events alongside existing `onView:` events.

**Current state:**
```json
// claudeos-sessions/package.json
"activationEvents": ["onView:claudeos.sessions"]

// claudeos-secrets/package.json
"activationEvents": ["onView:claudeos.secrets"]
```

**Target state:**
```json
// claudeos-sessions/package.json
"activationEvents": [
  "onView:claudeos.sessions",
  "onCommand:claudeos.sessions.create",
  "onCommand:claudeos.sessions.openTerminal"
]

// claudeos-secrets/package.json
"activationEvents": [
  "onView:claudeos.secrets",
  "onCommand:claudeos.secrets.openEditor"
]
```

**Why this works:** VS Code activates an extension when ANY of its activationEvents match. Adding `onCommand:` events means the extension activates when a command is invoked from anywhere (home page, command palette) even if the sidebar view has not been opened yet. The `onView:` events remain for the existing sidebar-first activation path.

**Confidence:** HIGH -- this is documented VS Code behavior for lazy activation.

### Fix 2: MCP handleList() Error Guard

**What:** Add `if (!res.ok)` check before `res.json()` in `handleList()`.

**Current state (tools.ts line 61-65):**
```typescript
export async function handleList(): Promise<string> {
  const res = await fetch(`${SUPERVISOR_API}/extensions`);
  const extensions = await res.json();
  return JSON.stringify(extensions, null, 2);
}
```

**Target state:**
```typescript
export async function handleList(): Promise<string> {
  const res = await fetch(`${SUPERVISOR_API}/extensions`);
  if (!res.ok) {
    const err = await res.text();
    return `List failed: ${err}`;
  }
  const extensions = await res.json();
  return JSON.stringify(extensions, null, 2);
}
```

**Pattern source:** `handleInstall()` lines 32-35 and `handleUninstall()` lines 50-53 in the same file.

**Confidence:** HIGH -- direct copy of sibling pattern.

### Fix 3: Session Exit Dedup Guard

**What:** Add a `Set<string>` to `TerminalManager` to track sessions that have already fired exit notifications, preventing repeated calls.

**Current state (terminal-manager.ts line 121-126):**
```typescript
notifySessionExit(sessionId: string): void {
  const entry = this.terminals.get(sessionId);
  if (entry) {
    entry.pty.onSessionExit();
  }
}
```

**Target state:**
```typescript
private exitedSessions = new Set<string>();

notifySessionExit(sessionId: string): void {
  if (this.exitedSessions.has(sessionId)) return;
  const entry = this.terminals.get(sessionId);
  if (entry) {
    this.exitedSessions.add(sessionId);
    entry.pty.onSessionExit();
  }
}
```

**Cleanup:** Clear from set in `closeTerminal()` and `handleTerminalClose()` so session ID can be reused. Also clear in `dispose()`.

**Why repeated notifications happen:** The `storeChangeDisposable` in extension.ts (line 276) fires on every `onDidChange` event from SessionStore. Each poll/WS update re-evaluates all sessions, and sessions in "stopped"/"archived"/"zombie" status trigger `notifySessionExit` every time. Without a guard, the "[Session ended]" message is written repeatedly.

**Recommendation for cleanup:** Terminal disposal is sufficient -- no periodic cleanup needed. The set only grows by the number of sessions that exit during a single VS Code session, which is bounded.

**Confidence:** HIGH -- root cause and fix are clear from code inspection.

### Fix 4: Session Exit Notification Message

**What:** Add `vscode.window.showInformationMessage` in session exit flow.

**Integration point:** Inside `notifySessionExit()` in terminal-manager.ts (after the dedup guard), or in `onSessionExit()` in session-terminal.ts.

**Recommended approach:** Add the notification in `notifySessionExit()` in terminal-manager.ts since it has access to the session name via the entry. The pty's `onSessionExit()` does not have the session name.

**Implementation:**
```typescript
notifySessionExit(sessionId: string): void {
  if (this.exitedSessions.has(sessionId)) return;
  const entry = this.terminals.get(sessionId);
  if (entry) {
    this.exitedSessions.add(sessionId);
    entry.pty.onSessionExit();
    vscode.window.showInformationMessage(`Session '${entry.pty.sessionName}' has ended`);
  }
}
```

**Problem:** The pty does not currently expose the session name. The terminal entry does not store the session name either -- only the sessionId. The session name is available from the Terminal object's `name` property but that is not reliable since it could be the pty-updated name.

**Better approach:** Store session name in the TerminalEntry interface, or look it up from SessionStore. The TerminalManager constructor already receives `sessionStore`. Using `sessionStore.getSession(sessionId)?.name` would work if that method exists.

**Alternative:** Pass the session name to `notifySessionExit()` from the caller in extension.ts, since the caller already has the session object from the store iteration (line 277).

**Recommendation:** Change `notifySessionExit` signature to accept `sessionName: string` parameter. The caller in extension.ts (line 292) already has `session.name` available.

**Confidence:** HIGH -- straightforward addition.

### Fix 5: Terminal Name Status Prefix

**What:** Update terminal name to include status prefix when session status changes.

**Current state (extension.ts line 281-284):**
```typescript
terminalManager.updateTerminalName(
  session.id,
  `${session.name}`,  // No status prefix
);
```

**Target state:**
```typescript
const prefix = session.status === "stopped" || session.status === "archived" || session.status === "zombie"
  ? "[Stopped] "
  : "";
terminalManager.updateTerminalName(
  session.id,
  `${prefix}${session.name}`,
);
```

**Recommendation for prefix style:** Use `[Stopped]` bracket prefix. VS Code terminal tab names are plain text; codicon prefixes (`$(stop)`) are only supported in TreeItem labels, not in terminal names via `onDidChangeName`. Bracket prefix is the established pattern (already used for `[Session ended]` message in the terminal output).

**Confidence:** HIGH -- VS Code terminal name API is plain text only.

### Anti-Patterns to Avoid
- **Do not use `onStartupFinished`:** This was explicitly changed to lazy activation in Phase 2. The `onCommand:` triggers are additive to `onView:`, not replacements for lazy activation.
- **Do not add dedup at the pty level:** The dedup guard belongs in TerminalManager which is the single entry point. Adding it in SessionPseudoterminal would require the pty to track state it shouldn't own.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Activation timing | Custom activation logic | VS Code `activationEvents` in package.json | VS Code handles activation ordering natively |
| Dedup notification | Timer-based debounce | Simple Set<string> membership check | Debounce is wrong model; we want exactly-once, not rate-limited |

## Common Pitfalls

### Pitfall 1: Activation Events vs contributes.commands
**What goes wrong:** Assuming that listing a command in `contributes.commands` automatically activates the extension when that command is invoked.
**Why it happens:** `contributes.commands` registers the command in the command palette but does NOT activate the extension. Activation requires an explicit `activationEvents` entry.
**How to avoid:** Always add matching `onCommand:` entries in `activationEvents` for commands that may be invoked before the extension's view is opened.

### Pitfall 2: Dedup guard not cleared on terminal close
**What goes wrong:** If the dedup Set is not cleared when a terminal is closed/disposed, reopening a terminal for the same session after it was stopped would not re-trigger the exit notification if the session is still in stopped state.
**Why it happens:** The session ID persists even after terminal disposal.
**How to avoid:** Clear the session ID from the exitedSessions set in both `closeTerminal()` and `handleTerminalClose()`.

### Pitfall 3: showInformationMessage in rapid succession
**What goes wrong:** Multiple sessions exiting at the same time could flood the user with notification toasts.
**Why it happens:** VS Code stacks information messages.
**How to avoid:** The dedup guard prevents repeated notifications per session. Multiple distinct sessions exiting simultaneously is rare and acceptable.

## Code Examples

### Activation Events (package.json edit)
```json
// Source: VS Code Extension Manifest documentation
// claudeos-sessions/package.json
"activationEvents": [
  "onView:claudeos.sessions",
  "onCommand:claudeos.sessions.create",
  "onCommand:claudeos.sessions.openTerminal"
]
```

### Error Guard Pattern (existing in codebase)
```typescript
// Source: claudeos-self-improve/mcp-server/src/tools.ts lines 32-35
if (!res.ok) {
  const err = await res.text();
  return `Install failed: ${err}`;
}
```

### Dedup Guard Pattern
```typescript
// New code for terminal-manager.ts
private exitedSessions = new Set<string>();

notifySessionExit(sessionId: string, sessionName?: string): void {
  if (this.exitedSessions.has(sessionId)) return;
  const entry = this.terminals.get(sessionId);
  if (entry) {
    this.exitedSessions.add(sessionId);
    entry.pty.onSessionExit();
    const name = sessionName ?? sessionId;
    vscode.window.showInformationMessage(`Session '${name}' has ended`);
  }
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.0 |
| Config file | vitest.config.ts per extension (claudeos-sessions, claudeos-self-improve) |
| Quick run command | `cd claudeos-sessions && npx vitest run` / `cd claudeos-self-improve && npx vitest run` |
| Full suite command | `cd claudeos-sessions && npx vitest run && cd ../claudeos-self-improve && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SES-01 / TRM-01 / HOM-01 / HOM-03 | activationEvents includes onCommand triggers | manual-only | Verify package.json contents | N/A (JSON check) |
| SEC-02 / HOM-04 | secrets activationEvents includes onCommand trigger | manual-only | Verify package.json contents | N/A (JSON check) |
| IMP-06 | handleList returns error message on non-ok response | unit | `cd claudeos-self-improve && npx vitest run test/mcp-server/tools.test.ts` | Exists (needs new test case) |
| SES-01 (dedup) | notifySessionExit fires only once per session | unit | `cd claudeos-sessions && npx vitest run test/terminal/terminal-manager.test.ts` | Exists (needs new test case) |
| SES-01 (notification) | showInformationMessage called on session exit | unit | `cd claudeos-sessions && npx vitest run test/terminal/terminal-manager.test.ts` | Exists (needs new test case) |

### Sampling Rate
- **Per task commit:** `npx vitest run` in affected extension
- **Per wave merge:** Both extension test suites
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `claudeos-self-improve/test/mcp-server/tools.test.ts` -- add test for handleList error case (res.ok = false)
- [ ] `claudeos-sessions/test/terminal/terminal-manager.test.ts` -- add test for dedup guard (notifySessionExit called twice, pty.onSessionExit called once)
- [ ] `claudeos-sessions/test/terminal/terminal-manager.test.ts` -- add test for showInformationMessage on exit

*(Activation event changes are JSON-only and verified by inspection, not unit tests)*

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `claudeos-self-improve/mcp-server/src/tools.ts` -- handleInstall/handleUninstall error guard pattern
- Codebase inspection: `claudeos-sessions/src/terminal/terminal-manager.ts` -- notifySessionExit current implementation
- Codebase inspection: `claudeos-sessions/src/extension.ts` -- status change handler loop (lines 276-296)
- Codebase inspection: `claudeos-sessions/package.json` -- current activationEvents
- Codebase inspection: `claudeos-secrets/package.json` -- current activationEvents
- `.planning/v1.0-MILESTONE-AUDIT.md` -- complete list of gaps and tech debt items

### Secondary (MEDIUM confidence)
- VS Code activationEvents documentation -- `onCommand:` triggers extension activation on command invocation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing dependencies
- Architecture: HIGH -- all fixes follow existing codebase patterns
- Pitfalls: HIGH -- identified from direct code inspection of actual bug triggers

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable codebase, no external dependency changes)
