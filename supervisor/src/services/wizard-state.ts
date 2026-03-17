// ============================================================
// ClaudeOS Supervisor - Wizard State Service
// ============================================================
// Tracks setup wizard progress with atomic file persistence.
// State survives container restarts by persisting to JSON.
// Follows SecretStore pattern: atomic tmp+rename writes with
// serialized write queue to prevent corruption.
// ============================================================

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { dirname } from "node:path";
import type { WizardState } from "../types.js";

function createDefaultState(): WizardState {
  return {
    status: "incomplete",
    steps: {
      railway: { completed: false },
      anthropic: { completed: false },
    },
    startedAt: new Date().toISOString(),
  };
}

export class WizardStateService {
  private state: WizardState;
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();
  private completionInProgress = false;

  constructor(filePath: string) {
    this.filePath = filePath;

    // Ensure directory exists
    mkdirSync(dirname(this.filePath), { recursive: true });

    // Load existing state or create default
    if (existsSync(this.filePath)) {
      try {
        const raw = readFileSync(this.filePath, "utf-8");
        const loaded = JSON.parse(raw) as WizardState;
        if (loaded.status === "completed") {
          // Fully completed wizard — trust persisted state
          this.state = loaded;
        } else {
          // Incomplete wizard — reset to default. Partial step completions
          // are meaningless after a container restart because ephemeral
          // credentials (Railway config, Claude CLI auth) don't survive.
          this.state = createDefaultState();
        }
      } catch {
        // Corrupted file — fall back to default
        this.state = createDefaultState();
      }
    } else {
      this.state = createDefaultState();
    }

    // Persist initial state (ensures file exists for new/corrupted cases)
    this.persistSync();
  }

  /**
   * Static factory method.
   */
  static create(filePath: string): WizardStateService {
    return new WizardStateService(filePath);
  }

  /**
   * Get the current wizard state.
   */
  getState(): WizardState {
    return { ...this.state, steps: { ...this.state.steps } };
  }

  /**
   * Check if the wizard has been completed.
   */
  isCompleted(): boolean {
    return this.state.status === "completed";
  }

  /**
   * Mark the Railway step as completed.
   */
  async completeRailwayStep(tokenStored: boolean): Promise<void> {
    this.state.steps.railway = {
      completed: true,
      completedAt: new Date().toISOString(),
      tokenStored,
    };
    await this.persist();
  }

  /**
   * Mark the Anthropic step as completed.
   */
  async completeAnthropicStep(
    method: "api-key" | "claude-login",
  ): Promise<void> {
    this.state.steps.anthropic = {
      completed: true,
      completedAt: new Date().toISOString(),
      method,
    };
    await this.persist();
  }

  /**
   * Mark the entire wizard as completed.
   * Requires all steps to be completed first.
   * Uses in-memory mutex to prevent concurrent completion.
   */
  async complete(): Promise<void> {
    if (this.completionInProgress) {
      throw new Error("Wizard completion already in progress");
    }

    if (this.state.status === "completed") {
      // Already completed — idempotent
      return;
    }

    if (
      !this.state.steps.railway.completed ||
      !this.state.steps.anthropic.completed
    ) {
      throw new Error(
        "Cannot complete wizard: not all steps are completed",
      );
    }

    this.completionInProgress = true;
    try {
      this.state.status = "completed";
      this.state.completedAt = new Date().toISOString();
      await this.persist();
    } finally {
      this.completionInProgress = false;
    }
  }

  /**
   * Persist state to disk atomically (write to temp, then rename).
   * Uses serialized write queue to prevent corruption on concurrent access.
   */
  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => {
      const tmpPath = this.filePath + ".tmp";
      writeFileSync(tmpPath, JSON.stringify(this.state, null, 2));
      renameSync(tmpPath, this.filePath);
    });
    return this.writeQueue;
  }

  /**
   * Synchronous persist for constructor use only.
   */
  private persistSync(): void {
    const tmpPath = this.filePath + ".tmp";
    writeFileSync(tmpPath, JSON.stringify(this.state, null, 2));
    renameSync(tmpPath, this.filePath);
  }
}
