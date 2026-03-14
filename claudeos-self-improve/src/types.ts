// ============================================================
// ClaudeOS Self-Improve Extension - Type Definitions
// ============================================================
// Shared types mirroring supervisor extension contracts.
// SecretsPublicApi shape for optional cross-extension access.
// ============================================================

export interface ExtensionRecord {
  id: string;
  name: string;
  version: string;
  method: "github-release" | "build-from-source" | "local-vsix";
  state: "pending" | "downloading" | "installing" | "installed" | "failed";
  installedAt?: string;
  error?: string;
}

// Re-export SecretsPublicApi shape for optional cross-extension access
export interface SecretsPublicApi {
  getSecret(name: string): Promise<string | undefined>;
  setSecret(name: string, value: string, category?: string): Promise<void>;
  hasSecret(name: string): Promise<boolean>;
  deleteSecret(name: string): Promise<void>;
  listSecrets(): Promise<Array<{ name: string; category?: string }>>;
}
