// ============================================================
// ClaudeOS Supervisor - Anthropic Auth Service
// ============================================================
// Manages Anthropic authentication via API key validation
// and `claude login` subprocess flow. Validates API keys via
// HTTP without consuming credits, stores in SecretStore.
// ============================================================

import { spawn, type ChildProcess } from "node:child_process";
import type { SecretStore } from "./secret-store.js";

interface ClaudeLoginCallbacks {
  onLoginUrl: (url: string) => void;
  onComplete: (result: {
    success: boolean;
    error?: string;
    fallbackToApiKey?: boolean;
  }) => void;
}

export class AnthropicAuthService {
  private process: ChildProcess | null = null;
  private urlTimeout: ReturnType<typeof setTimeout> | null = null;

  async validateApiKey(
    apiKey: string,
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });

      if (response.status === 401) {
        return { valid: false, error: "Invalid API key" };
      }

      // Any non-401 response means the key authenticated
      // (200 = success, 400 = bad request, 429 = rate limited)
      return { valid: true };
    } catch (err) {
      return {
        valid: false,
        error: `Network error: ${(err as Error).message}`,
      };
    }
  }

  async storeApiKey(apiKey: string, secretStore: SecretStore): Promise<void> {
    await secretStore.set("anthropic-api-key", apiKey, "auth", ["anthropic"]);
  }

  startClaudeLogin(callbacks: ClaudeLoginCallbacks): void {
    if (this.process) {
      throw new Error("Claude login already running");
    }

    const proc = spawn("claude", ["login"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    this.process = proc;

    let urlCaptured = false;
    let stderr = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      const urlMatch = text.match(/https:\/\/\S+/);

      if (urlMatch && !urlCaptured) {
        urlCaptured = true;
        this.clearUrlTimeout();
        callbacks.onLoginUrl(urlMatch[0]);
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("exit", (code) => {
      this.process = null;
      this.clearUrlTimeout();
      if (code === 0) {
        callbacks.onComplete({ success: true });
      } else {
        callbacks.onComplete({
          success: false,
          error: stderr || `Exit code ${code}`,
        });
      }
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      this.process = null;
      this.clearUrlTimeout();
      if (err.code === "ENOENT") {
        callbacks.onComplete({
          success: false,
          fallbackToApiKey: true,
          error: "Claude CLI not installed. Use API key method.",
        });
      } else {
        callbacks.onComplete({
          success: false,
          error: err.message,
        });
      }
    });

    // Set timeout: if no URL captured within 10 seconds, suggest fallback
    this.urlTimeout = setTimeout(() => {
      if (!urlCaptured && this.process) {
        callbacks.onComplete({
          success: false,
          fallbackToApiKey: true,
          error: "Could not capture login URL. Use API key instead.",
        });
      }
    }, 10_000);
  }

  cancel(): void {
    this.clearUrlTimeout();
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  isRunning(): boolean {
    return this.process !== null;
  }

  private clearUrlTimeout(): void {
    if (this.urlTimeout) {
      clearTimeout(this.urlTimeout);
      this.urlTimeout = null;
    }
  }
}
