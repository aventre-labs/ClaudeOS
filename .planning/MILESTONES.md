# Milestones

## v1.0 ClaudeOS Initial Release (Shipped: 2026-03-15)

**Phases:** 9 | **Plans:** 21 | **Requirements:** 51/51
**Timeline:** 4 days (2026-03-11 → 2026-03-15) | **Commits:** 150 | **LOC:** 14,596 TypeScript
**Git range:** initial commit → `0859ddc`

**Key accomplishments:**
1. Bootable Nix container with Fastify supervisor API managing code-server, tmux sessions, secrets, and extension installation
2. Session management sidebar with status-grouped tree view, context menus, notification badges, and terminal tabs
3. AES-256-GCM encrypted secret storage with cross-extension public API and tmux environment injection
4. Branded home page with recent sessions, new-session button, and shortcuts grid
5. Self-improvement loop: Claude Code scaffolds, builds, and installs its own VS Code extensions via MCP tools
6. 5 iterative audit/fix cycles closed all P0/P1 integration bugs before shipping (51/51 cross-phase wiring confirmed)

**Known Gaps (tech debt carried forward):**
- extensionVsix `npm ci` may fail in Nix sandbox (no network)
- `detectGitHubPat()` skips `activate()` on secrets extension (private repo installs)
- `SecretsPublicApi` type duplicated across extensions (by design, must stay in sync)
- ROADMAP.md plan/phase checkboxes inconsistent (cosmetic)

**Archives:** `milestones/v1.0-ROADMAP.md`, `milestones/v1.0-REQUIREMENTS.md`, `milestones/v1.0-MILESTONE-AUDIT.md`

---

