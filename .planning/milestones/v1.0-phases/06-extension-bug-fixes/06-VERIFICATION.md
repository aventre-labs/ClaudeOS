---
phase: 06-extension-bug-fixes
verified: 2026-03-14T00:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 6: Extension Bug Fixes Verification Report

**Phase Goal:** Fix extension installation and home panel bugs blocking IMP-03 and HOM-04 requirements
**Verified:** 2026-03-14
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                              | Status     | Evidence                                                                                      |
|----|------------------------------------------------------------------------------------|------------|-----------------------------------------------------------------------------------------------|
| 1  | PAT secretName field survives Zod validation in github-release install requests    | VERIFIED   | `supervisor/src/schemas/extension.ts` line 27: `secretName: z.string().min(1).optional()`    |
| 2  | installFromGitHub sends Authorization Bearer header when token is provided         | VERIFIED   | `extension-installer.ts` lines 113-115: `if (token) { apiHeaders.Authorization = Bearer ... }` |
| 3  | Private repo VSIX download includes auth header                                    | VERIFIED   | `extension-installer.ts` lines 144-146: `token ? { headers: { Authorization: Bearer ... } } : undefined` |
| 4  | Home webview API key banner shows/hides based on actual ANTHROPIC_API_KEY status   | VERIFIED   | `home-panel.ts` lines 186-209: full `checkApiKeyStatus` handler; webview JS lines 462/468 fire request on load; `anthropicKeyStatus` message handled at line 491 |

**Score:** 4/4 truths verified

---

## Required Artifacts

| Artifact                                             | Expected                                            | Status     | Details                                                                                              |
|------------------------------------------------------|-----------------------------------------------------|------------|------------------------------------------------------------------------------------------------------|
| `supervisor/src/schemas/extension.ts`               | secretName optional field on GithubReleaseInstallSchema | VERIFIED | Line 27: `secretName: z.string().min(1).optional()` present                                        |
| `supervisor/src/services/extension-installer.ts`    | Token parameter on installFromGitHub                | VERIFIED   | Line 99: `async installFromGitHub(repo: string, tag: string, token?: string)`                       |
| `supervisor/src/routes/extensions.ts`               | Secret resolution and token passthrough             | VERIFIED   | Lines 19, 52-54: `resolveSecret?` in options interface; `if (body.secretName && options.resolveSecret)` called before `installFromGitHub` |
| `claudeos-home/src/webview/home-panel.ts`           | checkApiKeyStatus message handler                   | VERIFIED   | Lines 186-209: full `case "checkApiKeyStatus"` block posting `anthropicKeyStatus` to webview        |
| `claudeos-home/src/extension.ts`                    | No dead-end comment stub in checkApiKeyStatus       | VERIFIED   | Dead-end stub removed; file ends with comment noting webview handles it; no empty if-block remains  |

---

## Key Link Verification

| From                                              | To                                         | Via                                      | Status   | Details                                                                                                          |
|---------------------------------------------------|--------------------------------------------|------------------------------------------|----------|------------------------------------------------------------------------------------------------------------------|
| `supervisor/src/routes/extensions.ts`            | `supervisor/src/services/extension-installer.ts` | `installFromGitHub(repo, tag, token)` | WIRED    | Line 55: `await extensionInstaller.installFromGitHub(body.repo!, body.tag!, token)` — token passed through      |
| `supervisor/src/routes/extensions.ts`            | resolveSecret callback                     | `options.resolveSecret(body.secretName)` | WIRED    | Lines 52-53: `if (body.secretName && options.resolveSecret) { token = await options.resolveSecret(body.secretName); }` |
| `claudeos-home/src/webview/home-panel.ts`        | webview JS                                 | `postMessage anthropicKeyStatus`        | WIRED    | Line 193: `command: "anthropicKeyStatus"` posted on success path; line 198/203: posted `false` on missing/error path; webview JS handles it at line 491 |
| `supervisor/src/server.ts`                       | `extensionRoutes`                          | `resolveSecret` via lazy SecretStore    | WIRED    | Lines 115-131: `resolveSecret` callback created using `SecretStore.tryCreate`, passed into `extensionRoutes` options |

---

## Requirements Coverage

| Requirement | Source Plan | Description                                                           | Status    | Evidence                                                                                                                          |
|-------------|-------------|-----------------------------------------------------------------------|-----------|-----------------------------------------------------------------------------------------------------------------------------------|
| IMP-03      | 06-01-PLAN  | User can select a GitHub PAT secret for private repo access during install | SATISFIED | Zod schema accepts `secretName`; route handler resolves it via `resolveSecret` callback; token passed to `installFromGitHub`; auth header set on GitHub API and VSIX download fetches |
| HOM-04      | 06-01-PLAN  | User can access shortcuts grid with frequently used actions            | SATISFIED | `checkApiKeyStatus` handler fully implemented in HomePanel; webview JS fires request on load (both DOMContentLoaded and immediate); `anthropicKeyStatus` message drives banner display; shortcuts grid rendering confirmed present from prior phases |

Both requirements are marked Complete in REQUIREMENTS.md (lines 173, 176).

---

## Anti-Patterns Found

No anti-patterns detected in any modified file:
- No TODO/FIXME/HACK comments in any phase 6 file
- No empty stub implementations
- `extension.ts` dead-end stub confirmed removed; replaced by a clarifying comment at line 56

---

## Human Verification Required

### 1. Banner visibility in live extension

**Test:** Open ClaudeOS in code-server without an Anthropic API key configured. Open the ClaudeOS Home tab.
**Expected:** The warning banner "Set up your Anthropic API key..." is visible.
**Why human:** DOM rendering and webview message round-trip cannot be verified statically.

### 2. Banner hides after key is set

**Test:** Set an Anthropic API key via the secrets editor, then re-open the home panel (or reload it).
**Expected:** The banner is hidden.
**Why human:** Requires live extension activation and round-trip to `claudeos-secrets` exports.

### 3. Private repo install with PAT

**Test:** From the self-improve extension, attempt a github-release install with a `secretName` pointing to a valid PAT. Verify the extension installs (or at minimum, that a 401 is not returned from GitHub).
**Why human:** Requires a real GitHub PAT secret configured in the secrets store and a real private repo accessible by that PAT.

---

## Commits

Both task commits verified in git history:

| Task | Commit  | Type |
|------|---------|------|
| Fix PAT secretName Zod stripping and auth header passthrough (IMP-03) | `4a4c58c` | feat |
| Fix home webview API key banner postMessage (HOM-04) | `82dfacb` | feat |

---

## Summary

Phase 6 goal is fully achieved. Both blocking requirements (IMP-03 and HOM-04) are now implemented with complete wiring:

**IMP-03** — The Zod schema gap is closed (`secretName` field added), the service gap is closed (`token?` parameter added with conditional `Authorization: Bearer` header on both GitHub API and VSIX download fetch calls), and the route-to-service wiring is complete (route resolves secret name via lazy `SecretStore.tryCreate` callback passed from `server.ts`).

**HOM-04** — The dead-end comment stub in `extension.ts` is removed. `HomePanel._handleMessage` has a full `checkApiKeyStatus` case that queries the `claudeos-secrets` extension exports and posts `anthropicKeyStatus` back to the webview. The webview JS fires `checkApiKeyStatus` on load (both in `DOMContentLoaded` and the immediate-fire fallback), and the `anthropicKeyStatus` handler drives the banner's `display` style.

All 4 must-have truths verified. No stubs. No orphaned artifacts. Tests exist for all new behaviors (token auth headers, secretName Zod acceptance, checkApiKeyStatus with/without secrets extension).

---

_Verified: 2026-03-14_
_Verifier: Claude (gsd-verifier)_
