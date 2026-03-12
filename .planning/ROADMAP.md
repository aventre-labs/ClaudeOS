# Roadmap: ClaudeOS

## Overview

ClaudeOS delivers a browser-accessible operating environment for Claude Code in four phases, building bottom-up from the dependency graph. Phase 1 lays the entire foundation: the supervisor process, Docker container, deployment config, and extension template. Phase 2 delivers the core user experience: session management sidebar and terminal attachment. Phase 3 adds platform services (encrypted secrets and welcome home page) that polish the UX and unblock the capstone. Phase 4 delivers the primary differentiator: self-improvement, where Claude Code builds and installs its own VS Code extensions at runtime.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Supervisor + Container Foundation** - Bootable container with supervisor API, tmux session management, extension install pipeline, deployment config, and extension template
- [ ] **Phase 2: Session Management** - Sessions sidebar and terminal tabs for viewing, creating, and interacting with Claude Code sessions
- [ ] **Phase 3: Platform Services** - Encrypted secret storage with public API and welcome home page with quick actions
- [ ] **Phase 4: Self-Improvement** - Extension manager UI and MCP server enabling Claude Code to build and install its own extensions

## Phase Details

### Phase 1: Supervisor + Container Foundation
**Goal**: A bootable, deployable Nix-built container where the supervisor boots code-server with ClaudeOS branding, manages Claude Code sessions via tmux with event-driven status detection, exposes the full API surface (sessions, secrets, extensions, settings, WebSocket), handles first-boot password creation, and provides the extension template as a separate repo scaffold
**Depends on**: Nothing (first phase)
**Requirements**: SUP-01, SUP-02, SUP-03, SUP-04, SUP-05, SUP-06, SUP-07, SUP-08, SUP-09, DEP-01, DEP-02, DEP-03, DEP-04, DEP-05, DEP-06, DEP-07, TPL-01, TPL-02, TPL-03, TPL-04
**Success Criteria** (what must be TRUE):
  1. User can run `docker compose up` and access ClaudeOS-branded code-server in their browser at localhost:8080, authenticated via first-boot password creation
  2. User can create, list, stop, kill, archive, and revive Claude Code sessions through the supervisor API on localhost:3100
  3. User can send input to and capture output from a running Claude Code session via the supervisor API
  4. User can deploy the container to Railway with persistent volume, health check, and restart policy working correctly
  5. Extension template scaffold exists with package.json, tsconfig, source files, build scripts, and AGENTS.md ready for new extension development
**Plans:** 5 plans

Plans:
- [x] 01-01-PLAN.md -- Project scaffold, types, schemas, Fastify server, health endpoint
- [ ] 01-02-PLAN.md -- Session management: tmux service, session manager, REST routes, WebSocket
- [ ] 01-03-PLAN.md -- Platform services: secrets, extensions, settings, boot sequence, first-boot
- [ ] 01-04-PLAN.md -- Nix container image, entrypoint, docker-compose, Railway deployment
- [x] 01-05-PLAN.md -- Extension template scaffold (separate repo)

### Phase 2: Session Management
**Goal**: Users can see all their Claude Code sessions in a visual sidebar, create new sessions, monitor session status, and interact with sessions through attached terminal tabs
**Depends on**: Phase 1
**Requirements**: SES-01, SES-02, SES-03, SES-04, SES-05, SES-06, SES-07, SES-08, SES-09, TRM-01, TRM-02, TRM-03, TRM-04
**Success Criteria** (what must be TRUE):
  1. User can see all Claude Code sessions in a sidebar tree view grouped by status (active, idle, waiting) with appropriate status indicators and notification badges
  2. User can create, rename, archive, delete, and revive sessions from the sidebar with context menus and quick actions
  3. User can click any session in the sidebar to open a terminal tab attached to that session's tmux window, with multiple tabs open simultaneously
  4. User can type directly in a terminal tab to send input to Claude Code, and terminal tabs display session name and status icon
  5. Archived and zombie sessions appear in dedicated sidebar sections with visual differentiation (collapsible archive section, red dot for zombies, bold/gray gradient for read/unread)
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Platform Services
**Goal**: Users can securely store and manage API keys and credentials with encrypted storage, and navigate ClaudeOS through a branded welcome page with shortcuts and recent sessions
**Depends on**: Phase 2
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, HOM-01, HOM-02, HOM-03, HOM-04
**Success Criteria** (what must be TRUE):
  1. User can add, edit, and delete secrets (API keys, tokens) through a webview form, stored with AES-256-GCM encryption derived from CLAUDEOS_AUTH_TOKEN
  2. Other extensions can access secrets through the public API (getSecret, setSecret, hasSecret, deleteSecret, listSecrets), and the Anthropic API key is automatically configured for Claude Code when set
  3. Status bar shows whether the Anthropic API key is configured, and first-run walkthrough prompts the user to set it up
  4. User sees a ClaudeOS-branded welcome tab on startup with recent sessions, a new-session button, and a shortcuts grid for frequently used actions
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Self-Improvement
**Goal**: Claude Code can extend its own capabilities by building, packaging, and installing VS Code extensions at runtime, managed through a visual Extension Manager panel
**Depends on**: Phase 3
**Requirements**: IMP-01, IMP-02, IMP-03, IMP-04, IMP-05, IMP-06, IMP-07, IMP-08
**Success Criteria** (what must be TRUE):
  1. User can see all installed extensions in an Extension Manager sidebar panel and install new extensions by pasting a GitHub repo URL (with optional PAT for private repos) and seeing install progress with log output
  2. User can uninstall extensions from the Extension Manager panel
  3. When user asks Claude Code to build a new feature, Claude Code can scaffold an extension from the template, implement it, build the VSIX, and install it -- completing the self-improvement loop
  4. MCP server exposes install_extension, uninstall_extension, list_extensions, and get_extension_template tools that Claude Code sessions can call, and self-improve sessions are marked with a special icon in the session list
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Supervisor + Container Foundation | 2/5 | In Progress | - |
| 2. Session Management | 0/2 | Not started | - |
| 3. Platform Services | 0/2 | Not started | - |
| 4. Self-Improvement | 0/2 | Not started | - |
