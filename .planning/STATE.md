---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Zero-Config Onboarding
status: executing
stopped_at: Completed 12-03-PLAN.md
last_updated: "2026-03-16T01:10:03.136Z"
last_activity: 2026-03-15 — Completed 12-03 (Wizard Integration and Container Build)
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 8
  completed_plans: 8
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-16)

**Core value:** Give Claude Code a real, extensible browser UI and the ability to expand its own capabilities by building and installing new extensions -- without ever modifying Claude Code itself.
**Current focus:** v1.1 Zero-Config Onboarding — Phase 12 in progress

## Current Position

Milestone: v1.1 Zero-Config Onboarding
Phase: 12 of 13 (Wizard UI and Build Progress) — Plan 3 of 3
Status: Executing
Last activity: 2026-03-15 — Completed 12-03 (Wizard Integration and Container Build)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 21 (v1.0)
- v1.1 plans completed: 6

**By Phase (v1.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 10-security-foundation | 2/2 | 8min | 4min |
| 11-auth-services-and-wizard-backend | 3/3 | 7min | 2.3min |
| 12-wizard-ui-and-build-progress | 3/3 | 11min | 3.7min |

*Updated after each plan completion*
| Phase 12 P02 | 4min | 2 tasks | 18 files |
| Phase 12 P03 | 4min | 3 tasks | 2 files |

## Accumulated Context

### Decisions

- Railway CLI auth (`railway login --browserless`) chosen over custom OAuth app — pairing code flow, no redirect URIs, works on every fork
- Claude Code auth via API key input (ANTHROPIC_API_KEY) — officially documented Docker pattern, `claude login` as experimental fallback
- First-boot wizard on port 8080 replaces env var auth — zero-config, same port as code-server with clean handoff
- Setup race condition must be fixed before new auth code ships (Portainer CVE precedent)
- railway.json uses dockerImage builder (not DOCKERFILE) since project deploys pre-built GHCR image
- In-memory mutex (setupInProgress flag) for setup race condition — sufficient for single-process Node.js
- auth.json eliminated entirely — CLAUDEOS_AUTH_TOKEN env var is the sole auth source
- SecretStore encryption key derived via scryptSync(token, fixed_salt, 32) for deterministic key
- [Phase 11]: Followed SecretStore atomic write pattern (tmp+rename) for wizard state persistence
- [Phase 11]: In-memory completionInProgress mutex for concurrent completion guard (same as BootService pattern)
- [Phase 11]: Railway stdout parsed incrementally for URL and 3-4 word hyphenated pairing code
- [Phase 11]: Anthropic API key validated via POST to messages endpoint, checking 401 vs non-401 (zero-cost)
- [Phase 11]: Claude login has 10-second URL capture timeout with fallback to API key method
- [Phase 11]: Zod schemas used for all response types (not raw JSON Schema) with fastify-type-provider-zod serializer
- [Phase 12]: Theme CSS variables hardcoded from setup.html palette (no VS Code theme JSON exists yet)
- [Phase 12]: Build progress polling at 2s interval with JSON comparison to avoid duplicate broadcasts
- [Phase 12]: useSSE uses handlersRef pattern to avoid reconnection on handler identity changes
- [Phase 12]: Single useWizardStatus hook with ref-guarded INIT dispatch avoids triple fetch
- [Phase 12]: Stable SSE handlers via useRef delegation -- object created once, delegates to mutable current ref
- [Phase 12]: API key validation defers success to SSE event, not optimistic local dispatch
- [Phase 12]: POST /api/v1/setup kept as direct handler (not proxied) -- controls setup server lifecycle
- [Phase 12]: wizardDist npmDepsHash uses lib.fakeHash, real hash computed on first Linux nix build

### Pending Todos

1. **Fix deploy on Railway button in README** (docs) — addressed in Phase 10

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-16T01:04:57Z
Stopped at: Completed 12-03-PLAN.md
Resume file: None
