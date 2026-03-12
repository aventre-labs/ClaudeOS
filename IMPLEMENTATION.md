# IMPLEMENTATION.md — ClaudeOS Build Roadmap

> Detailed planning and execution is tracked in `.planning/`. This file is a human-readable summary.

## Milestone 1: v1 — Core Product (4 phases, 51 requirements)

### Phase 1: Supervisor + Container Foundation
**Goal**: Bootable, deployable container with supervisor API, tmux session management, extension install pipeline, and extension template.

**Delivers:**
- `supervisor/` — Fastify HTTP server on `:3100` with session CRUD, extension install, health check
- `Dockerfile` — Multi-stage build on `node:22-bookworm-slim` with code-server, Claude Code, tmux, git
- `docker-compose.yml` — Local dev with persistent volume
- `railway.toml` — Deploy config with healthcheck and restart policy
- `product.json` + `settings.json` — code-server branding and defaults
- `default-extensions.json` — First-boot extension list
- `extension-template/` — Scaffold for new extensions (package.json, tsconfig, src, AGENTS.md)
- `scripts/` — build.sh, dev.sh, deploy-railway.sh

**Stack**: Node.js 22 LTS, TypeScript 5.8, Fastify 5, Zod 4, esbuild, tmux CLI, Docker

**Requirements**: SUP-01–09, DEP-01–07, TPL-01–04 (20 total)

### Phase 2: Session Management
**Goal**: Visual sidebar and terminal tabs — the core UX loop.

**Delivers:**
- `claudeos-sessions` extension — Activity bar sidebar, tree view grouped by status, context menus, archive/zombie sections, notification badges, read/unread styling
- `claudeos-terminal` extension — Terminal tabs attached to tmux sessions, status icons, multi-tab support

**Stack**: VS Code Extension API, @types/vscode, esbuild, vsce

**Requirements**: SES-01–09, TRM-01–04 (13 total)

### Phase 3: Platform Services
**Goal**: Encrypted secret storage (foundation service) and welcome home page.

**Delivers:**
- `claudeos-secrets` extension — AES-256-GCM encrypted storage, public API (getSecret/setSecret/hasSecret/deleteSecret/listSecrets), status bar indicator, first-run walkthrough, auto-configure Anthropic API key for Claude Code
- `claudeos-home` extension — Welcome webview tab, new session button, recent sessions, shortcuts grid

**Stack**: React 19, Node.js crypto, Zod 4, @vscode/webview-ui-toolkit

**Requirements**: SEC-01–06, HOM-01–04 (10 total)

### Phase 4: Self-Improvement
**Goal**: Claude Code extends its own capabilities by building and installing VS Code extensions.

**Delivers:**
- `claudeos-self-improve` extension — Extension Manager sidebar panel (list, install from GitHub URL, uninstall), MCP server exposing extension tools to Claude Code, bundled extension template, self-improve session icon

**Stack**: @modelcontextprotocol/sdk, React 19, Zod 4, esbuild

**Requirements**: IMP-01–08 (8 total)

---

## Milestone 2: Optional Extensions (post-v1)

Built as separate repos, installable from the Extension Manager UI.

- **`claudeos-memory`** — Mem0 integration + knowledge graph visualizer
- **`claudeos-browser`** — Chrome stealth browser + session viewer/replay
- **`claudeos-scheduler`** — n8n integration for automation and scheduled jobs
- **`claudeos-file-explorer`** — Enhanced filesystem browser with session change viewer
- **`claudeos-execution-graph`** — d3.js visualization of session tool calls and agent trees

## Milestone 3: Marketplace + Polish (post-v1)

- Self-hosted marketplace service indexing GitHub repos tagged `claudeos-extension`
- VS Code Marketplace API compatibility for in-IDE search and install
- Custom VS Code theme (dark, minimal, Apple-inspired)
- Onboarding walkthrough
- `claudeos-passkey-auth` — WebAuthn/passkey auth extension
- Performance optimization

---

*Full planning artifacts: `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/research/`*
