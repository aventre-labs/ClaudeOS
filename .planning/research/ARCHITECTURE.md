# Architecture Patterns: v1.2 UI Polish & Workspaces

**Domain:** Integration architecture for UI theming, session view redesign, workspace management, browser extension, and UI self-testing within existing ClaudeOS
**Researched:** 2026-03-18
**Confidence:** HIGH (existing codebase analysis, official VS Code docs) / MEDIUM (Chrome native messaging, xterm.js in webview)

---

## Current Architecture (Baseline for v1.2)

```
Container (Nix / Docker)
+---------------------------------------------------------------+
|                                                                 |
|  Supervisor (Fastify 5, :3100)                                  |
|    routes: sessions, secrets, extensions, config, wizard, health|
|    ws: /api/v1/ws (session status + output streaming)           |
|    services: SessionManager, TmuxService, BootService,          |
|              SecretStore, ExtensionInstaller, CredentialWriter   |
|                                                                 |
|  code-server (:8080)                                            |
|    product.json branding (ClaudeOS)                             |
|    settings.json (Default Dark Modern theme)                    |
|    extensionsGallery -> open-vsx.org                            |
|                                                                 |
|  5 Extensions (VSIX):                                           |
|    claudeos-sessions  - TreeView sidebar + Pseudoterminal PTY   |
|    claudeos-secrets   - WebviewPanel (secrets CRUD)             |
|    claudeos-home      - WebviewPanel (home page)                |
|    claudeos-self-improve - MCP server + Extension Manager UI    |
|    (claudeos-terminal merged into claudeos-sessions)            |
|                                                                 |
|  Claude Code (stock, in tmux)                                   |
|    One tmux session per Claude Code session                     |
|    I/O via tmux send-keys / capture-pane                        |
|                                                                 |
|  first-boot/ (React 19 + Vite 6 wizard, served pre-code-server)|
+---------------------------------------------------------------+
```

### Current Extension Communication Patterns

```
Extension <-> Supervisor:   HTTP fetch() to localhost:3100
Extension <-> Extension:    vscode.extensions.getExtension() + exports
Extension <-> Claude Code:  Via supervisor tmux API (never direct)
Extension <-> Browser:      (NOT YET - v1.2 target)
Webview <-> Extension:      postMessage / onDidReceiveMessage
```

### Current Webview CSS Pattern

All three webview panels (home, secrets, self-improve) use inline CSS with:
- `var(--vscode-*)` CSS variables for theme integration
- Custom brand variables: `--claudeos-accent: #c084fc`, `--claudeos-gradient-start/end`
- Body classes: `vscode-light`, `vscode-dark`, `vscode-high-contrast`
- CSP nonce for style and script tags
- HTML/CSS/JS embedded as TypeScript template literals

### Current Terminal Pattern

Sessions use VS Code's Pseudoterminal API:
- `SessionPseudoterminal` implements `vscode.Pseudoterminal`
- I/O proxied: user keystrokes -> supervisor REST API -> tmux send-keys
- tmux output -> supervisor WebSocket -> Pseudoterminal.onDidWrite
- Input buffered character-by-character, flushed on Enter
- No raw PTY passthrough (line-oriented)

---

## Feature 1: Unified Theming

### Integration Points

**Problem:** Three webview panels and the setup wizard each define their own CSS with hardcoded ClaudeOS brand colors. The VS Code editor uses "Default Dark Modern". There is no single source of truth for the ClaudeOS look.

**Solution: Create a `claudeos-theme` color theme extension.**

### New Component: `claudeos-theme` Extension

This is a declarative-only extension (no activate() code needed). It contributes a VS Code color theme via `package.json`:

```json
{
  "name": "claudeos-theme",
  "contributes": {
    "themes": [{
      "label": "ClaudeOS Dark",
      "uiTheme": "vs-dark",
      "path": "./themes/claudeos-dark.json"
    }]
  }
}
```

The theme JSON file defines:
- All `workbench.*` colors (editor background, sidebar, activity bar, etc.)
- ClaudeOS brand palette as workbench color overrides
- Custom token colors for syntax highlighting
- Optional: register custom color IDs via `contributes.colors` for brand tokens

**How webviews consume this:** VS Code automatically exposes all theme colors as CSS variables in webview `<html>` elements. When the user switches themes, all CSS variables update automatically. The existing webview panels already use `var(--vscode-editor-background)`, `var(--vscode-foreground)`, etc. The key change is:

1. **Remove hardcoded brand colors** from each webview's inline CSS
2. **Register custom color contributions** in the theme extension:
   ```json
   "contributes": {
     "colors": [{
       "id": "claudeos.accent",
       "description": "ClaudeOS primary accent color",
       "defaults": { "dark": "#c084fc", "light": "#7c3aed" }
     }]
   }
   ```
3. **Reference in webviews** as `var(--vscode-claudeos-accent)` -- VS Code auto-converts the dot-separated ID to a CSS variable with `--vscode-` prefix and dash separation.
4. **Apply theme on install** by updating `settings.json` to use `"workbench.colorTheme": "ClaudeOS Dark"`.

### Modified Components

| Component | Change | Why |
|-----------|--------|-----|
| `config/settings.json` | Change `colorTheme` to `"ClaudeOS Dark"` | Auto-apply on fresh install |
| `claudeos-home/src/webview/home-panel.ts` | Replace `--claudeos-*` vars with `--vscode-claudeos-*` | Single source of truth |
| `claudeos-secrets/src/webview/secrets-panel.ts` | Same CSS variable migration | Consistent theming |
| `claudeos-self-improve` webview | Same CSS variable migration | Consistent theming |
| `first-boot/setup.html` | Add theme variables OR keep standalone (runs before code-server) | Wizard runs pre-theme |
| `config/default-extensions.json` | Add `claudeos-theme` entry | Auto-install theme |

### Architecture Decision: Wizard Theming

The setup wizard runs **before** code-server boots (served by the supervisor on port 8080). It cannot use VS Code CSS variables because there is no VS Code context. Two options:

**Option A (Recommended): Shared CSS constants file.** Export brand colors from a shared `theme-tokens.ts` that both the theme JSON and wizard HTML import at build time. The wizard uses literal color values; the VS Code webviews use CSS variables that resolve to the same values.

**Option B: Leave wizard standalone.** The wizard is a one-time screen. Its current purple gradient already matches the brand. No change needed since users only see it once.

**Recommendation:** Option B for v1.2. The wizard works and is seen once. Invest theming effort in the panels users see daily.

### Data Flow Change

```
BEFORE: Each webview -> hardcoded CSS colors
AFTER:  claudeos-theme extension -> VS Code theme engine -> CSS variables -> all webviews
```

**Confidence:** HIGH. VS Code's `contributes.themes` and `contributes.colors` are stable, well-documented APIs. The CSS variable mechanism for webviews is the official recommended approach.

---

## Feature 2: Session View Redesign (Terminal UI like opencode)

### Integration Points

**Problem:** The current session view uses VS Code's Pseudoterminal API, which renders sessions as plain terminal tabs. The Pseudoterminal API is intentionally limited -- no custom UI, no split panes, no status overlays. The target UX (like opencode's TUI) wants a richer session view with status indicators, conversation threading, and better visual treatment of Claude Code output.

**Solution: Replace Pseudoterminal with a WebviewPanel embedding xterm.js.**

### Approach: xterm.js in a WebviewPanel

The current `SessionPseudoterminal` uses VS Code's terminal API which provides zero UI customization. A webview panel with xterm.js gives full control:

```
CURRENT:
  Session click -> VS Code Terminal tab (Pseudoterminal)
    -> Raw text I/O via writeEmitter/handleInput
    -> No custom UI possible

PROPOSED:
  Session click -> WebviewPanel with embedded xterm.js
    -> xterm.js renders ANSI output with proper terminal emulation
    -> Custom UI overlay: status bar, session info, action buttons
    -> WebSocket connection to supervisor for I/O streaming
```

### New Component: Session WebviewPanel

Replace `TerminalManager` + `SessionPseudoterminal` with a new `SessionPanel`:

```typescript
// claudeos-sessions/src/webview/session-panel.ts
export class SessionPanel {
  private panel: vscode.WebviewPanel;

  static createOrShow(context: vscode.ExtensionContext, session: Session): void {
    const panel = vscode.window.createWebviewPanel(
      'claudeos.session',
      session.name,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,  // Keep xterm state when panel hidden
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'out', 'webview'),
        ],
      },
    );
    // ... wire up message passing
  }
}
```

The webview HTML bundles xterm.js and connects to the supervisor WebSocket:

```
WebviewPanel HTML:
  <div id="session-status">  // Custom overlay: session name, status, tokens used
  <div id="terminal">        // xterm.js Terminal instance
  <div id="input-area">      // Optional: styled input area with send button

JavaScript:
  const term = new Terminal({ ... });
  const ws = new WebSocket('ws://localhost:3100/api/v1/ws');
  ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
  ws.onmessage = (e) => { term.write(JSON.parse(e.data).data); };
  term.onData((data) => {
    fetch(`http://localhost:3100/api/v1/sessions/${sessionId}/input`, {
      method: 'POST', body: JSON.stringify({ text: data })
    });
  });
```

### Modified Components

| Component | Change | Why |
|-----------|--------|-----|
| `claudeos-sessions/package.json` | Add xterm.js dependency | Terminal rendering in webview |
| `claudeos-sessions/src/terminal/*` | Remove or keep as fallback | Replaced by webview |
| `claudeos-sessions/src/webview/session-panel.ts` | NEW | Rich session view |
| `claudeos-sessions/src/extension.ts` | Wire `openTerminal` to SessionPanel instead of TerminalManager | Entry point change |
| Build config (esbuild) | Bundle xterm.js for webview separately | Webview needs its own bundle |

### Architecture Decision: WebSocket in Webview vs Message Passing

**Option A: Direct WebSocket from webview to supervisor.**
The webview JavaScript opens a WebSocket to `ws://localhost:3100/api/v1/ws`. This works because code-server's webview iframes have access to localhost. Simpler architecture, lower latency.

**Option B: Extension host as proxy.**
The webview sends `postMessage` to the extension host, which proxies to the supervisor via the existing `WsClient`. More indirection but follows VS Code's security model more closely.

**Recommendation: Option A for output streaming, Option B for commands.** Stream tmux output directly over WebSocket for performance (terminal rendering is latency-sensitive). Route commands (create, stop, kill, send-input) through the extension host via postMessage so the extension can coordinate state (e.g., updating the tree view after a kill).

### CSP Considerations

The webview CSP must allow:
```
connect-src ws://localhost:3100 http://localhost:3100;
```

This is acceptable because the supervisor is container-internal only. The CSP should NOT allow arbitrary WebSocket connections.

### xterm.js Bundling Strategy

xterm.js needs to be bundled separately for the webview context (browser environment, not Node.js):

```bash
# Separate esbuild entry for webview JavaScript
esbuild src/webview/session-webview.ts \
  --bundle --platform=browser --format=iife \
  --outfile=out/webview/session.js
```

The extension's main bundle (Node.js context) and the webview bundle (browser context) are separate artifacts. The extension serves the webview bundle via `localResourceRoots`.

### Dependency: xterm.js Version

Use `@xterm/xterm` (the v5+ scoped package). As of late 2025, xterm.js v5.x is current. Key addons needed:
- `@xterm/addon-fit` -- auto-resize terminal to container
- `@xterm/addon-webgl` -- GPU-accelerated rendering (optional, falls back to canvas)
- `@xterm/addon-web-links` -- clickable URLs in output

**Confidence:** MEDIUM. Embedding xterm.js in a VS Code webview is well-precedented (vscode-sidebar-terminal, multiple community extensions), but the interaction between xterm.js keyboard handling and VS Code's keybinding system needs testing. VS Code may intercept keystrokes (Ctrl+C, Ctrl+V, etc.) before they reach the webview.

### Risk: Keyboard Input Passthrough

VS Code intercepts many keybindings (Ctrl+C, Ctrl+P, Ctrl+Shift+`, etc.) before they reach webview content. The current Pseudoterminal approach avoids this because VS Code knows terminal tabs are "terminals" and routes input accordingly. A webview-based terminal does NOT get this treatment.

**Mitigation:** Use `retainContextWhenHidden: true` and register `when` clause keybindings that delegate to the webview when it has focus. Alternatively, keep the Pseudoterminal as the "quick open" path and use the webview as an "enhanced view" toggled by user preference.

---

## Feature 3: Workspace Manager

### Integration Points

**Problem:** ClaudeOS currently opens to a single workspace (typically `/home/coder` or the mounted project directory). Users want to manage multiple project directories, switch between them, and associate Claude Code sessions with specific workspaces.

**Solution: New `claudeos-workspace-manager` extension that replaces the Copilot sidebar slot.**

### New Component: `claudeos-workspace-manager` Extension

```json
{
  "name": "claudeos-workspace-manager",
  "contributes": {
    "viewsContainers": {
      "activitybar": [{
        "id": "claudeos-workspaces",
        "title": "Workspaces",
        "icon": "$(folder-library)"
      }]
    },
    "views": {
      "claudeos-workspaces": [{
        "id": "claudeos.workspaces",
        "name": "Workspaces"
      }]
    },
    "commands": [
      { "command": "claudeos.workspaces.add", "title": "Add Workspace Folder" },
      { "command": "claudeos.workspaces.remove", "title": "Remove Workspace Folder" },
      { "command": "claudeos.workspaces.switch", "title": "Switch Workspace" }
    ]
  }
}
```

### Mechanism: Multi-Root Workspaces

VS Code supports multi-root workspaces via `vscode.workspace.updateWorkspaceFolders()`:

```typescript
// Add a folder to the workspace
vscode.workspace.updateWorkspaceFolders(
  vscode.workspace.workspaceFolders?.length ?? 0,
  null,
  { uri: vscode.Uri.file('/path/to/project'), name: 'My Project' }
);

// Remove a folder (index 1)
vscode.workspace.updateWorkspaceFolders(1, 1);
```

This API triggers VS Code to update the explorer, file watchers, and all extension contexts. No reload required for adding folders.

### Architecture Decision: Multi-Root vs Workspace Files

**Option A (Recommended): Multi-root workspace via API.**
Use `updateWorkspaceFolders` to dynamically add/remove project directories. The workspace stays in-memory. Simple, no file management needed.

**Option B: Workspace files (.code-workspace).**
Create and switch between `.code-workspace` files. Requires VS Code to reload when switching. More complex, slower.

**Recommendation:** Option A. Multi-root workspace API is the correct approach for a dynamic workspace manager. Workspace files are for persistent multi-root configs -- unnecessary overhead when the extension manages state.

### Data Flow

```
User clicks "Add Workspace" in sidebar
  -> Extension prompts for path (or lists known project dirs)
  -> Extension calls vscode.workspace.updateWorkspaceFolders()
  -> VS Code updates Explorer, file watchers, etc.
  -> Extension persists workspace list to globalState

User creates session in workspace context
  -> Extension reads active workspace folder
  -> Passes workdir to supervisor POST /sessions { workdir: "/path/to/project" }
  -> Claude Code session starts in that directory
```

### Modified Components

| Component | Change | Why |
|-----------|--------|-----|
| `config/settings.json` | Disable Copilot sidebar if present | Make room for workspace sidebar |
| `config/default-extensions.json` | Add `claudeos-workspace-manager` | Auto-install |
| `claudeos-sessions` | Optional: read workspace context for new session `workdir` | Session-workspace association |
| `claudeos-home` | Optional: show workspace folders on home page | Quick access |

### State Management

Workspace folders persisted in `context.globalState`:
```typescript
interface WorkspaceConfig {
  folders: Array<{
    path: string;
    name: string;
    lastOpened: string;  // ISO timestamp
  }>;
  activeFolder: string | null;
}
```

### Copilot Sidebar Removal

code-server may ship with GitHub Copilot sidebar contributions. To disable:

```json
// settings.json
{
  "github.copilot.enable": { "*": false },
  "github.copilot.editor.enableAutoCompletions": false
}
```

Or better: the workspace-manager extension simply claims the same activity bar position. VS Code allows multiple sidebar items; Copilot's will just be lower priority if not installed.

**Confidence:** HIGH. `updateWorkspaceFolders` is a stable, well-documented VS Code API. Multi-root workspaces are a core VS Code feature.

---

## Feature 4: Browser Extension (Claude in Chrome)

### Integration Points

**Problem:** ClaudeOS needs a Chrome extension that communicates with the ClaudeOS VS Code environment for session management and eventually for UI self-testing via Claude in Chrome.

**Key Insight from Research:** Claude Code already has a "Claude in Chrome" extension that uses **native messaging** to connect Chrome to Claude Code sessions. The architecture is:

```
Chrome Extension (MV3 service worker)
    |
    | Native Messaging (stdin/stdout)
    v
Native Messaging Host (installed by Claude Code)
    |
    | Unix socket (/tmp/claude-mcp-browser-bridge-<user>/<pid>.sock)
    v
Claude Code MCP Server (claude-in-chrome MCP)
```

### Architecture Decision: Build Custom vs Leverage Existing

**Option A: Leverage existing Claude in Chrome extension.**
Claude Code's `--chrome` flag and `/chrome` command already provide browser automation via the official "Claude in Chrome" extension (Chrome Web Store). ClaudeOS Claude Code sessions can use `--chrome` to get browser capabilities out of the box.

**Option B: Build a custom ClaudeOS Chrome extension.**
A separate extension that communicates directly with the ClaudeOS supervisor API for session management, workspace switching, etc.

**Option C (Recommended): Both -- use existing for browser automation, build lightweight custom for ClaudeOS UI.**

### Recommended Architecture

#### 4a. Claude in Chrome for Browser Automation (No Build Required)

Claude Code sessions in ClaudeOS already support `--chrome` flag. The integration flow:

```
ClaudeOS Container:
  Claude Code session (tmux)
    |
    | --chrome flag / /chrome command
    v
  Native Messaging Host (installed by `claude --chrome` first run)
    |
    | Unix socket
    v
  claude-in-chrome MCP server (bundled with Claude Code)
    |
    | Native Messaging protocol
    v
User's Chrome browser (running Claude in Chrome extension)
```

**What ClaudeOS needs to do:**
1. Ensure the `--chrome` flag is passed when creating sessions (configurable per session)
2. Add a supervisor API field: `POST /sessions { ..., chromeEnabled: true }`
3. Document that users need the "Claude in Chrome" extension installed in their browser

**Blocker for Docker deployment:** Native messaging requires Chrome running on the **same machine** as Claude Code. In a Docker/Railway deployment, Chrome is on the user's local machine but Claude Code is in the container. The native messaging host file expects a local binary path.

**Mitigation:** This feature works for **local development** (Docker Compose with host network, or native install). For Railway deployments, the native messaging bridge would need to tunnel through the network -- this is an open problem that Claude Code itself is working on (the `bridge.claudeusercontent.com` WebSocket bridge, currently in development).

#### 4b. ClaudeOS Chrome Extension for Session Management (New Build)

A lightweight Chrome extension (Manifest V3) that communicates with the ClaudeOS supervisor:

```
Chrome Extension (MV3)
    |
    | HTTP/WebSocket to ClaudeOS supervisor
    v
ClaudeOS Supervisor (:3100 or proxied through :8080)
```

**Capabilities:**
- List active Claude Code sessions
- View session output in a popup/sidebar
- Quick-create sessions from browser context
- Send URLs or page content to sessions

**Communication:** Since the supervisor runs on localhost:3100 (or is exposed via code-server's proxy on :8080), the Chrome extension can use standard `fetch()` and `WebSocket` from its service worker. MV3 supports WebSocket connections with keepalive pings (Chrome 116+).

### New Components

| Component | Type | Purpose |
|-----------|------|---------|
| `claudeos-chrome-ext/` | Chrome Extension (MV3) | Session management from Chrome |
| `claudeos-chrome-ext/manifest.json` | MV3 manifest | Extension config |
| `claudeos-chrome-ext/service-worker.ts` | Background script | WebSocket to supervisor |
| `claudeos-chrome-ext/popup/` | React popup UI | Session list and controls |
| `claudeos-chrome-ext/content.ts` | Content script (optional) | Page context extraction |

### MV3 Manifest Structure

```json
{
  "manifest_version": 3,
  "name": "ClaudeOS",
  "permissions": ["activeTab", "storage"],
  "host_permissions": ["http://localhost:3100/*", "http://localhost:8080/*"],
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup/index.html"
  }
}
```

### Modified Components (Supervisor Side)

| Component | Change | Why |
|-----------|--------|-----|
| `supervisor/src/routes/sessions.ts` | Add CORS headers for Chrome extension origin | Allow cross-origin requests |
| `supervisor/src/server.ts` | Register `@fastify/cors` for extension origin | CORS middleware |
| `supervisor/src/ws/handler.ts` | Handle CORS for WebSocket upgrade | WS from extension |

### Architecture Decision: CORS and Security

The supervisor currently has no CORS configuration because it is only accessed from within the container (extensions run in the same origin as code-server). A Chrome extension on the user's browser is a different origin.

**Solution:** Add `@fastify/cors` with a restrictive allowlist:
```typescript
await server.register(cors, {
  origin: [
    'chrome-extension://<known-extension-id>',  // ClaudeOS Chrome extension
  ],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  credentials: false,
});
```

For local development, also allow `http://localhost:*`. For Railway, the supervisor is behind code-server's proxy and not directly accessible from the browser -- the Chrome extension would go through the code-server port (8080) which already handles auth.

**Confidence:** MEDIUM. HTTP/WebSocket communication between Chrome MV3 extensions and localhost is well-established. The open question is how to handle authentication (code-server's password) from the Chrome extension without storing credentials in Chrome extension storage.

---

## Feature 5: UI Self-Testing via Claude in Chrome

### Integration Points

**Problem:** ClaudeOS needs to self-test its own UI. When Claude Code builds or modifies extensions, it should verify the UI renders correctly by actually looking at it in a browser.

**Solution: Use Chrome DevTools MCP to let Claude Code sessions inspect and interact with the code-server UI.**

### Architecture

```
Claude Code session (with --chrome flag)
    |
    | MCP tool call: navigate, screenshot, click, inspect
    v
Chrome DevTools MCP Server
    |
    | Chrome DevTools Protocol (CDP)
    v
Chrome browser tab showing code-server (:8080)
    |
    | User's live ClaudeOS UI
    v
Claude Code sees the result, validates UI, iterates
```

### Two MCP Approaches

**Approach A (Recommended): Chrome DevTools MCP (by Google)**
The `chrome-devtools-mcp` npm package provides:
- `browser_navigate` -- navigate to URL
- `browser_screenshot` -- capture screenshot
- `browser_click` -- click elements
- `browser_type` -- type text
- `browser_console_messages` -- read console output
- `browser_network_requests` -- monitor network

Claude Code sessions can use this to:
1. Navigate to `http://localhost:8080`
2. Screenshot the home panel
3. Click on session cards
4. Verify webview content renders
5. Check console for errors

**Approach B: Claude in Chrome (by Anthropic)**
The official `claude-in-chrome` MCP provides similar browser automation but through Anthropic's native messaging bridge. Same capabilities, different plumbing.

**Recommendation:** Use Chrome DevTools MCP because:
1. It works via CDP which can connect to any Chrome instance (including headless)
2. No native messaging host required (CDP uses WebSocket)
3. Can target specific tabs, including code-server's webview iframes
4. Better for automated testing workflows (headless Chrome in CI)

### New Component: Self-Test MCP Configuration

Add Chrome DevTools MCP to Claude Code's MCP config when a session is created for self-testing:

```json
// Added to ~/.claude/mcp_servers.json by claudeos-self-improve extension
{
  "chrome-devtools": {
    "command": "npx",
    "args": ["chrome-devtools-mcp@latest"]
  }
}
```

Or configure per-session via the supervisor API:
```
POST /sessions {
  name: "UI Test",
  mcpServers: { "chrome-devtools": { ... } }
}
```

### Modified Components

| Component | Change | Why |
|-----------|--------|-----|
| `claudeos-self-improve` | Add Chrome DevTools MCP registration on activate | Enable browser tools for self-test sessions |
| `claudeos-self-improve/skill/` | Add self-testing skill file with instructions | Tell Claude how to test ClaudeOS UI |
| `supervisor/src/routes/sessions.ts` | Optional: `mcpServers` field in create session | Per-session MCP config |
| Container (`Dockerfile`/`flake.nix`) | Ensure `chrome-devtools-mcp` is available | npm package in PATH |

### Self-Testing Workflow

```
1. User (or Claude) triggers: "Test the home page UI"
2. claudeos-self-improve creates a self-test session with Chrome DevTools MCP
3. Claude Code session receives skill file with testing instructions:
   - Navigate to localhost:8080
   - Screenshot each panel
   - Verify expected elements present
   - Check console for errors
   - Report results
4. Claude Code uses MCP tools to execute the test
5. Results reported back via session output
```

### Blocker: Headless Chrome in Container

For Railway/Docker deployments, there is no Chrome browser running in the container. Options:

**Option A (Recommended for local):** User has Chrome running locally. Chrome DevTools MCP connects to it via CDP.

**Option B (Future, for CI):** Add headless Chromium to the container image. Heavy (~400MB), but enables fully automated UI testing without a user's browser.

**Option C (Practical compromise):** UI self-testing is a local-development-only feature for v1.2. Document this clearly.

**Recommendation:** Option C for v1.2. UI self-testing is inherently a development workflow, not a production feature. Keep the container lean.

**Confidence:** MEDIUM. Chrome DevTools MCP is well-documented and works with Claude Code. The uncertainty is around CDP connection setup within a Docker container to a host's Chrome instance (network bridging).

---

## Default Extensions: Local vs Remote

### Integration Point

**Problem:** Default extensions are currently specified in `default-extensions.json` with `local-vsix` paths. The VSIX files are built during Docker image construction and copied to `/app/extensions/`. The v1.2 target wants extensions moved to the repo for version control.

### Current Flow

```
Dockerfile:
  COPY claudeos-sessions/ /tmp/build/claudeos-sessions/
  RUN cd /tmp/build/claudeos-sessions && npm ci && npm run package
  RUN cp /tmp/build/claudeos-sessions/*.vsix /app/extensions/

default-extensions.json:
  [{ "method": "local-vsix", "localPath": "/app/extensions/claudeos-sessions.vsix" }]

Boot:
  BootService.installExtensions() reads default-extensions.json
  For each entry: code-server --install-extension <path>
```

### Proposed Change

Move all extension source directories into the monorepo (already done -- they are at `/Users/bennett/Desktop/Projects/ClaudeOS/claudeos-*/`). The Dockerfile builds them in place:

```
No change to architecture. The extensions already live in the repo.
default-extensions.json already uses local-vsix method.
Nix flake already builds each extension derivation.
```

This is essentially already implemented. The v1.2 work here is cosmetic: ensuring the extension directories are properly organized and the build pipeline is clean.

**Confidence:** HIGH. Already working.

---

## Component Boundary Map

### New Extensions (v1.2)

| Extension | Depends On | Provides | Communication |
|-----------|-----------|----------|---------------|
| `claudeos-theme` | None | Color theme | Declarative (package.json contributes.themes) |
| `claudeos-workspace-manager` | None (optional: claudeos-sessions) | Workspace tree view | VS Code `updateWorkspaceFolders` API |
| `claudeos-chrome-ext` (browser) | None | Chrome popup UI | HTTP/WS to supervisor |

### Modified Extensions (v1.2)

| Extension | Modification | Integration Point |
|-----------|-------------|-------------------|
| `claudeos-sessions` | xterm.js webview panel | WS direct to supervisor, postMessage for commands |
| `claudeos-home` | CSS variable migration, workspace integration | Theme CSS variables |
| `claudeos-secrets` | CSS variable migration | Theme CSS variables |
| `claudeos-self-improve` | Chrome DevTools MCP registration, self-test skill | MCP config file |

### Modified Infrastructure

| Component | Modification | Why |
|-----------|-------------|-----|
| `supervisor/src/server.ts` | CORS for Chrome extension | Cross-origin requests |
| `config/settings.json` | Theme reference, Copilot disable | Default branding |
| `config/default-extensions.json` | Add theme + workspace-manager | Auto-install |

---

## Suggested Build Order

The build order is constrained by dependencies between features:

```
Phase 1: Theme Extension (no dependencies, enables all other UI work)
  |
  +-- claudeos-theme extension (new, declarative only)
  +-- CSS variable migration in home, secrets, self-improve webviews
  +-- settings.json update to use new theme
  |
Phase 2: Session View Redesign (depends on theme for consistent styling)
  |
  +-- xterm.js webview panel in claudeos-sessions
  +-- WebSocket direct connection from webview
  +-- Custom UI overlay (session status, action buttons)
  +-- Keyboard input passthrough testing
  |
Phase 3: Workspace Manager (independent, but benefits from theme)
  |
  +-- claudeos-workspace-manager extension (new)
  +-- Multi-root workspace API integration
  +-- Session-workspace association
  +-- Copilot sidebar replacement
  |
Phase 4: Browser Extension + Self-Testing (depends on supervisor CORS)
  |
  +-- Supervisor CORS configuration
  +-- ClaudeOS Chrome extension (new, MV3)
  +-- Chrome DevTools MCP integration in self-improve
  +-- Self-testing skill file and workflow
  +-- Documentation for local-only Chrome features
```

### Rationale

1. **Theme first** because every other feature needs consistent styling. Building the session view with hardcoded colors and then migrating is waste.
2. **Session view second** because it is the most complex feature (xterm.js bundling, WebSocket plumbing, keyboard handling) and the most visible user-facing improvement.
3. **Workspace manager third** because it is independent and straightforward (standard VS Code API, no new protocols).
4. **Browser extension last** because it depends on CORS changes and is partially blocked by deployment constraints (local-only for Docker).

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Forking xterm.js or Bundling VS Code's Internal Terminal
**What:** Trying to import VS Code's internal xterm.js instance or accessing `vscode.Terminal` internals.
**Why bad:** VS Code does not expose the underlying xterm.js Terminal object from extensions. The internal terminal API is private.
**Instead:** Bundle your own xterm.js in the webview. This is a separate instance from VS Code's terminal.

### Anti-Pattern 2: Building a Custom Native Messaging Host
**What:** Building a native messaging host from scratch to connect Chrome to ClaudeOS.
**Why bad:** Claude Code already has a native messaging host (`com.anthropic.claude_code_browser_extension`). Building another creates conflicts and maintenance burden.
**Instead:** Use Claude Code's existing Chrome integration (`--chrome` flag) for browser automation. Build the ClaudeOS Chrome extension to communicate via HTTP/WebSocket (no native messaging needed).

### Anti-Pattern 3: Applying Theme Programmatically via Extension Code
**What:** Using `vscode.workspace.getConfiguration().update('workbench.colorTheme', ...)` in extension activate().
**Why bad:** Overrides user choice. Race condition if multiple extensions try to set the theme.
**Instead:** Ship theme as a `contributes.themes` contribution. Set as default in `settings.json`. User can always change it.

### Anti-Pattern 4: Passing tmux Output Through Extension Host to Webview
**What:** Routing all terminal I/O through extension host postMessage: supervisor WS -> extension host -> postMessage -> webview.
**Why bad:** Adds ~10ms latency per frame. Terminal rendering at 60fps would saturate the message channel.
**Instead:** Let the webview open a direct WebSocket to the supervisor for output streaming. Only route commands through the extension host.

### Anti-Pattern 5: Using `vscode.workspace.openTextDocument` for Workspace Switching
**What:** Opening files from different directories to "switch" workspaces.
**Why bad:** Does not update the explorer, file watchers, or workspace context. Just opens a file.
**Instead:** Use `vscode.workspace.updateWorkspaceFolders()` to properly add/remove workspace roots.

---

## Scalability Considerations

| Concern | At 5 sessions | At 20 sessions | At 100+ sessions |
|---------|---------------|----------------|-------------------|
| WebSocket connections | 5 concurrent WS per webview | 20 concurrent; pool and close idle | Limit active panels; share single WS with multiplexing |
| xterm.js memory | ~5MB per instance (fine) | ~100MB total; close hidden panels | Must dispose off-screen; use `retainContextWhenHidden: false` |
| Theme extension | Zero runtime cost (declarative) | Zero runtime cost | Zero runtime cost |
| Workspace folders | VS Code handles fine | Some file watcher overhead | Likely degrades; limit to ~10 roots |
| Chrome extension WS | Single connection, fine | Single connection, fine | Single connection, fine |

---

## Sources

- [VS Code Theme Color Reference](https://code.visualstudio.com/api/references/theme-color) -- Official theme color IDs
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview) -- Webview CSS variables, CSP, messaging
- [VS Code Color Theme Guide](https://code.visualstudio.com/api/extension-guides/color-theme) -- contributes.themes structure
- [VS Code Contribution Points](https://code.visualstudio.com/api/references/contribution-points) -- contributes.colors for custom color IDs
- [xterm.js GitHub](https://github.com/xtermjs/xterm.js) -- Terminal emulator for webviews
- [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) -- Native messaging host protocol
- [Chrome MV3 WebSocket Guide](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets) -- WebSocket in service workers
- [VS Code Multi-Root Workspaces](https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces) -- updateWorkspaceFolders API
- [Claude Code Chrome Docs](https://code.claude.com/docs/en/chrome) -- Claude in Chrome architecture and native messaging host
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) -- CDP-based MCP server for browser automation
- [VS Code Pseudoterminal Limitations](https://github.com/ShMcK/vscode-pseudoterminal) -- Why webview+xterm.js beats Pseudoterminal
- [vscode-sidebar-terminal](https://github.com/lekman/vscode-sidebar-terminal) -- Reference: xterm.js in VS Code webview
- [VS Code Issue #276946](https://github.com/microsoft/vscode/issues/276946) -- Embed xterm.js in webview panels
