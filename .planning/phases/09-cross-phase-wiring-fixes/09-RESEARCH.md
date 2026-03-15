# Phase 9: Cross-Phase Wiring Fixes - Research

**Researched:** 2026-03-15
**Domain:** Nix container build / VS Code extension integration / documentation
**Confidence:** HIGH

## Summary

Phase 9 addresses two cross-phase integration bugs discovered in milestone audit #4 and one documentation gap. Both bugs are straightforward fixes with well-understood root causes, confirmed by direct code inspection.

**INT-PATH-01 (critical):** `flake.nix` copies `config/default-extensions.json` to `/app/default-extensions.json` but `BootService.installExtensions()` falls back to `resolve("config", "default-extensions.json")` which resolves to `/app/config/default-extensions.json` in the container. The fix per CONTEXT.md is to change the copy destination in flake.nix to `./app/config/default-extensions.json`.

**INT-ARG-02 (high):** `home-panel.ts:112` passes `{ id: message.sessionId }` to `claudeos.sessions.openTerminal`, but `extractSessionFromArg` requires `{ id, status, name }`. The fix per CONTEXT.md is to cache sessions from `getRecentSessions` and look up the full Session by ID on click.

**Traceability:** REQUIREMENTS.md traceability table needs Phase 5-8 (and Phase 9) requirement mappings added.

**Primary recommendation:** All three fixes are small, isolated changes. One plan with three tasks is sufficient.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Fix in flake.nix: change copy destination from `/app/default-extensions.json` to `/app/config/default-extensions.json`
- Keep existing boot.ts lookup order unchanged -- no changes to boot.ts
- Fix at the sender (home-panel.ts), not the receiver (extractSessionFromArg)
- Cache the sessions array returned by `getRecentSessions` as a private field on HomePanel (`recentSessions: Session[]`)
- On `openSession` message, look up the full Session object from the cache by ID, then pass the full Session to `claudeos.sessions.openTerminal`
- extractSessionFromArg stays strict (requires `{id, status, name}`)
- Add Phase 5-8 (and Phase 9) requirement mappings to REQUIREMENTS.md traceability table
- Show all phases per requirement (comma-separated), matching existing convention

### Claude's Discretion
- Exact flake.nix `mkdir -p` / `cp` syntax for the path fix
- Whether to add a fallback/error message in openSession if session not found in cache
- Traceability table formatting details

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SUP-07 | Supervisor exposes extension install pipeline | INT-PATH-01 fix ensures default-extensions.json is found at fallback path |
| SUP-08 | Supervisor runs first-boot auto-installation from default-extensions.json | INT-PATH-01 fix: flake.nix copies to correct path `/app/config/` |
| DEP-02 | Container includes all required components | INT-PATH-01 fix ensures container file placement matches boot.ts expectations |
| HOM-03 | User can see recent sessions on the home page | INT-ARG-02 fix: cached sessions enable full Session passthrough on click |
| TRM-01 | User can click a session to open a terminal tab | INT-ARG-02 fix: extractSessionFromArg receives complete `{id, status, name}` |
</phase_requirements>

## Standard Stack

No new libraries or dependencies. All changes use existing project code and patterns.

### Core (Existing)
| Component | Location | Purpose |
|-----------|----------|---------|
| flake.nix | `flake.nix:172` | Container image build -- copies config files to `/app/` |
| boot.ts | `supervisor/src/services/boot.ts:253-266` | First-boot extension install with fallback path chain |
| home-panel.ts | `claudeos-home/src/webview/home-panel.ts:108-115` | openSession message handler |
| extension.ts | `claudeos-sessions/src/extension.ts:341-357` | extractSessionFromArg type guard |
| REQUIREMENTS.md | `.planning/REQUIREMENTS.md:140-198` | Traceability table |

## Architecture Patterns

### Pattern 1: Flake.nix Config File Placement

**What:** The `fakeRootCommands` block in `flake.nix:168-175` copies config files from the Nix store to the container's `/app/` directory. BootService expects config files under `/app/config/`.

**Current (broken):**
```nix
cp ${./config/default-extensions.json} ./app/default-extensions.json
```

**Fix:**
```nix
mkdir -p ./app/config
cp ${./config/default-extensions.json} ./app/config/default-extensions.json
```

**Why this works:** `BootService.installExtensions()` at boot.ts:262 uses `resolve("config", "default-extensions.json")`. In the container where cwd is `/app`, this resolves to `/app/config/default-extensions.json`. The `mkdir -p ./app` already exists on line 169, but `./app/config/` does not exist in the image (only `/data/config/` is created on line 166 for the persistent volume).

### Pattern 2: Session Cache in HomePanel

**What:** HomePanel already fetches full Session objects in `getRecentSessions` (line 119). The fix caches these and looks up by ID on click.

**Implementation pattern:**
```typescript
// Add private field
private recentSessions: Session[] = [];

// In getRecentSessions handler, cache after filtering
this.recentSessions = recent;

// In openSession handler, look up from cache
case "openSession":
  if (message.sessionId) {
    const session = this.recentSessions.find(s => s.id === message.sessionId);
    if (session) {
      await vscode.commands.executeCommand(
        "claudeos.sessions.openTerminal",
        session,  // Full Session object with id, status, name
      );
    }
  }
  break;
```

**Key detail:** The Session type in `claudeos-home/src/types.ts` has `{ id, name, status, createdAt, workdir? }`. The `extractSessionFromArg` guard checks for `{ id, status, name }` -- all present in the cached object.

### Pattern 3: Traceability Table Convention

**Existing pattern** (from REQUIREMENTS.md:142-192):
```markdown
| Requirement | Phase | Status |
|-------------|-------|--------|
| SUP-07 | Phase 1, 8 | Complete |
```

Multi-phase requirements use comma-separated phase numbers. Phase 9 additions need to extend existing rows and add new phase references for requirements that gained coverage in Phases 5-8.

**Phase-to-requirement mapping** (from ROADMAP.md):
- Phase 5: SUP-01, SUP-02, SUP-08 (supervisor wiring fixes)
- Phase 6: IMP-03, HOM-01 (extension bug fixes)
- Phase 7: SES-01, IMP-06 (activation events + tech debt)
- Phase 8: SUP-07, SUP-08, DEP-02, IMP-03 (operational polish)
- Phase 9: SUP-07, SUP-08, DEP-02, HOM-03, TRM-01 (this phase)

### Anti-Patterns to Avoid
- **Modifying boot.ts fallback chain:** CONTEXT.md locks the fix to flake.nix only. Do not change boot.ts.
- **Relaxing extractSessionFromArg:** CONTEXT.md locks the receiver as strict. Do not weaken the type guard.
- **Fetching sessions on every click:** The cache avoids an extra API call. Do not add a new `client.getSession(id)` call.

## Don't Hand-Roll

No hand-rolling concerns for this phase. All fixes use existing patterns and primitives.

## Common Pitfalls

### Pitfall 1: Missing mkdir for /app/config in flake.nix
**What goes wrong:** Copying to `./app/config/default-extensions.json` fails if `./app/config/` does not exist.
**Why it happens:** `./app` is created with `mkdir -p ./app` on line 169, but no `config` subdirectory exists in the image (only `/data/config/` is created on line 166).
**How to avoid:** Add `mkdir -p ./app/config` before the cp command, or use `mkdir -p` with the full path.
**Warning signs:** Nix build fails or silently skips the copy.

### Pitfall 2: Session cache staleness
**What goes wrong:** User loads home page, sessions change status, user clicks a stale cached session.
**Why it happens:** The cache is populated on `getRecentSessions` and not refreshed until next load.
**How to avoid:** This is acceptable -- the cached session's `status` may be stale, but `extractSessionFromArg` only checks field presence, not values. The terminal opens for the correct session ID regardless.
**Warning signs:** None -- this is a non-issue for the type guard.

### Pitfall 3: Traceability table row ordering
**What goes wrong:** Adding phase numbers out of order or duplicating rows.
**How to avoid:** The table is ordered by requirement ID. Only modify the Phase column of existing rows. Do not add new rows (all requirements already have rows).

### Pitfall 4: Test assertions need updating
**What goes wrong:** Existing test `home-panel.test.ts:112-116` asserts `{ id: "ses_abc" }` is passed to openTerminal. After the fix, the full Session object will be passed.
**How to avoid:** Update the test to expect a full Session object with `{ id, status, name }`.

## Code Examples

### Fix 1: flake.nix path correction
```nix
# In fakeRootCommands, replace line 172:
# OLD: cp ${./config/default-extensions.json} ./app/default-extensions.json
# NEW:
mkdir -p ./app/config
cp ${./config/default-extensions.json} ./app/config/default-extensions.json
```

### Fix 2: HomePanel session cache
```typescript
// home-panel.ts - Add field after line 30
private recentSessions: Session[] = [];

// In _handleMessage, getRecentSessions case (after line 127):
this.recentSessions = recent;

// In _handleMessage, openSession case (replace lines 108-115):
case "openSession":
  if (message.sessionId) {
    const session = this.recentSessions.find(s => s.id === message.sessionId);
    if (session) {
      await vscode.commands.executeCommand(
        "claudeos.sessions.openTerminal",
        session,
      );
    }
  }
  break;
```

### Fix 3: Updated test assertion
```typescript
// home-panel.test.ts - Update openSession test (lines 108-117)
it("handles 'openSession' message by executing claudeos.sessions.openTerminal with full Session", async () => {
  // First populate sessions cache
  const sessions = [
    { id: "ses_abc", name: "Test", status: "active", createdAt: "2026-03-12T10:00:00Z" },
  ];
  (client.listSessions as any).mockResolvedValue(sessions);

  const emitter = setupPanelAndGetEmitter();
  emitter.fire({ command: "getRecentSessions" });
  // Wait for sessions to be cached
  await vi.waitFor(() => {
    expect(client.listSessions).toHaveBeenCalled();
  });

  emitter.fire({ command: "openSession", sessionId: "ses_abc" });
  await vi.waitFor(() => {
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      "claudeos.sessions.openTerminal",
      expect.objectContaining({ id: "ses_abc", status: "active", name: "Test" }),
    );
  });
});
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (latest, configured per-package) |
| Config file | Per-package vitest config (supervisor/vitest.config.ts, claudeos-home/vitest.config.ts) |
| Quick run command | `cd supervisor && npx vitest run test/services/boot.test.ts` / `cd claudeos-home && npx vitest run test/webview/home-panel.test.ts` |
| Full suite command | `cd supervisor && npm test` / `cd claudeos-home && npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUP-07 | Extension install pipeline finds default-extensions.json | unit | `cd supervisor && npx vitest run test/services/boot.test.ts -x` | Yes (boot.test.ts covers installExtensions) |
| SUP-08 | First-boot auto-installation works | unit | `cd supervisor && npx vitest run test/services/boot.test.ts -x` | Yes |
| DEP-02 | Container includes all components | manual-only | Nix build verification -- `nix build .#container` | N/A |
| HOM-03 | Session cards on home page work | unit | `cd claudeos-home && npx vitest run test/webview/home-panel.test.ts -x` | Yes (needs assertion update) |
| TRM-01 | Click session opens terminal | unit | `cd claudeos-home && npx vitest run test/webview/home-panel.test.ts -x` | Yes (needs assertion update) |

### Sampling Rate
- **Per task commit:** `cd supervisor && npx vitest run test/services/boot.test.ts -x && cd ../claudeos-home && npx vitest run test/webview/home-panel.test.ts -x`
- **Per wave merge:** `cd supervisor && npm test && cd ../claudeos-home && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements. Only test assertion updates needed (not new files).

## Open Questions

1. **Error handling for session not in cache**
   - What we know: CONTEXT.md gives discretion on whether to add a fallback/error message
   - Recommendation: Add a `vscode.window.showWarningMessage` if session not found in cache, as a simple safety net. This handles edge cases where cache is empty (e.g., panel created before sessions loaded).

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `flake.nix:168-175` -- confirmed copy destination is `./app/default-extensions.json`
- Direct code inspection of `boot.ts:253-266` -- confirmed fallback path resolves to `config/default-extensions.json`
- Direct code inspection of `home-panel.ts:108-115` -- confirmed only `{ id }` is passed
- Direct code inspection of `extension.ts:341-357` -- confirmed type guard requires `{ id, status, name }`
- `v1.0-MILESTONE-AUDIT.md` -- INT-PATH-01 and INT-ARG-02 gap definitions

### Secondary (MEDIUM confidence)
- ROADMAP.md phase requirement lists for traceability table update

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing code
- Architecture: HIGH -- fixes confirmed by direct code inspection of both sides of each bug
- Pitfalls: HIGH -- edge cases are minimal for these targeted fixes

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable -- these are bug fixes in existing code)
