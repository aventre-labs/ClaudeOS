// ============================================================
// ClaudeOS Sessions Extension - Supervisor REST Client
// ============================================================
// HTTP client for all supervisor REST API endpoints.
// Uses global fetch (Node 22) for all HTTP calls.
// ============================================================

import type { Session } from "./types.js";

export class SupervisorClient {
  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:3100/api/v1") {
    this.baseUrl = baseUrl;
  }

  /**
   * List all sessions.
   */
  async listSessions(): Promise<Session[]> {
    const res = await fetch(`${this.baseUrl}/sessions`, { method: "GET" });
    if (!res.ok) {
      throw new Error(`Failed to list sessions: ${res.status}`);
    }
    return res.json() as Promise<Session[]>;
  }

  /**
   * Create a new session with optional name.
   */
  async createSession(name?: string): Promise<Session> {
    const body: Record<string, unknown> = {};
    if (name !== undefined) {
      body.name = name;
    }
    const res = await fetch(`${this.baseUrl}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Failed to create session: ${res.status}`);
    }
    return res.json() as Promise<Session>;
  }

  /**
   * Get a single session by ID.
   */
  async getSession(id: string): Promise<Session> {
    const res = await fetch(`${this.baseUrl}/sessions/${id}`, { method: "GET" });
    if (!res.ok) {
      throw new Error(`Failed to get session: ${res.status}`);
    }
    return res.json() as Promise<Session>;
  }

  /**
   * Rename a session.
   */
  async renameSession(id: string, name: string): Promise<Session> {
    const res = await fetch(`${this.baseUrl}/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      throw new Error(`Failed to rename session: ${res.status}`);
    }
    return res.json() as Promise<Session>;
  }

  /**
   * Stop a session.
   */
  async stopSession(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/sessions/${id}/stop`, {
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(`Failed to stop session: ${res.status}`);
    }
  }

  /**
   * Kill a session (DELETE).
   */
  async killSession(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/sessions/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      throw new Error(`Failed to kill session: ${res.status}`);
    }
  }

  /**
   * Archive a session.
   */
  async archiveSession(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/sessions/${id}/archive`, {
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(`Failed to archive session: ${res.status}`);
    }
  }

  /**
   * Revive an archived session.
   */
  async reviveSession(id: string): Promise<Session> {
    const res = await fetch(`${this.baseUrl}/sessions/${id}/revive`, {
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(`Failed to revive session: ${res.status}`);
    }
    return res.json() as Promise<Session>;
  }

  /**
   * Send input text to a session.
   */
  async sendInput(id: string, text: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/sessions/${id}/input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      throw new Error(`Failed to send input: ${res.status}`);
    }
  }

  /**
   * Get output from a session.
   */
  async getOutput(id: string, scrollback: boolean = false): Promise<string> {
    const res = await fetch(
      `${this.baseUrl}/sessions/${id}/output?scrollback=${scrollback}`,
      { method: "GET" },
    );
    if (!res.ok) {
      throw new Error(`Failed to get output: ${res.status}`);
    }
    const data = (await res.json()) as { output: string };
    return data.output;
  }
}
