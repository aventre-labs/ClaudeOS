# Phase 4: Self-Improvement - Research

**Researched:** 2026-03-13
**Domain:** VS Code extension development, MCP server protocol, CLI-based MCP registration, command palette UX
**Confidence:** HIGH

## Summary

Phase 4 delivers the capstone of ClaudeOS: the ability for the system to extend itself. This decomposes into three concrete deliverables: (1) a `claudeos-self-improve` VS Code extension with command palette install/uninstall flows, (2) a bundled MCP server that exposes extension management tools to Claude Code sessions via stdio transport, and (3) a Claude Code skill file that gives all sessions awareness of the self-improvement capability.

The existing codebase provides substantial infrastructure. The supervisor already has a full extension install pipeline (`ExtensionInstaller` with state machine, three install methods, and REST routes). The extension template is complete with esbuild, vsce, and vitest configured. Previous extensions establish clear patterns: `SupervisorClient` for REST calls, `OutputChannel` for logging, command palette for user interaction, and `vscode.window.withProgress` for async operations. The MCP server is the only genuinely new technology component -- everything else follows established project patterns.

**Primary recommendation:** Build a single `claudeos-self-improve` extension that registers commands for install/uninstall, bundles an MCP server as a child process (stdio transport), and writes a Claude Code skill file. The supervisor uninstall endpoint (currently stubbed) needs to be implemented first.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- No custom sidebar panel -- use VS Code's built-in Extensions view for browsing/uninstalling installed extensions
- Install flow via command palette only: "ClaudeOS: Install Extension" command
- Command palette offers a picker for all three install methods: "From GitHub Release" / "From Local Source" / "From VSIX File"
- Install progress shown inline via notifications + detailed log output in a dedicated Output Channel ("ClaudeOS Extensions")
- Toast notification on install completion/failure
- For private repos: auto-detect GitHub PAT secrets from claudeos-secrets and offer in a picker (no manual selection step if PAT already configured)
- Uninstall handled entirely by VS Code's built-in extension uninstall UI
- Reload behavior follows existing supervisor setting (default: force reload, configurable to notification)
- Install state persisted to /data volume via supervisor's install-state.json -- no modification to default-extensions.json
- Self-improvement is NOT a special mode or session type -- it's a Claude Code skill loaded by default in all ClaudeOS sessions
- Skill provides context about being inside ClaudeOS and access to MCP tools for extension management
- No special session markers or icons for self-improve sessions -- they look like regular sessions
- No extra completion notifications -- the existing extension install notification is sufficient
- Claude Code builds new extensions as proper git repos in the session's working directory, leveraging Claude Code's built-in project management
- Extension source persists as a browsable, editable, version-controlled project
- All 4 tools per SPEC: install_extension, uninstall_extension, list_extensions, get_extension_template
- get_extension_template returns the GitHub repo URL for aventre-labs/claudeos-extension-template -- Claude forks it to create new extensions
- Template URL only, no extra context (SPEC excerpts, API docs) bundled in the tool response
- MCP server registered globally on extension activation (writes to ~/.claude.json), deregistered on deactivation
- All Claude Code sessions see the self-improvement tools once the extension is active

### Claude's Discretion
- Command palette input flow UX details (multi-step input boxes vs quick picks)
- Output Channel log format and verbosity
- MCP server implementation details (stdio vs HTTP transport)
- Skill file content and structure (CLAUDE.md or equivalent)
- How build-from-source method handles npm install + compile + package in the session working directory
- Error handling and retry behavior for MCP tool calls

### Deferred Ideas (OUT OF SCOPE)
- Custom VS Code marketplace service for in-IDE extension search/browse -- explicitly out of scope for v1 (PROJECT.md)
- Extension update mechanism (reinstall with new tag) -- could be a command palette command in a future phase
- Usage visualizer extension for API costs (deferred from Phase 3)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| IMP-01 | User can see installed extensions in an Extension Manager sidebar panel | **Superseded by user decision**: No custom sidebar panel. VS Code's built-in Installed Extensions view handles this. No implementation needed. |
| IMP-02 | User can install an extension by pasting a GitHub repo URL and clicking install | Command palette "ClaudeOS: Install Extension" -> QuickPick for method -> InputBox for URL/path -> calls supervisor POST /api/v1/extensions/install |
| IMP-03 | User can select a GitHub PAT secret for private repo access during install | Auto-detect PAT secrets from claudeos-secrets public API (listSecrets + category filter), show QuickPick if multiple PATs exist |
| IMP-04 | User can see install progress with log output | vscode.window.withProgress(ProgressLocation.Notification) + OutputChannel("ClaudeOS Extensions") for detailed logs |
| IMP-05 | User can uninstall extensions from the Extension Manager panel | **Superseded by user decision**: Handled by VS Code's built-in uninstall. MCP tool calls supervisor DELETE /api/v1/extensions/:id for programmatic uninstall. |
| IMP-06 | MCP server exposes install_extension, uninstall_extension, list_extensions, get_extension_template tools | MCP server using @modelcontextprotocol/sdk with StdioServerTransport, registered via `claude mcp add-json` on activation |
| IMP-07 | Claude Code can scaffold, build, and install extensions autonomously | Skill file + MCP tools + extension template at aventre-labs/claudeos-extension-template enable the loop |
| IMP-08 | Self-improve sessions marked with special icon | **Superseded by user decision**: No special markers. Self-improvement is a skill, not a session type. All sessions have access. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | ^1.27.0 | MCP server for Claude Code tool exposure | Official MCP TypeScript SDK; v1.x is stable for production |
| zod | ^3.24.0 | Schema validation for MCP tool inputs | Required peer dependency of MCP SDK; already used in supervisor |
| vscode (API) | ^1.85.0 | Extension host API | Same engine version as all existing extensions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| esbuild | ^0.27.0 | Bundle extension and MCP server | Build step -- matches extension template |
| @vscode/vsce | ^3.7.0 | Package VSIX | Build step -- matches extension template |
| vitest | ^4.0.0 | Unit tests | Test step -- matches extension template |
| typescript | ~5.8.0 | Type checking | Matches all existing extensions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @modelcontextprotocol/sdk v1 | @modelcontextprotocol/server (v2 split package) | v2 is pre-alpha; v1.x is recommended for production; use v1 |
| stdio transport | HTTP transport | stdio is simpler for local process, no port management needed |
| execFile for MCP registration | Direct JSON file manipulation | `claude mcp add-json` is the official CLI method; more reliable than hand-editing ~/.claude.json |

**Installation (MCP server package):**
```bash
npm install @modelcontextprotocol/sdk zod
```

**Installation (extension package):**
```bash
npm install --save-dev @types/vscode typescript esbuild @vscode/vsce vitest
```

## Architecture Patterns

### Recommended Project Structure
```
claudeos-self-improve/
  src/
    extension.ts          # Extension entry point: commands, MCP lifecycle, skill registration
    supervisor/
      client.ts           # SupervisorClient for /extensions/* REST endpoints
    commands/
      install-extension.ts    # Command palette install flow (QuickPick + InputBox)
    mcp/
      register.ts         # MCP server registration/deregistration via `claude mcp add-json`
    skill/
      skill-content.ts    # Skill file content (CLAUDE.md text for Claude Code sessions)
  mcp-server/
    src/
      index.ts            # MCP server entry point (stdio transport)
      tools/
        install.ts        # install_extension tool
        uninstall.ts      # uninstall_extension tool
        list.ts           # list_extensions tool
        template.ts       # get_extension_template tool
    package.json          # Separate package for MCP server dependencies
  test/
    __mocks__/
      vscode.ts           # VS Code API mock (copy from claudeos-secrets)
    commands/
      install-extension.test.ts
    mcp-server/
      tools.test.ts
    supervisor/
      client.test.ts
  package.json
  tsconfig.json
  vitest.config.ts
```

### Pattern 1: Command Palette Multi-Step Input Flow
**What:** Sequential QuickPick -> InputBox flow for extension installation
**When to use:** When user invokes "ClaudeOS: Install Extension" command
**Example:**
```typescript
// Step 1: Pick install method
const method = await vscode.window.showQuickPick(
  [
    { label: "From GitHub Release", value: "github-release", description: "Install from a GitHub release VSIX asset" },
    { label: "From Local Source", value: "build-from-source", description: "Build and install from a local directory" },
    { label: "From VSIX File", value: "local-vsix", description: "Install a pre-built .vsix file" },
  ],
  { placeHolder: "Select install method" },
);
if (!method) return;

// Step 2: Collect method-specific inputs
if (method.value === "github-release") {
  const repo = await vscode.window.showInputBox({
    prompt: "GitHub repository (owner/repo)",
    placeHolder: "aventre-labs/claudeos-memory",
  });
  if (!repo) return;

  const tag = await vscode.window.showInputBox({
    prompt: "Release tag (e.g., v0.1.0)",
    placeHolder: "v0.1.0",
  });
  if (!tag) return;

  // Step 3: Auto-detect PAT for private repos
  // (see Pattern 2 below)
}
```

### Pattern 2: Auto-Detect GitHub PAT from Secrets
**What:** Query claudeos-secrets for PAT secrets, offer picker if multiple exist
**When to use:** During GitHub release install for private repos
**Example:**
```typescript
// Get secrets extension API
const secretsExt = vscode.extensions.getExtension<SecretsPublicApi>("claudeos.claudeos-secrets");
if (secretsExt) {
  const api = secretsExt.isActive ? secretsExt.exports : await secretsExt.activate();
  const allSecrets = await api.listSecrets();
  const pats = allSecrets.filter(s => s.category === "github-pat" || s.name.toLowerCase().includes("github"));

  if (pats.length === 1) {
    // Auto-select the single PAT
    secretName = pats[0].name;
  } else if (pats.length > 1) {
    // Let user pick
    const pick = await vscode.window.showQuickPick(
      pats.map(p => ({ label: p.name, value: p.name })),
      { placeHolder: "Select GitHub PAT for private repo access" },
    );
    if (pick) secretName = pick.value;
  }
}
```

### Pattern 3: MCP Server Registration via CLI
**What:** Register/deregister the MCP server with Claude Code on extension activate/deactivate
**When to use:** Extension lifecycle
**Example:**
```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function registerMcpServer(serverScriptPath: string): Promise<void> {
  const config = JSON.stringify({
    type: "stdio",
    command: "node",
    args: [serverScriptPath],
  });
  await execFileAsync("claude", [
    "mcp", "add-json", "claudeos-self-improve",
    config,
    "--scope", "user",
  ]);
}

async function deregisterMcpServer(): Promise<void> {
  await execFileAsync("claude", ["mcp", "remove", "claudeos-self-improve"]);
}
```

### Pattern 4: MCP Server with Supervisor API Delegation
**What:** MCP tools that delegate to the supervisor REST API
**When to use:** All four MCP tools
**Example:**
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SUPERVISOR_API = "http://localhost:3100/api/v1";

const server = new McpServer({
  name: "claudeos-self-improve",
  version: "0.1.0",
});

server.tool(
  "install_extension",
  {
    description: "Install a ClaudeOS extension from GitHub, local source, or VSIX file",
    inputSchema: {
      method: z.enum(["github-release", "build-from-source", "local-vsix"]),
      repo: z.string().optional().describe("GitHub owner/repo (for github-release)"),
      tag: z.string().optional().describe("Release tag (for github-release)"),
      localPath: z.string().optional().describe("Local path (for build-from-source or local-vsix)"),
    },
  },
  async ({ method, repo, tag, localPath }) => {
    const body: Record<string, unknown> = { method };
    if (repo) body.repo = repo;
    if (tag) body.tag = tag;
    if (localPath) body.localPath = localPath;

    const res = await fetch(`${SUPERVISOR_API}/extensions/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      return { content: [{ type: "text", text: `Install failed: ${err}` }] };
    }

    const result = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Pattern 5: Progress Notification with Output Channel
**What:** Show install progress inline + detailed logs
**When to use:** During extension install
**Example:**
```typescript
const outputChannel = vscode.window.createOutputChannel("ClaudeOS Extensions");

await vscode.window.withProgress(
  {
    location: vscode.ProgressLocation.Notification,
    title: `Installing extension: ${repo}`,
    cancellable: false,
  },
  async (progress) => {
    progress.report({ message: "Sending install request..." });
    outputChannel.appendLine(`[${new Date().toISOString()}] Installing ${repo}@${tag}`);
    outputChannel.show(true); // Reveal but don't focus

    const result = await client.installExtension({ method, repo, tag });

    if (result.state === "installed") {
      outputChannel.appendLine(`[${new Date().toISOString()}] Successfully installed ${result.name}`);
      vscode.window.showInformationMessage(`Extension "${result.name}" installed successfully.`);
      // Trigger reload per supervisor setting
    } else if (result.state === "failed") {
      outputChannel.appendLine(`[${new Date().toISOString()}] FAILED: ${result.error}`);
      vscode.window.showErrorMessage(`Extension install failed: ${result.error}`);
    }
  },
);
```

### Anti-Patterns to Avoid
- **Do NOT create a sidebar panel for extension listing.** User explicitly decided to use VS Code's built-in Extensions view. The command palette is the only custom UI.
- **Do NOT mark self-improve sessions with special icons.** Self-improvement is a skill, not a session type. All sessions are equal.
- **Do NOT bundle SPEC excerpts or API docs in MCP tool responses.** The skill file provides context; get_extension_template returns just the template repo URL.
- **Do NOT hand-edit ~/.claude.json directly for MCP registration.** Use `claude mcp add-json` and `claude mcp remove` CLI commands -- they handle file locking and format validation.
- **Do NOT write logs to stdout in the MCP server.** Stdout carries JSON-RPC for MCP. Use stderr for debug logging.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Extension install pipeline | Custom clone/build/install logic in extension | Supervisor REST API POST /api/v1/extensions/install | Pipeline already exists with state machine, error handling, three methods |
| MCP protocol handling | Custom JSON-RPC over stdio | @modelcontextprotocol/sdk McpServer + StdioServerTransport | Handles message framing, tool registration, error responses correctly |
| MCP registration with Claude Code | Hand-edit ~/.claude.json | `claude mcp add-json` / `claude mcp remove` CLI | Official CLI handles file locking, validation, scope management |
| Extension listing in UI | Custom sidebar/webview | VS Code's built-in Extensions view | User decision; VS Code already lists installed extensions |
| VSIX packaging | Manual zip/tar | `vsce package --no-dependencies` | Handles manifest validation, file inclusion, correct VSIX format |
| Extension uninstall UI | Custom uninstall panel | VS Code's built-in "Uninstall" button on each extension | User decision; built-in UX is familiar to all VS Code users |

**Key insight:** The supervisor already has 90% of the backend logic. This phase is primarily about wiring the VS Code UI (command palette) and Claude Code integration (MCP + skill) to the existing supervisor API.

## Common Pitfalls

### Pitfall 1: MCP Server Stdout Pollution
**What goes wrong:** MCP server accidentally writes debug logs to stdout, corrupting JSON-RPC messages. Claude Code silently fails to parse tools.
**Why it happens:** console.log defaults to stdout in Node.js.
**How to avoid:** Use console.error() or write to stderr explicitly in the MCP server. Never use console.log in mcp-server/ code.
**Warning signs:** Claude Code shows "MCP connection failed" or tools don't appear in `/mcp`.

### Pitfall 2: MCP Registration Race with Extension Activation
**What goes wrong:** Extension tries to register MCP server before Claude Code CLI is available, or deregisters before all sessions disconnect.
**Why it happens:** In the ClaudeOS container, Claude Code is installed at runtime on /data volume. The `claude` CLI may not be on PATH when the extension first activates.
**How to avoid:** Check for `claude` binary existence before registration. Use try/catch with a retry. On deactivate, deregister fire-and-forget (don't block on it).
**Warning signs:** "command not found: claude" errors in OutputChannel.

### Pitfall 3: Supervisor Uninstall Endpoint Not Implemented
**What goes wrong:** MCP uninstall_extension tool calls DELETE /api/v1/extensions/:id and gets a 404 because the stub returns "not yet implemented."
**Why it happens:** The supervisor extensions route has a placeholder DELETE handler that always returns 404.
**How to avoid:** Implement the actual uninstall in the supervisor before building the MCP tool. Use `code-server --uninstall-extension <extensionId>` to perform the actual removal.
**Warning signs:** 404 responses from the supervisor on uninstall calls.

### Pitfall 4: Build-from-Source Install Timeout
**What goes wrong:** `npm install` for a large extension takes >120 seconds, exceeding the execFile timeout in ExtensionInstaller.
**Why it happens:** The supervisor's installFromSource uses 120s timeout for each step. npm install with cold cache can exceed this.
**How to avoid:** Increase timeout for build-from-source operations, or stream progress. Consider using `--prefer-offline` for npm install.
**Warning signs:** "npm install failed: TIMEOUT" errors in install-state.json.

### Pitfall 5: MCP Server Process Zombie
**What goes wrong:** Extension deactivates but the MCP server child process keeps running, consuming resources.
**Why it happens:** MCP server is started as a child process on activation but not properly cleaned up.
**How to avoid:** The MCP server is NOT started as a child process by the extension. Claude Code manages the MCP server lifecycle -- it spawns the process itself based on the config in ~/.claude.json. The extension only registers/deregisters the config. No child process management needed.
**Warning signs:** N/A -- this is a misunderstanding of how Claude Code MCP works.

### Pitfall 6: Circular Dependency on claudeos-secrets
**What goes wrong:** Extension declares claudeos-secrets as a hard dependency but it's not installed yet (first boot scenario).
**Why it happens:** Both extensions are installed during first boot; install order isn't guaranteed.
**How to avoid:** Use optional runtime check via `vscode.extensions.getExtension()`, not `extensionDependencies`. Degrade gracefully when secrets extension is unavailable (skip PAT auto-detection).
**Warning signs:** Extension fails to activate with "dependency not satisfied" error.

## Code Examples

### MCP Server Entry Point (mcp-server/src/index.ts)
```typescript
// Source: @modelcontextprotocol/sdk docs + ClaudeOS AGENTS.md MCP pattern
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SUPERVISOR_API = "http://localhost:3100/api/v1";
const TEMPLATE_REPO = "https://github.com/aventre-labs/claudeos-extension-template";

const server = new McpServer({
  name: "claudeos-self-improve",
  version: "0.1.0",
});

// install_extension
server.tool(
  "install_extension",
  {
    description: "Install a ClaudeOS extension. Use method 'github-release' with repo+tag, 'build-from-source' with localPath, or 'local-vsix' with localPath.",
    inputSchema: {
      method: z.enum(["github-release", "build-from-source", "local-vsix"]),
      repo: z.string().optional(),
      tag: z.string().optional(),
      localPath: z.string().optional(),
    },
  },
  async ({ method, repo, tag, localPath }) => {
    const body: Record<string, unknown> = { method };
    if (repo) body.repo = repo;
    if (tag) body.tag = tag;
    if (localPath) body.localPath = localPath;

    const res = await fetch(`${SUPERVISOR_API}/extensions/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const result = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

// uninstall_extension
server.tool(
  "uninstall_extension",
  {
    description: "Uninstall a ClaudeOS extension by its extension ID (e.g., 'claudeos.claudeos-memory').",
    inputSchema: {
      extensionId: z.string().describe("VS Code extension ID to uninstall"),
    },
  },
  async ({ extensionId }) => {
    const res = await fetch(`${SUPERVISOR_API}/extensions/${encodeURIComponent(extensionId)}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const err = await res.text();
      return { content: [{ type: "text", text: `Uninstall failed: ${err}` }] };
    }

    return { content: [{ type: "text", text: `Extension ${extensionId} uninstalled.` }] };
  },
);

// list_extensions
server.tool(
  "list_extensions",
  {
    description: "List all installed ClaudeOS extensions with their status.",
  },
  async () => {
    const res = await fetch(`${SUPERVISOR_API}/extensions`);
    const extensions = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(extensions, null, 2) }] };
  },
);

// get_extension_template
server.tool(
  "get_extension_template",
  {
    description: "Get the GitHub repo URL for the ClaudeOS extension template. Use this to scaffold new extensions.",
  },
  async () => {
    return {
      content: [{ type: "text", text: TEMPLATE_REPO }],
    };
  },
);

// Connect transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

### MCP Registration Helper
```typescript
// Source: Claude Code MCP docs (https://code.claude.com/docs/en/mcp)
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export async function registerMcpServer(extensionPath: string): Promise<void> {
  const serverScript = join(extensionPath, "out", "mcp-server.js");
  const config = JSON.stringify({
    type: "stdio",
    command: "node",
    args: [serverScript],
  });

  try {
    await execFileAsync("claude", [
      "mcp", "add-json", "claudeos-self-improve",
      config,
      "--scope", "user",
    ], { timeout: 10_000 });
  } catch (err) {
    // Claude CLI not available -- log and continue
    console.error("Failed to register MCP server:", err);
  }
}

export async function deregisterMcpServer(): Promise<void> {
  try {
    await execFileAsync("claude", [
      "mcp", "remove", "claudeos-self-improve",
    ], { timeout: 10_000 });
  } catch {
    // Best-effort cleanup
  }
}
```

### Supervisor Client for Extensions
```typescript
// Source: existing SupervisorClient pattern from claudeos-secrets/src/supervisor/client.ts
export interface ExtensionRecord {
  id: string;
  name: string;
  version: string;
  method: string;
  state: string;
  installedAt?: string;
  error?: string;
}

export class SupervisorClient {
  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:3100/api/v1") {
    this.baseUrl = baseUrl;
  }

  async installExtension(body: {
    method: string;
    repo?: string;
    tag?: string;
    localPath?: string;
  }): Promise<ExtensionRecord> {
    const res = await fetch(`${this.baseUrl}/extensions/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Install failed: ${res.status}`);
    return res.json() as Promise<ExtensionRecord>;
  }

  async listExtensions(): Promise<ExtensionRecord[]> {
    const res = await fetch(`${this.baseUrl}/extensions`);
    if (!res.ok) throw new Error(`List failed: ${res.status}`);
    return res.json() as Promise<ExtensionRecord[]>;
  }

  async uninstallExtension(extensionId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/extensions/${encodeURIComponent(extensionId)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Uninstall failed: ${res.status}`);
  }
}
```

### Skill File Content
```typescript
// The skill file written to a well-known location so all Claude Code sessions load it
export const SKILL_CONTENT = `# ClaudeOS Self-Improvement Skill

You are running inside ClaudeOS, a VS Code-based operating environment for Claude Code.

## What You Can Do

You have access to MCP tools for managing ClaudeOS extensions:

- **install_extension**: Install an extension from GitHub release, local source, or VSIX file
- **uninstall_extension**: Uninstall an extension by its VS Code extension ID
- **list_extensions**: List all installed extensions and their status
- **get_extension_template**: Get the template repo URL for scaffolding new extensions

## Building New Extensions

When asked to build a new feature for ClaudeOS:

1. Call get_extension_template to get the template repo URL
2. Clone/fork the template into the current working directory
3. Implement the extension (TypeScript, esbuild, VS Code API)
4. Build: npm run compile && npm run package
5. Install: call install_extension with method "build-from-source" and localPath pointing to the extension directory

Extensions are standard VS Code extensions. They communicate with the supervisor at http://localhost:3100/api/v1.

## Key Constraints

- Never modify Claude Code itself -- it runs stock in tmux
- Never fork code-server -- extend via VS Code extensions only
- Store persistent data in /data/extensions/{extension-name}/
- Use the claudeos-secrets API for any credentials
`;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MCP SDK v1 monolithic (@modelcontextprotocol/sdk) | MCP SDK v2 split packages (@modelcontextprotocol/server) | v2 pre-alpha, Q1 2026 | v1.x recommended for production; use v1.x (^1.27.0) |
| Claude Desktop config (claude_desktop_config.json) | Claude Code config (~/.claude.json + CLI) | Claude Code 1.x | Use `claude mcp add-json` CLI, not direct file editing |
| Custom MCP JSON file editing | `claude mcp add-json` / `claude mcp remove` CLI | Claude Code 1.x | CLI handles locking, validation, scope management |
| MCP SSE transport | Streamable HTTP (recommended for remote) | 2025 | Not relevant -- use stdio for local process |

**Deprecated/outdated:**
- `~/.claude/mcp_servers.json`: The CONTEXT.md references this path, but the actual Claude Code configuration is `~/.claude.json` under the `mcpServers` key. The `claude mcp add-json --scope user` command writes to the correct location.
- SSE transport for MCP: Deprecated in favor of Streamable HTTP. Not relevant here since we use stdio.
- MCP SDK v2: Pre-alpha, do not use. Stick with @modelcontextprotocol/sdk v1.x.

## Open Questions

1. **Supervisor Uninstall Implementation**
   - What we know: The DELETE /api/v1/extensions/:id route exists but returns 404 with "not yet implemented"
   - What's unclear: Whether `code-server --uninstall-extension <id>` is the right approach, or if we need to also clean up install-state.json
   - Recommendation: Implement in supervisor first. Use `code-server --uninstall-extension <extensionId>`, remove from install-state.json, return success.

2. **MCP Server Script Path After esbuild Bundle**
   - What we know: Extension bundles with esbuild to out/extension.js. MCP server needs a separate entry point.
   - What's unclear: Whether to bundle MCP server into the same out/ directory or keep it as a separate package with its own node_modules
   - Recommendation: Bundle MCP server separately to out/mcp-server.js using a second esbuild entry point. This avoids needing node_modules at runtime for the MCP server. Register the path as `node <extensionPath>/out/mcp-server.js`.

3. **Skill File Location**
   - What we know: Claude Code loads skills from various locations. The skill provides context about ClaudeOS.
   - What's unclear: Exact file path Claude Code looks for skills. Could be ~/.claude/skills/, project-level, or another convention.
   - Recommendation: Write skill to /data/config/claudeos-skill.md and register it via Claude Code's skill mechanism. If no formal skill mechanism exists, write to a CLAUDE.md in the session working directory or use the MCP server's instruction field.

4. **GitHub PAT Passing to Supervisor**
   - What we know: Supervisor's installFromGitHub does not currently accept authentication tokens for private repos
   - What's unclear: How to pass the PAT from the extension through the supervisor API to the git clone step
   - Recommendation: Extend the supervisor's install endpoint to accept a `secretName` parameter, resolve the PAT value from SecretStore, and use it as a Bearer token in the GitHub API request header.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.0.0 |
| Config file | claudeos-self-improve/vitest.config.ts (Wave 0) |
| Quick run command | `cd claudeos-self-improve && npx vitest run` |
| Full suite command | `cd claudeos-self-improve && npx vitest run && cd ../supervisor && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IMP-01 | (Superseded - VS Code built-in) | N/A | N/A | N/A |
| IMP-02 | Install command calls supervisor API with correct method/params | unit | `cd claudeos-self-improve && npx vitest run test/commands/install-extension.test.ts -x` | Wave 0 |
| IMP-03 | PAT auto-detection queries secrets API, offers picker | unit | `cd claudeos-self-improve && npx vitest run test/commands/install-extension.test.ts -x` | Wave 0 |
| IMP-04 | Install shows progress notification + output channel | unit | `cd claudeos-self-improve && npx vitest run test/commands/install-extension.test.ts -x` | Wave 0 |
| IMP-05 | (Superseded - VS Code built-in + supervisor DELETE) | unit | `cd supervisor && npx vitest run test/routes/extensions.test.ts -x` | Partially exists |
| IMP-06 | MCP tools call supervisor API correctly | unit | `cd claudeos-self-improve && npx vitest run test/mcp-server/tools.test.ts -x` | Wave 0 |
| IMP-07 | get_extension_template returns correct URL | unit | `cd claudeos-self-improve && npx vitest run test/mcp-server/tools.test.ts -x` | Wave 0 |
| IMP-08 | (Superseded - no special markers) | N/A | N/A | N/A |

### Sampling Rate
- **Per task commit:** `cd claudeos-self-improve && npx vitest run`
- **Per wave merge:** `cd claudeos-self-improve && npx vitest run && cd ../supervisor && npx vitest run`
- **Phase gate:** Full suite green before /gsd:verify-work

### Wave 0 Gaps
- [ ] `claudeos-self-improve/vitest.config.ts` -- vitest config with vscode alias
- [ ] `claudeos-self-improve/test/__mocks__/vscode.ts` -- VS Code API mock (copy from claudeos-secrets, extend as needed)
- [ ] `claudeos-self-improve/test/commands/install-extension.test.ts` -- covers IMP-02, IMP-03, IMP-04
- [ ] `claudeos-self-improve/test/mcp-server/tools.test.ts` -- covers IMP-06, IMP-07
- [ ] `claudeos-self-improve/test/supervisor/client.test.ts` -- covers SupervisorClient for extensions
- [ ] Supervisor uninstall implementation needed before IMP-05 can be tested

## Sources

### Primary (HIGH confidence)
- Existing codebase: `supervisor/src/services/extension-installer.ts` -- full install pipeline
- Existing codebase: `supervisor/src/routes/extensions.ts` -- REST routes with Zod schemas
- Existing codebase: `claudeos-sessions/src/supervisor/client.ts` -- SupervisorClient pattern
- Existing codebase: `claudeos-secrets/src/extension.ts` -- activate() pattern, public API pattern
- Existing codebase: `extension-template/AGENTS.md` -- MCP server pattern documentation
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp) -- MCP registration, scopes, `claude mcp add-json` format
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) -- v1.27.1 stable, McpServer.tool() API

### Secondary (MEDIUM confidence)
- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) -- version info, peer dependencies
- [MCP Transports docs](https://modelcontextprotocol.info/docs/concepts/transports/) -- stdio transport specification

### Tertiary (LOW confidence)
- MCP server instruction field for tool search -- needs hands-on testing to confirm Claude Code picks up server instructions as skill context

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries well-established, versions verified, patterns from existing codebase
- Architecture: HIGH -- follows exact patterns established in phases 1-3 (SupervisorClient, command palette, OutputChannel)
- MCP integration: MEDIUM -- MCP SDK API is well-documented but MCP registration lifecycle with Claude Code inside the container needs testing (flagged in STATE.md)
- Pitfalls: HIGH -- derived from direct codebase analysis (stub uninstall route, timeout values, stdout pollution)

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (30 days -- stable domain, established patterns)
