# Project Research Summary

**Project:** ClaudeOS v1.1 Zero-Config Onboarding
**Domain:** Containerized web IDE with CLI-based auth integration and multi-step first-boot wizard
**Researched:** 2026-03-15
**Confidence:** HIGH (stack and pitfalls verified against official docs and local CLI testing)

## Executive Summary

ClaudeOS v1.1 adds a zero-config onboarding wizard to a working v1.0 foundation (Fastify 5, code-server, tmux, TypeScript strict, Node.js 22, Docker/Nix). The core challenge is threading two browser-hostile auth flows — Railway CLI auth and Claude Code auth — through a web UI running inside a container where no browser is available and only one port is publicly exposed. Research across official docs, GitHub issues, and local CLI testing produces a clear, validated approach: use `railway login --browserless` pairing-code relay for Railway auth, and `ANTHROPIC_API_KEY` input for Claude auth. Both avoid OAuth redirect URI complexity and work on every fork without configuration.

The recommended implementation extends the existing pre-Fastify temporary HTTP server (already in `BootService.serveSetupPage()`) into a 4-step wizard running on port 8080 — the only publicly-accessible port on Railway. The wizard steps are: create password, connect Railway (optional, skippable), configure Claude credentials (required), then launch. The port handoff is clean: the wizard server closes, code-server spawns on the same port 8080. No new npm dependencies are required — `child_process.spawn`, SSE over raw `node:http`, and `setInterval` polling are sufficient for the entire feature.

The primary risks are: (1) a race condition on the setup endpoint that must be patched before any public deploy; (2) the temptation to use Railway OAuth app registration or `claude login` browser-redirect flows that both break in containers; and (3) a security anti-pattern in v1.0 where the encryption key is stored alongside the encrypted data it protects. All three have clear, well-documented mitigations and must be addressed in the first implementation phase before new auth code ships.

---

## Key Findings

### Recommended Stack

No new npm dependencies are needed for v1.1. The wizard extends the existing `node:http` setup server with new route handlers. CLI process management uses Node.js built-in `child_process.spawn`. SSE progress updates use plain `text/event-stream` responses. The setup wizard UI remains vanilla HTML/CSS/JS — the page is seen for two minutes and never again, making any frontend framework unjustifiable overhead.

Two optional dependencies may be needed during implementation: `node-pty` if `claude login` requires a TTY to emit its auth URL to stdout (try plain `spawn` first), and Railway CLI in the Nix flake (verify `railway` is present in the container before implementing CLIAuthService).

**Core technologies:**
- `child_process.spawn` (Node.js built-in): Railway and Claude CLI process management — zero-dependency, already used in codebase for code-server and tmux
- `railway login --browserless` (Railway CLI 4.x): Pairing-code auth relay — officially documented, fork-friendly, no OAuth app registration needed
- `ANTHROPIC_API_KEY` env var (Claude Code 2.x): Container-compatible Claude auth — officially documented Docker pattern confirmed by DataCamp and Docker official guides
- `CLAUDE_CODE_OAUTH_TOKEN` env var: Long-lived OAuth token alternative for Pro/Max subscription users — supported via `claude setup-token` command
- SSE (`text/event-stream`): Auth step progress streaming — unidirectional, no library needed, works through Railway's HTTP proxy
- `setup-state.json` (new config file): Wizard step persistence — enables resume after container restart mid-setup

### Expected Features

**Must have (table stakes):**
- Build progress display during first boot — users abandon deploys that show blank pages during the ~60s startup; extend existing `BootState` polling with per-state status messages
- Password creation on first access — already built in v1.0; wire as Step 1 of the wizard with no functional changes
- Claude Code authentication via API key input — Claude Code is unusable without auth; `ANTHROPIC_API_KEY` is the documented Docker pattern; if env var is already set, auto-detect and skip the step
- Fork-friendly deploy button — remove hardcoded repo refs; Railway auto-injects `RAILWAY_GIT_REPO_OWNER` and `RAILWAY_GIT_REPO_NAME` at runtime
- Launch flow gated on full wizard completion — "Launch ClaudeOS" button appears only after all required steps complete

**Should have (differentiators):**
- Stepper wizard UX — multi-step visual progress (password → Railway → Claude → launch) builds user confidence; matches Portainer and Gitea first-boot patterns
- Railway CLI auth via `--browserless` pairing code — enables Railway-aware features; optional and skippable step
- Auto-detection of pre-configured auth — if `ANTHROPIC_API_KEY` or `RAILWAY_TOKEN` env vars are already set via Railway dashboard, skip corresponding wizard steps automatically

**Defer to v1.2+:**
- Build log streaming via WebSocket — spinner + status text is sufficient for MVP; real log streaming is polish
- `claude login` browser-redirect wrapping — blocked by Claude Code not implementing RFC 8628 device code flow (issue #22992, open as of March 2026)
- `apiKeyHelper` setting for on-demand key retrieval from encrypted store — good security enhancement, not blocking

### Architecture Approach

The setup wizard lives entirely in the pre-Fastify temporary HTTP server (`serveSetupPage()` in `boot.ts`). This server must bind to port 8080 rather than the current supervisor port 3100, because Railway exposes only one port publicly and that port is 8080. The port handoff is clean: the wizard server closes before code-server spawns on the same port — they never run simultaneously. Three new services support the wizard: `InstanceStateService` (detects setup progress from disk), `CLIAuthService` (wraps Railway and Claude CLIs, parses stdout, exposes status), and a modified `SetupWizard` with SSE endpoints for real-time auth step progress. All credential storage is in `/data/config/` which persists across container restarts, enabling mid-setup resume without repeating completed steps.

**Major components:**
1. `SetupWizard` (expanded `boot.ts`) — multi-step HTTP server on :8080; handles password, Railway auth, Claude auth, and SSE progress endpoints
2. `CLIAuthService` (new `cli-auth.ts`) — spawns `railway login --browserless`, parses pairing code/URL from stdout; accepts and stores `ANTHROPIC_API_KEY`; monitors CLI process lifecycle
3. `InstanceStateService` (new `instance-state.ts`) — reads `auth.json` + `setup-state.json`, returns typed state (`unclaimed | password-set | railway-authed | fully-configured`); enables wizard resumability
4. `first-boot/setup.html` (modified) — multi-step wizard UI; 4 steps with SSE progress display; vanilla HTML/CSS/JS only
5. `supervisor/src/types.ts` (modified) — add `setup-password`, `setup-railway`, `setup-claude` boot states; add `SetupState` interface

**Key patterns to follow:**
- Stepped wizard with disk-persisted resume (each completed step written to `setup-state.json` before advancing)
- CLI process wrapping with output parsing (`NO_COLOR=1`, regex extraction of pairing code and URL)
- SSE for long-running status updates (`text/event-stream` over raw `node:http`, `EventSource` in browser)

### Critical Pitfalls

1. **Setup endpoint race condition** — two concurrent requests (or an attacker racing to claim an unclaimed instance) can both write `auth.json`. Fix: call `isConfigured()` as the first check in the POST handler (return 409 Conflict if already set), add an atomic lock file using `O_CREAT | O_EXCL` flags, and add a 5-minute setup timeout that halts the wizard if unused. Must be patched before any public deploy.

2. **Railway and Claude CLI login break in containers** — `railway login` and `claude login` both start localhost callback servers that are unreachable through Railway's proxy. Fix for Railway: use `railway login --browserless` pairing-code relay (supervisor captures stdout, displays code in wizard UI). Fix for Claude: use `ANTHROPIC_API_KEY` input field (officially documented Docker pattern). Do not attempt to wrap `claude login`'s browser redirect.

3. **OAuth redirect URI breaks on every fork** — if Railway OAuth app registration is ever used, the redirect URI must exactly match the deployer's Railway hostname. Every fork gets a different hostname. Railway requires exact-match URIs with no wildcards. Fix for v1.1: avoid Railway OAuth entirely by using the `--browserless` CLI flow. If OAuth is added later, use a static callback page at a permanent known URL with server-side PKCE.

4. **Encryption key stored alongside encrypted data** — v1.0 `auth.json` stores `encryptionKey` in the same file as `encryptedPassword`. v1.1 will add Claude API keys to this file, amplifying the risk. Fix: derive the encryption key from the user's password via scrypt; never store the key on disk; cache decrypted values in memory only (same behavior as Portainer and Gitea on container restart).

5. **Hardcoded Docker image ref in `railway.toml`** — forks point to the original org's image, cannot customize, and break if the original image is removed. Fix: switch to Dockerfile-based build for forks, or use Railway's template system; document the change path in README.

---

## Implications for Roadmap

The implementation follows a clear inside-out dependency chain: services before server endpoints, endpoints before wizard HTML, integration last. Railway and Claude auth are independent services that can be built in parallel once the service scaffolding exists. The only strict ordering constraints are that `InstanceStateService` and `CLIAuthService` must exist before wizard server endpoints are written, and the server API shape must be finalized before the wizard HTML is written.

### Phase 1: Security Foundation and Port Fix

**Rationale:** The setup race condition and encryption key anti-pattern are security vulnerabilities that must be fixed before any new auth code ships — adding Railway and Claude tokens to a vulnerable config file amplifies the risk. The port fix (setup server binds to 8080, not 3100) is a prerequisite for all wizard work since Railway only exposes 8080. Config schema versioning protects v1.0 users from having to redo their setup. These changes are small, independently verifiable, and unblock everything else.
**Delivers:** Race-condition-proof setup endpoint (409 guard + atomic lock), key-derivation-from-password auth (scrypt, no stored key), versioned config schema with additive-only migration, setup server rebound to port 8080, fork-friendly deploy button (trivial README/railway.toml change)
**Avoids:** Pitfalls 1, 5, 6, 7
**Research flag:** Standard patterns — atomic file ops, scrypt key derivation, and config schema versioning are all textbook implementations. No deeper research needed.

### Phase 2: InstanceStateService and Config Types

**Rationale:** All wizard logic depends on knowing setup progress from disk. This service has zero dependencies and is purely a filesystem reader — the simplest starting point for new code and easy to unit test in complete isolation.
**Delivers:** `InstanceStateService` with typed state detection, `SetupState` interface in `types.ts`, extended `BootState` union including `setup-password`, `setup-railway`, `setup-claude`
**Implements:** InstanceStateService component, types.ts additions
**Avoids:** Pitfall 7 (v1.0 backward compatibility — state detection must handle missing `setup-state.json` gracefully)
**Estimated scope:** ~50 LOC + tests

### Phase 3: CLIAuthService (Railway and Claude)

**Rationale:** The two auth service implementations are independent of each other and of the wizard server. Build them as standalone services with mockable process spawning so they can be unit tested before being wired into HTTP endpoints. Railway first (HIGH confidence from verified CLI output); Claude second (MEDIUM confidence, may need TTY investigation in container).
**Delivers:** `CLIAuthService` with `startRailwayLogin()` (spawn + stdout parse for pairing code and URL), `getRailwayStatus()` (process exit code check), Claude API key storage and validation, credential file existence check for completion detection
**Uses:** `child_process.spawn` with `NO_COLOR=1` env var for clean stdout parsing
**Avoids:** Pitfalls 2, 3 (correct auth approaches for containers), Pitfall 12 (API key exposure — per-session injection, not global env var)
**Research flag:** Railway path is HIGH confidence (CLI output format verified locally with v4.27.5). Claude path is MEDIUM confidence — verify in container whether plain `spawn` works or `node-pty` is required before finalizing the implementation. Run a container smoke test at the start of this phase.

### Phase 4: Multi-Step Wizard Server (Backend)

**Rationale:** Once services exist, wire them into the setup HTTP server. The API shape must be finalized here before any wizard HTML is written. SSE endpoints handle auth step completion monitoring. Resumability logic skips already-completed steps based on `InstanceStateService`.
**Delivers:** New routes: `POST /api/v1/setup/railway/start`, `GET /api/v1/setup/railway/status` (SSE), `POST /api/v1/setup/claude/start`, `GET /api/v1/setup/claude/status` (SSE); `setup-state.json` persistence after each step
**Implements:** SetupWizard component, SSE Pattern from ARCHITECTURE.md
**Avoids:** Pitfall 8 (polling inadequacy — SSE provides structured progress instead of opaque spinner), Pitfall 9 (health check timeout — always return 200 while process is alive regardless of setup state)
**Estimated scope:** ~200 LOC modifications to `boot.ts`

### Phase 5: Multi-Step Wizard UI (Frontend)

**Rationale:** Depends on Phase 4 API shape being finalized. Vanilla HTML/CSS/JS only — no build tooling. The wizard must show boot-phase status before the password form so users see "Building environment..." during the ~60s startup instead of a blank page. All four steps with SSE-driven progress display and auto-detection of pre-configured env vars.
**Delivers:** Refactored `first-boot/setup.html` as 4-step stepper: (1) boot progress + password, (2) Railway auth with pairing code display, (3) Claude auth with API key input and auto-detect bypass, (4) extension install progress and launch button
**Addresses:** Build progress display, Stepper wizard UX, Auto-detection of pre-configured auth
**Avoids:** Pitfall 13 (TLS warning for non-localhost HTTP deployments), Pitfall 8 (spinner-only polling replaced by structured SSE progress)
**Estimated scope:** ~300 LOC (existing setup.html is ~315 lines)

### Phase 6: Boot Integration and Container Validation

**Rationale:** Final wiring in `index.ts` is a small change (~30 LOC) but requires all previous phases to be stable. Full container testing with a fresh `/data` volume is the validation gate — Railway proxy behavior, health check timing, and Railway CLI availability must all be verified empirically.
**Delivers:** `index.ts` calling `InstanceStateService.getState()` before wizard decision, setup wizard bound to port 8080, extended BootState values flowing through health endpoint, full boot-to-launch test on Railway staging deployment
**Avoids:** Pitfall 9 (Railway health check timeout — test empirically in staging), Pitfall 14 (auth steps do not disrupt extension install ordering)
**Research flag:** Needs container-level validation: (1) Railway CLI present in Nix flake, (2) Claude CLI stdout format in headless container, (3) SSE behavior through Railway's HTTP reverse proxy, (4) health check behavior during extended multi-minute setup. Flag for `/gsd:research-phase` if container smoke tests in Phase 3 produce ambiguous results.

### Phase Ordering Rationale

- Security hardening comes first because shipping a vulnerable setup endpoint as the foundation for new auth work creates cascading risk — adding API keys to a race-condition-prone, key-co-located config file is worse than the v1.0 state
- Services before endpoints (Phases 2-3 before 4) follows the dependency chain and enables isolated unit testing before integration
- Backend API before frontend HTML (Phase 4 before 5) prevents UI rewrites from API shape changes
- Integration last (Phase 6) because `index.ts` changes are minimal but require all pieces to be stable
- Fork-friendly deploy button is a trivial README/config change grouped into Phase 1 since it has no dependencies and is a table-stakes fix

### Research Flags

Phases needing deeper research or container validation during planning:
- **Phase 3 (CLIAuthService — Claude path):** MEDIUM confidence on Claude CLI stdout format in a headless container. Before writing production code, run `claude login` in the container with `stdio: 'pipe'` and observe actual output. May need `node-pty` if TTY is required. If container smoke test is ambiguous, flag for `/gsd:research-phase`.
- **Phase 6 (Boot Integration):** Container-level validation required. SSE behavior through Railway's HTTP proxy and Railway health check behavior during 2+ minute setup must be verified empirically in a staging deployment before relying on them.

Phases with standard, well-documented patterns (skip research-phase):
- **Phase 1 (Security Foundation):** Atomic file operations, scrypt key derivation, schema versioning — all textbook implementations with extensive prior art
- **Phase 2 (InstanceStateService):** Pure filesystem reads with typed state — no external dependencies or ambiguity
- **Phase 4 (Wizard Server — Railway path):** `railway login --browserless` stdout format verified locally; SSE over raw `node:http` is a standard pattern
- **Phase 5 (Wizard UI):** Vanilla HTML multi-step form with `EventSource` — established pattern, no framework complexity

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new dependencies needed. Railway CLI v4.27.5 and Claude CLI v2.1.29 verified locally. `--browserless` flag output format tested. `ANTHROPIC_API_KEY` is the officially documented Docker pattern confirmed by multiple independent sources. |
| Features | HIGH | Table stakes and anti-features are clear. Interactive `claude login` anti-feature confirmed closed NOT_PLANNED in GitHub issue #7100 (Jan 2026). `RAILWAY_GIT_REPO_OWNER`/`RAILWAY_GIT_REPO_NAME` availability confirmed in Railway official docs. |
| Architecture | HIGH (Railway) / MEDIUM (Claude CLI capture) | Port 8080 design decision is definitive. Railway `--browserless` stdout parsing pattern is solid. Claude CLI stdout format in headless container needs empirical verification before production implementation — may require `node-pty`. |
| Pitfalls | HIGH | All critical pitfalls verified against official docs, RFCs, or documented CVEs (Portainer race condition pattern). OAuth redirect URI exact-match requirement is RFC-level fact (RFC 9700). Container localhost networking is Docker documentation. |

**Overall confidence:** HIGH for approach and architecture; MEDIUM for Claude CLI headless capture implementation details

### Gaps to Address

- **Railway CLI in Nix flake:** STACK.md notes this must be verified. Check `flake.nix` for `railwayapp.cli` before starting Phase 3. If absent, add to `contents` or install via `entrypoint.sh` using the same `curl` pattern as Claude Code.
- **Claude CLI stdout format in headless container:** ARCHITECTURE.md rates this MEDIUM confidence. Run `claude login` in the container with `stdio: 'pipe'` as the first task in Phase 3 to determine whether plain `spawn` works or `node-pty` is required. This determines a key dependency.
- **`ANTHROPIC_API_KEY` vs `CLAUDE_CODE_OAUTH_TOKEN` wizard UX decision:** Both are validated auth paths. `ANTHROPIC_API_KEY` is simpler and most reliable (recommended for MVP). `CLAUDE_CODE_OAUTH_TOKEN` via `claude setup-token` supports Pro/Max subscriptions. Roadmapper should decide whether to support one or both in the wizard UI — affects wizard Step 3 design.
- **`railway.toml` Dockerfile vs `dockerImage` for forks:** Nix builds are slow (10-20 min) and may time out on Railway. The hybrid approach (prebuilt image for official deploys, Dockerfile for forks) needs a concrete decision before Phase 1 ships.

---

## Sources

### Primary (HIGH confidence)
- [Railway CLI Login Docs](https://docs.railway.com/cli/login) — `--browserless` pairing code flow, `RAILWAY_TOKEN` bypass option
- [Railway Variables Reference](https://docs.railway.com/reference/variables) — `RAILWAY_GIT_REPO_OWNER`, `RAILWAY_GIT_REPO_NAME` auto-injection for GitHub-connected deploys
- [Railway OAuth Troubleshooting](https://docs.railway.com/integrations/oauth/troubleshooting) — exact-match redirect URI requirement, no wildcards
- [Railway Template Creation](https://docs.railway.com/templates/create) — deploy button implementation and fork-friendly template approach
- [Claude Code Authentication Docs](https://code.claude.com/docs/en/authentication) — `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `apiKeyHelper` setting
- [RFC 9700 — OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/rfc9700/) — PKCE requirement, redirect URI security
- Local CLI testing: `railway` v4.27.5 (`--browserless` output verified), `claude` v2.1.29 (`setup-token` command verified)
- Existing ClaudeOS codebase analysis: `boot.ts`, `index.ts`, `setup.html`, `types.ts`, `entrypoint.sh`, `flake.nix`

### Secondary (MEDIUM confidence)
- [Automating Claude Code on Headless VPS (community gist)](https://gist.github.com/coenjacobs/d37adc34149d8c30034cd1f20a89cce9) — `setup-token` flow, `~/.claude.json` bypass, `CLAUDE_CODE_OAUTH_TOKEN` env var
- [Claude Code Headless Auth Issue #7100](https://github.com/anthropics/claude-code/issues/7100) — headless auth limitations, SSH forwarding workaround (closed NOT_PLANNED Jan 2026)
- [Claude Code Docker Tutorial (DataCamp)](https://www.datacamp.com/tutorial/claude-code-docker) — `-e ANTHROPIC_API_KEY` as recommended Docker auth pattern
- [Docker official Claude Code sandbox docs](https://docs.docker.com/ai/sandboxes/agents/claude-code/) — confirms API key env var pattern
- [Portainer Initial Setup Docs](https://docs.portainer.io/start/install-ce/server/setup) — 5-minute setup timeout as race condition mitigation; admin creation wizard pattern
- [Portainer Security Research (CyberArk)](https://www.cyberark.com/resources/threat-research-blog/discovering-hidden-vulnerabilities-in-portainer-with-codeql) — setup wizard attack surface analysis; documented race condition exploitation

### Tertiary (LOW confidence)
- [Claude Code Device Code Flow Issue #22992](https://github.com/anthropics/claude-code/issues/22992) — RFC 8628 device code flow feature request (open as of March 2026, not yet implemented); revisit in v1.2 planning if shipped

---
*Research completed: 2026-03-15*
*Ready for roadmap: yes*
