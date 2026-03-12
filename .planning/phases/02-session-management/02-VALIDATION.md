---
phase: 2
slug: session-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `claudeos-sessions/vitest.config.ts` (new — follows supervisor pattern) |
| **Quick run command** | `cd claudeos-sessions && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd claudeos-sessions && npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd claudeos-sessions && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd claudeos-sessions && npx vitest run` + `cd supervisor && npx vitest run`
- **Before `/gsd:verify-work`:** Both extension and supervisor test suites green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | SES-01 | unit | `npx vitest run test/sidebar/session-tree.test.ts -t "groups sessions by status"` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | SES-02 | unit | `npx vitest run test/supervisor/client.test.ts -t "createSession"` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | SES-03 | unit | `npx vitest run test/sidebar/session-item.test.ts -t "status icons"` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | SES-04 | manual | Static analysis of package.json contributes | N/A | ⬜ pending |
| 02-01-05 | 01 | 1 | SES-05 | unit | `npx vitest run test/sidebar/session-tree.test.ts -t "archived group"` | ❌ W0 | ⬜ pending |
| 02-01-06 | 01 | 1 | SES-06 | unit | `npx vitest run test/sidebar/session-item.test.ts -t "zombie"` | ❌ W0 | ⬜ pending |
| 02-01-07 | 01 | 1 | SES-07 | unit | `npx vitest run test/supervisor/client.test.ts -t "reviveSession"` | ❌ W0 | ⬜ pending |
| 02-01-08 | 01 | 1 | SES-08 | unit | `npx vitest run test/sidebar/session-tree.test.ts -t "badge"` | ❌ W0 | ⬜ pending |
| 02-01-09 | 01 | 1 | SES-09 | unit | `npx vitest run test/sidebar/session-item.test.ts -t "unread"` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | TRM-01 | unit | `npx vitest run test/terminal/terminal-manager.test.ts -t "open"` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | TRM-02 | unit | `npx vitest run test/terminal/terminal-manager.test.ts -t "multiple"` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 1 | TRM-03 | unit | `npx vitest run test/terminal/session-terminal.test.ts -t "input"` | ❌ W0 | ⬜ pending |
| 02-02-04 | 02 | 1 | TRM-04 | unit | `npx vitest run test/terminal/session-terminal.test.ts -t "name"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `claudeos-sessions/vitest.config.ts` — test configuration (mirror supervisor pattern)
- [ ] `claudeos-sessions/test/sidebar/session-tree.test.ts` — TreeDataProvider unit tests
- [ ] `claudeos-sessions/test/sidebar/session-item.test.ts` — TreeItem factory tests
- [ ] `claudeos-sessions/test/supervisor/client.test.ts` — HTTP client tests (mock fetch)
- [ ] `claudeos-sessions/test/supervisor/ws-client.test.ts` — WebSocket client tests (mock ws)
- [ ] `claudeos-sessions/test/terminal/session-terminal.test.ts` — Pseudoterminal tests
- [ ] `claudeos-sessions/test/terminal/terminal-manager.test.ts` — Terminal lifecycle tests
- [ ] `claudeos-sessions/test/state/session-store.test.ts` — State management tests
- [ ] VS Code API mock: manual mocks for vscode namespace in vitest
- [ ] Supervisor PATCH endpoint test: `supervisor/test/routes/sessions.test.ts` — add rename test case

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Context menu actions filtered by viewItem | SES-04 | Menu contributions are declarative in package.json — not callable in unit tests | Inspect package.json `contributes.menus` for correct `when` clauses per status |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
