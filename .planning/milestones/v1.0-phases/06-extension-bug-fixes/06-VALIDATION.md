---
phase: 6
slug: extension-bug-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `supervisor/vitest.config.ts`, `claudeos-home/vitest.config.ts` |
| **Quick run command** | `cd supervisor && npx vitest run -x && cd ../claudeos-home && npx vitest run -x` |
| **Full suite command** | `cd supervisor && npx vitest run && cd ../claudeos-home && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd supervisor && npx vitest run -x && cd ../claudeos-home && npx vitest run -x`
- **After every plan wave:** Run `cd supervisor && npx vitest run && cd ../claudeos-home && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | IMP-03 | unit | `cd supervisor && npx vitest run test/routes/extensions.test.ts -x` | ✅ (extend) | ⬜ pending |
| 06-01-02 | 01 | 1 | IMP-03 | unit | `cd supervisor && npx vitest run test/services/extension-installer.test.ts -x` | ✅ (extend) | ⬜ pending |
| 06-01-03 | 01 | 1 | HOM-04 | unit | `cd claudeos-home && npx vitest run test/webview/home-panel.test.ts -x` | ✅ (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Extend existing test files with new test cases.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Private repo install with PAT end-to-end | IMP-03 | Requires real GitHub PAT and private repo | 1. Set a PAT secret, 2. Install extension from private repo, 3. Verify VSIX downloads |
| API key banner renders correctly in webview | HOM-04 | Webview rendering requires VS Code host | 1. Open Home panel, 2. Verify banner shows correct key status |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
