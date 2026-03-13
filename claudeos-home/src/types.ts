// ============================================================
// ClaudeOS Home Extension - Shared Types
// ============================================================

export type SessionStatus = "active" | "idle" | "waiting" | "stopped" | "archived" | "zombie";

export interface Session {
  id: string;
  name: string;
  status: SessionStatus;
  createdAt: string;
  workdir?: string;
  model?: string;
}

export interface Shortcut {
  id: string;
  label: string;
  command: string;
  icon: string; // codicon id
  args?: unknown[];
}
