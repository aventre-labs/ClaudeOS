// ============================================================
// ClaudeOS Self-Improve Extension - Supervisor Client
// ============================================================
// Typed fetch wrapper for the supervisor extensions API.
// Mirrors the pattern from claudeos-sessions SupervisorClient.
// ============================================================

import type { ExtensionRecord } from "../types.js";

export interface InstallExtensionBody {
  method: "github-release" | "build-from-source" | "local-vsix";
  repo?: string;
  tag?: string;
  localPath?: string;
}

export class SupervisorClient {
  private readonly baseUrl: string;

  constructor(baseUrl = "http://localhost:3100/api/v1") {
    this.baseUrl = baseUrl;
  }

  /**
   * Install an extension via the supervisor.
   */
  async installExtension(body: InstallExtensionBody): Promise<ExtensionRecord> {
    const response = await fetch(`${this.baseUrl}/extensions/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Install extension failed (${response.status}): ${text}`);
    }

    return response.json() as Promise<ExtensionRecord>;
  }

  /**
   * List all installed extensions.
   */
  async listExtensions(): Promise<ExtensionRecord[]> {
    const response = await fetch(`${this.baseUrl}/extensions`, {
      method: "GET",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`List extensions failed (${response.status}): ${text}`);
    }

    return response.json() as Promise<ExtensionRecord[]>;
  }

  /**
   * Uninstall an extension by ID.
   */
  async uninstallExtension(extensionId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/extensions/${encodeURIComponent(extensionId)}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Uninstall extension failed (${response.status}): ${text}`);
    }
  }
}
