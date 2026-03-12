# Phase 2: Session Management - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Two VS Code extensions — a sessions sidebar and terminal tabs — for viewing, creating, managing, and interacting with Claude Code sessions. The supervisor API (localhost:3100) and WebSocket are already built in Phase 1. This phase creates the UI layer on top of that API.

</domain>

<decisions>
## Implementation Decisions

### Sidebar tree structure
- Sessions grouped by status: Active, Idle, Waiting, Stopped — as expandable tree sections
- Archive and Zombie sections at the bottom, collapsed by default
- Badge count on collapsed Archive/Zombie headers showing number of items inside
- Sessions sorted most-recent-first within each status group
- Sidebar auto-refreshes in real-time via WebSocket connection to supervisor (event-driven, no polling)
- Sessions move between groups automatically as their status changes

### Session interactions
- Single-click a session opens/focuses its terminal tab (direct path to interaction)
- Right-click context menu with full actions: Rename, Open Terminal, Stop, Kill, Archive, Delete — with separators
- Context menu actions filtered by session status (e.g., can't stop an archived session; Revive shown only for archived/zombie)
- '+' button in sidebar title bar toolbar to create new session — click opens inline input for optional session name, creates immediately
- Rename supported both via context menu and F2 keyboard shortcut (inline rename in tree view)

### Terminal tab behavior
- Use VS Code's built-in terminal API (vscode.window.createTerminal) to attach to tmux sessions — full native terminal emulation
- One tab per session — clicking an already-open session focuses the existing tab instead of opening a duplicate
- When a session exits while tab is open: tab stays open showing final output AND notification toast appears ("Session X has ended")
- Tab title shows session name + status icon (e.g., "● My Session" with codicon matching status)
- Status icon in tab title updates in real-time as session status changes

### Visual styling & indicators
- Status icons use VS Code built-in codicons: $(sync~spin) for active, $(debug-pause) for idle, $(question) for waiting, $(stop-circle) for stopped
- Notification badge on waiting sessions using VS Code TreeItem.badge API — shows count badge (e.g., "1" when waiting for input)
- Read/unread state: session is "unread" (bold) when it has new terminal output since the user last focused its terminal tab; fading gray gradient (gray-400 to gray-600) for read sessions based on recency
- Zombie sessions displayed with red dot + session name + last known time (e.g., "🔴 My Session — 3h ago")
- Archived sessions show with archive-style icon, name, and archived date

### Claude's Discretion
- Exact codicon choices for archive/zombie status indicators
- Keyboard shortcuts beyond F2 rename (if any)
- Empty state when no sessions exist (sidebar message/illustration)
- Error handling and retry behavior for supervisor API calls
- WebSocket reconnection strategy if connection drops

</decisions>

<specifics>
## Specific Ideas

- Terminal tabs should feel native — using VS Code terminal API means copy/paste, keyboard shortcuts, and themes all work out of the box
- The sidebar should feel "alive" — sessions moving between groups in real-time via WebSocket gives a dashboard feel
- Zombie sessions showing "3h ago" helps users decide whether to revive or clean up
- Phase 1 decided event-driven architecture over polling — this phase must honor that by using the WebSocket for all status updates

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `supervisor/src/types.ts`: SessionStatus type (active/idle/waiting/stopped/archived/zombie), Session interface, WsMessage types — use these as the API contract
- `supervisor/src/ws/handler.ts`: WebSocket with subscribe/unsubscribe per session, broadcastStatus() and sendOutput() — extensions connect here for real-time updates
- `supervisor/src/routes/sessions.ts`: Full REST API (create, list, get, stop, kill, input, output, archive, revive) + internal event route
- `extension-template/`: Package scaffold with esbuild, vsce, vitest — use as starting point for both extensions

### Established Patterns
- Supervisor API: REST on localhost:3100/api/v1/*, Zod schemas for validation, Fastify routes
- Session IDs: `ses_` prefix with 8-char UUID suffix
- Atomic file writes for persistence (write-to-temp, rename)
- Event-driven status via tmux hooks posting to /internal/session-event

### Integration Points
- Extensions call supervisor REST API at localhost:3100/api/v1/sessions/*
- Extensions connect to WebSocket at ws://localhost:3100/ws for real-time status and output
- Terminal tabs attach to tmux sessions by session ID
- Extensions declare `extensionDependencies` if sessions extension is a hard dep for terminal extension

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-session-management*
*Context gathered: 2026-03-12*
