# Architecture Research

**Domain:** Browser-accessible agent operating environment (supervisor + code-server + Claude Code + VS Code extension system)
**Researched:** 2026-03-11
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Container (Docker / Nix)                                                   │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  LAYER 1: Supervisor Process (:3100)                                  │  │
│  │  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────────┐   │  │
│  │  │ Boot Sequence │  │ Session API (HTTP)│  │ Extension Installer   │   │  │
│  │  └──────┬───────┘  └────────┬─────────┘  └──────────┬────────────┘   │  │
│  └─────────┼───────────────────┼────────────────────────┼────────────────┘  │
│            │ spawns             │ localhost:3100          │ git clone +      │
│            ▼                   │                        │ npm + vsix       │
│  ┌─────────────────────┐      │                        │                  │
│  │  LAYER 2: code-server│◄─────┘                        │                  │
│  │  (:8080)             │                               │                  │
│  │  ┌───────────────────┴────────────────────────────┐  │                  │
│  │  │  Extension Host Process                        │  │                  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐ │◄─┘                  │
│  │  │  │ sessions │ │ terminal │ │ self-improve    │ │                     │
│  │  │  │ ext      │ │ ext      │ │ ext + MCP srv  │ │                     │
│  │  │  └────┬─────┘ └────┬─────┘ └───────┬────────┘ │                     │
│  │  │       │            │               │          │                     │
│  │  │  ┌────┴────┐ ┌─────┴─────┐ ┌───────┴────────┐│                     │
│  │  │  │ secrets │ │ home      │ │ [future exts]  ││                     │
│  │  │  │ ext     │ │ ext       │ │                ││                     │
│  │  │  └─────────┘ └───────────┘ └────────────────┘│                     │
│  │  └──────────────────────────────────────────────┘│                     │
│  └──────────────────────────────────────────────────┘                     │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  LAYER 3: tmux Session Pool                                        │    │
│  │  ┌───────────────────┐ ┌───────────────────┐ ┌─────────────────┐  │    │
│  │  │ claudeos_ses_001  │ │ claudeos_ses_002  │ │ claudeos_ses_N  │  │    │
│  │  │ (Claude Code CLI) │ │ (Claude Code CLI) │ │ (Claude Code)   │  │    │
│  │  └───────────────────┘ └───────────────────┘ └─────────────────┘  │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  LAYER 4: Persistent Volume (/data)                                │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │    │
│  │  │extensions│ │sessions/ │ │secrets/  │ │config/   │             │    │
│  │  │/         │ │          │ │          │ │          │             │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘             │    │
│  └────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Supervisor** | Process orchestrator. Boots system, spawns code-server, exposes session/extension HTTP API on :3100 | Single Node.js process (~300 LOC), `child_process.spawn()` for code-server, `execFile()` for tmux commands |
| **code-server** | Browser-accessible VS Code. Hosts extension runtime, serves UI on :8080 | Stock code-server binary, configured via `product.json` + `settings.json`. Never forked. |
| **Extension Host** | VS Code's isolated process that runs all extensions. Manages activation order, inter-extension communication, webview sandboxing | VS Code built-in. Extensions activate per `activationEvents` in `package.json`. Communication via `exports` from `activate()` return value |
| **First-party extensions** | All user-facing features: session list, terminal, home tab, secrets, extension manager | Standard VSIX packages. Each is a separate repo. Installed on first boot from `default-extensions.json` |
| **tmux session pool** | Hosts Claude Code CLI instances. One tmux session per Claude Code conversation | tmux managed via CLI commands (`tmux new-session`, `send-keys`, `capture-pane`). Sessions named `claudeos_{id}` |
| **Persistent volume** | Survives container restarts. Stores extensions, archived sessions, encrypted secrets, user config | Docker volume or Railway persistent disk mounted at `/data` |

## Recommended Project Structure

```
claudeos/
├── supervisor/                    # The kernel - everything the system needs to boot
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts               # Entry point: boot sequence orchestration
│   │   ├── session-api.ts          # Express/Hono HTTP API for session management
│   │   ├── extension-installer.ts  # Clone, build, install VSIX pipeline
│   │   ├── tmux.ts                 # Thin wrapper: tmux CLI commands via execFile
│   │   └── types.ts                # Shared interfaces (Session, Extension, etc.)
│   └── test/
│       ├── session-api.test.ts
│       ├── extension-installer.test.ts
│       └── tmux.test.ts
├── extension-template/             # Scaffold for new extensions
│   ├── package.json
│   ├── tsconfig.json
│   ├── AGENTS.md
│   ├── src/
│   │   └── extension.ts
│   ├── webview/                    # Optional: React/HTML for webview panels
│   └── mcp-server/                 # Optional: MCP server for Claude Code tools
├── product.json                    # code-server branding
├── settings.json                   # VS Code default settings
├── default-extensions.json         # First-boot extension list
├── Dockerfile
├── docker-compose.yml
├── railway.toml
├── flake.nix                       # Nix-based build alternative
├── scripts/
│   ├── build.sh
│   ├── dev.sh
│   └── deploy-railway.sh
├── AGENTS.md
└── SPEC.md
```

### Structure Rationale

- **`supervisor/`:** Isolated Node.js project with its own `package.json`. This is the only TypeScript that runs outside the VS Code extension host. It must be minimal, fast to start, and have zero UI responsibilities.
- **`extension-template/`:** Lives in the kernel repo but gets bundled into the `claudeos-self-improve` extension at build time. Claude Code sessions use this template to scaffold new extensions. It is not deployed independently.
- **First-party extensions live in separate repos** (e.g., `claudeos-sessions`, `claudeos-terminal`, etc.) because VS Code extensions are installed as VSIX packages. The kernel repo does not contain extension source code -- only the template and the install mechanism. This enforces the boundary: kernel boots the system, extensions provide the features.

## Architectural Patterns

### Pattern 1: Supervisor as HTTP Sidecar

**What:** The supervisor runs as a simple HTTP server on a non-exposed port (`:3100`), acting as a sidecar to code-server. Extensions communicate with it over HTTP, never by importing supervisor code.

**When to use:** Always. This is the foundational pattern. Every extension that needs to manage sessions, install extensions, or check system health uses this API.

**Trade-offs:**
- PRO: Clean boundary -- extensions cannot couple to supervisor internals
- PRO: Testable in isolation (just HTTP calls)
- PRO: Language-agnostic (could theoretically support non-TS extensions)
- CON: Slightly more latency than direct function calls (negligible on localhost)
- CON: Must handle HTTP error semantics (status codes, retries)

**Example:**
```typescript
// In any extension -- session creation via supervisor API
const response = await fetch('http://localhost:3100/api/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Debug auth flow',
    prompt: 'Fix the login bug in auth.ts',
    workdir: '/home/user/project'
  })
});
const session = await response.json();
// session.id = "ses_abc123"
// session.tmuxSession = "claudeos_ses_abc123"
```

### Pattern 2: tmux as Process Boundary

**What:** Claude Code runs inside tmux sessions. The supervisor interacts with Claude Code exclusively through tmux CLI commands (`new-session`, `send-keys`, `capture-pane`, `kill-session`). No stdin/stdout piping, no API wrapping, no process embedding.

**When to use:** Always for Claude Code interaction. This is a design dogma, not a choice.

**Trade-offs:**
- PRO: Claude Code stays completely stock -- no patches, no wrappers
- PRO: Forward-compatible with Claude Code updates (tmux is the stable interface)
- PRO: Users get the real Claude Code terminal experience
- CON: Parsing session status requires scraping tmux pane content (fragile)
- CON: No structured data exchange with Claude Code (text only)
- CON: Status detection (active/idle/waiting) requires heuristics on terminal output

**Example:**
```typescript
// supervisor/src/tmux.ts -- thin wrapper around tmux CLI
import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

export async function createSession(id: string, cmd: string, workdir?: string): Promise<void> {
  const sessionName = `claudeos_${id}`;
  await exec('tmux', [
    'new-session', '-d', '-s', sessionName,
    '-c', workdir || '/home/user',
    cmd
  ]);
}

export async function sendKeys(id: string, text: string): Promise<void> {
  await exec('tmux', ['send-keys', '-t', `claudeos_${id}`, text, 'Enter']);
}

export async function capturePane(id: string): Promise<string> {
  const { stdout } = await exec('tmux', [
    'capture-pane', '-t', `claudeos_${id}`, '-p', '-S', '-1000'
  ]);
  return stdout;
}

export async function killSession(id: string): Promise<void> {
  await exec('tmux', ['kill-session', '-t', `claudeos_${id}`]);
}
```

### Pattern 3: Extension-to-Extension Communication via Exports API

**What:** VS Code extensions expose public APIs by returning objects from their `activate()` function. Other extensions access these APIs via `vscode.extensions.getExtension()`. Hard dependencies use `extensionDependencies` in `package.json` for activation ordering; optional dependencies check at runtime and degrade gracefully.

**When to use:** Whenever extensions need to share functionality. The primary example is `claudeos-secrets` exposing a `getSecret()` API consumed by other extensions.

**Trade-offs:**
- PRO: Native VS Code mechanism -- activation ordering is handled by the extension host
- PRO: Type-safe when consumers declare the expected interface
- PRO: No additional infrastructure (no message bus, no shared state)
- CON: `extensionDependencies` is primarily for installation, not guaranteed activation ordering (must verify with runtime checks)
- CON: No pub/sub or event broadcasting across all extensions (must use `EventEmitter` per-API)

**Example:**
```typescript
// claudeos-secrets: expose API
export function activate(context: vscode.ExtensionContext) {
  const api: SecretsAPI = {
    getSecret: async (name) => { /* decrypt from /data/secrets/ */ },
    setSecret: async (name, value) => { /* encrypt to /data/secrets/ */ },
    hasSecret: async (name) => { /* check existence */ },
    deleteSecret: async (name) => { /* remove */ },
    onSecretChanged: secretChangedEmitter.event
  };
  return api;
}

// claudeos-self-improve: consume API (optional dependency)
export async function activate(context: vscode.ExtensionContext) {
  const secretsExt = vscode.extensions.getExtension<SecretsAPI>('claudeos.claudeos-secrets');
  if (secretsExt) {
    await secretsExt.activate();
    const secrets = secretsExt.exports;
    const pat = await secrets.getSecret('github-pat');
    // Enable private repo installation if PAT available
  }
  // Works without secrets -- just cannot install from private repos
}
```

### Pattern 4: Webview Panels with postMessage Bridge

**What:** Extensions that need rich UI (beyond tree views) use VS Code webview panels. These are sandboxed iframes that communicate with the extension backend via bidirectional `postMessage`. The webview calls `acquireVsCodeApi()` once to get the messaging handle. The extension listens via `panel.webview.onDidReceiveMessage()`.

**When to use:** For `claudeos-home` (welcome page, shortcuts grid), `claudeos-self-improve` (extension manager panel), `claudeos-secrets` (secrets management form), and any future extension needing custom UI.

**Trade-offs:**
- PRO: Full HTML/CSS/JS -- can use React, Svelte, or plain HTML
- PRO: Sandboxed -- cannot access Node.js APIs or VS Code APIs directly
- CON: Communication is disconnected (fire-and-forget, no native request/response correlation)
- CON: Webview content is destroyed when hidden unless `retainContextWhenHidden: true` (which increases memory)
- CON: Must implement request ID correlation for request-response patterns

**Example:**
```typescript
// Extension side: send data to webview
panel.webview.postMessage({ type: 'sessions-updated', sessions: sessionList });

// Extension side: receive from webview
panel.webview.onDidReceiveMessage(async (message) => {
  switch (message.type) {
    case 'create-session':
      const session = await fetch('http://localhost:3100/api/sessions', { method: 'POST', ... });
      panel.webview.postMessage({ type: 'session-created', session: await session.json() });
      break;
    case 'install-extension':
      // Forward to supervisor API
      break;
  }
});

// Webview side (inside the iframe)
const vscode = acquireVsCodeApi();
vscode.postMessage({ type: 'create-session', name: 'New task' });
window.addEventListener('message', (event) => {
  const { type, ...data } = event.data;
  if (type === 'session-created') { /* update UI */ }
});
```

### Pattern 5: MCP Servers Bundled in Extensions

**What:** Extensions that need to give Claude Code new tools bundle an MCP server as a child process. On extension activation, the server starts and registers itself with Claude Code's MCP configuration. On deactivation, it deregisters and stops.

**When to use:** For `claudeos-self-improve` (provides `install_extension`, `get_extension_template`, `list_extensions` tools to Claude Code sessions). Future extensions like memory, browser automation, etc. will follow this pattern.

**Trade-offs:**
- PRO: Claude Code gains capabilities without being modified
- PRO: Standard MCP protocol -- tools discoverable, typed, documented
- PRO: Each MCP server is isolated (separate process per extension)
- CON: MCP config changes require Claude Code restart (or the session must be started after the MCP server is registered)
- CON: Additional process overhead per MCP-enabled extension
- CON: Must manage MCP server lifecycle carefully (start on activate, stop on deactivate, clean up config)

**Example:**
```typescript
// In claudeos-self-improve extension: activate
import { fork } from 'child_process';
import { execFile } from 'child_process';

export async function activate(context: vscode.ExtensionContext) {
  // Start bundled MCP server
  const mcpServer = fork(path.join(context.extensionPath, 'mcp-server', 'out', 'index.js'));

  // Register with Claude Code's MCP config
  // Uses 'claude mcp add' CLI or writes to ~/.claude.json
  await execFile('claude', [
    'mcp', 'add', '--transport', 'stdio', '--scope', 'user',
    'claudeos-self-improve', '--',
    'node', path.join(context.extensionPath, 'mcp-server', 'out', 'index.js')
  ]);

  context.subscriptions.push({
    dispose: async () => {
      mcpServer.kill();
      await execFile('claude', ['mcp', 'remove', 'claudeos-self-improve']);
    }
  });
}
```

## Data Flow

### Boot Sequence Flow

```
Container Start
    |
    v
Supervisor (index.ts)
    |
    ├──> Check prerequisites (claude --version, tmux, etc.)
    |
    ├──> Start HTTP API server on :3100
    |
    ├──> First boot? ──yes──> Read default-extensions.json
    |                              |
    |                              ├──> For each extension:
    |                              |      git clone → npm install → npm run package → code-server --install-extension
    |                              |
    |                              └──> Write .claudeos-initialized marker
    |
    └──> Spawn code-server (:8080)
              |
              ├──> code-server loads product.json (branding)
              ├──> code-server loads settings.json (defaults)
              └──> Extension Host starts
                      |
                      ├──> claudeos-secrets activates (provides SecretsAPI)
                      ├──> claudeos-sessions activates (session list sidebar)
                      ├──> claudeos-terminal activates (terminal tab provider)
                      ├──> claudeos-home activates (welcome webview)
                      └──> claudeos-self-improve activates (MCP server + extension manager)
```

### Session Lifecycle Flow

```
User clicks "New Session" (in sessions sidebar or home tab)
    |
    v
Extension calls POST /api/sessions on supervisor (:3100)
    |
    v
Supervisor generates session ID (ses_xxxxx)
    |
    v
Supervisor runs: tmux new-session -d -s claudeos_ses_xxxxx "claude [flags]"
    |
    v
Supervisor stores session metadata in /data/sessions/ses_xxxxx.json
    |
    v
Returns { id, tmuxSession, status: "active" } to extension
    |
    v
Sessions extension updates tree view (new item appears in sidebar)
    |
    v
User clicks session → terminal extension creates terminal tab
    |
    v
Terminal tab attaches to tmux session: tmux attach-session -t claudeos_ses_xxxxx
    |
    v
User sees Claude Code CLI running in terminal (stock rendering)
    |
    v
User types in terminal → keystrokes go directly to tmux → Claude Code receives input
```

### Extension Installation Flow

```
User pastes GitHub URL in extension manager (or Claude Code calls install_extension tool)
    |
    v
Extension calls POST /api/extensions/install { repo, ref, secretName? }
    |
    v
Supervisor: git clone --depth 1 --branch {ref} {repo} /tmp/ext-build/
    |
    ├──> If secretName provided: fetch PAT from claudeos-secrets API → use as git auth
    |
    v
Supervisor: cd /tmp/ext-build && npm install && npm run package
    |
    v
Supervisor: code-server --install-extension /tmp/ext-build/*.vsix
    |
    v
Supervisor: notify code-server to reload window
    |
    v
Extension Host restarts → new extension activates
    |
    v
If extension includes MCP server → MCP server starts → registers with Claude Code
```

### Inter-Extension Communication Flow

```
                    ┌──────────────────────────────────────────────────┐
                    │  VS Code Extension Host Process                  │
                    │                                                  │
                    │  claudeos-secrets                                │
                    │    exports: { getSecret, setSecret, ... }        │
                    │       ▲              ▲                           │
                    │       │              │                           │
                    │  getExtension()  getExtension()                  │
                    │       │              │                           │
                    │  claudeos-          claudeos-self-improve        │
                    │  sessions           │                            │
                    │       │             ├──> MCP Server (child proc) │
                    │       │             │      ▲                     │
                    │       ▼             │      │ stdio               │
                    │  Supervisor         │      ▼                     │
                    │  HTTP API ◄─────────┘   Claude Code             │
                    │  (:3100)                 (in tmux)               │
                    │       │                                          │
                    │       ▼                                          │
                    │  tmux CLI commands                               │
                    └──────────────────────────────────────────────────┘
```

### Key Data Flows

1. **Session management:** User action in extension UI -> HTTP to supervisor :3100 -> tmux CLI commands -> Claude Code in tmux session. Responses flow back the same path. The supervisor is the single orchestrator; extensions never call tmux directly.

2. **Secret access:** Any extension -> `vscode.extensions.getExtension('claudeos.claudeos-secrets').exports.getSecret(name)` -> decrypts from `/data/secrets/secrets.json` -> returns value. No HTTP involved; this is in-process via the VS Code extension API.

3. **Claude Code tool access:** Extension activates MCP server -> registers via `claude mcp add` -> Claude Code discovers tools on next session start -> Claude Code calls MCP tools via stdio transport -> MCP server handles request -> returns result to Claude Code.

4. **Extension self-building:** User prompts Claude Code "build a memory extension" -> Claude Code calls `get_extension_template()` MCP tool -> gets scaffold -> builds extension in workspace -> calls `install_extension(repo)` MCP tool -> supervisor clones/builds/installs -> new extension appears in code-server.

## Build Order and Dependencies

### Dependency Graph

```
Layer 0 (Infrastructure):     Container (Docker/Nix) + Persistent Volume
                                        |
Layer 1 (Kernel):              Supervisor Process
                                        |
                               ┌────────┴────────┐
                               v                  v
Layer 2 (Platform):     code-server          tmux (system)
                               |
Layer 3 (Foundation Ext):  claudeos-secrets
                               |
Layer 4 (Core Exts):    ┌──────┼──────┐
                        v      v      v
                   sessions terminal  home
                        |
Layer 5 (Meta Ext): self-improve (depends on sessions, secrets)
```

### Suggested Build Order

**Phase 1: Supervisor + Container**
Build the supervisor first. It is the root of all dependencies. Without it, nothing boots.
- `supervisor/src/index.ts` (boot sequence)
- `supervisor/src/session-api.ts` (session CRUD endpoints)
- `supervisor/src/tmux.ts` (tmux CLI wrapper)
- Dockerfile with code-server + tmux + Claude Code installed
- `product.json` + `settings.json` for branding
- Verify: supervisor boots, starts code-server, API returns health check

**Phase 2: Session Management (extension + terminal)**
These two extensions form the core user experience. Sessions without terminal is useless; terminal without sessions has no navigation. Build them together.
- `claudeos-sessions`: tree view, session list, status indicators
- `claudeos-terminal`: terminal tab provider that attaches to tmux
- The extension installer in supervisor (so these can be installed on boot)
- `default-extensions.json` with just these two
- Verify: can create session, see it in sidebar, open terminal, interact with Claude Code

**Phase 3: Secrets + Home**
Secrets is a foundational service other extensions depend on. Home is simple and fills out the UX.
- `claudeos-secrets`: encrypted storage, public API via exports, status bar indicator
- `claudeos-home`: webview panel, quick actions, recent sessions
- Verify: can store/retrieve secrets, home tab opens on startup with working shortcuts

**Phase 4: Self-Improve + Extension Manager**
This is the capstone -- it makes ClaudeOS self-expanding. Requires sessions (to run build sessions), secrets (for private repo PATs), and the extension installer.
- `claudeos-self-improve`: extension manager UI panel, MCP server with tools
- Extension template bundled and accessible via MCP tool
- Verify: can install extension from GitHub URL via UI, Claude Code can build and install a new extension via natural prompting

**Phase 5: Deployment + Hardening**
Railway deployment, persistent volume configuration, auth hardening.
- `railway.toml` + deploy script
- Volume mount configuration
- Health checks, restart policies
- Secret encryption key derivation from `CLAUDEOS_AUTH_TOKEN`

### Build Order Rationale

The order follows the dependency graph strictly bottom-up:
- **Supervisor first** because everything depends on it being able to boot code-server and manage tmux sessions
- **Sessions + Terminal together** because they are tightly coupled in UX (creating a session without being able to view it is useless) and both depend only on the supervisor API
- **Secrets before self-improve** because self-improve needs secrets for private repo PATs, and other future extensions will need secrets for API keys
- **Self-improve last** among extensions because it is the most complex (MCP server + UI + extension lifecycle management) and depends on all preceding pieces working
- **Deployment last** because it is configuration, not functionality -- get it working locally first

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user, 1-5 sessions | Current architecture is ideal. Single container, all in-process. No changes needed. |
| 1 user, 10-20 sessions | Monitor tmux session memory. Each Claude Code session holds scrollback buffers. Consider archiving idle sessions aggressively. Session metadata JSON files on disk are fine. |
| 5-10 concurrent users | Beyond current scope (single-user system). Would need: per-user containers, auth per user, session isolation. This is a fundamentally different product. |
| Extension count > 20 | Extension Host memory grows with each extension. code-server has the same limits as VS Code (~50 extensions before noticeable slowdown). MCP Tool Search (available in Claude Code) helps with many MCP servers. |

### Scaling Priorities

1. **First bottleneck: tmux session memory.** Each Claude Code session accumulates scrollback. With 10+ active sessions, this can consume significant RAM. Mitigation: archive sessions after inactivity period, limit scrollback buffer size via tmux config (`set-option -g history-limit 5000`).

2. **Second bottleneck: Extension installation build time.** `npm install && npm run package` for each extension on first boot is slow (could take 30-60 seconds per extension with 5 defaults). Mitigation: pre-build VSIX files in CI, download pre-built artifacts instead of building from source on first boot.

## Anti-Patterns

### Anti-Pattern 1: Extensions Importing Supervisor Code

**What people do:** Import supervisor modules directly into extension code for "convenience" (e.g., `import { createSession } from '../../../supervisor/src/tmux'`).

**Why it's wrong:** Extensions run in the VS Code Extension Host process, which is a separate process from the supervisor. Direct imports would require bundling supervisor code into the extension, creating tight coupling, and breaking the HTTP boundary that makes the system testable and evolvable independently.

**Do this instead:** Always use `fetch('http://localhost:3100/api/...')` from extensions. Create a thin TypeScript client library (`claudeos-api-client`) if the boilerplate is annoying, but keep it as an HTTP wrapper.

### Anti-Pattern 2: Modifying Claude Code or code-server

**What people do:** Patch Claude Code to add hooks, fork code-server to change behavior, or inject middleware into code-server's HTTP server.

**Why it's wrong:** Both products update independently. Any patch creates a maintenance burden proportional to the update frequency of the upstream projects. Claude Code updates are frequent and may change internal APIs without notice.

**Do this instead:** Interact with Claude Code only through tmux and its public CLI (`claude mcp add`, `claude --version`, etc.). Configure code-server only through `product.json`, `settings.json`, environment variables, and extensions.

### Anti-Pattern 3: Shared Mutable State Between Extensions

**What people do:** Multiple extensions read/write the same file on disk, or use `globalState` with shared keys, creating race conditions and implicit coupling.

**Why it's wrong:** VS Code extension activation order is not fully deterministic beyond declared dependencies. Two extensions writing to the same file can corrupt data. Hidden dependencies make the system impossible to reason about.

**Do this instead:** Each extension owns its own storage namespace. Shared data goes through explicit APIs (e.g., `claudeos-secrets` for secrets, supervisor API for session state). Use `EventEmitter`-based notification for state changes.

### Anti-Pattern 4: Using `retainContextWhenHidden` by Default

**What people do:** Set `retainContextWhenHidden: true` on all webview panels to preserve UI state when tabs are hidden.

**Why it's wrong:** Each retained webview keeps its full DOM, scripts, and state in memory even when not visible. With multiple webview-based extensions, this accumulates rapidly.

**Do this instead:** Use `getState()`/`setState()` for lightweight persistence across tab switches. Only use `retainContextWhenHidden` for webviews with expensive-to-recreate state (e.g., a live-updating terminal view). The `claudeos-home` welcome tab does not need it.

### Anti-Pattern 5: Registering MCP Servers Without Cleanup

**What people do:** Extension registers an MCP server with Claude Code on activation but does not remove it on deactivation or uninstallation.

**Why it's wrong:** Orphaned MCP server entries in `~/.claude.json` cause Claude Code to attempt connection to servers that no longer exist, producing errors on every session start.

**Do this instead:** Always pair `claude mcp add` with `claude mcp remove` in the extension's `deactivate()` function. Use VS Code's `context.subscriptions.push({ dispose: ... })` to ensure cleanup runs even on crashes.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **GitHub** (extension repos) | `git clone` via supervisor, authenticated with PAT from secrets extension | Must handle rate limiting, private repos, ref resolution |
| **Anthropic API** | Claude Code handles this internally. API key set via environment variable or secrets extension writing to Claude Code's expected config location | Never proxy or intercept Claude Code's API calls |
| **Railway** | Deploy via Dockerfile. Health check on `/healthz`. Persistent volume for `/data` | Railway sets `$PORT` automatically; supervisor must pass this to code-server |
| **Open-VSX** (optional) | code-server uses Open-VSX by default for marketplace browsing. Can be overridden with `$EXTENSIONS_GALLERY` env var | Not critical for v1 -- extensions install via GitHub URL, not marketplace search |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Supervisor <-> Extensions | HTTP on localhost:3100 | Unidirectional: extensions call supervisor. Supervisor never initiates calls to extensions. |
| Extension <-> Extension | VS Code `getExtension().exports` API | Synchronous in-process calls. Activation order matters -- use `extensionDependencies` or runtime checks. |
| Extension <-> Webview | `postMessage` / `onDidReceiveMessage` | Async, disconnected. Must implement request-ID correlation for request-response patterns. |
| Extension <-> Claude Code | Indirectly via supervisor (session management) OR via MCP server (tool exposure) | Extensions never talk to Claude Code directly. Two paths: supervisor for session control, MCP for tool access. |
| Extension <-> MCP Server | stdio pipe (child process) | MCP server is a subprocess of the extension. Extension manages lifecycle. |
| Supervisor <-> tmux | `execFile('tmux', [...])` | CLI-level integration. No library, no daemon API. Each command is a separate process invocation. |
| Supervisor <-> code-server | `child_process.spawn('code-server', [...])` | Supervisor spawns code-server as a child process and monitors it. code-server does not call back to supervisor. |

## Sources

- [VS Code Extension API](https://code.visualstudio.com/api) -- official extension development documentation (HIGH confidence)
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview) -- webview communication patterns (HIGH confidence)
- [VS Code Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest) -- extensionDependencies, activation events (HIGH confidence)
- [VS Code Activation Events](https://code.visualstudio.com/api/references/activation-events) -- extension lifecycle (HIGH confidence)
- [code-server FAQ](https://coder.com/docs/code-server/FAQ) -- extension compatibility, marketplace, product.json configuration (HIGH confidence)
- [code-server Docker volume discussion](https://github.com/coder/code-server/discussions/4869) -- persistent storage patterns (MEDIUM confidence)
- [MCP Architecture Overview](https://modelcontextprotocol.io/docs/learn/architecture) -- host/client/server relationships, transport mechanisms (HIGH confidence)
- [Claude Code MCP Documentation](https://code.claude.com/docs/en/mcp) -- `claude mcp add`, scopes, `.mcp.json` format, programmatic configuration (HIGH confidence)
- [Node.js child_process documentation](https://nodejs.org/api/child_process.html) -- spawn, execFile patterns (HIGH confidence)
- [tmux send-keys documentation](https://tmuxai.dev/tmux-send-keys/) -- programmatic tmux interaction (MEDIUM confidence)
- [VS Code Messenger by TypeFox](https://www.typefox.io/blog/vs-code-messenger/) -- enhanced webview-extension communication (MEDIUM confidence)
- [VS Code Extension Architecture](https://jessvint.medium.com/vs-code-extensions-basic-concepts-architecture-8c8f7069145c) -- extension host process model (MEDIUM confidence)

---
*Architecture research for: ClaudeOS -- browser-accessible agent operating environment*
*Researched: 2026-03-11*
