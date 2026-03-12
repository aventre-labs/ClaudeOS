// ============================================================
// ClaudeOS Supervisor - Type Definitions
// ============================================================
// This file defines ALL TypeScript interfaces for the supervisor.
// It serves as the type contract that later plans implement against.
// ============================================================

// --- Session Types ---

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

// --- Secret Types ---

export interface Secret {
  name: string;
  category?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SecretEntry extends Secret {
  encrypted: string;
  iv: string;
  authTag: string;
}

// --- Extension Types ---

export type ExtensionInstallMethod =
  | "github-release"
  | "build-from-source"
  | "local-vsix";

export interface ExtensionInstallRequest {
  method: ExtensionInstallMethod;
  repo?: string;
  tag?: string;
  localPath?: string;
}

export type ExtensionInstallState =
  | "pending"
  | "downloading"
  | "installing"
  | "installed"
  | "failed";

export interface ExtensionRecord {
  id: string;
  name: string;
  version: string;
  method: ExtensionInstallMethod;
  state: ExtensionInstallState;
  installedAt?: string;
  error?: string;
}

// --- Boot & Health Types ---

export type BootState =
  | "initializing"
  | "setup"
  | "installing"
  | "ready"
  | "ok";

export interface HealthResponse {
  status: BootState;
  version: string;
  uptime: number;
}

// --- Settings Types ---

export interface SupervisorSettings {
  reloadBehavior: "force" | "notification";
  logLevel: "debug" | "info" | "warn" | "error";
  sessionDefaults: {
    model?: string;
    flags?: string[];
    workdir?: string;
  };
}

// --- WebSocket Types ---

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

// --- Server Types ---

export interface ServerOptions {
  dataDir: string;
  isDryRun: boolean;
  port?: number;
}
