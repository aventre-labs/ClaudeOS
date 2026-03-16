# Roadmap: ClaudeOS

## Milestones

- ✅ **v1.0 ClaudeOS Initial Release** — Phases 1-9 (shipped 2026-03-15)
- 🚧 **v1.1 Zero-Config Onboarding** — Phases 10-13 (in progress)

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

### v1.1 Zero-Config Onboarding

**Milestone Goal:** Users deploy ClaudeOS and complete setup through a guided wizard — no env vars, no CLI access, no documentation required.

- [x] **Phase 10: Security Foundation** - Fix setup race condition and make deploy button fork-friendly
- [ ] **Phase 11: Auth Services and Wizard Backend** - CLI auth wrappers, API key storage, wizard state persistence, and server endpoints
- [ ] **Phase 12: Wizard UI and Build Progress** - Multi-step stepper wizard with build progress display and SSE-driven auth flows
- [ ] **Phase 13: Launch Integration** - Boot wiring, port handoff to code-server, and container validation

## Phase Details

### Phase 10: Security Foundation
**Goal**: Setup endpoint is secure against race conditions and deploy button works on any fork
**Depends on**: v1.0 (Phase 9)
**Requirements**: SETUP-04, DEPLOY-01
**Success Criteria** (what must be TRUE):
  1. Two simultaneous first-boot requests cannot both claim the instance — the second request receives a 409 Conflict response
  2. README deploy button works when clicked from any GitHub fork without editing repo URLs or config files
  3. An atomic lock file prevents concurrent config writes from corrupting setup state
**Plans:** 2/2 plans complete

Plans:
- [x] 10-01-PLAN.md — Race condition protection and auth model migration (BootService + SecretStore)
- [x] 10-02-PLAN.md — Deploy button URL fix, GitHub Action fork patching, and railway.json config

### Phase 11: Auth Services and Wizard Backend
**Goal**: Users can authenticate with Railway and Anthropic through server-side services, with wizard state that survives container restarts
**Depends on**: Phase 10
**Requirements**: AUTH-01, AUTH-02, AUTH-03, SETUP-03
**Success Criteria** (what must be TRUE):
  1. User can initiate Railway login and receive a pairing code and URL to complete auth on railway.com
  2. User can submit an Anthropic API key that is validated and persisted for Claude Code to use
  3. User can attempt `claude login` interactive flow, with automatic fallback to API key entry if the container does not support it
  4. Wizard progress is written to disk after each completed step, so a container restart resumes at the last completed step instead of starting over
**Plans:** 2/3 plans executed

Plans:
- [ ] 11-01-PLAN.md — Wizard types, Zod schemas, and WizardStateService with atomic file persistence
- [ ] 11-02-PLAN.md — Railway and Anthropic auth services with subprocess management
- [ ] 11-03-PLAN.md — Wizard REST+SSE routes, rate limiting, and server.ts wiring

### Phase 12: Wizard UI and Build Progress
**Goal**: Users see a polished multi-step wizard with real-time build progress instead of a blank page during first boot
**Depends on**: Phase 11
**Requirements**: SETUP-01, SETUP-02, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):
  1. User sees build status updates with descriptive messages during first boot while extensions install, instead of a blank or spinner-only page
  2. User is guided through a visual stepper showing their current position in the setup flow (Railway auth, Claude auth, Launch)
  3. Each auth step that is already configured shows the current auth status (e.g., "Railway: signed in") with a Sign Out option
  4. Each auth step shows an option to add an alternative auth method (e.g., "+ Add auth token" for Railway, "+ Add another method" for Anthropic)
**Plans**: TBD

Plans:
- [ ] 12-01: TBD

### Phase 13: Launch Integration
**Goal**: Users complete the wizard and launch into a fully functional ClaudeOS instance
**Depends on**: Phase 12
**Requirements**: DEPLOY-02
**Success Criteria** (what must be TRUE):
  1. A "Launch ClaudeOS" button appears only after all required auth steps are complete
  2. Clicking Launch transitions from the wizard server to code-server on port 8080 without requiring a manual page refresh
  3. After launch, Claude Code sessions have access to all credentials configured during setup
**Plans**: TBD

Plans:
- [ ] 13-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 10 -> 11 -> 12 -> 13

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
| 11. Auth Services and Wizard Backend | 2/3 | In Progress|  | - |
| 12. Wizard UI and Build Progress | v1.1 | 0/1 | Not started | - |
| 13. Launch Integration | v1.1 | 0/1 | Not started | - |
