---
phase: 12-wizard-ui-and-build-progress
verified: 2026-03-15T20:10:00Z
status: human_needed
score: 14/15 must-haves verified
re_verification: false
human_verification:
  - test: "Verify Railway 'Use auth token instead' link navigates to a distinct token input form"
    expected: "Clicking 'Use auth token instead' shows a token input field, not just re-triggering Railway CLI pairing"
    why_human: "The link is rendered and visible (AUTH-05 satisfied at UI level), but it calls onStart (Railway CLI login handler). Whether this is intentional placeholder behavior or a functional gap for the token sub-flow requires a product decision and manual inspection of the Railway auth flow."
  - test: "Verify wizard loads and renders correctly in browser at http://localhost:5173 (or port 8080 via BootService)"
    expected: "ClaudeOS logo, horizontal stepper with Railway/Claude/Launch steps, Railway step active with sign-in button, dark theme, build progress footer appears during extension install"
    why_human: "Visual layout, theme fidelity, and real-time SSE behavior cannot be verified programmatically."
  - test: "Verify Nix container build includes wizard output (requires Linux builder)"
    expected: "nix build .#container on Linux includes /app/wizard-dist/index.html and assets"
    why_human: "flake.nix wizardDist derivation uses lib.fakeHash placeholder — correct hash requires running nix build on a Linux builder. Container build cannot be validated on macOS."
---

# Phase 12: Wizard UI and Build Progress — Verification Report

**Phase Goal:** Users see a polished multi-step wizard with real-time build progress instead of a blank page during first boot
**Verified:** 2026-03-15T20:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Wizard React project scaffolded in supervisor/wizard/ with Vite+React+TypeScript | VERIFIED | supervisor/wizard/package.json has react@19, vite@6; vite.config.ts, tsconfig.json exist; npx vite build output at wizard-dist/ |
| 2 | Frontend types mirror backend WizardState, WizardSSEEvents, and WizardStatus shapes | VERIFIED | supervisor/wizard/src/types.ts exports WizardUIState, WizardStatus, WizardAction, wizardReducer; mirrors backend shapes including build:progress/complete/error |
| 3 | API client functions exist for all 5 wizard endpoints with proper typing | VERIFIED | supervisor/wizard/src/api/wizard.ts exports getWizardStatus, startRailwayLogin, submitAnthropicKey, startClaudeLogin, completeWizard — all fetch /api/v1/wizard/* with error handling |
| 4 | SSE hook handles EventSource connection, typed event dispatch, and reconnection with backoff | VERIFIED | useSSE.ts: exponential backoff (retryDelay * 2^(retries-1)), handlersRef pattern, wizard:completed closes without reconnect, cleanup on unmount |
| 5 | Build progress SSE events (build:progress, build:complete, build:error) broadcast from wizard routes | VERIFIED | supervisor/src/types.ts WizardSSEEvents includes all three types; wizard.ts has build progress polling with 2s interval and clearInterval on terminal states |
| 6 | Vitest configured with jsdom for component testing | VERIFIED | supervisor/wizard/vitest.config.ts: environment: 'jsdom', globals: true, include: 'src/**/*.test.{ts,tsx}' |
| 7 | User sees a horizontal stepper showing Railway, Claude, Launch steps with active/completed states | VERIFIED | Stepper.tsx renders circle indicators, checkmarks for completed, active class, connector lines; App.tsx derives steps array from state |
| 8 | User sees build progress footer with extension name and count while extensions install | VERIFIED | BuildProgress.tsx: installing state shows "Installing {currentExtension}... ({progress}/{total})" with progress bar; 16 tests pass including progress bar test |
| 9 | Completed auth steps show green checkmark with Sign Out link | VERIFIED | RailwayStep complete state: checkmark + "Railway: signed in" + Sign Out. AnthropicStep complete state: checkmark + "Anthropic: authenticated" + Sign Out |
| 10 | Alternative auth methods are always visible, not hidden | VERIFIED | RailwayStep idle: "Use auth token instead" button always rendered. AnthropicStep idle: API key input and "Sign in with Anthropic" rendered side-by-side in .methods flex container |
| 11 | Railway step shows pairing code with copy button | VERIFIED | RailwayStep pairing state: large pairingCode div with data-testid, Copy button, clickable link to railway.com/cli-login, waiting spinner |
| 12 | Anthropic step shows API key input and claude login as equal side-by-side options | VERIFIED | AnthropicStep idle: two .method divs in .methods flex layout — left has password input + Validate Key, right has Sign in with Anthropic button |
| 13 | BootService serves React wizard build output instead of blank/static page | VERIFIED | boot.ts: getWizardDistDir() multi-location resolver, serves wizard-dist/index.html for /, proxies /api/v1/* to port 3100 via proxyToFastify(), SSE streaming mode for /wizard/events |
| 14 | Nix container build includes wizard build derivation | VERIFIED (with caveat) | flake.nix: wizardDist = pkgs.buildNpmPackage { src = ./supervisor/wizard; buildPhase = 'npx vite build'; }; container copies to /app/wizard-dist/. npmDepsHash = lib.fakeHash (intentional — requires Linux builder for real hash) |
| 15 | "Use auth token instead" link in RailwayStep navigates to a functional token submission flow | UNCERTAIN | Link is rendered and visible (AUTH-05 UI requirement met). However, onClick calls onStart (Railway CLI handler), not a token input sub-flow. May be intentional or a wiring gap — needs human decision. |

**Score:** 14/15 truths verified (1 uncertain, requires human)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supervisor/wizard/package.json` | Vite+React+TS project config | VERIFIED | Contains react@19, react-dom@19, vite@6, vitest@3, @testing-library/react |
| `supervisor/wizard/vitest.config.ts` | Vitest config with jsdom environment | VERIFIED | environment: 'jsdom', globals: true |
| `supervisor/wizard/src/types.ts` | Frontend type definitions mirroring backend | VERIFIED | Exports WizardUIState, WizardAction, wizardReducer, WizardStatus — all correct |
| `supervisor/wizard/src/api/wizard.ts` | Typed REST API client for all wizard endpoints | VERIFIED | 5 exports: getWizardStatus, startRailwayLogin, submitAnthropicKey, startClaudeLogin, completeWizard |
| `supervisor/wizard/src/hooks/useSSE.ts` | EventSource hook with reconnection and typed handlers | VERIFIED | exports useSSE; handlersRef pattern; exponential backoff; wizard:completed close-without-reconnect |
| `supervisor/wizard/src/theme.css` | CSS custom properties for ClaudeOS dark theme | VERIFIED | 17 CSS custom properties including --color-bg, --color-accent, --color-success, --color-error |
| `supervisor/wizard/src/App.tsx` | Top-level state machine wiring SSE events to UI state | VERIFIED | 244 lines (min 60); useReducer + useSSE + useWizardStatus; all 9 SSE handlers; API call wiring |
| `supervisor/wizard/src/components/Stepper.tsx` | Horizontal step indicator bar | VERIFIED | Exports Stepper; renders circles, checkmarks, connectors, active/completed CSS classes |
| `supervisor/wizard/src/components/RailwayStep.tsx` | Railway auth step with all states | VERIFIED | Exports RailwayStep; handles idle/pairing/complete/error; pairing code, copy button, sign out |
| `supervisor/wizard/src/components/AnthropicStep.tsx` | Anthropic auth step with dual methods | VERIFIED | Exports AnthropicStep; side-by-side API key + interactive login; complete/error states |
| `supervisor/wizard/src/components/LaunchStep.tsx` | Final launch step | VERIFIED | Exports LaunchStep; prerequisite checklist; Launch button disabled until all complete |
| `supervisor/wizard/src/components/BuildProgress.tsx` | Footer bar with progress bar, completion/error states | VERIFIED | Exports BuildProgress; idle returns null; installing shows progress + count; complete fades after 2s; error shows retry |
| `supervisor/wizard/src/components/BuildProgress.test.tsx` | Real component tests (not stubs) | VERIFIED | 4 passing tests: idle/installing/complete/error states |
| `supervisor/wizard/src/components/Stepper.test.tsx` | Real component tests | VERIFIED | 4 passing tests: labels/active/checkmark/click |
| `supervisor/wizard/src/components/RailwayStep.test.tsx` | Real component tests | VERIFIED | 4 passing tests: idle/pairing/complete/error states |
| `supervisor/wizard/src/components/AnthropicStep.test.tsx` | Real component tests | VERIFIED | 4 passing tests: side-by-side/complete/error/disabled |
| `supervisor/src/types.ts` | Build progress SSE event types added | VERIFIED | WizardSSEEvents: "build:progress", "build:complete", "build:error" at lines 192-194 |
| `supervisor/src/services/boot.ts` | Static file serving from wizard-dist/ | VERIFIED | MIME_TYPES map, getWizardDistDir(), proxyToFastify() with SSE streaming, wizard-dist/index.html serving |
| `flake.nix` | Wizard build step in container derivation | VERIFIED (caveat) | wizardDist = pkgs.buildNpmPackage; cp -r ${wizardDist}/* ./app/wizard-dist/; lib.fakeHash placeholder is intentional |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| supervisor/wizard/src/types.ts | supervisor/src/types.ts | Manual mirror of WizardState and WizardSSEEvents shapes | VERIFIED | WizardSSEEvents pattern present in both files; build:progress/complete/error in both |
| supervisor/wizard/src/api/wizard.ts | supervisor/src/routes/wizard.ts | fetch calls to /api/v1/wizard/* endpoints | VERIFIED | BASE = '/api/v1/wizard'; all 5 endpoints map to documented routes |
| supervisor/wizard/src/App.tsx | supervisor/wizard/src/hooks/useSSE.ts | useSSE hook consuming /api/v1/wizard/events | VERIFIED | useSSE({ url: '/api/v1/wizard/events', handlers: stableHandlers }) at line 93 |
| supervisor/wizard/src/App.tsx | supervisor/wizard/src/types.ts | useReducer with wizardReducer | VERIFIED | useReducer(wizardReducer, initialWizardUIState) at line 23 |
| supervisor/wizard/src/components/RailwayStep.tsx | supervisor/wizard/src/api/wizard.ts | startRailwayLogin API call | VERIFIED | App.tsx handleRailwayStart calls startRailwayLogin(); passed to RailwayStep.onStart |
| supervisor/wizard/src/components/AnthropicStep.tsx | supervisor/wizard/src/api/wizard.ts | submitAnthropicKey and startClaudeLogin API calls | VERIFIED | App.tsx handleAnthropicKey calls submitAnthropicKey(); handleAnthropicLogin calls startClaudeLogin() |
| supervisor/src/services/boot.ts | supervisor/wizard-dist/ | readFileSync serving static files from build output directory | VERIFIED | wizard-dist/ exists; getWizardDistDir() finds and serves it; index.html + assets/ verified |
| flake.nix | supervisor/wizard/ | npm build step in container derivation | VERIFIED | src = ./supervisor/wizard; buildPhase = 'npx vite build --outDir $out' |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| SETUP-01 | 12-01, 12-02, 12-03 | User sees build progress with status updates during first boot while extensions install | SATISFIED | BuildProgress.tsx shows extension name + count during install; build:progress SSE events broadcast from wizard.ts polling; BootService serves wizard UI on port 8080 |
| SETUP-02 | 12-02, 12-03 | User guided through multi-step stepper wizard (Railway auth → Claude auth → Launch) | SATISFIED | Stepper.tsx renders 3 steps; App.tsx manages activeStep via wizardReducer; BootService serves React wizard instead of blank page |
| AUTH-04 | 12-02 | Each wizard step shows current auth status when pre-configured with Sign Out button | SATISFIED | RailwayStep complete state shows "Railway: signed in" + Sign Out; AnthropicStep complete state shows "Anthropic: authenticated" + Sign Out; INIT action sets steps to complete from server state |
| AUTH-05 | 12-02 | Each auth step shows option to add another auth method, not hidden | PARTIALLY SATISFIED | AnthropicStep: API key and interactive login fully side-by-side as equal methods. RailwayStep: "Use auth token instead" button always rendered in idle state, but onClick calls same onStart handler as primary button — alternative token submission flow not wired to distinct handler. UI satisfies visibility requirement; functional wiring of token path requires human review. |

All 4 requirement IDs from PLAN frontmatter are accounted for. No orphaned requirements detected.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| flake.nix | 100 | `npmDepsHash = pkgs.lib.fakeHash` | Info | Intentional — requires Linux builder to compute real hash; documented in 12-03-SUMMARY.md key-decisions; container cannot build until resolved but local Vite build works |
| flake.nix | 98 | `# TODO: Compute correct hash...` | Info | Companion comment to above — informational only, tracks intended follow-up |
| supervisor/wizard/src/components/AnthropicStep.tsx | 103 | `placeholder="sk-ant-..."` | Info | HTML input placeholder attribute — not an implementation placeholder; correct usage |

No blocker anti-patterns found. The `fakeHash` is the only substantive item and it is expected per the plan and documented in SUMMARY.

### Human Verification Required

#### 1. "Use auth token instead" Link Functional Wiring

**Test:** In the running wizard, click "Use auth token instead" in the Railway step
**Expected:** Should show a form to enter a Railway API token directly (not trigger Railway CLI pairing)
**Why human:** The link is rendered and visible (satisfying AUTH-05's visibility requirement), but `onClick={onStart}` routes to the Railway CLI pairing flow, same as the primary button. Whether a token-input sub-form was intended as a separate UI component requires a product decision. The backend does not expose a `/wizard/railway/token` endpoint in Phase 12 scope.

#### 2. Wizard Visual Layout in Browser

**Test:** Run `cd supervisor && npm run dev`, then `cd supervisor/wizard && npx vite dev`. Open http://localhost:5173
**Expected:** Dark background (#1e1e1e), centered card, "ClaudeOS Setup" heading with "OS" in accent blue, horizontal stepper showing Railway/Claude/Launch steps, Railway step active with "Sign in with Railway" button and "Use auth token instead" link below, BuildProgress footer visible when extensions are installing
**Why human:** Visual fidelity, CSS variable rendering, and real-time SSE event delivery cannot be verified programmatically.

#### 3. Nix Container Wizard Build (Linux Required)

**Test:** On a Linux builder: `nix build .#wizardDist` (to compute correct npmDepsHash), update hash in flake.nix, then `nix build .#container`
**Expected:** Container includes /app/wizard-dist/index.html and /app/wizard-dist/assets/; BootService serves wizard UI at port 8080 in container
**Why human:** lib.fakeHash is a known Nix placeholder requiring Linux builder — cannot verify on macOS. Intentional per plan and documented.

### Gaps Summary

No blocking gaps. All 14 automated must-haves are verified:

- Complete Vite+React+TypeScript wizard project with build output at wizard-dist/
- All 5 API client functions, SSE hook with reconnection, types mirroring backend
- 5 UI components (Stepper, RailwayStep, AnthropicStep, LaunchStep, BuildProgress) with CSS Modules
- 16 component tests passing across 4 test files
- App.tsx wires all 9 SSE event types through wizardReducer
- BootService rewritten to serve wizard-dist/ with API proxy and SSE streaming
- flake.nix wizardDist derivation with container copy step
- 207 backend tests passing, 16 frontend tests passing
- All 6 task commits verified in git log (c341060, 32d9e94, a4d227d, 3d210b7, 029b26d, 8b531f0)

One item requires human review: the "Use auth token instead" link is present and visible (AUTH-05 UI requirement met) but its onClick triggers the Railway CLI flow rather than a distinct token-input form. This may be intentional for Phase 12 scope.

---

_Verified: 2026-03-15T20:10:00Z_
_Verifier: Claude (gsd-verifier)_
