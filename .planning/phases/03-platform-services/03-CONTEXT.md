# Phase 3: Platform Services - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can securely store and manage API keys and credentials with encrypted storage (webview UI wrapping the existing supervisor secrets API), and navigate ClaudeOS through a branded welcome page with shortcuts and recent sessions. Two deliverables: claudeos-secrets extension (separate repo) and claudeos-home extension (built into main repo).

</domain>

<decisions>
## Implementation Decisions

### Secrets webview structure
- List + detail panel layout: left side shows secret names, clicking one opens edit form on right
- Values always masked (bullet dots) by default, click eye icon to reveal temporarily
- Copy button works without revealing the value
- Both a sidebar tree view (simple secret list) AND an editor tab (full list+detail webview)
- Clicking a secret in the sidebar opens the full editor tab with that secret selected

### Secrets add/edit workflow
- '+' button above the list in the left panel switches detail panel to an empty form
- Secret is only created when save button is clicked (not on form open)
- Category and tags fields available (supervisor API already supports these)
- Delete requires confirmation

### API key onboarding
- First-run walkthrough triggers on first extension activation AND shows persistent banner on home page until key is set
- Prompts for two essential secrets: Anthropic API key AND GitHub PAT
- When Anthropic API key is set, it is written to Claude Code's env/config so sessions can use it automatically
- Status bar shows simple configured/not-configured indicator (key icon with checkmark or warning)
- Clicking status bar opens secrets webview filtered to the Anthropic key

### Home page branding & layout
- Branded hero style with ClaudeOS logo/wordmark — distinct product identity, not generic VS Code feel
- Custom accent colors, makes ClaudeOS feel like its own product
- Opens as first tab every time ClaudeOS launches (no "don't show again" option)

### Home page content
- Recent sessions displayed as cards with preview (name, status, last message snippet, time)
- Click a session card to open its terminal
- New session button on home page
- Customizable shortcuts grid — default shortcuts provided, user can add/remove/reorder

### Extension packaging
- **claudeos-home**: Built-in extension in the main ClaudeOS repo, alongside the supervisor
- **claudeos-secrets**: Separate repo at aventre-labs/claudeos-secrets, own CI/CD, VSIX as GitHub release
- claudeos-secrets has optional dependency on claudeos-sessions (runtime check, not extensionDependencies)
- Optional dep enables cross-features like injecting secrets into session environments

### Claude's Discretion
- Sidebar tree view design for secrets list (codicons, grouping by category)
- Webview CSS/HTML implementation (within branded constraint)
- Shortcuts grid default contents and customization persistence mechanism
- Home page session card layout details (how many to show, card sizing)
- How the Anthropic key is written to Claude Code env (env var injection method)
- Notification toast wording for first-run walkthrough
- Status bar position and exact icon choices

</decisions>

<specifics>
## Specific Ideas

- Supervisor already has full secrets CRUD API (Phase 1) — secrets extension is purely a UI wrapper calling localhost:3100/api/v1/secrets
- Phase 2 established the SupervisorClient pattern — secrets extension should follow the same approach for API calls
- Home page should feel like a product landing page, not a VS Code welcome tab
- Session cards on home page give users a quick way to resume work without navigating to the sidebar

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `supervisor/src/routes/secrets.ts`: Full REST API (POST, GET, PUT, DELETE) for secrets
- `supervisor/src/services/secret-store.ts`: AES-256-GCM encryption, atomic writes, category/tags support
- `supervisor/src/schemas/secret.ts`: Zod schemas for create/update/response — can inform webview form validation
- `claudeos-sessions/src/supervisor/client.ts`: SupervisorClient pattern for REST calls — reuse in secrets extension
- `claudeos-sessions/src/supervisor/ws-client.ts`: WebSocket client — may be needed if secrets changes should be reactive
- `extension-template/`: Scaffold with esbuild, vsce, vitest — starting point for claudeos-secrets repo

### Established Patterns
- Extensions call supervisor REST API at localhost:3100/api/v1/*
- Session IDs use `ses_` prefix with 8-char UUID suffix
- vitest for testing, esbuild for builds, vsce for VSIX packaging
- Lazy activation via `onView:` trigger (Phase 2)
- OutputChannel for debug logging, error toasts for user-facing errors

### Integration Points
- Secrets extension calls supervisor API at localhost:3100/api/v1/secrets/*
- Home extension calls supervisor API for session list (localhost:3100/api/v1/sessions)
- Home extension may use claudeos-sessions extension API for session actions (if available)
- Status bar item registered by secrets extension, visible globally
- Both extensions registered in default-extensions.json for auto-install

</code_context>

<deferred>
## Deferred Ideas

- **Usage visualizer extension** — Status bar showing Anthropic API costs (past 24h/7d/30d) for API key users, or usage limit progress bars (session/weekly/sonnet-only) for subscription users. Should be its own extension and phase.

</deferred>

---

*Phase: 03-platform-services*
*Context gathered: 2026-03-12*
