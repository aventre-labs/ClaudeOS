# Phase 5: Supervisor Wiring Fixes - Research

**Researched:** 2026-03-14
**Domain:** Fastify server wiring, WebSocket URL configuration, VS Code extension WebSocket client
**Confidence:** HIGH

## Summary

Phase 5 addresses three cross-phase integration bugs discovered in the v1.0 milestone audit. All three are wiring errors -- the implementations exist and are correct in isolation, but the connections between them are broken. No new features need building; this is purely about fixing import/invocation gaps, URL mismatches, and conditional-registration timing issues.

The fixes are surgical and well-scoped: (1) import BootService in index.ts and call its boot sequence after server.listen(), (2) change WsClient default URL from `/ws` to `/api/v1/ws`, (3) always register secretRoutes and defer the auth check to request time. Each fix touches 1-2 files with minimal blast radius.

**Primary recommendation:** Fix all three bugs in a single plan with three tasks. Each fix is independent and can be verified individually. The test infrastructure (vitest + Fastify inject) already exists.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SUP-01 | Supervisor boots code-server with ClaudeOS branding | Bug 1 fix -- BootService invocation from index.ts starts code-server |
| DEP-04 | code-server authenticates with CLAUDEOS_AUTH_TOKEN | Bug 1 fix -- BootService.startCodeServer() sets PASSWORD env var |
| HOM-01 | User sees a welcome webview tab on startup | Bug 1 fix -- code-server must be running for extensions to load |
| SES-01 | Sessions sidebar tree view | Bug 2 fix -- WS URL correction enables real-time status updates |
| SES-03 | Status indicators on sessions | Bug 2 fix -- status messages arrive via corrected WebSocket |
| SES-06 | Zombie session indicators | Bug 2 fix -- zombie detection depends on WS status stream |
| SES-09 | Bold/gray session name styling | Bug 2 fix -- read/unread state depends on WS events |
| TRM-01 | Click session to open terminal | Bug 2 fix -- terminal output streams via WebSocket |
| TRM-02 | Multiple terminal tabs | Bug 2 fix -- each tab subscribes via WebSocket |
| SEC-01 | Encrypted secret storage | Bug 3 fix -- routes always registered, auth at request time |
| SEC-02 | Add/edit/delete secrets via webview | Bug 3 fix -- /api/v1/secrets/* always responds |
| SEC-03 | Public API for secrets | Bug 3 fix -- routes available without restart |
| SEC-04 | Status bar Anthropic key indicator | Bug 3 fix -- depends on secrets API availability |
| SEC-05 | First-run walkthrough for secrets | Bug 3 fix -- secrets routes must respond on fresh container |
| SEC-06 | ANTHROPIC_API_KEY written to Claude Code env | Bug 3 fix -- depends on secrets create route |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Role in Phase |
|---------|---------|---------|---------------|
| fastify | ^5.2.0 | HTTP server | Server where routes are registered |
| @fastify/websocket | ^11.0.0 | WebSocket support | WS handler registration under prefix |
| vitest | ^3.0.0 | Test runner | Existing test infrastructure |
| ws | (transitive) | WebSocket client | Used by claudeos-sessions extension |

No new dependencies needed. This phase only modifies existing files.

## Architecture Patterns

### Bug 1: BootService Not Invoked from index.ts

**Current state:** `supervisor/src/index.ts` calls `buildServer()` and `server.listen()` but never imports or invokes `BootService`. Line 28 even has a dry-run guard that mentions "not starting boot sequence" -- confirming the boot call was intended but never wired.

**Fix pattern:**
```typescript
// supervisor/src/index.ts -- after server.listen() succeeds
import { BootService } from "./services/boot.js";

// After listen succeeds, run boot sequence (only in non-dry-run mode)
if (!isDryRun) {
  const bootService = new BootService({
    dataDir,
    extensionInstaller: server.extensionInstaller,
    setBootState: server.setBootState,
    logger: { info: server.log.info.bind(server.log), error: server.log.error.bind(server.log) },
  });

  if (!bootService.isConfigured()) {
    // Close Fastify, serve setup page on same port, then restart
    await server.close();
    await bootService.serveSetupPage(port);
    // After setup completes, re-build and re-listen
    // ... or restructure to separate setup from main server
  }

  await bootService.installExtensions();
  await bootService.startCodeServer();
}
```

**Key consideration:** BootService.serveSetupPage() creates its own HTTP server on the same port. The boot sequence must run BEFORE server.listen() for fresh containers (first-boot), or the port will conflict. The planner must decide between:
- Option A: Run boot check before listen -- if unconfigured, serve setup page first, then build server after auth.json exists
- Option B: Restructure to not conflict (different port for setup)

Option A is cleanest: check `isConfigured()` before `server.listen()`. If not configured, run `serveSetupPage(port)` first (blocking), then proceed to `buildServer()` + `server.listen()`. This means the SecretStore will be created after auth.json exists, naturally fixing Bug 3 as well.

**Critical detail:** The `buildServer()` function creates `SecretStore` conditionally based on `existsSync(authPath)` at line 81. If BootService runs first-boot before `buildServer()`, auth.json will exist by the time `buildServer()` runs. However, for the case where auth.json already exists (not first boot), the current flow works. The real problem is only on first boot AND restart-after-first-boot (where auth.json exists but routes may not be registered due to timing). See Bug 3 analysis.

### Bug 2: WebSocket URL Mismatch

**Current state:**
- Server: `wsHandler` registered at `/api/v1` prefix (server.ts line 102-104), handler path is `/ws` -- so full path is `/api/v1/ws`
- Client: `WsClient` defaults to `ws://localhost:3100/ws` (ws-client.ts line 30)

**Fix:** Change WsClient default URL from `ws://localhost:3100/ws` to `ws://localhost:3100/api/v1/ws`.

```typescript
// claudeos-sessions/src/supervisor/ws-client.ts line 30
constructor(url: string = "ws://localhost:3100/api/v1/ws") {
```

This is a one-line fix. No server-side changes needed.

### Bug 3: Secrets Routes Conditionally Registered

**Current state:** `server.ts` line 81-83 and 112-117:
```typescript
const secretStore = existsSync(authPath)
  ? new SecretStore(options.dataDir)
  : null;
// ...
if (secretStore) {
  await server.register(secretRoutes, { prefix: "/api/v1", secretStore });
}
```

On a fresh container, auth.json does not exist at build time. Even after BootService creates it during first-boot, routes are never retroactively added.

**Fix:** Always register the secret routes. Create SecretStore lazily or make routes return 503 when SecretStore is unavailable.

Recommended approach -- always register routes, create SecretStore lazily:
```typescript
// Always register secret routes -- they handle missing store gracefully
await server.register(secretRoutes, {
  prefix: "/api/v1",
  dataDir: options.dataDir,
});
```

The routes would need a guard: if SecretStore cannot initialize (no auth.json = no encryption key), return 503 Service Unavailable. Once BootService creates auth.json, subsequent requests succeed without restart.

Alternative (simpler if Bug 1 fix restructures boot order): If boot always runs before buildServer, auth.json will always exist by the time routes register. Then the conditional check is fine. But this creates a hidden coupling -- better to be explicit.

**Recommended:** Always register routes. Inside each route handler, lazily initialize SecretStore on first request that has auth.json available. This is the most robust approach.

### Anti-Patterns to Avoid
- **Conditional route registration based on runtime state:** Routes should always be registered. Guard logic belongs in request handlers, not registration time.
- **Port conflicts between setup server and main server:** BootService.serveSetupPage creates its own http.Server. Must not overlap with Fastify listen.
- **Hardcoded URLs across package boundaries:** The WS URL should ideally be configurable or derived from a shared constant, not hardcoded in two places.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket reconnect | Custom retry logic | Existing WsClient already handles this | reconnect with backoff already implemented |
| Route auth guards | Per-route middleware | Fastify preHandler hook or inline guard | consistent pattern across all guarded routes |

## Common Pitfalls

### Pitfall 1: Port Conflict on Fresh Boot
**What goes wrong:** BootService.serveSetupPage(port) binds port 3100, then Fastify also tries to bind 3100.
**Why it happens:** Setup server and main server both target the same port.
**How to avoid:** Run BootService first-boot check BEFORE Fastify server.listen(). Setup server closes before Fastify binds.
**Warning signs:** EADDRINUSE error in logs.

### Pitfall 2: Pino Logger Binding
**What goes wrong:** Passing `server.log.info` directly as a function loses `this` context.
**Why it happens:** Pino logger methods depend on `this`.
**How to avoid:** Use `.bind(server.log)` or wrap in arrow functions.
**Warning signs:** "Cannot read properties of undefined" errors in boot logs.

### Pitfall 3: SecretStore Initialization Without Encryption Key
**What goes wrong:** SecretStore constructor reads auth.json for the encryption key. If called before auth.json exists, it throws.
**Why it happens:** Lazy initialization creates SecretStore before first-boot completes.
**How to avoid:** SecretStore creation must be deferred until auth.json exists. Routes return 503 before that point.
**Warning signs:** "Auth config not found" error on fresh container.

### Pitfall 4: Fastify Decorator Access Timing
**What goes wrong:** Accessing `server.extensionInstaller` or `server.setBootState` from index.ts before decorators are set.
**Why it happens:** Decorators are set inside `buildServer()` but accessed from `main()`.
**How to avoid:** Access decorators after buildServer returns, or pass options directly to BootService.
**Warning signs:** `undefined` when accessing decorator.

## Code Examples

### Fix 1: Boot Sequence Wiring (index.ts)
```typescript
// supervisor/src/index.ts
import { BootService } from "./services/boot.js";

async function main(): Promise<void> {
  const isDryRun = process.argv.includes("--dry-run");
  const dataDir = process.env.CLAUDEOS_DATA_DIR ?? DEFAULT_DATA_DIR;
  const port = Number(process.env.CLAUDEOS_PORT) || DEFAULT_PORT;

  if (!isDryRun) {
    // Boot check BEFORE building server -- ensures auth.json exists
    const bootService = new BootService({
      dataDir,
      extensionInstaller: /* need to resolve this dependency */,
      setBootState: /* need state holder */,
    });

    if (!bootService.isConfigured()) {
      await bootService.serveSetupPage(port);
      // auth.json now exists, setup server closed, port is free
    }
  }

  // Now build server -- auth.json guaranteed to exist (or dry-run)
  const server = await buildServer({ dataDir, isDryRun, port });
  // ... listen, then boot extensions + code-server
}
```

**Note:** BootService requires an ExtensionInstaller instance. Currently ExtensionInstaller is created inside buildServer. The planner needs to either:
1. Create ExtensionInstaller in index.ts and pass to both BootService and buildServer
2. Split the boot into pre-server (setup page) and post-server (extensions + code-server) phases

Option 2 is cleaner: run first-boot check before server, run extension install + code-server launch after server.

### Fix 2: WebSocket URL (ws-client.ts)
```typescript
// claudeos-sessions/src/supervisor/ws-client.ts line 30
constructor(url: string = "ws://localhost:3100/api/v1/ws") {
  this.url = url;
}
```

### Fix 3: Unconditional Route Registration (server.ts)
```typescript
// Always create SecretStore -- it will handle missing auth.json gracefully
// OR always register routes with a lazy store pattern
const secretStore = new SecretStore(options.dataDir);
await server.register(secretRoutes, {
  prefix: "/api/v1",
  secretStore,
});
```

SecretStore needs a modification to handle missing auth.json gracefully (return null/throw on operations rather than on construction).

## State of the Art

Not applicable -- this phase is about fixing wiring bugs in existing code, not adopting new technologies.

## Open Questions

1. **BootService dependency on ExtensionInstaller**
   - What we know: BootService needs ExtensionInstaller for installExtensions(). ExtensionInstaller is currently created inside buildServer().
   - What's unclear: Best way to share the instance between boot and server.
   - Recommendation: Create ExtensionInstaller in index.ts, pass to both. Or split boot into two phases: pre-server (first-boot setup page) and post-server (extension install + code-server launch via server decorators).

2. **SecretStore lazy initialization approach**
   - What we know: SecretStore reads auth.json in its constructor. On fresh container, auth.json doesn't exist until first-boot completes.
   - What's unclear: Whether to modify SecretStore to be lazy, or restructure boot order so auth.json always exists before buildServer.
   - Recommendation: Restructure boot order (Option A from Bug 1). First-boot runs before buildServer, so auth.json exists. For the "already configured" case, auth.json already exists. This avoids modifying SecretStore internals.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.x |
| Config file | supervisor/vitest.config.ts |
| Quick run command | `cd supervisor && npx vitest run` |
| Full suite command | `cd supervisor && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUP-01 (boot wiring) | BootService invoked from index.ts, code-server launches | integration | `cd supervisor && npx vitest run test/boot-wiring.test.ts -x` | No -- Wave 0 |
| SES-01/TRM-01 (WS URL) | WsClient connects to /api/v1/ws | unit | `cd claudeos-sessions && npx vitest run test/ws-client.test.ts -x` | No -- Wave 0 |
| SEC-01 (routes always registered) | /api/v1/secrets responds on fresh server | integration | `cd supervisor && npx vitest run test/routes/secrets-unconditional.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd supervisor && npx vitest run`
- **Per wave merge:** `cd supervisor && npx vitest run` + manual WS URL verification
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `supervisor/test/boot-wiring.test.ts` -- verify BootService is called from main entry point (or mock-based test that buildServer result has boot invoked)
- [ ] `supervisor/test/routes/secrets-unconditional.test.ts` -- verify secrets routes respond 200/503 even when auth.json missing at build time
- [ ] WS URL test: verify WsClient default URL matches server handler path (can be a simple assertion test)

## Sources

### Primary (HIGH confidence)
- Direct source code inspection of `supervisor/src/index.ts`, `supervisor/src/server.ts`, `supervisor/src/services/boot.ts`
- Direct source code inspection of `claudeos-sessions/src/supervisor/ws-client.ts`
- Direct source code inspection of `supervisor/src/ws/handler.ts`
- v1.0 Milestone Audit (`.planning/v1.0-MILESTONE-AUDIT.md`)

### Secondary (MEDIUM confidence)
- Existing test patterns from `supervisor/test/` directory

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all existing code
- Architecture: HIGH - bugs are clearly identified with exact file/line references from audit
- Pitfalls: HIGH - pitfalls derived from direct code analysis of actual implementations

**Research date:** 2026-03-14
**Valid until:** N/A - this is a bugfix phase, not subject to ecosystem drift
