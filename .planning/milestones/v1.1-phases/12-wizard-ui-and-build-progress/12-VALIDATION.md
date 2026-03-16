---
phase: 12
slug: wizard-ui-and-build-progress
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x (existing for supervisor backend; wizard React app needs own config with jsdom) |
| **Config file** | `supervisor/vitest.config.ts` (backend); `supervisor/wizard/vitest.config.ts` (frontend — Wave 0) |
| **Quick run command** | `cd supervisor && npx vitest run` |
| **Full suite command** | `cd supervisor && npx vitest run && cd wizard && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd supervisor && npx vitest run`
- **After every plan wave:** Run `cd supervisor && npx vitest run && cd wizard && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | SETUP-01 | unit | `cd supervisor/wizard && npx vitest run src/components/BuildProgress.test.tsx` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | SETUP-02 | unit | `cd supervisor/wizard && npx vitest run src/components/Stepper.test.tsx` | ❌ W0 | ⬜ pending |
| 12-02-01 | 02 | 2 | AUTH-04 | unit | `cd supervisor/wizard && npx vitest run src/components/RailwayStep.test.tsx` | ❌ W0 | ⬜ pending |
| 12-02-02 | 02 | 2 | AUTH-05 | unit | `cd supervisor/wizard && npx vitest run src/components/AnthropicStep.test.tsx` | ❌ W0 | ⬜ pending |
| 12-xx-xx | xx | x | Integration | integration | `cd supervisor && npx vitest run test/services/boot.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supervisor/wizard/` — Vite + React + TypeScript project scaffold
- [ ] `supervisor/wizard/vitest.config.ts` — test config with jsdom environment
- [ ] `supervisor/wizard/src/components/*.test.tsx` — component unit test stubs
- [ ] Backend: SSE events for build progress (extend WizardSSEEvents type)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual stepper appearance matches ClaudeOS theme | SETUP-02 | Visual styling | Open wizard in browser, verify dark theme colors match code-server |
| SSE real-time updates render smoothly | SETUP-01 | Timing/animation | Start fresh boot, watch progress footer update in real-time |
| Railway pairing code copy button works | AUTH-04 | Browser clipboard API | Click copy button, paste to verify code copied |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
