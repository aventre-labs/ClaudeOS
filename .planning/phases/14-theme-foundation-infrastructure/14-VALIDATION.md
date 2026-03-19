---
phase: 14
slug: theme-foundation-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^3.0.0 |
| **Config file** | Per-extension: `claudeos-home/vitest.config.ts`, `claudeos-secrets/vitest.config.ts`, `supervisor/vitest.config.ts` |
| **Quick run command** | `cd claudeos-home && npx vitest run --reporter=verbose` |
| **Full suite command** | `for d in claudeos-home claudeos-secrets supervisor; do (cd $d && npx vitest run); done` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd claudeos-home && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `for d in claudeos-home claudeos-secrets supervisor; do (cd $d && npx vitest run); done`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | THEME-01 | unit | `cd supervisor && npx vitest run -t "settings" -x` | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 1 | THEME-05 | unit | `cd supervisor && npx vitest run -t "copilot" -x` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 1 | THEME-02 | unit | `cd claudeos-home && npx vitest run -t "no hardcoded" -x` | ❌ W0 | ⬜ pending |
| 14-02-02 | 02 | 1 | WELC-03 | unit | `cd claudeos-home && npx vitest run -t "no hardcoded" -x` | ❌ W0 (shared with THEME-02) | ⬜ pending |
| 14-02-03 | 02 | 1 | THEME-04 | manual-only | Visual verification in running container | N/A | ⬜ pending |
| 14-03-01 | 03 | 2 | WELC-01 | unit | `cd claudeos-home && npx vitest run -t "welcome" -x` | ❌ W0 | ⬜ pending |
| 14-03-02 | 03 | 2 | WELC-02 | unit | `cd claudeos-home && npx vitest run -t "quick actions" -x` | ❌ W0 | ⬜ pending |
| 14-04-01 | 04 | 2 | INFR-01 | unit | `cd supervisor && npx vitest run -t "default-extensions" -x` | ❌ W0 | ⬜ pending |
| 14-04-02 | 04 | 2 | INFR-02 | integration | Docker build test (manual) | N/A | ⬜ pending |
| 14-04-03 | 04 | 2 | INFR-03 | unit | `cd supervisor && npx vitest run -t "extension discovery" -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `claudeos-home/test/webview/theme-compliance.test.ts` — stubs for THEME-02, WELC-03 (assert no hardcoded hex in CSS output)
- [ ] `supervisor/test/services/boot-extensions-dir.test.ts` — stubs for INFR-01, INFR-03 (directory scanning)
- [ ] `supervisor/test/config/settings-validation.test.ts` — stubs for THEME-01, THEME-05 (settings.json content assertions)
- [ ] `claudeos-home/test/webview/welcome-content.test.ts` — stubs for WELC-01, WELC-02 (welcome page content assertions)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Changing VS Code theme updates all custom panels | THEME-04 | Requires VS Code runtime with webview rendering | 1. Open ClaudeOS container 2. Change theme in Settings 3. Verify Home panel colors update 4. Verify Secrets panel colors update |
| Build process sources extensions from `default-extensions/` | INFR-02 | Requires full Docker build pipeline | 1. Run `docker build` 2. Verify extensions installed from `default-extensions/` directory 3. Confirm no external download step |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
