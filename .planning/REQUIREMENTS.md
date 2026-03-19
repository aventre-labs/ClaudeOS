# Requirements: ClaudeOS v1.2

**Defined:** 2026-03-18
**Core Value:** Give Claude Code a real, extensible browser UI and the ability to expand its own capabilities by building and installing new extensions — without ever modifying Claude Code itself.

## v1.2 Requirements

Requirements for UI Polish & Workspaces milestone. Each maps to roadmap phases.

### Theming

- [x] **THEME-01**: ClaudeOS ships a custom dark color theme as the default (via settings.json, not a separate extension)
- [x] **THEME-02**: All Home panel webview CSS uses `var(--vscode-*)` variables instead of hardcoded hex values
- [x] **THEME-03**: Setup wizard CSS uses `var(--vscode-*)` variables instead of its own `theme.css` palette
- [x] **THEME-04**: Changing the VS Code theme automatically updates all custom panels and wizard to match
- [x] **THEME-05**: Copilot UI elements are disabled via settings (`chat.disableAIFeatures`, `github.copilot.enable`)

### Session View

- [ ] **SESS-01**: Claude Code sessions render in VS Code's native integrated terminal with proper auto-resize
- [ ] **SESS-02**: Session terminal matches the clean presentation pattern used by opencode's VS Code extension
- [ ] **SESS-03**: Keyboard shortcuts for creating new sessions and focusing existing ones
- [ ] **SESS-04**: Session list sidebar shows clean status indicators alongside terminal tabs

### Welcome

- [x] **WELC-01**: Custom ClaudeOS welcome page replaces the default VS Code welcome content
- [x] **WELC-02**: Welcome page provides ClaudeOS-specific quick actions and getting-started guidance
- [x] **WELC-03**: Welcome page uses unified theming (reads from VS Code theme variables)

### Extensions Infrastructure

- [x] **INFR-01**: Default extensions live in a `default-extensions/` repo directory
- [x] **INFR-02**: Build process (Nix/Dockerfile) sources extensions from `default-extensions/`
- [x] **INFR-03**: Adding/removing default extensions is a single directory change

### Workspace Manager

- [ ] **WORK-01**: Workspace manager extension replaces Copilot sidebar slot in activity bar
- [ ] **WORK-02**: User can create, switch, and delete workspaces as tabbed entries
- [ ] **WORK-03**: Switching workspaces changes VS Code's working directory via `updateWorkspaceFolders()`
- [ ] **WORK-04**: Session list filters to show only sessions belonging to the active workspace
- [ ] **WORK-05**: Workspace state persists across container restarts (via globalState)

### Browser Integration

- [ ] **BRWS-01**: VS Code extension shows active Claude in Chrome browser sessions
- [ ] **BRWS-02**: Past browser sessions displayed with greyscale thumbnails
- [ ] **BRWS-03**: Extension communicates with supervisor via WebSocket (local-only for v1.2)

### Self-Testing

- [ ] **TEST-01**: Claude Code skill file teaches browser-test methodology via Claude in Chrome
- [ ] **TEST-02**: Self-improve extension references browser testing skill for UI verification

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Terminal

- **TERM-01**: Full xterm.js webview terminal replacing Pseudoterminal entirely (hybrid model covers v1.2 UX goal)
- **TERM-02**: Cross-container Chrome native messaging bridge for remote browser automation

### Browser

- **BRWS-04**: Headless Chrome in container for CI visual regression testing
- **BRWS-05**: Chrome extension auth flow for Railway-deployed instances (WSS proxy + token)

## Out of Scope

| Feature | Reason |
|---------|--------|
| ClaudeOS theme as separate extension | Theme is default configuration, not a standalone installable extension |
| Custom WebviewView for session rendering | OpenCode pattern is cleaner — native terminal with proper resize |
| Playwright or Chrome DevTools MCP for testing | Explicitly prohibited; use stock Claude in Chrome only |
| Custom VS Code marketplace service | Out of scope per PROJECT.md |
| Separate code-server instances per workspace | Resource-prohibitive in container |
| @vscode/webview-ui-toolkit | Deprecated/archived January 2025 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| THEME-01 | Phase 14 | Complete |
| THEME-02 | Phase 14 | Complete |
| THEME-03 | Phase 14 | Complete |
| THEME-04 | Phase 14 | Complete |
| THEME-05 | Phase 14 | Complete |
| SESS-01 | Phase 15 | Pending |
| SESS-02 | Phase 15 | Pending |
| SESS-03 | Phase 15 | Pending |
| SESS-04 | Phase 15 | Pending |
| WELC-01 | Phase 14 | Complete |
| WELC-02 | Phase 14 | Complete |
| WELC-03 | Phase 14 | Complete |
| INFR-01 | Phase 14 | Complete |
| INFR-02 | Phase 14 | Complete |
| INFR-03 | Phase 14 | Complete |
| WORK-01 | Phase 16 | Pending |
| WORK-02 | Phase 16 | Pending |
| WORK-03 | Phase 16 | Pending |
| WORK-04 | Phase 16 | Pending |
| WORK-05 | Phase 16 | Pending |
| BRWS-01 | Phase 17 | Pending |
| BRWS-02 | Phase 17 | Pending |
| BRWS-03 | Phase 17 | Pending |
| TEST-01 | Phase 17 | Pending |
| TEST-02 | Phase 17 | Pending |

**Coverage:**
- v1.2 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after roadmap creation*
