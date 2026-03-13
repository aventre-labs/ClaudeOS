---
phase: 4
slug: self-improvement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.0.0 |
| **Config file** | claudeos-self-improve/vitest.config.ts (Wave 0 creates) |
| **Quick run command** | `cd claudeos-self-improve && npx vitest run` |
| **Full suite command** | `cd claudeos-self-improve && npx vitest run && cd ../supervisor && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd claudeos-self-improve && npx vitest run`
- **After every plan wave:** Run `cd claudeos-self-improve && npx vitest run && cd ../supervisor && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 0 | — | infra | `cd claudeos-self-improve && npx vitest run` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | IMP-02 | unit | `cd claudeos-self-improve && npx vitest run test/commands/install-extension.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | IMP-03 | unit | `cd claudeos-self-improve && npx vitest run test/commands/install-extension.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 1 | IMP-04 | unit | `cd claudeos-self-improve && npx vitest run test/commands/install-extension.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-05 | 01 | 1 | IMP-05 | unit | `cd supervisor && npx vitest run test/routes/extensions.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | IMP-06 | unit | `cd claudeos-self-improve && npx vitest run test/mcp-server/tools.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | IMP-07 | unit | `cd claudeos-self-improve && npx vitest run test/mcp-server/tools.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `claudeos-self-improve/vitest.config.ts` — vitest config with vscode alias
- [ ] `claudeos-self-improve/test/__mocks__/vscode.ts` — VS Code API mock (extend from claudeos-secrets pattern)
- [ ] `claudeos-self-improve/test/commands/install-extension.test.ts` — stubs for IMP-02, IMP-03, IMP-04
- [ ] `claudeos-self-improve/test/mcp-server/tools.test.ts` — stubs for IMP-06, IMP-07
- [ ] `claudeos-self-improve/test/supervisor/client.test.ts` — SupervisorClient extension methods

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Install progress notification appears | IMP-04 | VS Code notification API visual behavior | Run install command, verify progress notification shows with cancel button |
| MCP server registers in Claude Code | IMP-06 | Requires live Claude Code + container | Run `claude mcp list`, verify claudeos-self-improve appears |
| Full self-improvement loop | IMP-07 | End-to-end across Claude Code + VS Code + container | Ask Claude to build extension, verify scaffold → build → install completes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
