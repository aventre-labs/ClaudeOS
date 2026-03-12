# Phase 2: Session Management - Research

**Researched:** 2026-03-12
**Domain:** VS Code extension API (TreeView, Terminal, WebSocket client), code-server compatibility
**Confidence:** HIGH

## Summary

Phase 2 builds two VS Code extensions -- a sessions sidebar (TreeView) and terminal tabs (Pseudoterminal) -- on top of the Phase 1 supervisor API (localhost:3100). The core technical challenge is real-time UI updates: the TreeView must reflect session status changes pushed via WebSocket, terminal tabs must proxy I/O to tmux sessions, and both must share state about which sessions are open, read/unread, etc.

The VS Code extension API provides all the primitives needed. `TreeDataProvider` with `onDidChangeTreeData` handles the sidebar, `Pseudoterminal` with `onDidWrite`/`handleInput`/`onDidChangeName` handles terminal tabs with dynamic name updates, and the `ws` library provides the WebSocket client. The key architectural insight is that both extensions should share a single WebSocket connection to the supervisor, managed by the sessions extension and exposed as a VS Code API surface for the terminal extension to consume.

One critical finding: `TreeItem` does NOT have a per-item `badge` property. The `badge` (ViewBadge) exists only on the `TreeView` container level. For per-session "waiting" indicators, we must use the `description` field or icon changes (ThemeIcon with color). The TreeItemLabel `highlights` array can approximate bold text for unread sessions. The "notification badge on waiting sessions" requirement (SES-08) should use the view-level badge to show total count of waiting sessions, while individual waiting sessions use the `$(question)` icon with a yellow ThemeColor.

**Primary recommendation:** Build as two extensions sharing a common `supervisor-client` library (npm workspace or shared source). The sessions extension owns the WebSocket connection and session state, exposing it via VS Code commands/events. The terminal extension consumes that state. Use Pseudoterminal (not raw createTerminal with shellPath) to proxy tmux I/O through the supervisor API, enabling full control over tab naming, icons, and input handling.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Sessions grouped by status: Active, Idle, Waiting, Stopped -- as expandable tree sections
- Archive and Zombie sections at the bottom, collapsed by default
- Badge count on collapsed Archive/Zombie headers showing number of items inside
- Sessions sorted most-recent-first within each status group
- Sidebar auto-refreshes in real-time via WebSocket connection to supervisor (event-driven, no polling)
- Sessions move between groups automatically as their status changes
- Single-click a session opens/focuses its terminal tab (direct path to interaction)
- Right-click context menu with full actions: Rename, Open Terminal, Stop, Kill, Archive, Delete -- with separators
- Context menu actions filtered by session status (e.g., can't stop an archived session; Revive shown only for archived/zombie)
- '+' button in sidebar title bar toolbar to create new session -- click opens inline input for optional session name, creates immediately
- Rename supported both via context menu and F2 keyboard shortcut (inline rename in tree view)
- Use VS Code's built-in terminal API (vscode.window.createTerminal) to attach to tmux sessions -- full native terminal emulation
- One tab per session -- clicking an already-open session focuses the existing tab instead of opening a duplicate
- When a session exits while tab is open: tab stays open showing final output AND notification toast appears ("Session X has ended")
- Tab title shows session name + status icon (e.g., "My Session" with codicon matching status)
- Status icon in tab title updates in real-time as session status changes
- Status icons use VS Code built-in codicons: $(sync~spin) for active, $(debug-pause) for idle, $(question) for waiting, $(stop-circle) for stopped
- Notification badge on waiting sessions using VS Code TreeItem.badge API -- shows count badge (e.g., "1" when waiting for input)
- Read/unread state: session is "unread" (bold) when it has new terminal output since the user last focused its terminal tab; fading gray gradient (gray-400 to gray-600) for read sessions based on recency
- Zombie sessions displayed with red dot + session name + last known time (e.g., "red-dot My Session -- 3h ago")
- Archived sessions show with archive-style icon, name, and archived date
- Terminal tabs should feel native -- using VS Code terminal API means copy/paste, keyboard shortcuts, and themes all work out of the box
- The sidebar should feel "alive" -- sessions moving between groups in real-time via WebSocket gives a dashboard feel
- Phase 1 decided event-driven architecture over polling -- this phase must honor that by using the WebSocket for all status updates

### Claude's Discretion
- Exact codicon choices for archive/zombie status indicators
- Keyboard shortcuts beyond F2 rename (if any)
- Empty state when no sessions exist (sidebar message/illustration)
- Error handling and retry behavior for supervisor API calls
- WebSocket reconnection strategy if connection drops

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SES-01 | User can see all Claude Code sessions in a sidebar tree view grouped by status (active, idle, waiting) | TreeDataProvider with status-group parent nodes; onDidChangeTreeData for refresh; TreeItemCollapsibleState.Expanded for status groups |
| SES-02 | User can create a new session from the sidebar with optional name and initial prompt | view/title menu with '+' icon; vscode.window.showInputBox for name; POST /api/v1/sessions |
| SES-03 | User can see status indicators on each session (spinning for active, pause for idle, question mark for waiting) | ThemeIcon with codicon IDs: sync~spin, debug-pause, question; ThemeColor for emphasis |
| SES-04 | User can rename, archive, or delete sessions via context menu | view/item/context menus with viewItem-based when clauses; PATCH /sessions/:id for rename (new endpoint needed); POST /sessions/:id/archive; DELETE /sessions/:id |
| SES-05 | User can see archived sessions in a collapsible section at the bottom of the sidebar | Separate tree group node with TreeItemCollapsibleState.Collapsed; description shows item count |
| SES-06 | User can see zombie sessions marked with a red dot | ThemeIcon with error color + description showing time ago; zombie group at bottom of sidebar |
| SES-07 | User can revive a zombie or archived session by sending input to it | Context menu "Revive" action; POST /sessions/:id/revive; refresh tree on completion |
| SES-08 | User can see notification badges on sessions waiting for user input | TreeView.badge (ViewBadge) showing total waiting count; individual sessions use $(question) ThemeIcon |
| SES-09 | Session names display bold for unread, fading gray for read sessions | TreeItemLabel.highlights for bold (unread); ThemeColor on description for gray gradient based on recency |
| TRM-01 | User can click a session to open a terminal tab attached to that session's tmux window | TreeItem.command triggers terminal open; Pseudoterminal proxying I/O via supervisor API |
| TRM-02 | User can have multiple terminal tabs open simultaneously | Map<sessionId, Terminal> tracking open terminals; each Pseudoterminal independent |
| TRM-03 | User can type directly in terminal to send input to Claude Code | Pseudoterminal.handleInput sends to POST /sessions/:id/input; onDidWrite renders output from WebSocket |
| TRM-04 | Terminal tabs show session name and status icon | ExtensionTerminalOptions.name + iconPath with ThemeIcon; onDidChangeName for dynamic updates |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @types/vscode | ^1.85.0 | VS Code extension API types | Already in extension-template; matches code-server engine version |
| ws | ^8.x | WebSocket client for supervisor connection | Already used by supervisor (@fastify/websocket depends on ws); Node.js native WebSocket (Node 22) exists but ws is more mature for reconnection patterns |
| esbuild | ^0.27.0 | Bundle extension TypeScript to CJS | Already in extension-template; externals only vscode |
| vitest | ^4.0.0 | Unit testing | Already in extension-template and supervisor |
| typescript | ~5.8.0 | Type checking | Already in extension-template |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vscode/vsce | ^3.7.0 | Package VSIX for deployment | Already in extension-template; used at build time only |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ws library | Node 22 built-in WebSocket | Node's built-in WebSocket lacks auto-reconnect, event typing; ws is already a transitive dep |
| Pseudoterminal | TerminalOptions with shellPath="tmux attach" | shellPath approach means no control over tab name updates or icon changes; Pseudoterminal gives full control |
| Two separate extensions | Single monolith extension | Two extensions match the requirement IDs (SES-* vs TRM-*) but adds complexity; recommend single extension with clear internal module separation |

**Installation:**
```bash
# No additional npm packages needed beyond extension-template defaults
# ws is bundled by esbuild from node_modules
npm install ws @types/ws
```

## Architecture Patterns

### Recommended Project Structure

The sessions and terminal functionality should ship as a **single extension** (`claudeos-sessions`) rather than two separate extensions. Rationale: they share the WebSocket connection, session state, and the "click to open terminal" interaction is a single atomic action. Two extensions would require an inter-extension API that adds complexity without user benefit.

```
claudeos-sessions/
  package.json           # Extension manifest with contributes (views, commands, menus)
  tsconfig.json
  vitest.config.ts
  src/
    extension.ts          # activate/deactivate, register providers and commands
    supervisor/
      client.ts           # HTTP client for supervisor REST API
      ws-client.ts        # WebSocket client with auto-reconnect
      types.ts            # Mirror of supervisor types (Session, SessionStatus, WsMessage)
    sidebar/
      session-tree.ts     # TreeDataProvider implementation
      session-item.ts     # TreeItem factory (icons, labels, context values)
      group-item.ts       # Status group parent nodes (Active, Idle, etc.)
    terminal/
      session-terminal.ts # Pseudoterminal implementation per session
      terminal-manager.ts # Map<sessionId, Terminal>, focus/create logic
    state/
      session-store.ts    # In-memory session state, read/unread tracking
  test/
    supervisor/
      client.test.ts
      ws-client.test.ts
    sidebar/
      session-tree.test.ts
    terminal/
      session-terminal.test.ts
    state/
      session-store.test.ts
  out/
    extension.js          # esbuild output
```

### Pattern 1: TreeDataProvider with Status Groups

**What:** Hierarchical tree with status groups as parent nodes, sessions as children.
**When to use:** Whenever displaying grouped lists in VS Code sidebar.

```typescript
// Source: VS Code TreeView API docs + @types/vscode
import * as vscode from 'vscode';

type StatusGroup = 'active' | 'idle' | 'waiting' | 'stopped' | 'archived' | 'zombie';

class SessionTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getChildren(element?: TreeElement): TreeElement[] {
    if (!element) {
      // Root level: return status group nodes
      return this.getStatusGroups();
    }
    if (element.type === 'group') {
      // Group level: return sessions in this status
      return this.getSessionsForGroup(element.status);
    }
    return []; // Sessions have no children
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    if (element.type === 'group') {
      return this.createGroupItem(element);
    }
    return this.createSessionItem(element);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}
```

### Pattern 2: Pseudoterminal for tmux I/O Proxy

**What:** Custom terminal that proxies input/output through the supervisor API instead of spawning a local shell.
**When to use:** When terminal content comes from a remote/managed process rather than a local shell.

```typescript
// Source: VS Code Pseudoterminal API + @types/vscode
import * as vscode from 'vscode';

class SessionPseudoterminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<number | void>();
  private nameEmitter = new vscode.EventEmitter<string>();

  onDidWrite = this.writeEmitter.event;
  onDidClose = this.closeEmitter.event;
  onDidChangeName = this.nameEmitter.event;

  constructor(
    private sessionId: string,
    private supervisorClient: SupervisorClient,
    private wsClient: WsClient,
  ) {}

  async open(): Promise<void> {
    // Subscribe to session output via WebSocket
    this.wsClient.subscribe(this.sessionId);
    this.wsClient.onOutput(this.sessionId, (data) => {
      this.writeEmitter.fire(data);
    });

    // Load existing output (scrollback)
    const output = await this.supervisorClient.getOutput(this.sessionId, true);
    if (output) {
      this.writeEmitter.fire(output);
    }
  }

  handleInput(data: string): void {
    // Forward keystrokes to supervisor which sends to tmux
    this.supervisorClient.sendInput(this.sessionId, data);
  }

  close(): void {
    this.wsClient.unsubscribe(this.sessionId);
  }

  // Called by terminal manager when session status changes
  updateName(name: string): void {
    this.nameEmitter.fire(name);
  }
}
```

### Pattern 3: WebSocket Client with Auto-Reconnect

**What:** Resilient WebSocket connection that reconnects on drop with exponential backoff.
**When to use:** Any persistent connection to the supervisor.

```typescript
// Source: ws library docs + common WebSocket patterns
import WebSocket from 'ws';

class WsClient {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private handlers = new Map<string, Set<(data: string) => void>>();

  connect(url: string): void {
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.reconnectDelay = 1000; // Reset on successful connect
      // Re-subscribe to all sessions
      for (const sessionId of this.handlers.keys()) {
        this.ws?.send(JSON.stringify({ type: 'subscribe', sessionId }));
      }
    });

    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'status') {
        this.emit('status', msg);
      } else if (msg.type === 'output') {
        const handlers = this.handlers.get(msg.sessionId);
        handlers?.forEach(h => h(msg.data));
      }
    });

    this.ws.on('close', () => {
      setTimeout(() => this.connect(url), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    });
  }
}
```

### Pattern 4: Context Value for Status-Filtered Menus

**What:** Use `contextValue` on TreeItems to control which context menu actions appear.
**When to use:** When different tree items need different available actions.

```json
{
  "contributes": {
    "menus": {
      "view/item/context": [
        {
          "command": "claudeos.sessions.stop",
          "when": "viewItem =~ /session\\.(active|idle|waiting)/",
          "group": "2_lifecycle"
        },
        {
          "command": "claudeos.sessions.revive",
          "when": "viewItem =~ /session\\.(archived|zombie)/",
          "group": "2_lifecycle"
        },
        {
          "command": "claudeos.sessions.archive",
          "when": "viewItem =~ /session\\.(active|idle|waiting|stopped)/",
          "group": "3_manage"
        },
        {
          "command": "claudeos.sessions.delete",
          "when": "viewItem =~ /session\\./",
          "group": "4_danger"
        }
      ]
    }
  }
}
```

The `contextValue` on each session TreeItem is set to `session.{status}` (e.g., `session.active`, `session.archived`). The `when` clause uses regex matching (`=~`) to show/hide actions based on status.

### Anti-Patterns to Avoid

- **Polling the REST API for status updates:** The supervisor already provides WebSocket push. Polling wastes resources and adds latency. ALL status updates must come through the WebSocket.
- **Creating a new WebSocket per terminal tab:** One WebSocket connection should serve the entire extension. Subscribe/unsubscribe messages manage per-session output delivery.
- **Using TerminalOptions.shellPath to run tmux attach:** This bypasses the supervisor API, creates a direct tmux dependency in the extension (won't work if supervisor is remote in the future), and prevents dynamic name/icon updates. Use Pseudoterminal instead.
- **Storing session state in extension globalState:** Session state belongs in the supervisor. The extension should be a thin client that caches state in memory and refreshes from the supervisor on activation.
- **Separate sessions and terminal extensions:** The overhead of inter-extension communication (API registration, dependency declarations, activation order) outweighs the modularity benefit for this tightly coupled functionality.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket reconnection | Custom retry loops with setTimeout | ws library + structured reconnect class | Edge cases: buffered messages during reconnect, subscription replay, backoff jitter |
| Terminal emulation | Custom ANSI parser/renderer | VS Code Pseudoterminal API | VS Code's terminal handles ANSI codes, mouse events, clipboard, accessibility, themes natively |
| Icon rendering | Custom SVG icons | VS Code codicon ThemeIcons | Codicons are built-in, theme-aware, and support animation (sync~spin) |
| Tree view UI | Custom webview with HTML tree | VS Code TreeDataProvider | Native tree view handles keyboard navigation, accessibility, drag-drop, context menus |
| HTTP client | Raw fetch with error handling | Thin wrapper class with typed methods | Centralize base URL, error handling, timeouts in one place |

**Key insight:** VS Code extensions should leverage the platform's built-in UI components (TreeView, Terminal, commands, menus) rather than building custom webviews. The extension API provides the exact primitives this phase needs.

## Common Pitfalls

### Pitfall 1: TreeView Badge is View-Level, Not Item-Level
**What goes wrong:** Developers assume `badge` exists on `TreeItem` for per-item notification counts. It does not.
**Why it happens:** The CONTEXT.md mentions "notification badge on waiting sessions using VS Code TreeItem.badge API." However, `badge` (ViewBadge) is a property of `TreeView`, not `TreeItem`. It shows a single number on the view's container icon.
**How to avoid:** Use `TreeView.badge` to show the TOTAL count of waiting sessions on the sidebar icon. For individual session indicators, use the `$(question)` ThemeIcon with a yellow ThemeColor. The `description` field can show supplemental text like "waiting for input".
**Warning signs:** TypeScript compilation errors when trying to set `badge` on a `TreeItem`.

### Pitfall 2: Pseudoterminal Events Before open()
**What goes wrong:** Firing `onDidWrite` or `onDidChangeName` events before `open()` is called results in silently dropped events.
**Why it happens:** VS Code ignores events from a Pseudoterminal until `open()` has been called. The extension may try to write initial content immediately after creating the terminal.
**How to avoid:** Wait for `open()` to be called before loading initial scrollback or subscribing to WebSocket output. The `open()` method is your initialization hook.
**Warning signs:** Terminal appears blank despite data being sent; no errors in console.

### Pitfall 3: No Built-in Inline Rename for Custom TreeViews
**What goes wrong:** Expecting VS Code to provide F2 inline rename for custom TreeView items like it does for Explorer files.
**Why it happens:** Issue #117502 requested this feature but it was closed as duplicate of #97190 and never implemented for custom tree views.
**How to avoid:** For F2 rename, register a keybinding for the rename command and use `vscode.window.showInputBox()` as the rename UI. Not truly "inline" but functionally equivalent. Set keybinding with `when: "focusedView == claudeos.sessions"`.
**Warning signs:** Assuming TreeView supports native inline editing -- it does not.

### Pitfall 4: WebSocket Reconnection Losing Subscriptions
**What goes wrong:** After a WebSocket disconnection and reconnection, the extension stops receiving output for previously subscribed sessions.
**Why it happens:** The supervisor's WebSocket handler tracks subscriptions per connection. A new connection starts with no subscriptions.
**How to avoid:** On `open` event after reconnect, replay all `subscribe` messages for sessions that were previously subscribed. The WsClient should maintain its own subscription set.
**Warning signs:** Sessions appear active but terminals stop updating after a brief network interruption.

### Pitfall 5: Terminal Name/Icon Not Updating After Creation
**What goes wrong:** Terminal tabs keep their initial name and icon even as session status changes.
**Why it happens:** Standard `TerminalOptions` sets name only at creation time. To update dynamically, you need `Pseudoterminal.onDidChangeName`.
**How to avoid:** Use `ExtensionTerminalOptions` with a `Pseudoterminal` that implements `onDidChangeName`. Fire the name change event whenever the session name or status changes. For icon updates, unfortunately there is no `onDidChangeIcon` -- the icon is set at creation time only. Encode status in the terminal name instead (e.g., prepend a Unicode status character).
**Warning signs:** Tab titles showing stale session names or status indicators.

### Pitfall 6: Missing Rename API in Supervisor
**What goes wrong:** The extension has a rename action but no supervisor endpoint to persist the new name.
**Why it happens:** Phase 1 supervisor routes include create, list, get, stop, kill, input, output, archive, revive -- but NOT rename/update.
**How to avoid:** Phase 2 must add a PATCH /api/v1/sessions/:id route to the supervisor that accepts `{ name: string }` and updates the session metadata. This is a small addition to the existing session routes.
**Warning signs:** Renames working in the UI but reverting after extension reload or sidebar refresh.

### Pitfall 7: esbuild Bundling ws Native Modules
**What goes wrong:** The `ws` library has optional native add-ons (bufferutil, utf-8-validate) that esbuild cannot bundle.
**Why it happens:** esbuild bundles JavaScript but cannot handle native .node files.
**How to avoid:** Add `--external:bufferutil --external:utf-8-validate` to the esbuild command. The ws library works fine without these optional dependencies (they only provide performance improvements).
**Warning signs:** Build errors mentioning `.node` files or native module resolution failures.

## Code Examples

### package.json contributes Section (Sessions Extension)

```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "claudeos-sessions",
          "title": "ClaudeOS Sessions",
          "icon": "$(terminal-bash)"
        }
      ]
    },
    "views": {
      "claudeos-sessions": [
        {
          "id": "claudeos.sessions",
          "name": "Sessions"
        }
      ]
    },
    "viewsWelcome": [
      {
        "view": "claudeos.sessions",
        "contents": "No sessions yet.\n[Create Session](command:claudeos.sessions.create)\nStart a new Claude Code session to get going."
      }
    ],
    "commands": [
      { "command": "claudeos.sessions.create", "title": "New Session", "icon": "$(add)", "category": "ClaudeOS" },
      { "command": "claudeos.sessions.rename", "title": "Rename Session", "category": "ClaudeOS" },
      { "command": "claudeos.sessions.openTerminal", "title": "Open Terminal", "icon": "$(terminal)", "category": "ClaudeOS" },
      { "command": "claudeos.sessions.stop", "title": "Stop Session", "category": "ClaudeOS" },
      { "command": "claudeos.sessions.kill", "title": "Kill Session", "category": "ClaudeOS" },
      { "command": "claudeos.sessions.archive", "title": "Archive Session", "category": "ClaudeOS" },
      { "command": "claudeos.sessions.delete", "title": "Delete Session", "category": "ClaudeOS" },
      { "command": "claudeos.sessions.revive", "title": "Revive Session", "category": "ClaudeOS" },
      { "command": "claudeos.sessions.refresh", "title": "Refresh", "icon": "$(refresh)", "category": "ClaudeOS" }
    ],
    "menus": {
      "view/title": [
        { "command": "claudeos.sessions.create", "when": "view == claudeos.sessions", "group": "navigation" },
        { "command": "claudeos.sessions.refresh", "when": "view == claudeos.sessions", "group": "navigation" }
      ],
      "view/item/context": [
        { "command": "claudeos.sessions.openTerminal", "when": "view == claudeos.sessions && viewItem =~ /session\\.(active|idle|waiting)/", "group": "0_open" },
        { "command": "claudeos.sessions.rename", "when": "view == claudeos.sessions && viewItem =~ /session\\./", "group": "1_edit" },
        { "command": "claudeos.sessions.stop", "when": "view == claudeos.sessions && viewItem =~ /session\\.(active|idle|waiting)/", "group": "2_lifecycle" },
        { "command": "claudeos.sessions.kill", "when": "view == claudeos.sessions && viewItem =~ /session\\.(active|idle|waiting|stopped)/", "group": "2_lifecycle" },
        { "command": "claudeos.sessions.archive", "when": "view == claudeos.sessions && viewItem =~ /session\\.(active|idle|waiting|stopped)/", "group": "3_manage" },
        { "command": "claudeos.sessions.revive", "when": "view == claudeos.sessions && viewItem =~ /session\\.(archived|zombie)/", "group": "3_manage" },
        { "command": "claudeos.sessions.delete", "when": "view == claudeos.sessions && viewItem =~ /session\\./", "group": "4_danger" }
      ]
    },
    "keybindings": [
      { "command": "claudeos.sessions.rename", "key": "f2", "when": "focusedView == claudeos.sessions" }
    ]
  }
}
```

### Status Icon Mapping

```typescript
// Source: VS Code codicon reference (https://microsoft.github.io/vscode-codicons/dist/codicon.html)
import * as vscode from 'vscode';

const STATUS_ICONS: Record<string, vscode.ThemeIcon> = {
  active: new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.green')),
  idle: new vscode.ThemeIcon('debug-pause', new vscode.ThemeColor('charts.yellow')),
  waiting: new vscode.ThemeIcon('question', new vscode.ThemeColor('charts.orange')),
  stopped: new vscode.ThemeIcon('stop-circle', new vscode.ThemeColor('charts.red')),
  archived: new vscode.ThemeIcon('archive', new vscode.ThemeColor('descriptionForeground')),
  zombie: new vscode.ThemeIcon('bug', new vscode.ThemeColor('errorForeground')),
};
```

### TreeItem for a Session

```typescript
// Source: VS Code TreeView API + TreeItem class
function createSessionItem(
  session: Session,
  isUnread: boolean,
): vscode.TreeItem {
  const label: vscode.TreeItemLabel = {
    label: session.name,
    // highlights makes the text render with emphasis (bold-like)
    highlights: isUnread ? [[0, session.name.length]] : undefined,
  };

  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.id = session.id;
  item.iconPath = STATUS_ICONS[session.status];
  item.contextValue = `session.${session.status}`;

  // Description: show time info for archived/zombie
  if (session.status === 'archived') {
    item.description = `archived ${timeAgo(session.archivedAt)}`;
  } else if (session.status === 'zombie') {
    item.description = timeAgo(session.lastSeen);
  }

  // Click opens terminal
  item.command = {
    command: 'claudeos.sessions.openTerminal',
    title: 'Open Terminal',
    arguments: [session],
  };

  return item;
}
```

### Creating a Terminal with Pseudoterminal

```typescript
// Source: VS Code ExtensionTerminalOptions + Pseudoterminal API
function openSessionTerminal(
  session: Session,
  pty: SessionPseudoterminal,
): vscode.Terminal {
  const terminal = vscode.window.createTerminal({
    name: `${session.name}`,
    pty,
    iconPath: STATUS_ICONS[session.status],
    color: STATUS_COLORS[session.status],
  } as vscode.ExtensionTerminalOptions);

  terminal.show();
  return terminal;
}
```

### Supervisor REST Client

```typescript
// Source: Node.js fetch API (global in Node 22)
const SUPERVISOR_API = 'http://localhost:3100/api/v1';

class SupervisorClient {
  async listSessions(): Promise<Session[]> {
    const res = await fetch(`${SUPERVISOR_API}/sessions`);
    if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`);
    return res.json();
  }

  async createSession(name?: string): Promise<Session> {
    const res = await fetch(`${SUPERVISOR_API}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
    return res.json();
  }

  async renameSession(id: string, name: string): Promise<void> {
    const res = await fetch(`${SUPERVISOR_API}/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`Failed to rename session: ${res.status}`);
  }

  async sendInput(id: string, text: string): Promise<void> {
    const res = await fetch(`${SUPERVISOR_API}/sessions/${id}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`Failed to send input: ${res.status}`);
  }

  async getOutput(id: string, scrollback = false): Promise<string> {
    const res = await fetch(`${SUPERVISOR_API}/sessions/${id}/output?scrollback=${scrollback}`);
    if (!res.ok) throw new Error(`Failed to get output: ${res.status}`);
    const data = await res.json();
    return data.output;
  }

  async stopSession(id: string): Promise<void> {
    await fetch(`${SUPERVISOR_API}/sessions/${id}/stop`, { method: 'POST' });
  }

  async killSession(id: string): Promise<void> {
    await fetch(`${SUPERVISOR_API}/sessions/${id}`, { method: 'DELETE' });
  }

  async archiveSession(id: string): Promise<void> {
    await fetch(`${SUPERVISOR_API}/sessions/${id}/archive`, { method: 'POST' });
  }

  async reviveSession(id: string): Promise<Session> {
    const res = await fetch(`${SUPERVISOR_API}/sessions/${id}/revive`, { method: 'POST' });
    if (!res.ok) throw new Error(`Failed to revive session: ${res.status}`);
    return res.json();
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TerminalRenderer (deprecated) | Pseudoterminal interface | VS Code 1.46 (2020) | Use Pseudoterminal for all custom terminal needs |
| Static terminal names | onDidChangeName event | VS Code 1.57 (2021) | Terminal tab names can update dynamically |
| No view badges | TreeView.badge (ViewBadge) | VS Code 1.72 (Sep 2022) | Numeric badge on view container icon |
| registerTreeDataProvider only | createTreeView for badge/reveal | VS Code 1.72+ | Use createTreeView when you need badge or reveal API |
| TreeItem.label as string | TreeItem.label as TreeItemLabel | VS Code 1.51+ | Supports highlights for emphasis/bold-like rendering |

**Deprecated/outdated:**
- `TerminalRenderer`: Replaced by `Pseudoterminal` interface. Do not use.
- `window.registerTreeDataProvider`: Still works but returns void. Use `window.createTreeView` to get a `TreeView` reference (needed for `badge` property).

## Open Questions

1. **Terminal Icon Dynamic Updates**
   - What we know: `Pseudoterminal.onDidChangeName` exists for dynamic name changes. `ExtensionTerminalOptions.iconPath` sets the initial icon.
   - What's unclear: There is no `onDidChangeIcon` event on Pseudoterminal. Once created, the terminal icon cannot be changed programmatically.
   - Recommendation: Encode status in the terminal name (e.g., prepend a status emoji/character) since icon cannot update dynamically. Alternatively, accept that the icon is set at creation time and only the name updates. The status is already visible in the sidebar TreeView.

2. **Read/Unread Gray Gradient**
   - What we know: TreeItemLabel.highlights creates bold-like text for unread. ThemeColor can color the description field.
   - What's unclear: VS Code's TreeItem does not support arbitrary CSS or opacity. A "gray-400 to gray-600 gradient based on recency" is not directly achievable with the TreeItem API.
   - Recommendation: Approximate the gradient by using `descriptionForeground` ThemeColor for the description text. For recency differentiation, use the description field to show time since last activity (e.g., "5m ago", "2h ago"). Unread items use highlights (bold); read items use no highlights (normal weight). This achieves the visual differentiation intent even if not a literal CSS gradient.

3. **Supervisor Rename Endpoint**
   - What we know: The supervisor does not currently have a rename/update endpoint for sessions.
   - What's unclear: Whether other session fields should be updatable (e.g., workdir, model).
   - Recommendation: Add a minimal PATCH /api/v1/sessions/:id endpoint that accepts `{ name?: string }` in the body. This is the only field that needs updating from the extension. The SessionManager already has `saveMetadata()` -- just update the name and re-save.

4. **handleInput vs sendText for Terminal I/O**
   - What we know: `Pseudoterminal.handleInput` receives raw keystrokes (character by character). `sendInput` in the supervisor uses `tmux send-keys` which accepts a string + Enter.
   - What's unclear: Whether character-by-character input forwarding will work well with Claude Code's input expectations.
   - Recommendation: Buffer input in the Pseudoterminal. When `\r` (Enter) is received, flush the buffer as a single string to `POST /sessions/:id/input`. Echo characters back to `onDidWrite` as they're typed for local feedback. This matches how Claude Code expects input: complete lines, not individual keystrokes.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.x |
| Config file | `claudeos-sessions/vitest.config.ts` (new -- follows supervisor pattern) |
| Quick run command | `cd claudeos-sessions && npx vitest run --reporter=verbose` |
| Full suite command | `cd claudeos-sessions && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SES-01 | TreeDataProvider returns grouped sessions | unit | `npx vitest run test/sidebar/session-tree.test.ts -t "groups sessions by status"` | Wave 0 |
| SES-02 | Create session command calls supervisor API | unit | `npx vitest run test/supervisor/client.test.ts -t "createSession"` | Wave 0 |
| SES-03 | Status icons map correctly to ThemeIcons | unit | `npx vitest run test/sidebar/session-item.test.ts -t "status icons"` | Wave 0 |
| SES-04 | Context menu filtering by viewItem | unit | Static analysis of package.json contributes (manual verification) | manual-only |
| SES-05 | Archived sessions in collapsed group | unit | `npx vitest run test/sidebar/session-tree.test.ts -t "archived group"` | Wave 0 |
| SES-06 | Zombie sessions with error icon | unit | `npx vitest run test/sidebar/session-item.test.ts -t "zombie"` | Wave 0 |
| SES-07 | Revive calls supervisor revive endpoint | unit | `npx vitest run test/supervisor/client.test.ts -t "reviveSession"` | Wave 0 |
| SES-08 | ViewBadge shows waiting count | unit | `npx vitest run test/sidebar/session-tree.test.ts -t "badge"` | Wave 0 |
| SES-09 | Unread sessions use highlights | unit | `npx vitest run test/sidebar/session-item.test.ts -t "unread"` | Wave 0 |
| TRM-01 | Click opens Pseudoterminal | unit | `npx vitest run test/terminal/terminal-manager.test.ts -t "open"` | Wave 0 |
| TRM-02 | Multiple terminals tracked in map | unit | `npx vitest run test/terminal/terminal-manager.test.ts -t "multiple"` | Wave 0 |
| TRM-03 | handleInput sends to supervisor | unit | `npx vitest run test/terminal/session-terminal.test.ts -t "input"` | Wave 0 |
| TRM-04 | Terminal name includes session name | unit | `npx vitest run test/terminal/session-terminal.test.ts -t "name"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd claudeos-sessions && npx vitest run --reporter=verbose`
- **Per wave merge:** Full suite + supervisor tests (`cd supervisor && npx vitest run`)
- **Phase gate:** Both extension and supervisor test suites green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `claudeos-sessions/vitest.config.ts` -- test configuration (mirror supervisor pattern)
- [ ] `claudeos-sessions/test/sidebar/session-tree.test.ts` -- TreeDataProvider unit tests
- [ ] `claudeos-sessions/test/sidebar/session-item.test.ts` -- TreeItem factory tests
- [ ] `claudeos-sessions/test/supervisor/client.test.ts` -- HTTP client tests (mock fetch)
- [ ] `claudeos-sessions/test/supervisor/ws-client.test.ts` -- WebSocket client tests (mock ws)
- [ ] `claudeos-sessions/test/terminal/session-terminal.test.ts` -- Pseudoterminal tests
- [ ] `claudeos-sessions/test/terminal/terminal-manager.test.ts` -- Terminal lifecycle tests
- [ ] `claudeos-sessions/test/state/session-store.test.ts` -- State management tests
- [ ] VS Code API mock: Need `@vscode/test-electron` or manual mocks for vscode namespace in vitest
- [ ] Supervisor PATCH endpoint test: `supervisor/test/routes/sessions.test.ts` -- add rename test case

## Sources

### Primary (HIGH confidence)
- @types/vscode index.d.ts (local, v1.85.0) -- TreeItem, TreeView, Pseudoterminal, TerminalOptions, ExtensionTerminalOptions, ViewBadge, ThemeIcon, TreeItemLabel interfaces verified directly
- Supervisor source code (local) -- types.ts, ws/handler.ts, routes/sessions.ts, services/session-manager.ts, services/tmux.ts verified directly
- Extension template (local) -- package.json, src/extension.ts, esbuild config verified directly

### Secondary (MEDIUM confidence)
- [VS Code Tree View API docs](https://code.visualstudio.com/api/extension-guides/tree-view) -- TreeDataProvider patterns, registration approaches, welcome content
- [VS Code API reference](https://code.visualstudio.com/api/references/vscode-api) -- Full API signatures for TreeItem, Terminal, Pseudoterminal
- [Codicon reference](https://microsoft.github.io/vscode-codicons/dist/codicon.html) -- Available icon IDs and ~spin animation modifier
- [VS Code TreeView badge PR #144775](https://github.com/microsoft/vscode/pull/144775) -- ViewBadge implementation details and testing (Sep 2022)
- [Pseudoterminal.onDidChangeName issue #122945](https://github.com/microsoft/vscode/issues/122945) -- Dynamic terminal name updates
- [VS Code contribution points docs](https://code.visualstudio.com/api/references/contribution-points) -- Menu registration, when clauses, viewItem context
- [Terminal sample extension](https://github.com/microsoft/vscode-extension-samples/blob/main/terminal-sample/src/extension.ts) -- Pseudoterminal patterns

### Tertiary (LOW confidence)
- [TreeView inline rename issue #117502](https://github.com/microsoft/vscode/issues/117502) -- F2 rename NOT natively supported for custom tree views (closed as duplicate, unimplemented)
- [code-server proposed API issue #4397](https://github.com/coder/code-server/issues/4397) -- code-server may restrict proposed VS Code APIs; standard APIs (TreeView, Terminal) should work

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- using only stable VS Code APIs and existing project tooling; all verified in @types/vscode
- Architecture: HIGH -- patterns well-documented in VS Code API guides and samples; Pseudoterminal approach verified in types
- Pitfalls: HIGH -- badge limitation verified directly in @types/vscode (no badge on TreeItem); inline rename confirmed unimplemented via GitHub issue
- Terminal I/O: MEDIUM -- Pseudoterminal-to-tmux proxy pattern is sound but the handleInput buffering strategy needs validation during implementation
- Read/unread styling: MEDIUM -- TreeItemLabel.highlights exists but visual fidelity of "gray gradient" is an approximation

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (VS Code API is stable; codicon set changes slowly)
