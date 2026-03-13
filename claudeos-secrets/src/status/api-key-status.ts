// ============================================================
// ClaudeOS Secrets Extension - API Key Status Bar Item
// ============================================================
// Shows Anthropic API key configuration state in the status bar.
// $(key) with checkmark when configured, $(warning) when not.
// Clicking opens the secrets editor filtered to ANTHROPIC_API_KEY.
// ============================================================

import * as vscode from "vscode";
import type { SupervisorClient } from "../supervisor/client.js";

export class ApiKeyStatusItem {
  private readonly item: vscode.StatusBarItem;
  private readonly client: SupervisorClient;

  constructor(client: SupervisorClient) {
    this.client = client;
    this.item = vscode.window.createStatusBarItem(
      "claudeos.apiKeyStatus",
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.item.name = "ClaudeOS API Key Status";
    this.item.command = "claudeos.secrets.openAnthropicKey";
    this.item.show();
  }

  /**
   * Re-check whether ANTHROPIC_API_KEY exists and update the status bar display.
   */
  async refresh(): Promise<void> {
    const hasKey = await this.client.hasSecret("ANTHROPIC_API_KEY");
    if (hasKey) {
      this.item.text = "$(key) API Key";
      this.item.tooltip = "Anthropic API key is configured";
      this.item.backgroundColor = undefined;
    } else {
      this.item.text = "$(warning) API Key";
      this.item.tooltip =
        "Anthropic API key not configured - click to set up";
      this.item.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground",
      );
    }
  }

  /**
   * Dispose the status bar item.
   */
  dispose(): void {
    this.item.dispose();
  }
}
