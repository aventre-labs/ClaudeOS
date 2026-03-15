# Phase 1: Supervisor + Container Foundation - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Bootable, deployable container where the supervisor boots code-server with ClaudeOS branding, manages Claude Code sessions via tmux, exposes session/extension/secrets APIs, handles first-boot setup (password creation), and provides the extension template as a separate repo. Nix-built container image deployed to Railway.

</domain>

<decisions>
## Implementation Decisions

### Archive & revive behavior
- Archive saves scrollback text + metadata JSON (session name, creation time, working directory, model, flags)
- Revive starts a new Claude Code session and feeds full scrollback as a context file using --continue flag (no truncation limit)
- No retention limit — archived sessions kept forever until manually deleted
- Force-kill (kill endpoint) always captures scrollback before destroying tmux window
- Revive is restore-only — no optional prompt parameter. User sends new input separately after session is running

### Session status detection
- Claude's discretion on the specific detection method (tmux activity, scrollback pattern matching, or hybrid)
- Must be event-driven, NOT polling-based — use tmux hooks or reactive change detection
- WebSocket endpoint for real-time push to extensions, covering both status changes AND session output streaming
- Extensions subscribe to specific sessions for output; status changes broadcast to all subscribers

### First-boot & authentication
- No CLAUDEOS_AUTH_TOKEN env var — user creates password via a first-boot setup page
- Supervisor serves a minimal HTML form (ClaudeOS-branded) on first boot: password field, confirm, submit
- Password stored via supervisor's secret store (supervisor owns all secret storage)
- Random master encryption key generated on first boot, stored on persistent volume — password is for auth, not encryption key derivation
- After password set and extensions install, show "Launch ClaudeOS" button (not auto-redirect)
- On subsequent boots, supervisor passes stored password to code-server's --auth flag; code-server handles its own login page
- Extensions install BEFORE code-server starts (blocking) — user sees supervisor logs in terminal during install
- Installation errors halt the process (fail-fast) — next boot retries failed extensions only
- Per-extension install tracking (not all-or-nothing marker)
- Supervisor health endpoint starts immediately at boot (before extensions install) — returns status: "installing" during setup, "ok" when ready

### Supervisor API scope
- Full API ships in Phase 1: sessions CRUD, archive/revive, extension install, secrets CRUD, WebSocket, health
- API is versioned from the start: /api/v1/sessions, /api/v1/secrets, etc.
- Secrets API expanded beyond SPEC with optional category and tags metadata on secrets
- WebSocket on localhost:3100, no authentication required (container-internal only)
- Supervisor has its own settings system with a settings UI that ships with all ClaudeOS distros

### Extension install pipeline
- Extensions are pre-built to VSIX via GitHub Actions — VSIX available as GitHub release assets
- default-extensions.json format: { "repo": "aventre-labs/claudeos-sessions", "tag": "v0.1.0" } — supervisor uses GitHub API to find VSIX asset
- Three install methods: (1) GitHub release (repo + tag), (2) build from source (local path), (3) local VSIX file path
- After install, reload behavior is a supervisor setting: defaults to force reload, user can change to reload notification
- default-extensions.json ships with empty array [] in Phase 1 (no extensions to install yet, but pipeline can be tested)

### Container & deployment
- Nix only — no Dockerfile. Use dockerTools.buildImage to produce OCI-compatible image
- Deploy to Railway from Nix-built container image
- Multi-stage equivalent in Nix: build supervisor TypeScript in one derivation, compose into container image with runtime deps
- Non-root execution: app user created, entrypoint chowns /data then drops privileges
- Volume layout per SPEC: /data/extensions/, /data/sessions/, /data/secrets/, /data/config/

### Repo structure
- Kernel repo: aventre-labs/ClaudeOS (already exists)
- Extension template: separate repo under aventre-labs (e.g., aventre-labs/claudeos-extension-template)
- Extension repos created per-phase as needed (not scaffolded in advance)
- default-extensions.json always points to GitHub repos (no local path dev mode)
- Development requires a GitHub PAT with access to the aventre-labs org

### Development workflow
- Local development always inside Nix shell (nix develop)
- Manual rebuild (no watch mode / hot reload)
- Supervisor supports --dry-run flag: starts API server without launching code-server or tmux sessions
- Test framework: Vitest (consistent with extension template)

### Claude's Discretion
- Session status detection method (tmux activity, pattern matching, or hybrid)
- Exact tmux hook/event mechanism for reactive status updates
- WebSocket message format and subscription protocol
- Secrets API endpoint design (REST routes, request/response shapes)
- Supervisor settings storage format and UI implementation
- Nix flake structure and derivation organization
- Exact HTML/CSS for first-boot setup page (within "minimal, ClaudeOS-branded" constraint)

</decisions>

<specifics>
## Specific Ideas

- First-boot flow: user sets password in setup page -> extensions install (user sees logs) -> "Launch ClaudeOS" button -> code-server starts with that password -> user completes setup (Anthropic API key etc.) in the VS Code UI
- Supervisor is the single source of truth for secrets — the Phase 3 secrets extension is a UI wrapper around supervisor API endpoints
- "It shouldn't use polling if possible" — strong preference for event-driven architecture over periodic polling
- Extensions are built in CI (GitHub Actions), not in the container — keeps the container slim and install fast
- GitHub org is aventre-labs, not claude-nix-os as the SPEC originally stated

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no source code exists yet

### Established Patterns
- None yet — Phase 1 establishes the patterns

### Integration Points
- Supervisor API on localhost:3100 will be the integration point for all future extensions
- WebSocket on same port for real-time status and output streaming
- /data volume layout establishes the persistence contract for all phases

</code_context>

<deferred>
## Deferred Ideas

- Splash page served by supervisor during extension install (decided against for v1 — terminal logs instead)
- Watch mode / hot reload for development (decided against — manual rebuild)
- Nix + Dockerfile dual support (decided Nix only)

</deferred>

---

*Phase: 01-supervisor-container-foundation*
*Context gathered: 2026-03-12*
