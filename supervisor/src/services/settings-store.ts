// ============================================================
// ClaudeOS Supervisor - Settings Store
// ============================================================
// Supervisor settings persistence to /data/config/settings.json.
// Supports read and partial update with deep merge.
// ============================================================

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { join, dirname } from "node:path";
import type { SupervisorSettings } from "../types.js";

const DEFAULT_SETTINGS: SupervisorSettings = {
  reloadBehavior: "force",
  logLevel: "info",
  sessionDefaults: {},
};

export class SettingsStore {
  private readonly settingsPath: string;
  private settings: SupervisorSettings;

  constructor(dataDir: string) {
    this.settingsPath = join(dataDir, "config", "settings.json");
    mkdirSync(dirname(this.settingsPath), { recursive: true });

    if (existsSync(this.settingsPath)) {
      const data = JSON.parse(readFileSync(this.settingsPath, "utf-8"));
      this.settings = { ...DEFAULT_SETTINGS, ...data };
    } else {
      this.settings = { ...DEFAULT_SETTINGS };
      this.persistToDisk();
    }
  }

  /**
   * Persist settings to disk atomically.
   */
  private persistToDisk(): void {
    const tmpPath = this.settingsPath + ".tmp";
    writeFileSync(tmpPath, JSON.stringify(this.settings, null, 2));
    renameSync(tmpPath, this.settingsPath);
  }

  /**
   * Get current settings.
   */
  get(): SupervisorSettings {
    return { ...this.settings };
  }

  /**
   * Deep merge partial settings and persist.
   */
  update(partial: Partial<SupervisorSettings>): SupervisorSettings {
    // Shallow merge top-level, deep merge nested objects
    if (partial.reloadBehavior !== undefined) {
      this.settings.reloadBehavior = partial.reloadBehavior;
    }
    if (partial.logLevel !== undefined) {
      this.settings.logLevel = partial.logLevel;
    }
    if (partial.sessionDefaults !== undefined) {
      this.settings.sessionDefaults = {
        ...this.settings.sessionDefaults,
        ...partial.sessionDefaults,
      };
    }

    this.persistToDisk();
    return this.get();
  }
}
