// ============================================================
// ClaudeOS Sessions Extension - TerminalManager
// ============================================================
// Manages terminal tab lifecycle: creation, focus, close, and
// mapping between session IDs and VS Code Terminal instances.
// Prevents duplicate tabs for the same session.
// ============================================================

import * as vscode from "vscode";
import type { Session } from "../supervisor/types.js";
import type { SupervisorClient } from "../supervisor/client.js";
import type { WsClient } from "../supervisor/ws-client.js";
import type { SessionStore } from "../state/session-store.js";
import { SessionPseudoterminal } from "./session-terminal.js";
import { STATUS_ICONS } from "../sidebar/session-item.js";

interface TerminalEntry {
  terminal: vscode.Terminal;
  pty: SessionPseudoterminal;
  sessionId: string;
}

export class TerminalManager {
  private terminals = new Map<string, TerminalEntry>();
  private exitedSessions = new Set<string>();
  private closeListener: vscode.Disposable | undefined;

  constructor(
    private readonly supervisorClient: SupervisorClient,
    private readonly wsClient: WsClient,
    private readonly sessionStore: SessionStore,
  ) {
    // Listen for user-initiated terminal close (user closes tab)
    if (typeof vscode.window.onDidCloseTerminal === "function") {
      this.closeListener = vscode.window.onDidCloseTerminal(
        (closedTerminal: vscode.Terminal) => {
          this.handleTerminalClose(closedTerminal);
        },
      );
    }
  }

  /**
   * Open a terminal tab for the given session.
   * If a terminal is already open for this session, focus it instead.
   */
  async openTerminal(session: Session): Promise<void> {
    // Check for existing terminal
    const existing = this.terminals.get(session.id);
    if (existing) {
      existing.terminal.show();
      this.sessionStore.markRead(session.id);
      return;
    }

    // Create new Pseudoterminal and VS Code Terminal
    const pty = new SessionPseudoterminal(
      session.id,
      this.supervisorClient,
      this.wsClient,
    );

    const terminal = vscode.window.createTerminal({
      name: session.name,
      pty,
      iconPath: STATUS_ICONS[session.status],
    } as vscode.ExtensionTerminalOptions);

    // Track the terminal
    this.terminals.set(session.id, {
      terminal,
      pty,
      sessionId: session.id,
    });

    terminal.show();
    this.sessionStore.markRead(session.id);
  }

  /**
   * Get the VS Code Terminal for a session, or undefined if not open.
   */
  getTerminal(sessionId: string): vscode.Terminal | undefined {
    return this.terminals.get(sessionId)?.terminal;
  }

  /**
   * Close and dispose the terminal for a session.
   */
  closeTerminal(sessionId: string): void {
    const entry = this.terminals.get(sessionId);
    if (entry) {
      entry.terminal.dispose();
      this.terminals.delete(sessionId);
      this.exitedSessions.delete(sessionId);
    }
  }

  /**
   * Focus the terminal for a session.
   */
  focusTerminal(sessionId: string): void {
    const entry = this.terminals.get(sessionId);
    if (entry) {
      entry.terminal.show();
    }
  }

  /**
   * Update the terminal tab name for a session.
   */
  updateTerminalName(sessionId: string, name: string): void {
    const entry = this.terminals.get(sessionId);
    if (entry) {
      entry.pty.updateName(name);
    }
  }

  /**
   * Notify that a session has exited.
   * Calls onSessionExit on the pty (writes end message, keeps tab open).
   */
  notifySessionExit(sessionId: string, sessionName?: string): void {
    if (this.exitedSessions.has(sessionId)) return;
    const entry = this.terminals.get(sessionId);
    if (entry) {
      this.exitedSessions.add(sessionId);
      entry.pty.onSessionExit();
      const name = sessionName ?? sessionId;
      vscode.window.showInformationMessage(`Session '${name}' has ended`);
    }
  }

  /**
   * Dispose all terminals and clean up.
   */
  dispose(): void {
    for (const entry of this.terminals.values()) {
      entry.terminal.dispose();
    }
    this.terminals.clear();
    this.exitedSessions.clear();
    this.closeListener?.dispose();
  }

  /**
   * Handle terminal close event from VS Code (user closes tab).
   * Removes the terminal from our tracking map.
   */
  private handleTerminalClose(closedTerminal: vscode.Terminal): void {
    for (const [sessionId, entry] of this.terminals) {
      if (entry.terminal === closedTerminal) {
        this.terminals.delete(sessionId);
        this.exitedSessions.delete(sessionId);
        break;
      }
    }
  }
}
