// ============================================================
// ClaudeOS Secrets Extension - First-Run Walkthrough
// ============================================================
// On first activation, prompts user to set up Anthropic API key
// and GitHub PAT. Sets context key for home page banner.
// ============================================================

import * as vscode from "vscode";
import type { SupervisorClient } from "../supervisor/client.js";

/**
 * Check if this is the first activation and prompt setup.
 * Also sets the anthropicKeyConfigured context key for the home page banner.
 */
export async function checkFirstRun(
  context: vscode.ExtensionContext,
  client: SupervisorClient,
): Promise<void> {
  const hasRunBefore = context.globalState.get<boolean>(
    "claudeos.secrets.hasRunBefore",
  );

  if (!hasRunBefore) {
    // Mark as run immediately so it doesn't re-trigger
    await context.globalState.update("claudeos.secrets.hasRunBefore", true);

    const action = await vscode.window.showInformationMessage(
      "Welcome to ClaudeOS! Set up your Anthropic API key and GitHub PAT to get started.",
      "Set Up Now",
      "Later",
    );

    if (action === "Set Up Now") {
      await vscode.commands.executeCommand(
        "claudeos.secrets.openEditor",
        "ANTHROPIC_API_KEY",
      );
    }
  }

  // Always check and set context key for home page banner
  const hasAnthropicKey = await client.hasSecret("ANTHROPIC_API_KEY");
  await vscode.commands.executeCommand(
    "setContext",
    "claudeos.secrets.anthropicKeyConfigured",
    hasAnthropicKey,
  );
}
