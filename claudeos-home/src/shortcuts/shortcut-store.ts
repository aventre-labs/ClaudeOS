// ============================================================
// ClaudeOS Home Extension - Shortcut Store
// ============================================================
// Persists customizable shortcuts in context.globalState under
// key "claudeos.home.shortcuts". Provides defaults on first use.
// ============================================================

import type * as vscode from "vscode";
import type { Shortcut } from "../types.js";

const STORAGE_KEY = "claudeos.home.shortcuts";

const DEFAULT_SHORTCUTS: Shortcut[] = [
  {
    id: "new-session",
    label: "New Session",
    command: "claudeos.sessions.create",
    icon: "add",
  },
  {
    id: "open-home",
    label: "Open Home",
    command: "claudeos.home.open",
    icon: "home",
  },
  {
    id: "refresh-sessions",
    label: "Refresh Sessions",
    command: "claudeos.sessions.refresh",
    icon: "refresh",
  },
  {
    id: "open-secrets",
    label: "Open Secrets",
    command: "claudeos.secrets.openEditor",
    icon: "key",
  },
  {
    id: "open-terminal",
    label: "Open Terminal",
    command: "workbench.action.terminal.toggleTerminal",
    icon: "terminal",
  },
];

export class ShortcutStore {
  private context: vscode.ExtensionContext;
  private shortcuts: Shortcut[];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    const stored = context.globalState.get<Shortcut[]>(STORAGE_KEY);
    this.shortcuts = stored ?? [...DEFAULT_SHORTCUTS];
  }

  /**
   * Get all shortcuts. Returns defaults if none stored.
   */
  getShortcuts(): Shortcut[] {
    return [...this.shortcuts];
  }

  /**
   * Add a shortcut and persist.
   */
  addShortcut(shortcut: Shortcut): void {
    this.shortcuts.push(shortcut);
    this.persist();
  }

  /**
   * Remove a shortcut by ID and persist.
   */
  removeShortcut(id: string): void {
    this.shortcuts = this.shortcuts.filter((s) => s.id !== id);
    this.persist();
  }

  /**
   * Reorder shortcuts by a given array of IDs.
   */
  reorderShortcuts(ids: string[]): void {
    const byId = new Map(this.shortcuts.map((s) => [s.id, s]));
    const reordered: Shortcut[] = [];
    for (const id of ids) {
      const s = byId.get(id);
      if (s) {
        reordered.push(s);
      }
    }
    this.shortcuts = reordered;
    this.persist();
  }

  private persist(): void {
    this.context.globalState.update(STORAGE_KEY, this.shortcuts);
  }
}
