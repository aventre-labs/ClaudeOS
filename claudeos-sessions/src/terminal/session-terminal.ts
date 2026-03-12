// ============================================================
// ClaudeOS Sessions Extension - SessionPseudoterminal
// ============================================================
// Pseudoterminal that proxies I/O between a VS Code terminal tab
// and a tmux session via the supervisor REST API and WebSocket.
//
// Input buffering: handleInput receives raw keystrokes character
// by character. Characters are echoed locally and buffered until
// Enter (\r), then flushed as a complete line to the supervisor.
// ============================================================

import * as vscode from "vscode";
import type { SupervisorClient } from "../supervisor/client.js";
import type { WsClient } from "../supervisor/ws-client.js";
import type { WsOutputMessage } from "../supervisor/types.js";

export class SessionPseudoterminal implements vscode.Pseudoterminal {
  // --- Event emitters ---
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<number | void>();
  private nameEmitter = new vscode.EventEmitter<string>();

  // --- Public events (Pseudoterminal interface) ---
  readonly onDidWrite = this.writeEmitter.event;
  readonly onDidClose = this.closeEmitter.event;
  readonly onDidChangeName = this.nameEmitter.event;

  // --- Internal state ---
  private inputBuffer = "";
  private isOpen = false;

  constructor(
    private readonly sessionId: string,
    private readonly supervisorClient: SupervisorClient,
    private readonly wsClient: WsClient,
  ) {}

  /**
   * Called by VS Code when the terminal is ready for I/O.
   * Subscribes to WebSocket output and loads initial scrollback.
   *
   * IMPORTANT: No writes should occur before open() is called
   * (VS Code silently drops events before open).
   */
  async open(_initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
    this.isOpen = true;

    // Subscribe to live output via WebSocket
    this.wsClient.onOutput(this.sessionId, (msg: WsOutputMessage) => {
      if (this.isOpen) {
        this.writeEmitter.fire(msg.data);
      }
    });
    this.wsClient.subscribe(this.sessionId);

    // Load initial scrollback from supervisor API
    try {
      const output = await this.supervisorClient.getOutput(this.sessionId, true);
      if (output) {
        this.writeEmitter.fire(output);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.writeEmitter.fire(`\r\n[Error loading session: ${message}]\r\n`);
    }
  }

  /**
   * Handle raw keystrokes from the user.
   *
   * - Regular characters: append to buffer, echo to terminal
   * - Enter (\r): flush buffer to supervisor, write newline
   * - Backspace (\x7f): remove last char from buffer, erase on screen
   * - Ctrl+C (\x03): send interrupt to supervisor, clear buffer
   */
  handleInput(data: string): void {
    if (data === "\r") {
      // Enter: flush buffer to supervisor
      this.supervisorClient.sendInput(this.sessionId, this.inputBuffer);
      this.writeEmitter.fire("\r\n");
      this.inputBuffer = "";
    } else if (data === "\x7f") {
      // Backspace: remove last char if buffer not empty
      if (this.inputBuffer.length > 0) {
        this.inputBuffer = this.inputBuffer.slice(0, -1);
        this.writeEmitter.fire("\b \b");
      }
    } else if (data === "\x03") {
      // Ctrl+C: send interrupt to supervisor, clear buffer
      this.supervisorClient.sendInput(this.sessionId, "\x03");
      this.inputBuffer = "";
    } else {
      // Regular character: append and echo
      this.inputBuffer += data;
      this.writeEmitter.fire(data);
    }
  }

  /**
   * Called by VS Code when the terminal is closed.
   * Unsubscribes from WebSocket and cleans up emitters.
   */
  close(): void {
    this.isOpen = false;
    this.wsClient.unsubscribe(this.sessionId);
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
    this.nameEmitter.dispose();
  }

  /**
   * Update the terminal tab name dynamically.
   * Called by TerminalManager when session name or status changes.
   */
  updateName(name: string): void {
    this.nameEmitter.fire(name);
  }

  /**
   * Handle session exit: write end message and show notification.
   * Does NOT fire closeEmitter (keeps terminal open per spec).
   */
  onSessionExit(): void {
    this.writeEmitter.fire("\r\n[Session ended]\r\n");
  }
}
