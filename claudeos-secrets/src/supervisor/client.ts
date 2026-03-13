// ============================================================
// ClaudeOS Secrets Extension - Supervisor REST Client
// ============================================================
// HTTP client for supervisor secrets and config API endpoints.
// Uses global fetch (Node 22) for all HTTP calls.
// ============================================================

import type { SecretMeta } from "../types.js";

export class SupervisorClient {
  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:3100/api/v1") {
    this.baseUrl = baseUrl;
  }

  /**
   * List all secrets (metadata only, no values).
   */
  async listSecrets(): Promise<SecretMeta[]> {
    const res = await fetch(`${this.baseUrl}/secrets`, { method: "GET" });
    if (!res.ok) {
      throw new Error(`Failed to list secrets: ${res.status}`);
    }
    return res.json() as Promise<SecretMeta[]>;
  }

  /**
   * Get the plaintext value of a single secret.
   */
  async getSecretValue(name: string): Promise<string> {
    const res = await fetch(
      `${this.baseUrl}/secrets/${encodeURIComponent(name)}`,
      { method: "GET" },
    );
    if (!res.ok) {
      throw new Error(`Failed to get secret: ${res.status}`);
    }
    const data = (await res.json()) as { name: string; value: string };
    return data.value;
  }

  /**
   * Create a new secret.
   */
  async createSecret(
    name: string,
    value: string,
    category?: string,
    tags?: string[],
  ): Promise<SecretMeta> {
    const body: Record<string, unknown> = { name, value };
    if (category !== undefined) body.category = category;
    if (tags !== undefined) body.tags = tags;

    const res = await fetch(`${this.baseUrl}/secrets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Failed to create secret: ${res.status}`);
    }
    return res.json() as Promise<SecretMeta>;
  }

  /**
   * Update an existing secret.
   */
  async updateSecret(
    name: string,
    value?: string,
    category?: string,
    tags?: string[],
  ): Promise<SecretMeta> {
    const body: Record<string, unknown> = {};
    if (value !== undefined) body.value = value;
    if (category !== undefined) body.category = category;
    if (tags !== undefined) body.tags = tags;

    const res = await fetch(
      `${this.baseUrl}/secrets/${encodeURIComponent(name)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      throw new Error(`Failed to update secret: ${res.status}`);
    }
    return res.json() as Promise<SecretMeta>;
  }

  /**
   * Delete a secret by name.
   */
  async deleteSecret(name: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/secrets/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      throw new Error(`Failed to delete secret: ${res.status}`);
    }
  }

  /**
   * Check if a secret exists by listing and searching.
   * Returns false on any error.
   */
  async hasSecret(name: string): Promise<boolean> {
    try {
      const secrets = await this.listSecrets();
      return secrets.some((s) => s.name === name);
    } catch {
      return false;
    }
  }

  /**
   * Set a tmux global environment variable via the supervisor config API.
   */
  async setEnv(key: string, value: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/config/env`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (!res.ok) {
      throw new Error(`Failed to set environment: ${res.status}`);
    }
  }
}
