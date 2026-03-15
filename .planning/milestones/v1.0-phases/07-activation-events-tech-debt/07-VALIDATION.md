---
phase: 7
slug: activation-events-tech-debt
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.0 |
| **Config file** | vitest.config.ts per extension (claudeos-sessions, claudeos-self-improve) |
| **Quick run command** | `cd claudeos-sessions && npx vitest run` |
| **Full suite command** | `cd claudeos-sessions && npx vitest run && cd ../claudeos-self-improve && npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run` in affected extension
- **After every plan wave:** Run full suite command (both extensions)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | SES-01, TRM-01, HOM-01, HOM-03 | manual-only | Verify package.json contents | N/A | ⬜ pending |
| 7-01-02 | 01 | 1 | SEC-02, HOM-04 | manual-only | Verify package.json contents | N/A | ⬜ pending |
| 7-01-03 | 01 | 1 | IMP-06 | unit | `cd claudeos-self-improve && npx vitest run test/mcp-server/tools.test.ts` | ❌ W0 | ⬜ pending |
| 7-01-04 | 01 | 1 | SES-01 | unit | `cd claudeos-sessions && npx vitest run test/terminal/terminal-manager.test.ts` | ❌ W0 | ⬜ pending |
| 7-01-05 | 01 | 1 | SES-01 | unit | `cd claudeos-sessions && npx vitest run test/terminal/terminal-manager.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `claudeos-self-improve/test/mcp-server/tools.test.ts` — add test for handleList error case (res.ok = false)
- [ ] `claudeos-sessions/test/terminal/terminal-manager.test.ts` — add test for dedup guard (notifySessionExit called twice, only fires once)
- [ ] `claudeos-sessions/test/terminal/terminal-manager.test.ts` — add test for showInformationMessage on exit

*Activation event changes are JSON-only and verified by inspection, not unit tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sessions activates on command execution | SES-01, TRM-01, HOM-01, HOM-03 | JSON config — no runtime logic to test | Verify `onCommand:claudeos.sessions.create` and `onCommand:claudeos.sessions.openTerminal` in package.json activationEvents |
| Secrets activates on command execution | SEC-02, HOM-04 | JSON config — no runtime logic to test | Verify `onCommand:claudeos.secrets.openEditor` in package.json activationEvents |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
