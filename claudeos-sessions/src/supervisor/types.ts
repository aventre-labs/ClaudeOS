// ============================================================
// ClaudeOS Sessions Extension - Supervisor Types
// ============================================================
// Extension's copy of the supervisor API contract.
// These types mirror supervisor/src/types.ts but are NOT imported
// from the supervisor package (the extension is a separate package).
// ============================================================

export type SessionStatus =
  | "active"
  | "idle"
  | "waiting"
  | "stopped"
  | "archived"
  | "zombie";

export interface Session {
  id: string;
  name: string;
  status: SessionStatus;
  createdAt: string;
  workdir?: string;
  model?: string;
  flags?: string[];
  pid?: number;
}

export interface SessionArchive {
  sessionId: string;
  name: string;
  scrollback: string;
  metadata: {
    createdAt: string;
    archivedAt: string;
    workdir?: string;
    model?: string;
    flags?: string[];
  };
}

// --- WebSocket Message Types ---

export type WsMessageType = "subscribe" | "unsubscribe" | "status" | "output";

export interface WsSubscribeMessage {
  type: "subscribe";
  sessionId: string;
}

export interface WsUnsubscribeMessage {
  type: "unsubscribe";
  sessionId: string;
}

export interface WsStatusMessage {
  type: "status";
  sessionId: string;
  status: SessionStatus;
  timestamp: string;
}

export interface WsOutputMessage {
  type: "output";
  sessionId: string;
  data: string;
  timestamp: string;
}

export type WsMessage =
  | WsSubscribeMessage
  | WsUnsubscribeMessage
  | WsStatusMessage
  | WsOutputMessage;
