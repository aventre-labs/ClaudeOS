// ============================================================
// ClaudeOS Self-Improve Extension - Entry Point
// ============================================================
// Full wiring: OutputChannel, SupervisorClient, install command,
// MCP server registration, and skill file.
// ============================================================

import * as vscode from "vscode";
import { SupervisorClient } from "./supervisor/client.js";
import { registerInstallCommand } from "./commands/install-extension.js";
import { registerMcpServer, deregisterMcpServer } from "./mcp/register.js";
import { writeSkillFile } from "./skill/skill-content.js";

let outputChannel: vscode.OutputChannel;

function log(message: string): void {
  outputChannel?.appendLine(`[${new Date().toISOString()}] ${message}`);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel("ClaudeOS Extensions");
  context.subscriptions.push(outputChannel);

  log("Activating ClaudeOS Self-Improve extension");

  // --- Core services ---
  const client = new SupervisorClient();

  // --- Commands ---
  const installCmd = registerInstallCommand(context, client, outputChannel);
  context.subscriptions.push(installCmd);

  // --- MCP server registration ---
  try {
    await registerMcpServer(context.extensionPath);
    log("MCP server registered with Claude Code");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`MCP registration failed (will retry on Claude CLI availability): ${msg}`);
  }

  // --- Skill file ---
  try {
    await writeSkillFile();
    log("Skill file written to /data/config/claudeos-skill.md");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Skill file write failed (non-fatal): ${msg}`);
  }

  log("ClaudeOS Self-Improve extension activated");
}

export async function deactivate(): Promise<void> {
  await deregisterMcpServer();
}
