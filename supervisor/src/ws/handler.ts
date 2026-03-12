// ============================================================
// ClaudeOS Supervisor - WebSocket Handler
// ============================================================
// Real-time event delivery for session status and output.
// No authentication required (container-internal only).
// ============================================================

import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type { SessionStatus } from "../types.js";

// Track connected clients and their session subscriptions
const clients = new Map<WebSocket, Set<string>>();

export async function wsHandler(
  server: FastifyInstance,
): Promise<void> {
  server.get(
    "/ws",
    { websocket: true },
    (socket: WebSocket) => {
      clients.set(socket, new Set());

      socket.on("message", (raw: Buffer | string) => {
        try {
          const msg = JSON.parse(raw.toString());
          const subs = clients.get(socket);
          if (!subs) return;

          if (msg.type === "subscribe" && msg.sessionId) {
            subs.add(msg.sessionId);
          } else if (msg.type === "unsubscribe" && msg.sessionId) {
            subs.delete(msg.sessionId);
          }
        } catch {
          // Ignore malformed messages
        }
      });

      socket.on("close", () => {
        clients.delete(socket);
      });

      socket.on("error", () => {
        clients.delete(socket);
      });
    },
  );
}

/**
 * Broadcast a session status change to ALL connected clients.
 */
export function broadcastStatus(sessionId: string, status: SessionStatus): void {
  const message = JSON.stringify({
    type: "status",
    sessionId,
    status,
    timestamp: new Date().toISOString(),
  });

  for (const [socket] of clients) {
    try {
      socket.send(message);
    } catch {
      // Client disconnected, cleanup will happen on close event
    }
  }
}

/**
 * Send output data only to clients subscribed to the given session.
 */
export function sendOutput(sessionId: string, data: string): void {
  const message = JSON.stringify({
    type: "output",
    sessionId,
    data,
    timestamp: new Date().toISOString(),
  });

  for (const [socket, subscriptions] of clients) {
    if (subscriptions.has(sessionId)) {
      try {
        socket.send(message);
      } catch {
        // Client disconnected, cleanup will happen on close event
      }
    }
  }
}
