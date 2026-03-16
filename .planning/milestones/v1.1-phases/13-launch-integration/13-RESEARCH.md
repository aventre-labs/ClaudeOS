# Phase 13: Launch Integration - Research

**Researched:** 2026-03-15
**Domain:** Wizard-to-code-server transition, credential handoff, SSE-driven launch flow
**Confidence:** HIGH

## Summary

Phase 13 connects the completed wizard frontend (Phase 12) and auth backend (Phase 11) to the final code-server experience. The core challenge is three-fold: (1) a new `/wizard/launch` endpoint that triggers code-server startup and emits a `launch:ready` SSE event, (2) a full-page transition animation on the frontend that replaces the wizard card and waits for that event, and (3) a credential handoff that reads secrets from SecretStore and writes them to Claude Code's native config format before code-server starts.

The existing codebase provides nearly all the building blocks. `BootService.startCodeServer()` already launches code-server with `CLAUDEOS_AUTH_TOKEN` as PASSWORD. The SSE infrastructure (`broadcastEvent`, `useSSE` hook) is proven. `WizardStateService.complete()` handles the state transition. The main new work is: wiring the launch endpoint, adding the `launch:ready` event to SSE, building the transition animation UI, implementing credential writes to `~/.claude/settings.json` (env block with `ANTHROPIC_API_KEY`) and optionally Railway CLI config, and handling the setup server graceful shutdown.

**Primary recommendation:** Use `--auth none` on code-server (since Railway auth cookie already gates access to the instance), build a new `POST /wizard/launch` endpoint that calls `completeWizard` + starts code-server + emits `launch:ready` via SSE, and write the Anthropic API key to `~/.claude/settings.json` in the `env` block.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Full-page transition animation replaces the wizard card after clicking Launch
- ClaudeOS logo centered on dark background with animated progress dots/bar
- Status text cycles through phases: "Starting code-server...", "Configuring workspace...", "Almost ready..."
- Backend emits a `launch:ready` SSE event when code-server is up and healthy
- Frontend listens for `launch:ready` then does `window.location.replace('/')` -- no back-button to wizard
- Auto-login: user bypasses code-server's password page entirely
- New `POST /api/v1/wizard/launch` endpoint triggers code-server startup (separate from `/wizard/complete`)
- `/wizard/complete` marks wizard state as completed; `/wizard/launch` actually starts code-server
- Wizard setup server stays running briefly alongside code-server to deliver the `launch:ready` SSE signal, then shuts down
- Extensions install DURING the wizard (while user does auth) -- by launch time, extensions are likely already installed
- On subsequent container restarts: if wizard-state.json says "completed", skip wizard entirely, go straight to extension install + code-server
- Credentials stay in SecretStore (encrypted) during the wizard phase
- At launch time, read from SecretStore and write to final destinations
- Anthropic: Write to Claude Code's native config format
- Railway: Persist to Railway CLI config ONLY if user opted into "Save Railway login for Claude" checkbox
- On container restart (completed state): re-read SecretStore and re-write to native configs before starting code-server
- If code-server fails to start: show error screen with "Failed to start ClaudeOS" message, error details, [Retry] and [View Logs] buttons
- Wizard state remains "completed" on failure -- user can retry without re-doing auth
- If user refreshes during launch transition: show the launch animation screen again
- No timeout on launch transition

### Claude's Discretion
- Exact launch animation CSS/keyframes and timing
- SSE event payload shape for `launch:ready`
- How to set the code-server auth cookie (PASSWORD cookie format or --auth=none approach)
- Claude Code native config file format discovery and writing
- Health check mechanism for detecting code-server readiness
- How wizard setup server gracefully shuts down after delivering launch:ready
- Retry mechanism implementation details for code-server start failures

### Deferred Ideas (OUT OF SCOPE)
- Multiple simultaneous Anthropic accounts (MULTI-01, MULTI-02)
- Railway sign-out and re-auth from within running ClaudeOS
- Auth settings accessible in VS Code native settings panel
- Local (non-Railway) deploy auth support
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEPLOY-02 | User can launch ClaudeOS after completing auth steps | Full launch flow: `/wizard/launch` endpoint, credential handoff, code-server startup, SSE `launch:ready` event, frontend transition animation, `window.location.replace('/')` redirect |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fastify | (existing) | `/wizard/launch` endpoint | Already used for all wizard routes |
| Zod | (existing) | Request/response schema validation | Already used for all wizard schemas |
| Node.js http | (existing) | Setup server, health checks | Already used in BootService |
| React | (existing) | Launch transition UI | Already used for wizard frontend |
| CSS Modules | (existing) | Transition animation styles | Already used for all wizard components |
| EventSource (SSE) | (existing) | `launch:ready` event delivery | Already used via `useSSE` hook |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:fs | (built-in) | Write Claude Code config files | Credential handoff to `~/.claude/settings.json` |
| node:http | (built-in) | Health check requests to code-server | Detect code-server readiness |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `--auth none` | Setting PASSWORD cookie programmatically | `--auth none` is simpler and Railway auth already gates access; cookie approach requires matching code-server's hash format (ARGON2/SHA256) which is fragile |
| Writing `~/.claude/settings.json` env block | Setting `ANTHROPIC_API_KEY` env var on code-server process | env var is simpler but doesn't persist across code-server restarts; settings.json is Claude Code's official config mechanism |
| HTTP health check to localhost:8080 | Watching stdout for "HTTP server listening" | HTTP check is more reliable; stdout parsing is fragile |

## Architecture Patterns

### Recommended Project Structure
```
supervisor/src/
  services/
    credential-writer.ts    # NEW: reads SecretStore, writes to native configs
  routes/
    wizard.ts              # MODIFIED: add POST /wizard/launch endpoint
  services/
    boot.ts                # MODIFIED: support launch flow, health check

supervisor/wizard/src/
  components/
    LaunchTransition.tsx       # NEW: full-page transition animation
    LaunchTransition.module.css # NEW: animation styles
    LaunchStep.tsx             # MODIFIED: calls launch endpoint instead of complete
  hooks/
    useSSE.ts              # MODIFIED: add launch:ready to known events
  api/
    wizard.ts              # MODIFIED: add launchWizard() API call
  types.ts                 # MODIFIED: add LAUNCH_STARTED, LAUNCH_READY, LAUNCH_ERROR actions
  App.tsx                  # MODIFIED: show LaunchTransition when launching
```

### Pattern 1: Launch Flow Sequence
**What:** The complete sequence from button click to code-server landing
**When to use:** Understanding the end-to-end flow

```
User clicks "Launch ClaudeOS"
  -> Frontend shows LaunchTransition (replaces wizard card)
  -> Frontend calls POST /api/v1/wizard/launch
  -> Backend: wizardState.complete()
  -> Backend: credentialWriter.writeAll(secretStore)
     -> Read anthropic-api-key from SecretStore
     -> Write ~/.claude/settings.json { env: { ANTHROPIC_API_KEY: "..." } }
     -> If railway tokenStored: read railway-token, write ~/.railway/config.json
  -> Backend: bootService.startCodeServer({ auth: 'none' })
  -> Backend: poll localhost:8080 until healthy (HTTP GET /)
  -> Backend: broadcastEvent('launch:ready', { url: '/' })
  -> Frontend receives launch:ready via SSE
  -> Frontend: window.location.replace('/')
  -> User lands in code-server (no password page)
  -> Setup server gracefully shuts down after short delay
```

### Pattern 2: Code-Server Auth Strategy
**What:** Use `--auth none` since Railway auth cookie already protects the instance
**When to use:** Code-server startup configuration

The existing `startCodeServer()` uses `--auth password` with `CLAUDEOS_AUTH_TOKEN` as PASSWORD. For the wizard flow, using `--auth none` is the cleanest approach because:
1. Railway's auth cookie is already the access gate (per CONTEXT.md decision)
2. Setting the code-server PASSWORD cookie programmatically requires matching code-server's internal hash format (ARGON2 recommended), which is fragile
3. The cookie name format is `key` + optional suffix, and validation uses `isCookieValid` against ARGON2/SHA256/PLAIN_TEXT -- this is an internal implementation detail that could change

**Recommendation:** Modify `startCodeServer()` to accept an `auth` option. When launched via wizard, use `--auth none`. The `CLAUDEOS_AUTH_TOKEN` env var still exists for Railway auth verification at the supervisor level.

### Pattern 3: Credential Writer Service
**What:** Dedicated service that reads SecretStore and writes to native config locations
**When to use:** At launch time and on container restart

```typescript
// Source: Official Claude Code docs (code.claude.com/docs/en/settings)
// ~/.claude/settings.json format:
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

The credential writer should:
1. Read `anthropic-api-key` from SecretStore
2. Read existing `~/.claude/settings.json` (if any), merge the env block
3. Write atomically (tmp + rename, following existing pattern)
4. Optionally read `railway-token` and write to `~/.railway/config.json` if `wizardState.steps.railway.tokenStored === true`

### Pattern 4: SSE Event for Launch with Completion Guard Bypass
**What:** The SSE `/wizard/events` endpoint has a `completionGuard` that returns 410 after wizard completion. But the launch flow NEEDS SSE after completion to deliver `launch:ready`.
**When to use:** Critical architecture consideration

The current SSE endpoint has `preHandler: completionGuard` which rejects connections after `wizardState.isCompleted()`. The launch flow calls `wizardState.complete()` BEFORE code-server is ready, then needs to deliver `launch:ready` via SSE.

**Solutions:**
- Option A: Remove completionGuard from SSE endpoint (it already closes on `wizard:completed` event)
- Option B: Add a separate `/wizard/launch-events` SSE endpoint without the guard
- Option C: Have the frontend connect to SSE BEFORE calling `/wizard/launch`, keep the connection open

**Recommendation:** Option C is simplest -- the frontend is already connected to SSE when the user clicks Launch. The existing connection stays open. The `launch:ready` event is broadcast on the existing connection. The `wizard:completed` handler in useSSE currently closes the connection, so we need to NOT close on `wizard:completed` if a launch is in progress, and instead close on `launch:ready`.

### Pattern 5: Container Restart Fast Path
**What:** On subsequent boots, skip wizard and go straight to credential write + code-server
**When to use:** index.ts boot sequence modification

```
Container starts
  -> Check CLAUDEOS_AUTH_TOKEN (isConfigured)
  -> Check wizard-state.json status === "completed"
  -> If both true: credentialWriter.writeAll() -> installExtensions() -> startCodeServer()
  -> If token but wizard incomplete: serve wizard
  -> If no token: serve wizard (existing behavior)
```

### Anti-Patterns to Avoid
- **Setting code-server PASSWORD cookie directly:** code-server's cookie format is an internal detail (ARGON2 hashing). Use `--auth none` instead.
- **Closing SSE before launch:ready:** The wizard:completed handler currently closes SSE. Must keep it open for launch:ready delivery.
- **Starting code-server on the SAME port as setup server simultaneously:** The setup server is on port 8080. Code-server also wants port 8080. The setup server must stop listening before code-server binds, OR code-server uses a different port with a redirect.
- **Writing credentials to env vars only:** `ANTHROPIC_API_KEY` as a process env var doesn't persist. Write to `~/.claude/settings.json` for Claude Code to read on every session.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Credential config format | Custom credential file format | `~/.claude/settings.json` env block | Official Claude Code config mechanism, documented at code.claude.com/docs/en/settings |
| Code-server auth bypass | Cookie manipulation or proxy tricks | `--auth none` flag | Official code-server configuration option, Railway auth already gates access |
| Health check polling | Custom TCP socket check | HTTP GET to `localhost:8080` with retry loop | HTTP check verifies the full stack is ready, not just the port |
| Atomic file writes | Direct `writeFileSync` | tmp + rename pattern | Already established in SecretStore and WizardStateService |

**Key insight:** The codebase already has patterns for every infrastructure concern (atomic writes, SSE broadcasting, mutex guards, boot state machine). The new work is mostly wiring existing pieces together with minimal new logic.

## Common Pitfalls

### Pitfall 1: Port Conflict Between Setup Server and Code-Server
**What goes wrong:** Both the setup server and code-server want to bind to port 8080. Starting code-server while the setup server is still listening causes EADDRINUSE.
**Why it happens:** The setup server needs to stay alive to deliver `launch:ready` via SSE, but code-server needs port 8080.
**How to avoid:** Close the setup server's listener (stop accepting new connections) BEFORE starting code-server. The existing SSE connections stay open even after `server.close()` -- Node.js http.Server.close() stops accepting new connections but keeps existing ones alive. Then deliver `launch:ready` on the existing SSE connections, and force-close after a short delay.
**Warning signs:** EADDRINUSE errors on code-server start.

### Pitfall 2: SSE Connection Closed Before launch:ready
**What goes wrong:** The `useSSE` hook closes the EventSource on `wizard:completed` event. If `wizard:completed` fires before `launch:ready`, the frontend never receives the launch signal.
**Why it happens:** The current SSE handler has `if (event === "wizard:completed") { closedRef.current = true; es.close(); }`.
**How to avoid:** Modify the SSE close logic: don't close on `wizard:completed` if a launch is in progress. Close on `launch:ready` instead. Or: don't broadcast `wizard:completed` during launch flow -- only broadcast it from the explicit `/wizard/complete` endpoint, not from `/wizard/launch`.
**Warning signs:** Frontend stuck on transition animation forever.

### Pitfall 3: Credential Write Race with Code-Server Start
**What goes wrong:** Code-server starts before credentials are fully written. Claude Code sessions see no API key.
**Why it happens:** `credentialWriter.writeAll()` and `startCodeServer()` called without awaiting.
**How to avoid:** Strictly sequence: `await credentialWriter.writeAll()` THEN `startCodeServer()`. The credential write is fast (single file write), so this adds negligible delay.
**Warning signs:** Claude Code shows "No API key configured" after launch.

### Pitfall 4: Settings.json Merge Conflict
**What goes wrong:** Overwriting `~/.claude/settings.json` destroys any existing settings (permissions, hooks, etc.).
**Why it happens:** Writing the full file instead of merging the env block.
**How to avoid:** Read existing file, parse JSON, deep-merge the `env` key, write back. If file doesn't exist, create with just the env block.
**Warning signs:** Lost Claude Code settings after container restart.

### Pitfall 5: Refresh During Launch Shows Wizard
**What goes wrong:** User refreshes during launch transition. The wizard-state is "completed" so the completionGuard returns 410 on API calls. The app shows an error.
**Why it happens:** The frontend doesn't handle the "completed but not yet launched" state.
**How to avoid:** Check wizard status on load. If status === "completed" AND code-server is not yet running, show the launch transition screen and connect to SSE for `launch:ready`. If code-server IS running, redirect to `/`.
**Warning signs:** Users see error screens instead of the transition animation on refresh.

## Code Examples

### Credential Writer - Writing to Claude Code Config
```typescript
// Source: Official Claude Code docs (code.claude.com/docs/en/settings)
// File: ~/.claude/settings.json
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";

interface ClaudeSettings {
  env?: Record<string, string>;
  [key: string]: unknown;
}

export async function writeAnthropicKey(apiKey: string): Promise<void> {
  const claudeDir = join(process.env.HOME || "/root", ".claude");
  const settingsPath = join(claudeDir, "settings.json");

  mkdirSync(claudeDir, { recursive: true });

  // Merge with existing settings
  let settings: ClaudeSettings = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    } catch {
      // Corrupted file, start fresh
    }
  }

  settings.env = { ...settings.env, ANTHROPIC_API_KEY: apiKey };

  // Atomic write
  const tmpPath = settingsPath + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(settings, null, 2));
  renameSync(tmpPath, settingsPath);
}
```

### Health Check Polling for Code-Server Readiness
```typescript
// Poll code-server until it responds to HTTP
async function waitForCodeServer(
  port: number,
  maxAttempts = 30,
  intervalMs = 1000,
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/healthz`);
      if (res.ok || res.status === 302) return true;  // 302 = redirect to login (OK)
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
```

### Launch Transition Animation Component
```tsx
// Full-page transition that replaces wizard card
import styles from "./LaunchTransition.module.css";

interface LaunchTransitionProps {
  status: "starting" | "ready" | "error";
  error?: string;
  onRetry?: () => void;
}

export function LaunchTransition({ status, error, onRetry }: LaunchTransitionProps) {
  const messages = [
    "Starting code-server...",
    "Configuring workspace...",
    "Almost ready...",
  ];
  // Cycle through messages every 3 seconds
  // Implementation: useEffect with setInterval updating a messageIndex state

  if (status === "error") {
    return (
      <div className={styles.page}>
        <div className={styles.errorCard}>
          <h2>Failed to start ClaudeOS</h2>
          <p className={styles.errorDetail}>{error}</p>
          <div className={styles.errorActions}>
            <button onClick={onRetry}>Retry</button>
            <button>View Logs</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.logoLarge}>
        <span>Claude</span><span className={styles.os}>OS</span>
      </div>
      <div className={styles.progressDots}>
        {/* 3 animated dots with staggered animation-delay */}
      </div>
      <p className={styles.statusText}>{messages[currentIndex]}</p>
    </div>
  );
}
```

### Setup Server Graceful Shutdown Pattern
```typescript
// Stop accepting new connections but keep existing SSE alive
// Node.js http.Server.close() does exactly this
setupServer.close(() => {
  // All connections finally closed
  logger.info("Setup server fully shut down");
});

// After broadcasting launch:ready, force-close remaining connections after delay
setTimeout(() => {
  for (const [id, res] of sseClients) {
    res.end();
    sseClients.delete(id);
  }
}, 2000);  // 2s grace period for SSE delivery
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ANTHROPIC_API_KEY` env var only | `~/.claude/settings.json` env block | Claude Code 2024+ | Persists across sessions, supports managed settings hierarchy |
| code-server `--auth password` with manual login | `--auth none` behind reverse proxy auth | Common pattern | Eliminates double-auth when external auth already gates access |
| Direct process env for credentials | SecretStore encryption + write to native config at launch | Phase 11 decision | Credentials encrypted at rest, written to expected locations at launch |

## Open Questions

1. **Code-server health endpoint path**
   - What we know: code-server has a web interface on port 8080. A GET to `/` likely returns 200 or 302.
   - What's unclear: Whether there's a dedicated `/healthz` endpoint, or if we should just check for any non-error response.
   - Recommendation: Try GET `/healthz` first, fall back to checking for any response (200, 302, etc.) from `/`. The health check just needs to confirm code-server is accepting HTTP connections.

2. **Railway CLI config format for token persistence**
   - What we know: `RailwayAuthService.extractToken()` reads from `~/.railway/config.json` as `config.user.token`.
   - What's unclear: Whether writing the token back to this path in the same format is sufficient for Railway CLI to recognize it.
   - Recommendation: Write `{ "user": { "token": "..." } }` to `~/.railway/config.json`. This mirrors the format `extractToken()` reads.

3. **Setup server port handoff timing**
   - What we know: Setup server and code-server both want port 8080. `server.close()` stops new connections but keeps existing ones.
   - What's unclear: Exact timing -- how long after `server.close()` until the port is released for code-server to bind.
   - Recommendation: Call `setupServer.close()`, then wait for the `close` callback before starting code-server. The callback fires when all connections are closed. For SSE connections that linger, force-end them after broadcasting `launch:ready`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.0.0 |
| Config file | `supervisor/vitest.config.ts` |
| Quick run command | `cd supervisor && npx vitest run --reporter=verbose` |
| Full suite command | `cd supervisor && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPLOY-02a | POST /wizard/launch triggers code-server start | integration | `cd supervisor && npx vitest run test/routes/wizard.test.ts -x` | Exists (needs new tests) |
| DEPLOY-02b | Credential writer reads SecretStore and writes ~/.claude/settings.json | unit | `cd supervisor && npx vitest run test/services/credential-writer.test.ts -x` | Wave 0 |
| DEPLOY-02c | launch:ready SSE event emitted when code-server healthy | integration | `cd supervisor && npx vitest run test/routes/wizard.test.ts -x` | Exists (needs new tests) |
| DEPLOY-02d | Container restart fast path skips wizard | unit | `cd supervisor && npx vitest run test/boot-wiring.test.ts -x` | Exists (needs new tests) |

### Sampling Rate
- **Per task commit:** `cd supervisor && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd supervisor && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `supervisor/test/services/credential-writer.test.ts` -- covers DEPLOY-02b (credential handoff)
- [ ] New test cases in existing `supervisor/test/routes/wizard.test.ts` for `/wizard/launch` endpoint
- [ ] New test cases in existing `supervisor/test/boot-wiring.test.ts` for fast-path restart

## Sources

### Primary (HIGH confidence)
- [Claude Code Settings docs](https://code.claude.com/docs/en/settings) - `~/.claude/settings.json` format, env block for API keys, apiKeyHelper, configuration scopes
- Existing codebase analysis - boot.ts, wizard.ts, secret-store.ts, wizard-state.ts, App.tsx, LaunchStep.tsx, useSSE.ts
- [code-server auth docs](https://deepwiki.com/coder/code-server/2.5-authentication-and-security) - cookie format (key + suffix), validation methods (ARGON2/SHA256/PLAIN_TEXT), `--auth none` option

### Secondary (MEDIUM confidence)
- [Claude Help Center - API key management](https://support.claude.com/en/articles/12304248-managing-api-key-environment-variables-in-claude-code) - env var and settings.json approaches
- [code-server GitHub issues](https://github.com/coder/code-server/issues/1567) - `--auth none` as official approach for proxy-authenticated setups

### Tertiary (LOW confidence)
- Railway CLI config.json format - inferred from `RailwayAuthService.extractToken()` reading `config.user.token` path; needs validation that writing same format works

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, no new dependencies
- Architecture: HIGH - patterns follow existing codebase conventions, well-documented integration points
- Pitfalls: HIGH - identified through code analysis of actual SSE close behavior, port binding, and credential write ordering
- Credential format: HIGH - Claude Code official docs confirm `~/.claude/settings.json` env block
- Code-server auth: HIGH - `--auth none` is documented official option

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable -- all technologies are existing project dependencies)
