// ============================================================
// ClaudeOS Home Extension - Supervisor REST Client
// ============================================================
// Stub: implementation pending TDD GREEN phase.
// ============================================================

import type { Session } from "../types.js";

export class SupervisorClient {
  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:3100/api/v1") {
    this.baseUrl = baseUrl;
  }

  async listSessions(): Promise<Session[]> {
    throw new Error("Not implemented");
  }

  async createSession(_name?: string): Promise<Session> {
    throw new Error("Not implemented");
  }
}
