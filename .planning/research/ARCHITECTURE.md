# Architecture Patterns

**Domain:** Zero-config onboarding for ClaudeOS (containerized VS Code environment)
**Researched:** 2026-03-15
**Confidence:** HIGH (existing codebase analysis) / MEDIUM (CLI auth capture)

## Current Architecture (Baseline)

```
Container Boot Sequence (today):

  entrypoint.sh (root, PID 1)
    |-- mkdir /data dirs, chown to app user
    |-- install Claude Code if missing (curl)
    |-- exec su-exec app node supervisor.cjs
          |
          v
  supervisor/index.ts boot()
    |-- BootService.isConfigured() checks /data/config/auth.json
    |-- IF unconfigured: BootService.serveSetupPage(port)
    |     |-- raw node:http server on port (currently 3100)
    |     |-- serves first-boot/setup.html (password form)
    |     |-- POST /api/v1/setup creates auth.json, resolves promise
    |     |-- setup server closes
    |-- buildServer() -> Fastify on :3100
    |-- BootService.installExtensions() (from default-extensions.json)
    |-- BootService.startCodeServer() -> code-server on :8080
          |-- PASSWORD env from decrypted auth.json
          |-- Boot state: ok
```

Key architectural facts from codebase analysis:
- The setup page runs on a **temporary raw HTTP server** before Fastify starts (boot.ts lines 86-221)
- Boot states: `initializing -> setup -> installing -> ready -> ok` (types.ts)
- Auth is password-based: user creates password -> scrypt hash + AES-256-GCM encrypted plaintext stored in `auth.json`
- `auth.json` existence with `encryptionKey + passwordHash` = "configured" signal (boot.ts `isConfigured()`)
- code-server not started until extensions installed and password known
- Railway exposes only one port publicly; currently port 8080 (code-server). Port 3100 (supervisor) is container-internal only.
- The setup wizard currently runs on whatever `port` is passed in `boot()` -- in `main()` that is 3100. This is a problem for Railway deployments where only 8080 is exposed.

## Recommended Architecture for Zero-Config Onboarding

### Design Decision: Expand the Pre-Fastify Setup Server on Port 8080

The setup wizard must live in the **pre-Fastify temporary HTTP server** (the existing `serveSetupPage` pattern in boot.ts), and it must bind to **port 8080** (the publicly-exposed port on Railway).

**Rationale:**
1. The wizard must run **before** code-server starts -- code-server needs the password from setup to launch
2. The wizard must be accessible from the user's browser via Railway's public URL, which maps to port 8080
3. Extensions cannot run until code-server is running, so an extension-based wizard is impossible
4. The Fastify supervisor API on :3100 is never publicly accessible on Railway
5. The existing `serveSetupPage()` already creates a temporary `node:http` server -- we extend this pattern, not replace it

**Change from v1.0:** The setup server must bind to **port 8080** instead of the supervisor port (3100). After setup completes and the server closes, code-server launches on the same port 8080. No conflict because they never run simultaneously.

### Component Boundaries

| Component | Responsibility | Status | Communicates With |
|-----------|---------------|--------|-------------------|
| **SetupWizard** (expanded boot.ts) | Multi-step first-boot UI: password, Railway auth, Claude auth, progress | MODIFY `serveSetupPage()` | Raw HTTP server on :8080, CLIAuthService |
| **CLIAuthService** (new) | Wraps `railway login --browserless` and `claude login`, captures output, monitors process lifecycle | NEW service | child_process spawn, BootService |
| **InstanceStateService** (new) | Detects "unclaimed" vs "password-set" vs "railway-authed" vs "fully-configured" from config files | NEW service | Reads /data/config/*.json |
| **BootService** (modified) | Orchestrates boot states, delegates to setup wizard, installs extensions, starts code-server | MODIFY | SetupWizard, ExtensionInstaller, code-server |
| **setup.html** (modified) | Multi-step wizard UI with SSE progress for auth steps | MODIFY | Browser-side JS, setup server endpoints |
| **Supervisor (Fastify)** | Existing API on :3100 -- no changes for onboarding | UNCHANGED | Extensions, code-server, tmux |
| **code-server** | VS Code UI on :8080 -- starts only after setup complete | UNCHANGED | Supervisor API, extensions |

### New Boot Sequence

```
entrypoint.sh (unchanged -- still installs Claude Code, execs supervisor)
  |
  v
supervisor/index.ts boot()
  |
  |-- InstanceStateService.getState()
  |     Reads: /data/config/auth.json, /data/config/setup-state.json
  |     Returns: "unclaimed" | "password-set" | "railway-authed" | "fully-configured"
  |
  |-- IF state !== "fully-configured":
  |     |
  |     |-- SetupWizard.serve(port: 8080)  <-- KEY CHANGE: was 3100
  |     |     |
  |     |     |-- Serves multi-step setup.html
  |     |     |-- Resumes from last completed step (state on disk)
  |     |     |
  |     |     |-- Step 1: Create Password (existing flow, unchanged)
  |     |     |     POST /api/v1/setup -> writes auth.json
  |     |     |     -> updates setup-state.json {passwordSet: true}
  |     |     |
  |     |     |-- Step 2: Railway Auth
  |     |     |     POST /api/v1/setup/railway/start
  |     |     |       -> CLIAuthService.startRailwayLogin()
  |     |     |       -> spawns `railway login --browserless`
  |     |     |       -> captures pairing code + URL from stdout
  |     |     |       -> returns { pairingCode, pairingUrl }
  |     |     |     Client displays code, opens pairingUrl in new tab
  |     |     |     GET /api/v1/setup/railway/status (SSE stream)
  |     |     |       -> monitors CLI process exit code
  |     |     |       -> on success: updates setup-state.json
  |     |     |
  |     |     |-- Step 3: Claude Auth
  |     |     |     POST /api/v1/setup/claude/start
  |     |     |       -> CLIAuthService.startClaudeLogin()
  |     |     |       -> spawns `claude login` (with NODE_NO_WARNINGS=1)
  |     |     |       -> captures auth URL from stdout
  |     |     |       -> returns { authUrl }
  |     |     |     Client opens authUrl in new tab
  |     |     |     GET /api/v1/setup/claude/status (SSE stream)
  |     |     |       -> monitors credential file at ~/.claude/
  |     |     |       -> on success: updates setup-state.json
  |     |     |
  |     |     |-- Step 4: Launch (all steps complete)
  |     |     |     -> setup server closes, promise resolves
  |     |
  |-- buildServer() -> Fastify on :3100 (unchanged)
  |-- BootService.installExtensions() (unchanged)
  |-- BootService.startCodeServer(port: 8080) (unchanged -- same port, no conflict)
```

### Data Flow

```
Browser (user)                  SetupWizard (:8080)              CLI processes
     |                                |                              |
     |--- GET / ------------------>   |                              |
     |<-- setup.html (multi-step) -   |                              |
     |                                |                              |
  [Step 1: Password]                  |                              |
     |--- POST /api/v1/setup ------>  |                              |
     |    {password, confirm}         |-- write auth.json            |
     |<-- {success: true} ----------  |-- write setup-state.json     |
     |                                |                              |
  [Step 2: Railway]                   |                              |
     |--- POST /setup/railway/start > |                              |
     |                                |-- spawn railway login -----> |
     |                                |     --browserless            |
     |                                |<-- stdout: code + url -------|
     |<-- {pairingCode, pairingUrl} - |                              |
     |                                |                              |
     |--- user opens pairingUrl ----> (Railway website in new tab)   |
     |--- user enters pairing code    |                              |
     |                                |                              |
     |--- GET /setup/railway/status > |                              |
     |    (SSE stream)                |-- check process exit ------> |
     |<-- event: {status: pending} -- |                              |
     |    ...                         |                              |
     |<-- event: {status: success} -- |<-- exit code 0 ------------- |
     |                                |-- update setup-state.json    |
     |                                |                              |
  [Step 3: Claude]                    |                              |
     |--- POST /setup/claude/start -> |                              |
     |                                |-- spawn claude login ------> |
     |                                |<-- stdout: auth URL ---------|
     |<-- {authUrl} ----------------  |                              |
     |                                |                              |
     |--- user opens authUrl -------> (Anthropic website in new tab) |
     |--- user completes OAuth        |                              |
     |                                |                              |
     |--- GET /setup/claude/status -> |                              |
     |    (SSE stream)                |-- check ~/.claude/ files --> |
     |<-- event: {status: success} -- |<-- credentials found --------|
     |                                |-- update setup-state.json    |
     |                                |                              |
  [Step 4: Launch]                    |                              |
     |<-- wizard shows "Launching..." |                              |
     |                                | (server closes, boot continues)
     |                                |                              |
     | ...extension install + code-server start...                   |
     |                                |                              |
     |--- GET :8080 ----------------> code-server (now running)      |
```

## Key Architectural Decisions

### 1. Port 8080 for Setup Wizard

Railway (and most PaaS) expose a single port. ClaudeOS uses 8080 for code-server. The setup wizard must use the same port because it is the only port reachable from the public internet.

The temporary HTTP server in `serveSetupPage()` already closes before code-server starts. The port handoff is clean: wizard server closes -> promise resolves -> code-server spawns on :8080. No simultaneous binding.

**Implementation:** Change the `serveSetupPage(port)` call in `index.ts` to pass `8080` (or the code-server port from config) instead of the supervisor port.

### 2. `railway login --browserless` for Railway Auth

Using the `--browserless` pairing flow avoids all OAuth complexity:

- **No OAuth app registration** -- eliminates the redirect URI problem entirely
- **Fork-friendly** -- every fork works without configuration changes
- **No PKCE implementation** -- the CLI handles it internally
- **No client_id/client_secret** -- nothing to store or expose

The `--browserless` flow:
1. Supervisor spawns `railway login --browserless`
2. CLI prints a pairing code and a URL to stdout
3. Supervisor parses these from stdout and returns to browser
4. User visits URL in a new tab, enters pairing code
5. CLI receives auth token, stores in Railway's config directory
6. CLI process exits with code 0
7. Supervisor detects exit, marks Railway auth complete

**Output parsing:** Railway CLI output format for `--browserless` needs to be tested in the container. The supervisor should use regex patterns to extract the pairing code and URL, with a fallback to displaying raw CLI output if parsing fails.

**Confidence: HIGH** -- Railway docs explicitly document the `--browserless` pairing code flow.

### 3. Claude Login via stdout Capture

`claude login` (the Claude Code CLI auth command) opens a browser URL for OAuth. In a headless container:
1. Browser cannot open (no display server)
2. CLI outputs the auth URL to stdout
3. CLI also supports pressing `c` to copy the URL to clipboard

**Approach:** Spawn `claude login` with `stdio: ['pipe', 'pipe', 'pipe']`. Monitor stdout for a URL pattern matching `https://claude.ai/` or `https://console.anthropic.com/`. If the CLI requires a TTY, use `node-pty` to provide a pseudo-terminal.

**Completion detection:** Monitor for credential files at `~/.claude/` (the standard Claude Code credential location). When files appear, auth is complete. Alternatively, check the CLI process exit code.

**Alternative (ANTHROPIC_API_KEY):** Claude Code supports `ANTHROPIC_API_KEY` environment variable for API key auth. This is simpler but bypasses subscription billing (Pro/Max/Teams). The project explicitly wants `claude login` for subscription support, but API key could be offered as a fallback in the wizard.

**Confidence: MEDIUM** -- The auth URL capture mechanism works according to docs and issue reports, but the exact stdout format in a headless container needs testing. The CLI may behave differently without a TTY.

### 4. Instance State Detection (Unclaimed Instance)

State is tracked in `/data/config/setup-state.json`:

```typescript
interface SetupState {
  passwordSet: boolean;           // auth.json exists with passwordHash
  railwayAuthenticated: boolean;  // railway CLI has valid token
  claudeAuthenticated: boolean;   // claude CLI has valid credentials
  completedAt?: string;           // ISO timestamp when fully configured
}
```

Detection logic:

```typescript
// supervisor/src/services/instance-state.ts
type InstanceState = "unclaimed" | "password-set" | "railway-authed" | "fully-configured";

function getInstanceState(dataDir: string): InstanceState {
  const authPath = join(dataDir, "config", "auth.json");
  const setupStatePath = join(dataDir, "config", "setup-state.json");

  // No auth.json at all = fresh instance
  if (!existsSync(authPath)) return "unclaimed";

  // auth.json exists but incomplete
  try {
    const auth = JSON.parse(readFileSync(authPath, "utf-8"));
    if (!auth.encryptionKey || !auth.passwordHash) return "unclaimed";
  } catch {
    return "unclaimed";
  }

  // Check setup progress
  if (!existsSync(setupStatePath)) return "password-set";
  try {
    const state = JSON.parse(readFileSync(setupStatePath, "utf-8"));
    if (!state.railwayAuthenticated) return "password-set";
    if (!state.claudeAuthenticated) return "railway-authed";
    return "fully-configured";
  } catch {
    return "password-set";
  }
}
```

**Resumability:** If the container restarts mid-setup (Railway redeploys, etc.), the wizard resumes from the last completed step. Password does not need re-entry. Auth steps that were in-progress restart (CLI process was killed by container stop).

### 5. Build Progress During First Boot

Extend the existing BootState type:

```typescript
// In types.ts
type BootState =
  | "initializing"
  | "setup"             // wizard active (generic)
  | "setup-password"    // step 1: awaiting password
  | "setup-railway"     // step 2: awaiting railway auth
  | "setup-claude"      // step 3: awaiting claude auth
  | "installing"        // extensions installing
  | "ready"             // extensions done, code-server starting
  | "ok";               // code-server running
```

For auth steps, the wizard HTML uses **Server-Sent Events (SSE)** for real-time progress. SSE is simpler than WebSocket for unidirectional server-to-client updates, works through Railway's HTTP proxy, and requires no additional library (raw `node:http` can write SSE format).

```typescript
// SSE endpoint in setup server
if (req.url === '/api/v1/setup/railway/status' && req.method === 'GET') {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const interval = setInterval(() => {
    const status = cliAuthService.getRailwayStatus();
    res.write(`data: ${JSON.stringify({ status })}\n\n`);
    if (status !== 'pending') {
      clearInterval(interval);
      res.end();
    }
  }, 1000);

  req.on('close', () => clearInterval(interval));
  return;
}
```

For extension installation progress, the existing health endpoint poll approach (already in setup.html) works fine since installation is fast (~10-30 seconds).

### 6. Static Callback Page -- Not Needed

The `--browserless` pairing flow eliminates the need for a static OAuth callback page. The Railway CLI handles the token exchange internally -- no redirect to the ClaudeOS instance is required. The user completes auth on Railway's website, the CLI process receives the token via Railway's internal mechanism, and the process exits.

Similarly, `claude login` handles its own OAuth callback via a local server it starts internally.

If a future version needs Railway OAuth (for deeper API integration like project linking), a static callback page at a stable URL (e.g., GitHub Pages) could be used. But for v1.1, this is unnecessary.

### 7. Fork-Friendly Deploy Button

The deploy button should use Railway's URL format that accepts any repo:

```
https://railway.app/new/github?repo=OWNER/REPO
```

This is inherently fork-friendly -- each fork updates `OWNER/REPO` to their own. The README can document this:

```markdown
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.app/new/github?repo=YOUR_USERNAME/ClaudeOS)
```

No Railway template registration needed. No hardcoded repo URLs.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supervisor/src/services/instance-state.ts` | **NEW** | Detects unclaimed/partial/configured state from config files |
| `supervisor/src/services/cli-auth.ts` | **NEW** | Wraps `railway login --browserless` and `claude login`, captures output, monitors lifecycle |
| `supervisor/src/services/boot.ts` | **MODIFY** | Expand `serveSetupPage()` with multi-step wizard, add Railway/Claude auth endpoints, add SSE status endpoints |
| `supervisor/src/index.ts` | **MODIFY** | Pass port 8080 to setup wizard, check instance state before deciding whether to show wizard |
| `supervisor/src/types.ts` | **MODIFY** | Add new BootState values (`setup-password`, `setup-railway`, `setup-claude`), add SetupState interface |
| `first-boot/setup.html` | **MODIFY** | Multi-step wizard UI (password -> Railway -> Claude -> launch) with SSE progress |
| `supervisor/package.json` | **MAYBE MODIFY** | Add `node-pty` dependency if needed for Claude CLI auth capture |
| `flake.nix` | **MAYBE MODIFY** | Add `railway-cli` to container contents if not already available |
| `config/default-extensions.json` | **UNCHANGED** | No changes needed |
| `supervisor/src/server.ts` | **UNCHANGED** | Fastify server completely unaffected |
| `supervisor/src/routes/*` | **UNCHANGED** | All existing API routes unaffected |

## Suggested Build Order

Build order follows the dependency chain. Each step is independently testable.

### Phase 1: InstanceStateService
**No dependencies.** Pure filesystem reads.
- Create `supervisor/src/services/instance-state.ts`
- Add `SetupState` interface to `types.ts`
- Unit test: given various file states, returns correct instance state
- **Estimated scope:** ~50 LOC + tests

### Phase 2: CLIAuthService (Railway)
**Depends on:** Nothing (standalone service)
- Create `supervisor/src/services/cli-auth.ts`
- Implement `startRailwayLogin()`: spawn `railway login --browserless`, parse pairing code + URL from stdout
- Implement `getRailwayStatus()`: check process exit code
- Test with mock CLI process
- **Risk:** Need to verify exact Railway CLI stdout format in container
- **Estimated scope:** ~100 LOC + tests

### Phase 3: CLIAuthService (Claude)
**Depends on:** CLIAuthService scaffold from Phase 2
- Add `startClaudeLogin()` to cli-auth.ts: spawn `claude login`, capture auth URL
- Add `getClaudeStatus()`: check credential file existence
- Determine if `node-pty` is needed or if plain `spawn` with pipe works
- **Risk:** Claude CLI may need TTY; output format uncertain
- **Estimated scope:** ~80 LOC + tests

### Phase 4: Setup Wizard Server (multi-step)
**Depends on:** Phases 1-3 (uses InstanceStateService and CLIAuthService)
- Modify `boot.ts` `serveSetupPage()` to add new endpoints:
  - `POST /api/v1/setup/railway/start`
  - `GET /api/v1/setup/railway/status` (SSE)
  - `POST /api/v1/setup/claude/start`
  - `GET /api/v1/setup/claude/status` (SSE)
- Add setup-state.json persistence after each step
- Add resumability logic (skip completed steps)
- **Estimated scope:** ~200 LOC modifications to boot.ts

### Phase 5: Wizard HTML (multi-step UI)
**Depends on:** Phase 4 (API shape must be finalized)
- Modify `first-boot/setup.html` to be multi-step:
  - Step 1: Password (existing, minimal changes)
  - Step 2: Railway auth (display pairing code, link to Railway, SSE progress)
  - Step 3: Claude auth (display auth URL link, SSE progress)
  - Step 4: Launch (progress bar during extension install, then redirect)
- Pure HTML/CSS/JS, no framework
- **Estimated scope:** ~300 LOC (HTML is already ~315 lines, roughly doubling for new steps)

### Phase 6: Boot Integration
**Depends on:** All previous phases
- Modify `index.ts` to:
  - Call `InstanceStateService.getState()` before wizard decision
  - Pass port 8080 (code-server port) to `serveSetupPage()`, not supervisor port
  - Add extended BootState values
- Container testing: full boot with fresh /data volume
- **Estimated scope:** ~30 LOC changes to index.ts

### Phase 7: Fork-Friendly Deploy Button
**Depends on:** Nothing (independent README/config change)
- Update README with dynamic deploy button instructions
- Can be done in parallel with any other phase
- **Estimated scope:** README edits only

**Build order rationale:** Inside-out (services first, then server endpoints, then UI, then integration). Each service can be unit-tested in isolation before wiring together. The HTML wizard depends on the API shape, so it comes after the server endpoints. Integration is last because it is the simplest change (a few lines in index.ts) but requires all pieces to be ready.

## Patterns to Follow

### Pattern 1: Stepped Wizard with Disk-Persisted Resume

**What:** Multi-step setup where each completed step is persisted to disk. Container restart resumes from last completed step.
**When:** Any multi-step first-boot configuration.

```typescript
class SetupWizard {
  private state: SetupState;

  async serve(port: number): Promise<void> {
    this.state = this.loadOrCreateState();
    const step = this.getCurrentStep();

    const server = createServer((req, res) => {
      if (req.url === '/' || req.url === '/setup') {
        // Inject current step number into HTML template
        const html = this.renderWithStep(step);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }
      // ... step-specific API endpoints
    });

    return new Promise(resolve => {
      server.listen(port, '0.0.0.0');
      this.onComplete = () => { server.close(); resolve(); };
    });
  }

  private getCurrentStep(): number {
    if (!this.state.passwordSet) return 1;
    if (!this.state.railwayAuthenticated) return 2;
    if (!this.state.claudeAuthenticated) return 3;
    return 4;
  }
}
```

### Pattern 2: CLI Process Wrapping with Output Parsing

**What:** Spawn a CLI tool, parse structured output from stdout, expose parsed data via HTTP API.
**When:** Integrating CLI-based auth flows into a web UI.

```typescript
async startRailwayLogin(): Promise<{ pairingCode: string; pairingUrl: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('railway', ['login', '--browserless'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },  // Disable ANSI colors for parsing
    });

    let output = '';
    proc.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      // Railway CLI outputs pairing code and URL
      const codeMatch = output.match(/code[:\s]+([A-Z0-9-]+)/i);
      const urlMatch = output.match(/(https:\/\/[^\s]+)/);
      if (codeMatch && urlMatch) {
        resolve({ pairingCode: codeMatch[1], pairingUrl: urlMatch[1] });
      }
    });

    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code !== 0 && !this.pairingResolved) {
        reject(new Error(`railway login exited with code ${code}`));
      }
    });

    this.railwayProcess = proc;
  });
}
```

### Pattern 3: SSE for Long-Running Status Updates

**What:** Server-Sent Events from raw `node:http` server for auth completion monitoring.
**When:** User waits for external auth step to complete in another tab.

```typescript
if (req.url?.startsWith('/api/v1/setup/') && req.url?.endsWith('/status')) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Send initial state immediately
  const status = this.getStepStatus(step);
  res.write(`data: ${JSON.stringify(status)}\n\n`);

  const interval = setInterval(() => {
    const status = this.getStepStatus(step);
    res.write(`data: ${JSON.stringify(status)}\n\n`);
    if (status.complete) {
      clearInterval(interval);
      res.end();
    }
  }, 1000);

  req.on('close', () => clearInterval(interval));
  return;
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Wizard as VS Code Extension

**What:** Building the setup wizard as a VS Code extension with webview panels.
**Why bad:** code-server is not running during setup. Extensions require code-server. Chicken-and-egg problem. The existing architecture deliberately runs setup BEFORE code-server.
**Instead:** Extend the existing pre-Fastify raw HTTP server pattern in boot.ts.

### Anti-Pattern 2: Railway OAuth App for CLI Auth

**What:** Registering a Railway OAuth application with redirect URIs.
**Why bad:** Every fork gets a different Railway domain. Railway requires exact-match redirect URIs (no wildcards). Would require a central callback service or force users to register their own OAuth app per fork.
**Instead:** Use `railway login --browserless` which works for any domain/fork with zero configuration.

### Anti-Pattern 3: Storing CLI Tokens in Supervisor Config

**What:** Having the supervisor extract and store Railway/Claude tokens in its own config files.
**Why bad:** The CLIs manage their own credential storage and token refresh. Duplicating tokens means they can get out of sync. Token format may change across CLI versions.
**Instead:** Let each CLI manage its own credentials. The supervisor only needs to detect "is the CLI authenticated?" by checking for credential files or running a status command.

### Anti-Pattern 4: Starting code-server Before Setup Completes

**What:** Starting code-server immediately and showing setup in a VS Code webview.
**Why bad:** code-server requires a PASSWORD env var (from auth.json). Starting without a password means either no auth (security hole on public internet) or a random password the user does not know.
**Instead:** Complete all setup steps, including password creation, before starting code-server. The existing architecture already enforces this correctly.

### Anti-Pattern 5: Using WebSocket Instead of SSE for Auth Status

**What:** Setting up a full WebSocket connection for auth step status updates.
**Why bad:** Overkill for unidirectional server-to-client updates. The raw `node:http` setup server would need to add WebSocket upgrade handling. SSE is natively supported by `EventSource` in browsers and trivially implementable with raw HTTP.
**Instead:** Use SSE (`text/event-stream`). The browser uses `new EventSource('/api/v1/setup/railway/status')`. The server writes `data: {...}\n\n` frames.

### Anti-Pattern 6: node-pty as First Choice for CLI Capture

**What:** Immediately reaching for `node-pty` to spawn CLI processes.
**Why bad:** `node-pty` has native bindings that complicate the Nix build (needs compilation). Most CLI tools work fine with plain `spawn()` when you set `NO_COLOR=1` and pipe stdio.
**Instead:** Try `spawn()` with `stdio: ['pipe', 'pipe', 'pipe']` first. Only add `node-pty` if the CLI requires a TTY to output the auth URL (test this in container).

## Integration Points

### New Integration Points (v1.1 additions)

| Integration | Pattern | Notes |
|-------------|---------|-------|
| **Railway CLI** (`railway login --browserless`) | `child_process.spawn`, parse stdout | CLI must be installed in container. Add to flake.nix `contents` or install at runtime. |
| **Claude CLI** (`claude login`) | `child_process.spawn`, capture auth URL from stdout | Already installed by entrypoint.sh. May need PTY if CLI requires TTY. |
| **Railway credential files** | File existence check | Check `~/.railway/` or Railway's config directory for auth tokens. |
| **Claude credential files** | File existence check | Check `~/.claude/` for credential files. macOS uses Keychain; Linux/container uses file-based storage. |

### Existing Integration Points (unchanged)

| Integration | Pattern | Notes |
|-------------|---------|-------|
| **Supervisor <-> Extensions** | HTTP on localhost:3100 | Unchanged. Setup wizard is separate from Fastify. |
| **Extension <-> Extension** | VS Code `getExtension().exports` | Unchanged. |
| **Supervisor <-> tmux** | `execFile('tmux', [...])` | Unchanged. |
| **Supervisor <-> code-server** | `child_process.spawn('code-server', [...])` | Unchanged. code-server still starts after setup. |

### Container Dependencies to Add

| Dependency | Purpose | Installation |
|------------|---------|--------------|
| `railway-cli` | `railway login --browserless` command | Add to flake.nix container `contents` OR install via `curl` in entrypoint.sh (like Claude Code) |
| `node-pty` (maybe) | PTY for Claude CLI if needed | Add to supervisor `package.json`, rebuild Nix derivation |

## Sources

- [Railway CLI login docs](https://docs.railway.com/cli/login) -- browserless pairing code flow (HIGH confidence)
- [Railway OAuth creating an app](https://docs.railway.com/integrations/oauth/creating-an-app) -- redirect URI exact-match requirement (HIGH confidence)
- [Railway OAuth login & tokens](https://docs.railway.com/integrations/oauth/login-and-tokens) -- PKCE requirement for native apps (HIGH confidence)
- [Claude Code authentication docs](https://code.claude.com/docs/en/authentication) -- login flow, API key alternative, credential management (HIGH confidence)
- [Claude Code GitHub issue #5312](https://github.com/anthropics/claude-code/issues/5312) -- browser redirect behavior in headless environments (MEDIUM confidence)
- [Claude Code GitHub issue #7100](https://github.com/anthropics/claude-code/issues/7100) -- headless/remote authentication documentation (MEDIUM confidence)
- [node-pty on GitHub](https://github.com/microsoft/node-pty) -- PTY for interactive CLI capture (HIGH confidence)
- [Portainer initial setup](https://docs.portainer.io/start/install-ce/server/setup) -- first-boot wizard pattern, 5-min timeout security (MEDIUM confidence)
- Existing ClaudeOS codebase analysis: `supervisor/src/services/boot.ts`, `supervisor/src/index.ts`, `first-boot/setup.html`, `entrypoint.sh`, `flake.nix` (HIGH confidence)

---
*Architecture research for: ClaudeOS v1.1 Zero-Config Onboarding*
*Researched: 2026-03-15*
