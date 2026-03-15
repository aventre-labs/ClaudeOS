# Domain Pitfalls

**Domain:** Zero-config onboarding for containerized CLI-wrapping web application (ClaudeOS v1.1)
**Researched:** 2026-03-15
**Confidence:** HIGH (verified across Railway docs, Claude Code docs, OAuth RFCs, and real GitHub issues)

> This file covers pitfalls specific to ADDING zero-config onboarding to the existing ClaudeOS v1.0 system.
> For v1.0 foundational pitfalls (tmux race conditions, memory leaks, volume permissions, etc.), see git history.

## Critical Pitfalls

Mistakes that cause security vulnerabilities, broken deployments, or rewrites.

### Pitfall 1: First-Boot Setup Wizard Race Condition

**What goes wrong:** Two users (or automated port scanners) hit the setup endpoint simultaneously. Both see the password form. Both submit. The second write overwrites the first `auth.json`, locking out the first user or -- worse -- an attacker racing to set the password before the legitimate owner does. On Railway, instances are publicly accessible immediately after deploy, making the window between deploy and first user visit the attack surface.

**Why it happens:** The current `POST /api/v1/setup` handler in `boot.ts` has no mutex, lock file, or idempotency guard. It checks nothing between receiving the request and writing `auth.json`. The `isConfigured()` check exists but is not called at the start of the POST handler -- only in the boot sequence.

**Consequences:** Attacker takes control of the instance. Legitimate owner locked out. All subsequent auth (Railway, Claude) is compromised because the attacker controls the encryption key.

**Prevention:**
1. Call `isConfigured()` as the FIRST check in the POST handler. Return 409 Conflict if already configured. This is a one-line fix for the existing code.
2. Use an atomic lock file (`setup.lock`) created with `O_CREAT | O_EXCL` flags at the start of the POST handler. Second concurrent request gets EEXIST and is rejected.
3. Add a setup timeout like Portainer: if no password is set within 5 minutes of container start, halt the setup server. Log a message telling the user to redeploy. This limits the attack window.
4. Generate a one-time setup token at container start, write it to Railway logs (`console.log`). Require it in the setup form. Only someone with deploy access (who can read logs) can complete setup.

**Detection:** Open two browser tabs to `/setup`. Submit both. Second succeeds instead of failing with 409.

**Phase:** MUST be fixed in the first phase, before any public deployment.
**Confidence:** HIGH -- Portainer had this exact vulnerability and added a 5-minute timeout as mitigation. It is a well-documented attack pattern.

---

### Pitfall 2: Railway CLI `railway login` Cannot Run Inside a Container

**What goes wrong:** You try to run `railway login` or `railway login --browserless` inside the Docker container to authenticate the user with Railway. The `--browserless` flag displays a pairing code on stdout and waits for the user to visit a URL and enter it. But in a containerized web app, there is no terminal -- the user interacts via HTTP. The supervisor cannot relay stdout pairing codes to the user's browser without building a custom bridge.

**Why it happens:** `railway login` is designed for developer workstations and SSH sessions where the developer can see terminal output. The `--browserless` flag works in SSH (developer reads the code from their terminal) but not in a web-served container (no terminal access). The Railway CLI has no HTTP-callback login mode.

**Consequences:** The entire "Sign in with Railway" feature cannot work by shelling out to `railway login`. The architectural approach must change.

**Prevention:**
1. **Use Railway's OAuth 2.0 integration instead of CLI login.** Railway provides a full OAuth Authorization Code flow with PKCE. Register a Railway OAuth app, redirect the user to Railway's auth endpoint from the setup wizard, handle the callback, store the access token.
2. **Alternative (not zero-config):** Accept a `RAILWAY_TOKEN` or `RAILWAY_API_TOKEN` env var. The user creates a token in Railway's dashboard and pastes it. This works but defeats the zero-config promise.
3. **Alternative (spawn + relay):** Spawn `railway login --browserless`, capture its stdout, parse out the pairing code and URL, display them in the setup wizard UI. The user opens the URL in another tab and enters the code. This works but is fragile -- it depends on the CLI's stdout format which is not a stable API.

**Recommendation:** Use Railway OAuth. It is the supported programmatic auth method. The spawn-and-relay approach is tempting but fragile.

**Detection:** Spawn `railway login --browserless` in a container, observe it prints to stdout and waits for terminal input that never comes.

**Phase:** Core design decision. Must be decided before any Railway auth implementation begins.
**Confidence:** HIGH -- verified via Railway CLI docs (`railway login` page) and Railway OAuth docs.

---

### Pitfall 3: Claude CLI `claude login` Cannot Run Inside a Container Either

**What goes wrong:** `claude` (on first run) or `claude /login` starts a local HTTP server on a random port and opens a browser for OAuth. Inside a container: (a) there is no browser, (b) the local HTTP callback server's port is not exposed through Railway's reverse proxy -- Railway only routes traffic to the configured PORT. The OAuth callback never reaches the container.

**Why it happens:** Claude Code's OAuth flow is designed for developer workstations. It starts `http://localhost:<random_port>/callback` to receive the OAuth redirect. Inside a Railway container, `localhost` is the container's loopback, and only port 8080 (or whatever PORT is set) is externally reachable.

**Consequences:** Users cannot authenticate Claude Code through the standard browser-based flow. Claude Code is unusable without auth.

**Prevention:**
1. **API key via environment variable (recommended).** Claude Code supports `ANTHROPIC_API_KEY`. Accept the API key in the setup wizard, store it encrypted in the secrets store, inject it as an env var when spawning Claude Code tmux sessions. This is the most reliable container-compatible approach.
2. **`apiKeyHelper` setting.** Claude Code supports a custom script that returns an API key (`apiKeyHelper` in settings). Write a helper script that reads from the encrypted secrets store. This avoids persisting the key in environment variables.
3. **SSH port forwarding.** Documented in Claude Code GitHub issue #7100 -- forward the callback port via SSH. Not viable for Railway (no SSH access to containers).
4. **Pre-auth volume mount.** Run `claude login` locally, copy `~/.claude/` credential files into the container. Not zero-config.
5. **Cloud provider auth (Bedrock/Vertex/Foundry).** Uses environment variables, works in containers. But limits users to enterprise cloud providers.

**Recommendation:** API key approach. Ask for the key once in the setup wizard, store encrypted, inject per-session. This is what DataCamp's Claude Code Docker guide recommends. The `apiKeyHelper` approach is a nice enhancement for v1.2.

**Detection:** Run `claude` inside container, observe it starts a local HTTP server that no browser can reach.

**Phase:** Core design decision. Must be decided before any Claude auth implementation begins.
**Confidence:** HIGH -- verified via Claude Code authentication docs and GitHub issue #7100.

---

### Pitfall 4: OAuth Redirect URI Breaks on Every Fork

**What goes wrong:** Railway OAuth requires exact redirect URI matching (case-sensitive, no wildcards). When someone forks ClaudeOS and deploys to their own Railway project, the instance gets a different hostname (e.g., `claudeos-abc123.up.railway.app`). The hardcoded redirect URI in the OAuth app registration does not match. The OAuth flow fails with a redirect URI mismatch error.

**Why it happens:** OAuth 2.0 security (RFC 9700) requires exact redirect URI matching to prevent authorization code interception. This is a fundamental protocol security requirement, not a Railway limitation. You cannot register wildcard redirect URIs.

**Consequences:** "Deploy on Railway" button works for the original repo owner but fails for every fork. Zero-config is broken for the primary use case.

**Prevention:**
1. **Static callback page (already planned in PROJECT.md).** Host a static HTML page at a known, permanent URL (e.g., `https://aventre-labs.github.io/claudeos/callback`). Register THIS URL as the redirect URI. The static page receives the authorization code and relays it back to the user's actual ClaudeOS instance.
2. **Relay mechanism options:**
   - **URL parameter relay:** Static page extracts the `code` from the URL, shows a "paste this code" prompt. ClaudeOS setup wizard has a "paste code" field. Simple but manual.
   - **`postMessage` relay:** Static page uses `window.opener.postMessage()` to send the code back to the ClaudeOS window that opened the popup. Automatic but requires the auth flow to open a popup (not a redirect).
   - **Server-side relay:** A lightweight API at a known URL receives the callback, looks up the correct ClaudeOS instance from the `state` parameter, and forwards the code. More infrastructure to maintain.
3. **Security requirements for static callback page:**
   - MUST validate the `state` parameter matches what was generated by the ClaudeOS instance.
   - MUST use PKCE (S256 method) so intercepted codes are useless without the verifier.
   - The static page MUST NOT process or store tokens. It only relays the authorization code.
   - The static page MUST be served over HTTPS.

**Detection:** Fork the repo, deploy to Railway, attempt Railway OAuth login, observe redirect URI mismatch error.

**Phase:** Must be designed and built alongside the Railway OAuth flow. The callback page must be deployed before OAuth works for forks.
**Confidence:** HIGH -- verified via Railway OAuth troubleshooting docs and RFC 9700.

---

### Pitfall 5: Encryption Key Stored Alongside Encrypted Data

**What goes wrong:** The current `auth.json` stores `encryptionKey` in the same file as `encryptedPassword`. This is equivalent to locking a door and leaving the key under the mat. If an attacker gains read access to `/data/config/auth.json` (path traversal, backup leak, volume snapshot, Railway support access), they get everything needed to decrypt the password and all secrets.

**Why it happens:** The v1.0 implementation needed a quick solution. The encryption key was stored locally because there was no external key management and the password needed to be recoverable without user interaction (for automatic code-server restart).

**Consequences:** Encryption provides no meaningful security against data-at-rest attacks. This becomes worse in v1.1 because the file will also contain Railway tokens and Claude API keys.

**Prevention:**
1. **Derive the encryption key from the user's password** using scrypt (already have `salt`). The key is never stored -- re-derived when the user logs in. This means the password cannot be recovered without the user entering it.
2. **For code-server restart without user interaction:** Cache the decrypted password in memory only. If the supervisor process dies (container restart), the user must re-enter their password on next visit. This is acceptable -- it is the same behavior as Portainer and Gitea.
3. **Alternative:** Use a Railway-provided secret or environment variable as the key source. The key is not stored in `auth.json` but is provided by the infrastructure.
4. **For v1.1 specifically:** When adding API keys to the auth config, do NOT store them encrypted with the key that is in the same file. Either derive the key from the password or use a separate key management approach.

**Detection:** `cat /data/config/auth.json` shows `encryptionKey` field alongside `encryptedPassword`.

**Phase:** Should be addressed when reworking auth for v1.1. Not a deployment blocker but a significant security debt.
**Confidence:** HIGH -- straightforward cryptographic anti-pattern.

## Moderate Pitfalls

### Pitfall 6: Forked Docker Image Reference in railway.toml

**What goes wrong:** `railway.toml` has `dockerImage = "ghcr.io/aventre-labs/claudeos:latest"` hardcoded. Forks still point to the original org's image. If the original org pushes an update, all forks get it (possibly breaking). If the org deletes the image, all forks break. Forkers cannot customize their image.

**Prevention:**
1. **Switch to Dockerfile build for forks.** Replace `dockerImage` with a `Dockerfile` in the repo. Railway builds from the Dockerfile in the fork's repo. Each fork is self-contained.
2. **Trade-off:** Nix-based Docker builds are slow (10-20 min). Railway may time out. Consider providing a multi-stage Dockerfile that does not require Nix, or use a pre-built base image that forks can extend.
3. **Hybrid approach:** Provide both `railway.toml` (for official deploy with pre-built image) and `Dockerfile` (for forks). Document that forkers should update `railway.toml` to remove the `dockerImage` line so Railway uses the Dockerfile instead.
4. **Template approach:** Use Railway's template system where deployers can configure environment variables but the image source is handled by the template definition, not a hardcoded value in the repo.

**Phase:** Fork-friendly deploy phase.
**Confidence:** HIGH -- observable in current `railway.toml`.

---

### Pitfall 7: Migration Path for Existing v1.0 Users

**What goes wrong:** Existing v1.0 instances have `auth.json` with the current schema (password, salt, encryption key). v1.1 adds Railway token and Claude API key fields. If migration is not handled: (a) old instances force users through setup again, losing config, or (b) the new code crashes because expected fields are missing.

**Prevention:**
1. **Version the auth config.** Add `"version": 2` to the new schema. On boot, check the version field. If missing (v1.0) or `1`, run a migration function that adds new fields with null/empty defaults.
2. **Make new fields optional.** The system should work with password-only auth (v1.0 behavior). Railway auth and Claude auth are progressive enhancements.
3. **Never delete or rename existing fields.** Only add new ones. `isConfigured()` must remain backward-compatible (check `encryptionKey && passwordHash` as today).
4. **Test explicitly:** Start v1.0 container -> create auth -> upgrade to v1.1 image -> verify boot works without re-setup.
5. **Add a settings page** (not just setup wizard) where users can add Railway/Claude auth after initial password setup. The setup wizard should not be the only way to configure auth.

**Phase:** First phase of v1.1, before any auth schema changes ship.
**Confidence:** HIGH -- standard schema migration concern.

---

### Pitfall 8: Build Progress Detection -- Polling Inadequacy

**What goes wrong:** The current setup wizard polls `/api/v1/health` every 2 seconds and shows a spinner. For v1.1, the setup is multi-step: password -> Railway OAuth -> Claude API key -> extension install -> code-server launch. Polling a single health endpoint provides no granularity. Users see a spinner for 2+ minutes with no idea what is happening or if it is stuck.

**Prevention:**
1. **Use Server-Sent Events (SSE)** for build progress. The supervisor already runs Fastify. Add a `GET /api/v1/setup/progress` SSE endpoint that pushes structured events: `{ step: "installing-extensions", current: 3, total: 5, message: "Installing claudeos-sessions..." }`.
2. **SSE works through Railway's reverse proxy** without special configuration (it is just HTTP with `Transfer-Encoding: chunked`). No WebSocket upgrade needed.
3. **Fallback to polling** if SSE connection drops. The polling endpoint should return the same structured progress object, not just a status string.
4. **Do NOT use WebSockets** for this. SSE is simpler, one-directional (server to client), and sufficient. WebSockets add complexity (upgrade handshake, ping/pong keepalive, Railway proxy configuration).

**Phase:** Build progress UI phase.
**Confidence:** MEDIUM -- SSE should work through Railway's proxy but verify in staging.

---

### Pitfall 9: Railway Health Check Timeout During Extended Setup

**What goes wrong:** `railway.toml` sets `healthcheckTimeout = 120`. The v1.1 setup flow is longer: user must complete password + potentially OAuth + API key entry + extension install. If the user deploys, goes away, and comes back after 2 minutes, Railway has already killed the container for failing health checks.

**Prevention:**
1. **Verify the health check returns 200 during setup.** The current implementation returns `{ status: "setup" }` with a 200 status code -- this should satisfy Railway's health check (it checks HTTP status, not body content).
2. **Increase `healthcheckTimeout`** to 300 or 600 in `railway.toml` to account for the extended setup flow.
3. **Separate the health check from setup state.** The health check should always return 200 as long as the process is alive. Setup progress is a separate concern reported through the setup/progress endpoint.
4. **Test:** Deploy to Railway, do NOT complete setup, wait 5 minutes. Verify the container is still running.

**Phase:** Must be verified early, as part of the first deployment test.
**Confidence:** MEDIUM -- depends on Railway's exact health check interpretation.

---

### Pitfall 10: Container Localhost Confusion in OAuth Callbacks

**What goes wrong:** Inside the Docker container, `localhost` refers to the container's loopback, not the host or Railway's network. Railway only routes external traffic to the configured PORT. Any OAuth callback server started by a CLI tool (Railway CLI, Claude CLI) on a random localhost port is unreachable from the user's browser.

**Prevention:**
1. **Do not rely on CLI tools starting localhost callback servers.** Both Railway and Claude CLIs do this. Use API-based auth instead (Railway OAuth via HTTP, Claude via API key).
2. **All OAuth callbacks must go through the Railway-exposed PORT** or through an external callback page. The supervisor must handle the callback on its own port (3100, proxied through code-server on 8080) or use the static callback page approach.
3. **Inter-service communication** inside the container (supervisor -> code-server, extensions -> supervisor) correctly uses `localhost:3100` and should continue to do so. This pitfall only affects flows that expect external browser traffic to reach an arbitrary port.

**Phase:** Architecture decision for all auth flows.
**Confidence:** HIGH -- standard Docker networking.

## Minor Pitfalls

### Pitfall 11: PKCE Code Verifier Storage Across Domains

**What goes wrong:** The OAuth PKCE flow requires the browser to send a `code_challenge` to the auth server and later the server sends the `code_verifier` to exchange the code for a token. If the static callback page is on a different domain than the ClaudeOS instance, browser storage (`localStorage`, `sessionStorage`) is not shared. The callback page cannot access the verifier stored by the ClaudeOS page.

**Prevention:** Generate the `code_verifier` on the ClaudeOS server side, not in the browser. The server initiates the OAuth flow, stores the verifier in server-side state (memory or temp file), and exchanges the code + verifier when the callback arrives. The static callback page only relays the authorization code -- it never handles the verifier.

**Phase:** OAuth implementation phase.
**Confidence:** HIGH -- standard PKCE architecture.

---

### Pitfall 12: API Key Exposure in Environment Variables

**What goes wrong:** When `ANTHROPIC_API_KEY` is set in the supervisor's environment and passed to tmux sessions, the key is visible via `/proc/*/environ`, in tmux's environment, and potentially in Claude Code's error logs.

**Prevention:**
1. Set the API key per-session using tmux's `send-keys` to export it within the shell, rather than setting it as a global environment variable on the supervisor process.
2. Use Claude Code's `apiKeyHelper` setting to read the key from the encrypted secrets store on demand.
3. Never log the API key. Sanitize error messages that might contain environment variable values.

**Phase:** Claude auth integration phase.
**Confidence:** MEDIUM -- depends on Claude Code's actual env var handling.

---

### Pitfall 13: Setup Page Served Without TLS Awareness

**What goes wrong:** The setup wizard collects passwords and API keys over HTTP inside the container. Railway terminates TLS at its proxy, so external traffic IS encrypted. But someone running ClaudeOS locally (via docker-compose) without a reverse proxy transmits credentials in cleartext.

**Prevention:**
1. Check `window.location.protocol` in the setup page JavaScript. If `http:` and hostname is not `localhost` or `127.0.0.1`, show a warning banner: "Your connection is not encrypted. Do not enter sensitive credentials."
2. For API key entry specifically, consider a "paste from clipboard" UX that avoids the key being visible in the DOM (use a password-type input that never shows the value).

**Phase:** Setup wizard UI phase.
**Confidence:** MEDIUM -- depends on deployment context.

---

### Pitfall 14: Extension Boot Order Disrupted by New Auth Steps

**What goes wrong:** The current boot sequence is: password setup -> extension install -> code-server launch. If v1.1 inserts Railway/Claude auth steps between password and extension install, extensions that depend on network access might fail if the OAuth flow is blocking, or the boot takes too long and Railway kills the container.

**Prevention:**
1. Keep the current boot order: password -> extensions -> code-server launch. Add Railway/Claude auth as POST-boot steps that happen after code-server is running.
2. Railway and Claude auth are not prerequisites for extension installation. They are prerequisites for Claude Code sessions. Keep them separate in the lifecycle.
3. Offer a "Settings" page accessible from within code-server (after login) where users can configure Railway/Claude auth at their leisure, not as a blocking setup step.

**Phase:** Boot sequence design phase.
**Confidence:** HIGH -- the current boot sequence works and should not be disrupted for auth additions.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| First-boot wizard security | Race condition on setup (Pitfall 1) | Atomic lock + `isConfigured()` guard + setup timeout |
| Railway auth integration | CLI login impossible in container (Pitfall 2) | Use Railway OAuth API, not CLI login |
| Railway auth for forks | OAuth redirect URI mismatch (Pitfall 4) | Static callback page at known URL |
| Claude auth integration | CLI login impossible in container (Pitfall 3) | Use `ANTHROPIC_API_KEY` env var, not CLI OAuth flow |
| Auth schema changes | Breaking v1.0 installs (Pitfall 7) | Version the config, additive-only changes |
| Auth security | Encryption key stored with data (Pitfall 5) | Derive key from password, never store on disk |
| Fork-friendly deploy | Hardcoded Docker image ref (Pitfall 6) | Dockerfile build or configurable image ref |
| Build progress UI | Polling inadequacy (Pitfall 8) | SSE endpoint with structured progress events |
| Health checks | Container killed during extended setup (Pitfall 9) | Always return 200 while alive, increase timeout |
| Boot sequence | Auth steps disrupting extension install (Pitfall 14) | Auth is post-boot, not blocking setup |

## Sources

- [Railway CLI Login Docs](https://docs.railway.com/cli/login) -- `--browserless` flag, `RAILWAY_TOKEN` alternative
- [Railway OAuth Quickstart](https://docs.railway.com/integrations/oauth/quickstart) -- PKCE requirement, exact redirect URI matching
- [Railway OAuth Troubleshooting](https://docs.railway.com/integrations/oauth/troubleshooting) -- case-sensitive URI matching, no wildcards, native app PKCE
- [Railway Deploy Template Docs](https://docs.railway.com/guides/deploy) -- template deployment, ejection flow
- [Claude Code Authentication Docs](https://code.claude.com/docs/en/authentication) -- OAuth browser flow, `apiKeyHelper` setting, cloud provider env vars
- [Claude Code Headless Auth Issue #7100](https://github.com/anthropics/claude-code/issues/7100) -- headless/container auth limitations, SSH forwarding workaround
- [Claude Code Docker Tutorial (DataCamp)](https://www.datacamp.com/tutorial/claude-code-docker) -- container auth best practices
- [Portainer Setup Timeout](https://docs.portainer.io/faqs/installing/your-portainer-instance-has-timed-out-for-security-purposes-error-fix) -- 5-minute timeout as setup race condition mitigation
- [Portainer Security Vulnerabilities (CyberArk)](https://www.cyberark.com/resources/threat-research-blog/discovering-hidden-vulnerabilities-in-portainer-with-codeql) -- setup wizard attack surface
- [RFC 9700 - OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/rfc9700/) -- PKCE (S256), redirect URI security, native app requirements
- [Race Conditions in Web Applications (GuidePoint Security)](https://www.guidepointsecurity.com/blog/race-conditions-in-modern-web-applications/) -- TOCTOU and setup race patterns
- [Docker Container Networking Docs](https://docs.docker.com/config/containers/container-networking/) -- localhost isolation in containers
- [Claude Code OAuth Issues on Linux](https://medium.com/@flashoop/oauth-issue-of-claude-on-linux-3854a66e4d36) -- browser redirect failures in headless environments

---
*Pitfalls research for: ClaudeOS v1.1 -- zero-config onboarding (CLI auth wrapping, first-boot wizard, fork-friendly deploy)*
*Researched: 2026-03-15*
