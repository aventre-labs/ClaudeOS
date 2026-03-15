# Phase 11: Auth Services and Wizard Backend - Research

**Researched:** 2026-03-15
**Domain:** Server-side auth services (Railway CLI, Anthropic API), wizard state persistence, SSE streaming
**Confidence:** HIGH

## Summary

Phase 11 implements backend-only services for the setup wizard: Railway CLI auth via `railway login --browserless`, Anthropic auth via API key validation and `claude login`, wizard state persistence to disk, and REST+SSE endpoints for the Phase 12 frontend. All services build on existing patterns -- Fastify 5 + Zod routes, SecretStore for credential encryption, and `child_process.spawn()` for CLI subprocesses.

The core technical challenge is managing long-lived CLI subprocesses (`railway login --browserless` and `claude login`) that block waiting for user action in a browser, then notifying the frontend via SSE when they complete. The secondary challenge is wizard state persistence with atomic file writes following the existing SecretStore pattern.

**Primary recommendation:** Use raw `reply.raw` SSE (no plugin) for the single event stream, `@fastify/rate-limit` v10.x for rate limiting, and direct HTTP fetch to `api.anthropic.com/v1/messages` for API key validation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Railway login uses `railway login --browserless` spawned as child process, awaited as promise
- SSE event pushed to frontend when subprocess exits (success or failure)
- On failure: show error message + retry button. No automatic retry.
- Checkbox "Save Railway login for Claude to access" -- checked by default, persists Railway token in SecretStore
- Two Anthropic auth methods always visible side by side: API key input AND "Sign in with Anthropic" (claude login)
- API key validation via direct HTTP call to api.anthropic.com (no claude CLI dependency)
- Validated API key stored in SecretStore (encrypted)
- `claude login` follows same subprocess pattern as Railway
- Wizard state stored as JSON file: `/data/config/wizard-state.json`
- Tracks step completion flags AND credential references
- Trust state file only for resume -- no credential detection fallback
- Terminal "completed" state: wizard never shows again after completion
- Boot skips wizard entirely when state is "completed"
- All wizard endpoints in a single `routes/wizard.ts` file
- Single SSE stream: `GET /api/v1/wizard/events`
- Wizard endpoints are rate-limited but unauthenticated
- Wizard endpoints only active when wizard state is incomplete -- return 404/410 after completion
- Key endpoints: GET status, POST railway/start, POST anthropic/key, POST anthropic/login, GET events (SSE), POST complete

### Claude's Discretion
- Exact rate limiting strategy (requests per minute, implementation)
- SSE event payload shapes
- Railway token extraction method after login
- Error message formatting
- wizard-state.json schema details

### Deferred Ideas (OUT OF SCOPE)
- Auth settings in VS Code native settings (extension settings panel) -- runtime feature, not first-boot wizard
- Railway sign-out and re-auth from within running ClaudeOS -- future capability
- Multiple simultaneous Anthropic accounts -- UI shows "+ Add method" but actual multi-account is future (MULTI-01, MULTI-02)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User can sign in with Railway via `railway login --browserless` pairing code flow | Railway CLI subprocess management, stdout parsing for pairing code + URL, SSE notification on completion |
| AUTH-02 | User can paste an Anthropic API key to credential Claude Code | Direct HTTP validation against `api.anthropic.com/v1/messages`, SecretStore encryption for persistence |
| AUTH-03 | User can sign in with Anthropic via `claude login` flow (experimental, falls back to API key) | Claude CLI subprocess management, URL capture from stdout, SSE notification, fallback detection |
| SETUP-03 | Setup wizard state persists across container restarts | Atomic JSON file writes to `/data/config/wizard-state.json`, step completion tracking, boot-time state check |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | ^5.2.0 | HTTP server + route framework | Already used, Zod type provider configured |
| zod | ^3.24.0 | Request/response validation schemas | Already used across all routes |
| fastify-type-provider-zod | ^4.0.0 | Fastify-Zod integration | Already configured in server.ts |
| node:child_process | built-in | Spawn `railway` and `claude` CLI processes | Required for subprocess auth flows |
| node:crypto | built-in | Already used by SecretStore | Key derivation, encryption |
| node:fs | built-in | Wizard state file persistence | Atomic write pattern already established |

### New Dependencies
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @fastify/rate-limit | ^10.3.0 | Rate limiting wizard endpoints | Wizard endpoints are unauthenticated, need abuse protection |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @fastify/rate-limit | Manual token bucket | Rate limiting is deceptively complex; use the official plugin |
| Raw SSE via reply.raw | @fastify/sse plugin | Raw SSE is simpler for a single endpoint with custom event management; avoids adding another dependency for one route |
| Direct HTTP to Anthropic | @anthropic-ai/sdk | SDK is heavy; we only need one validation request |

**Installation:**
```bash
cd supervisor && npm install @fastify/rate-limit@^10.3.0
```

## Architecture Patterns

### Recommended Project Structure
```
supervisor/src/
  routes/
    wizard.ts           # All wizard endpoints (new)
  services/
    wizard-state.ts     # WizardState service (new)
    auth-railway.ts     # Railway auth subprocess manager (new)
    auth-anthropic.ts   # Anthropic auth (API key + claude login) (new)
  schemas/
    wizard.ts           # Zod schemas for wizard routes (new)
  types.ts              # Add WizardState types
```

### Pattern 1: Subprocess Auth Flow
**What:** Spawn a CLI tool, capture stdout for display info (pairing code/URL), await exit, notify via SSE.
**When to use:** Railway login and claude login flows.
**Example:**
```typescript
// Source: Existing pattern from boot.ts (spawn code-server)
import { spawn, type ChildProcess } from "node:child_process";

interface AuthFlowResult {
  success: boolean;
  error?: string;
}

function startRailwayLogin(): { process: ChildProcess; result: Promise<AuthFlowResult> } {
  const proc = spawn("railway", ["login", "--browserless"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });

  let stdout = "";
  let stderr = "";

  proc.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
    // Parse for pairing code and URL, emit SSE events
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const result = new Promise<AuthFlowResult>((resolve) => {
    proc.on("exit", (code) => {
      resolve({
        success: code === 0,
        error: code !== 0 ? stderr || `Exit code ${code}` : undefined,
      });
    });
    proc.on("error", (err) => {
      resolve({ success: false, error: err.message });
    });
  });

  return { process: proc, result };
}
```

### Pattern 2: Raw SSE with Fastify
**What:** Single SSE endpoint using `reply.raw` for streaming events to wizard frontend.
**When to use:** `GET /api/v1/wizard/events` endpoint.
**Example:**
```typescript
// Source: Fastify docs on reply.raw + SSE standard
server.get("/wizard/events", async (request, reply) => {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  // Send initial connection event
  reply.raw.write(`event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);

  // Register this connection for events
  const clientId = crypto.randomUUID();
  sseClients.set(clientId, reply.raw);

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    reply.raw.write(`: heartbeat\n\n`);
  }, 15000);

  request.raw.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(clientId);
  });

  // Don't call reply.send() -- reply.raw takes over
  return reply;
});

// Broadcasting helper
function broadcastEvent(event: string, data: unknown): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients.values()) {
    client.write(message);
  }
}
```

### Pattern 3: Atomic Wizard State Persistence
**What:** Write wizard state to disk after each step, atomic write (tmp + rename).
**When to use:** After any wizard step completes.
**Example:**
```typescript
// Source: Existing pattern from SecretStore.persistToDisk()
import { writeFileSync, renameSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

interface WizardState {
  status: "incomplete" | "completed";
  steps: {
    railway: { completed: boolean; completedAt?: string; tokenStored?: boolean };
    anthropic: { completed: boolean; completedAt?: string; method?: "api-key" | "claude-login" };
  };
  startedAt: string;
  completedAt?: string;
}

class WizardStateService {
  private state: WizardState;
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
    this.state = existsSync(filePath)
      ? JSON.parse(readFileSync(filePath, "utf-8"))
      : this.defaultState();
  }

  private defaultState(): WizardState {
    return {
      status: "incomplete",
      steps: {
        railway: { completed: false },
        anthropic: { completed: false },
      },
      startedAt: new Date().toISOString(),
    };
  }

  private persist(): void {
    const tmp = this.filePath + ".tmp";
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.filePath);
  }

  isCompleted(): boolean {
    return this.state.status === "completed";
  }

  // ... step completion methods
}
```

### Pattern 4: Wizard Endpoint Guard
**What:** Return 410 Gone when wizard is already completed, preventing access after setup.
**When to use:** All wizard endpoints except GET status.
**Example:**
```typescript
// Fastify preHandler hook for wizard routes
server.addHook("preHandler", async (request, reply) => {
  if (wizardState.isCompleted()) {
    return reply.status(410).send({
      error: "Wizard already completed",
      statusCode: 410,
    });
  }
});
```

### Anti-Patterns to Avoid
- **Polling for subprocess completion:** Use event-driven approach with process.on("exit"). Never poll with setInterval.
- **Storing credentials in wizard state file:** Wizard state tracks completion flags and references ("apiKey stored in SecretStore"), NEVER actual credential values.
- **Auto-retrying failed auth:** User decision says no automatic retry. Show error + retry button.
- **Credential detection fallback:** User decision says trust state file only for resume. Don't try to detect if Railway is already logged in by running `railway whoami`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting | Token bucket implementation | @fastify/rate-limit | Handles edge cases (distributed, sliding window, headers) |
| API key encryption | Custom crypto | SecretStore (already built) | AES-256-GCM with proper IV, auth tags, atomic writes |
| SSE protocol | Custom event formatting | Standard SSE format (`event:\ndata:\n\n`) | Browser EventSource API expects exact format |
| Atomic file writes | Direct writeFileSync | tmp + rename pattern (from SecretStore) | Prevents partial writes on crash |

**Key insight:** The project already has SecretStore with encryption and atomic writes. Wizard state follows the same persistence pattern without encryption.

## Common Pitfalls

### Pitfall 1: Railway CLI Not in PATH
**What goes wrong:** `spawn("railway", ...)` throws ENOENT because Railway CLI isn't installed in the container.
**Why it happens:** Railway CLI is a separate binary that must be pre-installed in the Docker image.
**How to avoid:** Check for `railway` binary existence before attempting login. Return a clear error if missing.
**Warning signs:** ENOENT errors on spawn.

### Pitfall 2: SSE Connection Leaks
**What goes wrong:** SSE clients disconnect but their references aren't cleaned up, causing memory leaks.
**Why it happens:** Missing `close` event handler on the request.
**How to avoid:** Always register `request.raw.on("close", ...)` to clean up client references and heartbeat intervals.
**Warning signs:** Growing memory usage, writes to closed sockets.

### Pitfall 3: Subprocess Zombie Processes
**What goes wrong:** CLI subprocess keeps running after user navigates away or connection drops.
**Why it happens:** Subprocess was spawned but never killed when the SSE connection closes.
**How to avoid:** Track active subprocesses. Kill them when the SSE client disconnects or on server shutdown.
**Warning signs:** Multiple `railway login` processes visible in `ps aux`.

### Pitfall 4: Anthropic API Key Validation Cost
**What goes wrong:** Validation request consumes API credits (real messages cost money).
**Why it happens:** Using the full messages endpoint for validation.
**How to avoid:** Use the smallest possible request: `max_tokens: 1`, cheapest model (`claude-3-5-haiku-20241022`), minimal message. Alternatively, send a request with an intentionally invalid body and check for 401 (invalid key) vs 400 (valid key, bad request). A 401 means invalid key; a 400 means the key authenticated but the request body was invalid -- confirming the key works.
**Warning signs:** Unexpected API charges during testing.

### Pitfall 5: Race Condition on Wizard Complete
**What goes wrong:** Two concurrent POST /complete requests both succeed, potentially causing duplicate state transitions.
**Why it happens:** No mutex on the complete endpoint.
**How to avoid:** WizardStateService should use an in-memory flag (same pattern as `setupInProgress` in BootService) to prevent concurrent completions.
**Warning signs:** Duplicate "completed" log messages.

### Pitfall 6: reply.raw vs Fastify Lifecycle
**What goes wrong:** Calling `reply.send()` after using `reply.raw.writeHead()` causes errors.
**Why it happens:** Once you use `reply.raw`, Fastify's response lifecycle is bypassed.
**How to avoid:** For SSE endpoints, use `reply.hijack()` or simply don't call `reply.send()`. Return `reply` from the handler without sending.
**Warning signs:** "Reply already sent" errors in logs.

## Code Examples

### Anthropic API Key Validation (Zero-Cost)
```typescript
// Validate API key without consuming credits
// Send minimal request; check for 401 vs non-401
async function validateAnthropicKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    if (response.status === 401) {
      return { valid: false, error: "Invalid API key" };
    }

    // Any non-401 response means the key authenticated
    // (200 = success, 400 = bad request but key valid, 429 = rate limited but key valid)
    return { valid: true };
  } catch (err) {
    return { valid: false, error: `Network error: ${(err as Error).message}` };
  }
}
```

### SSE Event Payload Shapes (Recommended)
```typescript
// Recommended SSE event types and payloads
interface WizardSSEEvents {
  // Connection established
  "connected": { timestamp: number };

  // Railway auth flow
  "railway:started": { pairingCode: string; url: string };
  "railway:complete": { success: boolean; error?: string };

  // Anthropic auth flow
  "anthropic:key-validated": { success: boolean; error?: string };
  "anthropic:login-started": { url: string };
  "anthropic:login-complete": { success: boolean; error?: string };

  // Wizard lifecycle
  "wizard:step-completed": { step: string; completedAt: string };
  "wizard:completed": { completedAt: string };
}
```

### Railway Token Extraction
```typescript
// After successful railway login, extract the token from Railway's config
// Railway CLI stores credentials in ~/.railway/config.json
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function extractRailwayToken(): string | null {
  const configPath = join(
    process.env.HOME || "/root",
    ".railway",
    "config.json"
  );
  if (!existsSync(configPath)) return null;
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    // Railway config stores the user token
    return config.user?.token ?? null;
  } catch {
    return null;
  }
}
```

### Rate Limiting Configuration
```typescript
// Recommended rate limiting for wizard endpoints
import rateLimit from "@fastify/rate-limit";

await server.register(rateLimit, {
  max: 30,           // 30 requests per minute per IP
  timeWindow: 60000, // 1 minute window
  // Only apply to wizard routes
  allowList: [],
  keyGenerator: (request) => request.ip,
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom OAuth apps | CLI pairing code flows (Railway, GitHub) | 2024 | No redirect URIs, works in containers |
| Polling for auth completion | SSE push notifications | Standard | Real-time UX, no wasted requests |
| Environment variable auth | Interactive wizard auth | This phase | Zero-config deployment |
| @fastify/sse plugin | Raw reply.raw SSE | Ongoing | Fewer dependencies for simple use cases |

## Open Questions

1. **Railway CLI stdout format**
   - What we know: `railway login --browserless` outputs a pairing code (hyphenated words) and a URL
   - What's unclear: Exact stdout format -- may output all at once or stream line by line. Pairing code may be 3 or 4 words.
   - Recommendation: Parse stdout incrementally (on "data" events). Use regex to extract URL (starts with `https://railway.com/cli-login`) and pairing code (hyphenated word pattern). Test in container environment to confirm exact format.

2. **Claude CLI login output**
   - What we know: `claude login` opens a browser with a URL for OAuth
   - What's unclear: Exact stdout format when run non-interactively, whether it outputs a URL to stdout or only opens a browser
   - Recommendation: Test `claude login` in headless container to see output. Implement graceful fallback: if no URL captured within 5 seconds or if process errors, suggest API key method instead.

3. **Railway config file location in container**
   - What we know: Railway CLI stores config in `~/.railway/`
   - What's unclear: Whether the token is directly readable after `railway login --browserless` or if there's a different storage mechanism
   - Recommendation: After successful login, check `~/.railway/config.json` for token. If not found, try `railway whoami` to verify login succeeded and accept that token extraction may not be possible (auth is still valid for Railway CLI usage).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `supervisor/vitest.config.ts` |
| Quick run command | `cd supervisor && npx vitest run --reporter=verbose` |
| Full suite command | `cd supervisor && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Railway login subprocess spawns, parses output, SSE notification | unit | `cd supervisor && npx vitest run test/services/auth-railway.test.ts -x` | No -- Wave 0 |
| AUTH-02 | Anthropic API key validation via HTTP, SecretStore persistence | unit | `cd supervisor && npx vitest run test/services/auth-anthropic.test.ts -x` | No -- Wave 0 |
| AUTH-03 | Claude login subprocess spawns, URL capture, fallback to API key | unit | `cd supervisor && npx vitest run test/services/auth-anthropic.test.ts -x` | No -- Wave 0 |
| SETUP-03 | Wizard state persists to JSON, loads on restart, atomic writes | unit | `cd supervisor && npx vitest run test/services/wizard-state.test.ts -x` | No -- Wave 0 |
| ROUTES | Wizard route endpoints respond correctly, guard on completion | integration | `cd supervisor && npx vitest run test/routes/wizard.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd supervisor && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd supervisor && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `supervisor/test/services/wizard-state.test.ts` -- covers SETUP-03
- [ ] `supervisor/test/services/auth-railway.test.ts` -- covers AUTH-01
- [ ] `supervisor/test/services/auth-anthropic.test.ts` -- covers AUTH-02, AUTH-03
- [ ] `supervisor/test/routes/wizard.test.ts` -- covers route integration
- [ ] `supervisor/src/schemas/wizard.ts` -- Zod schemas for wizard endpoints
- [ ] Framework install: `cd supervisor && npm install @fastify/rate-limit@^10.3.0` -- new dependency

## Sources

### Primary (HIGH confidence)
- Existing codebase: `supervisor/src/services/secret-store.ts` -- encryption, atomic writes, tryCreate pattern
- Existing codebase: `supervisor/src/services/boot.ts` -- subprocess spawning, setupInProgress mutex
- Existing codebase: `supervisor/src/routes/secrets.ts` -- Fastify + Zod route pattern
- Existing codebase: `supervisor/src/server.ts` -- route registration, service decoration
- Existing codebase: `supervisor/test/helpers/test-server.ts` -- test infrastructure with server.inject()

### Secondary (MEDIUM confidence)
- [Railway CLI login docs](https://docs.railway.com/cli/login) -- `--browserless` flag confirmed, pairing code format
- [Anthropic API docs](https://platform.claude.com/docs/en/api/overview) -- messages endpoint, x-api-key header, anthropic-version header
- [@fastify/rate-limit GitHub](https://github.com/fastify/fastify-rate-limit) -- v10.x compatible with Fastify 5
- [Fastify reply.raw for SSE](https://lirantal.com/blog/avoid-fastify-reply-raw-and-reply-hijack-despite-being-a-powerful-http-streams-tool) -- SSE implementation pattern

### Tertiary (LOW confidence)
- Railway CLI stdout exact format -- inferred from community reports, needs container verification
- Claude CLI login non-interactive behavior -- needs container verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all core libraries already in use, only @fastify/rate-limit is new
- Architecture: HIGH -- follows existing patterns (routes, services, schemas) exactly
- Pitfalls: HIGH -- most are standard subprocess/SSE concerns with well-known solutions
- Railway/Claude CLI output parsing: LOW -- exact stdout formats need container testing

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable domain, CLI formats may change)
