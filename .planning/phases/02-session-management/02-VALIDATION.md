---
phase: 2
slug: session-management
status: complete
nyquist_compliant: true
wave_0_complete: true
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
| 02-01-01 | 01 | 1 | SES-01 | unit | `npx vitest run test/sidebar/session-tree.test.ts -t "groups"` | ✅ | ✅ green |
| 02-01-02 | 01 | 1 | SES-02 | unit | `npx vitest run test/supervisor/client.test.ts -t "createSession"` | ✅ | ✅ green |
| 02-01-03 | 01 | 1 | SES-03 | unit | `npx vitest run test/sidebar/session-item.test.ts -t "STATUS_ICONS"` | ✅ | ✅ green |
| 02-01-04 | 01 | 1 | SES-04 | manual | Static analysis of package.json contributes | N/A | ✅ verified |
| 02-01-05 | 01 | 1 | SES-05 | unit | `npx vitest run test/sidebar/session-item.test.ts -t "Collapsed collapsibleState for archived"` | ✅ | ✅ green |
| 02-01-06 | 01 | 1 | SES-06 | unit | `npx vitest run test/sidebar/session-item.test.ts -t "zombie"` | ✅ | ✅ green |
| 02-01-07 | 01 | 1 | SES-07 | unit | `npx vitest run test/supervisor/client.test.ts -t "reviveSession"` | ✅ | ✅ green |
| 02-01-08 | 01 | 1 | SES-08 | unit | `npx vitest run test/sidebar/session-tree.test.ts -t "badge"` | ✅ | ✅ green |
| 02-01-09 | 01 | 1 | SES-09 | unit | `npx vitest run test/sidebar/session-item.test.ts -t "unread"` | ✅ | ✅ green |
| 02-02-01 | 02 | 1 | TRM-01 | unit | `npx vitest run test/terminal/terminal-manager.test.ts -t "open"` | ✅ | ✅ green |
| 02-02-02 | 02 | 1 | TRM-02 | unit | `npx vitest run test/terminal/terminal-manager.test.ts -t "duplicate"` | ✅ | ✅ green |
| 02-02-03 | 02 | 1 | TRM-03 | unit | `npx vitest run test/terminal/session-terminal.test.ts -t "handleInput"` | ✅ | ✅ green |
| 02-02-04 | 02 | 1 | TRM-04 | unit | `npx vitest run test/terminal/session-terminal.test.ts -t "updateName"` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `claudeos-sessions/vitest.config.ts` — test configuration (mirror supervisor pattern)
- [x] `claudeos-sessions/test/sidebar/session-tree.test.ts` — TreeDataProvider unit tests (13 tests)
- [x] `claudeos-sessions/test/sidebar/session-item.test.ts` — TreeItem factory tests (30 tests)
- [x] `claudeos-sessions/test/supervisor/client.test.ts` — HTTP client tests (15 tests)
- [x] `claudeos-sessions/test/supervisor/ws-client.test.ts` — WebSocket client tests (12 tests)
- [x] `claudeos-sessions/test/terminal/session-terminal.test.ts` — Pseudoterminal tests (18 tests)
- [x] `claudeos-sessions/test/terminal/terminal-manager.test.ts` — Terminal lifecycle tests (13 tests)
- [x] `claudeos-sessions/test/state/session-store.test.ts` — State management tests (21 tests)
- [x] VS Code API mock: `claudeos-sessions/test/__mocks__/vscode.ts`
- [x] WS mock: `claudeos-sessions/test/__mocks__/ws.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Context menu actions filtered by viewItem | SES-04 | Menu contributions are declarative in package.json — not callable in unit tests | Inspect package.json `contributes.menus` for correct `when` clauses per status |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s (measured: ~258ms)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-14

---

## Validation Audit 2026-03-14

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 13 requirements verified: 12 automated (121 tests across 7 files, all green), 1 manual-only (SES-04 — package.json contributes).
