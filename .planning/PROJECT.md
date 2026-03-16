# ClaudeOS

## What This Is

A browser-accessible operating environment for Claude Code with self-improvement capabilities. ClaudeOS wraps stock Claude Code in a VS Code-based UI (via code-server) with a modular extension system where all features are standard VS Code extensions (VSIX packages). The kernel is a supervisor process that boots code-server, manages Claude Code sessions via tmux, and handles extension installation from GitHub repos. Claude Code sessions can scaffold, build, and install new extensions at runtime — extending their own capabilities without human intervention. Deployable as a Docker container on Railway or locally.

## Core Value

Give Claude Code a real, extensible browser UI and the ability to expand its own capabilities by building and installing new extensions — without ever modifying Claude Code itself.

## Requirements

### Validated

- ✓ Supervisor boots code-server and exposes session management API on localhost:3100 — v1.0
- ✓ Claude Code sessions managed via tmux (create, list, stop, kill, archive, revive) — v1.0
- ✓ Extensions installed from GitHub repo URLs (clone, build VSIX, install into code-server) — v1.0
- ✓ First-boot auto-installation of default extensions from default-extensions.json — v1.0
- ✓ Encrypted secret storage with public API for other extensions (AES-256-GCM) — v1.0
- ✓ Session list sidebar with status indicators, badges, archive/zombie support — v1.0
- ✓ Terminal views that attach to Claude Code tmux sessions — v1.0
- ✓ Welcome/home tab with shortcuts and quick actions — v1.0
- ✓ Extension manager UI panel (install from GitHub URL, list, uninstall) — v1.0
- ✓ Self-improvement via natural prompting — Claude Code sessions scaffold, build, and install extensions via MCP tools — v1.0
- ✓ Deployable as Docker container on Railway with persistent volume — v1.0
- ✓ code-server branded as ClaudeOS with minimal default settings — v1.0

### Active

#### v1.1 Zero-Config Onboarding
- ✓ First-boot setup wizard with build progress and setup UI — Phases 10-12
- ✓ Railway CLI auth — "Sign in with Railway" via `railway login` flow, subprocess management — Phase 11
- ✓ Claude CLI auth — "Sign in with Anthropic" via `claude login` flow, API key validation — Phase 11
- ✓ Launch flow after auth complete — credential handoff, animated transition, code-server start — Phase 13
- [ ] Fork-friendly deploy button — works for any fork without hardcoded repo URLs

### Out of Scope

- Memory system (Mem0) — future module, not v1
- Chrome stealth browser — future module, not v1
- n8n scheduling/automation — future module, not v1
- Execution graph visualization — future module, not v1
- Passkey/WebAuthn authentication — Railway CLI auth covers this use case for v1.1
- Custom VS Code marketplace service — future, initial install is URL-based
- Forking or modifying code-server source — configure via product.json/settings/extensions only
- Modifying Claude Code in any way — stock, in tmux, never patched

## Context

Shipped v1.0 with 14,596 LOC TypeScript across 230 files in 4 days (2026-03-11 → 2026-03-15).
v1.1 Zero-Config Onboarding: 4 phases (10-13), 10 plans, ~35 min total execution.
Tech stack: Fastify 5, Zod 3.25, React (wizard UI), code-server, tmux, Nix, Docker.
51 requirements satisfied across 9 phases (v1.0) + 4 zero-config onboarding phases (v1.1).
5 iterative audit/fix cycles closed all integration bugs before shipping v1.0.

- This is v3+ of the concept. Previous versions explored Nix-based modules, custom UIs, and various architectures. This version consolidates to a single repo kernel + VS Code extensions.
- code-server (by Coder) provides VS Code in the browser with full extension compatibility. Extensions use standard VS Code APIs (webview panels, tree views, activity bar, commands, etc.).
- Claude Code has native tmux support — sessions run in tmux and the CLI renders in terminal as-is.
- The extension system maps directly to VS Code's extension model: `package.json` with `contributes`, `extensionDependencies` for hard deps, `vscode.extensions.getExtension()` for optional deps.
- Extensions can bundle MCP servers that register with Claude Code's MCP config on activation.
- Five first-party extensions ship with the default distribution: secrets, sessions, terminal, home, self-improve.

### Known Tech Debt (from v1.0)
- extensionVsix `npm ci` may fail in Nix sandbox (no network) — needs per-extension buildNpmPackage derivations
- `detectGitHubPat()` skips `activate()` on secrets extension — private repo installs fail silently if secrets panel never opened
- `SecretsPublicApi` type duplicated across claudeos-secrets and claudeos-self-improve (must stay in sync)

## Constraints

- **Claude Code integrity**: Never patch, wrap, shim, or monkey-patch Claude Code. Interact only through tmux and its public CLI.
- **code-server integrity**: Never fork code-server source. Configure via product.json, settings.json, and extensions only.
- **Kernel minimalism**: The kernel repo contains only the supervisor (~300 lines), container config, and extension template. All features live in extensions.
- **Extension independence**: Extensions communicate with supervisor via HTTP (localhost:3100) and with each other via VS Code extension API. Never import supervisor code directly.
- **Tech stack**: TypeScript (strict), Node.js LTS, code-server, tmux, Docker/Nix.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| code-server over Theia/OpenVSCode Server | More customization points, wider deployment, full extension compat | ✓ Good — full extension API worked as expected |
| Everything is a VS Code extension | VS Code extension API covers all needed UI (panels, sidebars, webviews, commands, tree views) — no need to invent a module system | ✓ Good — 5 extensions ship cleanly |
| Sessions via tmux | Claude Code has native tmux support, keeps Claude Code completely stock | ✓ Good — zero Claude Code modifications needed |
| Extension install via GitHub URL | Simple, no marketplace infrastructure needed for v1, private repos supported via PAT secrets | ✓ Good — PAT support added in Phase 6 |
| Self-improvement via natural prompting not slash commands | More natural UX, Claude just needs context about being in ClaudeOS and access to the template/API | ✓ Good — MCP tools + skill file enable full loop |
| Extension manager as UI panel not commands | Users manage extensions visually, not via CLI commands | ✓ Good — command palette + sidebar panel |
| Hard deps via extensionDependencies, optional via runtime check | VS Code handles activation order and warnings for hard deps; graceful degradation for optional | ✓ Good — cross-extension API pattern works |
| Fastify 5 + Zod 3.25 type provider | Type-safe request validation with zero boilerplate | ✓ Good — all 20+ routes type-safe |
| Lazy service initialization (tryCreate pattern) | Secrets and boot services may not be available on startup | ✓ Good — resolved circular init issues |
| Discriminated union for DefaultExtension | Different install methods (github-release, local-vsix) need different fields | ✓ Good — clean dispatch in BootService |
| Additive onCommand activation (not onStartupFinished) | Cross-extension commands must work before sidebar opened, but avoid eager activation | ✓ Good — fixed home page shortcuts |
| Session cache on HomePanel | Avoid re-fetching sessions when user clicks a card | ✓ Good — fixed argument shape mismatch |
| Railway CLI auth over OAuth app | `railway login` avoids needing a registered OAuth app, redirect URI headaches, works on every fork | ✓ Good — subprocess + pairing code works |
| Claude CLI auth via `claude login` | Wraps existing CLI auth flow — gives users subscription billing, API key, and other options for free | ✓ Good — 10s timeout + API key fallback |
| First-boot wizard over env var auth | No CLAUDEOS_AUTH_TOKEN needed, instance is secure from creation, same pattern as Portainer/Gitea | ✓ Good — wizard + launch transition works end-to-end |
| Static callback page for Railway OAuth redirect | Avoids wildcard redirect URI limitation (Railway uses strict exact-match) | — Pending |
| Background async launch with SSE delivery | POST /wizard/launch returns 200 immediately, fires code-server start in background, delivers launch:ready via SSE when healthy | ✓ Good — avoids HTTP timeout during ~30s health check |
| Credential writer with atomic merge | Reads SecretStore, writes to native config locations (~/.claude/settings.json, ~/.railway/config.json) with tmp+rename and merge-not-overwrite | ✓ Good — handles restart re-writes safely |

---
*Last updated: 2026-03-16 after Phase 13 (v1.1 milestone complete)*
