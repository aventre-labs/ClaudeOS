---
phase: 1
slug: supervisor-container-foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-12
---

# Phase 1 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | supervisor/vitest.config.ts |
| **Quick run command** | `cd supervisor && npx vitest run --reporter=dot` |
| **Full suite command** | `cd supervisor && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd supervisor && npx vitest run --reporter=dot`
- **After every plan wave:** Run `cd supervisor && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

Task IDs use format `{plan}-T{task}` matching actual plan task numbering.

### Plan 01 (Wave 1): Project Scaffold, Types, Schemas, Server

| Task ID | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|-------------|-----------|-------------------|--------|
| 01-T1 | 1 | (scaffold) | smoke | `cd supervisor && npm install && npx tsc --noEmit` | pending |
| 01-T2 | 1 | SUP-09 | unit | `cd supervisor && npx vitest run test/routes/health.test.ts` | pending |

Note: Plan 01 Task 2 is TDD -- test file `test/routes/health.test.ts` is created as part of the task itself (RED phase writes tests first, GREEN phase implements).

### Plan 02 (Wave 2): Session Management

| Task ID | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|-------------|-----------|-------------------|--------|
| 02-T1 | 2 | SUP-03, SUP-04, SUP-05, SUP-06 | unit | `cd supervisor && npx vitest run test/services/tmux.test.ts test/services/session-manager.test.ts` | pending |
| 02-T2 | 2 | SUP-02 | unit+integration | `cd supervisor && npx vitest run test/routes/sessions.test.ts` | pending |

Note: Plan 02 tasks are TDD -- test files are created within each task's RED phase.

### Plan 03 (Wave 2): Platform Services

| Task ID | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|-------------|-----------|-------------------|--------|
| 03-T1 | 2 | SUP-07, SUP-08 | unit | `cd supervisor && npx vitest run test/services/secret-store.test.ts test/services/extension-installer.test.ts` | pending |
| 03-T2 | 2 | SUP-01, DEP-04 | smoke+tsc | `test -f first-boot/setup.html && test -f supervisor/src/services/boot.ts && cd supervisor && npx tsc --noEmit` | pending |
| 03-T3 | 2 | SUP-07, SUP-08 | unit+integration | `cd supervisor && npx vitest run test/routes/secrets.test.ts test/routes/extensions.test.ts` | pending |

Note: Plan 03 tasks are TDD -- test files are created within each task's RED phase. Task 2 (boot service) verified via TypeScript compilation and file existence; full integration tested manually via first-boot flow.

### Plan 04 (Wave 3): Container & Deployment

| Task ID | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|-------------|-----------|-------------------|--------|
| 04-T1 | 3 | DEP-01, DEP-02, DEP-07 | smoke | `cd /Users/bennett/Desktop/Projects/ClaudeOS && nix flake check` | pending |
| 04-T2 | 3 | DEP-03, DEP-06 | smoke | `cd /Users/bennett/Desktop/Projects/ClaudeOS && docker compose config --quiet` | pending |
| 04-T3 | 3 | DEP-05 | checkpoint | Human verifies container build pipeline and deployment configs | pending |

### Plan 05 (Wave 1): Extension Template

| Task ID | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|-------------|-----------|-------------------|--------|
| 05-T1 | 1 | TPL-01, TPL-02, TPL-03 | smoke | `cd extension-template && npm install && npm run compile && npm run package` | pending |
| 05-T2 | 1 | TPL-04 | unit | `test -f extension-template/AGENTS.md && wc -l extension-template/AGENTS.md` | pending |

*Status: pending / green / red / flaky*

---

## Requirement Coverage Cross-Reference

Every roadmap requirement must map to at least one plan task.

| Requirement | Plan(s) | Task(s) | Verification |
|-------------|---------|---------|--------------|
| SUP-01 | 03 | 03-T2 | Boot service launches code-server with branding |
| SUP-02 | 02 | 02-T2 | Session REST routes |
| SUP-03 | 02 | 02-T1 | TmuxService CLI wrapper |
| SUP-04 | 02 | 02-T1 | TmuxService send-keys, capture-pane |
| SUP-05 | 02 | 02-T1 | SessionManager archive/revive |
| SUP-06 | 02 | 02-T1 | SessionManager event-driven status |
| SUP-07 | 03 | 03-T1, 03-T3 | SecretStore + secrets routes |
| SUP-08 | 03 | 03-T1, 03-T3 | ExtensionInstaller + extensions routes |
| SUP-09 | 01 | 01-T2 | Health endpoint |
| DEP-01 | 04 | 04-T1 | Nix container image build |
| DEP-02 | 04 | 04-T1 | Container runtime deps |
| DEP-03 | 04 | 04-T2 | docker-compose.yml |
| DEP-04 | 03 | 03-T2 | Boot service passes password to code-server |
| DEP-05 | 04 | 04-T3 | Railway deployment (checkpoint) |
| DEP-06 | 04 | 04-T2 | docker-compose + railway.toml |
| DEP-07 | 04 | 04-T1 | Non-root execution via entrypoint |
| TPL-01 | 05 | 05-T1 | Extension template package.json |
| TPL-02 | 05 | 05-T1 | webview/ + mcp-server/ directories |
| TPL-03 | 05 | 05-T1 | Build scripts (compile, package) |
| TPL-04 | 05 | 05-T2 | AGENTS.md with API contract |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First-boot password creation flow | DEP-04 | Requires browser interaction with HTML form | 1. Start container fresh (no /data). 2. Open localhost:8080. 3. Verify password form appears. 4. Set password. 5. Verify "Launch ClaudeOS" button. 6. Click launch. 7. Verify code-server login works with same password. |
| Railway deployment | DEP-05 | Requires Railway account and external infra | 1. Push image to GHCR. 2. Create Railway project. 3. Verify Railway pulls image. 4. Verify health check passes. 5. Verify restart policy. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] TDD tasks create their own test files in RED phase (no Wave 0 stubs needed)
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] Task IDs match actual plan task numbering
- [x] Every roadmap requirement covered by at least one task
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
