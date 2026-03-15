---
phase: 10
slug: security-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 |
| **Config file** | `supervisor/vitest.config.ts` |
| **Quick run command** | `cd supervisor && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd supervisor && npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd supervisor && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd supervisor && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | SETUP-04 | unit | `cd supervisor && npx vitest run test/services/boot.test.ts -t "race condition" -x` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | SETUP-04 | unit | `cd supervisor && npx vitest run test/services/boot.test.ts -t "lock file" -x` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | DEPLOY-01 | smoke | `grep -q "railway.app/new/template?template=https://github.com/" README.md` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supervisor/test/services/boot.test.ts` — add race condition tests (concurrent setup requests, second gets 409)
- [ ] `supervisor/test/services/boot.test.ts` — add `isConfigured()` env var tests
- [ ] `supervisor/test/services/secret-store.test.ts` — add env-var-derived encryption key tests
- [ ] Verify existing tests still pass after auth.json removal

*Existing infrastructure covers test framework — only new test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Deploy button works from forked repo | DEPLOY-01 | Requires GitHub fork creation | Fork repo, verify GitHub Action patches README URL |
| GitHub Action triggers on fork push | DEPLOY-01 | Requires real GitHub environment | Fork, enable Actions, push, check README diff |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
