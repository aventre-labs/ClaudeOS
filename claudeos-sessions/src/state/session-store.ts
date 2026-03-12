// ============================================================
// ClaudeOS Sessions Extension - SessionStore
// ============================================================
// In-memory session state management with read/unread tracking
// and event-driven updates from WsClient status/output events.
// ============================================================

import * as vscode from "vscode";
import type { Session, SessionStatus, WsStatusMessage, WsOutputMessage } from "../supervisor/types.js";
import type { SupervisorClient } from "../supervisor/client.js";
import type { WsClient } from "../supervisor/ws-client.js";

export class SessionStore {
  private sessions = new Map<string, Session>();
  private unreadIds = new Set<string>();
  private lastActivityTime = new Map<string, string>();
  private client: SupervisorClient;
  private wsClient: WsClient;

  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(client: SupervisorClient, wsClient: WsClient) {
    this.client = client;
    this.wsClient = wsClient;
  }

  /**
   * Fetch sessions from supervisor API, connect WebSocket, register handlers.
   */
  async initialize(): Promise<void> {
    // Fetch current sessions
    const sessions = await this.client.listSessions();
    for (const session of sessions) {
      this.sessions.set(session.id, session);
    }

    // Register WebSocket event handlers
    this.wsClient.onStatus((msg: WsStatusMessage) => {
      this.handleStatusMessage(msg);
    });

    // Connect WebSocket
    this.wsClient.connect();
  }

  /**
   * Return all sessions.
   */
  getSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Return sessions filtered by status, sorted most-recent-first.
   */
  getSessionsByStatus(status: SessionStatus): Session[] {
    return Array.from(this.sessions.values())
      .filter((s) => s.status === status)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Return a single session by ID, or undefined if not found.
   */
  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /**
   * Mark a session as read (user focused the terminal tab).
   */
  markRead(id: string): void {
    if (this.unreadIds.has(id)) {
      this.unreadIds.delete(id);
      this._onDidChange.fire();
    }
  }

  /**
   * Mark a session as unread (new output arrived while terminal not focused).
   */
  markUnread(id: string): void {
    if (!this.unreadIds.has(id)) {
      this.unreadIds.add(id);
      this._onDidChange.fire();
    }
  }

  /**
   * Check if a session has unread output.
   */
  isUnread(id: string): boolean {
    return this.unreadIds.has(id);
  }

  /**
   * Count sessions with "waiting" status.
   */
  getWaitingCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.status === "waiting") {
        count++;
      }
    }
    return count;
  }

  /**
   * Get last activity time for a session (for recency-based styling).
   */
  getLastActivityTime(id: string): string | undefined {
    return this.lastActivityTime.get(id);
  }

  /**
   * Clean up: dispose WsClient, clear all state.
   */
  dispose(): void {
    this.wsClient.dispose();
    this.sessions.clear();
    this.unreadIds.clear();
    this.lastActivityTime.clear();
    this._onDidChange.dispose();
  }

  /**
   * Handle incoming status message from WebSocket.
   */
  private handleStatusMessage(msg: WsStatusMessage): void {
    const session = this.sessions.get(msg.sessionId);
    if (session) {
      // Update existing session status
      session.status = msg.status;
      this.lastActivityTime.set(msg.sessionId, msg.timestamp);
      this._onDidChange.fire();
    } else {
      // Unknown session -- fetch from API and add to store
      this.fetchAndAddSession(msg.sessionId);
    }
  }

  /**
   * Fetch a session from the API and add it to the store.
   */
  private async fetchAndAddSession(id: string): Promise<void> {
    try {
      const session = await this.client.getSession(id);
      if (session) {
        this.sessions.set(session.id, session);
        this._onDidChange.fire();
      }
    } catch {
      // Session may have been deleted between status broadcast and fetch
    }
  }
}
