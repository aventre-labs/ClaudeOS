// ============================================================
// Tests for SessionTreeProvider
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  EventEmitter,
  TreeItemCollapsibleState,
  ThemeIcon,
  window,
} from "vscode";
import { SessionTreeProvider } from "../../src/sidebar/session-tree.js";
import type { Session, SessionStatus } from "../../src/supervisor/types.js";

// --- Mock SessionStore ---

function createMockStore(sessions: Session[] = []) {
  const changeEmitter = new EventEmitter<void>();

  const store = {
    getSessionsByStatus: vi.fn((status: SessionStatus) =>
      sessions
        .filter((s) => s.status === status)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    ),
    isUnread: vi.fn((_id: string) => false),
    getWaitingCount: vi.fn(
      () => sessions.filter((s) => s.status === "waiting").length,
    ),
    onDidChange: changeEmitter.event,
    _changeEmitter: changeEmitter,
  };
  return store;
}

// --- Helpers ---

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: `ses_${Math.random().toString(36).slice(2, 10)}`,
    name: "Test Session",
    status: "active",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// --- Tests ---

describe("SessionTreeProvider", () => {
  let store: ReturnType<typeof createMockStore>;
  let provider: SessionTreeProvider;

  describe("getChildren - root level", () => {
    it("returns group elements for statuses that have sessions", () => {
      const sessions = [
        makeSession({ status: "active" }),
        makeSession({ status: "waiting" }),
      ];
      store = createMockStore(sessions);
      provider = new SessionTreeProvider(store as any);

      const children = provider.getChildren(undefined);
      expect(children).toHaveLength(2);
      expect(children[0]).toEqual({ type: "group", status: "active" });
      expect(children[1]).toEqual({ type: "group", status: "waiting" });
    });

    it("returns groups in correct status order", () => {
      const sessions = [
        makeSession({ status: "zombie" }),
        makeSession({ status: "active" }),
        makeSession({ status: "stopped" }),
        makeSession({ status: "idle" }),
      ];
      store = createMockStore(sessions);
      provider = new SessionTreeProvider(store as any);

      const children = provider.getChildren(undefined);
      const statuses = children.map((c: any) => c.status);
      expect(statuses).toEqual(["active", "idle", "stopped", "zombie"]);
    });

    it("omits groups with zero sessions", () => {
      const sessions = [makeSession({ status: "idle" })];
      store = createMockStore(sessions);
      provider = new SessionTreeProvider(store as any);

      const children = provider.getChildren(undefined);
      expect(children).toHaveLength(1);
      expect(children[0]).toEqual({ type: "group", status: "idle" });
    });

    it("returns empty array when no sessions exist", () => {
      store = createMockStore([]);
      provider = new SessionTreeProvider(store as any);

      const children = provider.getChildren(undefined);
      expect(children).toHaveLength(0);
    });
  });

  describe("getChildren - group level", () => {
    it("returns session elements for a group", () => {
      const s1 = makeSession({
        id: "ses_a",
        status: "active",
        createdAt: "2026-03-12T01:00:00Z",
      });
      const s2 = makeSession({
        id: "ses_b",
        status: "active",
        createdAt: "2026-03-12T02:00:00Z",
      });
      store = createMockStore([s1, s2]);
      provider = new SessionTreeProvider(store as any);

      const children = provider.getChildren({
        type: "group",
        status: "active",
      });
      expect(children).toHaveLength(2);
      // Most recent first (s2 before s1)
      expect(children[0]).toEqual({ type: "session", session: s2 });
      expect(children[1]).toEqual({ type: "session", session: s1 });
    });

    it("returns empty for session elements (no children)", () => {
      const s = makeSession();
      store = createMockStore([s]);
      provider = new SessionTreeProvider(store as any);

      const children = provider.getChildren({ type: "session", session: s });
      expect(children).toHaveLength(0);
    });
  });

  describe("getTreeItem", () => {
    it("returns correct TreeItem for group element", () => {
      const sessions = [
        makeSession({ status: "active" }),
        makeSession({ status: "active" }),
      ];
      store = createMockStore(sessions);
      provider = new SessionTreeProvider(store as any);

      const item = provider.getTreeItem({ type: "group", status: "active" });
      expect(item.label).toBe("Active");
      expect(item.collapsibleState).toBe(TreeItemCollapsibleState.Expanded);
      expect(item.description).toBe("(2)");
    });

    it("returns correct TreeItem for session element", () => {
      const session = makeSession({
        name: "My Session",
        status: "waiting",
      });
      store = createMockStore([session]);
      store.isUnread.mockReturnValue(true);
      provider = new SessionTreeProvider(store as any);

      const item = provider.getTreeItem({
        type: "session",
        session,
      });
      expect(item.iconPath).toBeInstanceOf(ThemeIcon);
      expect((item.iconPath as ThemeIcon).id).toBe("question");
      expect(item.contextValue).toBe("session.waiting");
      // Check label highlights for unread
      const label = item.label as { label: string; highlights?: [number, number][] };
      expect(label.highlights).toEqual([[0, "My Session".length]]);
    });
  });

  describe("refresh and events", () => {
    it("fires onDidChangeTreeData when refresh is called", () => {
      store = createMockStore([]);
      provider = new SessionTreeProvider(store as any);

      const listener = vi.fn();
      provider.onDidChangeTreeData(listener);

      provider.refresh();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("refreshes when store fires onDidChange", () => {
      store = createMockStore([]);
      provider = new SessionTreeProvider(store as any);

      const listener = vi.fn();
      provider.onDidChangeTreeData(listener);

      // Simulate store change
      store._changeEmitter.fire();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("badge", () => {
    it("updates badge to waiting count when setTreeView is called", () => {
      const sessions = [
        makeSession({ status: "waiting" }),
        makeSession({ status: "waiting" }),
        makeSession({ status: "active" }),
      ];
      store = createMockStore(sessions);
      provider = new SessionTreeProvider(store as any);

      const mockTreeView = {
        badge: undefined as any,
        onDidChangeVisibility: new EventEmitter<void>().event,
        dispose: vi.fn(),
      };

      provider.setTreeView(mockTreeView as any);
      expect(mockTreeView.badge).toEqual({
        value: 2,
        tooltip: "sessions waiting for input",
      });
    });

    it("sets badge to undefined when no waiting sessions", () => {
      const sessions = [makeSession({ status: "active" })];
      store = createMockStore(sessions);
      provider = new SessionTreeProvider(store as any);

      const mockTreeView = {
        badge: { value: 5, tooltip: "old" },
        onDidChangeVisibility: new EventEmitter<void>().event,
        dispose: vi.fn(),
      };

      provider.setTreeView(mockTreeView as any);
      expect(mockTreeView.badge).toBeUndefined();
    });

    it("updates badge on refresh when treeView is set", () => {
      const sessions = [makeSession({ status: "waiting" })];
      store = createMockStore(sessions);
      provider = new SessionTreeProvider(store as any);

      const mockTreeView = {
        badge: undefined as any,
        onDidChangeVisibility: new EventEmitter<void>().event,
        dispose: vi.fn(),
      };

      provider.setTreeView(mockTreeView as any);
      expect(mockTreeView.badge).toBeDefined();

      // Change waiting count to 0
      store.getWaitingCount.mockReturnValue(0);
      provider.refresh();
      expect(mockTreeView.badge).toBeUndefined();
    });
  });
});
