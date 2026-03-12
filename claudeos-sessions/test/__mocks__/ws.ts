// ============================================================
// Mock WebSocket for ws library
// ============================================================

import { vi } from "vitest";

export class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readyState = 1; // OPEN
  private handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  sentMessages: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    // Simulate async open
    setTimeout(() => this.emit("open"), 0);
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = 3; // CLOSED
    this.emit("close");
  }

  // Test helpers
  emit(event: string, ...args: unknown[]): void {
    const handlers = this.handlers[event] || [];
    for (const h of handlers) h(...args);
  }

  simulateMessage(msg: object): void {
    this.emit("message", Buffer.from(JSON.stringify(msg)));
  }

  static reset(): void {
    MockWebSocket.instances = [];
  }
}

export default MockWebSocket;
