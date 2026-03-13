// ============================================================
// ClaudeOS Secrets Extension - Entry Point
// ============================================================
// Activates the secrets sidebar, registers commands, and returns
// the public API for cross-extension access.
// ============================================================

import * as vscode from "vscode";
import { SupervisorClient } from "./supervisor/client.js";
import { SecretsTreeProvider } from "./sidebar/secrets-tree.js";
import { createPublicApi } from "./api/public-api.js";
import type { SecretsPublicApi } from "./types.js";

// --- Output Channel for debugging ---
let outputChannel: vscode.OutputChannel;

function log(message: string): void {
  outputChannel?.appendLine(`[${new Date().toISOString()}] ${message}`);
}

// --- Activate ---

export async function activate(
  context: vscode.ExtensionContext,
): Promise<SecretsPublicApi> {
  outputChannel = vscode.window.createOutputChannel("ClaudeOS Secrets");
  context.subscriptions.push(outputChannel);

  log("Activating ClaudeOS Secrets extension");

  // --- Core services ---
  const client = new SupervisorClient();
  const treeProvider = new SecretsTreeProvider();

  // --- Sidebar tree view ---
  const treeView = vscode.window.createTreeView("claudeos.secrets", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  // --- Initial fetch ---
  try {
    const secrets = await client.listSecrets();
    treeProvider.update(secrets);
    log(`Loaded ${secrets.length} secrets`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Failed to load secrets: ${message}`);
    vscode.window.showErrorMessage(
      `ClaudeOS: Failed to connect to supervisor: ${message}`,
    );
  }

  // --- Commands ---

  // Open secret editor (placeholder -- webview wired in plan 03)
  const openEditorCmd = vscode.commands.registerCommand(
    "claudeos.secrets.openEditor",
    (name?: string) => {
      log(`Open editor for secret: ${name ?? "(none)"}`);
    },
  );

  // Refresh secrets
  const refreshCmd = vscode.commands.registerCommand(
    "claudeos.secrets.refresh",
    async () => {
      try {
        const secrets = await client.listSecrets();
        treeProvider.update(secrets);
        log("Refreshed secrets");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Failed to refresh secrets: ${message}`);
        vscode.window.showErrorMessage(
          `Failed to refresh secrets: ${message}`,
        );
      }
    },
  );

  // Add secret (placeholder -- webview wired in plan 03)
  const addSecretCmd = vscode.commands.registerCommand(
    "claudeos.secrets.addSecret",
    () => {
      log("Add secret");
    },
  );

  // --- Public API ---
  const publicApi = createPublicApi(client);

  // --- Register disposables ---
  context.subscriptions.push(
    treeView,
    treeProvider,
    openEditorCmd,
    refreshCmd,
    addSecretCmd,
  );

  log("ClaudeOS Secrets extension activated");
  return publicApi;
}

// --- Deactivate ---

export function deactivate(): void {
  // No-op: VS Code handles disposal via context.subscriptions
}
