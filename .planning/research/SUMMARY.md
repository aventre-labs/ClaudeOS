# Project Research Summary

**Project:** ClaudeOS
**Domain:** Browser-accessible AI agent operating environment (cloud IDE + agent computer hybrid)
**Researched:** 2026-03-11
**Confidence:** HIGH

## Executive Summary

ClaudeOS is an operating environment for Claude Code -- a thin wrapper that provides a browser-accessible VS Code interface, session management, and a self-extending module system built on standard VS Code extensions. Experts build this type of product by composing off-the-shelf components (code-server for the IDE, tmux for session isolation, Fastify for a small internal API) rather than building custom infrastructure. The recommended approach is a layered architecture where a lightweight Node.js supervisor process orchestrates code-server, manages tmux sessions, and exposes a localhost HTTP API that VS Code extensions consume for all user-facing features. The critical design constraint -- never modify Claude Code or fork code-server -- is both the product's primary risk (you depend entirely on tmux text scraping for session status) and its primary strength (zero maintenance burden from upstream changes, forward-compatible by design).

The stack is mature and high-confidence: Node.js 22 LTS, TypeScript 5.8, Fastify 5, Zod 4, esbuild, and Vitest. Every recommended technology has active maintenance, strong TypeScript support, and thousands of production deployments. The only medium-confidence areas are the VS Code webview UI toolkit (maintenance has slowed) and the MCP SDK (v2 anticipated but v1 is stable). The feature landscape is well-defined: table stakes are browser IDE, session management, terminal access, and container deployment; the primary differentiator is self-improvement through natural prompting, where Claude Code builds and installs VS Code extensions at runtime. All competitors either build custom agent UIs (OpenHands), lock down their extension systems (Cursor, Windsurf), or don't support self-extension at all.

The top risks are: (1) tmux send-keys race conditions during concurrent session creation -- solved by passing the command as the initial process, not via send-keys; (2) Claude Code memory leaks in long-running sessions causing container OOM kills -- mitigated by scrollback limits, health monitoring, and auto-archival; (3) Docker volume permission mismatches on Railway -- solved by an entrypoint script that fixes ownership before exec-ing the supervisor; and (4) extension installation requiring window reloads that disrupt active terminal sessions -- mitigated by batching first-boot installs and always requiring user consent for runtime reloads.

## Key Findings

### Recommended Stack

The stack centers on Node.js 22 LTS with TypeScript 5.8 (pinned with `~` to avoid the TS 6.0/7.0 transition), Fastify 5 as the supervisor HTTP server, and Zod 4 for validation across the entire ecosystem (supervisor, extensions, and MCP servers). Code-server provides the browser IDE, tmux provides session isolation via direct CLI calls (no wrapper libraries), and Docker with `node:22-bookworm-slim` (not Alpine -- glibc compatibility matters) handles containerization.

**Core technologies:**
- **Node.js 22 LTS + TypeScript 5.8**: Runtime and language -- active LTS through 2027, pinned TS to avoid the Go-compiler transition
- **code-server 4.109.x**: Browser-accessible VS Code -- stock binary, configured via product.json and settings.json, never forked
- **Fastify 5.8**: Supervisor HTTP API -- built-in JSON schema validation, Pino logging, 2-3x faster than Express
- **tmux (system)**: Session isolation -- direct CLI calls via `child_process.execFile`, no wrapper libraries
- **Zod 4**: Validation everywhere -- 6.5x faster than Zod 3, used by the MCP SDK, one library across all components
- **esbuild 0.27**: Bundling for both supervisor and extensions -- 10-100x faster than webpack
- **@modelcontextprotocol/sdk 1.27**: MCP server implementation for extensions that expose tools to Claude Code
- **Docker (multi-stage, bookworm-slim)**: Container packaging -- not Alpine to avoid musl/glibc issues

### Expected Features

**Must have (table stakes):**
- Browser-accessible IDE interface (code-server provides this)
- Terminal access to agent sessions (tmux attach via VS Code terminal)
- Session creation, listing, stop, kill (supervisor API)
- Persistent state across container restarts (Docker volume at /data)
- Authentication / access control (CLAUDEOS_AUTH_TOKEN)
- Secret / API key management (claudeos-secrets extension)
- Git integration (code-server built-in)
- Container-based deployment (Docker + Railway)

**Should have (differentiators):**
- Self-improvement via natural prompting -- Claude Code builds and installs VS Code extensions at runtime (primary differentiator, no competitor does this)
- Extension system mapped to standard VS Code extensions (zero proprietary API learning curve)
- Extensions that bundle MCP servers giving Claude Code new tools (bidirectional extension model)
- Session archive and revival (save scrollback, revive with context in new session)
- Multi-session sidebar with status indicators (active/idle/waiting)
- One-click Railway deployment

**Defer (v2+):**
- Persistent memory system (Mem0 or similar)
- Browser automation (stealth Chrome)
- Scheduling and automation (n8n integration)
- Execution graph visualization
- Custom extension marketplace
- Multi-agent orchestration UI
- Multi-user / team features

**Anti-features (explicitly do not build):**
- Custom chat UI (Claude Code's terminal rendering IS the interface)
- Code completion engine (Claude Code handles all code generation)
- Multi-LLM support (ClaudeOS is specifically for Claude Code)
- code-server fork or Claude Code patches

### Architecture Approach

The architecture is a four-layer stack inside a single Docker container: (1) the supervisor process, a ~300-line Node.js HTTP server on :3100 that boots the system and exposes the session/extension API; (2) code-server on :8080, hosting the VS Code extension runtime; (3) a tmux session pool where each Claude Code instance runs in an isolated tmux session; and (4) a persistent volume at /data storing extensions, archived sessions, encrypted secrets, and configuration. Extensions communicate with the supervisor exclusively via HTTP -- never by importing supervisor code. Extensions communicate with each other via VS Code's native `getExtension().exports` API. Extensions that need to give Claude Code tools bundle MCP servers as child processes.

**Major components:**
1. **Supervisor** -- boots system, spawns code-server, manages tmux sessions, exposes HTTP API on :3100
2. **code-server** -- browser-accessible VS Code, hosts extension runtime, serves UI on :8080
3. **Extension Host** -- VS Code's isolated process running all first-party and user-installed extensions
4. **tmux Session Pool** -- one tmux session per Claude Code conversation, managed via CLI commands
5. **Persistent Volume** -- survives container restarts, stores all stateful data at /data

**Key patterns:**
- Supervisor as HTTP sidecar (clean boundary, testable in isolation)
- tmux as process boundary (Claude Code stays stock, forward-compatible)
- Extension-to-extension communication via VS Code exports API (activation ordering matters)
- Webview panels with postMessage bridge (sandboxed, async)
- MCP servers bundled in extensions (register on activate, deregister on deactivate)

### Critical Pitfalls

1. **tmux send-keys race condition** -- shell initialization takes 200ms-2s, `send-keys` fires before the shell is ready. Pass the command as the initial process via `tmux new-session -d -s NAME "claude --flags"` instead of creating a session and then sending keys.

2. **Claude Code memory leaks in long sessions** -- heap can grow to 16+ GB, scrollback compounds the problem, OOM kills take down the entire container. Set `history-limit 5000`, monitor RSS per session, implement auto-archival at 2GB threshold.

3. **Extension install requires window reload** -- disrupts all active terminal tabs. Batch installs at first boot (before sessions exist), never auto-reload, always require user consent for runtime installs.

4. **Docker volume permissions on Railway** -- Railway mounts volumes as root, Dockerfile `chown` applies to image layer not volume. Use an entrypoint script that `chown`s /data then `exec`s as app user.

5. **Inter-extension activation order** -- `getExtension().exports` returns undefined if the dependency hasn't finished activating. Always `await extension.activate()` before accessing `.exports`, even with `extensionDependencies` declared.

6. **MCP server orphan entries** -- `deactivate()` is not guaranteed to run. Use `claude mcp add/remove` CLI, scope to project level, clean up stale entries on activation.

7. **Secret encryption without proper KDF** -- using SHA-256 or raw auth token is insecure. Use PBKDF2 with 600K+ iterations and random salt; generate a separate encryption key encrypted by the derived key.

8. **VSIX build pipeline fragility** -- `vsce package` breaks with non-npm package managers, native deps need build tools. Standardize on npm, use `--no-dependencies`, include build-essential in the container.

## Implications for Roadmap

Based on combined research findings, the dependency graph dictates a strict bottom-up build order. The supervisor is the root of all dependencies; nothing functions without it. Extensions depend on the supervisor API and on each other via the exports API.

### Phase 1: Supervisor + Container Foundation

**Rationale:** The supervisor is the root dependency for the entire system. Every extension, every session, and every deployment path depends on the supervisor being able to boot code-server, manage tmux sessions, and serve the HTTP API. The Dockerfile and container setup must be correct from day one because volume permissions and base image choices are extremely painful to change later.

**Delivers:** A bootable container that starts the supervisor, launches code-server with branding, exposes the session CRUD API on :3100, and manages tmux sessions. The extension installer pipeline (clone, build, install VSIX). Health check endpoint. Docker image with correct volume permissions.

**Addresses features:** Browser-accessible IDE, session creation/management, container deployment, authentication, persistent state

**Avoids pitfalls:** tmux send-keys race (use initial process pattern), Docker volume permissions (entrypoint script), VSIX build fragility (robust error handling, build tools in image), supervisor API validation (Fastify + Zod schema validation)

**Stack elements:** Node.js 22, TypeScript 5.8, Fastify 5, Zod 4, esbuild, tmux CLI, Docker multi-stage bookworm-slim

### Phase 2: Core Extensions (Sessions + Terminal)

**Rationale:** Sessions and terminal are tightly coupled in UX -- creating a session without being able to view it is useless. These two extensions form the minimum user experience: see your sessions in a sidebar, click one to open a terminal attached to Claude Code. Both depend only on the supervisor API, so they can be built as soon as Phase 1 is stable. Building these validates the extension development workflow (the template, esbuild bundling, VSIX packaging, installation via supervisor).

**Delivers:** claudeos-sessions extension (tree view sidebar with session list, status indicators). claudeos-terminal extension (terminal tab provider that attaches to tmux sessions). default-extensions.json with these two extensions for first-boot installation.

**Addresses features:** Terminal access to agent sessions, session management UI, file system access

**Avoids pitfalls:** Extension activation ordering (establish the `await ext.activate()` pattern in the template), Claude Code memory monitoring (expose session health in sidebar)

**Stack elements:** @types/vscode 1.85, esbuild, vsce, extension template structure

### Phase 3: Secrets + Home

**Rationale:** Secrets is a foundational service that other extensions depend on (self-improve needs GitHub PAT, future extensions need API keys). It must be built before any extension that consumes secrets. Home provides the welcome experience and quick-action shortcuts, filling out the UX for new users. Both are lower-risk extensions that exercise the webview panel pattern (React + postMessage bridge) which Phase 4 also needs.

**Delivers:** claudeos-secrets extension (AES-256-GCM encrypted storage, public API via exports, status bar indicator, webview form for managing secrets). claudeos-home extension (welcome webview, quick actions for creating sessions, recent session list).

**Addresses features:** Secret/API key management, welcome experience, dark theme/clean UI

**Avoids pitfalls:** Weak encryption (PBKDF2 with salt, separate encryption key, unique IVs), inter-extension activation order (secrets exposes API consumed by others)

**Stack elements:** React 19, @vscode/webview-ui-toolkit, Node.js crypto (built-in), Zod 4 for config validation

### Phase 4: Self-Improve + Extension Manager

**Rationale:** This is the capstone phase that delivers ClaudeOS's primary differentiator. It requires sessions (to run build sessions where Claude Code creates extensions), secrets (for GitHub PAT to clone private repos), and the extension installer (to install the built VSIX). This is also the most complex phase: it bundles an MCP server, manages extension lifecycle, and needs a webview UI for the extension manager panel. Build it last among the extensions because it depends on everything else working.

**Delivers:** claudeos-self-improve extension (MCP server exposing install_extension, get_extension_template, list_extensions tools to Claude Code). Extension manager webview panel (install from GitHub URL, list installed extensions, enable/disable). Extension template bundled and accessible via MCP tool. The self-improvement loop: user prompts Claude Code -> Claude Code builds a VS Code extension -> packages as VSIX -> installs via supervisor -> code-server reloads -> new capability available.

**Addresses features:** Self-improvement via natural prompting (primary differentiator), extension system, MCP server bundling, install-from-GitHub flow

**Avoids pitfalls:** MCP server lifecycle (register on activate, deregister on deactivate, clean up stale entries), extension install disrupting terminals (user consent for reload), extension visibility during build (open self-improve session in visible terminal)

**Stack elements:** @modelcontextprotocol/sdk 1.27, Zod 4, React 19 for webview, esbuild for MCP server bundling

### Phase 5: Deployment + Hardening

**Rationale:** Get everything working locally first, then harden for production. This phase focuses on Railway deployment configuration, health checks, restart policies, session recovery on container restart, and performance optimizations (SSE for session status instead of polling, compressed archives, build caching for the extension installer).

**Delivers:** railway.toml with health check config. "Deploy on Railway" template repo. Persistent volume configuration documentation. Session recovery on supervisor restart (detect orphaned tmux sessions). Performance hardening (SSE for real-time session status, gzip for archived scrollback, npm cache for extension builds).

**Addresses features:** One-click cloud deployment, session archive and revival (with context), notification badges and real-time status

**Avoids pitfalls:** Claude Code OOM (session health monitoring with auto-archive), container restart resilience (session recovery in boot sequence), scrollback storage growth (compression, retention policy)

**Stack elements:** Railway deployment config, Docker healthcheck, SSE via Fastify

### Phase Ordering Rationale

- **Supervisor first** because it is the root of the dependency graph. Extensions cannot function without the session API and extension installer.
- **Sessions + Terminal together** because they are tightly coupled (session list is useless without terminal attachment) and they validate the entire extension development workflow.
- **Secrets before Self-Improve** because self-improve needs GitHub PAT from secrets, and baking correct encryption from the start avoids a painful migration later.
- **Self-Improve last among extensions** because it is the most complex (MCP server + webview + extension lifecycle) and depends on all preceding components working.
- **Deployment last** because it is configuration and hardening, not new functionality. Getting it working locally first reduces debugging surface area.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Core Extensions):** Session status detection via tmux scraping is heuristic-based. Need to research tmux hooks (`after-new-session`, `session-closed`) and `tmux wait-for` for event-driven status updates instead of polling. Also need to validate the VS Code terminal profile API for creating custom terminal providers.
- **Phase 3 (Secrets):** The encryption scheme (PBKDF2 key derivation, envelope encryption, IV management) needs a focused security review during implementation. Research whether `crypto.scryptSync` is preferable to PBKDF2 for this use case.
- **Phase 4 (Self-Improve):** The MCP server registration/deregistration lifecycle with Claude Code needs hands-on testing. The `claude mcp add` CLI behavior around scopes (global vs. project) and the interplay with `.mcp.json` files needs validation. Also research whether Claude Code's Agent Teams API could simplify self-improvement orchestration.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Supervisor):** Fastify HTTP server, tmux CLI commands, Docker multi-stage builds, esbuild compilation -- all extremely well-documented with established patterns. The Stack research provides complete code examples.
- **Phase 5 (Deployment):** Railway Docker deployments, health checks, persistent volumes -- well-documented in Railway's official docs.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified against official docs, npm registries, and release schedules. Node 22 LTS, Fastify 5, Zod 4, esbuild -- all actively maintained with thousands of production deployments. Version pinning strategy accounts for the TS 6.0/7.0 transition. |
| Features | HIGH | Competitive landscape well-mapped across cloud IDEs, agentic IDEs, and agent platforms. Table stakes and differentiators clearly separated. Anti-features identified (no chat UI, no code completion, no multi-LLM). Feature dependencies mapped with critical path identified. |
| Architecture | HIGH | Four-layer architecture follows established patterns (supervisor sidecar, tmux process boundary, VS Code extension APIs). Build order validated against dependency graph. Anti-patterns documented with concrete alternatives. All sources are official documentation. |
| Pitfalls | HIGH | Eight critical pitfalls identified with specific prevention strategies. All backed by GitHub issues with reproduction steps and community confirmation. Pitfall-to-phase mapping provides clear guidance on when to address each one. Recovery strategies documented for each. |

**Overall confidence:** HIGH

### Gaps to Address

- **Session status detection accuracy:** The heuristic approach (scraping tmux pane content to determine active/idle/waiting) is fragile. Need to validate how reliable this is in practice during Phase 2 implementation. Consider polling Claude Code's `/status` endpoint if one exists, or using tmux hooks as an alternative.

- **@vscode/webview-ui-toolkit maintenance status:** This Microsoft project's maintenance has slowed. If it becomes abandoned before Phase 3, fall back to plain CSS matching VS Code's CSS custom properties (`--vscode-button-background`, etc.). Monitor the GitHub repo during implementation.

- **MCP SDK v2 migration path:** v2 is anticipated Q1 2026 (potentially imminent). If it ships before Phase 4, evaluate whether to adopt it directly or stick with v1. The `^1.27` pin allows minor updates but v2 may have breaking changes.

- **Claude Code install method stability:** The recommended install method (curl) may change. The npm package is deprecated. Verify the install URL and method before finalizing the Dockerfile.

- **code-server product.json behavior across updates:** Documentation for product.json branding was removed from code-server docs (Issue #4431). The feature still works but is undocumented. Test that the `--product` flag survives code-server updates.

## Sources

### Primary (HIGH confidence)
- [VS Code Extension API](https://code.visualstudio.com/api) -- extension development, webview API, activation events, manifests
- [code-server releases](https://github.com/coder/code-server/releases) -- v4.109.x, actively maintained
- [Node.js releases](https://nodejs.org/en/about/previous-releases) -- Node 22 LTS active through 2027
- [Fastify npm](https://www.npmjs.com/package/fastify) -- v5.8.2, performance benchmarks vs Express
- [Zod v4 release notes](https://zod.dev/v4) -- 6.5x faster, stable
- [MCP Architecture Overview](https://modelcontextprotocol.io/docs/learn/architecture) -- host/client/server relationships
- [Claude Code MCP Documentation](https://code.claude.com/docs/en/mcp) -- `claude mcp add`, scopes, configuration
- [Railway docs](https://docs.railway.com/) -- volumes, Dockerfiles, deployment configuration
- [esbuild](https://esbuild.github.io/) -- bundling guidance, VS Code recommends for extensions
- [tmux man page](https://man7.org/linux/man-pages/man1/tmux.1.html) -- send-keys, capture-pane, session management

### Secondary (MEDIUM confidence)
- [Claude Code GitHub Issues](https://github.com/anthropics/claude-code/issues) -- memory leaks (#4851, #10881, #22188, #27421), tmux race (#23513), MCP persistence (#7936)
- [code-server GitHub Issues](https://github.com/coder/code-server/issues) -- VSIX marketplace (#7660), product.json (#4431)
- [vsce GitHub Issues](https://github.com/microsoft/vscode-vsce/issues) -- pnpm compatibility (#1154)
- [Docker Node.js volume permissions](https://github.com/nodejs/docker-node/issues/837) -- non-root user volume mount issues
- [Railway community](https://station.railway.com/) -- volume permissions with non-root users
- [Anthropic 2026 Agentic Coding Trends Report](https://resources.anthropic.com/2026-agentic-coding-trends-report)

### Tertiary (LOW confidence)
- [@vscode/webview-ui-toolkit](https://github.com/microsoft/vscode-webview-ui-toolkit) -- maintenance status uncertain, may need fallback plan
- [MCP SDK v2 timeline](https://github.com/modelcontextprotocol/typescript-sdk) -- anticipated Q1 2026 but not confirmed
- Claude Code install URL (`https://claude.ai/install.sh`) -- verify before Dockerfile finalization

---
*Research completed: 2026-03-11*
*Ready for roadmap: yes*
