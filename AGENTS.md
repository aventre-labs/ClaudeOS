# AGENTS.md — ClaudeOS Kernel

## Overview

This repo contains the **ClaudeOS kernel**: a ~300-line supervisor process, a Nix flake, a Dockerfile, and configuration files that boot code-server + Claude Code. **That's it.** All features live in extensions (separate repos). Treat this repo as sacred infrastructure.

---

## The Golden Rule

**Never add features to this repo.** If you're writing UI code, session management UI, a settings panel, a memory system, a browser integration, a scheduler, or anything that a user interacts with — it belongs in an extension, not here. The only code in this repo is:

1. `supervisor/` — Starts code-server and exposes a Claude Code session management API over localhost HTTP
2. `flake.nix` / `Dockerfile` — Builds the container image
3. `product.json` / `settings.json` — code-server configuration
4. `default-extensions.json` — List of extension repos to install on first boot
5. `extension-template/` — Scaffold for creating new extensions

If you're unsure whether something belongs here or in an extension, it belongs in an extension.

---

## Architecture Context

ClaudeOS is a thin orchestration layer:

```
┌─────────────────────────────────────────────────┐
│  Container (Nix flake / Docker)                 │
│                                                 │
│  ┌──────────────┐    ┌────────────────────────┐ │
│  │  Supervisor   │───▶│  code-server           │ │
│  │  (this repo)  │    │  + installed extensions │ │
│  └──────┬───────┘    └────────────────────────┘ │
│         │                                       │
│         │ tmux                                  │
│         ▼                                       │
│  ┌──────────────┐                               │
│  │  Claude Code  │                               │
│  │  (stock, never│                               │
│  │   modified)   │                               │
│  └──────────────┘                               │
└─────────────────────────────────────────────────┘
```

The supervisor starts code-server and manages Claude Code sessions via tmux. Extensions communicate with the supervisor over `http://localhost:3100`. Claude Code runs completely stock — never patched, wrapped, or proxied.

---

## Working on This Repo

### What you may change

- **`supervisor/`**: Bug fixes, performance improvements, new API endpoints that extensions need. Keep it minimal. Every new endpoint must be documented in SPEC.md.
- **`flake.nix` / `Dockerfile`**: Dependency updates, build optimizations. Never add application-level dependencies — those belong in extensions.
- **`product.json`**: Branding, extension gallery URL, default settings.
- **`settings.json`**: Default VS Code settings for new installs.
- **`default-extensions.json`**: Adding or removing first-party extensions from the default distribution.
- **`extension-template/`**: Improvements to the scaffold.
- **`scripts/`**: Build, dev, and deploy tooling.

### What you must never change

- **Claude Code itself.** Never patch, wrap, shim, or monkey-patch Claude Code. If Claude Code doesn't do something you need, expose it through the supervisor API or build an extension.
- **code-server source.** We don't fork code-server. We configure it via `product.json`, `settings.json`, and extensions. If you need code-server to behave differently, find an extension-based solution.

### Code standards

- TypeScript for all supervisor code. Strict mode. No `any` types.
- Every supervisor API endpoint has:
  - An OpenAPI-style JSDoc comment
  - Input validation
  - Typed request/response interfaces exported from a shared `types.ts`
  - An integration test
- Commits are conventional commits: `feat:`, `fix:`, `docs:`, `chore:`.
- No dead code. No commented-out code. No TODOs without a linked issue.

### Testing

- `npm test` must pass before any merge.
- Supervisor API tests use a real tmux instance (not mocked) in CI.
- Tests must clean up all tmux sessions they create.
- No test should take longer than 30 seconds.

### CI/CD

- Push to `main` triggers:
  1. Tests
  2. Docker image build
  3. Push to container registry
  4. Railway redeploy (if configured)
- PRs require passing tests and at least one review (or approval from ClaudeOS self-improve agent).

---

## Working on Extensions

Extensions live in their own repos. Each extension repo should have its own `AGENTS.md` that inherits from the `extension-template/AGENTS.md` in this repo.

### Key rules for extension development

1. **Extensions communicate with the supervisor only via `http://localhost:3100`.** Never import supervisor code directly. The API is the contract.
2. **Extensions communicate with other extensions via the VS Code extension API** (`vscode.extensions.getExtension()` and its `exports`). Define a clean public API in your extension's `activate()` return value.
3. **Extensions that need secrets must depend on `claudeos-secrets`.** Never store secrets yourself. Call the secrets extension API.
4. **Extensions that include MCP servers** should register them with Claude Code's MCP config on activation and deregister on deactivation.
5. **Extensions declare dependencies explicitly.** Use `extensionDependencies` in `package.json` for hard dependencies — VS Code will enforce activation order and warn users if a dependency is missing. For optional enhancements (e.g., adding indicators to another extension's UI when it's present), check for the dependency at runtime with `vscode.extensions.getExtension()` and degrade gracefully if it's absent. Hard crashes from missing extensions are never acceptable, but requiring dependencies is fine.

### Creating a new extension

1. Copy `extension-template/` to a new repo.
2. Update `package.json` with your extension's name, contributes (views, commands, etc.).
3. Implement your extension in `src/extension.ts`.
4. If you need a webview panel, build your React/HTML app in `webview/`.
5. If you need an MCP server, add it in `mcp-server/`.
6. Build the VSIX with `npm run package`.
7. Publish as a GitHub Release on your repo.

### Self-improvement workflow

Self-improvement happens through natural prompting — not slash commands. When a user asks ClaudeOS to add a feature (e.g., "build a memory system for yourself"), the `claudeos-self-improve` extension provides context to the Claude Code session so it knows it's running inside ClaudeOS and has access to the extension template and install API. The session then:

1. Scaffolds a new extension from the template (or modifies an existing extension repo if one is specified).
2. Implements the feature, writes tests, and builds the VSIX.
3. Installs the VSIX into the running code-server instance via the supervisor API.
4. Triggers a window reload.
5. Verifies the extension activated successfully.
6. **It never touches the kernel repo.** If the supervisor API needs a new endpoint, it opens an issue on this repo instead.

---

## Deployment

### Railway

- `railway.toml` and `Dockerfile` are preconfigured.
- Environment variables:
  - `CLAUDEOS_AUTH_TOKEN` — Token for code-server access (required)
  - `ANTHROPIC_API_KEY` — Optional, can also be set via secrets extension in UI
  - `PORT` — Set by Railway automatically
- The Railway template is a separate repo that references this one.

### Local development

```bash
# With Nix
nix develop
./scripts/dev.sh

# With Docker
docker compose up
```

---

## File inventory

| Path | Purpose | Modify? |
|---|---|---|
| `flake.nix` | Nix build definition | Rarely |
| `Dockerfile` | Container build | Rarely |
| `railway.toml` | Railway deploy config | Rarely |
| `supervisor/index.ts` | Boot sequence | Carefully |
| `supervisor/session-api.ts` | Claude Code session CRUD | When extensions need new capabilities |
| `supervisor/types.ts` | Shared TypeScript types | When API changes |
| `product.json` | code-server branding + gallery URL | Rarely |
| `settings.json` | Default VS Code settings | Occasionally |
| `default-extensions.json` | Extensions bundled with default distro | When adding/removing first-party extensions |
| `extension-template/` | Scaffold for new extensions | To improve the template |
| `scripts/` | Build/dev/deploy tooling | As needed |
