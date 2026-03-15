---
phase: 05-supervisor-wiring-fixes
verified: 2026-03-14T16:00:00Z
status: passed
score: 3/3 must-haves verified
re_verification: false
---

# Phase 05: Supervisor Wiring Fixes Verification Report

**Phase Goal:** Fix three cross-phase integration bugs in the supervisor that prevent boot, WebSocket communication, and secrets access on fresh containers
**Verified:** 2026-03-14T16:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                              | Status     | Evidence                                                                                 |
| --- | -------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| 1   | BootService is imported and invoked from index.ts — code-server launches on non-dry-run boot       | VERIFIED   | `boot()` in index.ts imports BootService, calls pre-server setup page and post-server install+launch |
| 2   | WsClient connects to /api/v1/ws matching the server's registered handler path                     | VERIFIED   | Default constructor param changed to `"ws://localhost:3100/api/v1/ws"` at line 30       |
| 3   | Secrets routes respond on a fresh container where auth.json does not exist at server build time   | VERIFIED   | Routes always registered; getStore() returns null → 503 when auth.json absent, 200 when present |

**Score:** 3/3 truths verified

---

### Required Artifacts

| Artifact                                              | Expected                                           | Status   | Details                                                                                   |
| ----------------------------------------------------- | -------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `supervisor/src/index.ts`                             | BootService import and invocation after listen()   | VERIFIED | Imports BootService and ExtensionInstaller; exports `boot()` with two-phase sequence; VITEST guard on main() |
| `claudeos-sessions/src/supervisor/ws-client.ts`       | Corrected default WebSocket URL                    | VERIFIED | Constructor default at line 30: `"ws://localhost:3100/api/v1/ws"`; comment header updated |
| `supervisor/src/server.ts`                            | Unconditional secret route registration            | VERIFIED | `secretRoutes` registered at line 108-111 with `dataDir` option; no conditional block; no SecretStore import at server level |
| `supervisor/src/services/secret-store.ts`             | tryCreate() static factory method                  | VERIFIED | Lines 75-83: returns null instead of throwing when auth.json absent                      |
| `supervisor/src/routes/secrets.ts`                    | Lazy SecretStore with 503 on unavailable           | VERIFIED | `getStore()` closure with cached store; all 5 handlers check store and return 503 if null |
| `supervisor/test/boot-wiring.test.ts`                 | Tests for boot() wiring                            | VERIFIED | 3 tests covering: configured boot, first-boot setup page ordering, dry-run exclusion     |
| `supervisor/test/routes/secrets-unconditional.test.ts` | Tests for 503/200 behavior                        | VERIFIED | 5 tests: 3 x 503 without auth.json, 2 x 200/201 with auth.json                          |
| `claudeos-sessions/test/supervisor/ws-client.test.ts` | Default URL assertion added                        | VERIFIED | Test at line 60-64 asserts `ws.url === "ws://localhost:3100/api/v1/ws"`                 |

---

### Key Link Verification

| From                                            | To                                      | Via                                     | Status   | Details                                                                  |
| ----------------------------------------------- | --------------------------------------- | --------------------------------------- | -------- | ------------------------------------------------------------------------ |
| `supervisor/src/index.ts`                       | `supervisor/src/services/boot.ts`       | import + invocation after server.listen() | VERIFIED | `import { BootService } from "./services/boot.js"` at line 2; `new BootService(...)` at lines 20 and 58; post-listen calls at lines 68-69 |
| `claudeos-sessions/src/supervisor/ws-client.ts` | `supervisor/src/ws/handler.ts`          | WebSocket URL default parameter         | VERIFIED | Default `"ws://localhost:3100/api/v1/ws"` matches server prefix `/api/v1` + handler path `/ws` |
| `supervisor/src/server.ts`                      | `supervisor/src/routes/secrets.ts`      | unconditional server.register(secretRoutes) | VERIFIED | Lines 108-111: `await server.register(secretRoutes, { prefix: "/api/v1", dataDir: options.dataDir })` — no conditional wrapping |

---

### Requirements Coverage

| Requirement | Description                                       | Source Plan | Status    | Evidence                                                                    |
| ----------- | ------------------------------------------------- | ----------- | --------- | --------------------------------------------------------------------------- |
| SUP-01      | Supervisor boots code-server with ClaudeOS branding | 05-01      | SATISFIED | BootService.startCodeServer() called post-listen in boot() when !isDryRun  |
| DEP-04      | code-server authenticates with CLAUDEOS_AUTH_TOKEN  | 05-01      | SATISFIED | BootService.startCodeServer() sets PASSWORD env; boot wiring enables this  |
| HOM-01      | User sees welcome webview tab on startup            | 05-01      | SATISFIED | code-server must run for extensions to load; boot wiring enables this       |
| SES-01      | Sessions sidebar tree view                          | 05-01      | SATISFIED | Real-time status updates depend on WS; URL fix enables connection           |
| SES-03      | Status indicators on sessions                       | 05-01      | SATISFIED | Status messages arrive via corrected WebSocket path                         |
| SES-06      | Zombie session indicators                           | 05-01      | SATISFIED | Zombie detection depends on WS status stream; URL fix enables it            |
| SES-09      | Bold/gray session name styling                      | 05-01      | SATISFIED | Read/unread state depends on WS events; URL fix enables it                  |
| TRM-01      | Click session to open terminal                      | 05-01      | SATISFIED | Terminal output streams via WebSocket; URL fix enables it                   |
| TRM-02      | Multiple terminal tabs                              | 05-01      | SATISFIED | Each tab subscribes via WebSocket; URL fix enables it                       |
| SEC-01      | Encrypted secret storage                            | 05-01      | SATISFIED | Routes always registered; getStore() lazily creates SecretStore on first request with auth.json |
| SEC-02      | Add/edit/delete secrets via webview                 | 05-01      | SATISFIED | /api/v1/secrets/* always responds; was previously conditional on build-time auth.json |
| SEC-03      | Public API for secrets                              | 05-01      | SATISFIED | Routes available without restart; no conditional registration               |
| SEC-04      | Status bar Anthropic key indicator                  | 05-01      | SATISFIED | Depends on secrets API availability — now always available                  |
| SEC-05      | First-run walkthrough for secrets                   | 05-01      | SATISFIED | Secrets routes respond on fresh container with 503 until setup completes    |
| SEC-06      | ANTHROPIC_API_KEY written to Claude Code env        | 05-01      | SATISFIED | Depends on secrets create route — now always registered                     |

Note: SUP-01, DEP-04, HOM-01, SES-01, SES-03, SES-06, SES-09, TRM-01, TRM-02, SEC-01 through SEC-06 are all marked as Phase 2/3 complete in REQUIREMENTS.md — this phase provides the wiring fixes that make those prior-phase implementations functional end-to-end.

---

### Anti-Patterns Found

No anti-patterns found across all modified files. Scan of index.ts, server.ts, secret-store.ts, secrets.ts, and ws-client.ts returned zero TODO/FIXME/placeholder comments. No `return null` stub handlers, no `return {}` stub implementations, no console.log-only handlers.

---

### Test Suite Results

| Suite                                             | Tests  | Result |
| ------------------------------------------------- | ------ | ------ |
| `supervisor` (full suite)                         | 138    | PASS   |
| `claudeos-sessions` (full suite)                  | 122    | PASS   |
| `supervisor/test/boot-wiring.test.ts`             | 3      | PASS   |
| `supervisor/test/routes/secrets-unconditional.test.ts` | 5 | PASS   |
| `claudeos-sessions/test/supervisor/ws-client.test.ts`  | 13| PASS   |

---

### Commit Verification

All three task commits documented in SUMMARY.md were verified present in git history:

- `ebee4e4` feat(05-01): wire BootService invocation from index.ts
- `b7b188f` fix(05-01): correct WsClient default WebSocket URL to /api/v1/ws
- `7507ecd` feat(05-01): register secrets routes unconditionally with lazy SecretStore

---

### Human Verification Required

Three behaviors cannot be verified programmatically:

**1. First-boot setup page served on fresh container**

Test: Delete auth.json from /data/config, start the supervisor binary, navigate to http://localhost:3100
Expected: Setup page is served; after submitting a password, server transitions to normal mode and code-server launches
Why human: Requires a real container environment and the supervisor binary to execute; the test suite mocks BootService

**2. Code-server launches with ClaudeOS branding**

Test: Complete first-boot setup, observe code-server process in container
Expected: code-server process running with product.json applied, ClaudeOS name visible in browser title/UI
Why human: Requires full code-server binary and X11/browser environment

**3. Real-time terminal output via WebSocket**

Test: Open a session in the VS Code extension sidebar, click to open terminal tab
Expected: Terminal output streams live via WebSocket at ws://localhost:3100/api/v1/ws
Why human: Requires VS Code extension host, running supervisor, and live tmux session

---

## Summary

All three phase goal requirements are met in the codebase:

1. **Boot wiring** — `supervisor/src/index.ts` exports a `boot()` function (for testability) that creates BootService twice: once pre-server to run the first-boot setup page if auth.json is absent, and again post-server-listen to call `installExtensions()` and `startCodeServer()`. The `main()` entry point is a thin wrapper with a VITEST guard preventing side-effect execution during tests. Three tests verify all branches.

2. **WebSocket URL** — `claudeos-sessions/src/supervisor/ws-client.ts` default constructor parameter is `"ws://localhost:3100/api/v1/ws"`, matching the server handler registered at `/api/v1` prefix + `/ws` path. One new test asserts the default; 12 existing tests continue to pass.

3. **Unconditional secrets routes** — `supervisor/src/server.ts` registers `secretRoutes` unconditionally with `dataDir`. Routes use a lazy `getStore()` closure backed by `SecretStore.tryCreate()` — returning null without throwing when auth.json is absent. All five route handlers return 503 when the store is unavailable. Five integration tests confirm 503 on fresh container and 200/201 with auth.json present.

No regressions in either full test suite.

---

_Verified: 2026-03-14T16:00:00Z_
_Verifier: Claude (gsd-verifier)_
