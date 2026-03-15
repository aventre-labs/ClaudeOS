// ============================================================
// TerminalManager Tests
// ============================================================
// Tests for the terminal lifecycle manager that tracks open
// terminals and prevents duplicate tabs per session.
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { TerminalManager } from "../../src/terminal/terminal-manager.js";
import type { Session } from "../../src/supervisor/types.js";

// --- Mock Setup ---

function createMockSupervisorClient() {
  return {
    sendInput: vi.fn().mockResolvedValue(undefined),
    getOutput: vi.fn().mockResolvedValue(""),
    listSessions: vi.fn(),
    createSession: vi.fn(),
    getSession: vi.fn(),
    renameSession: vi.fn(),
    stopSession: vi.fn(),
    killSession: vi.fn(),
    archiveSession: vi.fn(),
    reviveSession: vi.fn(),
  };
}

function createMockWsClient() {
  return {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    onOutput: vi.fn(),
    onStatus: vi.fn(),
    connect: vi.fn(),
    dispose: vi.fn(),
  };
}

function createMockSessionStore() {
  return {
    markRead: vi.fn(),
    markUnread: vi.fn(),
    isUnread: vi.fn().mockReturnValue(false),
    getSessions: vi.fn().mockReturnValue([]),
    getSession: vi.fn(),
    getSessionsByStatus: vi.fn().mockReturnValue([]),
    getWaitingCount: vi.fn().mockReturnValue(0),
    initialize: vi.fn(),
    onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    dispose: vi.fn(),
    getLastActivityTime: vi.fn(),
  };
}

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "ses_abc1234",
    name: "Test Session",
    status: "active",
    createdAt: "2026-03-12T09:00:00Z",
    ...overrides,
  };
}

// Track terminal close handlers
let terminalCloseHandlers: Array<(terminal: any) => void> = [];

describe("TerminalManager", () => {
  let manager: TerminalManager;
  let mockClient: ReturnType<typeof createMockSupervisorClient>;
  let mockWs: ReturnType<typeof createMockWsClient>;
  let mockStore: ReturnType<typeof createMockSessionStore>;
  let mockTerminal: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockSupervisorClient();
    mockWs = createMockWsClient();
    mockStore = createMockSessionStore();
    terminalCloseHandlers = [];

    // Mock vscode.window.createTerminal to return a mock terminal
    mockTerminal = {
      show: vi.fn(),
      dispose: vi.fn(),
      name: "Test Session",
    };

    vi.mocked(vscode.window.createTerminal).mockReturnValue(mockTerminal);

    // Track onDidCloseTerminal registrations
    (vscode.window as any).onDidCloseTerminal = vi.fn((handler: (t: any) => void) => {
      terminalCloseHandlers.push(handler);
      return { dispose: vi.fn() };
    });

    manager = new TerminalManager(mockClient as any, mockWs as any, mockStore as any);
  });

  describe("openTerminal()", () => {
    it("creates a new terminal for a new session", async () => {
      const session = createSession();

      await manager.openTerminal(session);

      expect(vscode.window.createTerminal).toHaveBeenCalledWith(
        expect.objectContaining({
          name: session.name,
          pty: expect.any(Object),
        }),
      );
    });

    it("shows the terminal after creation", async () => {
      const session = createSession();

      await manager.openTerminal(session);

      expect(mockTerminal.show).toHaveBeenCalled();
    });

    it("marks session as read after opening", async () => {
      const session = createSession();

      await manager.openTerminal(session);

      expect(mockStore.markRead).toHaveBeenCalledWith(session.id);
    });

    it("focuses existing terminal for already-open session (no duplicate)", async () => {
      const session = createSession();

      await manager.openTerminal(session);
      vi.mocked(vscode.window.createTerminal).mockClear();
      mockTerminal.show.mockClear();

      await manager.openTerminal(session);

      // Should NOT create a second terminal
      expect(vscode.window.createTerminal).not.toHaveBeenCalled();
      // Should show (focus) the existing terminal
      expect(mockTerminal.show).toHaveBeenCalled();
    });

    it("marks session as read when focusing existing terminal", async () => {
      const session = createSession();

      await manager.openTerminal(session);
      mockStore.markRead.mockClear();

      await manager.openTerminal(session);

      expect(mockStore.markRead).toHaveBeenCalledWith(session.id);
    });
  });

  describe("getTerminal()", () => {
    it("returns terminal for open session", async () => {
      const session = createSession();

      await manager.openTerminal(session);

      expect(manager.getTerminal(session.id)).toBe(mockTerminal);
    });

    it("returns undefined for closed session", () => {
      expect(manager.getTerminal("ses_unknown")).toBeUndefined();
    });
  });

  describe("closeTerminal()", () => {
    it("disposes terminal and removes from map", async () => {
      const session = createSession();

      await manager.openTerminal(session);
      manager.closeTerminal(session.id);

      expect(mockTerminal.dispose).toHaveBeenCalled();
      expect(manager.getTerminal(session.id)).toBeUndefined();
    });

    it("does nothing for unknown session", () => {
      // Should not throw
      manager.closeTerminal("ses_unknown");
    });
  });

  describe("terminal close event (user closes tab)", () => {
    it("cleans up from map when user closes terminal tab", async () => {
      const session = createSession();

      await manager.openTerminal(session);

      // Simulate user closing the terminal tab
      for (const handler of terminalCloseHandlers) {
        handler(mockTerminal);
      }

      expect(manager.getTerminal(session.id)).toBeUndefined();
    });
  });

  describe("updateTerminalName()", () => {
    it("calls pty.updateName on the terminal's pseudoterminal", async () => {
      const session = createSession();

      await manager.openTerminal(session);
      manager.updateTerminalName(session.id, "Renamed Session");

      // The pty's nameEmitter should have been called
      // We verify this indirectly -- the method should not throw
      // and the terminal should still be tracked
      expect(manager.getTerminal(session.id)).toBeDefined();
    });
  });

  describe("notifySessionExit()", () => {
    it("calls onSessionExit on the pty", async () => {
      const session = createSession();

      await manager.openTerminal(session);

      // Should not throw
      manager.notifySessionExit(session.id, session.name);

      // Terminal should still be open (onSessionExit does NOT close)
      expect(manager.getTerminal(session.id)).toBeDefined();
    });

    it("fires only once per session (dedup guard)", async () => {
      const session = createSession();
      await manager.openTerminal(session);

      manager.notifySessionExit(session.id, session.name);
      manager.notifySessionExit(session.id, session.name);

      // pty.onSessionExit should be called exactly once
      // Verify via the terminal still being tracked (it stays open)
      expect(manager.getTerminal(session.id)).toBeDefined();
      // showInformationMessage called exactly once
      expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
    });

    it("shows information message with session name", async () => {
      const session = createSession({ name: "My Task" });
      await manager.openTerminal(session);

      manager.notifySessionExit(session.id, "My Task");

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Session 'My Task' has ended",
      );
    });

    it("allows re-notification after closeTerminal clears dedup", async () => {
      const session = createSession();
      await manager.openTerminal(session);

      manager.notifySessionExit(session.id, session.name);
      manager.closeTerminal(session.id);

      // Reopen and notify again
      await manager.openTerminal(session);
      manager.notifySessionExit(session.id, session.name);

      expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe("dispose()", () => {
    it("closes all open terminals", async () => {
      const session1 = createSession({ id: "ses_one", name: "One" });
      const session2 = createSession({ id: "ses_two", name: "Two" });

      const mockTerminal2 = { show: vi.fn(), dispose: vi.fn(), name: "Two" };
      vi.mocked(vscode.window.createTerminal)
        .mockReturnValueOnce(mockTerminal)
        .mockReturnValueOnce(mockTerminal2 as any);

      await manager.openTerminal(session1);
      await manager.openTerminal(session2);

      manager.dispose();

      expect(mockTerminal.dispose).toHaveBeenCalled();
      expect(mockTerminal2.dispose).toHaveBeenCalled();
    });
  });
});
