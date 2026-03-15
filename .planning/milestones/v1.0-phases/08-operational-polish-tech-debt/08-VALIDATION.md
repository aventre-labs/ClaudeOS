---
phase: 8
slug: operational-polish-tech-debt
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (latest) |
| **Config file** | `supervisor/vitest.config.ts`, `claudeos-self-improve/vitest.config.ts` |
| **Quick run command** | `cd supervisor && npx vitest run test/services/extension-installer.test.ts` |
| **Full suite command** | `cd supervisor && npx vitest run && cd ../claudeos-self-improve && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd supervisor && npx vitest run -x`
- **After every plan wave:** Run `cd supervisor && npx vitest run && cd ../claudeos-self-improve && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | SUP-07, SUP-08 | unit | `cd supervisor && npx vitest run test/services/boot.test.ts -x` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | IMP-03 | unit | `cd claudeos-self-improve && npx vitest run test/commands/install-extension.test.ts -x` | ✅ (needs update) | ⬜ pending |
| 08-01-03 | 01 | 1 | DEP-02 | manual-only | `nix build .#container` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supervisor/test/services/boot.test.ts` — unit tests for BootService.installExtensions() with local-vsix entries
- [ ] Update `claudeos-self-improve/test/commands/install-extension.test.ts` — add test case for debug log when secrets extension inactive

*Extension installer installFromVsix is already tested in extension-installer.test.ts*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Container includes pre-built VSIX files at /app/extensions/ | DEP-02 | Nix container build requires full rebuild | Run `nix build .#container`, inspect image for /app/extensions/*.vsix |
| npmDepsHash is correct | DEP-02 | Hash verification requires actual Nix build | Run `nix build .#default`, verify no hash mismatch error |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
