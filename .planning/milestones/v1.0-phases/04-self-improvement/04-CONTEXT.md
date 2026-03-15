# Phase 4: Self-Improvement - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Claude Code can extend its own capabilities by building, packaging, and installing VS Code extensions at runtime. This phase delivers two things: (1) a command palette-based extension install flow for users, and (2) an MCP server + Claude Code skill that enables self-improvement — Claude Code scaffolding, building, and installing extensions autonomously.

</domain>

<decisions>
## Implementation Decisions

### Extension Manager UI
- No custom sidebar panel — use VS Code's built-in Extensions view for browsing/uninstalling installed extensions
- Install flow via command palette only: "ClaudeOS: Install Extension" command
- Command palette offers a picker for all three install methods: "From GitHub Release" / "From Local Source" / "From VSIX File"
- Install progress shown inline via notifications + detailed log output in a dedicated Output Channel ("ClaudeOS Extensions")
- Toast notification on install completion/failure
- For private repos: auto-detect GitHub PAT secrets from claudeos-secrets and offer in a picker (no manual selection step if PAT already configured)
- Uninstall handled entirely by VS Code's built-in extension uninstall UI
- Reload behavior follows existing supervisor setting (default: force reload, configurable to notification)
- Install state persisted to /data volume via supervisor's install-state.json — no modification to default-extensions.json

### Self-improvement experience
- Self-improvement is NOT a special mode or session type — it's a Claude Code skill loaded by default in all ClaudeOS sessions
- Skill provides context about being inside ClaudeOS and access to MCP tools for extension management
- No special session markers or icons for self-improve sessions — they look like regular sessions
- No extra completion notifications — the existing extension install notification is sufficient
- Claude Code builds new extensions as proper git repos in the session's working directory, leveraging Claude Code's built-in project management
- Extension source persists as a browsable, editable, version-controlled project

### MCP server & tools
- All 4 tools per SPEC: install_extension, uninstall_extension, list_extensions, get_extension_template
- get_extension_template returns the GitHub repo URL for aventre-labs/claudeos-extension-template — Claude forks it to create new extensions
- Template URL only, no extra context (SPEC excerpts, API docs) bundled in the tool response
- MCP server registered globally on extension activation (writes to ~/.claude/mcp_servers.json), deregistered on deactivation
- All Claude Code sessions see the self-improvement tools once the extension is active

### Claude's Discretion
- Command palette input flow UX details (multi-step input boxes vs quick picks)
- Output Channel log format and verbosity
- MCP server implementation details (stdio vs HTTP transport)
- Skill file content and structure (CLAUDE.md or equivalent)
- How build-from-source method handles npm install + compile + package in the session working directory
- Error handling and retry behavior for MCP tool calls

</decisions>

<specifics>
## Specific Ideas

- "Self-improvement should be nothing more than a skill included with Claude Code by default in ClaudeOS" — not a special mode, not a special session type
- "Can the extension manager just reuse VS Code's extension manager?" — led to command palette-only install flow, leveraging VS Code's built-in Installed view for everything else
- Extensions built by Claude should be proper git repos forked from the template, not throwaway scaffolds — they're real projects the user can maintain
- The self-improvement loop: user asks Claude to build a feature -> Claude forks template repo -> Claude implements in session working directory -> Claude calls install_extension MCP tool -> extension installs + reload -> feature available

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `supervisor/src/services/extension-installer.ts`: Full install pipeline with state machine (pending -> downloading -> installing -> installed/failed), three install methods (github-release, build-from-source, local-vsix)
- `supervisor/src/routes/extensions.ts`: POST /api/v1/extensions/install and GET /api/v1/extensions endpoints
- `supervisor/src/schemas/extension.ts`: Zod schemas for install requests and extension records
- `claudeos-sessions/src/supervisor/client.ts`: SupervisorClient pattern for REST calls — reuse for extension API calls
- `extension-template/`: Full scaffold with package.json, esbuild, vsce, vitest, AGENTS.md — this becomes the GitHub template repo

### Established Patterns
- Extensions call supervisor REST API at localhost:3100/api/v1/*
- esbuild for bundling (--platform=node --format=cjs --external:vscode)
- vsce package --no-dependencies for VSIX creation
- Webview panels use singleton pattern with embedded HTML/CSS/JS template literals
- OutputChannel for debug logging, error toasts for user-facing errors
- vitest for testing

### Integration Points
- Self-improve extension calls supervisor API for install/uninstall/list at localhost:3100/api/v1/extensions/*
- MCP server registers globally at ~/.claude/mcp_servers.json on activation
- claudeos-secrets extension API used to auto-detect GitHub PATs for private repo installs
- Supervisor reload setting consulted after install (force reload vs notification)
- Extension template repo at aventre-labs/claudeos-extension-template is the fork source

</code_context>

<deferred>
## Deferred Ideas

- Custom VS Code marketplace service for in-IDE extension search/browse — explicitly out of scope for v1 (PROJECT.md)
- Extension update mechanism (reinstall with new tag) — could be a command palette command in a future phase
- Usage visualizer extension for API costs (deferred from Phase 3)

</deferred>

---

*Phase: 04-self-improvement*
*Context gathered: 2026-03-13*
