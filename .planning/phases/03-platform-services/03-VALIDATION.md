---
phase: 3
slug: platform-services
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-12
---

# Phase 3 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.0.0 |
| **Config file** | vitest.config.ts in each extension directory |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `cd claudeos-secrets && npx vitest run && cd ../claudeos-home && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run` (in relevant extension directory)
- **After every plan wave:** Run `cd claudeos-secrets && npx vitest run && cd ../claudeos-home && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Task | Wave | Requirements | Test Type | Automated Command | File Exists | Status |
|---------|------|------|------|--------------|-----------|-------------------|-------------|--------|
| 03-01-T1 | 01 | Task 1: Scaffold + config endpoint | 1 | SEC-06 | unit | `cd supervisor && npx vitest run test/routes/config.test.ts && cd ../claudeos-secrets && npx tsc --noEmit` | n/a (scaffold) | pending |
| 03-01-T2 | 01 | Task 2: SupervisorClient | 1 | SEC-01 | unit | `cd claudeos-secrets && npx vitest run test/supervisor/client.test.ts` | W0 | pending |
| 03-01-T3 | 01 | Task 3: Sidebar + public API + extension | 1 | SEC-03 | unit | `cd claudeos-secrets && npx vitest run && npx tsc --noEmit` | W0 | pending |
| 03-02-T1 | 02 | Task 1: Scaffold + HomePanel + ShortcutStore | 1 | HOM-01, HOM-02, HOM-03, HOM-04 | unit | `cd claudeos-home && npx vitest run` | W0 | pending |
| 03-02-T2 | 02 | Task 2: Extension wiring + build | 1 | HOM-01 | integration | `cd claudeos-home && npx vitest run && npx tsc --noEmit && npm run compile` | n/a | pending |
| 03-03-T1 | 03 | Task 1: SecretsPanel webview | 2 | SEC-02 | unit | `cd claudeos-secrets && npx vitest run test/webview/secrets-panel.test.ts` | W0 | pending |
| 03-03-T2 | 03 | Task 2: Status bar + first-run + wiring | 2 | SEC-04, SEC-05 | unit | `cd claudeos-secrets && npx vitest run && npx tsc --noEmit && npm run compile` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `claudeos-secrets/test/__mocks__/vscode.ts` -- extended VS Code mock with webview and status bar mocks
- [ ] `claudeos-secrets/vitest.config.ts` -- vitest config with vscode alias
- [ ] `claudeos-secrets/test/supervisor/client.test.ts` -- SupervisorClient for secrets API
- [ ] `claudeos-secrets/test/sidebar/secrets-tree.test.ts` -- sidebar tree provider
- [ ] `claudeos-secrets/test/api/public-api.test.ts` -- public API contract tests
- [ ] `claudeos-secrets/test/webview/secrets-panel.test.ts` -- webview panel message handling
- [ ] `claudeos-secrets/test/status/api-key-status.test.ts` -- status bar update logic
- [ ] `claudeos-secrets/test/onboarding/first-run.test.ts` -- first-run detection
- [ ] `claudeos-home/test/__mocks__/vscode.ts` -- VS Code mock with webview mocks
- [ ] `claudeos-home/vitest.config.ts` -- vitest config with vscode alias
- [ ] `claudeos-home/test/webview/home-panel.test.ts` -- home panel creation and message handling
- [ ] `claudeos-home/test/shortcuts/shortcut-store.test.ts` -- shortcut persistence

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Webview renders correctly in code-server | SEC-02, HOM-01 | Visual rendering | Open webview, verify layout matches design |
| Codicon font loads in webview | SEC-02 | Font loading in code-server | Check icons render as codicons, not squares |
| Branded hero styling on home page | HOM-01 | Visual design | Verify accent colors, logo, product identity |
| Status bar click opens secrets webview | SEC-04 | UI interaction | Click status bar item, verify webview opens |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
