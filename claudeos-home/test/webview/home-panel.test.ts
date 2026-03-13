// ============================================================
// HomePanel Tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { HomePanel } from "../../src/webview/home-panel.js";
import { SupervisorClient } from "../../src/supervisor/client.js";
import { ShortcutStore } from "../../src/shortcuts/shortcut-store.js";
import type { Session, Shortcut } from "../../src/types.js";

function createMockContext() {
  const store = new Map<string, unknown>();
  return {
    extensionUri: vscode.Uri.file("/mock/extension"),
    subscriptions: [] as { dispose: () => void }[],
    globalState: {
      get: vi.fn((key: string) => store.get(key)),
      update: vi.fn((key: string, value: unknown) => {
        store.set(key, value);
        return Promise.resolve();
      }),
    },
  };
}

function createMockClient(): SupervisorClient {
  return {
    listSessions: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue({ id: "ses_abc", name: "Test", status: "active", createdAt: new Date().toISOString() }),
  } as unknown as SupervisorClient;
}

function createMockShortcutStore(): ShortcutStore {
  const defaultShortcuts: Shortcut[] = [
    { id: "new-session", label: "New Session", command: "claudeos.sessions.create", icon: "add" },
    { id: "open-home", label: "Open Home", command: "claudeos.home.open", icon: "home" },
  ];
  return {
    getShortcuts: vi.fn().mockReturnValue(defaultShortcuts),
    addShortcut: vi.fn(),
    removeShortcut: vi.fn(),
    reorderShortcuts: vi.fn(),
  } as unknown as ShortcutStore;
}

describe("HomePanel", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let client: SupervisorClient;
  let shortcutStore: ShortcutStore;

  beforeEach(() => {
    vi.clearAllMocks();
    HomePanel.currentPanel = undefined;
    (vscode.window as any)._resetPanel();
    ctx = createMockContext();
    client = createMockClient();
    shortcutStore = createMockShortcutStore();
  });

  describe("createOrShow()", () => {
    it("creates panel with correct viewType and options", () => {
      HomePanel.createOrShow(ctx as any, client, shortcutStore);

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        "claudeos.home",
        "ClaudeOS Home",
        vscode.ViewColumn.One,
        expect.objectContaining({
          enableScripts: true,
          retainContextWhenHidden: true,
        }),
      );
    });

    it("reveals existing panel instead of creating duplicate", () => {
      HomePanel.createOrShow(ctx as any, client, shortcutStore);
      const firstCallCount = (vscode.window.createWebviewPanel as any).mock.calls.length;

      // Get reference to the panel mock to check reveal
      const panel = (vscode.window as any)._getLastPanel();

      HomePanel.createOrShow(ctx as any, client, shortcutStore);
      const secondCallCount = (vscode.window.createWebviewPanel as any).mock.calls.length;

      // Should not have created a new panel
      expect(secondCallCount).toBe(firstCallCount);
      // Should have revealed
      expect(panel.reveal).toHaveBeenCalled();
    });
  });

  describe("message handling", () => {
    function setupPanelAndGetEmitter() {
      HomePanel.createOrShow(ctx as any, client, shortcutStore);
      const panel = (vscode.window as any)._getLastPanel();
      return panel.webview._onDidReceiveMessageEmitter;
    }

    it("handles 'createSession' message by executing claudeos.sessions.create command", async () => {
      const emitter = setupPanelAndGetEmitter();
      emitter.fire({ command: "createSession" });
      await vi.waitFor(() => {
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith("claudeos.sessions.create");
      });
    });

    it("handles 'openSession' message by executing claudeos.sessions.openTerminal command", async () => {
      const emitter = setupPanelAndGetEmitter();
      emitter.fire({ command: "openSession", sessionId: "ses_abc" });
      await vi.waitFor(() => {
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          "claudeos.sessions.openTerminal",
          { id: "ses_abc" },
        );
      });
    });

    it("handles 'getRecentSessions' message by calling client.listSessions and posting back", async () => {
      const sessions: Session[] = [
        { id: "ses_1", name: "Active One", status: "active", createdAt: "2026-03-12T10:00:00Z" },
        { id: "ses_2", name: "Idle Two", status: "idle", createdAt: "2026-03-12T09:00:00Z" },
        { id: "ses_3", name: "Archived", status: "archived", createdAt: "2026-03-12T08:00:00Z" },
      ];
      (client.listSessions as any).mockResolvedValue(sessions);

      const emitter = setupPanelAndGetEmitter();
      const panel = (vscode.window as any)._getLastPanel();

      emitter.fire({ command: "getRecentSessions" });

      await vi.waitFor(() => {
        expect(client.listSessions).toHaveBeenCalled();
        expect(panel.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            command: "recentSessions",
            data: expect.arrayContaining([
              expect.objectContaining({ id: "ses_1" }),
              expect.objectContaining({ id: "ses_2" }),
            ]),
          }),
        );
      });

      // Should filter out archived sessions
      const postedData = (panel.webview.postMessage as any).mock.calls.find(
        (c: any) => c[0]?.command === "recentSessions",
      )?.[0]?.data as Session[];
      expect(postedData.every((s: Session) => s.status !== "archived")).toBe(true);
    });

    it("handles 'getShortcuts' message by returning shortcuts from store", async () => {
      const emitter = setupPanelAndGetEmitter();
      const panel = (vscode.window as any)._getLastPanel();

      emitter.fire({ command: "getShortcuts" });

      await vi.waitFor(() => {
        expect(shortcutStore.getShortcuts).toHaveBeenCalled();
        expect(panel.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            command: "shortcuts",
            data: expect.arrayContaining([
              expect.objectContaining({ id: "new-session" }),
            ]),
          }),
        );
      });
    });

    it("handles 'executeShortcut' message by executing the given command", async () => {
      const emitter = setupPanelAndGetEmitter();
      emitter.fire({ command: "executeShortcut", commandId: "workbench.action.terminal.toggleTerminal", args: [] });
      await vi.waitFor(() => {
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          "workbench.action.terminal.toggleTerminal",
        );
      });
    });
  });

  describe("SupervisorClient", () => {
    it("listSessions() calls GET /api/v1/sessions", async () => {
      const mockSessions: Session[] = [
        { id: "ses_1", name: "S1", status: "active", createdAt: "2026-01-01T00:00:00Z" },
      ];
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSessions),
      });
      vi.stubGlobal("fetch", fetchMock);

      // Create a real client to test actual fetch calls
      const { SupervisorClient: RealClient } = await import("../../src/supervisor/client.js");
      const realClient = new RealClient("http://localhost:3100/api/v1");
      const result = await realClient.listSessions();

      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:3100/api/v1/sessions",
        { method: "GET" },
      );
      expect(result).toEqual(mockSessions);

      vi.unstubAllGlobals();
    });

    it("createSession() calls POST /api/v1/sessions", async () => {
      const newSession: Session = {
        id: "ses_new",
        name: "My Session",
        status: "active",
        createdAt: "2026-01-01T00:00:00Z",
      };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(newSession),
      });
      vi.stubGlobal("fetch", fetchMock);

      const { SupervisorClient: RealClient } = await import("../../src/supervisor/client.js");
      const realClient = new RealClient("http://localhost:3100/api/v1");
      const result = await realClient.createSession("My Session");

      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:3100/api/v1/sessions",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "My Session" }),
        }),
      );
      expect(result).toEqual(newSession);

      vi.unstubAllGlobals();
    });
  });
});
