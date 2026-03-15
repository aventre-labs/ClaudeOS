# Technology Stack

**Project:** ClaudeOS v1.1 Zero-Config Onboarding
**Researched:** 2026-03-15

## Context

This document covers ONLY the stack additions needed for v1.1 zero-config onboarding. The existing validated stack (Fastify 5, Zod 3.24, code-server, tmux, TypeScript strict, Node.js 22 LTS, esbuild, Docker/Nix) is not re-evaluated here. See previous STACK.md (2026-03-11) for full base stack rationale.

---

## Recommended Stack Additions

### Railway CLI Auth Integration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `railway` CLI | 4.x (container-installed) | Auth flow via `railway login --browserless` | The `--browserless` flag outputs a pairing URL + 4-word code to stdout. No OAuth app registration needed -- works for every fork without client IDs or redirect URIs. |
| Node.js `child_process.spawn` | Built-in | Capture Railway CLI stdout | No library needed. Spawn `railway login --browserless`, parse stdout for pairing code pattern and URL. Pipe to setup wizard UI. |
| `railway whoami` | Built-in CLI | Verify auth success | Returns `Logged in as Name (email)` on success, non-zero exit on failure. |

**Key findings (HIGH confidence -- tested locally v4.27.5 + official docs):**
- `railway login --browserless` prints a URL (`https://railway.com/cli-login?d=...`) and a 4-word pairing code (`word-word-word-word`)
- User visits URL in their browser, enters pairing code, approves
- CLI blocks until auth completes, then prints success message
- `RAILWAY_TOKEN` env var can bypass interactive login entirely (CI/CD path)
- Railway auto-injects `RAILWAY_GIT_REPO_OWNER` and `RAILWAY_GIT_REPO_NAME` in GitHub-connected deployments

**What NOT to add:**
- Do NOT register a Railway OAuth app. The OAuth flow requires redirect URIs, client secrets, token refresh logic, and PKCE -- massive complexity for zero benefit when the CLI browserless flow already works.
- Do NOT use `railway login` (browser mode) -- no browser available in container.

### Claude Code Auth Integration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `claude setup-token` | CLI command (2.x) | Generate long-lived OAuth token | User runs on their local machine (has browser), gets 1-year OAuth token. Paste into ClaudeOS setup wizard. |
| `CLAUDE_CODE_OAUTH_TOKEN` | Env var | Token-based auth for headless | Set this env var and Claude Code authenticates without browser interaction. |
| `~/.claude.json` | Config file | Bypass onboarding flow | Writing `hasCompletedOnboarding: true` + `oauthAccount` fields skips Claude Code's interactive first-run wizard. |
| `ANTHROPIC_API_KEY` | Env var (alternative) | API key auth for Console users | Simpler but per-token billing. Support as alternative option in wizard. |

**Key findings (MEDIUM confidence -- community gist + GitHub issue #7100, not official docs):**

Three viable headless auth paths exist:

1. **`claude setup-token` + paste (recommended):** User runs locally, gets long-lived OAuth token (~1 year). Paste into ClaudeOS wizard. ClaudeOS stores it encrypted and sets `CLAUDE_CODE_OAUTH_TOKEN` env var for all tmux sessions. Supports Pro/Max subscriptions.

2. **`ANTHROPIC_API_KEY` env var:** For Console/API-key users. Simpler but per-token billing, no subscription benefits. Support as alternative option in wizard.

3. **SSH port forwarding of `claude /login`:** Not viable -- requires SSH tunnel, violates zero-config goal.

**Architecture decision: Token paste, not in-container browser auth.**
Claude Code's `/login` opens a local browser for OAuth. Inside a container, there is no browser. Token paste (user generates locally, pastes into wizard) mirrors how Portainer, Gitea, and similar self-hosted apps handle initial auth.

**Verification flow:**
After storing the token, run `claude auth status` (or set the env var and run `claude -p "echo test"`) to verify the token works before proceeding.

**What NOT to add:**
- Do NOT attempt to run `claude /login` inside the container and proxy the browser.
- Do NOT use SSH port forwarding -- violates zero-config goal.
- Do NOT hardcode any auth tokens or API keys in the image.

### Setup Wizard UI

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vanilla HTML/CSS/JS | N/A | Multi-step setup wizard | The existing `first-boot/setup.html` is vanilla. No framework needed for a 4-step wizard that runs once. Adding React for a setup page is massive overkill -- the page is seen for 2 minutes then never again. |

**Setup wizard flow (extends existing `BootService.serveSetupPage()`):**

1. **Step 1: Password** (existing) -- Create code-server password
2. **Step 2: Railway Auth** -- Show pairing code/URL from `railway login --browserless`, poll for completion
3. **Step 3: Claude Auth** -- Paste `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`, validate
4. **Step 4: Launch** -- Install extensions, start code-server

**Integration points in existing code:**

| Existing Code | Change Needed |
|---------------|---------------|
| `BootService.serveSetupPage()` | Extend with additional routes for auth wizard steps |
| `BootState` type (`initializing -> setup -> installing -> ready -> ok`) | Add `auth-railway` and `auth-claude` states between `setup` and `installing` |
| `POST /api/v1/setup` | Keep for password. Add `POST /api/v1/setup/railway-start`, `GET /api/v1/setup/railway-status`, `POST /api/v1/setup/claude-token` |
| `first-boot/setup.html` | Refactor to multi-step wizard with tabbed/stepped UI |
| Polling pattern (`setInterval` + `fetch('/api/v1/health')`) | Reuse for Railway auth polling -- already proven in existing code |

**What NOT to add:**
- No frontend framework. Vanilla HTML + `fetch()` is the right tool.
- No WebSocket for wizard status. Polling every 2s (existing pattern) is sufficient.
- No session management for the wizard. The setup server is ephemeral.

### Static Callback Page

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| N/A | N/A | NOT needed for v1.1 | Railway CLI browserless flow uses pairing codes, not redirect URIs. No callback page required. |

**Key finding: Callback page is NOT needed for v1.1.**

The `railway login --browserless` flow works entirely via pairing code -- the user visits `https://railway.com/cli-login`, enters the code, and the CLI detects auth completion via internal polling. No redirect URI, no callback page.

A static callback page would only be needed if ClaudeOS registered its own Railway OAuth app (which it should NOT do for v1.1).

### Fork-Friendly Deploy Button

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Railway Template | N/A | One-click deploy for forkers | Register as Railway template via dashboard. Button URL: `https://railway.com/new/template/[CODE]`. Forkers click, get their own deployment with their own fork. |
| `RAILWAY_GIT_REPO_OWNER` | Auto-injected by Railway | Detect deployer's fork | Available at runtime in GitHub-connected deployments. No hardcoded repo URLs needed. |
| `RAILWAY_GIT_REPO_NAME` | Auto-injected by Railway | Combined with owner for full repo ref | `${RAILWAY_GIT_REPO_OWNER}/${RAILWAY_GIT_REPO_NAME}` gives the deployer's fork. |

**Deploy button implementation:**
1. Register ClaudeOS as Railway template (one-time, via Railway dashboard "Generate Template from Project")
2. Get template code, format button: `[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/[CODE])`
3. Railway handles forking the source repo into user's GitHub on deploy
4. Container reads auto-injected vars at runtime to know which fork it came from
5. No hardcoded repo URLs anywhere in code -- `railway.toml`'s `dockerImage` field needs to be parameterized or template should use GitHub source build

---

## New Dependencies Summary

### Runtime (supervisor) -- v1.1

```
No new npm dependencies required.
```

The Railway CLI and Claude CLI are already installed in the container. The setup wizard extends the existing raw `http.createServer` in `BootService`. Node.js built-in `child_process.spawn` handles CLI interaction. No new packages needed.

### Container (Nix/Docker) -- Verify

```
# Must verify Railway CLI is available in container:
# - Check Nix flake for railwayapp.cli or equivalent
# - If not present, add to Nix packages or install via curl in entrypoint
#
# Already present:
# - claude CLI (installed via entrypoint.sh)
# - Node.js 22 LTS
```

---

## Files to Modify

| File | Change | Why |
|------|--------|-----|
| `supervisor/src/services/boot.ts` | Extend `serveSetupPage()` with multi-step wizard routes | Add Railway auth, Claude auth steps to first-boot flow |
| `supervisor/src/types.ts` | Add `auth-railway`, `auth-claude` to `BootState` union | Track wizard progress through new auth states |
| `first-boot/setup.html` | Refactor to multi-step wizard UI | Replace single password form with 4-step wizard |
| `entrypoint.sh` | Read stored Claude token, export as `CLAUDE_CODE_OAUTH_TOKEN` | Auth tokens must persist across container restarts |
| `railway.toml` | Evaluate converting from `dockerImage` to GitHub source for template compat | Fork-friendly deploys may need source-based builds |

## Files to Create

| File | Purpose |
|------|---------|
| `supervisor/src/services/cli-auth.ts` | Service: spawn Railway/Claude CLIs, parse stdout, track auth state |
| `supervisor/src/routes/setup.ts` | Routes: `/api/v1/setup/railway-start`, `/railway-status`, `/claude-token`, `/claude-token-validate` |
| `first-boot/wizard.html` | Multi-step wizard (replaces setup.html) with Railway + Claude auth steps |

## Environment Variables (New)

| Variable | Source | Purpose |
|----------|--------|---------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Stored encrypted in `/data/config/claude-auth.json`, exported at boot | Authenticates Claude Code sessions without browser |
| `ANTHROPIC_API_KEY` | Alternative to OAuth token, stored same way | API key auth for Console users |
| `RAILWAY_GIT_REPO_OWNER` | Auto-injected by Railway | Detect which fork deployed this instance |
| `RAILWAY_GIT_REPO_NAME` | Auto-injected by Railway | Combined with owner for full repo reference |
| `RAILWAY_TOKEN` | Optional, user-provided env var | Skip interactive Railway auth entirely (power users / CI) |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Railway auth | CLI `--browserless` pairing code | Railway OAuth app registration | OAuth requires registered app, redirect URIs per domain, client secrets, PKCE, token refresh. CLI browserless is zero-config for every fork. |
| Railway auth | CLI `--browserless` pairing code | `RAILWAY_TOKEN` env var only | Token-only auth works but requires users to manually create tokens in Railway dashboard. Browserless flow is more user-friendly, with token as a bypass for power users. |
| Claude auth | Token paste (`setup-token`) | In-container `claude /login` | No browser in container. The OAuth flow requires a local browser window. |
| Claude auth | Token paste | `ANTHROPIC_API_KEY` only | API key limits to Console/per-token billing. Token paste supports Pro/Max subscriptions. Support BOTH as options. |
| Claude auth | Token paste | Credential file transfer (`~/.config/claude-code/auth.json`) | Requires user to find and copy an opaque JSON file. Token paste is a single string -- much simpler UX. |
| Setup wizard | Vanilla HTML | React/Vue SPA | Setup runs once per instance. Framework adds build tooling, bundle size, and complexity for a page seen for 2 minutes. |
| Wizard updates | HTTP polling (2s interval) | WebSocket | Existing setup page already uses `setInterval` + `fetch()` polling. Proven pattern, no added complexity. |
| Callback page | None (not needed) | Static `callback.html` | CLI browserless flow uses pairing codes, not redirects. No callback required. |
| Deploy button | Railway Template | Custom deploy script | Railway templates handle forking, env var configuration, and deployment in one click. No custom scripting needed. |

---

## Sources

- [Railway CLI Login Docs](https://docs.railway.com/cli/login) -- HIGH confidence, official
- [Railway CLI Reference](https://docs.railway.com/reference/cli-api) -- HIGH confidence, official
- [Railway Variables Reference](https://docs.railway.com/reference/variables) -- HIGH confidence, confirms `RAILWAY_GIT_REPO_OWNER`, `RAILWAY_GIT_REPO_NAME` and other auto-injected vars
- [Railway OAuth Login & Tokens](https://docs.railway.com/integrations/oauth/login-and-tokens) -- HIGH confidence, reviewed but NOT recommended for v1.1
- [Railway Template Creation](https://docs.railway.com/templates/create) -- HIGH confidence, official
- [Railway Template Deployment](https://docs.railway.com/templates/deploy) -- HIGH confidence, official
- [Railway Publish & Share](https://docs.railway.com/guides/publish-and-share) -- HIGH confidence, deploy button format
- [Claude Code Authentication Docs](https://code.claude.com/docs/en/authentication) -- HIGH confidence, official
- [Automating Claude Code on Headless VPS](https://gist.github.com/coenjacobs/d37adc34149d8c30034cd1f20a89cce9) -- MEDIUM confidence, community gist documenting `setup-token` flow, `~/.claude.json` bypass, `CLAUDE_CODE_OAUTH_TOKEN` env var
- [Claude Code Headless Auth Issue #7100](https://github.com/anthropics/claude-code/issues/7100) -- MEDIUM confidence, closed NOT_PLANNED but documents SSH forwarding and credential transfer methods
- Local CLI testing: `railway --version` (4.27.5), `railway login --help`, `railway whoami` -- HIGH confidence, direct observation
- Local CLI testing: `claude --version` (2.1.29), `claude auth --help`, `claude setup-token --help` -- HIGH confidence, direct observation
