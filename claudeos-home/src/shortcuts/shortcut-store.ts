// ============================================================
// ClaudeOS Home Extension - Shortcut Store
// ============================================================
// Stub: implementation pending TDD GREEN phase.
// ============================================================

import type { Shortcut } from "../types.js";

export class ShortcutStore {
  constructor(_context: any) {}

  getShortcuts(): Shortcut[] {
    throw new Error("Not implemented");
  }

  addShortcut(_shortcut: Shortcut): void {
    throw new Error("Not implemented");
  }

  removeShortcut(_id: string): void {
    throw new Error("Not implemented");
  }

  reorderShortcuts(_ids: string[]): void {
    throw new Error("Not implemented");
  }
}
