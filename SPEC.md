# SPEC.md — ClaudeOS Technical Specification

## 1. System Overview

ClaudeOS is a browser-accessible operating environment for Claude Code. It provides a VS Code-based UI (via code-server) wrapped around stock Claude Code, with a modular extension system for adding features. The core thesis: Claude Code is powerful enough to be the engine; it just needs a real UI and a way to extend itself.

### Design dogmas

1. **Claude Code is sacred.** It runs stock, unmodified, in tmux. We never patch, wrap, or proxy it.
2. **Don't reinvent what Claude Code already does.** If Claude Code has a feature, use it as-is.
3. **Everything is an extension.** The kernel boots the system. Extensions provide all user-facing functionality.
4. **Forward-compatible.** When Claude Code updates, ClaudeOS should keep working. This is why we never modify Claude Code and only interact with it through tmux and its public CLI.
5. **Self-expanding.** ClaudeOS can be prompted to build new extensions for itself, test them, and install them at runtime.

### System components

```
┌─────────────────────────────────────────────────────────────────┐
│  Container (Nix flake / Docker)                                 │
│                                                                 │
│  ┌─────────────────────────────┐                                │
│  │  Supervisor (:3100)         │                                │
│  │  - Boot sequence            │                                │
│  │  - Session API              │                                │
│  │  - Extension installer      │                                │
│  └──────────┬──────────────────┘                                │
│             │                                                   │
│  ┌──────────▼──────────────────┐   ┌──────────────────────────┐ │
│  │  code-server (:8080)        │   │  Claude Code (via tmux)  │ │
│  │  + product.json branding    │   │  - Stock installation    │ │
│  │  + default settings         │   │  - One tmux session per  │ │
│  │  + installed extensions     │   │    Claude Code session   │ │
│  └─────────────────────────────┘   └──────────────────────────┘ │
│                                                                 │
│  Extensions communicate with Supervisor via HTTP (:3100)        │
│  Extensions communicate with each other via VS Code ext API     │
│  Extensions interact with Claude Code sessions via tmux         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. The Kernel

### 2.1 File structure

```
claudeos/
├── flake.nix
├── Dockerfile
├── docker-compose.yml
├── railway.toml
├── supervisor/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts              # Entry point: boot sequence
│   │   ├── session-api.ts        # HTTP API for session management
│   │   ├── extension-installer.ts # First-boot extension installation
│   │   └── types.ts              # Shared types
│   └── test/
│       ├── session-api.test.ts
│       └── extension-installer.test.ts
├── product.json
├── settings.json
├── default-extensions.json
├── extension-template/
│   ├── package.json
│   ├── tsconfig.json
│   ├── AGENTS.md
│   ├── src/
│   │   └── extension.ts
│   ├── webview/                   # Optional: for extensions with UI panels
│   └── mcp-server/               # Optional: for extensions that add Claude Code tools
├── scripts/
│   ├── build.sh
│   ├── dev.sh
│   └── deploy-railway.sh
├── AGENTS.md
├── SPEC.md
└── README.md
```

### 2.2 Boot sequence (`supervisor/src/index.ts`)

1. Read environment variables and configuration.
2. Ensure Claude Code is installed and accessible (check `claude --version`).
3. Ensure tmux is installed.
4. Start the session API HTTP server on `localhost:3100`.
5. Run first-boot extension installation if needed (see §2.4).
6. Start code-server on the configured port (`$PORT` or 8080) with:
   - `--auth password` using `$CLAUDEOS_AUTH_TOKEN`
   - Custom `product.json` for branding and extension gallery
   - Custom `settings.json` for defaults
7. Log startup complete.

### 2.3 Session API (`supervisor/src/session-api.ts`)

HTTP API on `localhost:3100`. Only accessible from within the container (never exposed externally). Extensions call this API to manage Claude Code sessions.

#### Endpoints

**`GET /api/health`**
Returns supervisor health and version.

```json
{
  "status": "ok",
  "version": "0.1.0",
  "claudeCodeVersion": "1.2.3",
  "uptime": 3600
}
```

**`GET /api/sessions`**
Lists all Claude Code sessions (tmux windows).

```json
{
  "sessions": [
    {
      "id": "ses_abc123",
      "name": "Debug auth flow",
      "status": "active",        // "active" | "idle" | "waiting_for_input"
      "createdAt": "2026-03-11T10:00:00Z",
      "lastActivityAt": "2026-03-11T10:05:00Z"
    }
  ]
}
```

**`POST /api/sessions`**
Creates a new Claude Code session.

```json
// Request
{
  "name": "Debug auth flow",           // Optional display name
  "prompt": "Fix the login bug in...", // Optional initial prompt
  "workdir": "/home/user/project",     // Optional working directory
  "model": "claude-sonnet-4-6",      // Optional model override
  "flags": ["--dangerously-skip-permissions"] // Optional CLI flags
}

// Response
{
  "id": "ses_abc123",
  "name": "Debug auth flow",
  "status": "active",
  "tmuxSession": "claudeos_ses_abc123",
  "createdAt": "2026-03-11T10:00:00Z"
}
```

Implementation: Creates a tmux session named `claudeos_{id}` and runs `claude code` (or `claude` depending on installation) with the specified options inside it.

**`POST /api/sessions/:id/send`**
Sends a message/input to an existing session.

```json
// Request
{
  "text": "Yes, proceed with the refactor"
}
```

Implementation: Sends keystrokes to the tmux session via `tmux send-keys`.

**`POST /api/sessions/:id/stop`**
Gracefully stops a session (sends interrupt signal).

**`POST /api/sessions/:id/kill`**
Force-kills a session (destroys tmux window).

**`GET /api/sessions/:id/output`**
Captures current terminal output from the tmux session.

```json
{
  "output": "...",           // Current visible terminal content
  "scrollback": "..."       // Optional: full scrollback buffer
}
```

**`POST /api/sessions/:id/archive`**
Marks a session as archived. Archived sessions are stopped and their scrollback is saved to disk but can be revived.

**`POST /api/sessions/:id/revive`**
Revives an archived session by starting a new Claude Code session and feeding it the previous context/conversation.

**`DELETE /api/sessions/:id`**
Permanently deletes a session and its saved data.

**`GET /api/extensions`**
Lists installed extensions and their status.

**`POST /api/extensions/install`**
Installs an extension from a GitHub repo.

```json
// Request
{
  "repo": "https://github.com/claude-nix-os/claudeos-memory",
  "ref": "v0.2.0",                    // Optional: tag, branch, or commit
  "secretName": "github-pat-private"   // Optional: secret name for private repos
}
```

Implementation: Clones the repo (using the secret as auth if provided), builds the VSIX, installs it via `code-server --install-extension`, and triggers a window reload notification.

**`POST /api/extensions/uninstall`**
Uninstalls an extension.

```json
{
  "extensionId": "claudeos.claudeos-memory"
}
```

### 2.4 First-boot extension installation (`supervisor/src/extension-installer.ts`)

On first boot (detected by absence of a `.claudeos-initialized` marker file):

1. Read `default-extensions.json`.
2. For each entry, clone the GitHub repo, build the VSIX, and install it into code-server.
3. Write `.claudeos-initialized` marker.

On subsequent boots, skip this step. Extensions are already installed in code-server's extension directory and persist across restarts.

`default-extensions.json` format:

```json
[
  {
    "repo": "https://github.com/claude-nix-os/claudeos-sessions",
    "ref": "v0.1.0"
  },
  {
    "repo": "https://github.com/claude-nix-os/claudeos-terminal",
    "ref": "v0.1.0"
  },
  {
    "repo": "https://github.com/claude-nix-os/claudeos-home",
    "ref": "v0.1.0"
  },
  {
    "repo": "https://github.com/claude-nix-os/claudeos-secrets",
    "ref": "v0.1.0"
  },
  {
    "repo": "https://github.com/claude-nix-os/claudeos-self-improve",
    "ref": "v0.1.0"
  }
]
```

### 2.5 code-server configuration

**`product.json`** — Branding and extension gallery:

```json
{
  "nameShort": "ClaudeOS",
  "nameLong": "ClaudeOS",
  "applicationName": "claudeos",
  "welcomePage": "none"
}
```

Note: The custom extension gallery (for marketplace-style in-UI search/install) is a future enhancement. Initially, extensions are installed via the supervisor API endpoint or the self-improve extension's slash commands. When the marketplace is built, the `extensionsGallery` field will be added here to point at the marketplace service.

**`settings.json`** — Default VS Code settings:

```json
{
  "workbench.colorTheme": "Default Dark Modern",
  "workbench.startupEditor": "none",
  "terminal.integrated.defaultProfile.linux": "tmux",
  "window.menuBarVisibility": "compact",
  "breadcrumbs.enabled": false,
  "editor.minimap.enabled": false,
  "workbench.tips.enabled": false,
  "workbench.activityBar.location": "top"
}
```

These are defaults that can be overridden by the user at any time through VS Code's normal settings UI. The goal is a clean, minimal look out of the box.

---

## 3. Extension System

### 3.1 What is a ClaudeOS extension?

A ClaudeOS extension is a standard VS Code extension (VSIX package) with optional additional components:

```
my-extension/
├── package.json          # VS Code extension manifest (required)
├── src/
│   └── extension.ts      # Extension entry point (required)
├── webview/              # React/HTML app for webview panels (optional)
├── mcp-server/           # MCP server for Claude Code tools (optional)
│   ├── package.json
│   └── src/
│       └── index.ts
├── AGENTS.md             # AI agent development guidelines (required)
└── README.md
```

The `package.json` is a standard VS Code extension manifest using the `contributes` field to declare UI elements:

```json
{
  "name": "claudeos-memory",
  "displayName": "ClaudeOS Memory",
  "publisher": "claudeos",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "claudeos-memory",
          "title": "Memory",
          "icon": "media/memory-icon.svg"
        }
      ]
    },
    "views": {
      "claudeos-memory": [
        {
          "id": "memoryGraph",
          "name": "Knowledge Graph",
          "type": "webview"
        }
      ]
    },
    "commands": [
      {
        "command": "claudeos-memory.remember",
        "title": "ClaudeOS: Remember This"
      }
    ],
    "configuration": {
      "title": "ClaudeOS Memory",
      "properties": {
        "claudeos-memory.provider": {
          "type": "string",
          "default": "mem0",
          "enum": ["mem0", "local"],
          "description": "Memory storage provider"
        }
      }
    }
  }
}
```

### 3.2 Extension capabilities via VS Code API

Extensions can contribute the following UI elements through standard VS Code extension APIs:

| UI element | VS Code contribution point | Example use |
|---|---|---|
| Activity bar icon + sidebar | `viewsContainers.activitybar` + `views` | Session list, memory panel |
| Webview panels (full React apps) | `WebviewPanel` API | Execution graph, memory visualizer, browser viewer |
| Terminal profiles | `terminal.profiles` | Claude Code session terminals |
| Commands / slash commands | `commands` | `/remember`, `/schedule`, `/improve` |
| Status bar items | `StatusBarItem` API | Active session indicator, memory status |
| Settings | `configuration` | Extension-specific settings |
| Tree views | `TreeDataProvider` | File explorers, session trees |
| Context menus | `menus` | Right-click actions on sessions |
| Keybindings | `keybindings` | Keyboard shortcuts |
| Walkthroughs | `walkthroughs` | First-run setup guides |
| Editor decorations | `TextEditorDecorationType` | In-editor memory annotations |

### 3.3 Inter-extension communication

Extensions expose public APIs through their `activate()` return value:

```typescript
// In claudeos-secrets extension
export function activate(context: vscode.ExtensionContext) {
  const api = {
    getSecret: async (name: string): Promise<string | undefined> => { ... },
    setSecret: async (name: string, value: string): Promise<void> => { ... },
    hasSecret: async (name: string): Promise<boolean> => { ... },
    deleteSecret: async (name: string): Promise<void> => { ... },
    onSecretChanged: new vscode.EventEmitter<string>().event
  };
  return api;
}

// In another extension that needs secrets
const secretsExt = vscode.extensions.getExtension('claudeos.claudeos-secrets');
if (secretsExt) {
  const secrets = secretsExt.exports;
  const apiKey = await secrets.getSecret('anthropic-api-key');
}
```

Extensions use two levels of dependency:

- **Hard dependencies:** Declared via `extensionDependencies` in `package.json`. VS Code enforces activation order and warns users if a dependency is missing or disabled. Example: an extension that fundamentally requires `claudeos-secrets` for all functionality.
- **Optional dependencies:** Checked at runtime via `vscode.extensions.getExtension()`. The extension works without the dependency but enables additional features when it's present. Example: the memory extension adding indicators to the session list when `claudeos-sessions` is installed.

Hard crashes from missing extensions are never acceptable. Required dependencies should be declared so VS Code handles them. Optional integrations should degrade gracefully.

### 3.4 Extensions that include MCP servers

Some extensions need to provide tools to Claude Code (not just UI). They do this by bundling an MCP server:

```
my-extension/
├── mcp-server/
│   ├── package.json
│   └── src/
│       └── index.ts      # Standard MCP server using @modelcontextprotocol/sdk
```

On extension activation, the extension:
1. Starts the MCP server as a child process.
2. Registers it with Claude Code by writing to Claude Code's MCP config file (typically `~/.claude/mcp_servers.json` or the project-level equivalent).

On deactivation, it deregisters and stops the server.

### 3.5 Installing extensions

Extensions are installed by providing a GitHub repo URL. The supervisor handles the build pipeline:

1. **Clone:** `git clone --depth 1 --branch {ref} {repo}`. If the repo is private, the `secretName` parameter specifies which secret from the `claudeos-secrets` extension to use as a GitHub PAT for authentication.
2. **Build:** `npm install && npm run package` (produces a `.vsix` file).
3. **Install:** `code-server --install-extension ./path/to/built.vsix`.
4. **Reload:** Notify code-server to reload the window (via the VS Code API or a reload command).

The install endpoint is `POST /api/extensions/install` on the supervisor API.

From the user's perspective, extensions are installed via:
- The **extension manager UI** provided by the `claudeos-self-improve` extension — a panel where users can paste a GitHub repo URL and click install, view installed extensions, and uninstall them.
- **Natural prompting** — asking Claude to install an extension in a session (e.g., "install the memory extension from github.com/claude-nix-os/claudeos-memory").
- The `default-extensions.json` list on first boot.
- Direct API call from any extension (programmatic).

### 3.6 Extension updates

Extensions can be updated by reinstalling with a new `ref` (tag/branch). The supervisor handles uninstall + reinstall. Extensions should store user data separately from their installation directory (e.g., in VS Code's `globalState` or a dedicated data directory) so updates don't lose configuration.

### 3.7 Future: Marketplace

The long-term plan for extension discovery:

1. A convention: any GitHub repo with the topic `claudeos-extension` and a valid `package.json` is a ClaudeOS extension.
2. A lightweight marketplace service (Cloudflare Worker or similar) that periodically indexes these repos and serves the VS Code Marketplace API.
3. `product.json` is updated with an `extensionsGallery` URL pointing to this service.
4. Users can then search for and install extensions directly from the VS Code Extensions sidebar, exactly like the normal VS Code marketplace.

This is out of scope for the initial release. The initial install flow is URL-based.

---

## 4. First-Party Extensions

These extensions ship with the default ClaudeOS distribution. Each is a separate repo under the `claude-nix-os` GitHub org.

### 4.1 `claudeos-sessions`

**Purpose:** Primary session management UI. The main way users create, view, and manage Claude Code sessions.

**UI contributions:**
- Activity bar icon (chat bubble icon) + sidebar panel
- Tree view listing all sessions grouped by: Active, Idle, Waiting for Input
- Context menu on sessions: Rename, Archive, Delete
- "New Session" button at top of sidebar
- Notification badges on sessions waiting for user input (red dot + question mark)
- Session name displays: bold for unread, fading gray gradient (gray-400 to gray-600) for read sessions based on recency

**Behavior:**
- Clicking a session opens it in the `claudeos-terminal` extension's terminal view (if installed).
- Sessions can be dragged from the sidebar into the editor area to open them as tabs.
- Archived sessions section (collapsible) at bottom of sidebar.
- "Zombie sessions" (deleted from Claude Code but preserved by ClaudeOS) shown with red dot; sending input to them revives them.
- Communicates with supervisor `GET/POST /api/sessions` endpoints.

### 4.2 `claudeos-terminal`

**Purpose:** Renders Claude Code sessions as terminal views in VS Code's editor area.

**UI contributions:**
- Terminal tab type that attaches to a tmux session.
- Terminal tabs show session name and status icon (spinning indicator for active, pause icon for idle, question mark for waiting).

**Behavior:**
- When a session is opened (from `claudeos-sessions` sidebar), this extension creates a terminal attached to the session's tmux window.
- Supports multiple terminal tabs open simultaneously.
- User input in the terminal is sent directly to the tmux session (this is how users respond to Claude Code's `AskUserQuestion` and similar prompts).
- Stock Claude Code CLI rendering — we don't modify how Claude Code displays its output.

### 4.3 `claudeos-home`

**Purpose:** Welcome/home tab with quick actions and shortcuts.

**UI contributions:**
- Webview panel that opens on startup (and when clicking "Home" in activity bar).
- Quick action buttons: New Session, Open File Explorer, Settings.
- Shortcuts grid: customizable, auto-populated with frequently used actions.
- Recent sessions list.

**Behavior:**
- New session button creates a session via the supervisor API and opens it.
- Shortcuts are stored in VS Code's `globalState` and updated based on usage.

### 4.4 `claudeos-secrets`

**Purpose:** Secure storage for API keys, tokens, and other secrets. Required by many other extensions.

**UI contributions:**
- Settings page (via VS Code's `configuration` contribution) for managing secrets.
- Webview panel for adding/editing/deleting secrets with a form UI.
- Status bar indicator showing whether critical secrets (like Anthropic API key) are configured.
- First-run walkthrough that prompts for essential secrets.

**Public API (consumed by other extensions):**

```typescript
interface SecretsAPI {
  getSecret(name: string): Promise<string | undefined>;
  setSecret(name: string, value: string): Promise<void>;
  hasSecret(name: string): Promise<boolean>;
  deleteSecret(name: string): Promise<void>;
  listSecrets(): Promise<string[]>;  // Returns names only, never values
  onSecretChanged: vscode.Event<string>;
}
```

**Behavior:**
- Secrets are encrypted at rest using a key derived from the `CLAUDEOS_AUTH_TOKEN` environment variable.
- Stored in a JSON file on disk inside the container's persistent volume.
- The Anthropic API key secret is special: when set, it's also written to Claude Code's expected environment/config location so Claude Code can use it.
- GitHub PAT secrets are used by the extension installer for accessing private repos.

### 4.5 `claudeos-self-improve`

**Purpose:** Makes ClaudeOS self-expanding. Provides context to Claude Code sessions so they know how to build and install extensions, and provides a UI for managing installed extensions.

**UI contributions:**
- Activity bar icon (puzzle piece) + sidebar panel: **Extension Manager**
  - List of installed extensions with version, description, and uninstall button.
  - "Install from GitHub" input field — paste a repo URL, click install.
  - For private repos, a dropdown to select a GitHub PAT secret from `claudeos-secrets`.
  - Install progress indicator with log output.
- MCP server that exposes tools to Claude Code sessions:
  - `install_extension(repo, ref?, secretName?)` — Install an extension from a GitHub repo.
  - `uninstall_extension(extensionId)` — Uninstall an extension.
  - `list_extensions()` — List installed extensions.
  - `get_extension_template()` — Returns the extension template scaffold for building new extensions.

**Behavior:**
- **Extension management via UI:** Users install/uninstall extensions through the Extension Manager panel. No commands needed.
- **Self-improvement via natural prompting:** When a user asks Claude to build a feature (e.g., "add a memory system"), the MCP tools give Claude everything it needs — the extension template, the install API, and awareness that it's running inside ClaudeOS. Claude scaffolds, implements, tests, builds, and installs the extension autonomously.
- Self-improve sessions are marked with a special icon in the session list so users can distinguish them from regular sessions.
- The extension template is bundled with this extension (copied from the kernel's `extension-template/` at build time).

---

## 5. Deployment

### 5.1 Container contents

The Nix flake (or Dockerfile) produces a container with:

- **Node.js** (LTS)
- **code-server** (latest stable)
- **Claude Code** (`npm install -g @anthropic-ai/claude-code` or equivalent)
- **tmux**
- **git** (for cloning extension repos)
- **Supervisor** (built from `supervisor/`)

### 5.2 Persistent storage

The container requires a persistent volume mounted at `/data` containing:

- `/data/extensions/` — Installed VS Code extensions (survive restarts)
- `/data/sessions/` — Archived session data (scrollback, metadata)
- `/data/secrets/` — Encrypted secret store
- `/data/config/` — User configuration overrides
- `/data/.claudeos-initialized` — First-boot marker

### 5.3 Environment variables

| Variable | Required | Description |
|---|---|---|
| `CLAUDEOS_AUTH_TOKEN` | Yes | Authentication token for code-server access and secret encryption |
| `ANTHROPIC_API_KEY` | No | Can also be set via secrets extension in UI |
| `PORT` | No | HTTP port (default 8080, auto-set by Railway) |
| `CLAUDEOS_DATA_DIR` | No | Persistent data directory (default `/data`) |

### 5.4 Railway deployment

`railway.toml`:

```toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/healthz"
healthcheckTimeout = 30
restartPolicyType = "always"

[[services]]
name = "claudeos"
```

The Railway template (separate repo: `claude-nix-os/claudeos-railway-template`) wraps this with a "Deploy on Railway" button and preconfigured environment variable prompts.

### 5.5 Local development

```bash
# Clone and install
git clone https://github.com/claude-nix-os/claudeos
cd claudeos
cd supervisor && npm install && cd ..

# Start in dev mode (requires tmux + code-server + claude installed locally)
./scripts/dev.sh

# Or use Docker
docker compose up
```

`docker-compose.yml` mounts a local `/data` volume and exposes port 8080.

---

## 6. Security Model

### 6.1 Authentication

code-server's built-in password authentication is used with `$CLAUDEOS_AUTH_TOKEN`. The secrets extension provides the UI for this on first run.

Future: The `claudeos-passkey-auth` module (not in default distro) will add WebAuthn/passkey authentication as an additional or replacement auth method.

### 6.2 Network isolation

- The supervisor API (`localhost:3100`) is never exposed outside the container. Only extensions running inside code-server can reach it.
- code-server's HTTP port is the only externally accessible port.
- Claude Code sessions run inside the container with the same permissions as the container user.

### 6.3 Secret management

- All secrets encrypted at rest (AES-256-GCM, key derived from `CLAUDEOS_AUTH_TOKEN`).
- Secrets never logged, never included in session scrollback saves.
- The secrets file is on the persistent volume, not in the container image.
- Extensions access secrets only through the `claudeos-secrets` API, never directly.

---

## 7. Extension Template Specification

The `extension-template/` directory in the kernel repo provides the scaffold for new extensions. It includes:

### 7.1 `package.json` (template)

```json
{
  "name": "claudeos-EXTENSION_NAME",
  "displayName": "ClaudeOS EXTENSION_DISPLAY_NAME",
  "description": "EXTENSION_DESCRIPTION",
  "publisher": "claudeos",
  "version": "0.1.0",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Other"],
  "keywords": ["claudeos-extension"],
  "repository": {
    "type": "git",
    "url": "https://github.com/OWNER/claudeos-EXTENSION_NAME"
  },
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "package": "vsce package --no-dependencies",
    "test": "vitest run"
  },
  "contributes": {},
  "dependencies": {},
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "typescript": "^5.3.0",
    "@vscode/vsce": "^2.22.0",
    "vitest": "^1.0.0"
  }
}
```

### 7.2 `AGENTS.md` (template)

Each extension's AGENTS.md inherits the kernel's principles and adds extension-specific guidance:

- Never modify the kernel. If you need a new supervisor API endpoint, open an issue on the kernel repo.
- Use the supervisor API (`http://localhost:3100`) for all session management.
- Use the `claudeos-secrets` extension API for all secret access.
- If your extension has an MCP server, register/deregister it cleanly on activate/deactivate.
- Handle missing dependency extensions gracefully (check before calling, degrade features).
- All extension code is TypeScript, strict mode.
- Write tests for all non-trivial logic.
- Publish releases as GitHub Releases with the built VSIX file attached.

### 7.3 Extension development workflow

1. `npm run compile` — Build TypeScript
2. `npm run watch` — Watch mode for development
3. `npm test` — Run tests
4. `npm run package` — Build VSIX for distribution
5. Create a GitHub Release with the VSIX attached

---

*Roadmap and implementation plan: see [IMPLEMENTATION.md](./IMPLEMENTATION.md).*
