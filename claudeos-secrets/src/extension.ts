// ============================================================
// ClaudeOS Secrets Extension - Entry Point
// ============================================================
// Activates the secrets sidebar, webview editor, status bar,
// first-run walkthrough, and returns the public API for
// cross-extension access.
// ============================================================

import * as vscode from "vscode";
import { SupervisorClient } from "./supervisor/client.js";
import { SecretsTreeProvider } from "./sidebar/secrets-tree.js";
import { createPublicApi } from "./api/public-api.js";
import { SecretsPanel } from "./webview/secrets-panel.js";
import { ApiKeyStatusItem } from "./status/api-key-status.js";
import { checkFirstRun } from "./onboarding/first-run.js";
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

  // --- Status bar ---
  const statusItem = new ApiKeyStatusItem(client);
  await statusItem.refresh();

  // --- Change callback (shared by webview and commands) ---
  const onSecretChange = async (): Promise<void> => {
    await statusItem.refresh();
    const secrets = await client.listSecrets();
    treeProvider.update(secrets);
  };

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

  // Open secret editor (wired to SecretsPanel)
  const openEditorCmd = vscode.commands.registerCommand(
    "claudeos.secrets.openEditor",
    (name?: string) => {
      log(`Open editor for secret: ${name ?? "(none)"}`);
      SecretsPanel.createOrShow(
        context,
        client,
        treeProvider,
        onSecretChange,
        name,
      );
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

  // Add secret (opens panel in new-secret mode)
  const addSecretCmd = vscode.commands.registerCommand(
    "claudeos.secrets.addSecret",
    () => {
      log("Add secret");
      SecretsPanel.createOrShow(
        context,
        client,
        treeProvider,
        onSecretChange,
      );
      // After panel is created, send newSecret message
      SecretsPanel.postNewSecret();
    },
  );

  // Open Anthropic key directly (for status bar click)
  const openAnthropicKeyCmd = vscode.commands.registerCommand(
    "claudeos.secrets.openAnthropicKey",
    () => {
      vscode.commands.executeCommand(
        "claudeos.secrets.openEditor",
        "ANTHROPIC_API_KEY",
      );
    },
  );

  // --- First-run walkthrough ---
  checkFirstRun(context, client).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    log(`First-run check failed: ${message}`);
  });

  // --- Public API ---
  const publicApi = createPublicApi(client);

  // --- Register disposables ---
  context.subscriptions.push(
    treeView,
    treeProvider,
    statusItem,
    openEditorCmd,
    refreshCmd,
    addSecretCmd,
    openAnthropicKeyCmd,
  );

  log("ClaudeOS Secrets extension activated");
  return publicApi;
}

// --- Deactivate ---

export function deactivate(): void {
  // No-op: VS Code handles disposal via context.subscriptions
}
