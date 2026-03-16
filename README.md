# ClaudeOS

A browser-accessible operating environment for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). ClaudeOS wraps stock Claude Code in a VS Code-based UI (via [code-server](https://github.com/coder/code-server)) with a modular extension system. Everything is an extension — the kernel just boots the system.

## What this repo contains

This is the **kernel**. It's intentionally tiny:

- A supervisor process (~300 lines) that starts code-server and manages Claude Code sessions via tmux
- A Nix flake and Dockerfile for building the container
- Configuration files for code-server (branding, default settings)
- A list of default extensions to install on first boot
- A template for building new extensions

All user-facing features — session management UI, terminal views, secret management, the home page, self-improvement tools — are extensions hosted in separate repos.

## Quick Start

### Railway (recommended)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.com/new/template/claudeos)

Click deploy and open the URL — a setup wizard walks you through signing in with Railway and configuring Claude Code credentials. No env vars or CLI access required.

### Docker

```bash
docker run -d \
  -p 8080:8080 \
  -e CLAUDEOS_AUTH_TOKEN=$(openssl rand -hex 16) \
  -v claudeos-data:/data \
  ghcr.io/aventre-labs/claudeos:latest
```

Open `http://localhost:8080`. The first-boot wizard guides you through Railway and Anthropic authentication, then launches into the full ClaudeOS environment.

### Local Development

```bash
git clone https://github.com/aventre-labs/ClaudeOS
cd ClaudeOS

# Install supervisor dependencies
cd supervisor && npm install && cd ..

# Start in dev mode (requires tmux, code-server, and claude CLI installed locally)
./scripts/dev.sh
```

Or with Docker Compose:

```bash
docker compose up
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Container                                       │
│                                                  │
│  Supervisor (:3100)                              │
│    ├── First-boot setup wizard (:8080)           │
│    ├── Starts code-server after setup            │
│    ├── Session API (create/stop/list sessions)   │
│    └── Extension installer                       │
│                                                  │
│  code-server (:8080)                             │
│    └── Installed extensions (all features here)  │
│                                                  │
│  Claude Code (via tmux, stock, never modified)   │
└──────────────────────────────────────────────────┘
```

On first boot, the supervisor serves a setup wizard on port 8080 that guides authentication (Railway + Anthropic). After setup completes, it hands off port 8080 to code-server. The supervisor exposes an HTTP API on `localhost:3100` for managing Claude Code sessions. Extensions communicate with this API to provide the UI. Claude Code runs completely stock in tmux sessions — never patched, wrapped, or proxied.

## Default Extensions

These ship with every ClaudeOS install. Each is a separate repo and a standard VS Code extension (VSIX).

| Extension | Repo | Description |
|---|---|---|
| **Sessions** | [claudeos-sessions](https://github.com/aventre-labs/claudeos-sessions) | Session list sidebar. Create, rename, archive, delete Claude Code sessions. |
| **Terminal** | [claudeos-terminal](https://github.com/aventre-labs/claudeos-terminal) | Terminal views that attach to Claude Code tmux sessions. |
| **Home** | [claudeos-home](https://github.com/aventre-labs/claudeos-home) | Welcome page with shortcuts and quick actions. |
| **Secrets** | [claudeos-secrets](https://github.com/aventre-labs/claudeos-secrets) | Encrypted secret storage for API keys and tokens. Used by other extensions. |
| **Self-Improve** | [claudeos-self-improve](https://github.com/aventre-labs/claudeos-self-improve) | Extension manager UI and self-improvement context for Claude Code sessions. |

## Optional Extensions

Built by the ClaudeOS team but not included in the default distribution. Install from the Extension Manager panel in the UI.

| Extension | Repo | Description |
|---|---|---|
| Memory | [claudeos-memory](https://github.com/aventre-labs/claudeos-memory) | Mem0-based memory with knowledge graph visualizer. |
| Browser | [claudeos-browser](https://github.com/aventre-labs/claudeos-browser) | Chrome stealth browser with session viewer and replay. |
| Scheduler | [claudeos-scheduler](https://github.com/aventre-labs/claudeos-scheduler) | n8n-based automation and scheduled jobs. |
| File Explorer | [claudeos-file-explorer](https://github.com/aventre-labs/claudeos-file-explorer) | Enhanced filesystem browser. |
| Execution Graph | [claudeos-execution-graph](https://github.com/aventre-labs/claudeos-execution-graph) | d3.js visualization of session tool calls and agent trees. |
| Passkey Auth | [claudeos-passkey-auth](https://github.com/aventre-labs/claudeos-passkey-auth) | WebAuthn/passkey authentication for the UI. |

## Installing Extensions

Extensions are installed through the **Extension Manager** panel in the sidebar (provided by the `claudeos-self-improve` extension):

1. Click the puzzle piece icon in the activity bar to open the Extension Manager.
2. Paste a GitHub repo URL and click **Install**.
3. For private repos, select a GitHub PAT from the secrets manager dropdown before installing.

You can also ask Claude naturally in any session — e.g., "install the memory extension from github.com/aventre-labs/claudeos-memory" — and it will handle the installation.

## Building Extensions

ClaudeOS extensions are standard VS Code extensions. Use the included template to get started:

```bash
cp -r extension-template/ ../my-extension
cd ../my-extension

# Edit package.json with your extension's metadata and contributions
# Implement your extension in src/extension.ts
# Add a webview/ directory if you need React-based UI panels
# Add an mcp-server/ directory if you need to provide Claude Code tools

npm install
npm run compile
npm run package  # Produces a .vsix file
```

Publish by creating a GitHub Release with the VSIX file attached. Add the topic `claudeos-extension` to your repo for discoverability.

See [SPEC.md](./SPEC.md) for detailed extension API documentation and [extension-template/AGENTS.md](./extension-template/AGENTS.md) for development guidelines.

## Self-Improvement

ClaudeOS can build new features for itself through natural prompting. In any Claude Code session, just ask:

> "Add a panel that shows a live execution graph of the current session"

Claude knows it's running inside ClaudeOS and has access to the extension template and install API. It will scaffold a new extension, implement the feature, build and install the VSIX, and reload the window — all autonomously. The kernel is never modified — only new extensions are created.

## Configuration

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `CLAUDEOS_AUTH_TOKEN` | Auto | Generated by Railway template (`secret(32)`). Set manually for Docker. Used for secret encryption. |
| `ANTHROPIC_API_KEY` | No | Configured through the setup wizard. Can also be set as env var. |
| `PORT` | No | HTTP port (default 8080, auto-set by Railway) |
| `CLAUDEOS_DATA_DIR` | No | Persistent data path (default `/data`) |

### Persistent Data

ClaudeOS stores persistent data at `/data` (configurable via `CLAUDEOS_DATA_DIR`):

- `extensions/` — Installed VS Code extensions
- `sessions/` — Archived session data
- `secrets/` — Encrypted secret store
- `config/` — User settings

Mount a volume here to persist data across container restarts.

## Documentation

- [SPEC.md](./SPEC.md) — Full technical specification
- [IMPLEMENTATION.md](./IMPLEMENTATION.md) — Phased implementation roadmap
- [AGENTS.md](./AGENTS.md) — AI agent development guidelines for this repo

## License

MIT
