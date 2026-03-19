# Domain Pitfalls

**Domain:** UI polish, workspace management, terminal UI redesign, Chrome extension, and self-testing for VS Code extension ecosystem (ClaudeOS v1.2)
**Researched:** 2026-03-18
**Confidence:** HIGH (verified across VS Code API docs, xterm.js issue tracker, Chrome extension docs, Playwright docs, and codebase analysis)

> This file covers pitfalls specific to ADDING unified theming, workspace management, terminal UI (xterm.js in webview), Chrome extension integration, and UI self-testing to the existing ClaudeOS v1.0/v1.1 system.
> For v1.0 foundational pitfalls (tmux race conditions, memory leaks, volume permissions) and v1.1 onboarding pitfalls (setup wizard race conditions, OAuth redirect URIs, encryption key storage), see git history.

---

## Critical Pitfalls

Mistakes that cause rewrites, broken user experiences, or architectural dead ends.

### Pitfall 1: Hardcoded Colors in Existing Webviews Break Theme Unification

**What goes wrong:** The existing Home panel (`claudeos-home/src/webview/home-panel.ts`) and wizard UI (`supervisor/wizard/src/theme.css`) both use hardcoded hex colors that do not respond to VS Code theme changes. The Home panel has `#c084fc` for accent, `#7c3aed` for gradient, and `#22c55e`/`#facc15`/etc. for status badges. The wizard uses a completely separate color system (`#d4a054` gold accent, `#0a0a0c` background). When a user switches to a light theme or any non-default-dark theme, these hardcoded colors produce unreadable text, invisible elements, or jarring mismatches.

**Why it happens:** The v1.0/v1.1 implementation was built for "Default Dark Modern" only (the single theme set in `config/settings.json`). Hardcoded colors were faster to implement than building a proper theme variable system. The home panel uses `var(--vscode-*)` CSS variables for some elements (editor background, foreground, sidebar) but falls back to hardcoded colors for brand accents and status indicators. The wizard runs outside code-server entirely (served by the supervisor before code-server boots), so it has no access to VS Code CSS variables at all.

**Consequences:** The "unified theming" milestone goal is impossible without replacing every hardcoded hex value. If you add a custom theme extension without fixing existing webviews first, users see a polished theme in the editor but broken colors in every ClaudeOS panel. The wizard is a special case -- it runs pre-code-server and genuinely cannot use `--vscode-*` variables.

**Prevention:**
1. **Audit and replace all hardcoded colors in webview HTML.** The Home panel has ~20 hardcoded hex values that must become `var(--vscode-*)` references. Map each: `#c084fc` (accent) -> `var(--vscode-textLink-foreground)` or a custom `--claudeos-accent` that is set FROM a VS Code variable. Status colors (`#22c55e`, `#facc15`, etc.) should use `var(--vscode-testing-iconPassed)`, `var(--vscode-editorWarning-foreground)`, etc.
2. **Define ClaudeOS-specific CSS variables** that reference VS Code variables with fallbacks: `--claudeos-accent: var(--vscode-textLink-foreground, #c084fc)`. This gives brand consistency while respecting theme switching.
3. **The wizard is an exception.** Since it runs before code-server, it cannot use VS Code theme variables. Keep its own theme system but ensure the color palette matches the custom ClaudeOS theme extension. The transition from wizard to code-server should feel seamless, not jarring.
4. **Test with at least 3 themes:** Default Dark Modern, a popular light theme (e.g., GitHub Light), and High Contrast. Use the `vscode-light`/`vscode-dark`/`vscode-high-contrast` body classes for conditional styling.

**Detection:** Switch theme to "Light+" in code-server. Open the Home panel. If text is invisible against the background or status badges are unreadable, hardcoded colors remain.

**Phase:** Must be the FIRST thing done in the theming phase, before building the custom theme extension. Fixing existing webviews is prerequisite work.
**Confidence:** HIGH -- directly observed in codebase analysis. 20+ hardcoded hex values confirmed in `home-panel.ts`, 18+ in `theme.css`.

---

### Pitfall 2: xterm.js in a Webview Panel Has CSP, Resize, and Performance Traps

**What goes wrong:** The v1.2 session view redesign calls for an "opencode-like" terminal UI rendered via xterm.js inside a VS Code webview panel (replacing the current Pseudoterminal approach). This introduces three interconnected problems:

**(a) Content Security Policy blocks WebGL/canvas renderer.** VS Code webviews enforce a strict CSP. The xterm.js WebGL renderer creates blob URLs for shaders and uses `eval()`-like patterns. The default webview CSP (`default-src 'none'; script-src ${cspSource}`) blocks both `blob:` sources and inline evaluation. You get a blank terminal or a fallback to the DOM renderer (which is 10x slower for scrollback).

**(b) FitAddon resize is broken in webviews.** xterm.js `@xterm/addon-fit` calculates terminal dimensions from the container element's pixel size. Inside a VS Code webview, the container dimensions are not available during the initial render (the webview iframe has not been laid out yet). `fit()` called in `open()` calculates 0x0 or 1x1 dimensions. Subsequent resize events from the webview container do not propagate correctly to the xterm.js instance because the webview iframe resize is asynchronous. This is the single most reported xterm.js integration issue -- over 15 GitHub issues document variations of this bug.

**(c) Memory leaks from terminal instances.** Each session terminal creates an xterm.js `Terminal` instance with a canvas/WebGL context. Opening 5+ sessions simultaneously in webview panels can exhaust GPU contexts (most browsers limit to ~16 WebGL contexts). Terminals that are hidden (panel not focused) still hold their GPU resources.

**Why it happens:** The current implementation uses `vscode.Pseudoterminal` which delegates all rendering to VS Code's built-in terminal renderer. It works perfectly. Switching to a webview-based xterm.js renderer means taking ownership of rendering, CSP, resize, and lifecycle -- problems that VS Code's terminal infrastructure already solves.

**Consequences:** Without careful handling, the redesigned session view will be slower, buggier, and more resource-intensive than the current Pseudoterminal approach. Users will see blank terminals, incorrectly sized terminals, or browser tab crashes from GPU context exhaustion.

**Prevention:**
1. **Keep Pseudoterminal for actual terminal I/O.** Do not replace the working Pseudoterminal with xterm.js in a webview. Instead, use a hybrid approach: the session "view" is a webview that shows session metadata, status, and controls. The terminal itself remains a VS Code terminal tab (Pseudoterminal). The webview has a "Focus Terminal" button that switches to the terminal panel.
2. **If xterm.js in webview is required:** Use the DOM renderer (not WebGL/canvas) to avoid CSP issues. Accept the performance cost for session scroll-back viewing (read-only mode). Add `blob:` to the CSP `worker-src` directive if WebGL is needed. Use `ResizeObserver` on the xterm container (not the webview body) and debounce `fit()` calls by 100ms. Dispose terminal instances when the webview is hidden (`onDidChangeViewState`).
3. **FitAddon workaround:** Call `fit()` after a `requestAnimationFrame` + 50ms `setTimeout` delay on initial render. Re-call `fit()` on `ResizeObserver` callback with debounce. Never call `fit()` synchronously in the webview message handler.
4. **Use `@xterm/xterm` v5.4+ (scoped package).** The old `xterm` npm package is deprecated. The new `@xterm/xterm` and `@xterm/addon-fit` packages have bug fixes for resize issues.

**Detection:** Open the session view webview. If the terminal shows 1 column width, is blank, or has scroll artifacts -- resize handling is broken. Open 10+ session terminals. If the browser tab crashes or becomes unresponsive -- GPU context exhaustion.

**Phase:** Session view redesign phase. Architectural decision (hybrid vs. full webview terminal) must be made first.
**Confidence:** HIGH -- verified across 15+ xterm.js GitHub issues on FitAddon. CSP restrictions verified via VS Code webview API docs.

---

### Pitfall 3: Chrome Extension MV3 Service Worker Termination Kills Long-Running Operations

**What goes wrong:** The Chrome extension for "Claude in Chrome" will communicate with the ClaudeOS supervisor via WebSocket over localhost. In Manifest V3, the extension's service worker (background script) is terminated after 30 seconds of inactivity. A WebSocket connection that goes quiet for 30 seconds (e.g., Claude is thinking, no output streaming) causes the service worker to die. The WebSocket closes. The connection state is lost. When the service worker restarts (triggered by the next user action), it must re-establish the WebSocket, re-authenticate, and re-subscribe to session events. This creates a broken, inconsistent experience -- sessions appear to disconnect and reconnect randomly.

**Why it happens:** Manifest V3 replaced persistent background pages with event-driven service workers to reduce resource usage. Chrome gives a 30-second idle timeout that resets on extension API calls or message exchanges. WebSocket messages DO reset the timer (since Chrome 116), but only if messages are actually being exchanged. Silent periods (waiting for Claude to think) do not generate messages.

**Consequences:** The Claude in Chrome extension will appear unreliable. Sessions disconnect during long-running Claude operations. Users will report "extension keeps disconnecting." Autonomous/agentic workflows that take minutes of computation will lose their WebSocket connection.

**Prevention:**
1. **Implement a WebSocket ping/pong heartbeat.** Send a lightweight ping message every 20 seconds from BOTH the extension and the supervisor. This resets the 30-second idle timer. The supervisor already has WebSocket infrastructure (`ws-client.ts`); add a ping handler.
2. **Use the offscreen document pattern as fallback.** For Chrome versions < 116 (where WebSocket messages do not extend lifetime), create an offscreen document that holds the WebSocket connection and relays messages to the service worker via `chrome.runtime.sendMessage`. The offscreen document has no 30-second limit.
3. **Design for reconnection.** Even with keepalive, treat disconnection as inevitable. The extension must maintain a session state cache in `chrome.storage.local`. On reconnect, re-subscribe and diff state rather than starting fresh. Use exponential backoff for reconnection attempts.
4. **Do NOT use `chrome.runtime.connect()` port-based keepalive.** This technique keeps the service worker alive for only 5 minutes before Chrome force-disconnects the port. It is a temporary workaround, not a solution.

**Detection:** Open the Chrome extension, connect to a session. Let Claude think for 45+ seconds with no output. Check if the WebSocket connection is still alive. If dead, the keepalive mechanism is missing.

**Phase:** Chrome extension development phase. Must be designed into the WebSocket architecture from the start, not bolted on later.
**Confidence:** HIGH -- verified via Chrome extension service worker lifecycle docs, Claude Code GitHub issue #15239, and multiple Chromium extension forum threads.

---

### Pitfall 4: Removing Copilot from code-server Breaks on code-server Updates

**What goes wrong:** The v1.2 plan calls for removing the Copilot sidebar and replacing it with a workspace-manager sidebar. code-server bundles Copilot-related extensions as built-in extensions (via its patched VS Code base). Disabling them via `settings.json` (`"chat.disableAIFeatures": true`) works, but the sidebar icon/activity bar slot remains. Completely removing the activity bar contribution requires either: (a) a `product.json` override that excludes the extension, (b) patching the extension manifest post-install, or (c) using `when` clause overrides to hide UI contributions. Each approach has fragility risks.

**Why it happens:** code-server is a downstream fork of VS Code that tracks upstream VS Code releases. Built-in extensions are baked into the code-server build. Their presence is not configurable via `product.json` in the way marketplace extensions are. Each code-server update can re-add removed extensions or change the extension ID that needs suppressing.

**Consequences:** After a code-server update, the Copilot sidebar reappears alongside the workspace-manager sidebar. Two AI sidebar icons confuse users. Worse, if the Copilot extension activates and makes network requests, it may throw errors or leak extension API conflicts.

**Prevention:**
1. **Use the `chat.disableAIFeatures` setting** as the primary suppression mechanism. This is the officially supported setting and survives code-server updates.
2. **Override the activity bar visibility** in settings: set `"github.copilot.chat.terminalChatLocation": "chatView"` and similar settings to consolidate Copilot UI. Use `workbench.activityBar.visible` customizations.
3. **Do NOT patch or delete built-in extension files.** This breaks code-server's self-update mechanism and creates maintenance burden.
4. **Pin the code-server version** in `flake.nix` / Dockerfile. Do not use `latest`. Test each code-server upgrade for extension regressions before updating.
5. **If Copilot activity bar persists:** Create a small extension that contributes a `when` clause context key (`claudeos.copilotHidden == true`) and use it to conditionally hide Copilot's view contributions. This is hacky but stable across updates.

**Detection:** Update code-server to the latest version. Check if the Copilot sidebar icon reappears. Check if `chat.disableAIFeatures` still works.

**Phase:** Copilot removal phase. Test with the CURRENT code-server version in `flake.nix` first, then verify with the next release.
**Confidence:** MEDIUM -- `chat.disableAIFeatures` is documented and stable, but activity bar hiding depends on code-server's specific bundled extensions which may change. The Nix `pkgs.code-server` version is the controllable variable.

---

### Pitfall 5: VS Code Theme Extension Color Token Coverage Gap

**What goes wrong:** You create a custom ClaudeOS dark theme extension that defines colors for the editor, sidebar, terminal, etc. But VS Code has 400+ theme color tokens, and you only define the 30-50 that are immediately visible. Users discover jarring default colors in: the diff editor, merge conflict decorations, the debug toolbar, find/replace widget, breadcrumbs, minimap, peek view, notification toasts, and dozens of other UI elements that only appear in specific workflows. The theme looks polished on the home screen but broken in real use.

**Why it happens:** Theme authors test the happy path: editor + sidebar + terminal. VS Code's full color token list is enormous and most tokens only affect niche UI components. The `contributes.themes` in `package.json` does not warn about undefined tokens -- VS Code silently falls back to the base theme's defaults, which may clash with your custom colors.

**Consequences:** Users perceive the theme as "buggy" or "incomplete." They switch away from it. The unified theming goal is undermined because the fallback colors from the base theme (Default Dark Modern) create inconsistent visual zones.

**Prevention:**
1. **Extend an existing base theme, do not start from scratch.** Use `"uiTheme": "vs-dark"` in the theme contribution and set the `include` field to reference a base theme file. Override only the tokens you want to customize. Unset tokens inherit correctly from the base.
2. **Use a systematic token review.** VS Code's [Theme Color Reference](https://code.visualstudio.com/api/references/theme-color) lists all tokens by category. Walk through each category: Activity Bar, Side Bar, Editor, Editor Groups, Tabs, Panel, Status Bar, Title Bar, Menu Bar, Notifications, Extensions, Quick Input, Integrated Terminal, Debug, Testing, Git Decorations, Diff Editor, Merge Conflicts, Breadcrumbs, Snippets, Symbol Icons, Debug Icons, and Notebook. This is tedious but necessary for a complete theme.
3. **Test with the VS Code Developer: Inspect Editor Tokens and Scopes** command to verify syntax highlighting token coverage.
4. **Release the theme as a separate extension** with its own version cycle. Theme bugs can be fixed without rebuilding the entire ClaudeOS extension set.

**Detection:** Open a git diff view with the custom theme active. If merge conflict markers are invisible or the diff background colors clash with the editor -- token coverage is incomplete.

**Phase:** Theme extension creation phase.
**Confidence:** HIGH -- this is the universal complaint about custom VS Code themes. Every theme in the marketplace has issues with niche tokens.

---

## Moderate Pitfalls

### Pitfall 6: Webview Theme CSS Variables Are Stale After Theme Switch

**What goes wrong:** VS Code injects `--vscode-*` CSS variables into the webview's HTML element. When the user switches themes, VS Code updates these variables. HOWEVER, if the webview JavaScript has cached color values (e.g., read `getComputedStyle()` and stored in a JS variable, or used a canvas context with hardcoded colors), the cached values are stale. The CSS updates but the JS-driven rendering does not.

**Prevention:**
1. Use CSS variables directly in CSS rules, never cache them in JavaScript. If JS rendering is needed (canvas, charts), listen for the VS Code `colorThemeChanged` message and re-read all colors.
2. The `body` element's `class` attribute changes on theme switch (`vscode-dark` <-> `vscode-light`). Use a `MutationObserver` on `document.body` to detect theme changes and trigger re-renders.
3. For xterm.js in webview (if used): the terminal `theme` option must be re-applied on VS Code theme change. xterm.js does not automatically pick up CSS variable changes for its internal renderer.

**Phase:** Theming phase -- when wiring webviews to theme variables.
**Confidence:** HIGH -- documented in VS Code webview theming guide and multiple extension developer blog posts.

---

### Pitfall 7: Workspace Folder Switching Resets Extension State

**What goes wrong:** The workspace-manager feature allows users to switch the active workspace folder (the folder code-server is "opened" to). When code-server switches workspace folders, extensions may deactivate and reactivate. Tree view state, open editors, terminal sessions, and extension-contributed sidebar state can be lost. The session sidebar tree might re-collapse. The home panel webview might reset its scroll position.

**Why it happens:** VS Code's workspace lifecycle is complex. Opening a new folder calls `vscode.commands.executeCommand('vscode.openFolder', uri)`, which triggers a full window reload in single-root workspace mode. In multi-root workspace mode, adding/removing folders triggers `onDidChangeWorkspaceFolders` but does NOT reload the window -- extensions stay active but their file-system-relative state may become invalid.

**Consequences:** Users switching workspaces lose their sidebar state, open terminal tabs, and panel positions. The experience feels broken for a feature that is supposed to improve workflow management.

**Prevention:**
1. **Use multi-root workspace mode, not single-folder switching.** In multi-root mode, adding/removing workspace folders does NOT trigger a window reload. Extensions remain active. The user's sidebar state is preserved. This is the correct architectural choice for workspace management.
2. **Persist tree view state** in `context.workspaceState` or `context.globalState`. The session sidebar already uses `SessionStore` in memory -- ensure it survives workspace folder changes by not binding to `workspaceFolders[0]`.
3. **Test explicitly:** Add a workspace folder via the workspace manager, verify the session sidebar does not re-collapse, terminal tabs remain open, and the home panel webview retains its state.
4. **Use `.code-workspace` files** to persist workspace configurations. Store them in the ClaudeOS data directory so they survive container restarts.

**Phase:** Workspace management phase.
**Confidence:** HIGH -- documented in VS Code's [Adopting Multi Root Workspace APIs](https://github.com/microsoft/vscode/wiki/Adopting-Multi-Root-Workspace-APIs) wiki page.

---

### Pitfall 8: Chrome Extension Native Messaging Host Path Differs Per OS and Installation Method

**What goes wrong:** If the Chrome extension uses native messaging to communicate with the ClaudeOS supervisor (instead of WebSocket), the native messaging host manifest must be registered at a specific filesystem path that differs per operating system:
- macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
- Linux: `~/.config/google-chrome/NativeMessagingHosts/`
- Windows: Registry key

The host manifest must contain the absolute path to the executable. If the user installs ClaudeOS in a non-standard location, or uses a different Chromium-based browser (Brave, Edge, Arc), the path is different. Installation scripts that assume Chrome's default path fail silently -- the extension just says "Failed to connect to native messaging host" with no useful error.

**Why it happens:** Chrome's native messaging API was designed for desktop applications with installers, not for containerized web apps. The host registration is a one-time system-level setup that Chrome does not help with.

**Consequences:** The Chrome extension installation requires a manual, OS-specific setup step. This breaks the "zero friction" UX promise. Support requests flood in from users who installed correctly but targeted the wrong browser directory.

**Prevention:**
1. **Do NOT use native messaging.** Use WebSocket to localhost instead. The Chrome extension connects to `ws://localhost:3100` (the supervisor's existing WebSocket endpoint). This requires zero system-level installation. It works on all OSes and all Chromium-based browsers identically.
2. **WebSocket advantages:** The supervisor already exposes WebSocket for terminal output (`ws-client.ts`). Extending it for Chrome extension communication is minimal work. No filesystem registration, no OS-specific paths, no browser-specific directories.
3. **WebSocket trade-off:** The extension can only connect when ClaudeOS is running locally (or with port forwarding). For Railway-hosted instances, the WebSocket must go through the Railway reverse proxy, which requires `wss://` and proper upgrade handling. This is already handled by the existing WebSocket infrastructure.
4. **If native messaging is still needed for some reason:** Provide an installer script per OS (`install-chrome-host.sh`, `install-chrome-host.ps1`) and detect the browser profile directory automatically. Include Brave, Edge, Arc, and Chromium paths.

**Phase:** Chrome extension architecture phase. Must be decided before starting implementation.
**Confidence:** HIGH -- verified via Chrome native messaging docs. The path registration requirement is well-documented and is the #1 support issue for extensions that use native messaging.

---

### Pitfall 9: Visual Regression Tests Are Flaky in CI Due to Rendering Differences

**What goes wrong:** The UI self-testing workflow uses screenshot comparison to verify that ClaudeOS UI renders correctly. In CI, screenshots differ from local baselines because: (a) different OS renders fonts differently (Linux vs macOS), (b) different GPU (or no GPU) affects anti-aliasing and sub-pixel rendering, (c) headless Chrome renders slightly differently than headed Chrome, (d) animations caught mid-frame create non-deterministic diffs. A 0.1% pixel difference in font rendering triggers test failures on every CI run.

**Why it happens:** Screenshot comparison (via Playwright's `toHaveScreenshot()` or similar) uses pixel-level comparison. Any rendering variance -- font hinting, sub-pixel positioning, LCD anti-aliasing, GPU rasterization differences -- produces pixel diffs. This is not a bug; it is a fundamental limitation of pixel comparison across environments.

**Consequences:** Tests pass locally, fail in CI. Developers disable the visual tests or increase the diff threshold so high that real regressions slip through. The self-testing workflow becomes "always failing" noise rather than a useful safety net.

**Prevention:**
1. **Generate baselines IN the same environment as CI.** Never generate baselines on macOS and run CI on Linux. Use Docker for both baseline generation and test execution. The ClaudeOS Docker image is the natural environment for this.
2. **Use Playwright's `maxDiffPixelRatio` (not `maxDiffPixels`).** A ratio of `0.01` (1% of pixels) accommodates minor rendering differences while catching real regressions. Start at 1%, tighten as tests stabilize.
3. **Disable all animations before screenshots.** Inject CSS `* { animation: none !important; transition: none !important; }` via `page.addStyleTag()`. This eliminates the #1 source of flaky visual diffs.
4. **Mask dynamic content.** Use Playwright's `mask` option to exclude timestamps, session counts, and any element that changes between runs.
5. **Use a dedicated screenshot comparison tool** (e.g., Chromatic, Percy, or `reg-suit`) that understands anti-aliasing tolerance, rather than raw pixel comparison. These tools use perceptual diff algorithms that ignore sub-pixel rendering differences.
6. **For the self-testing use case (Claude tests its own UI):** Consider structural/DOM assertions instead of visual regression for most tests. Use `expect(page.locator('.session-card')).toHaveCount(3)` rather than screenshot comparison. Reserve screenshots for layout regression only.

**Phase:** Self-testing workflow phase.
**Confidence:** HIGH -- screenshot flakiness in CI is the most documented problem in visual testing. Every major visual testing guide from 2025-2026 leads with this warning.

---

### Pitfall 10: The Wizard UI Cannot Participate in VS Code Theming

**What goes wrong:** The setup wizard (`supervisor/wizard/`) is a standalone React app served by the supervisor's Fastify server BEFORE code-server boots. It has its own theme system (`theme.css`) with a gold/dark aesthetic (`#d4a054` accent, `#0a0a0c` background). When the user completes the wizard and transitions to code-server, the visual style changes completely -- from the wizard's warm gold theme to whatever VS Code theme is active. This creates a jarring "two different apps" feeling.

**Why it happens:** The wizard runs outside code-server's process. It is a separate React SPA served on port 3100. It has no access to VS Code's theme API or CSS variables. This is architecturally correct -- the wizard must work before code-server exists.

**Consequences:** The v1.2 "unified theming" goal has a gap: the wizard is permanently excluded from VS Code theme unification. If the custom ClaudeOS theme is purple-accented (matching the home panel's `#c084fc`) but the wizard is gold-accented, the overall brand feels inconsistent.

**Prevention:**
1. **Align the wizard's color palette with the custom ClaudeOS theme.** Decide on one brand accent color and use it in both the wizard `theme.css` and the VS Code theme extension. If the ClaudeOS theme uses purple accents, update the wizard to use purple too. This is a design decision, not a technical one.
2. **Generate the wizard's CSS from the same design tokens** that the VS Code theme uses. Use a shared `tokens.json` file (e.g., Style Dictionary format) that generates both `theme.css` for the wizard and `color-theme.json` for the VS Code extension. This ensures they stay in sync as the brand evolves.
3. **The transition animation (`LaunchTransition.tsx`) is the bridge.** Use the existing launch transition to visually fade between the wizard's aesthetic and code-server's. A smooth cross-fade is more important than exact color matching.

**Phase:** Theming phase -- when designing the ClaudeOS brand palette.
**Confidence:** HIGH -- observed in codebase. The wizard and code-server themes are entirely separate systems.

---

### Pitfall 11: `extensionDependencies` on the Theme Extension Creates Boot-Order Problems

**What goes wrong:** You create a `claudeos-theme` extension and add it to `extensionDependencies` in other ClaudeOS extensions (sessions, home, etc.) so the theme is always active. But `extensionDependencies` is a HARD dependency -- if the theme extension fails to install or activate, all dependent extensions refuse to activate. A broken VSIX build for the theme extension takes down the entire ClaudeOS UI.

**Why it happens:** VS Code's `extensionDependencies` field enforces activation order and treats missing dependencies as fatal errors. This is appropriate for functional dependencies (e.g., sessions depends on secrets for API access) but overkill for cosmetic dependencies like theming.

**Consequences:** A theme build regression prevents sessions, home, and all other extensions from activating. Users see an empty sidebar with no functionality. The blast radius of a theme bug is the entire application.

**Prevention:**
1. **Do NOT use `extensionDependencies` for the theme extension.** Themes should be independent. Other extensions should work with ANY theme.
2. **Use `extensionPack` instead** if you want to ensure the theme is installed alongside other extensions. Extension packs are install-time suggestions, not activation-time requirements.
3. **Set the theme as the default in `settings.json`** (`"workbench.colorTheme": "ClaudeOS Dark"`). If the theme extension is not installed, code-server falls back to "Default Dark Modern" gracefully.
4. **Install the theme extension via `default-extensions.json`** in the boot sequence, same as other first-party extensions. It is installed but not a hard dependency.

**Phase:** Theme extension packaging phase.
**Confidence:** HIGH -- VS Code extension dependency semantics are well-documented. This is a common mistake in multi-extension ecosystems.

---

## Minor Pitfalls

### Pitfall 12: Chrome Extension Localhost WebSocket Blocked by CORS and Mixed Content

**What goes wrong:** The Chrome extension's content script or popup tries to open a WebSocket to `ws://localhost:3100`. If the user is accessing ClaudeOS through `https://claudeos-xxx.up.railway.app`, the browser may block the connection as mixed content (HTTPS page connecting to WS, not WSS). Even if connecting from the extension's service worker (which is not subject to page-level mixed content rules), CORS headers on the WebSocket upgrade request may cause issues in some Chrome versions.

**Prevention:**
1. **Always connect from the service worker**, not from content scripts or the popup. Service workers are not bound by page-level mixed content policies.
2. **For Railway-hosted instances:** Use `wss://` (WebSocket Secure) through Railway's reverse proxy. The supervisor's WebSocket endpoint at `/ws` must be proxied by code-server or exposed alongside the HTTP API.
3. **For local instances:** `ws://localhost:3100` works fine from the service worker. No mixed content issue because `localhost` is treated as a secure context.
4. **Add CORS headers** to the supervisor's WebSocket upgrade handler for the Chrome extension's origin (`chrome-extension://<id>`).

**Phase:** Chrome extension development phase.
**Confidence:** MEDIUM -- service worker WebSocket connections bypass most restrictions, but Railway WebSocket proxying should be tested.

---

### Pitfall 13: xterm.js Package Scoping Migration (@xterm/xterm vs xterm)

**What goes wrong:** You install the old `xterm` package (deprecated) instead of the new `@xterm/xterm` scoped package. The old package no longer receives bug fixes or security patches. Addon packages (`xterm-addon-fit`) are also deprecated in favor of `@xterm/addon-fit`. Mixing old and new packages causes type conflicts and runtime errors.

**Prevention:**
1. Use `@xterm/xterm` (v5.4+), `@xterm/addon-fit`, and `@xterm/addon-webgl` exclusively.
2. Add the old unscoped packages to an `overrides` or `resolutions` field to prevent accidental transitive installation.
3. The migration happened at v5.4.0. Any tutorial or StackOverflow answer using `import { Terminal } from 'xterm'` is outdated.

**Phase:** Session view redesign, if xterm.js is used.
**Confidence:** HIGH -- verified via xterm.js releases and npm deprecation notices.

---

### Pitfall 14: Multi-Root Workspace `.code-workspace` Files Leak Absolute Paths

**What goes wrong:** When the workspace manager creates or saves `.code-workspace` files, VS Code stores workspace folder paths as absolute paths by default (e.g., `/home/app/projects/my-project`). If the container's filesystem layout changes (volume mount path changes, user home directory differs), the workspace file becomes invalid. Saved workspaces fail to open with "folder not found" errors.

**Prevention:**
1. Use relative paths in `.code-workspace` files when possible. VS Code supports `"path": "./relative/path"` relative to the workspace file location.
2. Store `.code-workspace` files in the persistent volume (`/data/`) alongside the workspace folders they reference. This ensures relative paths remain valid across container restarts.
3. Validate workspace folder paths on load. If a path does not exist, prompt the user to re-locate it rather than silently failing.

**Phase:** Workspace management phase.
**Confidence:** MEDIUM -- documented in VS Code workspace docs but depends on implementation approach.

---

### Pitfall 15: Self-Testing with Claude in Chrome Creates a Feedback Loop Risk

**What goes wrong:** The self-testing workflow has Claude (running in a ClaudeOS session) controlling Chrome (via the Chrome extension or CDP) to test ClaudeOS's own UI. If a test modifies ClaudeOS state (creates sessions, changes settings), the test environment is no longer clean for the next test. Worse, if a test accidentally triggers another Claude session or interacts with the testing infrastructure itself, you get an infinite loop of Claude sessions spawning tests that spawn sessions.

**Prevention:**
1. **Run self-tests against a SEPARATE ClaudeOS instance** or at minimum a separate, isolated set of test sessions with a `test-` prefix that are cleaned up after each run.
2. **Make all UI tests idempotent.** Tests should not depend on state from previous tests. Each test creates its own fixtures and tears them down.
3. **Add guard rails:** The testing workflow should have a maximum session count. If more than N sessions exist with the `test-` prefix, abort the test run.
4. **Use read-only assertions where possible.** Verify that elements exist and are visible without clicking buttons that create persistent state changes.
5. **Implement a test mode flag** (`CLAUDEOS_TEST_MODE=1`) that the supervisor recognizes, preventing real session creation during test runs or routing test operations to a sandbox.

**Phase:** Self-testing workflow phase.
**Confidence:** MEDIUM -- the feedback loop is a theoretical risk but is a real concern when autonomous agents test their own infrastructure.

---

### Pitfall 16: Default Extensions Moved to Repo Folder May Break Nix Build Hashes

**What goes wrong:** The v1.2 plan moves default extensions from GitHub-hosted repos to local folders in the ClaudeOS repo (for version control). The existing `flake.nix` `extensionVsix` derivation builds extensions from the repo source. Moving extensions to a new folder structure changes the `src` input, which changes the Nix derivation hash. The `npmDepsHash` values become invalid. The existing known tech debt (`wizardDist npmDepsHash uses lib.fakeHash`) compounds -- now you have N extensions with potentially incorrect hashes.

**Prevention:**
1. **Update `flake.nix` when moving extension directories.** Each directory change requires rebuilding on Linux to get the correct `npmDepsHash`. This is a Nix-specific workflow that must not be forgotten.
2. **Consider per-extension `buildNpmPackage` derivations** (already noted as TODO in `flake.nix` line 58). This is the correct Nix pattern for sandbox-compatible builds. Each extension gets its own `npmDepsHash`. Changes to one extension do not invalidate others.
3. **Test the Nix build after moving extensions:** `nix build .#default` must succeed. If it fails with hash mismatch, update the hash from the error message.

**Phase:** Default extensions reorganization phase.
**Confidence:** HIGH -- directly follows from Nix's content-addressable build model. Changing source paths always invalidates hashes.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Unified theming -- fix existing webviews | Hardcoded hex colors in Home panel and wizard (Pitfall 1) | Audit + replace all hex colors with CSS variable references before building theme extension |
| Unified theming -- custom theme extension | Incomplete token coverage (Pitfall 5) | Extend base theme, systematic token review, test with diff/merge/debug views |
| Unified theming -- theme switching | Stale cached colors in webview JS (Pitfall 6) | Use MutationObserver on body class, never cache CSS variable values |
| Unified theming -- wizard alignment | Wizard uses separate theme system (Pitfall 10) | Shared design tokens, matching brand palette, smooth launch transition |
| Copilot removal | Setting may not hide activity bar icon (Pitfall 4) | `chat.disableAIFeatures` + pin code-server version + test after updates |
| Session view redesign | xterm.js CSP, resize, GPU issues in webview (Pitfall 2) | Prefer hybrid approach (webview metadata + Pseudoterminal I/O); if xterm.js needed, use DOM renderer + debounced FitAddon |
| Session view redesign | xterm.js package migration (Pitfall 13) | Use `@xterm/xterm` v5.4+, not deprecated `xterm` package |
| Workspace management | Folder switching resets extension state (Pitfall 7) | Use multi-root workspace mode, persist tree view state in globalState |
| Workspace management | Absolute paths in .code-workspace files (Pitfall 14) | Use relative paths, store alongside workspace folders |
| Chrome extension | Service worker 30s timeout kills WebSocket (Pitfall 3) | 20s ping/pong heartbeat, design for reconnection |
| Chrome extension | Native messaging host path complexity (Pitfall 8) | Use WebSocket to localhost, avoid native messaging entirely |
| Chrome extension | Mixed content / CORS on WebSocket (Pitfall 12) | Connect from service worker, add CORS headers, use wss:// for Railway |
| Self-testing | Screenshot flakiness in CI (Pitfall 9) | Docker-based baselines, 1% diff threshold, disable animations, mask dynamic content |
| Self-testing | Feedback loop risk (Pitfall 15) | Separate test instance, idempotent tests, session count guard rails |
| Default extensions reorganization | Nix build hash invalidation (Pitfall 16) | Update npmDepsHash, consider per-extension buildNpmPackage derivations |
| Theme extension packaging | extensionDependencies creates fragile boot chain (Pitfall 11) | No hard dependency on theme; use settings.json default + extensionPack |

## Interaction with Existing Tech Debt

The v1.0/v1.1 known tech debt items listed in `PROJECT.md` interact with v1.2 features:

| Existing Debt | v1.2 Feature Interaction | Risk |
|---------------|--------------------------|------|
| `extensionVsix npm ci` may fail in Nix sandbox | Adding new extensions (theme, workspace-manager) increases the build surface | Each new extension needs its own `npmDepsHash` or the build continues to rely on `impure` mode |
| `detectGitHubPat()` skips `activate()` on secrets extension | Chrome extension may need secrets access for API keys | If Chrome extension triggers a code path that needs secrets before the panel is opened, same silent failure occurs |
| `SecretsPublicApi` type duplicated across extensions | New extensions (workspace-manager, theme) may also need secrets access | Type duplication grows. Consider publishing a shared types package or a `claudeos-types` extension |
| `wizardDist npmDepsHash` uses `lib.fakeHash` | Moving extensions to repo folders compounds hash issues (Pitfall 16) | All fake hashes must be resolved together |

## Sources

- [VS Code Theme Color Reference](https://code.visualstudio.com/api/references/theme-color) -- all 400+ theme color tokens
- [VS Code Webview API -- Theming](https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content) -- CSS variable propagation, body class for theme type
- [VS Code Color Theme Extension Guide](https://code.visualstudio.com/api/extension-guides/color-theme) -- creating themes, base theme inheritance
- [VS Code Theme CSS Variable Override Issue #209253](https://github.com/microsoft/vscode/issues/209253) -- theme CSS variables interfering with webview content
- [Elio Struyf -- Code-Driven Approach to Theme VS Code Webview](https://www.eliostruyf.com/code-driven-approach-theme-vscode-webview/) -- JS-driven theming, MutationObserver pattern
- [xterm.js FitAddon Resize Issues](https://github.com/xtermjs/xterm.js/issues/4841) -- FitAddon resize bugs in 2025
- [xterm.js FitAddon Width=1 Bug](https://github.com/xtermjs/xterm.js/issues/5320) -- common resize-to-1-column failure
- [xterm.js WebGL Renderer PR](https://github.com/microsoft/vscode/pull/84440) -- CSP and GPU context considerations
- [xterm.js Package Migration to @xterm Scope](https://github.com/xtermjs/xterm.js/issues/4859) -- deprecated unscoped packages
- [Chrome Extension Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) -- 30-second idle timeout
- [Chrome Extension WebSocket in Service Workers](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets) -- keepalive mechanism since Chrome 116
- [Chrome Native Messaging Docs](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) -- host manifest paths, OS-specific registration
- [Chrome Manifest V3 Known Issues](https://developer.chrome.com/docs/extensions/develop/migrate/known-issues) -- service worker limitations
- [Claude Code Service Worker Idle Timeout Issue #15239](https://github.com/anthropics/claude-code/issues/15239) -- autonomous workflow disconnection
- [VS Code Adopting Multi Root Workspace APIs](https://github.com/microsoft/vscode/wiki/Adopting-Multi-Root-Workspace-APIs) -- workspace folder change behavior
- [Playwright Visual Testing Guide](https://playwright.dev/docs/test-snapshots) -- maxDiffPixelRatio, animation disabling
- [Fixing Flaky Playwright Visual Regression Tests](https://www.houseful.blog/posts/2023/fix-flaky-playwright-visual-regression-tests/) -- animation, font rendering, environment consistency
- [Playwright Visual Testing Best Practices 2026](https://www.browserstack.com/guide/playwright-best-practices) -- masking, consistent environments
- [code-server Copilot Discussion #5063](https://github.com/coder/code-server/discussions/5063) -- Copilot in code-server compatibility
- [VS Code CSP in Webviews](https://code.visualstudio.com/api/extension-guides/webview#content-security-policy) -- CSP restrictions, script-src, blob: handling

---
*Pitfalls research for: ClaudeOS v1.2 -- UI polish, workspace management, terminal UI, Chrome extension, self-testing*
*Researched: 2026-03-18*
