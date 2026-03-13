# Requirements: ClaudeOS

**Defined:** 2026-03-11
**Core Value:** Give Claude Code a real, extensible browser UI and the ability to expand its own capabilities by building and installing new extensions -- without ever modifying Claude Code itself.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Supervisor

- [x] **SUP-01**: Supervisor boots code-server with ClaudeOS branding (product.json, settings.json)
- [x] **SUP-02**: Supervisor exposes session CRUD API on localhost:3100 (create, list, stop, kill)
- [x] **SUP-03**: Supervisor can send user input to a Claude Code session via tmux send-keys
- [x] **SUP-04**: Supervisor can capture current terminal output from a Claude Code session via tmux capture-pane
- [x] **SUP-05**: Supervisor can archive a session (stop, save scrollback to disk)
- [x] **SUP-06**: Supervisor can revive an archived session (start new session, feed previous context)
- [x] **SUP-07**: Supervisor exposes extension install pipeline (clone GitHub repo, build VSIX, install into code-server)
- [x] **SUP-08**: Supervisor runs first-boot auto-installation of extensions from default-extensions.json
- [x] **SUP-09**: Supervisor exposes health check endpoint with version and uptime

### Sessions Extension

- [x] **SES-01**: User can see all Claude Code sessions in a sidebar tree view grouped by status (active, idle, waiting)
- [x] **SES-02**: User can create a new session from the sidebar with optional name and initial prompt
- [x] **SES-03**: User can see status indicators on each session (spinning for active, pause for idle, question mark for waiting)
- [x] **SES-04**: User can rename, archive, or delete sessions via context menu
- [x] **SES-05**: User can see archived sessions in a collapsible section at the bottom of the sidebar
- [x] **SES-06**: User can see zombie sessions (deleted from Claude Code but preserved) marked with a red dot
- [x] **SES-07**: User can revive a zombie or archived session by sending input to it
- [x] **SES-08**: User can see notification badges on sessions waiting for user input
- [x] **SES-09**: Session names display bold for unread, fading gray gradient (gray-400 to gray-600) for read sessions based on recency

### Terminal Extension

- [x] **TRM-01**: User can click a session in the sidebar to open a terminal tab attached to that session's tmux window
- [x] **TRM-02**: User can have multiple terminal tabs open simultaneously for different sessions
- [x] **TRM-03**: User can type directly in the terminal to send input to Claude Code (responds to AskUserQuestion, etc.)
- [x] **TRM-04**: Terminal tabs show session name and status icon

### Secrets Extension

- [x] **SEC-01**: User can store API keys and tokens in encrypted storage (AES-256-GCM, key derived from CLAUDEOS_AUTH_TOKEN)
- [x] **SEC-02**: User can add, edit, and delete secrets via a webview form UI
- [x] **SEC-03**: Other extensions can access secrets via a public API (getSecret, setSecret, hasSecret, deleteSecret, listSecrets)
- [x] **SEC-04**: Status bar indicator shows whether Anthropic API key is configured
- [x] **SEC-05**: First-run walkthrough prompts user to set up essential secrets (Anthropic API key)
- [x] **SEC-06**: When Anthropic API key is set, it is also written to Claude Code's expected environment so Claude Code can use it

### Home Extension

- [x] **HOM-01**: User sees a welcome webview tab on startup with ClaudeOS branding
- [x] **HOM-02**: User can create a new session from the home page
- [x] **HOM-03**: User can see recent sessions on the home page
- [x] **HOM-04**: User can access shortcuts grid with frequently used actions

### Self-Improve Extension

- [ ] **IMP-01**: User can see installed extensions in an Extension Manager sidebar panel (name, version, description, uninstall button)
- [ ] **IMP-02**: User can install an extension by pasting a GitHub repo URL and clicking install
- [ ] **IMP-03**: User can select a GitHub PAT secret for private repo access during install
- [ ] **IMP-04**: User can see install progress with log output
- [ ] **IMP-05**: User can uninstall extensions from the Extension Manager panel
- [ ] **IMP-06**: MCP server exposes install_extension, uninstall_extension, list_extensions, and get_extension_template tools to Claude Code sessions
- [ ] **IMP-07**: When user asks Claude Code to build a feature, Claude can scaffold a new extension from the template, implement it, build the VSIX, and install it
- [ ] **IMP-08**: Self-improve sessions are marked with a special icon in the session list

### Deployment

- [x] **DEP-01**: ClaudeOS runs as a Docker container with node:22-bookworm-slim base
- [x] **DEP-02**: Container includes Node.js, code-server, Claude Code, tmux, git, and supervisor
- [x] **DEP-03**: Persistent volume at /data stores extensions, sessions, secrets, and config across restarts
- [x] **DEP-04**: code-server authenticates with CLAUDEOS_AUTH_TOKEN
- [x] **DEP-05**: Railway deployment configured with healthcheck, restart policy, and volume
- [x] **DEP-06**: docker-compose.yml for local development with mounted /data volume
- [x] **DEP-07**: Entrypoint script handles volume permissions (chown /data before exec as app user)

### Extension Template

- [x] **TPL-01**: Extension template provides scaffold with package.json, tsconfig.json, src/extension.ts, and AGENTS.md
- [x] **TPL-02**: Template includes optional webview/ and mcp-server/ directories
- [x] **TPL-03**: Template package.json has build, watch, package, and test scripts configured
- [x] **TPL-04**: Template AGENTS.md inherits kernel principles and adds extension-specific guidance

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Memory

- **MEM-01**: Persistent memory system with Mem0 integration
- **MEM-02**: Knowledge graph visualizer webview panel
- **MEM-03**: Passive and active memory recording on Claude Code IO

### Browser

- **BRW-01**: Chrome stealth browser with Playwright
- **BRW-02**: Browser session viewer with time scrubbing
- **BRW-03**: Optional 2captcha/capsolver support

### Scheduler

- **SCH-01**: n8n integration for automation and scheduled jobs
- **SCH-02**: Job management UI panel

### Visualization

- **VIS-01**: Execution graph visualization with d3.js
- **VIS-02**: Agent teams/subagent tree view

### Marketplace

- **MKT-01**: Self-hosted marketplace service indexing GitHub repos tagged claudeos-extension
- **MKT-02**: VS Code Marketplace API compatibility for in-IDE search and install

### Auth

- **AUTH-01**: WebAuthn/passkey authentication extension

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Custom chat UI | Claude Code's terminal rendering IS the interface. Building a chat UI duplicates massive surface area. |
| Code completion engine | Claude Code handles all code generation through its native interface |
| Multi-LLM support | ClaudeOS is specifically for Claude Code. Model selection passes through Claude Code's flags. |
| No-code / visual app builder | Target audience is developers who know what an IDE is |
| code-server fork | Configure via product.json, settings.json, and extensions only. Never fork. |
| Claude Code modifications | Stock, in tmux, never patched, wrapped, or proxied |
| Multi-user / team features | Single-user container deployment. Each user gets their own instance. |
| Mobile-optimized interface | VS Code doesn't work well on phones. Target desktop/laptop browsers. |
| Custom language server | code-server includes VS Code's language services already |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SUP-01 | Phase 1 | Complete |
| SUP-02 | Phase 1 | Complete |
| SUP-03 | Phase 1 | Complete |
| SUP-04 | Phase 1 | Complete |
| SUP-05 | Phase 1 | Complete |
| SUP-06 | Phase 1 | Complete |
| SUP-07 | Phase 1 | Complete |
| SUP-08 | Phase 1 | Complete |
| SUP-09 | Phase 1 | Complete |
| SES-01 | Phase 2 | Complete |
| SES-02 | Phase 2 | Complete |
| SES-03 | Phase 2 | Complete |
| SES-04 | Phase 2 | Complete |
| SES-05 | Phase 2 | Complete |
| SES-06 | Phase 2 | Complete |
| SES-07 | Phase 2 | Complete |
| SES-08 | Phase 2 | Complete |
| SES-09 | Phase 2 | Complete |
| TRM-01 | Phase 2 | Complete |
| TRM-02 | Phase 2 | Complete |
| TRM-03 | Phase 2 | Complete |
| TRM-04 | Phase 2 | Complete |
| SEC-01 | Phase 3 | Complete |
| SEC-02 | Phase 3 | Complete |
| SEC-03 | Phase 3 | Complete |
| SEC-04 | Phase 3 | Complete |
| SEC-05 | Phase 3 | Complete |
| SEC-06 | Phase 3 | Complete |
| HOM-01 | Phase 3 | Complete |
| HOM-02 | Phase 3 | Complete |
| HOM-03 | Phase 3 | Complete |
| HOM-04 | Phase 3 | Complete |
| IMP-01 | Phase 4 | Pending |
| IMP-02 | Phase 4 | Pending |
| IMP-03 | Phase 4 | Pending |
| IMP-04 | Phase 4 | Pending |
| IMP-05 | Phase 4 | Pending |
| IMP-06 | Phase 4 | Pending |
| IMP-07 | Phase 4 | Pending |
| IMP-08 | Phase 4 | Pending |
| DEP-01 | Phase 1 | Complete |
| DEP-02 | Phase 1 | Complete |
| DEP-03 | Phase 1 | Complete |
| DEP-04 | Phase 1 | Complete |
| DEP-05 | Phase 1 | Complete |
| DEP-06 | Phase 1 | Complete |
| DEP-07 | Phase 1 | Complete |
| TPL-01 | Phase 1 | Complete |
| TPL-02 | Phase 1 | Complete |
| TPL-03 | Phase 1 | Complete |
| TPL-04 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 51 total
- Mapped to phases: 51
- Unmapped: 0

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 after roadmap creation*
