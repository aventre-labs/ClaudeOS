---
phase: 5
slug: supervisor-wiring-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | supervisor/vitest.config.ts |
| **Quick run command** | `cd supervisor && npx vitest run` |
| **Full suite command** | `cd supervisor && npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd supervisor && npx vitest run`
- **After every plan wave:** Run `cd supervisor && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | SUP-01, DEP-04, HOM-01 | integration | `cd supervisor && npx vitest run test/boot-wiring.test.ts -x` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | SES-01, SES-03, SES-06, SES-09, TRM-01, TRM-02 | unit | `cd claudeos-sessions && npx vitest run test/ws-client.test.ts -x` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06 | integration | `cd supervisor && npx vitest run test/routes/secrets-unconditional.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supervisor/test/boot-wiring.test.ts` — verify BootService is called from main entry point
- [ ] `supervisor/test/routes/secrets-unconditional.test.ts` — verify secrets routes respond 200/503 even when auth.json missing at build time
- [ ] WS URL assertion test — verify WsClient default URL matches server handler path `/api/v1/ws`

*Existing vitest infrastructure covers framework installation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First-boot setup page served | SUP-01 | Requires fresh container with no auth.json | 1. Delete auth.json 2. Start supervisor 3. Verify setup page on port 3100 |
| Code-server launches with branding | SUP-01 | Requires full code-server binary | 1. Complete first-boot 2. Verify code-server process running 3. Check branding applied |
| Real-time terminal output streaming | TRM-01 | Requires VS Code extension + live WS | 1. Open session in sidebar 2. Click to open terminal 3. Verify live output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
