# Technology Stack

**Project:** ClaudeOS v1.2 UI Polish & Workspaces
**Researched:** 2026-03-18

## Context

This document covers ONLY the stack additions needed for v1.2: unified theming, workspace management, session view redesign with terminal UI, browser extension for Claude in Chrome session management, and UI self-testing. The existing validated stack (Fastify 5, Zod 3.24, React 19 + Vite 6 wizard UI, code-server, tmux, TypeScript strict, Node.js 22 LTS, esbuild, Docker/Nix, VS Code extension API 1.85+) is not re-evaluated here. See previous STACK.md iterations for full base stack rationale.

---

## Recommended Stack Additions

### 1. Unified VS Code Theming System

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| VS Code `contributes.themes` | Extension API 1.85+ | Ship a ClaudeOS color theme as extension | Standard VS Code mechanism. Defines workbench colors + syntax tokens in a JSON file. code-server fully supports this. |
| VS Code `contributes.colors` | Extension API 1.85+ | Register custom ClaudeOS color tokens | Extensions can register custom color IDs (e.g., `claudeos.accent`, `claudeos.cardBackground`) that theme files and user settings can override. Used with `new vscode.ThemeColor('claudeos.accent')`. |
| CSS `var(--vscode-*)` tokens | Built-in to webviews | Theme-aware webview styling | VS Code automatically exposes 500+ theme colors as CSS variables on the `<html>` element of every webview. When the user switches themes, all CSS variables update automatically. No library needed. |
| ClaudeOS theme JSON file | N/A | Define the branded ClaudeOS look | A single `claudeos-dark-color-theme.json` file defines all workbench colors (sidebar, editor, terminal, panel, activity bar, status bar, tabs) plus syntax token colors. |

**Key findings (HIGH confidence -- official VS Code Extension API docs):**

The theming system has two layers that must both be addressed:

1. **VS Code workbench theming**: A theme extension contributes a `contributes.themes` entry in `package.json` pointing to a `-color-theme.json` file. This controls all native VS Code UI elements: activity bar, sidebar, editor, panel, status bar, title bar, terminal ANSI colors, tabs, menus, etc. The file format supports `"type": "dark"`, a `"colors"` object for workbench tokens, and `"tokenColors"` for syntax highlighting.

2. **Webview theming**: All webviews (home panel, session webviews, setup wizard when embedded) automatically inherit theme colors via `var(--vscode-editor-background)`, `var(--vscode-foreground)`, etc. The existing `claudeos-home` extension already partially uses these (see `home-panel.ts` line 257: `--vscode-editor-background`). But it also hardcodes custom CSS like `--claudeos-accent: #c084fc` and uses hex fallbacks.

**Architecture decision: Single theme extension + CSS variable bridge.**

Create a new `claudeos-theme` extension that:
- Ships the ClaudeOS color theme JSON (dark mode)
- Registers custom `claudeos.*` color tokens via `contributes.colors`
- Is automatically set as the default theme in code-server's `settings.json`

All other extensions' webviews consume `var(--vscode-claudeos-accent)` (auto-prefixed by VS Code) instead of hardcoded hex values. The wizard UI (standalone React app) keeps its own `theme.css` since it runs outside code-server, but the color values should be extracted into a shared token file.

**What NOT to add:**
- Do NOT use `@vscode/webview-ui-toolkit` -- deprecated as of January 2025. The underlying FAST Foundation library it depends on was deprecated, and the toolkit was archived on January 6, 2025.
- Do NOT use GitHub's React Webview UI Toolkit -- experimental, not production-ready, adds a dependency for components that are simple enough to hand-roll.
- Do NOT programmatically set `workbench.colorCustomizations` at runtime -- this overrides user preferences and causes settings churn. Ship a proper theme extension that users opt into.

### 2. Session View Redesign with xterm.js

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@xterm/xterm` | ^6.0.0 | Terminal rendering in webview panels | The same library that powers VS Code's own integrated terminal. Renders terminal escape sequences, ANSI colors, cursor positioning, etc. in a browser DOM. Latest stable: 6.0.0 (released December 2025). |
| `@xterm/addon-fit` | ^0.9.0 | Auto-resize terminal to container | Makes the xterm instance resize to fill its parent container. Essential for the "auto-resize to viewport" requirement. |
| `@xterm/addon-webgl` | ^0.19.0 | GPU-accelerated rendering | Uses WebGL2 for significantly better performance with scrollback buffers. Falls back to DOM renderer in environments without WebGL. |
| `@xterm/addon-serialize` | (latest matching v6) | Save/restore terminal state | Serializes terminal buffer state for session reconnection. When a user switches between session tabs, the terminal state is preserved without re-fetching from the supervisor. |
| VS Code Webview API | Built-in | Host xterm.js in a panel | `vscode.window.createWebviewPanel()` with `enableScripts: true` provides a DOM environment where xterm.js can render. The existing `claudeos-home` extension already uses this pattern. |

**Key findings (HIGH confidence -- xterm.js official releases + npm):**

The current session terminal implementation uses VS Code's built-in `Pseudoterminal` API (`vscode.Pseudoterminal`), which creates a terminal tab in the bottom panel. This is functional but:
- Renders in the bottom panel only (not in the editor area like a tab)
- Has limited styling control (no custom fonts, colors, or layout)
- Cannot show session metadata alongside the terminal (status, name, cost, etc.)
- Does not support the "opencode-like" split view with session info

The redesign should move to a **webview panel** approach:
- Each session opens as an editor tab (not a terminal tab)
- The webview embeds xterm.js for terminal rendering
- Session metadata (name, status, duration, model) is rendered alongside the terminal
- The xterm.js instance connects to the supervisor WebSocket for live I/O
- The fit addon handles auto-resize when the editor area resizes

**WebSocket integration:**
The supervisor already exposes a WebSocket at `ws://localhost:3100/ws` for session output streaming. The existing `WsClient` class in `claudeos-sessions` subscribes to session output. The xterm.js webview will receive output data via `postMessage` from the extension host, which subscribes to the WS. Direct WS connection from the webview is blocked by VS Code's CSP.

**Data flow:**
```
Supervisor WS → Extension Host (WsClient) → postMessage → Webview (xterm.js .write())
Webview (keypress) → postMessage → Extension Host → Supervisor REST API (sendInput)
```

**What NOT to add:**
- Do NOT use OpenTUI (the Zig-based TUI library from opencode). It is a native terminal library designed for actual terminal emulators, not web-based rendering. The "opencode-like" goal refers to visual quality and behavior, not the specific technology.
- Do NOT try to embed VS Code's built-in terminal renderer. It is deeply coupled to VS Code internals and not available as a standalone component.
- Do NOT use the `xterm` npm package (old name). Use `@xterm/xterm` (scoped package, v6+).

### 3. Workspace Manager Extension

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `vscode.workspace.updateWorkspaceFolders()` | Built-in API | Switch active workspace folder | Standard API for adding/removing/replacing workspace folders in multi-root workspaces. Triggers extension reload when transitioning from empty/single to multi-folder. |
| `vscode.workspace.workspaceFolders` | Built-in API | Read current workspace folders | Returns the list of workspace folders. Used to detect current state and build the workspace tab UI. |
| `vscode.workspace.onDidChangeWorkspaceFolders` | Built-in API | React to workspace changes | Fires when folders are added/removed (except when the first folder changes, which causes extension restart). |
| VS Code TreeView API | Built-in | Sidebar tree for workspaces | `vscode.window.createTreeView()` with `TreeDataProvider` for the workspace list. Same pattern as the existing sessions sidebar. |
| `vscode.workspace.fs` | Built-in API | Create/delete workspace directories | File system operations for managing the `workspaces/` directory structure. |
| `vscode.workspace.getConfiguration()` | Built-in API | Persist workspace preferences | Store active workspace, workspace list, per-workspace settings in extension settings. |

**Key findings (HIGH confidence -- official VS Code Multi-root Workspace API docs):**

The workspace manager maps cleanly to VS Code's multi-root workspace model:
- Each ClaudeOS "workspace" = a subdirectory of a `workspaces/` folder
- Switching workspaces = calling `updateWorkspaceFolders()` to replace the root folder
- Workspace state (open editors, session associations) can be persisted via `ExtensionContext.workspaceState` or `globalState`

**Critical caveat:** `updateWorkspaceFolders()` may terminate and restart all extensions when transitioning from an empty/single-folder workspace to a multi-folder workspace. The workspace manager must handle this gracefully -- persist state to `globalState` (survives restarts), not in-memory.

**Sidebar design:**
The extension contributes a `viewsContainers.activitybar` entry (replacing the Copilot icon) with a tree view. Workspace items are tree nodes with context menu actions (create, rename, delete, switch). The active workspace has a visual indicator (bold, checkmark icon).

**Integration with sessions:**
The sessions extension filters visible sessions by the active workspace's directory. This requires either:
1. A shared state mechanism (extension API `getExtension().exports`) where workspace-manager exposes the active workspace path
2. Or a command-based approach where sessions queries `claudeos.workspace.getActive`

Option 1 is the established pattern in ClaudeOS (used by secrets extension already).

**What NOT to add:**
- Do NOT use the `.code-workspace` file format for multi-root. ClaudeOS is single-root, switching the root. Multi-root adds complexity (settings merge, extension compat) for no benefit.
- Do NOT attempt to save/restore editor tabs programmatically. VS Code does not expose an API for saving/restoring the exact set of open editor tabs. The workspace manager should focus on directory switching and session filtering.

### 4. Claude in Chrome Browser Extension Integration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Claude in Chrome extension | 1.0.36+ (Chrome Web Store) | Built-in browser automation | Stock Claude Code feature. Works via Chrome extension + native messaging host. No additional installation in the container -- Claude Code already supports it. |
| `claude --chrome` / `/chrome` | Claude Code 2.0.73+ | Enable browser integration | Starts Claude Code with Chrome integration. Available as CLI flag or slash command within a session. |
| Native Messaging Host | Installed by Claude Code | Chrome-to-CLI communication | Claude Code automatically installs the native messaging host config (`com.anthropic.claude_code_browser_extension.json`). Chrome reads this on startup. |
| VS Code Extension (new) | N/A | Session management UI | A new `claudeos-browser` extension that provides a sidebar view showing browser sessions initiated via Claude in Chrome. |

**Key findings (HIGH confidence -- official Claude Code Chrome docs):**

Claude in Chrome is a **stock feature** of Claude Code, not a plugin or MCP server. The architecture:
1. User installs "Claude in Chrome" extension from Chrome Web Store
2. Claude Code installs a native messaging host config on first use
3. When `--chrome` is active, Claude Code exposes browser tools (navigate, click, type, screenshot, read DOM, etc.)
4. The Chrome extension's service worker communicates with Claude Code via native messaging pipes

**For ClaudeOS, the key challenge is container environment:**
- ClaudeOS runs in Docker. There is no Chrome browser inside the container.
- Claude in Chrome requires Chrome running on the **user's local machine** where they access ClaudeOS via browser.
- The user's browser IS Chrome (they're viewing code-server in it).
- But Claude Code runs inside the container, and native messaging requires the host config to be on the same machine as Chrome.

**This means the Claude in Chrome integration works differently for ClaudeOS than for local Claude Code:**
- The user has Chrome with the Claude in Chrome extension installed locally
- Claude Code sessions inside ClaudeOS need to communicate with the user's local Chrome
- This requires the native messaging host to point to the containerized Claude Code process, which is not trivially possible across the network boundary

**Realistic approach for v1.2:**
The browser session management extension should be designed as a **read-only monitoring UI** that:
1. Polls the supervisor API for session metadata that includes browser activity flags
2. Renders browser session cards when Claude Code sessions use `--chrome`
3. Shows screenshots captured by Claude in Chrome (available via file system)
4. Does NOT attempt to proxy native messaging across the container boundary

The actual Chrome integration requires the user to have Claude in Chrome installed on their local machine AND a way to bridge the native messaging to the container. This is a v1.3+ problem. For v1.2, focus on the UI scaffolding.

**What NOT to add:**
- Do NOT install Chrome/Chromium inside the container. Massive image bloat (400MB+), security concerns, and it is not how Claude in Chrome is designed to work.
- Do NOT use Playwright or Chrome DevTools MCP. The todo explicitly says "Do NOT use Playwright, Chrome DevTools MCP plugin, or any other third-party browser tool."
- Do NOT try to proxy native messaging over WebSocket. The native messaging protocol is a local IPC mechanism, not designed for network bridging.
- Do NOT build a custom Chrome extension from scratch. The "Claude in Chrome" extension is the official one from Anthropic.

### 5. UI Self-Testing via Claude in Chrome

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Claude in Chrome | (same as above) | Browser interaction for testing | Stock Claude Code capability: screenshots, DOM reading, clicking, typing. |
| Claude Code Skills (`.claude/commands/`) | N/A | Slash commands for test workflows | Custom skills teach Claude Code how to test ClaudeOS UI. A `browser-test.md` skill provides the testing methodology. |
| Self-improve extension update | Existing | Link to browser testing skill | Update the existing self-improve MCP tools to reference the browser testing skill when building UI. |

**Key findings (MEDIUM confidence -- depends on container-to-browser bridging from section 4):**

The self-testing workflow creates a closed loop:
1. Claude Code builds UI (extension webview, theme, etc.)
2. Claude Code runs `/browser-test` to invoke Claude in Chrome
3. Claude in Chrome takes screenshots, reads DOM state, checks layouts
4. Claude Code iterates based on visual feedback

**For v1.2, the realistic scope is:**
- Create the skill files (`.claude/commands/browser-test.md`, updated `self-improve` skill)
- Document the testing methodology
- The actual browser testing requires the Claude in Chrome bridge (section 4) to be solved

**Implementation:**
The skill file teaches Claude:
- How to navigate to ClaudeOS pages (localhost:PORT)
- How to take screenshots and analyze them
- How to verify specific UI elements exist
- How to check responsive behavior
- How to compare before/after screenshots

**What NOT to add:**
- Do NOT use `@playwright/test` or `playwright` npm packages. Explicitly prohibited in the todo.
- Do NOT install `chrome-devtools-mcp`. Explicitly prohibited in the todo.
- Do NOT create automated test suites. The self-testing is agent-driven (Claude decides what to test), not scripted.

---

## New Dependencies Summary

### Extension Dependencies (new packages)

```bash
# claudeos-sessions extension (for terminal webview redesign)
cd claudeos-sessions
npm install @xterm/xterm@^6.0.0 @xterm/addon-fit@^0.9.0 @xterm/addon-webgl@^0.19.0 @xterm/addon-serialize

# Note: xterm.js assets (CSS, JS) must be bundled into the webview.
# esbuild already handles this -- xterm.js is bundleable.
```

### New Extensions (no new npm packages beyond xterm.js)

| Extension | New npm deps | Notes |
|-----------|-------------|-------|
| `claudeos-theme` | None | Pure JSON theme file + package.json contributions. No runtime code needed. |
| `claudeos-workspace` | None | Uses only built-in VS Code APIs. |
| `claudeos-browser` | None | Reads supervisor API + file system for session screenshots. |

### Supervisor (no changes)

```
No new npm dependencies for the supervisor.
```

The supervisor may need minor API additions (expose browser session metadata in session list response), but no new packages.

### Container (no changes)

```
No new container dependencies.
Chrome is NOT installed in the container.
```

---

## Integration Points with Existing Code

### Theme Integration

| Existing Code | Change Needed |
|---------------|---------------|
| `claudeos-home/src/webview/home-panel.ts` | Replace hardcoded `--claudeos-accent: #c084fc` with `var(--vscode-claudeos-accent)` from theme extension's `contributes.colors` |
| `supervisor/wizard/src/theme.css` | Extract color values to match theme extension. Wizard runs standalone (outside code-server), so it keeps its own CSS vars but values should be consistent. |
| `config/settings.json` (code-server defaults) | Set `"workbench.colorTheme": "ClaudeOS Dark"` as default theme |
| `config/product.json` | No changes needed. Theme is an extension, not a product config. |

### Session View Integration

| Existing Code | Change Needed |
|---------------|---------------|
| `claudeos-sessions/src/terminal/session-terminal.ts` | Keep as fallback. New webview panel coexists -- users can choose terminal tab OR editor tab view. |
| `claudeos-sessions/src/terminal/terminal-manager.ts` | Add `openWebviewTerminal()` method alongside existing `openTerminal()`. Default to webview. |
| `claudeos-sessions/src/supervisor/ws-client.ts` | No changes. Webview terminal reuses same WS subscription mechanism. |
| `claudeos-sessions/package.json` | Add `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-webgl` as dependencies. |

### Workspace Integration

| Existing Code | Change Needed |
|---------------|---------------|
| `claudeos-sessions` extension | Filter sessions by active workspace path. Query workspace-manager extension exports for current workspace. |
| `claudeos-home` extension | Show workspace switcher in home panel. Query workspace-manager for workspace list. |
| `config/settings.json` | Remove Copilot sidebar. Set workspace-manager as the primary sidebar activity bar item. |

### Browser Extension Integration

| Existing Code | Change Needed |
|---------------|---------------|
| `supervisor/src/services/session-manager.ts` | Optionally expose `--chrome` flag in session creation. Add `chromeEnabled` field to session metadata. |
| `supervisor/src/schemas/session.ts` | Add optional `chromeEnabled: z.boolean().optional()` to session schema. |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Theme delivery | `contributes.themes` extension | `workbench.colorCustomizations` in settings.json | Settings override is fragile -- user can accidentally clear it. Theme extension is the standard mechanism, discoverable in theme picker. |
| Theme delivery | Custom theme extension | Fork an existing theme (e.g., One Dark Pro) | Forking creates maintenance burden. A clean theme built to match the existing `theme.css` palette is simpler and stays consistent with the wizard. |
| Terminal rendering | xterm.js in webview | Keep VS Code Pseudoterminal only | Pseudoterminal renders in the bottom panel with minimal styling control. The opencode-like view requires custom layout with session metadata, which needs a webview. |
| Terminal rendering | xterm.js in webview | Canvas-based custom renderer | Reinventing terminal rendering is a multi-month project. xterm.js is battle-tested, powers VS Code itself, and handles all edge cases (Unicode, bidirectional text, ANSI codes). |
| Terminal rendering | @xterm/xterm 6.0 | xterm 5.x (old package name) | v6 is current stable. The scoped `@xterm/` packages are the maintained line. The unscoped `xterm` package is legacy (last published 3 years ago). |
| Workspace management | Single-root switching via updateWorkspaceFolders | Multi-root workspace (`.code-workspace` file) | Multi-root adds complexity: settings merge behavior, extension compat issues, confusing UI with multiple roots visible. Single-root switching is simpler and matches the mental model of "one project at a time." |
| Workspace management | Built-in VS Code APIs | Custom file-picker UI | The tree view API already provides the right UX: sidebar list, context menus, inline actions. No custom webview needed. |
| Browser testing | Claude in Chrome (stock feature) | Playwright | Explicitly prohibited in the todo. Also, Playwright requires Chrome installed in container (400MB+). Claude in Chrome uses the user's own browser. |
| Browser testing | Claude in Chrome (stock feature) | Chrome DevTools MCP | Explicitly prohibited in the todo. Also adds a third-party dependency where the stock feature already provides the same capabilities. |
| Webview component library | Hand-rolled HTML + CSS vars | @vscode/webview-ui-toolkit | Deprecated January 2025. The underlying FAST Foundation library was deprecated. Using it would mean depending on unmaintained code. |
| Webview component library | Hand-rolled HTML + CSS vars | Lit-based community toolkit | Adds a framework dependency for simple components (buttons, inputs, cards). The existing ClaudeOS extensions already use hand-rolled HTML in webviews successfully. |

---

## Version Compatibility Matrix

| Package | Version | Requires | Notes |
|---------|---------|----------|-------|
| `@xterm/xterm` | ^6.0.0 | Browser with ES2020+ | Released Dec 2025. ESM support. Bundleable with esbuild. |
| `@xterm/addon-fit` | ^0.9.0 | `@xterm/xterm` ^6.0.0 | Must match major xterm version. |
| `@xterm/addon-webgl` | ^0.19.0 | `@xterm/xterm` ^6.0.0 + WebGL2 | Falls back to DOM renderer if WebGL unavailable. |
| `@xterm/addon-serialize` | (latest for v6) | `@xterm/xterm` ^6.0.0 | Buffer serialization for tab switching. |
| VS Code Extension API | ^1.85.0 | code-server (current) | All extensions already target this. No change needed. |
| Claude in Chrome ext | 1.0.36+ | Chrome/Edge + Claude Code 2.0.73+ | User installs on their local machine, not in container. |

---

## Files to Create

| File | Extension | Purpose |
|------|-----------|---------|
| `claudeos-theme/package.json` | claudeos-theme | Theme extension manifest with `contributes.themes` and `contributes.colors` |
| `claudeos-theme/themes/claudeos-dark-color-theme.json` | claudeos-theme | Full workbench color definition + syntax token colors |
| `claudeos-workspace/package.json` | claudeos-workspace | Workspace manager extension manifest |
| `claudeos-workspace/src/extension.ts` | claudeos-workspace | Activation, tree view registration, workspace switching |
| `claudeos-workspace/src/workspace-tree.ts` | claudeos-workspace | TreeDataProvider for workspace list sidebar |
| `claudeos-workspace/src/workspace-store.ts` | claudeos-workspace | Persistence layer for workspace state (globalState) |
| `claudeos-browser/package.json` | claudeos-browser | Browser session management extension manifest |
| `claudeos-browser/src/extension.ts` | claudeos-browser | Activation, sidebar registration |
| `claudeos-browser/src/browser-tree.ts` | claudeos-browser | TreeDataProvider for browser sessions |
| `claudeos-sessions/src/webview/session-panel.ts` | claudeos-sessions | New webview panel with xterm.js for rich session view |
| `claudeos-sessions/src/webview/session-panel.html` | claudeos-sessions | HTML template for xterm.js webview (or inline template literal) |
| `.claude/commands/browser-test.md` | N/A | Skill file teaching Claude how to test UI via Claude in Chrome |

## Files to Modify

| File | Change | Why |
|------|--------|-----|
| `claudeos-home/src/webview/home-panel.ts` | Replace hardcoded hex colors with `var(--vscode-*)` tokens | Theme consistency |
| `claudeos-sessions/package.json` | Add xterm.js dependencies | Terminal rendering in webview |
| `claudeos-sessions/src/extension.ts` | Register webview panel provider, add command for webview terminal | New session view |
| `claudeos-sessions/src/terminal/terminal-manager.ts` | Add webview terminal alongside pseudoterminal | Dual terminal mode |
| `config/settings.json` | Set default theme, remove Copilot, configure workspace sidebar | Workspace manager replaces Copilot |
| `supervisor/src/schemas/session.ts` | Add optional `chromeEnabled` field | Browser session tracking |
| `claudeos-self-improve/` (skill files) | Reference browser-test skill for UI work | Self-testing loop |

---

## Sources

- [VS Code Color Theme Extension Guide](https://code.visualstudio.com/api/extension-guides/color-theme) -- HIGH confidence, official
- [VS Code Theme Color Reference](https://code.visualstudio.com/api/references/theme-color) -- HIGH confidence, official, lists all 500+ color tokens
- [VS Code Contribution Points](https://code.visualstudio.com/api/references/contribution-points) -- HIGH confidence, official, `contributes.themes` and `contributes.colors` spec
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview) -- HIGH confidence, official, CSS variable theming in webviews
- [@xterm/xterm on npm](https://www.npmjs.com/package/@xterm/xterm) -- HIGH confidence, latest version 6.0.0
- [xterm.js GitHub Releases](https://github.com/xtermjs/xterm.js/releases) -- HIGH confidence, release notes for v6.0.0
- [xterm.js Official Site](https://xtermjs.org/) -- HIGH confidence, addon documentation
- [VS Code Adopting Multi Root Workspace APIs](https://github.com/microsoft/vscode/wiki/Adopting-Multi-Root-Workspace-APIs) -- HIGH confidence, official wiki
- [VS Code Multi-root Workspaces](https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces) -- HIGH confidence, official docs
- [Claude in Chrome Official Docs](https://code.claude.com/docs/en/chrome) -- HIGH confidence, official, architecture and requirements
- [Claude in Chrome Extension (Chrome Web Store)](https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn) -- HIGH confidence, official
- [Sunsetting the Webview UI Toolkit (Issue #561)](https://github.com/microsoft/vscode-webview-ui-toolkit/issues/561) -- HIGH confidence, official deprecation notice
- [VS Code Webview CSS Variables (Issue #2060)](https://github.com/microsoft/vscode-docs/issues/2060) -- MEDIUM confidence, community discussion of available CSS vars
- [code-server FAQ](https://coder.com/docs/code-server/FAQ) -- HIGH confidence, extension installation and configuration
- [Claude Code Chrome Integration Issues](https://github.com/anthropics/claude-code/issues/20943) -- MEDIUM confidence, documents native messaging host conflicts and container limitations
