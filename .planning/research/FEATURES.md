# Feature Landscape

**Domain:** UI polish, workspace management, and self-testing for browser-based Claude Code IDE (ClaudeOS v1.2)
**Researched:** 2026-03-18

## Existing System Context

ClaudeOS v1.0-v1.1 ships five default extensions (sessions, secrets, home, self-improve, extension-template) inside a code-server (VS Code in browser) container. All custom UI is built via standard VS Code extension APIs: webview panels (home page), tree views (session sidebar), pseudoterminals (session terminals), and a pre-Fastify raw HTTP setup wizard (first-boot). The current UI has several problems:

- **Inconsistent theming:** The setup wizard uses hardcoded dark colors (`#1e1e1e`, `#252526`, `#4a9eff`), the home panel uses custom CSS variables (`--claudeos-accent: #c084fc`), and the session tree uses VS Code's built-in ThemeIcon/ThemeColor. Three different color sources that do not respond to theme changes together.
- **Copilot UI clutter:** code-server ships with Copilot chat sidebar, inline suggestions UI, and agent mode affordances that are confusing in a Claude-centric environment.
- **Session terminal is basic:** The SessionPseudoterminal uses a simple line-buffered input approach with manual echo/backspace handling. No rich rendering, no auto-resize beyond what VS Code terminals give for free.
- **No workspace isolation:** The explorer shows "no folder opened" and all sessions share a single working context.
- **No self-testing loop:** Claude Code inside ClaudeOS cannot see or verify its own UI in the browser.

v1.2 addresses all of these.

## Table Stakes

Features users expect from a polished IDE environment. Missing = product feels amateurish or broken.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Unified VS Code theming across all custom UI | Every VS Code extension that provides webview UI reads from `--vscode-*` CSS variables. Users of any themed VS Code environment expect all panels, views, and webviews to respect the active color theme. When custom UI uses hardcoded colors, it looks broken when users switch themes. | Medium | Existing webview panels (home, setup wizard), VS Code theme color API | VS Code automatically exposes all theme colors as CSS variables in webviews (e.g., `var(--vscode-editor-background)`, `var(--vscode-button-background)`). The home panel already partially uses these (`var(--vscode-foreground)`) but also defines its own `--claudeos-accent`. The setup wizard is entirely hardcoded. Fix: replace all hardcoded colors with `--vscode-*` variables in webviews; contribute a custom ClaudeOS theme extension that sets brand accent colors via `contributes.themes`. |
| Copilot UI removal | ClaudeOS uses Claude Code, not Copilot. Showing Copilot chat panels, inline suggestion UI, "Ask @vscode", and "Build with agent mode" confuses users and wastes sidebar space. Users of rebranded VS Code environments (Cursor, Windsurf, etc.) expect the AI integration to match the product. | Low | code-server settings.json, potentially product.json | Primary approach: set `"chat.disableAIFeatures": true` in settings.json. Known issue: code-server v4.105+ has a bug where this does not fully hide the Copilot panel (upstream VS Code bug, tracked in code-server #7540). Workaround: also set `"github.copilot.enable": {"*": false}` and `"chat.agent.enabled": false`. If the sidebar persists, register a workspace-manager view in the same activity bar position to replace it. Fullest removal requires code-server version update where upstream fix lands. |
| Custom ClaudeOS welcome page | The existing home panel opens via command (`claudeos.home.open`). Users expect a startup page that orients them to the product. VS Code's built-in "Get Started" page is generic. Every branded IDE (Cursor, Gitpod, Codespaces) shows a product-specific landing. | Low | Existing `claudeos-home` extension, `workbench.startupEditor` setting | Currently `workbench.startupEditor` is `"none"` in settings.json. Change approach: auto-open the home panel on startup via `onStartupFinished` activation (already set). The home panel already has a hero section, session cards, and shortcuts. Needs: (1) trigger auto-open on fresh startup, (2) refresh the visual design to match the unified theme, (3) add onboarding content for first-time users. |
| Session view terminal auto-resize | The current pseudoterminal does not handle resize events. VS Code terminals auto-resize, but the underlying tmux session window size is never updated. Users of any terminal emulator expect the terminal to fill the available space and reflow text properly. | Low-Medium | `SessionPseudoterminal`, supervisor tmux resize API | The `Pseudoterminal` interface provides `setDimensions(dimensions: TerminalDimensions)` callback. Currently not implemented. Add: (1) implement `setDimensions` on `SessionPseudoterminal`, (2) call supervisor API to resize the tmux pane when dimensions change. Without this, tmux output wraps at the wrong column width. |

## Differentiators

Features that go beyond basics and create a distinctive, polished experience. These set ClaudeOS apart from just "code-server with Claude Code in tmux."

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Session view redesign with terminal-UI styling | The current session sidebar is a standard VS Code TreeView with status icons -- functional but generic. The todo references opencode's TUI as inspiration: a polished, purpose-built interface with conversation-aware layout. Redesigning the session view to show richer context (recent messages, token usage, active tools) in a more visual format transforms sessions from "list of tmux processes" into "conversations with an AI." | High | Sessions extension rewrite, possibly webview-based sidebar instead of TreeView, supervisor API enhancements for session metadata | Two architectural options: (A) **Enhanced TreeView** -- keep the tree but add richer TreeItems with descriptions, multi-line labels (VS Code supports `TreeItemLabel` with highlights), and inline status. Lower risk, stays within VS Code native patterns. (B) **Webview sidebar** -- replace the TreeView with a WebviewView (`contributes.views` with `"type": "webview"`) that renders a fully custom session list with xterm.js embedded previews, conversation snippets, and richer layout. Higher complexity but enables the opencode-like experience. Recommendation: option B for the session list view, keep terminal attachment via pseudoterminals (they work well). |
| Workspace manager with persistent tabbed workspaces | No existing VS Code extension provides the specific pattern described: switchable workspace "tabs" in a sidebar that each map to a project directory with isolated sessions, explorer state, and editor tabs. This is a novel concept for a multi-project AI development environment. Closest analogs: VS Code's built-in multi-root workspaces (but they share one window), Project Manager extensions (but they switch by reopening the window), and browser tab groups (but not in VS Code). | High | New `claudeos-workspace-manager` extension, modifications to sessions extension for workspace filtering, supervisor API for workspace-aware session creation | Core mechanism: each workspace = a subdirectory of `/data/workspaces/`. Switching workspaces calls `vscode.workspace.updateWorkspaceFolders()` to change the active folder. Session list filters by `workdir` matching the active workspace path. Persistent state stored in workspace config files. The Copilot sidebar slot (activity bar position) is repurposed for this extension. Key risk: VS Code's `updateWorkspaceFolders` may not cleanly switch a single-folder workspace. Alternative: use multi-root workspace with one visible root, toggled. |
| Claude in Chrome browser extension for session management | A VS Code extension that provides a UI panel showing active and past browser automation sessions initiated via Claude in Chrome (`claude --chrome` / `/chrome`). No existing tool provides this visibility -- Claude in Chrome runs headlessly and users have no dashboard for what is happening. | High | Claude in Chrome extension installed in user's Chrome, native messaging host configuration, understanding of Claude Code's browser session state | The Claude in Chrome integration works via native messaging host (a JSON config file at specific OS paths) that bridges Chrome extension and Claude Code CLI. The extension communicates via named pipes. Building a UI on top requires either: (A) reading session state from Claude Code's internal state (undocumented), or (B) intercepting native messaging traffic (fragile), or (C) using MCP tools exposed by claude-in-chrome to query active tabs/sessions. Approach C is most viable -- `/mcp` in Claude Code shows `claude-in-chrome` as an available MCP server with browser tools. |
| UI self-testing workflow via Claude in Chrome | Enables ClaudeOS to test its own UI: Claude Code sessions inside ClaudeOS use Claude in Chrome to navigate to ClaudeOS's own browser tab, take screenshots, click elements, and verify layouts. Creates a closed loop where Claude builds UI, tests it visually, and iterates. No other self-hosted IDE has this capability. | Medium | Claude in Chrome working, browser testing skill file, self-improve skill update | Not a traditional automated test suite. This is a "skill" -- a documented workflow that Claude Code follows when building/testing UI. Implementation: (1) create a skill file (`.claude/skills/browser-testing.md`) that teaches Claude how to use `/chrome` to screenshot and inspect ClaudeOS UI, (2) update the self-improve skill to reference the browser testing skill, (3) ensure Claude in Chrome is enabled by default in the container. Risk: Claude in Chrome requires the Chrome extension installed in the user's browser -- in the container, Chrome is not running. This works only when the user's local Chrome connects to the remote ClaudeOS instance. |
| Custom ClaudeOS color theme extension | Ship a purpose-built VS Code color theme as a default extension. Not just "use Default Dark Modern" but a branded ClaudeOS theme with the purple accent palette (`#c084fc`, `#7c3aed`) that matches the hero gradient, tints the activity bar, sidebar, and editor chrome. Users of Cursor, Zed, and other branded IDEs expect a cohesive visual identity. | Medium | New `claudeos-theme` extension with `contributes.themes`, theme JSON file | Create via `yo code` or manually. The theme JSON file defines `colors` (UI chrome) and `tokenColors` (syntax). Start from `Default Dark Modern` as base, override: `activityBar.background`, `sideBar.background`, `titleBar.activeBackground`, `statusBar.background`, `button.background`, `focusBorder`, `textLink.foreground` etc. with the ClaudeOS purple palette. Ship as a default extension. All webview CSS variables automatically inherit. |
| Default extensions in repo folder | Move from `default-extensions.json` referencing `/app/extensions/*.vsix` (built during Docker image creation) to a `default-extensions/` directory in the repo containing the extension source. Enables version control, easier development, and contributor visibility into what ships. | Low | Build system changes (flake.nix, Dockerfile) | Currently extensions are separate directories (`claudeos-sessions/`, `claudeos-home/`, etc.) at repo root. They are already in the repo. The change is: (1) move them under a `default-extensions/` parent directory, (2) update `default-extensions.json` paths, (3) update the Nix build to build from new paths. Straightforward directory restructuring. |

## Anti-Features

Features to explicitly NOT build. These are tempting but wrong for v1.2.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| xterm.js embedded in webview panels for session display | Tempting to render full terminal output inside a webview panel instead of using VS Code's native terminal. But VS Code's terminal infrastructure (pseudoterminals) already handles xterm.js rendering, GPU acceleration, ligatures, and accessibility. Reimplementing this in a webview panel would be slower, miss features, and create a maintenance burden. | Use VS Code's native `Pseudoterminal` interface for terminal rendering (already done). Improve the session LIST view with a webview, but keep terminal ATTACHMENT via pseudoterminals. The terminal rendering is not the problem -- the session management UI is. |
| Playwright-based UI testing | The todos explicitly state: "Do NOT use Playwright, Chrome DevTools MCP plugin, or any other third-party browser tool." Playwright requires a browser binary in the container, adds ~400MB to the image, and duplicates what Claude in Chrome already provides. | Use stock Claude in Chrome (`claude --chrome` / `/chrome`) for all browser interaction. Create skill files that teach Claude the workflow, not a test framework. |
| Custom VS Code marketplace service | Out of scope per PROJECT.md. Extensions install from GitHub URLs and local VSIX files. Building a marketplace adds massive infrastructure for zero user benefit at this scale. | Keep URL-based and local-vsix installation. The extension manager UI already handles this. |
| Forking code-server source | Out of scope per PROJECT.md constraints. Tempting for deeper Copilot removal or custom UI, but creates an unmaintainable fork that falls behind upstream. | Configure via product.json, settings.json, and extensions only. Use `chat.disableAIFeatures` and workspace-manager sidebar replacement for Copilot removal. |
| Full workspace isolation with separate code-server instances | Running a separate code-server per workspace would give true isolation but is resource-prohibitive in a container and adds massive complexity. | Use VS Code's `updateWorkspaceFolders` API to switch the active folder. Filter sessions by workspace path. Accept that settings are shared across workspaces (this is fine for a single-user tool). |
| Custom Chrome extension for browser testing | Building a dedicated Chrome extension for ClaudeOS self-testing adds distribution complexity (Chrome Web Store review, updates) and duplicates Claude in Chrome. | Leverage the stock Claude in Chrome extension. It already provides screenshot, navigation, click, type, and DOM reading capabilities. The "extension" mentioned in the todo is a VS Code extension (for managing browser sessions), not a Chrome extension. |

## Feature Dependencies

```
[Unified Theming] -----> [Custom ClaudeOS Theme Extension]
       |                         |
       v                         v
[Home Page Redesign]      [Setup Wizard Theming]
       |
       v
[Session View Redesign]
       |
       +-------> [Workspace Manager] (replaces Copilot sidebar slot)
       |                |
       |                v
       |         [Session workspace filtering]
       |
       v
[Copilot UI Removal] -----> [Workspace Manager takes sidebar position]

[Claude in Chrome Extension (VS Code)] -----> [UI Self-Testing Workflow]
       |                                              |
       v                                              v
[Browser Session Management UI]            [Skill files + CLAUDE.md updates]

[Default Extensions in Repo Folder] (independent, can be done anytime)
```

Key ordering constraints:
- Unified theming MUST come before visual redesign work (home page, session view) -- otherwise you redesign against hardcoded colors and redo it
- Custom theme extension should ship alongside unified theming so webviews inherit brand colors automatically
- Copilot removal and workspace manager are coupled -- the workspace manager replaces the sidebar slot that Copilot currently occupies
- Session view redesign should come after theming (benefits from theme variables) but before workspace manager (workspace manager adds filtering to sessions)
- Claude in Chrome VS Code extension is independent of UI work but is a prerequisite for the self-testing workflow
- Default extensions in repo folder is pure restructuring with no UI dependencies

## MVP Recommendation

**Prioritize (must-have for v1.2):**

1. **Custom ClaudeOS color theme extension** -- Create a `claudeos-theme` default extension contributing a branded dark theme via `contributes.themes`. This is the foundation for all subsequent UI work. Use `Default Dark Modern` as the base and override UI chrome colors with the ClaudeOS purple palette. Once this ships, all webview CSS variables automatically get brand-appropriate values. Estimated: 2-4 hours.

2. **Unified VS Code theming across all webviews** -- Replace all hardcoded colors in the home panel webview and the setup wizard with `--vscode-*` CSS variables. The home panel's `--claudeos-accent` becomes `var(--vscode-textLink-foreground)` or a theme-contributed color. The setup wizard's `#1e1e1e` becomes `var(--vscode-editor-background)`. After this, switching VS Code themes updates everything. Estimated: 3-5 hours.

3. **Copilot UI removal** -- Add `"chat.disableAIFeatures": true`, `"github.copilot.enable": {"*": false}`, and `"chat.agent.enabled": false` to settings.json. Test whether code-server version fully respects these. If Copilot sidebar persists, the workspace manager (below) will take its activity bar position. Estimated: 1-2 hours.

4. **Custom ClaudeOS welcome page (home panel refresh)** -- Auto-open the home panel on startup. Refresh the visual design using theme variables. Add first-use onboarding content. Already has session cards and shortcuts -- just needs polish and auto-trigger. Estimated: 2-3 hours.

5. **Session terminal auto-resize** -- Implement `setDimensions` on `SessionPseudoterminal` to relay size changes to supervisor tmux resize API. Critical for usability -- without it, terminal content wraps at wrong widths. Estimated: 1-2 hours.

6. **Default extensions in repo folder** -- Restructure to `default-extensions/` directory. Update build paths. Pure housekeeping. Estimated: 1-2 hours.

**Include if time allows:**

7. **Workspace manager extension** -- New default extension replacing Copilot sidebar. Workspace tabs, folder switching, session filtering. This is the highest-impact differentiator but also highest complexity. Estimated: 8-12 hours.

8. **Session view redesign** -- Move from TreeView to WebviewView for richer session cards with metadata, status, and conversation context. Estimated: 6-8 hours.

**Defer or do in parallel as a separate track:**

9. **Claude in Chrome browser session manager** -- VS Code extension wrapping browser session visibility. Requires Claude in Chrome working in the container context, which needs the user's local Chrome. Estimated: 6-10 hours.

10. **UI self-testing workflow** -- Skill files and CLAUDE.md updates. Depends on Claude in Chrome being functional. Estimated: 2-3 hours for the skill files, but testing requires the Chrome integration to actually work.

## Complexity Assessment

| Feature | Effort | Risk | Depends On |
|---------|--------|------|------------|
| Custom ClaudeOS theme extension | 2-4h | Low | Nothing |
| Unified theming (webview CSS) | 3-5h | Low | Theme extension |
| Copilot UI removal | 1-2h | Low-Medium | code-server version behavior |
| Welcome page refresh | 2-3h | Low | Unified theming |
| Session terminal auto-resize | 1-2h | Low | Supervisor tmux resize endpoint |
| Default extensions restructure | 1-2h | Low | Build system familiarity |
| Workspace manager extension | 8-12h | Medium-High | Copilot removal, sessions API |
| Session view redesign | 6-8h | Medium | Unified theming, WebviewView API |
| Chrome session manager (VS Code ext) | 6-10h | High | Claude in Chrome understanding |
| UI self-testing workflow | 2-3h | Medium | Chrome session manager |

**Total estimated effort for must-haves (1-6): ~10-18 hours**
**Total with differentiators (7-8): ~24-38 hours**
**Total including Chrome features (9-10): ~32-51 hours**

## Sources

- [VS Code Theme Color Reference](https://code.visualstudio.com/api/references/theme-color) -- CSS variables available in webviews, HIGH confidence
- [VS Code Color Theme Extension Guide](https://code.visualstudio.com/api/extension-guides/color-theme) -- `contributes.themes` in package.json, HIGH confidence
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview) -- Webview theming via CSS variables, HIGH confidence
- [Webview UI Toolkit Deprecation (issue #561)](https://github.com/microsoft/vscode-webview-ui-toolkit/issues/561) -- Deprecated Jan 2025, no official replacement, HIGH confidence
- [code-server chat.disableAIFeatures bug (#7540)](https://github.com/coder/code-server/issues/7540) -- Copilot panel persists despite setting, upstream VS Code bug, HIGH confidence
- [VS Code Copilot Settings Reference](https://code.visualstudio.com/docs/copilot/reference/copilot-settings) -- `chat.disableAIFeatures`, `github.copilot.enable`, `chat.agent.enabled`, HIGH confidence
- [Claude Code Chrome Integration Docs](https://code.claude.com/docs/en/chrome) -- Claude in Chrome capabilities, prerequisites, native messaging host paths, HIGH confidence
- [OpenCode TUI Architecture](https://deepwiki.com/opencode-ai/opencode/4-terminal-ui-system) -- Bubble Tea framework, page-based navigation, dialog overlays, conversation-aware layout, MEDIUM confidence
- [OpenCode TUI Docs](https://opencode.ai/docs/tui/) -- Slash commands, keybindings, session management, theme customization, MEDIUM confidence
- [VS Code Contribution Points](https://code.visualstudio.com/api/references/contribution-points) -- `contributes.themes`, `contributes.views`, `contributes.viewsContainers`, HIGH confidence
- [xterm.js](https://xtermjs.org/) -- Terminal rendering library used by VS Code, HIGH confidence
- [code-server FAQ](https://coder.com/docs/code-server/FAQ) -- Extension installation, product.json location, MEDIUM confidence
- Existing ClaudeOS codebase analysis: `claudeos-home/src/webview/home-panel.ts`, `claudeos-sessions/src/`, `config/settings.json`, `config/product.json`, `first-boot/setup.html`, HIGH confidence
- ClaudeOS todo files in `.planning/todos/pending/`, HIGH confidence (primary source for feature requirements)
