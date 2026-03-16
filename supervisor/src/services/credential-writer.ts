// ============================================================
// ClaudeOS Supervisor - Credential Writer
// ============================================================
// Reads credentials from SecretStore and writes them to native
// config locations (~/.claude/settings.json, ~/.railway/config.json).
// Uses atomic tmp+rename write pattern for safety.
// ============================================================

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import type { SecretStore } from "./secret-store.js";
import type { WizardStateService } from "./wizard-state.js";

export class CredentialWriter {
  /**
   * Write the Anthropic API key to ~/.claude/settings.json.
   * Merges with existing settings (does not overwrite other keys).
   * Creates ~/.claude/ directory if it does not exist.
   * Uses atomic tmp+rename write pattern.
   */
  async writeAnthropicKey(apiKey: string): Promise<void> {
    const claudeDir = join(process.env.HOME || "/root", ".claude");
    const settingsPath = join(claudeDir, "settings.json");

    mkdirSync(claudeDir, { recursive: true });

    // Read existing settings, start fresh on parse failure
    let settings: Record<string, unknown> = {};
    if (existsSync(settingsPath)) {
      try {
        settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      } catch {
        // Corrupted file — start fresh
        settings = {};
      }
    }

    // Deep-merge env block
    const existingEnv = (settings.env as Record<string, string>) ?? {};
    settings.env = { ...existingEnv, ANTHROPIC_API_KEY: apiKey };

    // Atomic write: tmp + rename
    const tmpPath = settingsPath + ".tmp";
    writeFileSync(tmpPath, JSON.stringify(settings, null, 2));
    renameSync(tmpPath, settingsPath);
  }

  /**
   * Write the Railway token to ~/.railway/config.json.
   * Creates ~/.railway/ directory if it does not exist.
   * Uses atomic tmp+rename write pattern.
   */
  async writeRailwayToken(token: string): Promise<void> {
    const railwayDir = join(process.env.HOME || "/root", ".railway");
    const configPath = join(railwayDir, "config.json");

    mkdirSync(railwayDir, { recursive: true });

    const config = { user: { token } };

    // Atomic write: tmp + rename
    const tmpPath = configPath + ".tmp";
    writeFileSync(tmpPath, JSON.stringify(config, null, 2));
    renameSync(tmpPath, configPath);
  }

  /**
   * Write all credentials from SecretStore to their native config locations.
   * Throws if anthropic-api-key is not found in SecretStore.
   * Conditionally writes Railway token based on wizard state.
   */
  async writeAll(
    secretStore: SecretStore,
    wizardState: WizardStateService,
  ): Promise<void> {
    // Read and write Anthropic API key (required)
    const apiKey = await secretStore.get("anthropic-api-key");
    await this.writeAnthropicKey(apiKey);

    // Conditionally write Railway token
    const state = wizardState.getState();
    if (state.steps.railway.tokenStored) {
      const railwayToken = await secretStore.get("railway-token");
      await this.writeRailwayToken(railwayToken);
    }
  }
}
