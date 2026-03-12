# Pitfalls Research

**Domain:** Browser-accessible AI agent OS -- code-server wrapper with tmux session management, supervisor process, and VS Code extension system
**Researched:** 2026-03-11
**Confidence:** HIGH (verified across official docs, GitHub issues, and community reports)

## Critical Pitfalls

### Pitfall 1: tmux send-keys Race Condition on Session Creation

**What goes wrong:**
When creating a new Claude Code session, the supervisor creates a tmux session and immediately sends the `claude` command via `tmux send-keys`. The shell inside the new tmux pane has not finished initializing (loading `.zshrc`, `.bashrc`, plugins, etc.), so the keystrokes are either silently dropped or arrive garbled. At scale (4+ concurrent session creates), `send-keys` produces corrupted commands like `mmcd` instead of `cd`. The session appears created but Claude Code never actually starts.

**Why it happens:**
`tmux send-keys` is fire-and-forget with no readiness check. Shell initialization (especially zsh with plugins) can take 200ms-2s. There is no built-in tmux mechanism to wait for shell readiness. This exact issue is documented in [claude-code#23513](https://github.com/anthropics/claude-code/issues/23513) -- the same race condition that affects Claude Code's own team agent spawning.

**How to avoid:**
Use `tmux new-session -d -s NAME "claude --flags..."` or `tmux new-window "claude --flags..."` to pass the command as the pane's initial process, bypassing shell initialization entirely. The command runs directly as the pane's shell, so there is no race. If you must use `send-keys` (e.g., for sending follow-up user input), poll for shell readiness first by checking `tmux capture-pane` output for a prompt character, or insert a small delay (200-500ms) after pane creation.

**Warning signs:**
- Sessions show as "created" in the API but Claude Code is not running inside them
- Intermittent failures that only appear under concurrent session creation
- Test suite passes in isolation but fails when tests run in parallel

**Phase to address:**
Phase 1 (Supervisor + Session API). This is foundational -- get session creation right before building anything on top of it.

---

### Pitfall 2: Claude Code Memory Leaks and Scrollback Buffer Degradation in Long-Running Sessions

**What goes wrong:**
Claude Code exhibits severe performance degradation in long-running tmux sessions. Heap allocations can grow to 16+ GB (one report: 93 GB), scroll events fire at 4,000-6,700/second causing UI jitter, and after a few thousand lines of scrollback the session becomes unusable. In a container with limited memory (Railway default: 8GB), this causes OOM kills that take down the entire ClaudeOS instance, not just the offending session.

**Why it happens:**
Claude Code accumulates API stream buffers, agent context, and skill state that are not fully released after use. The tmux scrollback buffer compounds this by retaining all historical output. This is a known upstream issue documented across multiple Claude Code GitHub issues ([#4851](https://github.com/anthropics/claude-code/issues/4851), [#10881](https://github.com/anthropics/claude-code/issues/10881), [#22188](https://github.com/anthropics/claude-code/issues/22188), [#27421](https://github.com/anthropics/claude-code/issues/27421)). Anthropic has shipped improvements but the problem is not fully resolved.

**How to avoid:**
1. Set tmux scrollback limits: `set-option -g history-limit 5000` (default is 2000, but Claude Code's rapid output can fill this fast).
2. Implement session health monitoring in the supervisor: poll `ps` for RSS memory of each Claude Code process and expose it in the session API.
3. Add automatic archival -- when a session's memory exceeds a threshold (e.g., 2GB RSS), warn the user via the sessions extension and offer to archive/restart.
4. Do NOT set `--max-old-space-size` in the container -- let Node.js detect the container memory limit automatically (Railway-specific recommendation).
5. Consider periodic `tmux clear-history` on idle sessions to reclaim scrollback memory.

**Warning signs:**
- Container restarts without clear cause (check `dmesg` for OOM killer)
- Users reporting "sessions getting slower over time"
- Supervisor health endpoint showing increasing memory usage

**Phase to address:**
Phase 1 (Supervisor) for basic monitoring, Phase 2 (Sessions extension) for user-facing health indicators and auto-archive suggestions.

---

### Pitfall 3: Extension Installation Requires Window Reload -- Disrupting All Active Sessions

**What goes wrong:**
When the supervisor installs a VSIX via `code-server --install-extension`, the extension files are placed on disk but code-server does not hot-load them. A window reload is required. Reloading the code-server window disconnects all open terminal tabs -- meaning every active Claude Code session terminal view drops its connection. Users lose their terminal scroll position and any in-progress interaction is interrupted. The terminal tabs reconnect after reload, but the UX is jarring and can cause users to lose context.

**Why it happens:**
VS Code's extension system was designed for desktop use where a window reload is a minor annoyance (sub-second). In code-server's browser context, a reload means a full page refresh. Terminal tabs are VS Code pseudo-terminals backed by real processes -- the processes survive but the terminal UI state (scroll position, selection) is lost.

**How to avoid:**
1. Batch extension installations during first boot (before any user sessions exist) -- this is already in the spec and is correct.
2. For runtime installations, show a clear confirmation dialog: "Installing this extension requires reloading the window. All terminal views will be briefly disconnected. Claude Code sessions will continue running in the background."
3. Store terminal scroll positions in extension state before triggering reload, and restore them after.
4. Never auto-reload. Always let the user choose when to reload (they may want to finish a Claude Code interaction first).
5. Consider a "pending extensions" queue that installs and activates on the next natural page load.

**Warning signs:**
- Users complaining about "lost terminal sessions" after installing extensions
- Extension install tests that don't verify terminal tab survival
- Automated install flows that trigger reload without user consent

**Phase to address:**
Phase 2 (Self-Improve extension / Extension Manager UI). The UX of runtime extension installation must be carefully designed.

---

### Pitfall 4: Docker Volume Permissions Mismatch on Railway

**What goes wrong:**
Railway mounts persistent volumes as root. If the Dockerfile uses a non-root user (which it should for security), the container process cannot write to `/data/extensions/`, `/data/secrets/`, or `/data/sessions/`. The supervisor boots, tries to write the `.claudeos-initialized` marker or install extensions, and fails silently or crashes. On Railway specifically, down-sizing volumes is not supported, and redeployments cause downtime because Railway prevents multiple active deployments from mounting the same volume.

**Why it happens:**
Docker volume ownership is determined at mount time by the host (Railway infrastructure), not by the Dockerfile. The `chown` in the Dockerfile applies to the image layer, not to the mounted volume. This affects every Node.js-on-Railway deployment but is especially painful for ClaudeOS because the extension installer, session archiver, and secret store all need write access.

**How to avoid:**
1. Use an entrypoint script (not Dockerfile `RUN`) that runs as root, `chown`s the `/data` directory to the app user, then `exec`s the supervisor as the app user via `gosu` or `su-exec`.
2. Test the exact Railway volume mount behavior in CI -- do not assume Docker Compose local behavior matches Railway.
3. Add a startup check in the supervisor that verifies write access to all required directories and fails fast with a clear error message if permissions are wrong.
4. Document the Railway volume permissions requirement in deployment docs.

**Warning signs:**
- "Works locally but not on Railway" -- the classic volume permissions symptom
- `EACCES` errors in supervisor logs during first boot
- Extensions directory empty after deployment despite first-boot running

**Phase to address:**
Phase 1 (Dockerfile/Container setup). Must be correct before anything else works in production.

---

### Pitfall 5: Inter-Extension API Activation Order and Timing

**What goes wrong:**
Extension B depends on Extension A's exported API (e.g., `claudeos-sessions` depends on `claudeos-secrets` for API key access). Extension B calls `vscode.extensions.getExtension('claudeos.claudeos-secrets')` and gets the extension object, but `.exports` is `undefined` because Extension A hasn't finished activating yet. Extension B then crashes or silently operates without secrets. Worse: this is intermittent -- it works most of the time because Extension A usually activates first, but under load or after a cold start, the order flips.

**Why it happens:**
`getExtension()` returns the extension descriptor immediately, but `.exports` is only populated after `activate()` resolves. Using `extensionDependencies` in `package.json` guarantees activation *order* but not that the dependency's `activate()` has *completed* by the time the dependent runs. The VS Code docs explicitly warn: "the public API exported by this extension is an invalid action to access before this extension has been activated."

**How to avoid:**
1. Always call `await extension.activate()` before accessing `.exports`, even if `extensionDependencies` is set. This is idempotent -- if already activated, it returns immediately.
2. Create a standard pattern in the extension template:
   ```typescript
   async function getSecretsAPI(): Promise<SecretsAPI | undefined> {
     const ext = vscode.extensions.getExtension('claudeos.claudeos-secrets');
     if (!ext) return undefined;
     if (!ext.isActive) await ext.activate();
     return ext.exports;
   }
   ```
3. Put this utility pattern in the extension template's `AGENTS.md` so Claude Code generates it correctly when building new extensions.
4. For optional dependencies, always check `isActive` before accessing exports and degrade gracefully.

**Warning signs:**
- Intermittent "cannot read property of undefined" errors on extension startup
- Extensions that work after a manual reload but not on first cold boot
- Test suite that mocks extension APIs but never tests activation ordering

**Phase to address:**
Phase 2 (Extension template and first-party extensions). Bake the correct pattern into the template before any extensions are built.

---

### Pitfall 6: MCP Server Lifecycle Mismanagement -- Orphaned Servers and Config Pollution

**What goes wrong:**
Extensions that bundle MCP servers (like `claudeos-self-improve`) register them by writing to Claude Code's `~/.claude.json` on activation. But deactivation is unreliable -- VS Code can kill extensions without calling `deactivate()` (on crash, OOM, or forced window close). The MCP server entry persists in the config but the server process is dead. Next time Claude Code starts a session, it tries to connect to the dead MCP server, fails, and either shows cryptic errors or silently loses tool access. Over time, the config file accumulates dead entries. Additionally, Claude Code issue [#7936](https://github.com/anthropics/claude-code/issues/7936) documents that MCP servers can persist in the `/mcp` command output even after removal via `claude mcp remove`.

**Why it happens:**
VS Code's extension lifecycle does not guarantee `deactivate()` runs. The MCP config file is a shared global resource with no locking or ownership tracking. Multiple extensions writing to the same config file can cause race conditions. Claude Code's own MCP removal is scope-dependent (global vs. project) and can leave orphaned entries.

**How to avoid:**
1. Use the `claude mcp add` / `claude mcp remove` CLI commands instead of directly writing JSON -- this is the stable public API.
2. Scope MCP servers to the project level (not global) so they are tied to a specific workspace.
3. On extension activation, always clean up stale entries first: check if the MCP server process is actually running before assuming the config entry is valid.
4. Implement a health check in the supervisor that periodically validates MCP server entries against running processes.
5. Use `disposable` patterns in the extension for cleanup, but do NOT rely on them as the sole cleanup mechanism.

**Warning signs:**
- Users reporting "tool not found" errors in Claude Code sessions
- Growing list of MCP servers in `claude mcp list` that are not actually running
- Multiple extensions fighting over the same config file entries

**Phase to address:**
Phase 3 (MCP server extensions like self-improve). Solve the lifecycle problem before shipping any MCP-server-bundling extensions.

---

### Pitfall 7: VSIX Build Pipeline Fragility in the Extension Installer

**What goes wrong:**
The supervisor's extension installer clones a GitHub repo, runs `npm install && npm run package`, and installs the resulting VSIX. This pipeline has multiple failure modes: (a) `vsce package` fails with cryptic errors if the extension uses pnpm or yarn workspaces, (b) `npm install` can fail due to native dependencies that need build tools not in the container, (c) the build produces no VSIX or a malformed one, (d) network failures during npm install leave a half-installed state. The installer reports "extension installed" but code-server shows nothing.

**Why it happens:**
`vsce package` uses `npm list --production --parseable --depth=99999` internally, which breaks under non-npm package managers. Extension authors may use pnpm or yarn without realizing the ClaudeOS installer uses npm. Native dependencies (like `esbuild` or `node-gyp` modules) need build toolchains that may not be in the container image.

**How to avoid:**
1. Standardize on npm in the extension template and document it as a requirement in AGENTS.md.
2. Include build tools in the container image: `build-essential`, `python3` (for node-gyp), `git`.
3. Recommend extensions use esbuild bundling with `vsce package --no-dependencies` so npm install issues don't affect the VSIX.
4. Add robust error handling to the installer: check that the VSIX file actually exists after build, validate it has a valid `package.json`, and report clear errors on failure.
5. Implement a build timeout (60s) to prevent hung builds from blocking the installer.
6. Consider supporting pre-built VSIX downloads from GitHub Releases as an alternative to building from source.

**Warning signs:**
- Extension install succeeds in the API response but extension doesn't appear in code-server
- Build errors mentioning `npm ERR! missing:` or `Unknown type: undefined`
- Extension template tests that don't test the full clone-build-install pipeline

**Phase to address:**
Phase 1 (Extension Installer in supervisor). The installer must be robust because every feature depends on it.

---

### Pitfall 8: Secret Encryption Key Derived Directly from Auth Token Without Proper KDF

**What goes wrong:**
The spec says secrets are "encrypted at rest using a key derived from the `CLAUDEOS_AUTH_TOKEN` environment variable." If the implementation uses the auth token directly as the AES key (or uses a simple hash like SHA-256 without a salt), the encryption is vulnerable to: (a) rainbow table attacks if the auth token is short/weak, (b) deterministic ciphertext (same plaintext always produces the same ciphertext if IV reuse occurs), (c) key compromise if the auth token leaks (it's also used for HTTP auth, so it's transmitted in every request).

**Why it happens:**
Developers often use `crypto.createHash('sha256').update(password).digest()` as the "key derivation" step, which is fast and unsalted. The dual use of `CLAUDEOS_AUTH_TOKEN` for both HTTP authentication and encryption key derivation means the key material is exposed in network traffic (even over HTTPS, it's in the request body/headers).

**How to avoid:**
1. Use PBKDF2 with HMAC-SHA256, at least 600,000 iterations (OWASP 2023 recommendation), and a random 128-bit salt stored alongside the encrypted secrets file.
2. Generate a separate encryption key on first boot (random 256-bit key), encrypt IT with the PBKDF2-derived key from the auth token, and use the random key for all secret encryption. This adds a layer of indirection -- changing the auth token only requires re-encrypting one key, not all secrets.
3. Generate a unique IV (96 bits for GCM) for every encryption operation -- never reuse IVs.
4. Store the salt, IV, and auth tag alongside each ciphertext in a structured format.
5. Consider using a separate `CLAUDEOS_ENCRYPTION_KEY` environment variable if splitting auth from encryption is feasible.

**Warning signs:**
- Implementation uses `crypto.createHash` instead of `crypto.pbkdf2`
- No salt visible in the secrets file format
- Auth token visible in code-server config or logs

**Phase to address:**
Phase 2 (Secrets extension). Must be correct before any secrets are stored, as changing the encryption scheme later requires migration.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Polling `tmux list-sessions` for session status instead of event-driven updates | Simple to implement, no IPC complexity | CPU waste, stale state between polls, 1-2s update lag in UI | MVP only. Replace with file-watch or tmux hooks (`after-new-session`, `session-closed`) in Phase 2 |
| Storing all session metadata in individual JSON files | No database dependency, simple reads | File system becomes slow with 100+ sessions, no query capability, no atomic updates | Acceptable for v1. Revisit if session count grows or search is needed |
| Running `code-server --install-extension` as a shell command | Works, simple subprocess call | No progress feedback, no structured error output, timeout behavior unclear | Acceptable if wrapped with proper error handling and timeouts |
| Using `onStartupFinished` for all extension activation | Extensions always load, simple | Slows startup as extension count grows, wastes memory for unused extensions | Acceptable for the 5 default extensions. Reconsider when supporting 20+ extensions |
| Single `localhost:3100` API without authentication | No auth overhead for internal calls | Any extension can call any API endpoint, no audit trail, no rate limiting | Acceptable while all extensions are first-party. Add API keys when third-party extensions are supported |

## Integration Gotchas

Common mistakes when connecting ClaudeOS components.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| code-server + product.json | Editing product.json inside the code-server install directory (overwritten on updates) | Copy product.json to a persistent location, use `--product` flag or environment variable to point code-server to it |
| tmux + Claude Code terminal rendering | Not accounting for Claude Code's 4,000-6,700 scroll events/second causing flickering | Set `set -g default-terminal "tmux-256color"` and ensure synchronized output support. Test with actual Claude Code output, not simple echo commands |
| Extension VSIX + code-server version | Building VSIX against `@types/vscode` version newer than what code-server ships | Pin `engines.vscode` in extension template to the minimum version code-server supports. Check code-server's bundled VS Code version and document it |
| Supervisor + code-server lifecycle | Starting code-server as a detached background process and not monitoring it | Spawn code-server as a child process, pipe stdout/stderr to the supervisor's logger, restart on crash with exponential backoff (max 5 retries, then fail loudly) |
| Claude Code CLI + MCP config | Writing directly to `~/.claude.json` (can be overwritten by Claude Code itself) | Use `claude mcp add` / `claude mcp remove` CLI commands. These are the stable API. Direct JSON manipulation is an implementation detail that can change |
| Extension + Supervisor API | Hardcoding `http://localhost:3100` in extension code | Expose the supervisor URL via VS Code configuration (settings.json default) so it can be overridden. Use a constant in the extension template |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Capturing full tmux scrollback on every `/api/sessions/:id/output` call | Endpoint takes 5+ seconds to respond, high CPU usage | Only capture visible pane content by default. Add `?scrollback=true` opt-in parameter. Use `tmux capture-pane -p` (visible only) vs `-p -S -` (full history) | 10+ concurrent sessions with 5000+ lines each |
| Spawning a new `git clone` + `npm install` + `npm run package` process for every extension install | Extension installs take 30-60s, block the supervisor API thread | Run builds in a worker thread or subprocess. Add a build queue. Cache `node_modules` across builds of the same extension | 3+ extensions installing simultaneously |
| Every extension polling the supervisor API for session status | Supervisor API overwhelmed with requests, each extension polling independently at different intervals | Implement Server-Sent Events (SSE) or WebSocket on the supervisor for session status changes. Extensions subscribe once and get push updates | 10+ extensions, each polling every 2s = 5+ requests/second continuously |
| Storing archived session scrollback as raw text files | Disk usage grows unbounded, archived session list loads slowly | Compress archived scrollback (gzip). Set a retention policy. Paginate the archive list API | 50+ archived sessions with full scrollback |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Supervisor API on `localhost:3100` accessible from webview iframes | Webview content (especially user-generated or from untrusted extensions) can make `fetch()` calls to the supervisor API, creating/killing sessions without user consent | Require a per-session CSRF token for mutating supervisor API calls. Set proper Content Security Policy on webview panels to restrict fetch targets |
| `POST /api/sessions` accepts arbitrary `flags` array including `--dangerously-skip-permissions` | Any extension can create unrestricted Claude Code sessions that bypass safety checks | Whitelist allowed flags in the supervisor. Require explicit user confirmation for dangerous flags. Log all flag usage |
| Extension install from arbitrary GitHub URLs executes `npm install` which runs arbitrary `postinstall` scripts | Malicious extension repos can execute arbitrary code during `npm install` via lifecycle scripts | Run `npm install --ignore-scripts` during extension builds. Use `--no-optional` to skip optional native deps. Consider sandboxing the build process |
| Secrets API has no access control -- any extension can read any secret | A malicious or compromised extension can exfiltrate all API keys and tokens | Add permission scoping: extensions declare which secrets they need in their `package.json`, and the secrets extension only provides access to declared secrets. Prompt user on first access |
| `CLAUDEOS_AUTH_TOKEN` used for both HTTP auth and encryption key derivation | Compromise of the auth token (e.g., from a shoulder-surfing attack, log leak, or browser history) compromises all encrypted secrets | Use separate credentials: auth token for code-server access, a derived or separate key for encryption. At minimum, use a strong KDF with salt so the encryption key cannot be trivially derived from the auth token |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visual feedback during extension installation (clone + build + install takes 30-60s) | User clicks "install," nothing happens, they click again triggering duplicate installs | Show a progress panel with real-time build log output. Disable the install button during installation. Show estimated time |
| Terminal tab loses scroll position on window reload | User was reading Claude Code's output, reload snaps to bottom, they lose their place | Cache scroll position in extension state before reload. Restore after reload. Show a "jump back to where you were" button |
| Session status indicators update on a polling interval instead of real-time | "Waiting for input" badge appears 2-5 seconds late, user misses the prompt | Use tmux hooks or `tmux wait-for` to detect status changes. Push updates via SSE to the sessions extension |
| Archive/revive loses conversation context | User archives a session expecting to "pause" it. Revive starts a fresh Claude Code session with no memory of the previous conversation | Clearly communicate that archive saves scrollback text only, not Claude's context. On revive, prefix the new session with a summary of the archived conversation. Label revive as "New session with previous context" not "Resume" |
| Self-improve extension makes Claude Code build extensions but user has no visibility into what's happening | User asks "add a memory system," Claude builds it, but the user can't see progress or intervene | Open the self-improve session in a visible terminal tab. Show build progress in the Extension Manager panel. Let the user approve/reject the extension before installation |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Session creation:** Often missing -- handling the case where `claude` CLI is not installed or not on PATH. Verify the supervisor checks `claude --version` on boot and fails fast with a clear error
- [ ] **Extension installer:** Often missing -- cleanup of cloned repos after build. Verify `/tmp` or build directory doesn't fill up after 20+ installs
- [ ] **Secrets encryption:** Often missing -- IV uniqueness enforcement. Verify every `setSecret` call generates a new random IV, never reuses
- [ ] **Session archival:** Often missing -- atomic file writes. Verify archive writes use write-to-temp-then-rename to prevent corruption on crash
- [ ] **Terminal attachment:** Often missing -- handling tmux session that died between listing and attaching. Verify graceful error when attaching to a nonexistent session
- [ ] **Supervisor API:** Often missing -- request body validation. Verify malformed JSON returns 400, not a crash
- [ ] **First-boot installer:** Often missing -- idempotency. Verify running first-boot twice doesn't double-install extensions or error on already-installed extensions
- [ ] **code-server branding:** Often missing -- product.json surviving code-server updates. Verify product.json is in persistent storage and applied via flag, not placed inside the code-server install directory
- [ ] **Docker healthcheck:** Often missing -- checking code-server is actually serving, not just that the supervisor process is alive. Verify healthcheck hits code-server's HTTP endpoint, not just supervisor's `/api/health`

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| tmux send-keys race (sessions created but Claude not running) | LOW | Kill the bad tmux session, recreate using `new-session "command"` pattern. No data loss since nothing ran |
| Claude Code OOM kills container | MEDIUM | Container auto-restarts (Railway `restartPolicyType: always`). Active sessions are lost but tmux sessions can be detected on restart. Add session recovery to supervisor boot sequence |
| Volume permissions wrong on Railway | LOW | SSH into Railway container, run `chown -R appuser:appuser /data`. Fix the entrypoint script to prevent recurrence. No data loss |
| Extension activation order bug | LOW | Reload window. If persistent, add explicit `await ext.activate()` call. No data loss |
| Orphaned MCP servers in config | LOW | Run `claude mcp list` and `claude mcp remove` for each stale entry. Add cleanup to supervisor boot |
| Corrupted secrets file (bad encryption) | HIGH | If encryption key is lost or file corrupted, secrets are unrecoverable. Must re-enter all API keys and tokens. Implement backup/export of encrypted secrets file to mitigate |
| Extension install leaves broken VSIX | LOW | `code-server --uninstall-extension <id>`. Clean up build directory. Retry install |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| tmux send-keys race condition | Phase 1: Supervisor | Integration test: create 5 sessions concurrently, verify all have Claude Code running |
| Claude Code memory leaks | Phase 1: Supervisor (monitoring), Phase 2: Sessions extension (UI) | Load test: run a session for 1 hour with continuous interaction, verify memory stays under threshold |
| Extension install disrupts terminals | Phase 2: Self-Improve extension | Manual test: install extension with 3 active terminal tabs, verify all reconnect with context |
| Docker volume permissions | Phase 1: Dockerfile + entrypoint | CI test: build image, mount empty volume as non-root, verify write access to all `/data` subdirs |
| Extension activation ordering | Phase 2: Extension template | Integration test: cold-boot code-server with all 5 extensions, verify no activation errors in 10 consecutive starts |
| MCP server lifecycle | Phase 3: MCP-bundling extensions | Test: activate/deactivate extension 10 times, verify no orphaned MCP entries |
| VSIX build pipeline fragility | Phase 1: Extension Installer | Test: install extension from template repo, verify VSIX exists and extension loads. Test with missing npm, missing git, network failure |
| Weak secret encryption | Phase 2: Secrets extension | Security review: verify PBKDF2 with salt, unique IVs, no raw auth token usage. Run crypto audit |
| Supervisor API unauthed mutations | Phase 1: Supervisor | Test: attempt session creation from a webview fetch call, verify CSRF protection blocks it |
| Self-improvement visibility | Phase 3: Self-Improve extension | User test: ask Claude to build an extension, verify progress is visible and user can cancel |

## Sources

- [Claude Code tmux send-keys race condition -- Issue #23513](https://github.com/anthropics/claude-code/issues/23513)
- [Claude Code team agents spawning in wrong pane -- Issue #23615](https://github.com/anthropics/claude-code/issues/23615)
- [Claude Code scrollback buffer lag in tmux -- Issue #4851](https://github.com/anthropics/claude-code/issues/4851)
- [Claude Code performance degradation in long sessions -- Issue #10881](https://github.com/anthropics/claude-code/issues/10881)
- [Claude Code 93GB memory leak -- Issue #22188](https://github.com/anthropics/claude-code/issues/22188)
- [Claude Code memory leak kills sessions -- Issue #27421](https://github.com/anthropics/claude-code/issues/27421)
- [Claude Code excessive scroll events (4000-6700/s) -- Issue #9935](https://github.com/anthropics/claude-code/issues/9935)
- [Claude Code rendering glitches in tmux -- Issue #1495](https://github.com/anthropics/claude-code/issues/1495)
- [Claude Code MCP servers persist after removal -- Issue #7936](https://github.com/anthropics/claude-code/issues/7936)
- [Claude Code dynamic MCP server feature request -- Issue #5639](https://github.com/anthropics/claude-code/issues/5639)
- [code-server VSIX marketplace error pop-ups -- Issue #7660](https://github.com/coder/code-server/issues/7660)
- [code-server VSIX marketplace query on local install -- Issue #2355](https://github.com/coder/code-server/issues/2355)
- [code-server product.json docs removal -- Issue #4431](https://github.com/coder/code-server/issues/4431)
- [code-server FAQ and extension configuration](https://coder.com/docs/code-server/FAQ)
- [vsce package fails with pnpm -- Issue #1154](https://github.com/microsoft/vscode-vsce/issues/1154)
- [vsce deep dependency issues -- Issue #432](https://github.com/microsoft/vscode-vsce/issues/432)
- [VS Code extension webview security -- Trail of Bits](https://blog.trailofbits.com/2023/02/21/vscode-extension-escape-vulnerability/)
- [VS Code inter-extension activation discussion -- Discussion #595](https://github.com/microsoft/vscode-discussions/discussions/595)
- [Docker Node.js volume permissions -- Issue #837](https://github.com/nodejs/docker-node/issues/837)
- [Railway persistent volumes documentation](https://docs.railway.com/volumes/reference)
- [Railway volume permissions with non-root users](https://station.railway.com/questions/persistent-volume-not-persisting-data-ac-fd543a6e)
- [OWASP PBKDF2 iteration recommendations](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-132.pdf)
- [OpenClaw agent security risks -- ISACA](https://www.isaca.org/resources/news-and-trends/isaca-now-blog/2025/avoiding-ai-pitfalls-in-2026-lessons-learned-from-top-2025-incidents)
- [tmux send-keys documentation](https://man7.org/linux/man-pages/man1/tmux.1.html)
- [tmux send-keys character stripping -- Issue #1425](https://github.com/tmux/tmux/issues/1425)
- [Claude Code MCP configuration docs](https://code.claude.com/docs/en/mcp)

---
*Pitfalls research for: ClaudeOS -- browser-accessible AI agent OS with code-server, tmux, and VS Code extension system*
*Researched: 2026-03-11*
