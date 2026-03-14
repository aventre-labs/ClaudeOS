// ============================================================
// ClaudeOS Self-Improve Extension - MCP Server Registration
// ============================================================
// Register/deregister the MCP server with Claude Code via
// the `claude` CLI. Called on extension activate/deactivate.
// ============================================================

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

/**
 * Register the MCP server with Claude Code using `claude mcp add-json`.
 * Points to the bundled out/mcp-server.js via stdio transport.
 */
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
      config, "--scope", "user",
    ], { timeout: 10_000 });
  } catch (err) {
    // Claude CLI not available yet (runtime install) -- log and continue
    console.error("Failed to register MCP server:", err);
  }
}

/**
 * Deregister the MCP server from Claude Code using `claude mcp remove`.
 * Best-effort cleanup on extension deactivation.
 */
export async function deregisterMcpServer(): Promise<void> {
  try {
    await execFileAsync("claude", [
      "mcp", "remove", "claudeos-self-improve",
    ], { timeout: 10_000 });
  } catch {
    // Best-effort cleanup on deactivation
  }
}
