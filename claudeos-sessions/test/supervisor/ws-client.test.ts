// ============================================================
// WsClient Tests
// ============================================================
// Tests the WebSocket client with auto-reconnect and event dispatch.
// Uses a mock WebSocket implementation.
// ============================================================

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { WsStatusMessage, WsOutputMessage } from "../../src/supervisor/types.js";

// Mock ws module before importing WsClient
vi.mock("ws", async () => {
  const { MockWebSocket } = await import("../__mocks__/ws.js");
  return { default: MockWebSocket, WebSocket: MockWebSocket };
});

// Import after mock setup (vitest hoists vi.mock)
import { WsClient } from "../../src/supervisor/ws-client.js";
import { MockWebSocket } from "../__mocks__/ws.js";

describe("WsClient", () => {
  let client: WsClient;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.reset();
    client = new WsClient("ws://localhost:3100/ws");
  });

  afterEach(() => {
    client.dispose();
    vi.useRealTimers();
  });

  function getLatestWs(): MockWebSocket {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }

  /** Connect and wait for the open event to fire. */
  async function connectAndOpen(): Promise<void> {
    client.connect();
    await vi.advanceTimersByTimeAsync(1); // trigger setTimeout(open, 0)
  }

  /** Simulate close and wait for reconnect + open. */
  async function closeAndReconnect(delayMs: number): Promise<void> {
    getLatestWs().emit("close");
    await vi.advanceTimersByTimeAsync(delayMs);
    // The reconnect creates a new WS with setTimeout(open, 0)
    await vi.advanceTimersByTimeAsync(1);
  }

  describe("connect", () => {
    it("creates a WebSocket connection", async () => {
      client.connect();
      expect(MockWebSocket.instances).toHaveLength(1);
      expect(getLatestWs().url).toBe("ws://localhost:3100/ws");
    });

    it("uses /api/v1/ws as default URL", () => {
      const defaultClient = new WsClient();
      defaultClient.connect();
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      expect(ws.url).toBe("ws://localhost:3100/api/v1/ws");
      defaultClient.dispose();
    });
  });

  describe("subscribe / unsubscribe", () => {
    it("sends subscribe message", async () => {
      await connectAndOpen();

      client.subscribe("ses_abc");

      const ws = getLatestWs();
      expect(ws.sentMessages).toContainEqual(
        JSON.stringify({ type: "subscribe", sessionId: "ses_abc" }),
      );
    });

    it("sends unsubscribe message", async () => {
      await connectAndOpen();

      client.subscribe("ses_abc");
      client.unsubscribe("ses_abc");

      const ws = getLatestWs();
      expect(ws.sentMessages).toContainEqual(
        JSON.stringify({ type: "unsubscribe", sessionId: "ses_abc" }),
      );
    });

    it("queues subscribe when not connected and sends on open", async () => {
      // Subscribe before connect
      client.subscribe("ses_queued");
      client.connect();
      await vi.advanceTimersByTimeAsync(1); // trigger open

      const ws = getLatestWs();
      expect(ws.sentMessages).toContainEqual(
        JSON.stringify({ type: "subscribe", sessionId: "ses_queued" }),
      );
    });
  });

  describe("onStatus", () => {
    it("delivers WsStatusMessage events", async () => {
      await connectAndOpen();

      const handler = vi.fn();
      client.onStatus(handler);

      const statusMsg: WsStatusMessage = {
        type: "status",
        sessionId: "ses_abc",
        status: "idle",
        timestamp: "2026-03-12T00:00:00Z",
      };

      getLatestWs().simulateMessage(statusMsg);

      expect(handler).toHaveBeenCalledWith(statusMsg);
    });
  });

  describe("onOutput", () => {
    it("delivers WsOutputMessage data for subscribed session", async () => {
      await connectAndOpen();

      const handler = vi.fn();
      client.onOutput("ses_abc", handler);

      const outputMsg: WsOutputMessage = {
        type: "output",
        sessionId: "ses_abc",
        data: "hello world",
        timestamp: "2026-03-12T00:00:00Z",
      };

      getLatestWs().simulateMessage(outputMsg);

      expect(handler).toHaveBeenCalledWith(outputMsg);
    });

    it("does not deliver output for different session", async () => {
      await connectAndOpen();

      const handler = vi.fn();
      client.onOutput("ses_abc", handler);

      const outputMsg: WsOutputMessage = {
        type: "output",
        sessionId: "ses_xyz",
        data: "other output",
        timestamp: "2026-03-12T00:00:00Z",
      };

      getLatestWs().simulateMessage(outputMsg);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("reconnection", () => {
    it("reconnects with exponential backoff on close", async () => {
      await connectAndOpen();
      expect(MockWebSocket.instances).toHaveLength(1);

      // First reconnect after 1s
      await closeAndReconnect(1000);
      expect(MockWebSocket.instances).toHaveLength(2);

      // Second reconnect after 2s (exponential backoff)
      await closeAndReconnect(2000);
      expect(MockWebSocket.instances).toHaveLength(3);
    });

    it("replays subscriptions on reconnect", async () => {
      await connectAndOpen();

      client.subscribe("ses_abc");
      client.subscribe("ses_xyz");

      // Reconnect
      await closeAndReconnect(1000);

      const newWs = getLatestWs();
      const subscribeMessages = newWs.sentMessages.filter((m) => {
        const parsed = JSON.parse(m);
        return parsed.type === "subscribe";
      });

      expect(subscribeMessages).toHaveLength(2);
      expect(subscribeMessages).toContainEqual(
        JSON.stringify({ type: "subscribe", sessionId: "ses_abc" }),
      );
      expect(subscribeMessages).toContainEqual(
        JSON.stringify({ type: "subscribe", sessionId: "ses_xyz" }),
      );
    });

    it("caps backoff at 30 seconds", async () => {
      await connectAndOpen();

      // Close and reconnect repeatedly to escalate backoff
      // Backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s...
      for (let i = 0; i < 8; i++) {
        const delay = Math.min(1000 * Math.pow(2, i), 30000);
        await closeAndReconnect(delay);
      }

      // Initial + 8 reconnects = 9
      expect(MockWebSocket.instances).toHaveLength(9);
    });

    it("resets backoff on successful connection", async () => {
      await connectAndOpen();

      // Close, reconnect (1s backoff)
      await closeAndReconnect(1000);

      // Now close again -- backoff should have been reset on the successful open
      // So it should reconnect after 1s again, not 2s
      getLatestWs().emit("close");
      const countBefore = MockWebSocket.instances.length;

      // Advance by 1s -- if backoff was reset, new connection appears
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1);
      expect(MockWebSocket.instances.length).toBe(countBefore + 1);
    });
  });

  describe("dispose", () => {
    it("closes connection and prevents reconnection", async () => {
      await connectAndOpen();

      client.dispose();

      // Verify no reconnection happens after dispose
      await vi.advanceTimersByTimeAsync(60000);
      // Only the original connection
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });
});
