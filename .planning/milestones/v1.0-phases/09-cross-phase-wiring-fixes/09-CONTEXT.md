# Phase 9: Cross-Phase Wiring Fixes - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix two cross-phase integration bugs (INT-PATH-01, INT-ARG-02) that break first-boot extension auto-install and home page session card navigation, and update REQUIREMENTS.md traceability table for Phases 5-8.

</domain>

<decisions>
## Implementation Decisions

### Default-extensions.json path fix (INT-PATH-01)
- Fix in flake.nix: change copy destination from `/app/default-extensions.json` to `/app/config/default-extensions.json`
- Keep existing boot.ts lookup order: `/data/config/default-extensions.json` (user override) → `resolve("config", "default-extensions.json")` (bundled fallback)
- No changes to boot.ts — the existing fallback path becomes correct once flake.nix copies to the right location
- User override preserved: placing a custom `default-extensions.json` on `/data/config/` takes priority over bundled

### Home page session card fix (INT-ARG-02)
- Fix at the sender (home-panel.ts), not the receiver (extractSessionFromArg)
- Cache the sessions array returned by `getRecentSessions` as a private field on HomePanel (`recentSessions: Session[]`)
- On `openSession` message, look up the full Session object from the cache by ID, then pass the full Session to `claudeos.sessions.openTerminal`
- extractSessionFromArg stays strict (requires `{id, status, name}`) — keeps type safety

### Traceability table update
- Add Phase 5-8 (and Phase 9) requirement mappings to REQUIREMENTS.md traceability table
- Show all phases per requirement (comma-separated), matching existing convention (e.g., `Phase 1, 8, 9`)
- Purely mechanical update from ROADMAP.md phase requirement lists

### Claude's Discretion
- Exact flake.nix `mkdir -p` / `cp` syntax for the path fix
- Whether to add a fallback/error message in openSession if session not found in cache
- Traceability table formatting details

</decisions>

<specifics>
## Specific Ideas

- The flake.nix fix is preferred over boot.ts because the boot.ts fallback path is already correct for `config/default-extensions.json` — the Nix build just needs to put the file where boot.ts expects it
- HomePanel already receives full Session objects from the supervisor API in `getRecentSessions` — caching them avoids extra network calls on click

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BootService.installExtensions()`: Existing fallback chain at boot.ts:254-266 — no code change needed, just file placement fix
- `HomePanel._handleMessage()`: Already handles `openSession` at home-panel.ts:109-115 — needs to look up cached session
- `SupervisorClient.listSessions()`: Returns full `Session[]` with id, status, name — already called in `getRecentSessions`

### Established Patterns
- `DefaultExtension` discriminated union: `github-release | local-vsix` (Phase 8)
- `extractSessionFromArg()`: Type guard pattern requiring `{id, status, name}` (Phase 2)
- REQUIREMENTS.md traceability: comma-separated phase list per requirement

### Integration Points
- `flake.nix`: Container build step that copies `config/default-extensions.json` to `/app/`
- `claudeos-home/src/webview/home-panel.ts:109-115`: openSession handler → `claudeos.sessions.openTerminal`
- `claudeos-sessions/src/extension.ts:341-357`: `extractSessionFromArg` type guard
- `REQUIREMENTS.md` traceability table: rows 142-192

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-cross-phase-wiring-fixes*
*Context gathered: 2026-03-15*
