// ============================================================
// ClaudeOS Home Extension - Supervisor REST Client
// ============================================================
// Minimal HTTP client for sessions API. Only needs listSessions
// and createSession for the home page.
// Uses global fetch (Node 22) for all HTTP calls.
// ============================================================

import type { Session } from "../types.js";

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
}
