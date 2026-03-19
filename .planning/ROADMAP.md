# Roadmap: ClaudeOS

## Milestones

- ✅ **v1.0 ClaudeOS Initial Release** — Phases 1-9 (shipped 2026-03-15)
- ✅ **v1.1 Zero-Config Onboarding** — Phases 10-13 (shipped 2026-03-16)
- 🚧 **v1.2 UI Polish & Workspaces** — Phases 14-17 (in progress)

## Phases

<details>
<summary>✅ v1.0 ClaudeOS Initial Release (Phases 1-9) — SHIPPED 2026-03-15</summary>

- [x] Phase 1: Supervisor + Container Foundation (5/5 plans) — completed 2026-03-12
- [x] Phase 2: Session Management (3/3 plans) — completed 2026-03-12
- [x] Phase 3: Platform Services (3/3 plans) — completed 2026-03-13
- [x] Phase 4: Self-Improvement (3/3 plans) — completed 2026-03-14
- [x] Phase 5: Supervisor Wiring Fixes (1/1 plan) — completed 2026-03-14
- [x] Phase 6: Extension Bug Fixes (1/1 plan) — completed 2026-03-14
- [x] Phase 7: Activation Events & Tech Debt Hardening (2/2 plans) — completed 2026-03-15
- [x] Phase 8: Operational Polish & Tech Debt (2/2 plans) — completed 2026-03-15
- [x] Phase 9: Cross-Phase Wiring Fixes (1/1 plan) — completed 2026-03-15

See: `milestones/v1.0-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.1 Zero-Config Onboarding (Phases 10-13) — SHIPPED 2026-03-16</summary>

- [x] Phase 10: Security Foundation (2/2 plans) — completed 2026-03-15
- [x] Phase 11: Auth Services and Wizard Backend (3/3 plans) — completed 2026-03-16
- [x] Phase 12: Wizard UI and Build Progress (3/3 plans) — completed 2026-03-16
- [x] Phase 13: Launch Integration (2/2 plans) — completed 2026-03-16

See: `milestones/v1.1-ROADMAP.md` for full phase details.

</details>

### 🚧 v1.2 UI Polish & Workspaces (In Progress)

**Milestone Goal:** Polish all custom UI with unified theming, add workspace management, and enable Claude to self-test its own UI via Claude in Chrome.

- [ ] **Phase 14: Theme Foundation & Infrastructure** - Unified dark theme, CSS variable migration, Copilot removal, welcome page, and default extensions restructure
- [ ] **Phase 15: Session View Redesign** - Native terminal sessions with proper resize, clean presentation, and keyboard shortcuts
- [ ] **Phase 16: Workspace Manager** - Sidebar extension replacing Copilot slot with persistent tabbed workspaces and session filtering
- [ ] **Phase 17: Browser Integration & Self-Testing** - Claude in Chrome session monitoring and UI self-testing skill files

## Phase Details

### Phase 14: Theme Foundation & Infrastructure
**Goal**: ClaudeOS has a unified visual identity — every panel, webview, and wizard renders through VS Code theme variables, the default extensions are version-controlled in-repo, and Copilot UI is gone
**Depends on**: Phase 13
**Requirements**: THEME-01, THEME-02, THEME-03, THEME-04, THEME-05, INFR-01, INFR-02, INFR-03, WELC-01, WELC-02, WELC-03
**Success Criteria** (what must be TRUE):
  1. Opening ClaudeOS shows the ClaudeOS Dark theme by default with branded accent colors across the editor, sidebar, and activity bar
  2. Changing VS Code theme in settings updates all custom panels (Home, Sessions sidebar) and the setup wizard to match — no hardcoded colors remain
  3. The welcome page opens on startup with ClaudeOS-specific quick actions and getting-started content (not default VS Code welcome)
  4. Copilot chat sidebar and AI features are fully disabled — no Copilot UI elements visible anywhere
  5. Default extensions live in `default-extensions/` and the build process (Nix/Dockerfile) sources them from there
**Plans**: 4 plans

Plans:
- [ ] 14-01-PLAN.md — ClaudeOS Dark theme palette and Copilot disable in settings.json
- [ ] 14-02-PLAN.md — Default extensions directory restructure (JSON manifest to directory scanning)
- [ ] 14-03-PLAN.md — Home panel CSS migration, welcome content, and noise/glow effects
- [ ] 14-04-PLAN.md — Secrets panel CSS migration to pure theme variables

### Phase 15: Session View Redesign
**Goal**: Users interact with Claude Code sessions through VS Code's native integrated terminal with proper resize behavior, clean presentation, and fast keyboard access
**Depends on**: Phase 14
**Requirements**: SESS-01, SESS-02, SESS-03, SESS-04
**Success Criteria** (what must be TRUE):
  1. Claude Code sessions render in VS Code's native integrated terminal and auto-resize correctly when the panel is resized (no wrapping bugs)
  2. Session terminal presentation matches the clean, focused style of opencode's VS Code extension — minimal chrome, content-first
  3. User can create a new session and focus an existing session via keyboard shortcuts without touching the mouse
  4. Session list sidebar shows status indicators (active/idle/archived) alongside terminal tabs with clean visual hierarchy
**Plans**: TBD

Plans:
- [ ] 15-01: TBD
- [ ] 15-02: TBD

### Phase 16: Workspace Manager
**Goal**: Users can organize their work into persistent workspaces — each with its own directory and filtered session list — via a sidebar that replaces the Copilot slot
**Depends on**: Phase 14 (Copilot slot cleared), Phase 15 (session list stable for filtering)
**Requirements**: WORK-01, WORK-02, WORK-03, WORK-04, WORK-05
**Success Criteria** (what must be TRUE):
  1. Workspace manager appears in the activity bar where Copilot used to be, with its own sidebar view
  2. User can create, switch between, and delete workspaces — switching changes VS Code's working directory without a window reload
  3. Session list automatically filters to show only sessions belonging to the active workspace
  4. Workspace configuration (names, paths, active workspace) persists across container restarts
**Plans**: TBD

Plans:
- [ ] 16-01: TBD
- [ ] 16-02: TBD

### Phase 17: Browser Integration & Self-Testing
**Goal**: Claude in Chrome browser sessions are visible in the VS Code UI and Claude Code knows how to self-test its own UI via browser automation
**Depends on**: Phase 15 (session infrastructure stable)
**Requirements**: BRWS-01, BRWS-02, BRWS-03, TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. VS Code extension panel shows active Claude in Chrome browser sessions with live status
  2. Past browser sessions appear with greyscale thumbnails distinguishing them from active sessions
  3. Claude Code can follow the browser-test skill file to verify its own UI works correctly via Claude in Chrome (local deployment only for v1.2)
**Plans**: TBD

Plans:
- [ ] 17-01: TBD
- [ ] 17-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 14 → 15 → 16 → 17

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Supervisor + Container Foundation | v1.0 | 5/5 | Complete | 2026-03-12 |
| 2. Session Management | v1.0 | 3/3 | Complete | 2026-03-12 |
| 3. Platform Services | v1.0 | 3/3 | Complete | 2026-03-13 |
| 4. Self-Improvement | v1.0 | 3/3 | Complete | 2026-03-14 |
| 5. Supervisor Wiring Fixes | v1.0 | 1/1 | Complete | 2026-03-14 |
| 6. Extension Bug Fixes | v1.0 | 1/1 | Complete | 2026-03-14 |
| 7. Activation Events & Tech Debt | v1.0 | 2/2 | Complete | 2026-03-15 |
| 8. Operational Polish & Tech Debt | v1.0 | 2/2 | Complete | 2026-03-15 |
| 9. Cross-Phase Wiring Fixes | v1.0 | 1/1 | Complete | 2026-03-15 |
| 10. Security Foundation | v1.1 | 2/2 | Complete | 2026-03-15 |
| 11. Auth Services and Wizard Backend | v1.1 | 3/3 | Complete | 2026-03-16 |
| 12. Wizard UI and Build Progress | v1.1 | 3/3 | Complete | 2026-03-16 |
| 13. Launch Integration | v1.1 | 2/2 | Complete | 2026-03-16 |
| 14. Theme Foundation & Infrastructure | 2/4 | In Progress|  | - |
| 15. Session View Redesign | v1.2 | 0/? | Not started | - |
| 16. Workspace Manager | v1.2 | 0/? | Not started | - |
| 17. Browser Integration & Self-Testing | v1.2 | 0/? | Not started | - |
