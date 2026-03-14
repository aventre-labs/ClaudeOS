// ============================================================
// ClaudeOS Self-Improve MCP Server - Entry Point
// ============================================================
// MCP server with stdio transport exposing 4 tools for
// extension management. Delegates all operations to the
// supervisor REST API.
//
// CRITICAL: Never use console.log (stdout is JSON-RPC for MCP).
// Use console.error for any debug output.
// ============================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { handleInstall, handleUninstall, handleList, handleTemplate } from "./tools.js";

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
    const text = await handleInstall({ method, repo, tag, localPath });
    return { content: [{ type: "text" as const, text }] };
  },
);

// uninstall_extension
server.tool(
  "uninstall_extension",
  {
    description: "Uninstall a ClaudeOS extension by its VS Code extension ID.",
    inputSchema: {
      extensionId: z.string().describe("VS Code extension ID to uninstall"),
    },
  },
  async ({ extensionId }) => {
    const text = await handleUninstall({ extensionId });
    return { content: [{ type: "text" as const, text }] };
  },
);

// list_extensions
server.tool(
  "list_extensions",
  {
    description: "List all installed ClaudeOS extensions with their status.",
  },
  async () => {
    const text = await handleList();
    return { content: [{ type: "text" as const, text }] };
  },
);

// get_extension_template
server.tool(
  "get_extension_template",
  {
    description: "Get the GitHub repo URL for the ClaudeOS extension template. Use this to scaffold new extensions.",
  },
  async () => {
    const text = await handleTemplate();
    return { content: [{ type: "text" as const, text }] };
  },
);

// Connect transport
const transport = new StdioServerTransport();
await server.connect(transport);
