# Project Research Summary

**Project:** ClaudeOS v1.2 — UI Polish & Workspaces
**Domain:** VS Code extension ecosystem — theming, workspace management, terminal UI, browser integration
**Researched:** 2026-03-18
**Confidence:** HIGH (theming, workspace, pitfalls) / MEDIUM (Chrome bridge, self-testing)

## Executive Summary

ClaudeOS v1.2 is a polish and differentiator release for an existing, working product. The codebase already validates the foundational stack (Fastify 5, React 19, VS Code extension APIs, tmux, code-server). Research confirms four parallel workstreams — unified VS Code theming, session terminal redesign, workspace manager, and Chrome browser integration — but these must be built sequentially rather than in parallel. Theming must come first: the `claudeos-theme` extension registers custom CSS color IDs that every other webview depends on. Building session views or workspace UI before this step means rewriting CSS twice.

The single most critical architectural decision for this release is the session terminal redesign. Research documents two viable approaches: a hybrid model (webview panel for session metadata overlay, existing Pseudoterminal retained for actual I/O) vs. a full xterm.js-in-webview replacement. The hybrid model is strongly preferred. Full xterm.js webview replacement introduces CSP restrictions on the WebGL renderer, a well-documented FitAddon resize-to-1-column bug across 15+ GitHub issues, and GPU context exhaustion at scale. The hybrid approach delivers the visual improvement — rich session cards, metadata overlays, styled status — without abandoning the working terminal infrastructure.

The Chrome integration track (browser session manager + UI self-testing) is partially blocked by a container-to-browser networking constraint: native messaging does not cross the Docker boundary to the user's local Chrome. The realistic v1.2 scope is WebSocket-based supervisor communication, scaffolded VS Code extension UI, and Claude-in-Chrome skill files. The actual browser automation loop requires either local-only deployment or a future network bridge. These tracks should be implemented in parallel with the main UI work, with clear documentation that Chrome features are local-deployment-only for v1.2.

## Key Findings

### Recommended Stack

The v1.2 additions are minimal and build on the validated base stack. No major new frameworks are needed. The session terminal redesign adds the `@xterm` scoped package family. The theme system, workspace manager, and browser session VS Code extension all use built-in VS Code APIs exclusively — zero new npm packages for those three. The Chrome extension uses standard MV3 APIs.

**Core technologies:**
- `@xterm/xterm ^6.0.0`: Terminal rendering in webview panels — the same library powering VS Code's own terminal, released December 2025, ESM-bundleable with esbuild; use scoped package exclusively (unscoped `xterm` is deprecated)
- VS Code `contributes.themes` + `contributes.colors`: Declarative theme extension — no runtime activate() code needed, CSS variables auto-propagate to all webviews once extension is installed
- VS Code `updateWorkspaceFolders()`: Workspace switching — stable API, multi-root mode does NOT trigger window reload (critical for preserving extension state)
- Chrome MV3 + WebSocket to supervisor: Browser extension communication — avoids native messaging OS path registration complexity entirely
- Claude in Chrome (stock Claude Code feature): Browser automation for self-testing — no custom tooling, works via user's existing Chrome

**What NOT to add:**
- `@vscode/webview-ui-toolkit` — archived/deprecated January 2025, underlying FAST Foundation library deprecated
- Playwright or `chrome-devtools-mcp` — explicitly prohibited in project todos; also requires Chrome in container (400MB+)
- Chrome/Chromium in the Docker container — wrong architectural fit, massive image bloat, not how Claude in Chrome is designed

### Expected Features

**Must have (table stakes):**
- Custom ClaudeOS color theme extension — foundation for all visual work; declarative, zero runtime cost; must ship before other UI features
- Unified VS Code theming across all webviews — 20+ hardcoded hex values in Home panel, 18+ in wizard `theme.css`; broken on any non-default theme
- Copilot UI removal — `chat.disableAIFeatures: true` + `github.copilot.enable: {"*": false}` in `settings.json`; activity bar slot freed for workspace-manager
- Home page auto-open on startup — already implemented in extension, just not triggered; change `workbench.startupEditor` from `"none"`
- Session terminal auto-resize — `setDimensions` on `SessionPseudoterminal` is not implemented; terminal wraps at wrong column width, usability bug
- Default extensions repo restructure — move to `default-extensions/` directory; pure housekeeping, update Nix/Dockerfile paths

**Should have (differentiators):**
- Workspace manager extension — replaces Copilot sidebar slot; switchable project directories with isolated sessions; highest-impact differentiator in the release
- Session view redesign — richer session cards via WebviewView replacing TreeView; shows metadata, status, conversation context alongside terminal
- Claude in Chrome VS Code extension — read-only monitoring UI for browser sessions; scaffolding for future deep integration
- UI self-testing skill files — teaches Claude Code how to test its own UI via Claude in Chrome; `.claude/commands/browser-test.md`

**Defer to v2+:**
- Full xterm.js webview terminal replacing Pseudoterminal entirely — hybrid model covers the UX goal at much lower risk and complexity
- Cross-container Chrome native messaging bridge — `bridge.claudeusercontent.com` upstream solution in development
- Headless Chrome in container for CI visual testing — 400MB image addition, local-only feature for v1.2
- Custom VS Code marketplace service — out of scope per PROJECT.md
- Separate code-server instances per workspace — resource-prohibitive in container

### Architecture Approach

The v1.2 architecture adds three new extensions (`claudeos-theme`, `claudeos-workspace-manager`, `claudeos-browser`) and modifies three existing ones (`claudeos-sessions` for webview overlay + xterm.js, `claudeos-home` and `claudeos-secrets` for CSS variable migration). The supervisor needs minor additions: a `chromeEnabled` field in the session schema and CORS headers via `@fastify/cors`. The critical architectural pattern is strict separation between the declarative theme layer and the functional webview layer — webviews consume `var(--vscode-claudeos-*)` variables, never define them.

**Major components:**
1. `claudeos-theme` extension — declarative only (no activate() code); contributes ClaudeOS Dark color theme and custom color IDs (`claudeos.accent`, etc.); auto-set as default via `config/settings.json`
2. `claudeos-workspace-manager` extension — TreeView sidebar using `updateWorkspaceFolders()`; persists state in `context.globalState` (survives folder switches without window reload); replaces Copilot activity bar slot; exposes active workspace path via `getExtension().exports` (established pattern in ClaudeOS)
3. Session WebviewPanel (inside `claudeos-sessions`) — hybrid model: WebviewView for rich session metadata cards, Pseudoterminal retained for actual terminal I/O; xterm.js available as an enhancement but not the I/O pathway
4. `claudeos-browser` extension — read-only monitoring UI; polls supervisor API for `chromeEnabled` session metadata; shows browser session cards
5. Supervisor CORS additions — `@fastify/cors` restricted to Chrome extension origin + localhost; WebSocket upgrade CORS headers

**Key data flows:**
- Theme: `claudeos-theme` package.json contributes → VS Code theme engine → `var(--vscode-claudeos-accent)` CSS vars → all webviews automatically
- Terminal I/O (retained path): Supervisor WS → Extension Host (WsClient) → Pseudoterminal.onDidWrite → VS Code terminal tab
- Session metadata (new path): Supervisor REST API → Extension Host → postMessage → WebviewView session cards
- Workspace state: `updateWorkspaceFolders()` → VS Code Explorer + `onDidChangeWorkspaceFolders` → sessions extension re-filters by active workspace path
- Chrome extension: Chrome popup → `ws://localhost:3100` (supervisor WS with keepalive) → session list and output

### Critical Pitfalls

1. **Hardcoded colors in existing webviews block theme unification** — The Home panel has 20+ hardcoded hex values; the wizard `theme.css` has 18+. All must be replaced with `var(--vscode-*)` references BEFORE building the theme extension. If the theme extension ships first, users see a polished editor but broken panels. This is prerequisite work, not optional cleanup.

2. **xterm.js in webview: FitAddon resize-to-1-column, CSP/WebGL blocks, GPU context exhaustion** — 15+ documented xterm.js GitHub issues on FitAddon in webviews (issues #4841, #5320). Prevention: use the hybrid model (Pseudoterminal handles I/O, webview handles metadata display). If xterm.js is required for display, use DOM renderer not WebGL, call `fit()` after `requestAnimationFrame` + 50ms delay, dispose terminals on panel hide.

3. **Chrome extension MV3 service worker 30-second timeout kills WebSocket** — Silent disconnection during long Claude operations (Claude thinking, no output for 30+ seconds). Prevention: 20-second ping/pong heartbeat from both extension and supervisor sides; design reconnection with `chrome.storage.local` session state cache from day one.

4. **Workspace folder switching resets extension state if using `vscode.openFolder`** — `vscode.commands.executeCommand('vscode.openFolder', uri)` in single-root mode triggers a full window reload, losing all sidebar state and open terminals. Prevention: use `updateWorkspaceFolders()` (multi-root mode), which does NOT reload the window. Persist all tree state in `globalState`.

5. **Theme extension color token coverage gaps** — VS Code has 400+ color tokens; defining only the 30-50 obviously visible ones leaves jarring default colors in diff editor, debug toolbar, merge conflict view, notifications, and peek view. Prevention: extend a base theme via the `include` field to inherit all Default Dark Modern defaults, then override only brand-specific tokens. Test with git diff view and debug panel open.

## Implications for Roadmap

Based on the dependency graph confirmed across FEATURES.md, ARCHITECTURE.md, and PITFALLS.md, four sequential phases are recommended. The browser track (Phase 4) can begin in parallel with Phase 3 once CORS prerequisites from Phase 2 are complete.

### Phase 1: Unified Theming Foundation

**Rationale:** Every subsequent phase produces UI that inherits from this foundation. The `var(--vscode-claudeos-accent)` CSS variable does not exist until the theme extension registers its `contributes.colors`. Building session views or workspace UI before this step means doing CSS work twice.

**Delivers:** `claudeos-theme` extension (ClaudeOS Dark theme as default), all webview CSS migrated from hardcoded hex to `--vscode-*` variables, Copilot UI disabled in `settings.json`, home page auto-open on startup, default extensions directory restructured.

**Addresses features:** Custom ClaudeOS theme extension, unified VS Code theming, Copilot UI removal, home page auto-open, default extensions restructure.

**Avoids:** Pitfall 1 (hardcoded colors — audit and replace before building theme, not after), Pitfall 5 (token coverage — extend base theme, systematic review), Pitfall 6 (stale JS-cached colors — use CSS variables only, never cache in JavaScript), Pitfall 10 (wizard/code-server visual transition — align palettes using shared design tokens), Pitfall 11 (extensionDependencies fragility — use `settings.json` default, no hard dependency between extensions).

**Research flag:** Standard patterns, skip research-phase. VS Code's `contributes.themes`, `contributes.colors`, and CSS variable propagation to webviews are fully documented in official VS Code Extension API docs and proven in the existing `claudeos-home` webview.

### Phase 2: Session View Redesign

**Rationale:** The terminal and session view is the most-used surface in ClaudeOS. Fixing terminal auto-resize (an existing usability bug) and adding rich session metadata cards delivers immediate user value. This phase must come before the workspace manager because workspace manager adds session filtering, which requires a stable sessions extension.

**Delivers:** `SessionPseudoterminal.setDimensions()` implemented (auto-resize), session view upgraded from TreeView to WebviewView with rich session cards (metadata, status, token usage, recent messages), xterm.js bundled for webview display layer (hybrid model — Pseudoterminal retained for I/O).

**Addresses features:** Session terminal auto-resize, session view redesign with terminal-UI styling.

**Avoids:** Pitfall 2 (xterm.js CSP/resize/GPU — hybrid model keeps Pseudoterminal for I/O; xterm.js in webview used for display only, with DOM renderer and debounced FitAddon if needed), Pitfall 13 (wrong xterm package — use `@xterm/xterm` v6.0.0 scoped package, not deprecated unscoped `xterm`).

**Research flag:** Needs `/gsd:research-phase` for the xterm.js keyboard passthrough issue specifically. VS Code intercepts Ctrl+C, Ctrl+P, Ctrl+Shift+`, and other keystrokes before webview content receives them. Whether the hybrid model fully avoids this (since Pseudoterminal handles actual I/O and the webview is display-only) or whether custom `when`-clause keybindings are still required needs confirmation before implementation.

### Phase 3: Workspace Manager

**Rationale:** Independent of session view redesign at the API level, but the workspace manager takes the Copilot sidebar slot (cleared in Phase 1) and integrates with the sessions extension (stabilized in Phase 2). Highest-impact differentiator of the release.

**Delivers:** `claudeos-workspace-manager` extension with TreeView sidebar, `updateWorkspaceFolders()` workspace switching, `WorkspaceConfig` persisted in `globalState`, session filtering by active workspace path (via `getExtension().exports` inter-extension pattern), workspace path passed to supervisor `POST /sessions { workdir }`.

**Addresses features:** Workspace manager with persistent tabbed workspaces, session-workspace association.

**Avoids:** Pitfall 4 (Copilot sidebar reappearing after code-server updates — pin code-server version in `flake.nix`, test after upgrades, use `chat.disableAIFeatures` as primary lever), Pitfall 7 (folder switching state reset — use multi-root `updateWorkspaceFolders()` not `vscode.openFolder`), Pitfall 14 (absolute paths in .code-workspace files — use relative paths, store in persistent `/data/` volume).

**Research flag:** Standard patterns for the VS Code API layer (`updateWorkspaceFolders`, TreeView, `globalState` persistence). However, `/gsd:research-phase` recommended for the sessions-workspace integration: the `getExtension().exports` pattern works in ClaudeOS (used by secrets extension) but how real-time workspace path changes propagate to the sessions extension's live session list — and whether this requires event subscription vs. polling — needs design review before implementation.

### Phase 4: Browser Extension and Self-Testing

**Rationale:** Partially blocked by container-to-Chrome networking constraints. Phase 4 delivers scaffolding and the locally-functional implementation. CORS prerequisites are met in Phase 2 (supervisor changes). Document clearly that Chrome features require local deployment for v1.2.

**Delivers:** `claudeos-browser` VS Code extension (read-only session monitoring UI), supervisor CORS configuration (`@fastify/cors` with Chrome extension origin allowlist), `chromeEnabled` field in session schema, `.claude/commands/browser-test.md` skill file, self-improve extension updated to reference browser testing skill.

**Addresses features:** Claude in Chrome browser session manager, UI self-testing workflow.

**Avoids:** Pitfall 3 (MV3 30s service worker timeout — 20-second heartbeat, reconnection-first design with `chrome.storage.local`), Pitfall 8 (native messaging path complexity — WebSocket to localhost only, never native messaging), Pitfall 9 (screenshot test flakiness — Docker-based baselines, DOM assertions over pixel comparison, disable animations before screenshots), Pitfall 12 (WebSocket CORS/mixed content — connect from service worker not popup, `wss://` for Railway, CORS headers on supervisor), Pitfall 15 (self-testing feedback loop — test-prefixed sessions, read-only assertions preferred, session count guard rails).

**Research flag:** Needs `/gsd:research-phase` for the Railway WebSocket proxy configuration. The Chrome extension's service worker connecting via `wss://` to the containerized supervisor needs Railway's reverse proxy to correctly handle WebSocket upgrade requests from a Chrome extension origin. Not yet verified in the current Railway configuration. Also needs design for Chrome extension auth — whether it can use the user's active code-server session cookie or requires a separate token.

### Phase Ordering Rationale

- **Theme before everything:** `var(--vscode-claudeos-accent)` and sibling custom color variables do not exist until the theme extension registers `contributes.colors`. CSS written against these variables before the extension exists fails silently (resolves to empty). No other phase can use ClaudeOS brand colors correctly until Phase 1 ships.
- **Session view before workspace manager:** The workspace manager adds session filtering by workspace path to the sessions extension. Filtering a sessions extension that is mid-redesign creates integration thrash. Phase 2 must be stable before Phase 3 integrates with it.
- **Browser extension after supervisor CORS:** The Chrome extension requires CORS headers on the supervisor. These supervisor changes are scoped to Phase 2's session metadata additions. Phase 4 builds on a stable supervisor API.
- **Default extensions restructure** (directory rename) fits inside Phase 1 as pure housekeeping — Dockerfile and Nix path changes only, no feature work.

### Research Flags

Needs `/gsd:research-phase` during planning:
- **Phase 2 (xterm.js keyboard passthrough):** Confirm whether VS Code's key interception in webview context is fully avoided by the hybrid model, or whether custom `when`-clause keybindings are required.
- **Phase 3 (inter-extension workspace filtering):** Confirm `getExtension().exports` pattern works for real-time workspace path updates propagating to the sessions extension's live session list.
- **Phase 4 (Railway WSS proxy + Chrome extension auth):** Verify WebSocket proxying handles Chrome extension service worker connections; design auth token flow.

Standard patterns — skip research-phase:
- **Phase 1 (theming):** `contributes.themes`, `contributes.colors`, CSS variable propagation — official VS Code docs, proven in existing ClaudeOS webviews.
- **Phase 3 (workspace API):** `updateWorkspaceFolders()` is the official VS Code multi-root API with detailed migration documentation and code-server support.
- **Phase 4 (MV3 WebSocket keepalive):** Chrome 116+ WebSocket keepalive in service workers is documented; 20-second heartbeat pattern is standard.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All additions use official VS Code APIs or scoped xterm.js packages with official releases. Deprecations (webview-ui-toolkit, unscoped xterm) confirmed via official notices. |
| Features | HIGH | Feature list derived primarily from project todos and direct codebase analysis — ground truth sources. Complexity estimates are bottom-up with specific file references. |
| Architecture | HIGH (theming, workspace) / MEDIUM (terminal webview, Chrome) | VS Code theming and multi-root workspace patterns fully documented. xterm.js keyboard handling in webview is empirically uncertain. Chrome-to-container networking has a known open constraint. |
| Pitfalls | HIGH | 16 specific pitfalls with GitHub issue references, official doc citations, and direct codebase observations. FitAddon resize bugs, MV3 service worker timeout, and theme token gaps all independently verified. |

**Overall confidence:** HIGH for Phases 1 and 3, MEDIUM for Phases 2 and 4.

### Gaps to Address

- **xterm.js keyboard passthrough in webview context:** Requires hands-on testing to determine whether VS Code intercepts Ctrl+C (SIGINT) and other terminal-critical keystrokes when a webview panel has focus. If it does, the hybrid model (Pseudoterminal for all I/O) becomes mandatory, not just preferred. This decision gates Phase 2 architecture.

- **Chrome extension authentication with code-server:** The supervisor is behind code-server's password auth on Railway. The Chrome extension connecting via WebSocket will encounter this auth boundary. Design needed: does the extension use cookie-based auth from the user's active code-server browser session, or does it need a dedicated token flow? Not resolved in current research.

- **Nix `npmDepsHash` for new extensions:** The `wizardDist npmDepsHash` currently uses `lib.fakeHash` (existing tech debt in `flake.nix`). Adding `claudeos-theme` and `claudeos-workspace-manager` requires new correct hashes that must be generated on Linux. All fake hashes should be resolved together when new extensions are added during Phase 1 and Phase 3.

- **Copilot sidebar persistence vs. code-server version:** `chat.disableAIFeatures: true` is the documented setting, but code-server bug #7540 means the activity bar icon may persist regardless. Testing against the exact code-server version pinned in `flake.nix` is required before confirming whether settings alone solve this or whether the workspace-manager sidebar overtaking the slot is the primary solution.

## Sources

### Primary (HIGH confidence)
- [VS Code Color Theme Extension Guide](https://code.visualstudio.com/api/extension-guides/color-theme) — `contributes.themes`, `contributes.colors`, theme JSON format
- [VS Code Theme Color Reference](https://code.visualstudio.com/api/references/theme-color) — all 400+ color tokens, categories for systematic review
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview) — CSS variable propagation, CSP requirements, postMessage pattern
- [VS Code Contribution Points](https://code.visualstudio.com/api/references/contribution-points) — `contributes.themes`, `contributes.views`, `contributes.viewsContainers`
- [VS Code Multi-Root Workspaces](https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces) — `updateWorkspaceFolders()` API
- [VS Code Adopting Multi Root Workspace APIs](https://github.com/microsoft/vscode/wiki/Adopting-Multi-Root-Workspace-APIs) — workspace folder change behavior, extension lifecycle
- [@xterm/xterm on npm](https://www.npmjs.com/package/@xterm/xterm) — v6.0.0 current stable, ESM support, December 2025 release
- [Claude in Chrome Official Docs](https://code.claude.com/docs/en/chrome) — stock feature architecture, native messaging host, container constraints
- [Webview UI Toolkit Deprecation (issue #561)](https://github.com/microsoft/vscode-webview-ui-toolkit/issues/561) — archived January 2025
- [Chrome Extension Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) — 30-second idle timeout
- [Chrome MV3 WebSocket Guide](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets) — keepalive behavior since Chrome 116
- Existing ClaudeOS codebase — `claudeos-home/src/webview/home-panel.ts`, `claudeos-sessions/src/`, `config/settings.json`, `supervisor/wizard/src/theme.css`

### Secondary (MEDIUM confidence)
- [xterm.js FitAddon Resize Issues #4841](https://github.com/xtermjs/xterm.js/issues/4841) — FitAddon resize bugs in webviews, confirmed across multiple reports
- [xterm.js FitAddon Width=1 Bug #5320](https://github.com/xtermjs/xterm.js/issues/5320) — resize-to-1-column failure pattern
- [code-server Copilot Discussion #5063](https://github.com/coder/code-server/discussions/5063) — Copilot compatibility behavior
- [code-server chat.disableAIFeatures bug #7540](https://github.com/coder/code-server/issues/7540) — setting may not hide sidebar activity bar icon
- [Claude Code Chrome Integration Issues #20943](https://github.com/anthropics/claude-code/issues/20943) — native messaging host container limitations
- [Claude Code Service Worker Issue #15239](https://github.com/anthropics/claude-code/issues/15239) — autonomous workflow disconnection via MV3 timeout
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) — CDP-based browser automation reference

### Tertiary (LOW confidence)
- [OpenCode TUI Architecture](https://deepwiki.com/opencode-ai/opencode/4-terminal-ui-system) — reference for session view UX inspiration only; technology (Bubble Tea/Zig) is not applicable to ClaudeOS
- [VS Code Issue #276946](https://github.com/microsoft/vscode/issues/276946) — community discussion of xterm.js in VS Code webview panels, keyboard handling approaches

---
*Research completed: 2026-03-18*
*Ready for roadmap: yes*
