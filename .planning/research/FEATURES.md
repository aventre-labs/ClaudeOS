# Feature Landscape

**Domain:** Zero-config onboarding for self-hosted cloud IDE (ClaudeOS v1.1)
**Researched:** 2026-03-15

## Existing System Context

ClaudeOS v1.0 already has a first-boot flow:
- `BootService` with states: `initializing -> setup -> installing -> ready -> ok`
- `first-boot/setup.html` serves a password creation form
- After password submit, polls `/api/v1/health` for "ready" state
- Shows "Launch ClaudeOS" button when extensions finish installing
- Auth is via `CLAUDEOS_AUTH_TOKEN` env var (code-server password)

v1.1 extends this into a multi-step onboarding wizard with CLI-based auth for Railway and Anthropic.

## Table Stakes

Features users expect from a zero-config onboarding flow. Missing = product feels broken or unfinished.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Build progress display during first boot | Users see a blank/broken page while Docker image builds and extensions install (~60s). Portainer, Gitea, code-server all show status during init. Without it, users assume the deploy failed and abandon. | Low | Existing `BootState` machine, existing `setup.html`, existing health endpoint | Extend setup.html to show progress BEFORE the password form. Poll `/api/v1/health` which already returns boot state. Add human-readable status messages per state: "Building environment...", "Installing extensions...", "Ready for setup". |
| Password creation on first access | Already built in v1.0. Universal pattern: Portainer shows admin creation, Gitea shows install wizard, code-server generates a random password. Every self-hosted tool does this. | Already done | `BootService.serveSetupPage()`, `first-boot/setup.html` | No new work. Already creates password, generates encryption key, stores auth config. Just needs to be wired as Step 2 of a multi-step wizard. |
| Claude Code authentication | Without API credentials, Claude Code sessions fail immediately. This is the core dependency -- users deploy ClaudeOS to USE Claude Code. If auth doesn't work, nothing works. | Low-Medium | `ANTHROPIC_API_KEY` env var, claude CLI in container | Primary path: accept `ANTHROPIC_API_KEY` in the wizard UI, store it, pass as env var to Claude Code sessions. If the env var is already set (via Railway env vars at deploy time), auto-detect and skip this step. API key input is reliable. Interactive `claude login` in Docker containers is NOT reliable (see Anti-Features). |
| Fork-friendly deploy button | The README "Deploy on Railway" button must work for any GitHub fork, not just the original repo. If a contributor forks and clicks deploy, it should deploy THEIR fork. | Low | Railway system env vars | Railway provides `RAILWAY_GIT_REPO_OWNER` and `RAILWAY_GIT_REPO_NAME` as system env vars on GitHub-triggered deploys. Remove any hardcoded repo references. Verified in Railway official docs -- HIGH confidence. |
| Launch flow after all setup completes | Clear "you're done" moment. Existing setup.html already has a "Launch ClaudeOS" button. Needs to appear after the FULL wizard (not just password creation). | Low | All prior steps complete | Extend the existing launch button to gate on full wizard completion. Page reload transitions from setup server to code-server. |

## Differentiators

Features that go beyond the basics and create a polished, distinctive onboarding experience.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Stepper wizard UX | Multi-step visual progress through setup instead of a single form. Steps: Build Progress -> Create Password -> Configure Claude -> Connect Railway (optional) -> Launch. Portainer does admin -> environment wizard. Gitea does DB -> admin -> settings. This pattern is well-established and builds user confidence. | Medium | New HTML/CSS/JS in `setup.html`, refactor `BootService` state machine | Replace single password form with a stepper. Each step: pending/active/complete/skipped. Optional steps (Railway) get a "Skip" button. The stepper is pure frontend -- backend already has the state machine. |
| "Sign in with Railway" via `--browserless` | Users authenticate Railway inside ClaudeOS for Railway-aware features. No OAuth app registration, no redirect URIs, works on every fork automatically. | Medium | `railway` CLI in container, new wizard step | `railway login --browserless` outputs a pairing code + URL. Setup UI shows: "Open this URL, enter code XXXX-XXXX". Poll `railway whoami` to detect completion. No redirect URIs, no OAuth apps, no secrets to configure. HIGH confidence this works -- verified in Railway official docs. |
| Build log streaming | During extension install, stream actual progress messages to the setup page instead of just a spinner. Shows extension names as they install. Builds trust that something is happening. | Medium | WebSocket (already registered via `@fastify/websocket`), `ExtensionInstaller` state tracking | `BootService.installExtensions()` already logs each extension install. Pipe these to a SSE or WebSocket channel. Setup page connects and shows: "Installing claudeos-sessions... Installing claudeos-home... Done." |
| Auto-detection of pre-configured auth | If `ANTHROPIC_API_KEY` is already set as an env var (common when user sets it in Railway dashboard), skip the Claude auth step entirely. If `RAILWAY_TOKEN` is set, skip Railway auth. Reduces wizard to just password creation + launch. True "zero-config" for users who pre-configure env vars. | Low | Environment variable checks | Check `process.env.ANTHROPIC_API_KEY` and `process.env.RAILWAY_TOKEN` at boot. Mark corresponding wizard steps as "auto-configured" with a checkmark. |

## Anti-Features

Features to explicitly NOT build. These are tempting but wrong for v1.1.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Interactive `claude login` browser redirect | `claude login` starts a local web server expecting a browser redirect to localhost. In a Docker container on Railway, the container's localhost is unreachable from the user's browser. This will silently fail or produce confusing errors. The device code flow (RFC 8628) was requested (issue #22992) but is NOT implemented as of March 2026. Issue #7100 (headless auth docs) was closed as NOT_PLANNED. | Use `ANTHROPIC_API_KEY` input field in the setup wizard. Store the key and pass it as env var to Claude Code sessions. This is the documented Docker pattern and works everywhere. |
| Railway OAuth app integration | Requires registering an OAuth app with Railway, configuring exact-match redirect URIs (which break when Railway domains change), and every fork would need its own OAuth app registration. This defeats "zero-config" entirely. Railway enforces strict exact-match on redirect URIs -- no wildcards, no patterns. | Use `railway login --browserless` pairing code flow. Zero configuration, works on every fork, no redirect URIs needed. |
| Custom OAuth/OIDC provider | Over-engineered for a single-user self-hosted tool. The entire auth stack (identity provider, token management, session handling) is massive scope for zero benefit over password auth. | Keep code-server's password auth. Password is set during first-boot wizard. Good enough for single-user instances. |
| Claude Code credential file transfer | Mounting `~/.config/claude-code/auth.json` from host into container works locally (Docker volume mount) but not on Railway (no host filesystem). Creates a split UX between local and cloud deploy. | Single path: `ANTHROPIC_API_KEY` env var. Works everywhere. |
| Automatic Railway project linking | Tempting to auto-run `railway link` during setup, but this requires project IDs that may not be available, and the user may not want the ClaudeOS instance linked to the project it's deployed on. | Let users run `railway link` manually in a terminal if they need project-specific Railway features. |
| WebAuthn/Passkey auth | Listed in PROJECT.md as explicitly out of scope. Adds complexity for marginal benefit on a tool behind Railway's own auth layer or a simple password. | Password auth via code-server. Already works. |

## Feature Dependencies

```
[Container Boot]
      |
      v
Build Progress Display  (BootState: initializing -> setup)
      |
      v
Password Creation  (BootState: setup, generates encryption key)
      |
      +--- Encryption key required for Secret Store
      |
      v
Claude Auth  (required -- ANTHROPIC_API_KEY input or auto-detect)
      |
      v
Railway Auth  (optional -- skippable, uses --browserless pairing code)
      |
      v
Extension Install  (BootState: installing, existing behavior)
      |
      v
code-server Launch  (BootState: ready -> ok, existing behavior)
      |
      v
Launch Flow  ("Launch ClaudeOS" button, page reload)
```

Key constraints:
- Password creation MUST happen before Claude/Railway auth (encryption key needed for storing API key in secret store)
- Claude auth is REQUIRED -- without `ANTHROPIC_API_KEY`, Claude Code sessions produce errors immediately
- Railway auth is OPTIONAL -- ClaudeOS works fine without Railway CLI auth
- If `ANTHROPIC_API_KEY` is pre-set via env var, Claude auth step is auto-skipped
- If `RAILWAY_TOKEN` is pre-set via env var, Railway auth step is auto-skipped
- Extension install and code-server launch are existing v1.0 behavior, unchanged

## MVP Recommendation

**Prioritize (must-have for v1.1):**

1. **Build progress display** -- Low complexity, high impact. Add boot-phase-aware messaging to setup.html so users see "Building environment..." / "Installing extensions..." instead of a blank page during the ~60s startup. Leverage existing `BootState` and health endpoint polling.

2. **Stepper wizard UX** -- Replace single password form with a multi-step flow. This is the structural change that everything else hangs on. Steps: Build Progress (auto) -> Create Password -> Claude Auth -> Railway Auth (optional) -> Launch.

3. **Claude Code auth via API key input** -- New wizard step. Text input for `ANTHROPIC_API_KEY`. If env var is already set, auto-detect and show as pre-configured. Store the key and pass it to Claude Code session spawning. This is the RELIABLE path -- `ANTHROPIC_API_KEY` is the officially documented Docker pattern.

4. **Fork-friendly deploy button** -- Remove hardcoded repo URLs, use `RAILWAY_GIT_REPO_OWNER`/`RAILWAY_GIT_REPO_NAME`. Trivial change, verified available.

5. **Launch flow refinement** -- "Launch ClaudeOS" button gates on full wizard completion.

**Include if time allows:**

6. **Railway CLI auth ("Sign in with Railway")** -- The `--browserless` pairing code flow is well-designed and verified to work. It adds a nice "connected to Railway" capability but ClaudeOS functions fine without it. Make it a skippable step.

7. **Auto-detection of pre-configured auth** -- Check env vars at boot, skip corresponding wizard steps. Turns the wizard into a single password step for users who set everything via Railway dashboard.

**Defer to v1.2+:**

- **Build log streaming via WebSocket** -- Spinner + status text is sufficient for MVP. Real log streaming is polish.
- **Interactive `claude login` wrapping** -- Blocked by Claude Code lacking device code flow (RFC 8628). Revisit when/if it ships.

## Complexity Assessment

| Feature | Effort | Risk | Notes |
|---------|--------|------|-------|
| Build progress display | 1-2h | Low | Extend existing setup.html, add status messages per BootState |
| Stepper wizard UX | 4-6h | Low | HTML/CSS/JS refactor of setup.html, multi-step form logic |
| Claude auth (API key input) | 2-3h | Low | New wizard step, env var storage, pass to session spawn |
| Fork-friendly deploy | 1h | Low | Update railway.toml/README to remove hardcoded repo refs |
| Launch flow refinement | 1h | Low | Gate launch button on full wizard state |
| Railway CLI auth | 4-6h | Medium | Spawn `railway login --browserless`, parse stdout, poll `railway whoami` |
| Auth auto-detection | 1-2h | Low | Check `process.env` at boot, mark steps as pre-configured |
| Interactive `claude login` | 6-8h | **HIGH** | Container networking broken, no device code flow -- DO NOT ATTEMPT |

**Total estimated effort for must-haves: ~10-14 hours**
**Total with nice-to-haves: ~16-22 hours**

## Sources

- [Portainer Initial Setup](https://docs.portainer.io/start/install-ce/server/setup) -- MEDIUM confidence (official docs, verified first-boot admin + environment wizard pattern)
- [Gitea Installation](https://docs.gitea.com/installation/install-from-binary) -- MEDIUM confidence (official docs, verified DB + admin + settings wizard)
- [code-server Authentication](https://deepwiki.com/coder/code-server/2.5-authentication-and-security) -- MEDIUM confidence (auto-generates password on first run, config at ~/.config/code-server/config.yaml)
- [Railway CLI Login](https://docs.railway.com/cli/login) -- HIGH confidence (official docs, verified `--browserless` flag outputs pairing code + URL)
- [Railway Variables Reference](https://docs.railway.com/reference/variables) -- HIGH confidence (official docs, confirmed `RAILWAY_GIT_REPO_OWNER` and `RAILWAY_GIT_REPO_NAME` exist for GitHub-triggered deploys)
- [Claude Code Headless Auth Issue #7100](https://github.com/anthropics/claude-code/issues/7100) -- HIGH confidence (closed NOT_PLANNED Jan 2026, workarounds: SSH forwarding, credential transfer, API key env var)
- [Claude Code Device Code Flow Issue #22992](https://github.com/anthropics/claude-code/issues/22992) -- MEDIUM confidence (feature request from Feb 2026, not yet implemented)
- [Claude Code Docker Tutorial](https://www.datacamp.com/tutorial/claude-code-docker) -- MEDIUM confidence (recommends `ANTHROPIC_API_KEY` env var as the Docker authentication pattern)
- [Claude Code Docker Sandbox](https://docs.docker.com/ai/sandboxes/agents/claude-code/) -- MEDIUM confidence (Docker official docs, confirms `-e ANTHROPIC_API_KEY` pattern)
