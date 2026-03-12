---
phase: 1
slug: supervisor-container-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 1 — Validation Strategy

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

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 0 | SUP-09 | unit | `npx vitest run test/routes/health.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 0 | SUP-02 | unit+integration | `npx vitest run test/routes/sessions.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 0 | SUP-03, SUP-04 | integration | `npx vitest run test/services/tmux.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 0 | SUP-05, SUP-06 | unit+integration | `npx vitest run test/services/session-manager.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | SUP-01 | integration | `npx vitest run test/services/boot.test.ts -t "boots code-server"` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | SUP-07 | unit+integration | `npx vitest run test/routes/extensions.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 1 | SUP-08 | integration | `npx vitest run test/services/boot.test.ts -t "extensions"` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 1 | DEP-01 | smoke | `nix build .#container` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 1 | DEP-02 | smoke | `docker run --rm IMAGE sh -c "node --version && tmux -V && git --version && code-server --version"` | ❌ W0 | ⬜ pending |
| 01-03-03 | 03 | 1 | DEP-03 | smoke | `docker run --rm -v /tmp/test-data:/data IMAGE ls -la /data/` | ❌ W0 | ⬜ pending |
| 01-03-04 | 03 | 1 | DEP-06 | smoke | `docker compose up -d && curl localhost:3100/api/v1/health && docker compose down` | ❌ W0 | ⬜ pending |
| 01-03-05 | 03 | 1 | DEP-07 | smoke | `docker run --rm IMAGE whoami` | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 2 | TPL-01 | unit | Check file existence | ❌ W0 | ⬜ pending |
| 01-04-02 | 04 | 2 | TPL-02 | unit | Check directory existence | ❌ W0 | ⬜ pending |
| 01-04-03 | 04 | 2 | TPL-03 | smoke | `cd template && npm install && npm run compile && npm run package` | ❌ W0 | ⬜ pending |
| 01-04-04 | 04 | 2 | TPL-04 | unit | Check AGENTS.md content | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supervisor/vitest.config.ts` — Vitest configuration
- [ ] `supervisor/test/helpers/test-server.ts` — Fastify test server factory (inject pattern)
- [ ] `supervisor/test/routes/health.test.ts` — stubs for SUP-09
- [ ] `supervisor/test/routes/sessions.test.ts` — stubs for SUP-02
- [ ] `supervisor/test/services/tmux.test.ts` — stubs for SUP-03, SUP-04
- [ ] `supervisor/test/services/session-manager.test.ts` — stubs for SUP-05, SUP-06
- [ ] `supervisor/test/routes/extensions.test.ts` — stubs for SUP-07
- [ ] `supervisor/test/services/boot.test.ts` — stubs for SUP-01, SUP-08
- [ ] Framework install: `cd supervisor && npm install` — if not yet initialized

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First-boot password creation flow | DEP-04 | Requires browser interaction with HTML form | 1. Start container fresh (no /data). 2. Open localhost:8080. 3. Verify password form appears. 4. Set password. 5. Verify "Launch ClaudeOS" button. 6. Click launch. 7. Verify code-server login works. |
| Railway deployment | DEP-05 | Requires Railway account and external infra | 1. Push image to GHCR. 2. Create Railway project. 3. Verify Railway pulls image. 4. Verify health check passes. 5. Verify restart policy. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
