---
phase: 11-auth-services-and-wizard-backend
verified: 2026-03-15T19:13:30Z
status: passed
score: 18/18 must-haves verified
re_verification: false
---

# Phase 11: Auth Services and Wizard Backend Verification Report

**Phase Goal:** Users can authenticate with Railway and Anthropic through server-side services, with wizard state that survives container restarts
**Verified:** 2026-03-15T19:13:30Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Wizard state persists to /data/config/wizard-state.json after each step completion | VERIFIED | `wizard-state.ts` uses atomic tmp+rename write on every `completeRailwayStep`, `completeAnthropicStep`, and `complete()` call |
| 2 | Container restart resumes wizard at last completed step instead of starting over | VERIFIED | Constructor reads existing file on creation; test "loads existing state from file" creates two service instances over same file and confirms step data survives |
| 3 | Wizard state transitions to terminal 'completed' status when all steps are done | VERIFIED | `complete()` sets `status: "completed"` with timestamp; guarded by mutex and step-completion check |
| 4 | Boot can check wizard completion to skip wizard entirely | VERIFIED | `isCompleted()` returns boolean from `state.status === "completed"`; exposed on `WizardStateService` instance registered in server.ts |
| 5 | Railway login spawns `railway login --browserless` and captures pairing code + URL from stdout | VERIFIED | `auth-railway.ts` L31: `spawn("railway", ["login", "--browserless"], ...)`, stdout parsed with URL regex and hyphenated-word regex |
| 6 | Railway login notifies listeners on subprocess exit (success or failure) | VERIFIED | `proc.on("exit")` calls `onComplete({ success: true/false, error? })`; ENOENT handled via `proc.on("error")` |
| 7 | Railway token is extracted from ~/.railway/config.json after successful login and stored in SecretStore | VERIFIED | `extractToken()` reads `~/.railway/config.json`, `storeToken()` calls `secretStore.set("railway-token", token, "auth", ["railway"])` |
| 8 | Anthropic API key is validated via HTTP call to api.anthropic.com without consuming credits | VERIFIED | `validateApiKey()` POSTs to `https://api.anthropic.com/v1/messages`; 401 = invalid, any other status = valid (no credit consumption) |
| 9 | Validated Anthropic API key is stored encrypted in SecretStore | VERIFIED | `storeApiKey()` calls `secretStore.set("anthropic-api-key", apiKey, "auth", ["anthropic"])` |
| 10 | Claude login spawns subprocess, captures URL from stdout, notifies on completion | VERIFIED | `startClaudeLogin()` spawns `claude login`, parses stdout for `https://` pattern, fires `onLoginUrl` then `onComplete` |
| 11 | Claude login falls back gracefully if process errors or no URL captured | VERIFIED | 10-second timeout fires `onComplete({ fallbackToApiKey: true, ... })` if no URL; ENOENT returns install error |
| 12 | Active subprocesses are killed when cancelled or on cleanup | VERIFIED | `cancel()` on both services calls `this.process.kill()` and sets `this.process = null` |
| 13 | GET /api/v1/wizard/status returns current wizard state | VERIFIED | Route exists in wizard.ts L82; test "returns 200 with wizard state" passes |
| 14 | POST /api/v1/wizard/railway/start initiates Railway login and returns pairing code + URL | VERIFIED | Route L97; returns 202, fires `onPairingInfo` via SSE broadcast |
| 15 | POST /api/v1/wizard/anthropic/key validates and stores API key | VERIFIED | Route L148; validates via `anthropicAuth.validateApiKey()`, stores if valid, marks step complete |
| 16 | All wizard endpoints return 410 Gone after wizard is completed | VERIFIED | `completionGuard` preHandler applied to all POST routes; test "POST endpoints return 410 when wizard is completed" passes |
| 17 | Wizard routes are registered in server.ts under /api/v1 prefix | VERIFIED | server.ts L93-99: `server.register(wizardRoutes, { prefix: "/api/v1", ... })` |
| 18 | Wizard endpoints are rate-limited (30 req/min per IP) | VERIFIED | wizard.ts L48-51: `server.register(rateLimit, { max: 30, timeWindow: 60000 })` |

**Score:** 18/18 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supervisor/src/types.ts` | WizardState, WizardStep, and SSE event type definitions | VERIFIED | Contains `WizardState`, `WizardStepRailway`, `WizardStepAnthropic`, `WizardSSEEvents` (L158-192) |
| `supervisor/src/schemas/wizard.ts` | Zod schemas for all wizard endpoints | VERIFIED | Exports `WizardStatusResponseSchema`, `AnthropicKeyBodySchema`, `WizardCompleteResponseSchema`, `WizardErrorSchema`, `WizardGoneSchema`, `RailwayStartResponseSchema` (71 lines) |
| `supervisor/src/services/wizard-state.ts` | WizardStateService with atomic persistence | VERIFIED | 162 lines; exports `WizardStateService`; atomic write via tmp+rename; serialized write queue; completionInProgress mutex |
| `supervisor/test/services/wizard-state.test.ts` | Unit tests for wizard state (min 60 lines) | VERIFIED | 170 lines; 13 tests covering initialization, step completion, terminal status, mutex, corruption recovery |
| `supervisor/src/services/auth-railway.ts` | RailwayAuthService with subprocess management | VERIFIED | 116 lines; exports `RailwayAuthService`; spawns railway CLI, parses stdout, extracts/stores token |
| `supervisor/src/services/auth-anthropic.ts` | AnthropicAuthService with API key validation and claude login | VERIFIED | 152 lines; exports `AnthropicAuthService`; validates via HTTP, stores in SecretStore, manages claude login subprocess |
| `supervisor/test/services/auth-railway.test.ts` | Unit tests for Railway auth (min 50 lines) | VERIFIED | 240 lines; 13 tests with mocked child_process |
| `supervisor/test/services/auth-anthropic.test.ts` | Unit tests for Anthropic auth (min 60 lines) | VERIFIED | 269 lines; 15 tests with mocked fetch and child_process |
| `supervisor/src/routes/wizard.ts` | All wizard REST endpoints and SSE stream | VERIFIED | 310 lines; exports `wizardRoutes`, `WizardRouteOptions`; 6 endpoints + SSE |
| `supervisor/test/routes/wizard.test.ts` | Integration tests for wizard endpoints (min 80 lines) | VERIFIED | 290 lines; 11 tests with mock service injection |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `wizard-state.ts` | `/data/config/wizard-state.json` | atomic write (tmp + rename) | WIRED | `renameSync` present at L149, L160; pattern confirmed |
| `wizard-state.ts` | `types.ts` | import WizardState type | WIRED | L18: `import type { WizardState } from "../types.js"` |
| `auth-railway.ts` | `node:child_process` | spawn('railway', ['login', '--browserless']) | WIRED | L31: `spawn("railway", ["login", "--browserless"], ...)` |
| `auth-railway.ts` | `secret-store.ts` | SecretStore.set() for Railway token | WIRED | L113: `secretStore.set("railway-token", token, "auth", ["railway"])` |
| `auth-anthropic.ts` | `https://api.anthropic.com/v1/messages` | fetch() for API key validation | WIRED | L29: `fetch("https://api.anthropic.com/v1/messages", ...)` |
| `auth-anthropic.ts` | `secret-store.ts` | SecretStore.set() for API key | WIRED | L59: `secretStore.set("anthropic-api-key", apiKey, "auth", ["anthropic"])` |
| `wizard.ts` (routes) | `wizard-state.ts` | WizardStateService for state management | WIRED | Imported and used as `wizardState` throughout all routes |
| `wizard.ts` (routes) | `auth-railway.ts` | RailwayAuthService for login flow | WIRED | Imported, used as `railwayAuth.isRunning()`, `railwayAuth.startLogin()` |
| `wizard.ts` (routes) | `auth-anthropic.ts` | AnthropicAuthService for key validation and login | WIRED | Imported, used as `anthropicAuth.validateApiKey()`, `anthropicAuth.startClaudeLogin()` |
| `server.ts` | `wizard.ts` (routes) | server.register(wizardRoutes) | WIRED | L93-99: `server.register(wizardRoutes, { prefix: "/api/v1", ... })` |
| `wizard.ts` (routes) | SSE clients | reply.raw SSE streaming | WIRED | L240: `reply.raw.writeHead(200, { "Content-Type": "text/event-stream", ... })` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SETUP-03 | Plans 01, 03 | Setup wizard state persists across container restarts so user can resume where they left off | SATISFIED | `WizardStateService` writes to `/data/config/wizard-state.json` with atomic tmp+rename; constructor reloads from file on creation; 13 tests verify persistence |
| AUTH-01 | Plans 02, 03 | User can sign in with Railway via `railway login --browserless` pairing code flow | SATISFIED | `RailwayAuthService.startLogin()` spawns subprocess, parses pairing code + URL, notifies callbacks; route `POST /wizard/railway/start` exposes it via HTTP |
| AUTH-02 | Plans 02, 03 | User can paste an Anthropic API key to credential Claude Code | SATISFIED | `AnthropicAuthService.validateApiKey()` validates via HTTP (zero-cost), `storeApiKey()` encrypts in SecretStore; route `POST /wizard/anthropic/key` exposes it |
| AUTH-03 | Plans 02, 03 | User can sign in with Anthropic via `claude login` flow (falls back to API key if unsupported) | SATISFIED | `AnthropicAuthService.startClaudeLogin()` spawns subprocess, captures URL, fires fallback on ENOENT or 10s timeout; route `POST /wizard/anthropic/login` exposes it |

All 4 required IDs accounted for. No orphaned requirements.

### Anti-Patterns Found

No blockers or stubs detected. The two `return null` occurrences in `auth-railway.ts` (L101, L106) are legitimate null returns from `extractToken()` when the Railway config file does not exist or is unparseable — not stubs.

### Human Verification Required

The following items cannot be verified programmatically and require a real deployment environment:

**1. Railway CLI browserless pairing flow**

- **Test:** Run the wizard on a live container with `railway` CLI installed. Navigate to POST /api/v1/wizard/railway/start and watch the SSE stream.
- **Expected:** Pairing code and URL appear in SSE `railway:started` event within seconds of process start.
- **Why human:** Requires real `railway` binary and real Railway account to validate stdout parsing against actual output.

**2. Anthropic API key validation with a real key**

- **Test:** POST /api/v1/wizard/anthropic/key with a valid Anthropic API key.
- **Expected:** Returns 200; key is encrypted in SecretStore; SSE `anthropic:key-validated` event fires.
- **Why human:** Requires live API call to api.anthropic.com with a real key.

**3. Claude login subprocess URL capture**

- **Test:** POST /api/v1/wizard/anthropic/login on a container with `claude` CLI installed.
- **Expected:** SSE `anthropic:login-started` event fires with the browser login URL within 10 seconds.
- **Why human:** Requires real `claude` binary to validate stdout URL parsing.

**4. Rate limit behavior**

- **Test:** Send 31+ requests to any wizard endpoint within 60 seconds from the same IP.
- **Expected:** The 31st request returns 429 Too Many Requests.
- **Why human:** Rate limit enforcement requires live HTTP behavior; server.inject() in tests bypasses it.

**5. SSE heartbeat and client cleanup**

- **Test:** Open GET /api/v1/wizard/events in a browser or with curl, wait 15 seconds, verify heartbeat comments appear; then close the connection and verify no memory leak.
- **Expected:** `: heartbeat` comment every 15 seconds; client removed from Map on close.
- **Why human:** Requires live SSE connection held open, not injectable.

### Gaps Summary

No gaps. All automated checks passed:

- All 18 observable truths verified against actual source code
- All 10 required artifacts exist, are substantive, and are wired
- All 11 key links confirmed present in source
- All 4 requirement IDs (AUTH-01, AUTH-02, AUTH-03, SETUP-03) satisfied with implementation evidence
- 207/207 tests pass (52 from phase 11, 155 from prior phases — zero regressions)
- TypeScript errors found are pre-existing in `src/index.ts` and `src/routes/secrets.ts`, none in phase 11 files
- All 6 commits documented in SUMMARYs verified present in git history

---

_Verified: 2026-03-15T19:13:30Z_
_Verifier: Claude (gsd-verifier)_
