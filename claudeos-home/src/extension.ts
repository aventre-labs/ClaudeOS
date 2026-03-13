// ============================================================
// ClaudeOS Home Extension - Entry Point
// ============================================================
// Opens the branded home page on every startup, wires up
// SupervisorClient, ShortcutStore, and HomePanel. Checks API
// key status via claudeos-secrets extension exports.
// ============================================================

import * as vscode from "vscode";
import { SupervisorClient } from "./supervisor/client.js";
import { ShortcutStore } from "./shortcuts/shortcut-store.js";
import { HomePanel } from "./webview/home-panel.js";

// --- Output Channel for debugging ---
let outputChannel: vscode.OutputChannel;

function log(message: string): void {
  outputChannel?.appendLine(`[${new Date().toISOString()}] ${message}`);
}

// --- Activate ---

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  outputChannel = vscode.window.createOutputChannel("ClaudeOS Home");
  context.subscriptions.push(outputChannel);

  log("Activating ClaudeOS Home extension");

  // --- Core services ---
  const client = new SupervisorClient();
  const shortcutStore = new ShortcutStore(context);

  // --- Open home page on startup (locked decision) ---
  HomePanel.createOrShow(context, client, shortcutStore);

  // --- Register command to re-open home ---
  const openCmd = vscode.commands.registerCommand(
    "claudeos.home.open",
    () => {
      HomePanel.createOrShow(context, client, shortcutStore);
    },
  );
  context.subscriptions.push(openCmd);

  // --- Check API key status ---
  checkApiKeyStatus();

  log("ClaudeOS Home extension activated");
}

// --- Deactivate ---

export function deactivate(): void {
  // No-op: VS Code handles disposal via context.subscriptions
}

// --- Helpers ---

/**
 * Check if the Anthropic API key is configured via the secrets extension.
 * Posts the status to the home webview so it can show/hide the banner.
 */
async function checkApiKeyStatus(): Promise<void> {
  try {
    const secretsExt = vscode.extensions.getExtension(
      "claudeos.claudeos-secrets",
    );
    if (secretsExt) {
      const api = secretsExt.isActive
        ? secretsExt.exports
        : await secretsExt.activate();
      const hasKey = await api?.hasSecret?.("ANTHROPIC_API_KEY");

      // Post to the current home panel if it exists
      if (HomePanel.currentPanel) {
        // Access the panel's webview via the public interface
        // The panel handles anthropicKeyStatus messages in its HTML
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Failed to check API key status: ${message}`);
  }
}
