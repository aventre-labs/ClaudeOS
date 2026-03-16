# Phase 11: Auth Services and Wizard Backend - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Server-side auth services for Railway CLI and Anthropic (API key + claude login), wizard state persistence across container restarts, and REST+SSE endpoints for the wizard frontend (Phase 12). This phase builds the backend — no UI/HTML.

</domain>

<decisions>
## Implementation Decisions

### Railway Login Flow
- Use `railway login --browserless` spawned as a child process, awaited as a promise
- Show pairing code prominently with step-by-step instructions and a copy button
- SSE event pushed to frontend when the subprocess exits (success or failure)
- On failure: show error message + retry button. No automatic retry.
- Checkbox (checked by default): "Save Railway login for Claude to access" — if checked, persist Railway token in SecretStore for Claude development use. If unchecked, Railway auth is ephemeral (only used to verify project ownership and issue auth token cookie).

### Anthropic Auth Flow
- Two auth methods always visible side by side: API key input AND "Sign in with Anthropic" (claude login)
- API key validation via direct HTTP call to api.anthropic.com (no claude CLI dependency)
- Validated API key stored in SecretStore (encrypted)
- `claude login` follows same pattern as Railway: spawn subprocess, capture output URL (no pairing code), show clickable link, SSE on completion
- Both methods always available — not primary/secondary, they're equal options

### Wizard State Persistence
- Wizard state stored as JSON file: `/data/config/wizard-state.json`
- Tracks step completion flags AND credential references (what's stored where)
- Trust state file only for resume — no credential detection fallback
- Terminal "completed" state: once all steps done and user launches, wizard never shows again
- Boot skips wizard entirely when state is "completed"

### Server Endpoint Design
- All wizard endpoints in a single `routes/wizard.ts` file
- Single SSE stream: `GET /api/v1/wizard/events` — emits events for all flows (railway:started, railway:complete, anthropic:complete, etc.)
- Wizard endpoints are rate-limited but unauthenticated (user hasn't authenticated yet)
- Wizard endpoints only active when wizard state is incomplete — return 404/410 after completion
- Key endpoints: GET status, POST railway/start, POST anthropic/key, POST anthropic/login, GET events (SSE), POST complete

### Claude's Discretion
- Exact rate limiting strategy (requests per minute, implementation)
- SSE event payload shapes
- Railway token extraction method after login
- Error message formatting
- wizard-state.json schema details

</decisions>

<specifics>
## Specific Ideas

- Railway auth checkbox UX: "Save Railway login for Claude to access" — checked by default, lets Claude Code use `railway` CLI for development tasks
- Auth settings should eventually be accessible in VS Code native settings (extensions register their settings) — but that's runtime, not first-boot
- `claude login` outputs a URL only (no pairing code like Railway) — simpler display

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SecretStore` (`supervisor/src/services/secret-store.ts`): Encrypted storage with scrypt-derived key from CLAUDEOS_AUTH_TOKEN. Already has set/get/list/delete. Will store Railway token and Anthropic API key.
- `BootService` (`supervisor/src/services/boot.ts`): Has `isConfigured()` check and `serveSetupPage()` pattern. Wizard state check replaces isConfigured for boot flow.
- Existing route pattern (e.g., `routes/secrets.ts`): Fastify + Zod type provider pattern for all routes. Wizard routes follow the same structure.

### Established Patterns
- Fastify 5 + Zod 3.25 type provider for request/response validation
- `tryCreate()` factory pattern for lazy service initialization
- Boot state machine: `initializing -> setup -> installing -> ready -> ok`
- Atomic file writes: write to tmp file, rename (from SecretStore)

### Integration Points
- `supervisor/src/index.ts:27-29`: Boot flow checks `isConfigured()` — will need to also check wizard completion state
- `supervisor/src/server.ts`: Route registration — add wizard routes
- `supervisor/src/services/boot.ts:66-161`: Setup page serving — wizard replaces this
- SecretStore: Stores Railway token and Anthropic API key
- `node:child_process.spawn()`: For `railway login --browserless` and `claude login` subprocesses

</code_context>

<deferred>
## Deferred Ideas

- Auth settings in VS Code native settings (extension settings panel) — runtime feature, not first-boot wizard
- Railway sign-out and re-auth from within running ClaudeOS — future capability
- Multiple simultaneous Anthropic accounts — UI shows "+ Add method" but actual multi-account is future (MULTI-01, MULTI-02)

</deferred>

---

*Phase: 11-auth-services-and-wizard-backend*
*Context gathered: 2026-03-15*
