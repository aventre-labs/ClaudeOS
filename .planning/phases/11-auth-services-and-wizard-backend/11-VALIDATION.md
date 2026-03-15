---
phase: 11
slug: auth-services-and-wizard-backend
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 |
| **Config file** | `supervisor/vitest.config.ts` |
| **Quick run command** | `cd supervisor && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd supervisor && npx vitest run` |
| **Estimated runtime** | ~6 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd supervisor && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd supervisor && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 6 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | SETUP-03 | unit | `cd supervisor && npx vitest run test/services/wizard-state.test.ts -x` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | AUTH-01 | unit | `cd supervisor && npx vitest run test/services/auth-railway.test.ts -x` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 1 | AUTH-02 | unit | `cd supervisor && npx vitest run test/services/auth-anthropic.test.ts -t "API key" -x` | ❌ W0 | ⬜ pending |
| 11-01-04 | 01 | 1 | AUTH-03 | unit | `cd supervisor && npx vitest run test/services/auth-anthropic.test.ts -t "claude login" -x` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 1 | ROUTES | integration | `cd supervisor && npx vitest run test/routes/wizard.test.ts -x` | ❌ W0 | ⬜ pending |
| 11-02-02 | 02 | 1 | SSE | integration | `cd supervisor && npx vitest run test/routes/wizard.test.ts -t "SSE" -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supervisor/test/services/wizard-state.test.ts` — wizard state CRUD, persistence, atomic writes
- [ ] `supervisor/test/services/auth-railway.test.ts` — Railway login subprocess, output parsing, SecretStore persistence
- [ ] `supervisor/test/services/auth-anthropic.test.ts` — API key validation, SecretStore persistence, claude login subprocess
- [ ] `supervisor/test/routes/wizard.test.ts` — wizard route endpoints, SSE, completion guard
- [ ] Install dependency: `cd supervisor && npm install @fastify/rate-limit@^10.3.0`

*Existing infrastructure covers test framework — only new test files and one dependency needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Railway login completes end-to-end | AUTH-01 | Requires real Railway account and browser interaction | Run `railway login --browserless` in container, complete auth in browser |
| Claude login completes in container | AUTH-03 | Requires real Anthropic account and browser interaction | Run `claude login` in container, verify URL output and completion |
| Wizard state survives container restart | SETUP-03 | Requires Railway container restart | Complete wizard step, restart container, verify resume |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 6s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
