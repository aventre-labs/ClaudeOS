# Phase 8: Operational Polish & Tech Debt - Research

**Researched:** 2026-03-14
**Domain:** Nix build pipeline, VS Code extension install, TypeScript discriminated unions
**Confidence:** HIGH

## Summary

Phase 8 closes the final 3 tech debt items from the v1.0 audit: populating default-extensions.json with local-vsix entries for first-boot auto-install, adding observability to PAT detection degradation, and replacing the placeholder npmDepsHash in flake.nix. All three changes are well-scoped with clear existing patterns to follow.

The codebase already has full `local-vsix` support in the extension installer, Zod schemas, and API routes. The primary work is (1) evolving the `DefaultExtension` interface in `BootService` to support a discriminated union matching the existing `InstallExtensionSchema`, (2) updating `installExtensions()` to dispatch by method, (3) adding VSIX build steps to the Nix `fakeRootCommands`, (4) adding a single debug log line, and (5) computing the real npmDepsHash.

**Primary recommendation:** Treat as a single plan with 3 independent tasks -- each tech debt item is a self-contained change with no cross-dependencies.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Extend DefaultExtension schema to support `local-vsix` method with `localPath` field (not just `{repo, tag}`)
- VSIX files are built during Nix/Docker container build, not at runtime
- Extension source directories (claudeos-sessions, claudeos-secrets, claudeos-home, claudeos-self-improve) compiled to VSIX and copied to `/app/extensions/` in the container image
- default-extensions.json populated with `{ method: "local-vsix", localPath: "/app/extensions/claudeos-*.vsix" }` entries for all 4 first-party extensions
- BootService.installExtensions() installs from local VSIX paths on first boot -- no network needed
- Accept graceful degradation as intentional behavior -- detectGitHubPat() returns undefined when secrets extension is inactive
- Add a debug log message when secrets extension is not active, making the degradation observable
- No behavior change -- user can always manually select a PAT during install
- Audit gap INT-05 addressed with observability, not activation fix
- Run nix build, capture the real hash from error output, replace placeholder sha256-AAAA value in flake.nix

### Claude's Discretion
- Exact Nix/Docker build steps for compiling extensions to VSIX
- DefaultExtension schema evolution (union type vs method field approach)
- Log message format and output channel for PAT detection debug log

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SUP-07 | Supervisor exposes extension install pipeline (clone GitHub repo, build VSIX, install into code-server) | Default-extensions.json population enables first-boot install via existing pipeline |
| SUP-08 | Supervisor runs first-boot auto-installation of extensions from default-extensions.json | BootService.installExtensions() schema update + JSON population makes this functional |
| DEP-02 | Container includes Node.js, code-server, Claude Code, tmux, git, and supervisor | Nix build step adds pre-built VSIX files to container image at /app/extensions/ |
| IMP-03 | User can select a GitHub PAT secret for private repo access during install | Debug log makes PAT detection degradation observable; behavior already correct |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zod | 3.25 | Schema validation, discriminated unions | Already used for InstallExtensionSchema |
| Vitest | latest | Testing | All 5 packages use vitest |
| vsce | latest | VSIX packaging | Already in extension package.json scripts |
| Nix (buildNpmPackage) | nixos-unstable | Container build | Already in flake.nix |

### Supporting
No new libraries needed. All changes use existing project infrastructure.

## Architecture Patterns

### Pattern 1: DefaultExtension Discriminated Union

**What:** Evolve the `DefaultExtension` interface in `boot.ts` to match the existing `InstallExtensionSchema` discriminated union pattern.

**Current code (boot.ts line 32-35):**
```typescript
interface DefaultExtension {
  repo: string;
  tag: string;
}
```

**Recommended evolution:**
```typescript
type DefaultExtension =
  | { method: "github-release"; repo: string; tag: string }
  | { method: "local-vsix"; localPath: string };
```

**Why union type over method field:** Matches the existing `InstallExtensionSchema` pattern in `supervisor/src/schemas/extension.ts` (lines 40-44). The discriminated union on `method` is already established project-wide.

**installExtensions() dispatch update:**
```typescript
for (const ext of extensions) {
  if (ext.method === "local-vsix") {
    this.logger.info(`Installing local extension: ${ext.localPath}`);
    await this.extensionInstaller.installFromVsix(ext.localPath);
  } else {
    // existing github-release path
    this.logger.info(`Installing extension: ${ext.repo}@${ext.tag}`);
    await this.extensionInstaller.installFromGitHub(ext.repo, ext.tag);
  }
}
```

**Confidence:** HIGH -- follows existing codebase patterns exactly.

### Pattern 2: default-extensions.json Format

**What:** Populate config/default-extensions.json with local-vsix entries.

**Format:**
```json
[
  { "method": "local-vsix", "localPath": "/app/extensions/claudeos-sessions.vsix" },
  { "method": "local-vsix", "localPath": "/app/extensions/claudeos-secrets.vsix" },
  { "method": "local-vsix", "localPath": "/app/extensions/claudeos-home.vsix" },
  { "method": "local-vsix", "localPath": "/app/extensions/claudeos-self-improve.vsix" }
]
```

**Extension names** (from package.json `name` fields): claudeos-sessions, claudeos-secrets, claudeos-home, claudeos-self-improve.

**VSIX naming:** `vsce package --no-dependencies` produces `{name}-{version}.vsix`. Since versions may change, use a glob or fixed naming convention. Recommendation: Use the exact filenames produced by `vsce package` in the Nix build step and hardcode the paths (the Nix derivation controls the version).

**Confidence:** HIGH -- straightforward JSON file.

### Pattern 3: Nix VSIX Build Step

**What:** Add extension VSIX compilation to the Nix `fakeRootCommands` block in `flake.nix`.

**Current fakeRootCommands** (flake.nix line 109-136) copies config files to `/app`. Need to add a step that:
1. Runs `npm ci && npm run compile && npm run package` in each extension directory
2. Copies the resulting `.vsix` files to `/app/extensions/`

**Key insight:** `fakeRootCommands` runs in a fakeroot environment without network. Extension source must be available via Nix `src` paths. Each extension needs `nodejs_22` and `vsce` available.

**Recommended approach:** Create separate Nix derivations for each extension VSIX (or one derivation that builds all 4), then reference the outputs in `fakeRootCommands`:

```nix
# In the let block, before container definition:
extensionVsix = pkgs.stdenv.mkDerivation {
  pname = "claudeos-extensions-vsix";
  version = "0.1.0";
  src = ./.;  # project root
  nativeBuildInputs = [ pkgs.nodejs_22 ];
  buildPhase = ''
    for ext in claudeos-sessions claudeos-secrets claudeos-home claudeos-self-improve; do
      cd $src/$ext
      HOME=$TMPDIR npm ci --ignore-scripts
      npx vsce package --no-dependencies -o $ext.vsix
    done
  '';
  installPhase = ''
    mkdir -p $out
    for ext in claudeos-sessions claudeos-secrets claudeos-home claudeos-self-improve; do
      cp $src/$ext/$ext.vsix $out/
    done
  '';
};
```

Then in `fakeRootCommands`:
```nix
mkdir -p ./app/extensions
cp ${extensionVsix}/*.vsix ./app/extensions/
```

And add `extensionVsix` to `contents` is NOT needed -- only copying the outputs via fakeRootCommands is sufficient.

**Alternative (simpler):** Since each extension already has `npm run compile` and `npm run package` scripts, the Nix derivation just needs to run those in order. However, `vsce` must be available -- it is typically installed as a devDependency.

**Confidence:** MEDIUM -- Nix derivation specifics may need iteration (npm ci in sandbox, vsce availability). The pattern is standard but exact flags may need tuning.

### Pattern 4: PAT Detection Debug Log

**What:** Add a debug log to `detectGitHubPat()` when secrets extension is inactive.

**Current code** (install-extension.ts line 126):
```typescript
if (!secretsExt || !secretsExt.isActive) return undefined;
```

**Updated code:**
```typescript
if (!secretsExt || !secretsExt.isActive) {
  outputChannel.appendLine("[detectGitHubPat] Secrets extension not active — skipping PAT detection");
  return undefined;
}
```

**OutputChannel pattern:** Established in Phase 2 (claudeos-sessions). The claudeos-self-improve extension should use its own OutputChannel. Check if one already exists.

**Confidence:** HIGH -- single line addition following established pattern.

### Pattern 5: npmDepsHash Update

**What:** Replace the placeholder `sha256-AAAA...` hash in flake.nix line 56.

**Process:**
1. Run `nix build .#default` -- it will fail with hash mismatch
2. Error output contains `got: sha256-XXXX...` with the real hash
3. Replace the placeholder in flake.nix

**Note:** This must be done AFTER any changes to `supervisor/package.json` or `supervisor/package-lock.json`. If the Nix build step for extensions changes the supervisor derivation inputs, the hash changes too. Order matters: make all supervisor changes first, then compute hash.

**Confidence:** HIGH -- standard Nix workflow, documented in flake.nix comment on line 53-55.

### Anti-Patterns to Avoid
- **Wildcard VSIX paths in default-extensions.json:** Don't use glob patterns like `/app/extensions/claudeos-*.vsix`. The JSON is read by Node.js `JSON.parse`, not a shell -- there is no glob expansion. Use exact file paths.
- **Building VSIX at runtime:** The user decided VSIX files are built during container build, not at runtime. Do not add npm/vsce commands to entrypoint.sh.
- **Changing PAT detection behavior:** The user explicitly decided to keep graceful degradation. Do not call `secretsExt.activate()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VSIX install from local path | Custom code-server CLI wrapper | `ExtensionInstaller.installFromVsix(path)` | Already exists and tested (line 255-279) |
| Extension schema validation | Manual type checking | `InstallExtensionSchema` Zod discriminated union | Already exists in schemas/extension.ts |
| VSIX packaging | Custom archive builder | `vsce package --no-dependencies` | Already in every extension's package.json scripts |

## Common Pitfalls

### Pitfall 1: Nix Sandbox Has No Network
**What goes wrong:** `npm ci` fails because Nix builds run in a sandbox without network access.
**Why it happens:** Nix reproducibility requires hermetic builds.
**How to avoid:** Use `pkgs.buildNpmPackage` for extensions (like supervisor), which pre-fetches npm deps via `npmDepsHash`. Or use `fetchNpmDeps` + `npmConfigHook` for multi-package builds.
**Warning signs:** Build error "could not resolve host" or "ENETUNREACH" in Nix build log.

### Pitfall 2: VSIX Filename Includes Version
**What goes wrong:** `vsce package` produces `claudeos-sessions-0.1.0.vsix`, not `claudeos-sessions.vsix`. Hardcoded paths without version break.
**Why it happens:** vsce uses `{name}-{version}.vsix` by default.
**How to avoid:** Use `-o <name>.vsix` flag to control output filename, or compute filenames dynamically in the Nix derivation.
**Warning signs:** "VSIX file not found" errors during container boot.

### Pitfall 3: installExtensions Skip Logic Uses repo Field
**What goes wrong:** The existing skip logic (boot.ts lines 282-283) does `allState.find(e => e.name === ext.repo)` -- this assumes all extensions have a `repo` field. Local-vsix entries don't have `repo`.
**Why it happens:** Code was written when only github-release entries existed.
**How to avoid:** Update the skip logic to work with both methods. For local-vsix, use the VSIX filename (without .vsix suffix) as the lookup key, matching what `installFromVsix()` stores as `name` (basename without .vsix, line 257).
**Warning signs:** Extensions reinstalled on every boot despite being already installed.

### Pitfall 4: npmDepsHash Computed Too Early
**What goes wrong:** Hash is computed before all supervisor changes are complete, then changes to package.json invalidate it.
**Why it happens:** The hash is a content hash of the npm dependency tree.
**How to avoid:** Always compute npmDepsHash as the LAST step, after all other changes are finalized.
**Warning signs:** Nix build fails with hash mismatch after seemingly unrelated changes.

### Pitfall 5: OutputChannel Not Exported in Self-Improve Extension
**What goes wrong:** `detectGitHubPat()` is a module-level function in install-extension.ts, not a method on a class. It may not have access to an OutputChannel.
**Why it happens:** The function was written standalone, not as part of a service with injected dependencies.
**How to avoid:** Either (a) create a module-level OutputChannel in install-extension.ts, (b) import one from the extension's activate() via a shared module, or (c) use `console.log` which appears in the extension host log.
**Warning signs:** Compile error about undefined outputChannel.

## Code Examples

### BootService installExtensions with Discriminated Union
```typescript
// Source: existing patterns in supervisor/src/services/boot.ts + supervisor/src/schemas/extension.ts
type DefaultExtension =
  | { method: "github-release"; repo: string; tag: string }
  | { method: "local-vsix"; localPath: string };

async installExtensions(): Promise<void> {
  // ... file reading logic unchanged ...

  for (const ext of extensions) {
    const extName = ext.method === "local-vsix"
      ? ext.localPath.split("/").pop()?.replace(".vsix", "") ?? ext.localPath
      : ext.repo;

    // Skip already-installed
    const allState = this.extensionInstaller.getInstallState();
    const existing = allState.find((e) => e.name === extName);
    if (existing?.state === "installed" && !pendingNames.has(extName)) {
      this.logger.info(`Extension ${extName} already installed, skipping`);
      continue;
    }

    if (ext.method === "local-vsix") {
      this.logger.info(`Installing local extension: ${ext.localPath}`);
      await this.extensionInstaller.installFromVsix(ext.localPath);
    } else {
      this.logger.info(`Installing extension: ${ext.repo}@${ext.tag}`);
      await this.extensionInstaller.installFromGitHub(ext.repo, ext.tag);
    }

    // fail-fast check
    const state = this.extensionInstaller.getInstallState();
    const record = state.find((e) => e.name === extName);
    if (record?.state === "failed") {
      throw new Error(`Extension install failed for ${extName}: ${record.error}`);
    }
  }

  this.logger.info("All default extensions installed");
  this.setBootState("ready");
}
```

### PAT Detection Debug Log
```typescript
// Source: claudeos-self-improve/src/commands/install-extension.ts line 123-127
// Existing OutputChannel pattern from Phase 2 (claudeos-sessions)
const outputChannel = vscode.window.createOutputChannel("ClaudeOS Self-Improve");

async function detectGitHubPat(): Promise<string | undefined> {
  try {
    const secretsExt = vscode.extensions.getExtension<SecretsPublicApi>("claudeos.claudeos-secrets");
    if (!secretsExt || !secretsExt.isActive) {
      outputChannel.appendLine("[detectGitHubPat] Secrets extension not active — skipping PAT detection");
      return undefined;
    }
    // ... rest unchanged ...
  }
}
```

### Nix Extension VSIX Derivation
```nix
# Source: Nix buildNpmPackage pattern (same as supervisor derivation in flake.nix)
extensionVsix = pkgs.stdenv.mkDerivation {
  pname = "claudeos-extensions";
  version = "0.1.0";
  src = ./.;
  nativeBuildInputs = [ pkgs.nodejs_22 ];
  buildPhase = ''
    for dir in claudeos-sessions claudeos-secrets claudeos-home claudeos-self-improve; do
      pushd $dir
      npm ci --ignore-scripts
      npx esbuild src/extension.ts --bundle --platform=node --format=cjs --outfile=out/extension.js --external:vscode
      npx vsce package --no-dependencies -o $dir.vsix
      popd
    done
  '';
  installPhase = ''
    mkdir -p $out
    for dir in claudeos-sessions claudeos-secrets claudeos-home claudeos-self-improve; do
      cp $dir/$dir.vsix $out/
    done
  '';
};
```

## State of the Art

No technology changes relevant to this phase. All patterns are stable and established in the codebase.

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DefaultExtension: `{repo, tag}` only | Discriminated union with method field | Phase 8 | Enables local-vsix in default-extensions.json |

## Open Questions

1. **Nix sandbox npm ci for extensions**
   - What we know: Nix sandbox has no network. The supervisor uses `buildNpmPackage` with `npmDepsHash` to handle this.
   - What's unclear: Whether to use `buildNpmPackage` per extension or a single `mkDerivation` with `fetchNpmDeps`. The extensions also need `vsce` from npm.
   - Recommendation: Use `buildNpmPackage` pattern per extension for consistency, OR use a simpler approach where `vsce` is added to Nix `nativeBuildInputs` and deps are fetched via fixed-output derivation. The planner should note this may need iteration during implementation.

2. **Self-improve OutputChannel lifecycle**
   - What we know: The extension registers commands in `activate()`. `detectGitHubPat()` is a standalone function.
   - What's unclear: Whether an OutputChannel already exists in the self-improve extension.
   - Recommendation: Check during implementation. If none exists, create one at module scope or pass from `activate()`. Simple pattern from Phase 2.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (latest) |
| Config file | `supervisor/vitest.config.ts`, `claudeos-self-improve/vitest.config.ts` |
| Quick run command | `cd supervisor && npx vitest run test/services/extension-installer.test.ts` |
| Full suite command | `cd supervisor && npx vitest run && cd ../claudeos-self-improve && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUP-07 | Extension install pipeline supports local-vsix via default-extensions.json | unit | `cd supervisor && npx vitest run test/services/extension-installer.test.ts -x` | Yes |
| SUP-08 | installExtensions() handles local-vsix entries from default-extensions.json | unit | `cd supervisor && npx vitest run test/boot-wiring.test.ts -x` | Yes (needs update) |
| DEP-02 | Container includes pre-built VSIX files | manual-only | `nix build .#container` | N/A (Nix build) |
| IMP-03 | detectGitHubPat debug log when secrets inactive | unit | `cd claudeos-self-improve && npx vitest run test/commands/install-extension.test.ts -x` | Yes (needs update) |

### Sampling Rate
- **Per task commit:** `cd supervisor && npx vitest run -x`
- **Per wave merge:** `cd supervisor && npx vitest run && cd ../claudeos-self-improve && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `supervisor/test/services/boot.test.ts` -- unit tests for BootService.installExtensions() with local-vsix entries (boot-wiring.test.ts mocks BootService entirely, does not test internal logic)
- [ ] Update `claudeos-self-improve/test/commands/install-extension.test.ts` -- add test case for debug log when secrets extension inactive

*(Extension installer installFromVsix is already tested in extension-installer.test.ts)*

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `supervisor/src/services/boot.ts` -- current DefaultExtension interface and installExtensions()
- Codebase analysis: `supervisor/src/schemas/extension.ts` -- existing discriminated union schema
- Codebase analysis: `supervisor/src/services/extension-installer.ts` -- installFromVsix() implementation
- Codebase analysis: `claudeos-self-improve/src/commands/install-extension.ts` -- detectGitHubPat() current behavior
- Codebase analysis: `flake.nix` -- current Nix build configuration and placeholder hash
- Codebase analysis: `.planning/v1.0-MILESTONE-AUDIT.md` -- INT-04, INT-05 gap descriptions

### Secondary (MEDIUM confidence)
- Nix `buildNpmPackage` pattern -- extrapolated from existing supervisor derivation
- `vsce package` output naming -- standard behavior, not verified against current vsce version

### Tertiary (LOW confidence)
- Nix multi-package extension build derivation -- exact approach may need iteration

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new deps
- Architecture: HIGH -- follows existing discriminated union patterns exactly
- Pitfalls: HIGH -- identified from direct codebase analysis
- Nix build: MEDIUM -- pattern is standard but multi-extension derivation untested

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable patterns, no external dependencies changing)
