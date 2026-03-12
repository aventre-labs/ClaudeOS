# ClaudeOS

## What This Is

A browser-accessible operating environment for Claude Code. ClaudeOS wraps stock Claude Code in a VS Code-based UI (via code-server) with a modular extension system where all features are standard VS Code extensions (VSIX packages). The kernel is intentionally tiny — a supervisor process that boots code-server, manages Claude Code sessions via tmux, and handles extension installation from GitHub repos. Deployable as a Docker container on Railway or locally.

## Core Value

Give Claude Code a real, extensible browser UI and the ability to expand its own capabilities by building and installing new extensions — without ever modifying Claude Code itself.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Supervisor boots code-server and exposes session management API on localhost:3100
- [ ] Claude Code sessions managed via tmux (create, list, stop, kill, archive, revive)
- [ ] Extensions installed from GitHub repo URLs (clone, build VSIX, install into code-server)
- [ ] First-boot auto-installation of default extensions from default-extensions.json
- [ ] Encrypted secret storage with public API for other extensions (AES-256-GCM)
- [ ] Session list sidebar with status indicators, badges, archive/zombie support
- [ ] Terminal views that attach to Claude Code tmux sessions
- [ ] Welcome/home tab with shortcuts and quick actions
- [ ] Extension manager UI panel (install from GitHub URL, list, uninstall)
- [ ] Self-improvement via natural prompting — Claude Code sessions aware they're in ClaudeOS with access to extension template and install API
- [ ] Deployable as Docker container on Railway with persistent volume
- [ ] code-server branded as ClaudeOS with minimal default settings

### Out of Scope

- Memory system (Mem0) — future module, not v1
- Chrome stealth browser — future module, not v1
- n8n scheduling/automation — future module, not v1
- Execution graph visualization — future module, not v1
- Passkey/WebAuthn authentication — future module, not v1
- Custom VS Code marketplace service — future, initial install is URL-based
- Forking or modifying code-server source — configure via product.json/settings/extensions only
- Modifying Claude Code in any way — stock, in tmux, never patched

## Context

- This is v3+ of the concept. Previous versions explored Nix-based modules, custom UIs, and various architectures. This version consolidates to a single repo kernel + VS Code extensions.
- code-server (by Coder) provides VS Code in the browser with full extension compatibility. Extensions use standard VS Code APIs (webview panels, tree views, activity bar, commands, etc.).
- Claude Code has native tmux support — sessions run in tmux and the CLI renders in terminal as-is.
- The extension system maps directly to VS Code's extension model: `package.json` with `contributes`, `extensionDependencies` for hard deps, `vscode.extensions.getExtension()` for optional deps.
- Extensions can bundle MCP servers that register with Claude Code's MCP config on activation.
- Five first-party extensions ship with the default distribution: secrets, sessions, terminal, home, self-improve.

## Constraints

- **Claude Code integrity**: Never patch, wrap, shim, or monkey-patch Claude Code. Interact only through tmux and its public CLI.
- **code-server integrity**: Never fork code-server source. Configure via product.json, settings.json, and extensions only.
- **Kernel minimalism**: The kernel repo contains only the supervisor (~300 lines), container config, and extension template. All features live in extensions.
- **Extension independence**: Extensions communicate with supervisor via HTTP (localhost:3100) and with each other via VS Code extension API. Never import supervisor code directly.
- **Tech stack**: TypeScript (strict), Node.js LTS, code-server, tmux, Docker/Nix.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| code-server over Theia/OpenVSCode Server | More customization points, wider deployment, full extension compat | — Pending |
| Everything is a VS Code extension | VS Code extension API covers all needed UI (panels, sidebars, webviews, commands, tree views) — no need to invent a module system | — Pending |
| Sessions via tmux | Claude Code has native tmux support, keeps Claude Code completely stock | — Pending |
| Extension install via GitHub URL | Simple, no marketplace infrastructure needed for v1, private repos supported via PAT secrets | — Pending |
| Self-improvement via natural prompting not slash commands | More natural UX, Claude just needs context about being in ClaudeOS and access to the template/API | — Pending |
| Extension manager as UI panel not commands | Users manage extensions visually, not via CLI commands | — Pending |
| Hard deps via extensionDependencies, optional via runtime check | VS Code handles activation order and warnings for hard deps; graceful degradation for optional | — Pending |

---
*Last updated: 2026-03-11 after initialization*
