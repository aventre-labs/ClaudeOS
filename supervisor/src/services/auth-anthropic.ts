// ============================================================
// ClaudeOS Supervisor - Anthropic Auth Service
// ============================================================
// Manages Anthropic authentication via API key validation
// and `claude auth login` subprocess flow. Validates API keys
// via HTTP without consuming credits, stores in SecretStore.
// ============================================================

import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
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

  /**
   * Resolve the claude binary path. Checks well-known install locations
   * before falling back to PATH lookup via `which`.
   */
  private static resolveClaudeBinary(): string | null {
    const home = process.env.HOME || "/home/app";
    const candidates = [
      join(home, ".local", "bin", "claude"),
      join(home, ".claude", "bin", "claude"),
      "/usr/local/bin/claude",
    ];
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
    // Fallback: try PATH resolution
    try {
      return execSync("which claude", { encoding: "utf-8" }).trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Start `claude auth login`. The CLI outputs an OAuth URL, then polls
   * for completion. When the user authorizes in the browser, the CLI
   * detects it and exits with code 0.
   */
  startClaudeLogin(callbacks: ClaudeLoginCallbacks): void {
    if (this.process) {
      throw new Error("Claude login already running");
    }

    const claudeBin = AnthropicAuthService.resolveClaudeBinary();
    if (!claudeBin) {
      callbacks.onComplete({
        success: false,
        fallbackToApiKey: true,
        error: "Claude CLI not installed. Use API key method.",
      });
      return;
    }

    // Spawn directly — no PTY wrapper needed. The CLI outputs the URL
    // to stdout and polls for auth completion automatically.
    const proc = spawn(claudeBin, ["auth", "login"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, BROWSER: "echo" },
    });

    this.process = proc;

    let urlCaptured = false;
    let stderr = "";
    let stdout = "";

    const checkForUrl = (text: string) => {
      if (urlCaptured) return;
      // Strip ANSI escape codes
      const clean = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
      const urlMatch = clean.match(/https:\/\/claude\.ai\/oauth\/\S+/);
      if (urlMatch) {
        urlCaptured = true;
        callbacks.onLoginUrl(urlMatch[0]);
      }
    };

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      checkForUrl(text);
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      checkForUrl(text);
    });

    proc.on("exit", (code) => {
      this.process = null;
      if (code === 0) {
        callbacks.onComplete({ success: true });
      } else {
        callbacks.onComplete({
          success: false,
          error: stderr || stdout || `Exit code ${code}`,
        });
      }
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      this.process = null;
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
  }

  cancel(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  isRunning(): boolean {
    return this.process !== null;
  }
}
