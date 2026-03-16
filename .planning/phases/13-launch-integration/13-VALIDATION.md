---
phase: 13
slug: launch-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.0.0 |
| **Config file** | `supervisor/vitest.config.ts` |
| **Quick run command** | `cd supervisor && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd supervisor && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd supervisor && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd supervisor && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | DEPLOY-02b | unit | `cd supervisor && npx vitest run test/services/credential-writer.test.ts -x` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | DEPLOY-02a | integration | `cd supervisor && npx vitest run test/routes/wizard.test.ts -x` | ✅ (needs new tests) | ⬜ pending |
| 13-01-03 | 01 | 1 | DEPLOY-02c | integration | `cd supervisor && npx vitest run test/routes/wizard.test.ts -x` | ✅ (needs new tests) | ⬜ pending |
| 13-01-04 | 01 | 1 | DEPLOY-02d | unit | `cd supervisor && npx vitest run test/boot-wiring.test.ts -x` | ✅ (needs new tests) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supervisor/test/services/credential-writer.test.ts` — stubs for DEPLOY-02b (credential writer reads SecretStore, writes to ~/.claude/settings.json)
- [ ] New test cases in `supervisor/test/routes/wizard.test.ts` — for POST /wizard/launch endpoint and launch:ready SSE event
- [ ] New test cases in `supervisor/test/boot-wiring.test.ts` — for container restart fast path

*Existing infrastructure covers framework and config needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Launch transition animation renders correctly | DEPLOY-02 | Visual/CSS animation verification | 1. Complete wizard auth steps 2. Click "Launch ClaudeOS" 3. Verify centered logo, animated dots, cycling status text on dark background |
| window.location.replace('/') redirects without back-button | DEPLOY-02 | Browser navigation behavior | 1. Launch ClaudeOS 2. After redirect, press browser back 3. Verify no return to wizard |
| Port handoff timing works in container | DEPLOY-02 | Requires actual port binding/release | 1. Run in container 2. Launch ClaudeOS 3. Verify no EADDRINUSE errors in logs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
