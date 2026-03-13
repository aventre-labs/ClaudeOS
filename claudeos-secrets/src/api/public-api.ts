// ============================================================
// ClaudeOS Secrets Extension - Public API
// ============================================================
// Cross-extension API returned from activate(). Other extensions
// access secrets via vscode.extensions.getExtension("claudeos.claudeos-secrets")
// .exports.getSecret("name"), etc.
// ============================================================

import type { SupervisorClient } from "../supervisor/client.js";
import type { SecretsPublicApi } from "../types.js";

/**
 * Create the public API object that is returned from activate().
 * All methods delegate to the SupervisorClient.
 */
export function createPublicApi(client: SupervisorClient): SecretsPublicApi {
  return {
    async getSecret(name: string): Promise<string | undefined> {
      try {
        return await client.getSecretValue(name);
      } catch {
        return undefined;
      }
    },

    async setSecret(
      name: string,
      value: string,
      category?: string,
    ): Promise<void> {
      const exists = await client.hasSecret(name);
      if (exists) {
        await client.updateSecret(name, value, category);
      } else {
        await client.createSecret(name, value, category);
      }
    },

    async hasSecret(name: string): Promise<boolean> {
      return client.hasSecret(name);
    },

    async deleteSecret(name: string): Promise<void> {
      await client.deleteSecret(name);
    },

    async listSecrets(): Promise<Array<{ name: string; category?: string }>> {
      const secrets = await client.listSecrets();
      return secrets.map((s) => ({ name: s.name, category: s.category }));
    },
  };
}
