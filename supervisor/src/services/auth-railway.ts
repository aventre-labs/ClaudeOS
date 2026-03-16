// ============================================================
// ClaudeOS Supervisor - Railway Auth Service
// ============================================================
// Manages Railway CLI login via `railway login --browserless`.
// Spawns subprocess, parses stdout for pairing code + URL,
// notifies on completion, extracts and stores token.
// ============================================================

import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SecretStore } from "./secret-store.js";

interface RailwayLoginCallbacks {
  onPairingInfo: (info: { pairingCode: string; url: string }) => void;
  onComplete: (result: { success: boolean; error?: string }) => void;
}

export class RailwayAuthService {
  private process: ChildProcess | null = null;

  isRunning(): boolean {
    return this.process !== null;
  }

  startLogin(callbacks: RailwayLoginCallbacks): void {
    if (this.process) {
      throw new Error("Railway login already running");
    }

    // Use `script` to allocate a pseudo-TTY — the Railway CLI refuses to run
    // `login --browserless` without a TTY even though no interaction is needed.
    const proc = spawn("script", ["-qc", "railway login --browserless", "/dev/null"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    this.process = proc;

    let stderr = "";
    let pairingInfoSent = false;

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();

      if (!pairingInfoSent) {
        const urlMatch = text.match(/https:\/\/railway\.com\/cli-login\S*/);
        const codeMatch = text.match(/\b(\w+-\w+-\w+(?:-\w+)?)\b/);

        if (urlMatch && codeMatch) {
          pairingInfoSent = true;
          callbacks.onPairingInfo({
            pairingCode: codeMatch[1],
            url: urlMatch[0],
          });
        }
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("exit", (code) => {
      this.process = null;
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
      if (err.code === "ENOENT") {
        callbacks.onComplete({
          success: false,
          error:
            "Railway CLI not installed. Install with: npm install -g @railway/cli",
        });
      } else {
        callbacks.onComplete({ success: false, error: err.message });
      }
    });
  }

  cancel(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  extractToken(): string | null {
    const configPath = join(
      process.env.HOME || "/root",
      ".railway",
      "config.json",
    );
    if (!existsSync(configPath)) return null;
    try {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      return config.user?.token ?? null;
    } catch {
      return null;
    }
  }

  async storeToken(secretStore: SecretStore): Promise<boolean> {
    const token = this.extractToken();
    if (!token) return false;
    await secretStore.set("railway-token", token, "auth", ["railway"]);
    return true;
  }
}
