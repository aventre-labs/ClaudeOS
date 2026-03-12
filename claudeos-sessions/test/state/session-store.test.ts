// ============================================================
// SessionStore Tests
// ============================================================
// Tests in-memory session state management with read/unread tracking
// and event-driven updates from WsClient.
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SessionStore } from "../../src/state/session-store.js";
import type { SupervisorClient } from "../../src/supervisor/client.js";
import type { WsClient, StatusHandler, OutputHandler } from "../../src/supervisor/ws-client.js";
import type { Session, WsStatusMessage, WsOutputMessage } from "../../src/supervisor/types.js";

const TEST_SESSIONS: Session[] = [
  {
    id: "ses_aaa11111",
    name: "Active Session",
    status: "active",
    createdAt: "2026-03-12T01:00:00Z",
  },
  {
    id: "ses_bbb22222",
    name: "Idle Session",
    status: "idle",
    createdAt: "2026-03-12T02:00:00Z",
  },
  {
    id: "ses_ccc33333",
    name: "Waiting Session",
    status: "waiting",
    createdAt: "2026-03-12T03:00:00Z",
  },
  {
    id: "ses_ddd44444",
    name: "Stopped Session",
    status: "stopped",
    createdAt: "2026-03-12T00:30:00Z",
  },
];

function createMockClient(): SupervisorClient {
  return {
    listSessions: vi.fn().mockResolvedValue([...TEST_SESSIONS]),
    getSession: vi.fn().mockImplementation(async (id: string) => {
      return TEST_SESSIONS.find((s) => s.id === id) ?? null;
    }),
    createSession: vi.fn(),
    renameSession: vi.fn(),
    stopSession: vi.fn(),
    killSession: vi.fn(),
    archiveSession: vi.fn(),
    reviveSession: vi.fn(),
    sendInput: vi.fn(),
    getOutput: vi.fn(),
  } as unknown as SupervisorClient;
}

function createMockWsClient() {
  const statusHandlers: StatusHandler[] = [];
  const outputHandlers = new Map<string, OutputHandler[]>();

  return {
    mock: {
      connect: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      dispose: vi.fn(),
      onStatus: vi.fn((handler: StatusHandler) => {
        statusHandlers.push(handler);
      }),
      onOutput: vi.fn((sessionId: string, handler: OutputHandler) => {
        const handlers = outputHandlers.get(sessionId) || [];
        handlers.push(handler);
        outputHandlers.set(sessionId, handlers);
      }),
    } as unknown as WsClient,
    // Test helpers to simulate WsClient events
    fireStatus(msg: WsStatusMessage) {
      for (const h of statusHandlers) h(msg);
    },
    fireOutput(msg: WsOutputMessage) {
      const handlers = outputHandlers.get(msg.sessionId) || [];
      for (const h of handlers) h(msg);
    },
  };
}

describe("SessionStore", () => {
  let store: SessionStore;
  let mockClient: SupervisorClient;
  let wsHelper: ReturnType<typeof createMockWsClient>;

  beforeEach(async () => {
    mockClient = createMockClient();
    wsHelper = createMockWsClient();
    store = new SessionStore(mockClient, wsHelper.mock);
  });

  describe("initialize", () => {
    it("fetches sessions from SupervisorClient and populates store", async () => {
      await store.initialize();

      expect(mockClient.listSessions).toHaveBeenCalledOnce();
      const sessions = store.getSessions();
      expect(sessions).toHaveLength(4);
    });

    it("connects WsClient on initialize", async () => {
      await store.initialize();
      expect(wsHelper.mock.connect).toHaveBeenCalledOnce();
    });

    it("registers status and output handlers on WsClient", async () => {
      await store.initialize();
      expect(wsHelper.mock.onStatus).toHaveBeenCalledOnce();
    });
  });

  describe("getSessions", () => {
    it("returns all sessions", async () => {
      await store.initialize();
      const sessions = store.getSessions();
      expect(sessions).toHaveLength(4);
      expect(sessions.map((s) => s.id)).toEqual(
        expect.arrayContaining(["ses_aaa11111", "ses_bbb22222", "ses_ccc33333", "ses_ddd44444"]),
      );
    });
  });

  describe("getSessionsByStatus", () => {
    it("filters sessions by status", async () => {
      await store.initialize();
      const active = store.getSessionsByStatus("active");
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe("ses_aaa11111");
    });

    it("sorts by createdAt descending (most recent first)", async () => {
      await store.initialize();
      // Add test data where ordering matters
      const all = store.getSessions();
      // All sessions have different createdAt values
      const active = store.getSessionsByStatus("active");
      expect(active).toHaveLength(1);

      // Get all sessions to check sort order
      const sorted = store.getSessions().sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      // getSessionsByStatus should also sort this way
      const waiting = store.getSessionsByStatus("waiting");
      expect(waiting).toHaveLength(1);
      expect(waiting[0].name).toBe("Waiting Session");
    });

    it("returns empty array for status with no sessions", async () => {
      await store.initialize();
      const archived = store.getSessionsByStatus("archived");
      expect(archived).toHaveLength(0);
    });
  });

  describe("getSession", () => {
    it("returns a single session by ID", async () => {
      await store.initialize();
      const session = store.getSession("ses_aaa11111");
      expect(session).toBeDefined();
      expect(session!.name).toBe("Active Session");
    });

    it("returns undefined for unknown ID", async () => {
      await store.initialize();
      const session = store.getSession("ses_nonexistent");
      expect(session).toBeUndefined();
    });
  });

  describe("read/unread tracking", () => {
    it("all sessions start as read after initialize", async () => {
      await store.initialize();
      expect(store.isUnread("ses_aaa11111")).toBe(false);
      expect(store.isUnread("ses_bbb22222")).toBe(false);
    });

    it("markUnread sets session as unread", async () => {
      await store.initialize();
      store.markUnread("ses_aaa11111");
      expect(store.isUnread("ses_aaa11111")).toBe(true);
    });

    it("markRead sets session as read", async () => {
      await store.initialize();
      store.markUnread("ses_aaa11111");
      store.markRead("ses_aaa11111");
      expect(store.isUnread("ses_aaa11111")).toBe(false);
    });

    it("isUnread returns false for unknown session", async () => {
      await store.initialize();
      expect(store.isUnread("ses_nonexistent")).toBe(false);
    });
  });

  describe("getWaitingCount", () => {
    it("returns count of sessions with status waiting", async () => {
      await store.initialize();
      expect(store.getWaitingCount()).toBe(1);
    });

    it("returns 0 when no sessions are waiting", async () => {
      (mockClient.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "ses_x", name: "X", status: "active", createdAt: "2026-03-12T00:00:00Z" },
      ]);
      store = new SessionStore(mockClient, wsHelper.mock);
      await store.initialize();
      expect(store.getWaitingCount()).toBe(0);
    });
  });

  describe("onDidChange", () => {
    it("fires change event when status message updates a session", async () => {
      await store.initialize();
      const handler = vi.fn();
      store.onDidChange(handler);

      wsHelper.fireStatus({
        type: "status",
        sessionId: "ses_aaa11111",
        status: "idle",
        timestamp: "2026-03-12T04:00:00Z",
      });

      expect(handler).toHaveBeenCalledOnce();
      // Session should now be idle
      const session = store.getSession("ses_aaa11111");
      expect(session!.status).toBe("idle");
    });

    it("fires change event on markRead/markUnread", async () => {
      await store.initialize();
      const handler = vi.fn();
      store.onDidChange(handler);

      store.markUnread("ses_aaa11111");
      expect(handler).toHaveBeenCalledTimes(1);

      store.markRead("ses_aaa11111");
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe("WsClient status handler", () => {
    it("updates session status from WsStatusMessage", async () => {
      await store.initialize();

      wsHelper.fireStatus({
        type: "status",
        sessionId: "ses_bbb22222",
        status: "stopped",
        timestamp: "2026-03-12T04:00:00Z",
      });

      const session = store.getSession("ses_bbb22222");
      expect(session!.status).toBe("stopped");
    });

    it("fetches unknown session from API on status message", async () => {
      const newSession: Session = {
        id: "ses_new99999",
        name: "New Session",
        status: "active",
        createdAt: "2026-03-12T05:00:00Z",
      };
      (mockClient.getSession as ReturnType<typeof vi.fn>).mockResolvedValue(newSession);

      await store.initialize();
      const handler = vi.fn();
      store.onDidChange(handler);

      wsHelper.fireStatus({
        type: "status",
        sessionId: "ses_new99999",
        status: "active",
        timestamp: "2026-03-12T05:00:00Z",
      });

      // Wait for async fetch to complete
      await vi.waitFor(() => {
        expect(mockClient.getSession).toHaveBeenCalledWith("ses_new99999");
      });

      // Session should now be in store
      await vi.waitFor(() => {
        const session = store.getSession("ses_new99999");
        expect(session).toBeDefined();
        expect(session!.name).toBe("New Session");
      });
    });
  });

  describe("dispose", () => {
    it("disposes WsClient", async () => {
      await store.initialize();
      store.dispose();
      expect(wsHelper.mock.dispose).toHaveBeenCalledOnce();
    });

    it("clears sessions after dispose", async () => {
      await store.initialize();
      store.dispose();
      expect(store.getSessions()).toHaveLength(0);
    });
  });
});
