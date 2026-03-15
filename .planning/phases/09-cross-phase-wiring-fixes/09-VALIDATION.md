---
phase: 9
slug: cross-phase-wiring-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (latest, configured per-package) |
| **Config file** | supervisor/vitest.config.ts, claudeos-home/vitest.config.ts |
| **Quick run command** | `cd supervisor && npx vitest run test/services/boot.test.ts -x && cd ../claudeos-home && npx vitest run test/webview/home-panel.test.ts -x` |
| **Full suite command** | `cd supervisor && npm test && cd ../claudeos-home && npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command (boot.test.ts + home-panel.test.ts)
- **After every plan wave:** Run full suite per package
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | SUP-07, SUP-08 | unit | `cd supervisor && npx vitest run test/services/boot.test.ts -x` | ✅ | ⬜ pending |
| 09-01-02 | 01 | 1 | DEP-02 | manual | Nix build: `nix build .#container` | N/A | ⬜ pending |
| 09-01-03 | 01 | 1 | HOM-03, TRM-01 | unit | `cd claudeos-home && npx vitest run test/webview/home-panel.test.ts -x` | ✅ (needs update) | ⬜ pending |
| 09-01-04 | 01 | 1 | TRM-01 | unit | `cd claudeos-home && npx vitest run test/webview/home-panel.test.ts -x` | ✅ (needs update) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. Only test assertion updates needed (not new files).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Container includes default-extensions.json at correct path | DEP-02 | Requires Nix build & container inspection | `nix build .#container` then verify `/app/config/default-extensions.json` exists in image |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
