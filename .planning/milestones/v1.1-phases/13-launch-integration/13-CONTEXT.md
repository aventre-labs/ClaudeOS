# Phase 13: Launch Integration - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the wizard completion to code-server startup with a polished launch transition, credential handoff to Claude Code's native config, and container validation. Users click "Launch ClaudeOS" and seamlessly land in a fully functional IDE with all credentials configured. This phase connects the wizard frontend (Phase 12) and auth backend (Phase 11) to the final code-server experience.

</domain>

<decisions>
## Implementation Decisions

### Transition Experience
- Full-page transition animation replaces the wizard card after clicking Launch
- ClaudeOS logo centered on dark background with animated progress dots/bar
- Status text cycles through phases: "Starting code-server...", "Configuring workspace...", "Almost ready..."
- Backend emits a `launch:ready` SSE event when code-server is up and healthy
- Frontend listens for `launch:ready` then does `window.location.replace('/')` — no back-button to wizard
- Auto-login: user bypasses code-server's password page entirely — auth cookie set before redirect or code-server configured to skip login for wizard-authenticated sessions

### Boot Wiring
- New `POST /api/v1/wizard/launch` endpoint triggers code-server startup (separate from `/wizard/complete`)
- `/wizard/complete` marks wizard state as completed; `/wizard/launch` actually starts code-server
- Wizard setup server stays running briefly alongside code-server to deliver the `launch:ready` SSE signal, then shuts down
- Extensions install DURING the wizard (while user does auth) — build progress already shown in Phase 12 footer
- By launch time, extensions are likely already installed — Launch just starts code-server
- On subsequent container restarts: if wizard-state.json says "completed", skip wizard entirely, go straight to extension install + code-server

### Credential Handoff
- Credentials stay in SecretStore (encrypted) during the wizard phase
- At launch time (not during auth steps), read from SecretStore and write to final destinations:
  - Anthropic: Write to Claude Code's native config format — supports API keys, OAuth tokens, subscriptions, billing accounts. Leaves room for multi-account (subscription + fallback API key, etc.)
  - Railway: Persist to Railway CLI config ONLY if user opted into "Save Railway login for Claude" checkbox (Phase 11). If unchecked, Railway login is entirely ephemeral — not stored anywhere
- Even if Railway login is stored, the wizard login page with Railway + token options should still be served if the user doesn't have an auth token cookie (auth cookie is the gate, not Railway login state)
- On container restart (completed state): re-read SecretStore and re-write to native configs before starting code-server

### Validation & Error Handling
- If code-server fails to start: show error screen on the launch animation page with "Failed to start ClaudeOS" message, error details, [Retry] and [View Logs] buttons
- Wizard state remains "completed" on failure — user can retry without re-doing auth
- If user refreshes during launch transition: show the launch animation screen again (wizard state is "completed", server knows launch is in progress), redirect when code-server is ready
- No timeout on launch transition — code-server should eventually start, BootService already has auto-restart on crash

### Claude's Discretion
- Exact launch animation CSS/keyframes and timing
- SSE event payload shape for `launch:ready`
- How to set the code-server auth cookie (PASSWORD cookie format or --auth=none approach)
- Claude Code native config file format discovery and writing
- Health check mechanism for detecting code-server readiness
- How wizard setup server gracefully shuts down after delivering launch:ready
- Retry mechanism implementation details for code-server start failures

</decisions>

<specifics>
## Specific Ideas

- Launch animation should feel like a branded moment — the last thing the user sees before their IDE appears
- Status text should cycle through real phases, not fake ones — reflect actual boot steps
- "View Logs" on error screen should show actual supervisor logs to help debugging
- Railway auth cookie is the access gate for the instance — Railway login state alone doesn't grant access
- Credential model should support future multi-account: subscription + fallback API key, multiple Anthropic accounts, etc.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `LaunchStep` component (`supervisor/wizard/src/components/LaunchStep.tsx`): Has checklist + "Launch ClaudeOS" button. `handleLaunch` calls `completeWizard()` but currently does nothing after.
- `BootService.startCodeServer()` (`supervisor/src/services/boot.ts:353-411`): Full code-server launch with CLAUDEOS_AUTH_TOKEN as PASSWORD, auto-restart on crash.
- `WizardStateService.complete()`: Marks wizard as completed, persisted to disk.
- `useSSE` hook (`supervisor/wizard/src/hooks/useSSE.ts`): Already handles event listening, closes on `wizard:completed`. Will need to also handle `launch:ready`.
- SSE broadcast infrastructure in wizard routes — `broadcastEvent()` function already exists.

### Established Patterns
- Boot state machine: `initializing -> setup -> installing -> ready -> ok`
- Setup server on port 8080, same port code-server uses — handoff pattern exists in `serveSetupPage()`
- Atomic file writes (tmp+rename) for persistent state
- In-memory mutex (`setupInProgress`) for concurrent operation guards

### Integration Points
- `supervisor/src/index.ts:27-29`: `isConfigured()` check — needs to also check wizard completion state for fast-path boot
- `supervisor/src/index.ts:68-69`: `installExtensions()` + `startCodeServer()` — launch endpoint triggers this flow
- `supervisor/src/routes/wizard.ts:365-399`: `POST /wizard/complete` — new `/wizard/launch` endpoint needed alongside
- `supervisor/wizard/src/App.tsx:141-148`: `handleLaunch` — needs to call launch endpoint and show transition animation
- `SecretStore`: Source of truth for credentials at launch time

</code_context>

<deferred>
## Deferred Ideas

- Multiple simultaneous Anthropic accounts (MULTI-01, MULTI-02) — UI groundwork exists ("+ Add method") but actual multi-account is future
- Railway sign-out and re-auth from within running ClaudeOS — future capability
- Auth settings accessible in VS Code native settings panel — runtime feature, not first-boot
- Local (non-Railway) deploy auth support — v1.2

</deferred>

---

*Phase: 13-launch-integration*
*Context gathered: 2026-03-15*
