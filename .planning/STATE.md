---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Zero-Config Onboarding
status: executing
stopped_at: Completed 11-03-PLAN.md
last_updated: "2026-03-16T00:11:16.330Z"
last_activity: 2026-03-15 — Completed 11-03 (Wizard Routes)
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 5
  completed_plans: 5
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-15)

**Core value:** Give Claude Code a real, extensible browser UI and the ability to expand its own capabilities by building and installing new extensions -- without ever modifying Claude Code itself.
**Current focus:** v1.1 Zero-Config Onboarding — Phase 10 complete, Phase 11 next

## Current Position

Milestone: v1.1 Zero-Config Onboarding
Phase: 11 of 13 (Auth Services and Wizard Backend) — Plan 3 of 3
Status: Executing
Last activity: 2026-03-15 — Completed 11-03 (Wizard Routes)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 21 (v1.0)
- v1.1 plans completed: 5

**By Phase (v1.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 10-security-foundation | 2/2 | 8min | 4min |
| 11-auth-services-and-wizard-backend | 3/3 | 7min | 2.3min |

*Updated after each plan completion*

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

### Pending Todos

1. **Fix deploy on Railway button in README** (docs) — addressed in Phase 10

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-16T00:11:16.328Z
Stopped at: Completed 11-03-PLAN.md
Resume file: None
