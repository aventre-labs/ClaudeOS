// ============================================================
// ClaudeOS Supervisor - TmuxService
// ============================================================
// Thin wrapper around tmux CLI for session management.
// Uses execFile (not exec) to avoid shell injection.
// ============================================================

import { execFile } from "node:child_process";

const SESSION_PREFIX = "claudeos_";

/**
 * Run a tmux command and return stdout.
 * Wraps execFile in a promise (without util.promisify to keep mockability clean).
 */
function tmuxExec(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("tmux", args, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

export interface ITmuxService {
  createSession(id: string, command: string, workdir?: string): Promise<void>;
  setSessionHooks(id: string, port?: number): Promise<void>;
  enableOutputPipe(id: string, sessionsDir: string): Promise<void>;
  sendKeys(id: string, text: string): Promise<void>;
  capturePane(id: string, scrollback?: boolean): Promise<string>;
  killSession(id: string): Promise<string>;
  stopSession(id: string): Promise<void>;
  listSessions(): Promise<string[]>;
  hasSession(id: string): Promise<boolean>;
  setEnvironment(key: string, value: string): Promise<void>;
}

/**
 * No-op TmuxService for dry-run / testing mode.
 * Returns empty/default values without spawning tmux.
 */
export class DryRunTmuxService implements ITmuxService {
  async createSession(): Promise<void> {}
  async setSessionHooks(): Promise<void> {}
  async enableOutputPipe(): Promise<void> {}
  async sendKeys(): Promise<void> {}
  async capturePane(): Promise<string> { return ""; }
  async killSession(): Promise<string> { return ""; }
  async stopSession(): Promise<void> {}
  async listSessions(): Promise<string[]> { return []; }
  async hasSession(): Promise<boolean> { return false; }
  async setEnvironment(): Promise<void> {}
}

export class TmuxService implements ITmuxService {
  private prefix(id: string): string {
    return `${SESSION_PREFIX}${id}`;
  }

  /**
   * Create a new tmux session with the command as the initial process.
   * Avoids send-keys race condition by passing command directly.
   */
  async createSession(
    id: string,
    command: string,
    workdir?: string,
  ): Promise<void> {
    const args = [
      "new-session",
      "-d",
      "-s",
      this.prefix(id),
      "-x",
      "200",
      "-y",
      "50",
    ];
    if (workdir) {
      args.push("-c", workdir);
    }
    args.push(command);
    await tmuxExec(args);
  }

  /**
   * Set tmux hooks for event-driven status detection.
   * Sets pane-exited hook to POST to internal session-event endpoint.
   */
  async setSessionHooks(id: string, port: number = 3100): Promise<void> {
    const hookCmd = `run-shell "curl -s -X POST http://localhost:${port}/internal/session-event -H 'Content-Type: application/json' -d '{\\\"sessionId\\\":\\\"${id}\\\",\\\"event\\\":\\\"exited\\\"}'"`;
    await tmuxExec([
      "set-hook",
      "-t",
      this.prefix(id),
      "pane-exited",
      hookCmd,
    ]);
  }

  /**
   * Enable output piping for real-time streaming.
   * Pipes pane output to a live-output file.
   */
  async enableOutputPipe(id: string, sessionsDir: string): Promise<void> {
    await tmuxExec([
      "pipe-pane",
      "-t",
      this.prefix(id),
      `cat >> ${sessionsDir}/${id}/live-output`,
    ]);
  }

  /**
   * Send text to a session followed by Enter.
   */
  async sendKeys(id: string, text: string): Promise<void> {
    await tmuxExec([
      "send-keys",
      "-t",
      this.prefix(id),
      text,
      "Enter",
    ]);
  }

  /**
   * Capture visible pane content, optionally with scrollback.
   */
  async capturePane(id: string, scrollback?: boolean): Promise<string> {
    const args = ["capture-pane", "-t", this.prefix(id), "-p"];
    if (scrollback) {
      args.push("-S", "-1000");
    }
    return tmuxExec(args);
  }

  /**
   * Kill a session. ALWAYS captures full scrollback before destroying.
   * Returns the captured scrollback text.
   */
  async killSession(id: string): Promise<string> {
    // Capture scrollback BEFORE killing (locked decision)
    const scrollback = await this.capturePane(id, true);
    await tmuxExec(["kill-session", "-t", this.prefix(id)]);
    return scrollback;
  }

  /**
   * Stop a session by sending Ctrl+C.
   */
  async stopSession(id: string): Promise<void> {
    await tmuxExec([
      "send-keys",
      "-t",
      this.prefix(id),
      "C-c",
      "",
    ]);
  }

  /**
   * List all ClaudeOS session IDs (strips the claudeos_ prefix).
   */
  async listSessions(): Promise<string[]> {
    try {
      const stdout = await tmuxExec([
        "list-sessions",
        "-F",
        "#{session_name}",
      ]);
      return stdout
        .trim()
        .split("\n")
        .filter((name) => name.startsWith(SESSION_PREFIX))
        .map((name) => name.slice(SESSION_PREFIX.length));
    } catch {
      // tmux returns error when no server is running
      return [];
    }
  }

  /**
   * Check if a tmux session exists.
   */
  async hasSession(id: string): Promise<boolean> {
    try {
      await tmuxExec(["has-session", "-t", this.prefix(id)]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set a global tmux environment variable.
   * Used to inject secrets (e.g., API keys) into all tmux sessions.
   */
  async setEnvironment(key: string, value: string): Promise<void> {
    await tmuxExec(["set-environment", "-g", key, value]);
  }
}
