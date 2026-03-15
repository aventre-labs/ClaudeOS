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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 9 | 21 | First milestone; established audit-driven hardening pattern |

### Cumulative Quality

| Milestone | Requirements | Satisfied | Audit Passes |
|-----------|-------------|-----------|--------------|
| v1.0 | 51 | 51 (100%) | 5 |

### Top Lessons (Verified Across Milestones)

1. Plan for integration verification as a first-class phase, not an afterthought
2. Iterative audits catch real bugs that code review misses
