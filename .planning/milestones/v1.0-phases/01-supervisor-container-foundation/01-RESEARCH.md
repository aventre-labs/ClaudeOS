# Phase 1: Supervisor + Container Foundation - Research

**Researched:** 2026-03-12
**Domain:** Nix-built OCI container, Fastify supervisor, tmux session management, code-server branding, first-boot authentication
**Confidence:** HIGH

## Summary

Phase 1 is the foundation of ClaudeOS. It delivers the supervisor process (Fastify HTTP server on :3100 with WebSocket), the Nix-built OCI container image with code-server + Claude Code + tmux, the deployment configuration for Railway, and the extension template as a separate repo scaffold. The most technically novel aspects are: (1) Nix-only container builds using `dockerTools.buildLayeredImage` instead of Dockerfile, (2) a first-boot password creation flow owned by the supervisor rather than `CLAUDEOS_AUTH_TOKEN` env var, (3) event-driven session status detection via tmux hooks, and (4) extension installation from pre-built VSIX GitHub release assets instead of building from source in the container.

The prior roadmap research (`.planning/research/STACK.md`) established the stack (Fastify 5, Zod 4, Vitest 4, esbuild, TypeScript 5.8, Node.js 22), and the CONTEXT.md session refined several decisions away from the SPEC and prior research. Key divergences: Nix replaces Docker for image builds, password-based first-boot replaces env-var auth, pre-built VSIX replaces clone-and-build install, and the extension template lives in a separate repo under aventre-labs rather than in the kernel.

**Primary recommendation:** Build the supervisor as a Fastify 5 server with @fastify/websocket for real-time session events. Use Nix flake with `dockerTools.buildLayeredImage` for the OCI image, including an entrypoint script that runs as root to chown /data, then execs as the `app` user via `su-exec`. Deploy to Railway by pushing the Nix-built image to GHCR and referencing it in `railway.toml`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Archive saves scrollback text + metadata JSON (session name, creation time, working directory, model, flags)
- Revive starts a new Claude Code session and feeds full scrollback as a context file using --continue flag (no truncation limit)
- No retention limit -- archived sessions kept forever until manually deleted
- Force-kill (kill endpoint) always captures scrollback before destroying tmux window
- Revive is restore-only -- no optional prompt parameter. User sends new input separately after session is running
- Session status detection must be event-driven, NOT polling-based -- use tmux hooks or reactive change detection
- WebSocket endpoint for real-time push to extensions, covering both status changes AND session output streaming
- Extensions subscribe to specific sessions for output; status changes broadcast to all subscribers
- No CLAUDEOS_AUTH_TOKEN env var -- user creates password via a first-boot setup page
- Supervisor serves a minimal HTML form (ClaudeOS-branded) on first boot: password field, confirm, submit
- Password stored via supervisor's secret store (supervisor owns all secret storage)
- Random master encryption key generated on first boot, stored on persistent volume -- password is for auth, not encryption key derivation
- After password set and extensions install, show "Launch ClaudeOS" button (not auto-redirect)
- On subsequent boots, supervisor passes stored password to code-server's --auth flag; code-server handles its own login page
- Extensions install BEFORE code-server starts (blocking) -- user sees supervisor logs in terminal during install
- Installation errors halt the process (fail-fast) -- next boot retries failed extensions only
- Per-extension install tracking (not all-or-nothing marker)
- Supervisor health endpoint starts immediately at boot (before extensions install) -- returns status: "installing" during setup, "ok" when ready
- Full API ships in Phase 1: sessions CRUD, archive/revive, extension install, secrets CRUD, WebSocket, health
- API is versioned from the start: /api/v1/sessions, /api/v1/secrets, etc.
- Secrets API expanded beyond SPEC with optional category and tags metadata on secrets
- WebSocket on localhost:3100, no authentication required (container-internal only)
- Supervisor has its own settings system with a settings UI that ships with all ClaudeOS distros
- Extensions are pre-built to VSIX via GitHub Actions -- VSIX available as GitHub release assets
- default-extensions.json format: { "repo": "aventre-labs/claudeos-sessions", "tag": "v0.1.0" } -- supervisor uses GitHub API to find VSIX asset
- Three install methods: (1) GitHub release (repo + tag), (2) build from source (local path), (3) local VSIX file path
- After install, reload behavior is a supervisor setting: defaults to force reload, user can change to reload notification
- default-extensions.json ships with empty array [] in Phase 1
- Nix only -- no Dockerfile. Use dockerTools.buildImage to produce OCI-compatible image
- Deploy to Railway from Nix-built container image
- Multi-stage equivalent in Nix: build supervisor TypeScript in one derivation, compose into container image with runtime deps
- Non-root execution: app user created, entrypoint chowns /data then drops privileges
- Volume layout per SPEC: /data/extensions/, /data/sessions/, /data/secrets/, /data/config/
- Kernel repo: aventre-labs/ClaudeOS (already exists)
- Extension template: separate repo under aventre-labs (e.g., aventre-labs/claudeos-extension-template)
- Local development always inside Nix shell (nix develop)
- Manual rebuild (no watch mode / hot reload)
- Supervisor supports --dry-run flag: starts API server without launching code-server or tmux sessions
- Test framework: Vitest

### Claude's Discretion
- Session status detection method (tmux activity, pattern matching, or hybrid)
- Exact tmux hook/event mechanism for reactive status updates
- WebSocket message format and subscription protocol
- Secrets API endpoint design (REST routes, request/response shapes)
- Supervisor settings storage format and UI implementation
- Nix flake structure and derivation organization
- Exact HTML/CSS for first-boot setup page (within "minimal, ClaudeOS-branded" constraint)

### Deferred Ideas (OUT OF SCOPE)
- Splash page served by supervisor during extension install (terminal logs instead)
- Watch mode / hot reload for development (manual rebuild)
- Nix + Dockerfile dual support (Nix only)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SUP-01 | Supervisor boots code-server with ClaudeOS branding (product.json, settings.json) | code-server product.json branding via --product flag or file placement; settings.json as default VS Code settings |
| SUP-02 | Supervisor exposes session CRUD API on localhost:3100 (create, list, stop, kill) | Fastify 5 HTTP server with Zod validation; tmux CLI wrapper for session lifecycle |
| SUP-03 | Supervisor can send user input to a Claude Code session via tmux send-keys | tmux send-keys with race condition prevention (pass command as initial process argument) |
| SUP-04 | Supervisor can capture current terminal output from a Claude Code session via tmux capture-pane | tmux capture-pane -p -t for visible content, -S -1000 for scrollback |
| SUP-05 | Supervisor can archive a session (stop, save scrollback to disk) | Archive saves scrollback text + metadata JSON to /data/sessions/; atomic write-to-temp-then-rename |
| SUP-06 | Supervisor can revive an archived session (start new session, feed previous context) | New tmux session with --continue flag feeding archived scrollback as context file |
| SUP-07 | Supervisor exposes extension install pipeline (GitHub release VSIX download, build from source, local VSIX) | GitHub API to find VSIX release asset; code-server --install-extension for VSIX install |
| SUP-08 | Supervisor runs first-boot auto-installation of extensions from default-extensions.json | Per-extension install tracking; fail-fast with retry on next boot; empty array in Phase 1 |
| SUP-09 | Supervisor exposes health check endpoint with version and uptime | /api/v1/health returning status "installing" during setup, "ok" when ready |
| DEP-01 | ClaudeOS runs as a container (Nix-built OCI image, not node:22-bookworm-slim Dockerfile) | Nix dockerTools.buildLayeredImage with nodejs_22, tmux, git, code-server, Claude Code |
| DEP-02 | Container includes Node.js, code-server, Claude Code, tmux, git, and supervisor | All available as nixpkgs packages except Claude Code (curl installer in Nix derivation) |
| DEP-03 | Persistent volume at /data stores extensions, sessions, secrets, and config across restarts | /data volume with subdirectories created in Nix image; chowned at container start |
| DEP-04 | code-server authenticates with user-created password (not CLAUDEOS_AUTH_TOKEN env var) | First-boot flow creates password; supervisor passes to code-server --auth password |
| DEP-05 | Railway deployment configured with healthcheck, restart policy, and volume | railway.toml referencing GHCR image; Railway pulls pre-built image, no build step |
| DEP-06 | docker-compose.yml for local development with mounted /data volume | Compose file references Nix-built image loaded via `nix build` + `docker load` |
| DEP-07 | Entrypoint script handles volume permissions (chown /data before exec as app user) | Entrypoint runs as root, chowns /data, execs supervisor as app user via su-exec |
| TPL-01 | Extension template provides scaffold with package.json, tsconfig.json, src/extension.ts, and AGENTS.md | Separate repo: aventre-labs/claudeos-extension-template |
| TPL-02 | Template includes optional webview/ and mcp-server/ directories | Standard VS Code extension structure with optional directories |
| TPL-03 | Template package.json has build, watch, package, and test scripts configured | esbuild for bundling, vsce package --no-dependencies, vitest for testing |
| TPL-04 | Template AGENTS.md inherits kernel principles and adds extension-specific guidance | Document supervisor API contract, inter-extension patterns, MCP lifecycle rules |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 22.x LTS | Supervisor runtime | Active LTS through 2027. Available as `pkgs.nodejs_22` in nixpkgs. |
| TypeScript | ~5.8.x | All supervisor source code | Stable, strict mode. Pin with `~` to avoid TS 6.0/7.0 transition surprises. |
| Fastify | ^5.8.0 | Supervisor HTTP API on :3100 | Built-in JSON schema validation, Pino logging, 2-3x faster than Express. First-class TypeScript. |
| @fastify/websocket | ^11.2.0 | WebSocket endpoint for session status/output streaming | Built on ws@8. Shares Fastify's route hooks (auth, validation). No separate server needed. |
| Zod | ^4.3.0 | Runtime validation for API requests, configs | 6.5x faster than Zod 3. Used by MCP SDK. `fastify-type-provider-zod` bridges Fastify schemas. Zod 4 supported by fastify-type-provider-zod via `zod/v4/core` API. |
| esbuild | ^0.27.0 | Supervisor TypeScript bundling | Produces single CJS bundle. 10-100x faster than webpack. VS Code recommended. |
| Vitest | ^4.0.0 | Unit and integration testing | TypeScript-native, fast, Jest-compatible API. |
| tmux | 3.4+ (system) | Session multiplexing for Claude Code | Available as `pkgs.tmux` in nixpkgs. Direct CLI calls via child_process.execFile. |
| code-server | 4.x | VS Code in the browser | Available as `pkgs.code-server` in nixpkgs. Configurable via product.json, settings.json. |
| Claude Code | latest | AI agent engine (stock, unmodified) | Install via curl in Nix derivation. Never pin version. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fastify-type-provider-zod | ^4.0.0 | Zod integration with Fastify route schemas | Every API route definition -- automatic request/response validation |
| Pino | 10.x (bundled) | Structured JSON logging | Built into Fastify. Add pino-pretty as dev dependency for readable dev output. |
| pino-pretty | ^13.0.0 | Human-readable dev logging | Development only. Not in production container. |
| tsx | ^4.0.0 | TypeScript execution in dev mode | `tsx src/index.ts` during local development. Not used in container. |
| su-exec | system | Privilege dropping in container entrypoint | Container entrypoint: chown /data then exec as app user. 10KB binary, better than gosu. |
| @types/node | ^22.0.0 | Node.js type definitions | TypeScript compilation. Match Node.js major version. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Nix dockerTools | Dockerfile | User locked in Nix-only. dockerTools produces reproducible images without Docker daemon. Slightly harder to debug. |
| @fastify/websocket | Socket.IO | Socket.IO adds rooms/namespaces but is overkill for container-internal communication. ws is lighter. |
| Fastify | Hono | Hono excels at multi-runtime (edge, Deno) which is irrelevant here. Fastify has better Node.js-specific performance. |
| su-exec | gosu | su-exec is 10KB vs gosu's 1.8MB. Functionally identical for our use case. |
| Pre-built VSIX | Build from source | User decided pre-built. Avoids needing build tools in container. Faster installs. |

**Installation (supervisor):**
```bash
npm install fastify @fastify/websocket zod fastify-type-provider-zod
npm install -D typescript@~5.8 esbuild @types/node@22 tsx vitest pino-pretty
```

## Architecture Patterns

### Recommended Project Structure

```
claudeos/
├── flake.nix                      # Nix flake: devShell, supervisor build, container image
├── flake.lock                     # Pinned nixpkgs
├── supervisor/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── index.ts               # Entry point: boot sequence orchestration
│   │   ├── server.ts              # Fastify server setup, route registration
│   │   ├── routes/
│   │   │   ├── health.ts          # GET /api/v1/health
│   │   │   ├── sessions.ts        # CRUD: /api/v1/sessions
│   │   │   ├── extensions.ts      # /api/v1/extensions
│   │   │   ├── secrets.ts         # /api/v1/secrets
│   │   │   └── settings.ts        # /api/v1/settings
│   │   ├── ws/
│   │   │   └── handler.ts         # WebSocket connection handler, subscription management
│   │   ├── services/
│   │   │   ├── tmux.ts            # Thin wrapper: tmux CLI commands via execFile
│   │   │   ├── session-manager.ts # Session lifecycle, archive/revive logic
│   │   │   ├── extension-installer.ts # VSIX download from GitHub, install pipeline
│   │   │   ├── secret-store.ts    # AES-256-GCM encrypted storage on /data/secrets
│   │   │   ├── settings-store.ts  # Supervisor settings persistence
│   │   │   └── boot.ts            # First-boot detection, password setup, extension install
│   │   ├── schemas/               # Zod schemas for all API request/response types
│   │   │   ├── session.ts
│   │   │   ├── extension.ts
│   │   │   ├── secret.ts
│   │   │   └── common.ts
│   │   └── types.ts               # Shared TypeScript interfaces
│   └── test/
│       ├── routes/
│       │   ├── health.test.ts
│       │   ├── sessions.test.ts
│       │   └── extensions.test.ts
│       ├── services/
│       │   ├── tmux.test.ts
│       │   ├── session-manager.test.ts
│       │   └── secret-store.test.ts
│       └── helpers/
│           └── test-server.ts     # Fastify test server factory
├── config/
│   ├── product.json               # code-server branding
│   ├── settings.json              # VS Code default settings
│   └── default-extensions.json    # First-boot extension list (empty array for Phase 1)
├── entrypoint.sh                  # Container entrypoint: chown /data, exec as app user
├── first-boot/
│   └── setup.html                 # First-boot password creation page (served by supervisor)
├── docker-compose.yml             # Local dev: references Nix-built image
├── railway.toml                   # Railway deployment config
├── AGENTS.md
├── SPEC.md
└── README.md
```

### Pattern 1: Nix Multi-Derivation Build

**What:** Build the supervisor TypeScript in one Nix derivation, then compose the final container image in a separate derivation that layers the compiled supervisor with runtime dependencies.

**When to use:** Always. This is the Nix equivalent of Docker multi-stage builds.

**Example:**
```nix
# flake.nix (simplified)
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }: let
    system = "x86_64-linux";
    pkgs = nixpkgs.legacyPackages.${system};

    # Derivation 1: Build the supervisor
    supervisor = pkgs.buildNpmPackage {
      pname = "claudeos-supervisor";
      version = "0.1.0";
      src = ./supervisor;
      npmDepsHash = "sha256-XXXX"; # nix-prefetch for lockfile
      buildPhase = ''
        npx esbuild src/index.ts --bundle --platform=node --format=cjs \
          --outfile=dist/supervisor.cjs --external:@fastify/websocket
      '';
      installPhase = ''
        mkdir -p $out/bin
        cp dist/supervisor.cjs $out/bin/
      '';
    };

    # Derivation 2: Container image
    containerImage = pkgs.dockerTools.buildLayeredImage {
      name = "ghcr.io/aventre-labs/claudeos";
      tag = "latest";
      contents = [
        pkgs.nodejs_22
        pkgs.tmux
        pkgs.git
        pkgs.code-server
        pkgs.su-exec
        pkgs.coreutils
        pkgs.bash
        pkgs.cacert
        supervisor
      ];
      fakeRootCommands = ''
        mkdir -p ./data/extensions ./data/sessions ./data/secrets ./data/config
        mkdir -p ./app
        cp ${./config/product.json} ./app/product.json
        cp ${./config/settings.json} ./app/settings.json
        cp ${./config/default-extensions.json} ./app/default-extensions.json
        cp ${./entrypoint.sh} ./app/entrypoint.sh
        chmod +x ./app/entrypoint.sh
      '';
      config = {
        Entrypoint = [ "/app/entrypoint.sh" ];
        ExposedPorts = { "8080/tcp" = {}; "3100/tcp" = {}; };
        Env = [
          "NODE_ENV=production"
          "CLAUDEOS_DATA_DIR=/data"
        ];
        WorkingDir = "/app";
      };
    };
  in {
    packages.${system} = {
      default = supervisor;
      container = containerImage;
    };
    devShells.${system}.default = pkgs.mkShell {
      packages = [
        pkgs.nodejs_22
        pkgs.tmux
        pkgs.git
      ];
    };
  };
}
```

**Confidence:** MEDIUM -- Nix `buildNpmPackage` for the supervisor build and `dockerTools.buildLayeredImage` are well-documented patterns, but the exact combination with code-server, Claude Code installer, and su-exec in a single image needs hands-on validation. Claude Code installation via curl inside a Nix derivation requires a fixed-output derivation or a custom builder.

### Pattern 2: Entrypoint with Privilege Dropping

**What:** Container starts as root, chowns the /data volume (which Railway mounts as root-owned), then execs the supervisor as the `app` user using `su-exec`.

**When to use:** Always in the container entrypoint.

**Example:**
```bash
#!/bin/bash
set -e

# Ensure data directories exist and are owned by app user
chown -R app:app /data

# Drop privileges and exec supervisor
exec su-exec app node /app/supervisor.cjs
```

### Pattern 3: WebSocket Subscription for Session Events

**What:** Extensions connect to `ws://localhost:3100/api/v1/ws` and subscribe to specific sessions for output streaming, and/or receive broadcast status change events.

**When to use:** For all real-time session monitoring.

**Recommended message format:**
```typescript
// Client -> Server: Subscribe to a session's output
{ "type": "subscribe", "sessionId": "ses_abc123" }

// Client -> Server: Unsubscribe
{ "type": "unsubscribe", "sessionId": "ses_abc123" }

// Server -> Client: Session status changed (broadcast to all)
{ "type": "status", "sessionId": "ses_abc123", "status": "active", "timestamp": "..." }

// Server -> Client: Session output (only to subscribers)
{ "type": "output", "sessionId": "ses_abc123", "data": "...", "timestamp": "..." }
```

**Implementation pattern with @fastify/websocket:**
```typescript
import fastifyWebsocket from '@fastify/websocket';

// Register plugin
await fastify.register(fastifyWebsocket);

// Track subscriptions
const clients = new Map<WebSocket, Set<string>>(); // ws -> subscribed session IDs

fastify.get('/api/v1/ws', { websocket: true }, (socket, req) => {
  clients.set(socket, new Set());

  socket.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    const subs = clients.get(socket)!;
    if (msg.type === 'subscribe') subs.add(msg.sessionId);
    if (msg.type === 'unsubscribe') subs.delete(msg.sessionId);
  });

  socket.on('close', () => clients.delete(socket));
});

// Broadcast status to ALL connected clients
function broadcastStatus(sessionId: string, status: string) {
  for (const [ws] of clients) {
    ws.send(JSON.stringify({ type: 'status', sessionId, status, timestamp: new Date().toISOString() }));
  }
}

// Send output to SUBSCRIBED clients only
function sendOutput(sessionId: string, data: string) {
  for (const [ws, subs] of clients) {
    if (subs.has(sessionId)) {
      ws.send(JSON.stringify({ type: 'output', sessionId, data, timestamp: new Date().toISOString() }));
    }
  }
}
```

### Pattern 4: tmux Event-Driven Session Status Detection

**What:** Use tmux hooks to detect session lifecycle events and `pane-exited` for process completion, rather than polling `tmux list-sessions`.

**When to use:** Always for session status changes.

**Available tmux hooks (relevant subset):**
- `session-created` -- fires when a new tmux session is created
- `session-closed` -- fires when a tmux session is destroyed
- `pane-exited` -- fires when the process in a pane exits (Claude Code terminates)
- `pane-died` -- fires when a pane dies (process crashes)
- `after-send-keys` -- fires after send-keys command completes
- `client-session-changed` -- fires when client switches sessions

**Recommended approach:** Use tmux hooks that execute a script notifying the supervisor via HTTP:

```bash
# Set hooks when creating a session
tmux set-hook -t claudeos_ses_abc123 pane-exited \
  "run-shell 'curl -s -X POST http://localhost:3100/internal/session-event \
    -H \"Content-Type: application/json\" \
    -d \"{\\\"sessionId\\\": \\\"ses_abc123\\\", \\\"event\\\": \\\"exited\\\"}\"'"
```

**For output streaming:** Use `tmux pipe-pane` to stream pane output to a named pipe or file that the supervisor watches:

```bash
# Pipe pane output to a file the supervisor watches
tmux pipe-pane -t claudeos_ses_abc123 "cat >> /data/sessions/ses_abc123/live-output"
```

The supervisor watches the file with `fs.watch()` or `chokidar` and pushes new content to WebSocket subscribers.

**Confidence:** MEDIUM -- tmux hooks work well for lifecycle events. The `pipe-pane` approach for output streaming is proven but requires careful handling of the output file (rotation, cleanup). An alternative is periodic `capture-pane` triggered by tmux's `after-send-keys` hook, which is simpler but less real-time.

### Pattern 5: First-Boot Password Creation Flow

**What:** On first boot (no password stored), supervisor serves a minimal HTML form on :8080 instead of starting code-server. User creates password, supervisor generates random master encryption key, stores both, installs extensions, then starts code-server.

**When to use:** Only on first boot (detected by absence of password in /data/config/).

**Flow:**
```
Container Start
    |
    v
Supervisor boots, starts health API (:3100) with status: "initializing"
    |
    v
Check /data/config/auth.json exists?
    |
    ├── YES: Extract stored password, skip to extension check
    |
    └── NO (first boot):
        |
        v
        Serve first-boot HTML on :8080 (password form)
        Health API returns status: "setup"
            |
            v
        User submits password via POST /api/v1/setup
            |
            v
        Generate random 256-bit master encryption key
        Hash password with argon2 for storage
        Store { passwordHash, encryptionKey } in /data/config/auth.json
            |
            v
        Check default-extensions.json, install any listed extensions
        Health API returns status: "installing"
            |
            v
        Show "Launch ClaudeOS" button on setup page
        Health API returns status: "ready"
            |
            v
        User clicks "Launch ClaudeOS"
            |
            v
        Stop serving setup page on :8080
        Start code-server on :8080 with --auth password using stored password
        Health API returns status: "ok"
```

### Anti-Patterns to Avoid

- **Using CLAUDEOS_AUTH_TOKEN env var for auth:** User decided against this. Password created via first-boot setup page.
- **Polling tmux for session status:** User explicitly required event-driven. Use tmux hooks.
- **Building extensions from source in the container:** User decided pre-built VSIX from GitHub releases. Container does NOT need npm/build tools for extensions.
- **Using Dockerfile alongside Nix:** User decided Nix only. No Dockerfile in the repo.
- **Writing product.json inside code-server install directory:** Gets overwritten on updates. Copy to persistent location, reference via flag.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP server with routing | Custom http.createServer | Fastify 5 | Routing, validation, serialization, logging with zero overhead |
| WebSocket management | Raw ws server setup | @fastify/websocket | Shares Fastify's hooks, auth, and error handling |
| JSON schema validation | Manual if/else checks | Zod 4 + fastify-type-provider-zod | Type-safe validation with automatic error responses |
| Structured logging | console.log | Pino (via Fastify) | 5x faster than Winston, structured JSON for Railway log viewer |
| tmux process wrapper | Custom process spawning | child_process.execFile('tmux', [...]) | tmux CLI is stable, well-documented, no wrapper library needed |
| Container image build | Custom shell scripts | Nix dockerTools.buildLayeredImage | Reproducible, declarative, layered for efficient caching |
| Password hashing | crypto.createHash | argon2 (code-server uses it) or crypto.scryptSync | Proper KDF with salt, resistant to brute force |
| Encryption | Custom cipher code | Node.js crypto AES-256-GCM | Built-in, well-tested, standard API |
| VSIX packaging | Custom zip/packaging | @vscode/vsce | Official Microsoft tool, handles all edge cases |
| Privilege dropping | Custom uid/gid management | su-exec | 10KB, PID 1 passthrough, standard container pattern |

**Key insight:** The supervisor is infrastructure glue, not application logic. Every component it orchestrates (tmux, code-server, Fastify, Nix) is mature and well-documented. The value is in correct orchestration, not custom implementations.

## Common Pitfalls

### Pitfall 1: tmux send-keys Race Condition on Session Creation

**What goes wrong:** Creating a tmux session and immediately using `send-keys` to start Claude Code. The shell hasn't finished initializing, so keystrokes are dropped or garbled.
**Why it happens:** `tmux send-keys` is fire-and-forget with no readiness check. Shell init can take 200ms-2s.
**How to avoid:** Pass the Claude Code command as the tmux session's initial process: `tmux new-session -d -s NAME "claude --flags..."`. This bypasses shell init entirely.
**Warning signs:** Sessions show as created but Claude Code isn't running inside them.

### Pitfall 2: Docker Volume Permissions Mismatch on Railway

**What goes wrong:** Railway mounts persistent volumes as root. Non-root container user cannot write to /data.
**Why it happens:** Volume ownership is determined at mount time by the host, not the Dockerfile/Nix config.
**How to avoid:** Entrypoint script runs as root, `chown -R app:app /data`, then `exec su-exec app node supervisor.cjs`. Test this exact flow in CI.
**Warning signs:** EACCES errors in supervisor logs during first boot.

### Pitfall 3: code-server product.json Overwritten on Update

**What goes wrong:** Placing product.json inside code-server's install directory. Gets overwritten when code-server updates.
**Why it happens:** code-server's install directory is managed by the package manager.
**How to avoid:** Store product.json on the persistent volume or in the Nix image at a separate path. Reference via environment variable or startup flag. code-server's `$EXTENSIONS_GALLERY` env var handles the marketplace config portion.
**Warning signs:** ClaudeOS branding disappears after code-server update.

### Pitfall 4: Extension Install Leaves Broken State

**What goes wrong:** VSIX download fails mid-install, or code-server --install-extension fails, leaving per-extension tracking in an inconsistent state.
**Why it happens:** Network failures, malformed VSIX, version incompatibility.
**How to avoid:** Per-extension install tracking with states: "pending", "downloading", "installing", "installed", "failed". On next boot, only retry "pending", "downloading", or "failed" extensions. Validate VSIX file exists and is a valid zip before passing to code-server.
**Warning signs:** Extensions missing after boot despite first-boot having run.

### Pitfall 5: Claude Code Memory Leaks in Long Sessions

**What goes wrong:** Claude Code heap grows to 16+ GB over time, causing OOM kills that take down the entire container.
**Why it happens:** Known upstream issue with Claude Code accumulating API stream buffers.
**How to avoid:** Set `tmux set-option -g history-limit 5000`. Monitor session RSS via `ps`. Expose memory metrics in health endpoint. Document that users should archive long-running sessions.
**Warning signs:** Container restarts without clear cause (OOM killer).

### Pitfall 6: Nix dockerTools.buildLayeredImage Requires Linux

**What goes wrong:** Developers on macOS cannot build the container image locally because `dockerTools` produces Linux images and some operations require Linux-specific syscalls.
**Why it happens:** OCI images target Linux. Nix cross-compilation to Linux from macOS works for most things but `fakeRootCommands` may have limitations.
**How to avoid:** Use `nix build .#container --system x86_64-linux` with a remote Linux builder (NixOS VM, CI). Document this requirement clearly. Alternatively, use `buildLayeredImage` without `runAsRoot` (use `fakeRootCommands` instead, which works cross-platform).
**Warning signs:** Build fails on macOS with "unsupported system" or fakeroot errors.

## Code Examples

### Supervisor Boot Sequence

```typescript
// supervisor/src/index.ts
import { buildServer } from './server.js';
import { BootService } from './services/boot.js';

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const dataDir = process.env.CLAUDEOS_DATA_DIR || '/data';

  const server = await buildServer({ dataDir, isDryRun });

  // Health endpoint available immediately
  await server.listen({ port: 3100, host: '0.0.0.0' });
  server.log.info('Supervisor API listening on :3100');

  if (isDryRun) {
    server.log.info('Dry-run mode: skipping code-server and tmux');
    return;
  }

  const boot = new BootService(dataDir, server.log);

  // First-boot: serve setup page, wait for password creation
  if (!boot.isConfigured()) {
    server.log.info('First boot detected. Serving setup page on :8080');
    await boot.serveSetupPage(8080); // blocks until user submits password
  }

  // Install extensions (blocking, fail-fast)
  await boot.installExtensions();

  // Start code-server with stored password
  const password = boot.getStoredPassword();
  await boot.startCodeServer({
    port: Number(process.env.PORT) || 8080,
    password,
    productJsonPath: '/app/product.json',
    settingsJsonPath: '/app/settings.json',
  });

  server.log.info('ClaudeOS boot complete');
}

main().catch((err) => {
  console.error('Fatal boot error:', err);
  process.exit(1);
});
```

### tmux Session Manager

```typescript
// supervisor/src/services/tmux.ts
import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

export class TmuxService {
  async createSession(id: string, command: string, workdir?: string): Promise<void> {
    const sessionName = `claudeos_${id}`;
    const args = ['new-session', '-d', '-s', sessionName, '-x', '200', '-y', '50'];
    if (workdir) args.push('-c', workdir);
    args.push(command);  // Pass command as initial process -- avoids send-keys race
    await exec('tmux', args);

    // Set hooks for event-driven status updates
    await this.setSessionHooks(id, sessionName);
  }

  private async setSessionHooks(id: string, sessionName: string): Promise<void> {
    // Notify supervisor when pane process exits
    await exec('tmux', [
      'set-hook', '-t', sessionName, 'pane-exited',
      `run-shell "curl -s -X POST http://localhost:3100/internal/session-event -H 'Content-Type: application/json' -d '{\"sessionId\":\"${id}\",\"event\":\"exited\"}'"`,
    ]);

    // Enable output piping for real-time streaming
    await exec('tmux', [
      'pipe-pane', '-t', sessionName,
      `cat >> /data/sessions/${id}/live-output`,
    ]);
  }

  async sendKeys(id: string, text: string): Promise<void> {
    await exec('tmux', ['send-keys', '-t', `claudeos_${id}`, text, 'Enter']);
  }

  async capturePane(id: string, scrollback = false): Promise<string> {
    const args = ['capture-pane', '-t', `claudeos_${id}`, '-p'];
    if (scrollback) args.push('-S', '-1000');
    const { stdout } = await exec('tmux', args);
    return stdout;
  }

  async killSession(id: string): Promise<string> {
    // Capture scrollback before killing (locked decision)
    const scrollback = await this.capturePane(id, true);
    await exec('tmux', ['kill-session', '-t', `claudeos_${id}`]);
    return scrollback;
  }

  async stopSession(id: string): Promise<void> {
    // Send Ctrl+C interrupt
    await exec('tmux', ['send-keys', '-t', `claudeos_${id}`, 'C-c', '']);
  }

  async listSessions(): Promise<string[]> {
    try {
      const { stdout } = await exec('tmux', [
        'list-sessions', '-F', '#{session_name}',
      ]);
      return stdout.trim().split('\n').filter(s => s.startsWith('claudeos_'));
    } catch {
      return []; // No tmux server running
    }
  }
}
```

### Secret Store with AES-256-GCM

```typescript
// supervisor/src/services/secret-store.ts
import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

interface SecretEntry {
  name: string;
  value: string;  // encrypted
  iv: string;     // hex
  authTag: string; // hex
  category?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export class SecretStore {
  private encryptionKey: Buffer;
  private filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'secrets', 'secrets.json');
    const keyPath = path.join(dataDir, 'config', 'auth.json');

    if (!existsSync(keyPath)) {
      throw new Error('Master encryption key not found. First-boot setup incomplete.');
    }

    const auth = JSON.parse(readFileSync(keyPath, 'utf-8'));
    this.encryptionKey = Buffer.from(auth.encryptionKey, 'hex');
  }

  encrypt(plaintext: string): { encrypted: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(12); // 96 bits for GCM -- unique per operation
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex'),
    };
  }

  decrypt(encrypted: string, ivHex: string, authTagHex: string): string {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
```

### Vitest Configuration

```typescript
// supervisor/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 30000, // tmux integration tests may take time
    hookTimeout: 10000,
  },
});
```

### Extension Template package.json

```json
{
  "name": "claudeos-EXTENSION_NAME",
  "displayName": "ClaudeOS EXTENSION_DISPLAY_NAME",
  "description": "EXTENSION_DESCRIPTION",
  "publisher": "claudeos",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "keywords": ["claudeos-extension"],
  "repository": {
    "type": "git",
    "url": "https://github.com/aventre-labs/claudeos-EXTENSION_NAME"
  },
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "scripts": {
    "compile": "esbuild src/extension.ts --bundle --platform=node --format=cjs --outfile=out/extension.js --external:vscode",
    "watch": "npm run compile -- --watch",
    "package": "vsce package --no-dependencies",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "contributes": {},
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "typescript": "~5.8.0",
    "esbuild": "^0.27.0",
    "@vscode/vsce": "^3.7.0",
    "vitest": "^4.0.0"
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Claude Code via `npm install -g @anthropic-ai/claude-code` | Claude Code via `curl -fsSL https://claude.ai/install.sh \| bash` | 2025-2026 | npm install deprecated. Native installer auto-updates, no Node.js required. In Nix container, use curl installer. |
| Dockerfile for container builds | Nix dockerTools.buildLayeredImage | User decision (Phase 1) | Reproducible builds, layered caching, no Docker daemon needed for build |
| CLAUDEOS_AUTH_TOKEN env var for auth | User-created password via first-boot setup page | User decision (Phase 1) | Better UX, separate encryption key from auth credential |
| Build extensions from source in container | Pre-built VSIX from GitHub release assets | User decision (Phase 1) | Faster installs, no build tools in container, simpler pipeline |
| Polling tmux for session status | Event-driven via tmux hooks | User decision (Phase 1) | Lower CPU, instant status updates, no polling interval lag |
| Zod 3 | Zod 4 | 2025 | 6.5x faster object validation, smaller bundle |
| fastify-type-provider-zod 3.x | fastify-type-provider-zod 4.x | 2025-2026 | Zod 4 support via zod/v4/core API |

**Deprecated/outdated:**
- `npm install -g @anthropic-ai/claude-code`: Use curl installer instead
- `node-tmux` npm package: Unmaintained, use direct CLI calls
- Webpack for VS Code extensions: Use esbuild (VS Code official recommendation)
- Zod 3: Use Zod 4 (6.5x faster, stable)

## Open Questions

1. **Claude Code installation in Nix derivation**
   - What we know: Claude Code's recommended install is `curl -fsSL https://claude.ai/install.sh | bash`. Nix derivations are sandboxed and don't have network access during build.
   - What's unclear: Whether Claude Code can be packaged as a Nix derivation using `fetchurl` + manual unpacking, or whether it needs to be installed at container runtime (first boot).
   - Recommendation: Attempt a fixed-output derivation that fetches the Claude Code binary. If that fails, install Claude Code in the entrypoint script on first boot and cache the installation on the persistent volume. Document both approaches.

2. **code-server product.json application method**
   - What we know: code-server reads product.json from its install directory. The `$EXTENSIONS_GALLERY` env var handles marketplace config.
   - What's unclear: Whether code-server 4.x supports a `--product` flag or env var to specify an external product.json path for full branding (not just gallery).
   - Recommendation: Test empirically. If no flag exists, symlink or copy product.json into code-server's install directory as part of the Nix image build. This is safe in Nix because the entire image is rebuilt (no in-place update concern).

3. **tmux pipe-pane performance under heavy Claude Code output**
   - What we know: Claude Code generates 4,000-6,700 scroll events/second during active work.
   - What's unclear: Whether piping all output to a file and using fs.watch creates unacceptable I/O pressure.
   - Recommendation: Start with `pipe-pane` + fs.watch. If performance is a problem, switch to periodic `capture-pane` on a short interval (500ms) triggered by session activity, or use an in-memory circular buffer.

4. **Nix su-exec package availability**
   - What we know: su-exec is commonly used in Alpine containers. gosu is the Debian equivalent.
   - What's unclear: Whether nixpkgs has `su-exec` packaged, or whether `gosu` should be used instead.
   - Recommendation: Check `nix search nixpkgs su-exec` and `nix search nixpkgs gosu`. If neither is available, use a simple shell approach: `exec setpriv --reuid=app --regid=app --init-groups node supervisor.cjs`. `setpriv` is in `util-linux` which is definitely in nixpkgs.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | supervisor/vitest.config.ts |
| Quick run command | `cd supervisor && npx vitest run --reporter=dot` |
| Full suite command | `cd supervisor && npx vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUP-01 | Supervisor boots code-server with branding | integration | `npx vitest run test/services/boot.test.ts -t "boots code-server"` | Wave 0 |
| SUP-02 | Session CRUD API | unit+integration | `npx vitest run test/routes/sessions.test.ts` | Wave 0 |
| SUP-03 | Send input via tmux send-keys | integration | `npx vitest run test/services/tmux.test.ts -t "sendKeys"` | Wave 0 |
| SUP-04 | Capture output via tmux capture-pane | integration | `npx vitest run test/services/tmux.test.ts -t "capturePane"` | Wave 0 |
| SUP-05 | Archive session | unit+integration | `npx vitest run test/services/session-manager.test.ts -t "archive"` | Wave 0 |
| SUP-06 | Revive archived session | unit+integration | `npx vitest run test/services/session-manager.test.ts -t "revive"` | Wave 0 |
| SUP-07 | Extension install pipeline | unit+integration | `npx vitest run test/routes/extensions.test.ts` | Wave 0 |
| SUP-08 | First-boot extension auto-install | integration | `npx vitest run test/services/boot.test.ts -t "extensions"` | Wave 0 |
| SUP-09 | Health check endpoint | unit | `npx vitest run test/routes/health.test.ts` | Wave 0 |
| DEP-01 | Container builds successfully (Nix) | smoke | `nix build .#container` | Wave 0 |
| DEP-02 | Container contains all required binaries | smoke | `docker run --rm IMAGE sh -c "node --version && tmux -V && git --version && code-server --version"` | Wave 0 |
| DEP-03 | Persistent volume directories exist | smoke | `docker run --rm -v /tmp/test-data:/data IMAGE ls -la /data/` | Wave 0 |
| DEP-04 | code-server authenticates with password | manual-only | Manual: first-boot flow creates password, code-server login works | N/A |
| DEP-05 | Railway deployment works | manual-only | Manual: push to GHCR, Railway pulls and starts | N/A |
| DEP-06 | docker-compose.yml works | smoke | `docker compose up -d && curl localhost:3100/api/v1/health && docker compose down` | Wave 0 |
| DEP-07 | Entrypoint chowns /data and drops privileges | smoke | `docker run --rm IMAGE whoami` should output "app" | Wave 0 |
| TPL-01 | Extension template scaffold exists | unit | Check file existence: package.json, tsconfig.json, src/extension.ts, AGENTS.md | Wave 0 |
| TPL-02 | Template includes optional directories | unit | Check directory existence: webview/, mcp-server/ | Wave 0 |
| TPL-03 | Template scripts work | smoke | `cd template && npm install && npm run compile && npm run package` | Wave 0 |
| TPL-04 | Template AGENTS.md content | unit | Check AGENTS.md contains required sections | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd supervisor && npx vitest run --reporter=dot`
- **Per wave merge:** `cd supervisor && npx vitest run`
- **Phase gate:** Full suite green + container smoke tests pass before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `supervisor/vitest.config.ts` -- Vitest configuration
- [ ] `supervisor/test/helpers/test-server.ts` -- Fastify test server factory (inject pattern)
- [ ] `supervisor/test/routes/health.test.ts` -- covers SUP-09
- [ ] `supervisor/test/routes/sessions.test.ts` -- covers SUP-02
- [ ] `supervisor/test/services/tmux.test.ts` -- covers SUP-03, SUP-04 (requires tmux installed)
- [ ] `supervisor/test/services/session-manager.test.ts` -- covers SUP-05, SUP-06
- [ ] Framework install: `cd supervisor && npm install` -- if not yet initialized

## Sources

### Primary (HIGH confidence)
- [nixpkgs dockerTools API reference](https://ryantm.github.io/nixpkgs/builders/images/dockertools/) -- buildImage, buildLayeredImage parameters and examples
- [nix.dev Docker image building tutorial](https://nix.dev/tutorials/nixos/building-and-running-docker-images.html) -- basic Nix OCI image patterns
- [code-server FAQ](https://coder.com/docs/code-server/FAQ) -- authentication, extension installation, marketplace configuration
- [tmux manual page](https://man7.org/linux/man-pages/man1/tmux.1.html) -- hooks, capture-pane, pipe-pane, send-keys
- [tmux hooks GitHub issue #1083](https://github.com/tmux/tmux/issues/1083) -- complete list of available hooks
- [Claude Code setup documentation](https://code.claude.com/docs/en/setup) -- curl installer, npm deprecated
- [Fastify 5 migration guide](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/) -- Fastify 5 changes
- [@fastify/websocket npm](https://www.npmjs.com/package/@fastify/websocket) -- v11.2.0, WebSocket plugin for Fastify

### Secondary (MEDIUM confidence)
- [NixOS Discourse: non-root user in Nix Docker images](https://discourse.nixos.org/t/how-to-add-a-non-root-user-when-building-a-docker-image-with-nix/22883) -- shadowSetup, fakeRootCommands patterns
- [NixOS Discourse: chown with buildLayeredImage](https://discourse.nixos.org/t/how-to-run-chown-for-docker-image-built-with-streamlayeredimage-or-buildlayeredimage/11977) -- fakeRootCommands approach
- [Railway deploying from GHCR](https://dev.to/adamp78/why-i-deploy-to-railway-using-github-container-registry-instead-of-native-builds-54cb) -- railway.toml image config
- [Railway private registries docs](https://docs.railway.com/builds/private-registries) -- GHCR integration
- [fastify-type-provider-zod Zod 4 PR](https://github.com/turkerdev/fastify-type-provider-zod/pull/176) -- Zod v4 support
- [Fastify WebSocket broadcast pattern](https://github.com/fastify/help/issues/589) -- client tracking and broadcasting
- [NixOS Wiki: code-server package](https://mynixos.com/nixpkgs/package/code-server) -- code-server in nixpkgs

### Tertiary (LOW confidence)
- [Claude Code memory leak issues](https://github.com/anthropics/claude-code/issues/22188) -- 93GB heap, upstream acknowledged
- [Claude Code send-keys race condition](https://github.com/anthropics/claude-code/issues/23513) -- documented but may be fixed in newer versions
- Nix + Claude Code installation: No established pattern found. Needs hands-on validation.
- su-exec/gosu in nixpkgs: Not verified. May need setpriv from util-linux instead.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Fastify 5, Zod 4, Vitest 4, esbuild, TypeScript 5.8 are all verified current and stable
- Architecture: HIGH for supervisor patterns, MEDIUM for Nix container build (novel combination, needs validation)
- Pitfalls: HIGH -- tmux race condition, Railway volume permissions, and extension install fragility are well-documented
- Nix integration: MEDIUM -- dockerTools API is stable but combining code-server + Claude Code installer + Node.js in a single Nix image is novel
- First-boot flow: MEDIUM -- pattern is sound but the exact code-server auth handoff (supervisor serves :8080, then hands off to code-server on :8080) needs careful implementation

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (30 days -- stack is stable, Nix ecosystem moves slowly)
