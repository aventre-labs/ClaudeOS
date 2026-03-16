# Phase 12: Wizard UI and Build Progress - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Multi-step stepper wizard with real-time build progress display, consuming the Phase 11 backend API (REST+SSE). Users see a polished setup experience during first boot instead of a blank page. This phase builds the frontend — backend endpoints already exist.

</domain>

<decisions>
## Implementation Decisions

### Stepper Layout and Visual Style
- Horizontal top stepper bar showing steps: Railway → Claude → Launch
- Centered card layout (~600px wide) with background fill
- ClaudeOS logo + "ClaudeOS Setup" heading above the stepper
- Theme sourced from the default ClaudeOS VS Code theme — CSS variables extracted from theme JSON at build time so wizard matches the code-server experience
- Active step highlighted, completed steps show checkmark

### Build Progress Display
- Persistent footer bar at the bottom of the wizard card — visible while auth steps proceed
- Auth steps are available immediately; build progress does NOT block auth flow
- Footer shows progress bar + currently installing extension name + count (e.g., "Installing claudeos-terminal... (3/5)")
- On completion: footer transitions to green checkmark "✓ Extensions installed", stays briefly, then fades/shrinks
- On failure: error message in footer with retry button; auth steps remain accessible
- Build progress updates via SSE from the existing boot state machine

### Auth Step Interaction States
- **Not started:** "Sign in with Railway" button prominently displayed with brief explanation ("Verifies you own this Railway project"). Small "Use auth token instead" link below.
- **In progress (Railway):** Large pairing code displayed like a 2FA code with copy button. Instructions: "Enter this code at railway.com/cli-login" with clickable link. "Waiting for confirmation..." below.
- **In progress (Anthropic):** API key input and "Sign in with Anthropic" (claude login) shown side by side as equal options (decided in Phase 11).
- **Completed (AUTH-04):** Green checkmark with status text (e.g., "✓ Railway: signed in") and subtle "Sign Out" link. Step is collapsed but expandable.
- **Alternative methods (AUTH-05):** Always visible below primary method — not hidden behind an expand. Railway: "Use auth token instead" link. Anthropic: both methods always visible as equal options.
- **Error state:** Error message with retry button. No automatic retry (decided in Phase 11).

### Technology Stack
- TypeScript React app in `supervisor/wizard/` directory
- Vite for build tooling, CSS modules for scoped styling
- CSS variables reference ClaudeOS VS Code theme values — build script extracts theme JSON into CSS custom properties
- Built during Docker build, output served by BootService as static files
- Consumes Phase 11 wizard API: `GET /api/v1/wizard/status`, `POST .../railway/start`, `POST .../anthropic/key`, `POST .../anthropic/login`, `GET .../events` (SSE), `POST .../complete`

### Claude's Discretion
- Exact component decomposition (Stepper, StepCard, ProgressBar, etc.)
- Animation/transition details for step changes and footer completion
- Exact spacing, typography, and responsive breakpoints
- SSE reconnection strategy for the events stream
- How the "Save Railway login for Claude" checkbox is styled
- Loading skeleton or spinner design while fetching initial wizard state

</decisions>

<specifics>
## Specific Ideas

- Auth flow should feel like "Sign in with Google" — familiar OAuth-style UX (from Phase 10 context)
- Pairing code displayed like a 2FA code — large, prominent, with copy button
- "Use auth token instead" should be small/subtle — Railway login is the primary path (from Phase 10 context)
- Footer progress bar is non-blocking — user can auth while extensions install in parallel

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WizardStateService` (`supervisor/src/services/wizard-state.ts`): Full CRUD lifecycle, atomic persistence — wizard UI reads state via `GET /api/v1/wizard/status`
- `RailwayAuthService` / `AnthropicAuthService`: Backend auth flows exposed via wizard routes — UI calls POST endpoints and listens to SSE events
- `WizardSSEEvents` type map (`supervisor/src/types.ts`): Defines all SSE event shapes the frontend must handle (connected, railway:started, railway:complete, anthropic:complete, etc.)
- `Zod schemas` (`supervisor/src/schemas/wizard.ts`): Response shapes the frontend can type-check against
- Existing `setup.html` in `first-boot/` directory: Currently served by BootService — will be replaced by the React wizard build output

### Established Patterns
- `BootService.serveSetupPage()` serves static HTML on port 8080 during setup state — will serve React build output instead
- Boot state machine: `initializing -> setup -> installing -> ready -> ok` — wizard needs to reflect these states
- `ExtensionInstaller` tracks install progress — need SSE or polling endpoint for build progress (may need new endpoint or extend boot status)

### Integration Points
- `supervisor/src/services/boot.ts:66`: `serveSetupPage()` — needs to serve wizard React build output instead of `setup.html`
- `supervisor/src/server.ts`: Wizard routes already registered — frontend consumes these
- `supervisor/src/routes/wizard.ts`: All 6 wizard endpoints (status, railway/start, anthropic/key, anthropic/login, events SSE, complete)
- Docker build: needs `npm run build` step for the wizard React app, output copied to a serveable location

</code_context>

<deferred>
## Deferred Ideas

- Auth settings accessible in VS Code native settings panel (extension settings) — runtime feature, not first-boot wizard (from Phase 11)
- Railway sign-out and re-auth from within running ClaudeOS — future capability
- Multiple simultaneous Anthropic accounts — UI shows "+ Add method" but actual multi-account is future (MULTI-01, MULTI-02)

</deferred>

---

*Phase: 12-wizard-ui-and-build-progress*
*Context gathered: 2026-03-16*
