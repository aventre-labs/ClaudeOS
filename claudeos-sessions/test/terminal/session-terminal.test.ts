// ============================================================
// SessionPseudoterminal Tests
// ============================================================
// Tests for the Pseudoterminal that proxies I/O to tmux sessions
// via the supervisor REST API and WebSocket.
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionPseudoterminal } from "../../src/terminal/session-terminal.js";

// --- Mock Types ---

function createMockSupervisorClient() {
  return {
    sendInput: vi.fn().mockResolvedValue(undefined),
    getOutput: vi.fn().mockResolvedValue("initial output\r\n"),
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

describe("SessionPseudoterminal", () => {
  let pty: SessionPseudoterminal;
  let mockClient: ReturnType<typeof createMockSupervisorClient>;
  let mockWs: ReturnType<typeof createMockWsClient>;
  const SESSION_ID = "ses_test123";

  beforeEach(() => {
    mockClient = createMockSupervisorClient();
    mockWs = createMockWsClient();
    pty = new SessionPseudoterminal(SESSION_ID, mockClient as any, mockWs as any);
  });

  describe("open()", () => {
    it("subscribes to session output via WsClient", async () => {
      await pty.open(undefined);

      expect(mockWs.onOutput).toHaveBeenCalledWith(SESSION_ID, expect.any(Function));
      expect(mockWs.subscribe).toHaveBeenCalledWith(SESSION_ID);
    });

    it("loads initial scrollback from supervisor API", async () => {
      const written: string[] = [];
      pty.onDidWrite((data) => written.push(data));

      await pty.open(undefined);

      expect(mockClient.getOutput).toHaveBeenCalledWith(SESSION_ID, true);
      expect(written).toContain("initial output\r\n");
    });

    it("does NOT write before open() is called", () => {
      // Per pitfall 2 from research: events before open() are silently dropped
      const written: string[] = [];
      pty.onDidWrite((data) => written.push(data));

      // Without calling open(), no writes should occur
      expect(written).toHaveLength(0);
    });

    it("writes error message if session not found during scrollback load", async () => {
      mockClient.getOutput.mockRejectedValue(new Error("404"));

      const written: string[] = [];
      pty.onDidWrite((data) => written.push(data));

      await pty.open(undefined);

      expect(written.some((w) => w.includes("Error"))).toBe(true);
    });

    it("handles empty scrollback gracefully", async () => {
      mockClient.getOutput.mockResolvedValue("");

      const written: string[] = [];
      pty.onDidWrite((data) => written.push(data));

      await pty.open(undefined);

      // Should not write empty string
      expect(written.filter((w) => w === "")).toHaveLength(0);
    });

    it("pipes WebSocket output to terminal after open", async () => {
      const written: string[] = [];
      pty.onDidWrite((data) => written.push(data));

      await pty.open(undefined);

      // Get the output callback that was registered
      const outputCb = mockWs.onOutput.mock.calls[0][1];
      outputCb({ type: "output", sessionId: SESSION_ID, data: "hello from ws\r\n", timestamp: "" });

      expect(written).toContain("hello from ws\r\n");
    });
  });

  describe("handleInput()", () => {
    it("echoes typed characters to onDidWrite", async () => {
      await pty.open(undefined);

      const written: string[] = [];
      pty.onDidWrite((data) => written.push(data));

      pty.handleInput("a");
      pty.handleInput("b");

      expect(written).toContain("a");
      expect(written).toContain("b");
    });

    it("flushes buffer on Enter to supervisorClient.sendInput", async () => {
      await pty.open(undefined);

      pty.handleInput("h");
      pty.handleInput("i");
      pty.handleInput("\r"); // Enter

      expect(mockClient.sendInput).toHaveBeenCalledWith(SESSION_ID, "hi");
    });

    it("writes newline on Enter", async () => {
      await pty.open(undefined);

      const written: string[] = [];
      pty.onDidWrite((data) => written.push(data));

      pty.handleInput("x");
      pty.handleInput("\r");

      expect(written).toContain("\r\n");
    });

    it("clears buffer after Enter", async () => {
      await pty.open(undefined);

      pty.handleInput("a");
      pty.handleInput("\r");
      pty.handleInput("b");
      pty.handleInput("\r");

      // Second call should only send "b", not "ab"
      expect(mockClient.sendInput).toHaveBeenCalledTimes(2);
      expect(mockClient.sendInput).toHaveBeenNthCalledWith(2, SESSION_ID, "b");
    });

    it("handles backspace: removes last char from buffer and erases on screen", async () => {
      await pty.open(undefined);

      const written: string[] = [];
      pty.onDidWrite((data) => written.push(data));

      pty.handleInput("a");
      pty.handleInput("b");
      pty.handleInput("\x7f"); // Backspace

      expect(written).toContain("\b \b");

      // Now flush: should only send "a"
      pty.handleInput("\r");
      expect(mockClient.sendInput).toHaveBeenCalledWith(SESSION_ID, "a");
    });

    it("ignores backspace on empty buffer", async () => {
      await pty.open(undefined);

      const written: string[] = [];
      pty.onDidWrite((data) => written.push(data));

      pty.handleInput("\x7f"); // Backspace with empty buffer

      expect(written).not.toContain("\b \b");
    });

    it("handles Ctrl+C: sends to supervisor and clears buffer", async () => {
      await pty.open(undefined);

      pty.handleInput("a");
      pty.handleInput("b");
      pty.handleInput("\x03"); // Ctrl+C

      expect(mockClient.sendInput).toHaveBeenCalledWith(SESSION_ID, "\x03");

      // Buffer should be cleared: Enter sends empty
      pty.handleInput("\r");
      expect(mockClient.sendInput).toHaveBeenNthCalledWith(2, SESSION_ID, "");
    });
  });

  describe("close()", () => {
    it("unsubscribes from WsClient", async () => {
      await pty.open(undefined);

      pty.close();

      expect(mockWs.unsubscribe).toHaveBeenCalledWith(SESSION_ID);
    });
  });

  describe("updateName()", () => {
    it("fires onDidChangeName event", () => {
      const names: string[] = [];
      pty.onDidChangeName((name) => names.push(name));

      pty.updateName("New Name");

      expect(names).toEqual(["New Name"]);
    });
  });

  describe("onSessionExit()", () => {
    it("writes end message to terminal", async () => {
      await pty.open(undefined);

      const written: string[] = [];
      pty.onDidWrite((data) => written.push(data));

      pty.onSessionExit();

      expect(written.some((w) => w.includes("Session ended"))).toBe(true);
    });

    it("does NOT fire onDidClose (keeps terminal open)", async () => {
      await pty.open(undefined);

      let closed = false;
      pty.onDidClose(() => {
        closed = true;
      });

      pty.onSessionExit();

      expect(closed).toBe(false);
    });
  });
});
