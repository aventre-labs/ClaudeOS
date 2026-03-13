// ============================================================
// ClaudeOS Secrets Extension - Type Definitions
// ============================================================
// Shared types for secrets extension. SecretMeta mirrors the
// supervisor API response (no value). SecretsPublicApi is the
// cross-extension contract returned from activate().
// ============================================================

export interface SecretMeta {
  name: string;
  category?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SecretValue {
  name: string;
  value: string;
}

export interface SecretsPublicApi {
  getSecret(name: string): Promise<string | undefined>;
  setSecret(name: string, value: string, category?: string): Promise<void>;
  hasSecret(name: string): Promise<boolean>;
  deleteSecret(name: string): Promise<void>;
  listSecrets(): Promise<Array<{ name: string; category?: string }>>;
}
