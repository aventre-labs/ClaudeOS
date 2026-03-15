# Phase 8: Operational Polish & Tech Debt - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Close remaining non-critical integration gaps and tech debt from the v1.0 audit: populate default-extensions.json for first-boot auto-install, add observability to PAT detection degradation, and update placeholder npmDepsHash in flake.nix.

</domain>

<decisions>
## Implementation Decisions

### Default extensions list
- Extend DefaultExtension schema to support `local-vsix` method with `localPath` field (not just `{repo, tag}`)
- VSIX files are built during Nix/Docker container build, not at runtime
- Extension source directories (claudeos-sessions, claudeos-secrets, claudeos-home, claudeos-self-improve) compiled to VSIX and copied to `/app/extensions/` in the container image
- default-extensions.json populated with `{ method: "local-vsix", localPath: "/app/extensions/claudeos-*.vsix" }` entries for all 4 first-party extensions
- BootService.installExtensions() installs from local VSIX paths on first boot — no network needed

### PAT detection behavior
- Accept graceful degradation as intentional behavior — detectGitHubPat() returns undefined when secrets extension is inactive
- Add a debug log message when secrets extension is not active, making the degradation observable
- No behavior change — user can always manually select a PAT during install
- Audit gap INT-05 addressed with observability, not activation fix

### npmDepsHash update
- Run nix build, capture the real hash from error output, replace placeholder sha256-AAAA value in flake.nix
- Purely mechanical update, no design decisions

### Claude's Discretion
- Exact Nix/Docker build steps for compiling extensions to VSIX
- DefaultExtension schema evolution (union type vs method field approach)
- Log message format and output channel for PAT detection debug log

</decisions>

<specifics>
## Specific Ideas

- Extension source should NOT be included in the deployed container — only pre-built VSIX files (avoid bloat)
- The existing `installFromVsix(localPath)` method in ExtensionInstaller handles the actual install
- The existing `local-vsix` install method and schema already exist in the codebase

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ExtensionInstaller.installFromVsix(localPath)`: Already handles VSIX install from local path
- `LocalVsixInstallSchema`: Zod schema for `{ method: "local-vsix", localPath: string }` already exists
- `BootService.installExtensions()`: Reads default-extensions.json and installs — needs schema update for local-vsix support
- `DefaultExtension` interface: Currently `{ repo: string, tag: string }` — needs extension to support method + localPath

### Established Patterns
- Extension install methods use discriminated union: `github-release | build-from-source | local-vsix`
- Each extension dir has `npm run compile` and `npm run package` scripts for building VSIX
- OutputChannel logging pattern established in Phase 2 (claudeos-sessions)

### Integration Points
- `config/default-extensions.json`: Currently `[]`, needs population
- `supervisor/src/services/boot.ts`: DefaultExtension interface and installExtensions() method need schema update
- `flake.nix` line 56: npmDepsHash placeholder needs real hash
- Nix/Docker build pipeline: Needs new step to compile extensions to VSIX
- `claudeos-self-improve/src/commands/install-extension.ts` line 126: Add debug log for inactive secrets extension

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-operational-polish-tech-debt*
*Context gathered: 2026-03-14*
