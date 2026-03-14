// ============================================================
// ClaudeOS Sessions Extension - WebSocket Client
// ============================================================
// WebSocket client with auto-reconnect and event dispatch.
// Connects to supervisor WebSocket at ws://localhost:3100/api/v1/ws.
// ============================================================

import WebSocket from "ws";
import type {
  WsStatusMessage,
  WsOutputMessage,
} from "./types.js";

export type StatusHandler = (msg: WsStatusMessage) => void;
export type OutputHandler = (msg: WsOutputMessage) => void;

export class WsClient {
  private url: string;
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30000;
  private readonly initialReconnectDelay = 1000;
  private subscriptions = new Set<string>();
  private statusHandlers: StatusHandler[] = [];
  private outputHandlers = new Map<string, OutputHandler[]>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private connected = false;

  constructor(url: string = "ws://localhost:3100/api/v1/ws") {
    this.url = url;
  }

  /**
   * Establish WebSocket connection.
   */
  connect(): void {
    if (this.disposed) return;

    this.ws = new WebSocket(this.url);

    this.ws.on("open", () => {
      this.connected = true;
      this.reconnectDelay = this.initialReconnectDelay;

      // Replay all subscriptions on reconnect
      for (const sessionId of this.subscriptions) {
        this.ws?.send(JSON.stringify({ type: "subscribe", sessionId }));
      }
    });

    this.ws.on("message", (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "status") {
          for (const handler of this.statusHandlers) {
            handler(msg as WsStatusMessage);
          }
        } else if (msg.type === "output") {
          const handlers = this.outputHandlers.get(msg.sessionId);
          if (handlers) {
            for (const handler of handlers) {
              handler(msg as WsOutputMessage);
            }
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });

    this.ws.on("close", () => {
      this.connected = false;
      this.scheduleReconnect();
    });

    this.ws.on("error", () => {
      // Error is usually followed by close, so reconnect happens there
    });
  }

  /**
   * Subscribe to output from a session.
   */
  subscribe(sessionId: string): void {
    this.subscriptions.add(sessionId);
    if (this.connected && this.ws) {
      this.ws.send(JSON.stringify({ type: "subscribe", sessionId }));
    }
  }

  /**
   * Unsubscribe from a session's output.
   */
  unsubscribe(sessionId: string): void {
    this.subscriptions.delete(sessionId);
    if (this.connected && this.ws) {
      this.ws.send(JSON.stringify({ type: "unsubscribe", sessionId }));
    }
  }

  /**
   * Register handler for status messages (broadcast to all).
   */
  onStatus(handler: StatusHandler): void {
    this.statusHandlers.push(handler);
  }

  /**
   * Register handler for output messages from a specific session.
   */
  onOutput(sessionId: string, handler: OutputHandler): void {
    const handlers = this.outputHandlers.get(sessionId) || [];
    handlers.push(handler);
    this.outputHandlers.set(sessionId, handlers);
  }

  /**
   * Clean up connection and all handlers.
   */
  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.statusHandlers = [];
    this.outputHandlers.clear();
    this.subscriptions.clear();
    this.connected = false;
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      this.maxReconnectDelay,
    );
  }
}
