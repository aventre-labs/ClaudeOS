---
phase: 4
slug: self-improvement
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-13
audited: 2026-03-14
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^3.2.4 |
| **Config file** | claudeos-self-improve/vitest.config.ts |
| **Quick run command** | `cd claudeos-self-improve && npx vitest run` |
| **Full suite command** | `cd claudeos-self-improve && npx vitest run && cd ../supervisor && npx vitest run` |
| **Actual runtime** | ~0.8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd claudeos-self-improve && npx vitest run`
- **After every plan wave:** Run `cd claudeos-self-improve && npx vitest run && cd ../supervisor && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** <1 second

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 0 | — | infra | `cd claudeos-self-improve && npx vitest run` | ✅ | ✅ green |
| 04-01-02 | 01 | 1 | IMP-02 | unit | `cd claudeos-self-improve && npx vitest run test/commands/install-extension.test.ts` | ✅ | ✅ green |
| 04-01-03 | 01 | 1 | IMP-03 | unit | `cd claudeos-self-improve && npx vitest run test/commands/install-extension.test.ts` | ✅ | ✅ green |
| 04-01-04 | 01 | 1 | IMP-04 | unit | `cd claudeos-self-improve && npx vitest run test/commands/install-extension.test.ts` | ✅ | ✅ green |
| 04-01-05 | 01 | 1 | IMP-05 | unit | `cd supervisor && npx vitest run test/routes/extensions.test.ts` | ✅ | ✅ green |
| 04-02-01 | 02 | 2 | IMP-06 | unit | `cd claudeos-self-improve && npx vitest run test/mcp-server/tools.test.ts` | ✅ | ✅ green |
| 04-02-02 | 02 | 2 | IMP-07 | unit | `cd claudeos-self-improve && npx vitest run test/mcp-server/tools.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `claudeos-self-improve/vitest.config.ts` — vitest config with vscode alias
- [x] `claudeos-self-improve/test/__mocks__/vscode.ts` — VS Code API mock (extend from claudeos-secrets pattern)
- [x] `claudeos-self-improve/test/commands/install-extension.test.ts` — 21 tests for IMP-02, IMP-03, IMP-04
- [x] `claudeos-self-improve/test/mcp-server/tools.test.ts` — 12 tests for IMP-06, IMP-07
- [x] `claudeos-self-improve/test/supervisor/client.test.ts` — 6 tests for SupervisorClient extension methods

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Install progress notification appears | IMP-04 | VS Code notification API visual behavior | Run install command, verify progress notification shows with cancel button |
| MCP server registers in Claude Code | IMP-06 | Requires live Claude Code + container | Run `claude mcp list`, verify claudeos-self-improve appears |
| Full self-improvement loop | IMP-07 | End-to-end across Claude Code + VS Code + container | Ask Claude to build extension, verify scaffold → build → install completes |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 1s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete

---

## Validation Audit 2026-03-14

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

### Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| claudeos-self-improve (3 files) | 39 passed | ✅ green |
| supervisor extensions (2 files) | 20 passed | ✅ green |
| **Total** | **59 passed** | ✅ **all green** |
