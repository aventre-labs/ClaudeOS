# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — ClaudeOS Initial Release

**Shipped:** 2026-03-15
**Phases:** 9 | **Plans:** 21 | **Requirements:** 51/51

### What Was Built
- Supervisor process (Fastify 5) managing code-server boot, tmux sessions, secrets, and extension installation
- 5 first-party VS Code extensions: sessions sidebar, terminal tabs, encrypted secrets, home page, self-improvement (MCP + extension manager)
- Nix-built Docker container deployable on Railway with persistent volume
- Self-improvement loop: Claude Code scaffolds, builds, and installs new extensions at runtime via MCP tools
- Full audit/verification pipeline proving 51/51 requirements across 9 phases

### What Worked
- **Bottom-up dependency ordering** — building supervisor first, then extensions in dependency order, avoided backtracking
- **Iterative audit/fix cycles** — 5 audit passes caught integration bugs that would have been painful in production (boot wiring, WebSocket URL, activation gaps, container paths)
- **Lazy initialization patterns** — `tryCreate()` factory and conditional route registration solved circular dependency issues cleanly
- **4-day execution pace** — 21 plans averaging ~5 min each kept momentum high with zero blocked plans
- **Cross-extension public API pattern** — `activate()` returning typed API objects worked seamlessly for secrets and sessions

### What Was Inefficient
- **5 audit-driven phases (5-9) added after initial 4-phase plan** — initial planning missed integration wiring, requiring 5 additional phases. Future milestones should include an integration verification phase in the original plan
- **ROADMAP.md checkbox inconsistency** — some phases marked `[ ]` despite being complete, causing confusion during audits. Automation should handle checkbox state
- **Duplicate type definitions** — `SecretsPublicApi` duplicated across extensions by design, but this creates a sync maintenance burden

### Patterns Established
- Supervisor client pattern: typed HTTP client wrapping fetch for each extension
- WebSocket client with auto-reconnect and subscription replay
- Webview HTML embedded as template literals with CSP nonce per render
- Discriminated union types for polymorphic API inputs (DefaultExtension, InstallExtensionSchema)
- `onCommand` activation events for cross-extension triggers (not `onStartupFinished`)
- Session cache pattern on webview panels for click-through data

### Key Lessons
1. **Plan for integration testing from day one** — the initial 4-phase plan assumed wiring would work; 5 additional phases were needed to close integration gaps. Include an integration verification phase in every milestone.
2. **Lazy initialization > eager initialization** for optional services — the `tryCreate()` pattern resolved all circular dependency issues without sacrificing type safety.
3. **Audit-driven development works** — systematic milestone audits found real bugs (P0 boot failures, broken WebSocket URLs) that code review alone missed.
4. **Activation events matter** — lazy VS Code extension activation requires careful `onCommand` registration for cross-extension workflows; `onView` alone is insufficient.
5. **Container path mismatches are easy to miss** — Nix build paths and container runtime paths can diverge silently; always test the actual container, not just the build.

### Cost Observations
- Model mix: ~70% opus, ~30% sonnet (planning/research on sonnet, execution on opus)
- Sessions: ~15 sessions across 4 days
- Notable: 5 min average per plan is fast; the audit/fix cycles were the dominant time cost

---

## Milestone: v1.1 — Zero-Config Onboarding

**Shipped:** 2026-03-16
**Phases:** 4 | **Plans:** 10 | **Requirements:** 11/11

### What Was Built
- Race-condition-protected first-boot setup with scrypt-derived encryption and env-var auth model
- Railway and Anthropic auth services with subprocess CLI management, zero-cost API key validation
- React wizard UI (Vite + React 19) with multi-step stepper, build progress, auth status, CSS modules
- Launch transition flow with credential writer, code-server port handoff, animated SSE-driven redirect
- Fork-friendly deploy button with GitHub Action auto-patching and railway.json template variables

### What Worked
- **v1.0 lessons applied** — no audit/fix phases needed this time; all 11 requirements satisfied in the initial 4 phases
- **~35 min total execution** — 10 plans averaging 3.5 min each, fastest milestone yet
- **Reuse of v1.0 patterns** — atomic write (tmp+rename), in-memory mutex, SSE broadcasting, Zod type provider all carried forward cleanly
- **Frontend + backend in parallel plans** — Phase 12 Plan 01 scaffolded React while Plan 02 built components; clean handoff
- **Zero regressions** — all 222 existing tests passed throughout, no breakage from new wizard code

### What Was Inefficient
- **ROADMAP.md checkbox inconsistency persisted** — Phase 11-13 plan checkboxes still `[ ]` despite completion; same issue from v1.0 not yet automated
- **wizardDist fakeHash** — Nix build requires Linux for real hash computation; placeholder works but adds a manual step on first real container build

### Patterns Established
- Subprocess auth flow: spawn CLI → parse stdout → notify callbacks → track for cancel/cleanup
- SSE lifecycle management: connection stays open through wizard completion, closes on terminal event (launch:ready)
- Reducer refresh resilience: INIT action inspects server state to restore correct UI on page reload
- CSS Modules with theme CSS custom properties (var(--color-*)) throughout wizard UI
- Background async launch: POST returns 200 immediately, fires long-running work in void promise

### Key Lessons
1. **Applying v1.0 patterns eliminated rework** — reusing atomic write, mutex, and SSE patterns meant zero design decisions for infrastructure, letting plans focus on business logic
2. **Small milestone scope = no audit phases needed** — v1.0 needed 5 audit/fix phases because scope was large; v1.1's focused 4-phase scope shipped clean
3. **React + SSE is a strong combo for real-time wizard flows** — SSE events drive all state transitions, making the frontend a pure state machine with no polling
4. **Background async launch avoids HTTP timeouts** — returning 200 immediately and delivering completion via SSE is the right pattern for any operation that may take >10s

### Cost Observations
- Model mix: ~80% opus, ~20% sonnet (execution on opus, planning/research on sonnet)
- Sessions: ~3 sessions across ~4 hours
- Notable: 3.5 min/plan average is 30% faster than v1.0's 5 min/plan — pattern reuse pays off

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Avg Plan Time | Key Change |
|-----------|--------|-------|---------------|------------|
| v1.0 | 9 | 21 | ~5 min | Established audit-driven hardening pattern |
| v1.1 | 4 | 10 | ~3.5 min | Pattern reuse eliminated audit phases; 30% faster per plan |

### Cumulative Quality

| Milestone | Requirements | Satisfied | Audit Passes | Test Count |
|-----------|-------------|-----------|--------------|------------|
| v1.0 | 51 | 51 (100%) | 5 | 155 |
| v1.1 | 11 | 11 (100%) | 0 needed | 222 |

### Top Lessons (Verified Across Milestones)

1. **Pattern reuse compounds** — v1.0 established patterns (atomic write, mutex, SSE); v1.1 reused them and shipped 30% faster per plan
2. **Iterative audits catch real bugs** — v1.0 proved this; v1.1 didn't need audits because scope was smaller and patterns were proven
3. **Plan for integration testing from day one** — v1.0 needed 5 fix phases; v1.1 scoped tightly enough that integration was implicit in each phase
