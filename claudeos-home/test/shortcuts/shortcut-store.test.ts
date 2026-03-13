// ============================================================
// ShortcutStore Tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShortcutStore } from "../../src/shortcuts/shortcut-store.js";
import type { Shortcut } from "../../src/types.js";

function createMockContext() {
  const store = new Map<string, unknown>();
  return {
    globalState: {
      get: vi.fn((key: string) => store.get(key)),
      update: vi.fn((key: string, value: unknown) => {
        store.set(key, value);
        return Promise.resolve();
      }),
    },
  };
}

describe("ShortcutStore", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let store: ShortcutStore;

  beforeEach(() => {
    ctx = createMockContext();
    store = new ShortcutStore(ctx);
  });

  describe("getShortcuts()", () => {
    it("returns default shortcuts on first use", () => {
      const shortcuts = store.getShortcuts();
      expect(shortcuts).toHaveLength(5);
      expect(shortcuts[0].label).toBe("New Session");
      expect(shortcuts[0].command).toBe("claudeos.sessions.create");
      expect(shortcuts[1].label).toBe("Open Home");
      expect(shortcuts[2].label).toBe("Refresh Sessions");
      expect(shortcuts[3].label).toBe("Open Secrets");
      expect(shortcuts[4].label).toBe("Open Terminal");
    });

    it("returns stored shortcuts when they exist", () => {
      const custom: Shortcut[] = [
        { id: "custom-1", label: "Custom", command: "custom.cmd", icon: "star" },
      ];
      ctx.globalState.get.mockReturnValueOnce(custom);
      store = new ShortcutStore(ctx);
      const shortcuts = store.getShortcuts();
      expect(shortcuts).toEqual(custom);
    });
  });

  describe("addShortcut()", () => {
    it("persists via globalState.update", () => {
      const newShortcut: Shortcut = {
        id: "test-1",
        label: "Test",
        command: "test.cmd",
        icon: "star",
      };
      store.addShortcut(newShortcut);
      expect(ctx.globalState.update).toHaveBeenCalledWith(
        "claudeos.home.shortcuts",
        expect.arrayContaining([expect.objectContaining({ id: "test-1" })]),
      );
    });
  });

  describe("removeShortcut()", () => {
    it("removes by id and persists", () => {
      // First get defaults (which will be 5 shortcuts)
      const defaults = store.getShortcuts();
      const removeId = defaults[0].id;
      store.removeShortcut(removeId);
      expect(ctx.globalState.update).toHaveBeenCalledWith(
        "claudeos.home.shortcuts",
        expect.not.arrayContaining([expect.objectContaining({ id: removeId })]),
      );
    });
  });

  describe("reorderShortcuts()", () => {
    it("updates order and persists", () => {
      const defaults = store.getShortcuts();
      const reversedIds = defaults.map((s) => s.id).reverse();
      store.reorderShortcuts(reversedIds);
      expect(ctx.globalState.update).toHaveBeenCalledWith(
        "claudeos.home.shortcuts",
        expect.any(Array),
      );
      // Verify the persisted array has reversed order
      const persistedArg = (ctx.globalState.update as any).mock.calls.at(-1)?.[1] as Shortcut[];
      expect(persistedArg[0].id).toBe(defaults[defaults.length - 1].id);
      expect(persistedArg[persistedArg.length - 1].id).toBe(defaults[0].id);
    });
  });
});
