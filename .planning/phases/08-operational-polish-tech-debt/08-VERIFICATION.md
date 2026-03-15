---
phase: 08-operational-polish-tech-debt
verified: 2026-03-15T00:01:30Z
status: gaps_found
score: 2/3 success criteria verified
gaps:
  - truth: "flake.nix npmDepsHash contains a real hash, not the placeholder sha256-AAAA value"
    status: failed
    reason: "npmDepsHash on line 103 of flake.nix still holds the placeholder value sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= — Nix was not available in the execution environment so the hash was never computed"
    artifacts:
      - path: "flake.nix"
        issue: "Line 103: npmDepsHash = \"sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\"; — placeholder unchanged"
    missing:
      - "Run `nix build .#default 2>&1 | grep 'got:'` on a machine with Nix installed, extract the sha256-... value, and replace the placeholder on flake.nix line 103"
---

# Phase 8: Operational Polish & Tech Debt — Verification Report

**Phase Goal:** Close remaining non-critical integration gaps and tech debt items — populate default-extensions.json for first-boot auto-install, fix PAT detection silent degradation, and update placeholder npmDepsHash
**Verified:** 2026-03-15T00:01:30Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Success Criteria from ROADMAP.md)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | default-extensions.json contains ClaudeOS extension entries — BootService.installExtensions() installs them on first boot | VERIFIED | 4 local-vsix entries present in config/default-extensions.json; boot.ts has discriminated union dispatch; 5 unit tests all pass |
| 2 | detectGitHubPat() logs a debug message when secrets extension is inactive — PAT detection degradation is observable | VERIFIED | Line 129 of install-extension.ts calls debugChannel.appendLine with the expected message; test "logs debug message when secrets extension is not active" passes |
| 3 | flake.nix npmDepsHash contains a real hash, not the placeholder sha256-AAAA value | FAILED | Line 103 of flake.nix retains sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= — placeholder unchanged |

**Score:** 2/3 success criteria verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `config/default-extensions.json` | 4 local-vsix entries for first-boot auto-install | VERIFIED | 4 entries: claudeos-sessions.vsix, claudeos-secrets.vsix, claudeos-home.vsix, claudeos-self-improve.vsix, all pointing to /app/extensions/ |
| `supervisor/src/services/boot.ts` | DefaultExtension discriminated union and dispatch logic | VERIFIED | Lines 32-34: discriminated union type; lines 280-298: extName computation and method dispatch to installFromVsix/installFromGitHub |
| `supervisor/test/services/boot.test.ts` | Unit tests for installExtensions() dispatch logic (5 tests) | VERIFIED | 5 tests: local-vsix dispatch, github-release dispatch, extName skip logic, github-release skip, empty list — all pass |
| `claudeos-self-improve/src/commands/install-extension.ts` | Debug log for PAT detection degradation | VERIFIED | Line 13: module-level debugChannel; line 129: appendLine call on inactive-secrets branch |
| `claudeos-self-improve/test/commands/install-extension.test.ts` | Unit test for inactive-secrets-extension debug log | VERIFIED | Test at line 236: "logs debug message when secrets extension is not active" — passes |
| `flake.nix` | Nix VSIX build derivation and container image copy step | VERIFIED (partial) | extensionVsix derivation present at line 49; /app/extensions/ copy at lines 181-182; npmDepsHash placeholder not replaced |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| config/default-extensions.json | supervisor/src/services/boot.ts | JSON.parse in installExtensions() | WIRED | boot.ts line 254 reads defaultExtensionsPath; line 259 parses JSON; dispatch uses `ext.method` discriminant |
| supervisor/src/services/boot.ts | supervisor/src/services/extension-installer.ts | installFromVsix(ext.localPath) | WIRED | Line 294: `await this.extensionInstaller.installFromVsix(ext.localPath)` |
| supervisor/test/services/boot.test.ts | supervisor/src/services/boot.ts | unit test imports BootService | WIRED | Line 2: `import { BootService } from "../../src/services/boot.js"` — installExtensions called in all 5 test cases |
| claudeos-self-improve/test/commands/install-extension.test.ts | claudeos-self-improve/src/commands/install-extension.ts | unit test covers inactive-secrets-extension branch | WIRED | Line 245: mocks getExtension returning `{ isActive: false }`; line 258: asserts debugChannel.appendLine called |
| flake.nix | config/default-extensions.json | VSIX files built by Nix match paths in JSON | WIRED | fakeRootCommands copies default-extensions.json to /app/default-extensions.json (line 175) and VSIX files to /app/extensions/ (line 182); paths match |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SUP-07 | 08-01-PLAN.md | Supervisor exposes extension install pipeline (clone GitHub repo, build VSIX, install into code-server) | SATISFIED | installFromVsix dispatch added to installExtensions(); full install pipeline operational |
| SUP-08 | 08-01-PLAN.md | Supervisor runs first-boot auto-installation of extensions from default-extensions.json | SATISFIED | default-extensions.json has 4 local-vsix entries; installExtensions() reads and dispatches them; boot.test.ts confirms end-to-end dispatch |
| DEP-02 | 08-01-PLAN.md | Container includes Node.js, code-server, Claude Code, tmux, git, and supervisor | SATISFIED | extensionVsix derivation added; VSIX files copied to /app/extensions/ in container; fakeRootCommands wired correctly |
| IMP-03 | 08-01-PLAN.md | User can select a GitHub PAT secret for private repo access during install | SATISFIED | detectGitHubPat() now emits observable debug log when secrets extension is inactive; graceful degradation behavior preserved |

No orphaned requirements — all 4 requirement IDs from the plan are accounted for.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| flake.nix | 103 | `npmDepsHash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="` | Blocker | Nix supervisor build will fail with hash mismatch on first `nix build` invocation — container build non-functional |
| flake.nix | 57-58 | TODO comment: "Convert to per-extension buildNpmPackage derivations if npm ci fails in sandbox" | Warning | extensionVsix derivation uses `npm ci || true` — likely to silently skip dep install in Nix sandbox; VSIX files may be empty or malformed |

---

## Human Verification Required

None identified. All behavioral gaps are deterministic and verifiable programmatically.

---

## Gaps Summary

**One gap blocks full goal achievement:**

**Success Criterion 3 (npmDepsHash)** is unmet. The ROADMAP explicitly requires "a real hash, not the placeholder sha256-AAAA value." The SUMMARY acknowledges this was intentional — Nix was not installed in the execution environment. The plan's task 3 included a conditional fallback ("leave a TODO comment if Nix not available"), which was applied, but the ROADMAP success criterion has no such conditional — it requires the real hash.

The extensionVsix derivation itself is also at risk (Warning severity): it uses `npm ci --ignore-scripts 2>/dev/null || true`, which silently ignores npm ci failures. In the Nix sandbox (no network), npm ci will fail and the `|| true` will swallow the error, potentially producing empty or uncomplied VSIX files. This does not block the current verification (the derivation structure is correct) but should be addressed when a machine with Nix is available.

**To close the gap:** On a machine with Nix installed, run `nix build .#default 2>&1 | grep "got:"`, extract the sha256-... value, and replace the placeholder on flake.nix line 103.

---

_Verified: 2026-03-15T00:01:30Z_
_Verifier: Claude (gsd-verifier)_
