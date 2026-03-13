// ============================================================
// SecretsPanel Tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { SecretsPanel } from "../../src/webview/secrets-panel.js";
import type { SupervisorClient } from "../../src/supervisor/client.js";
import type { SecretsTreeProvider } from "../../src/sidebar/secrets-tree.js";
import type { SecretMeta } from "../../src/types.js";

function createMockContext() {
  return {
    extensionUri: vscode.Uri.file("/mock/extension"),
    subscriptions: [] as { dispose: () => void }[],
  };
}

function createMockClient(): SupervisorClient {
  return {
    listSecrets: vi.fn().mockResolvedValue([]),
    getSecretValue: vi.fn().mockResolvedValue("secret-value-123"),
    createSecret: vi.fn().mockResolvedValue({ name: "new", createdAt: "2026-01-01", updatedAt: "2026-01-01" }),
    updateSecret: vi.fn().mockResolvedValue({ name: "existing", createdAt: "2026-01-01", updatedAt: "2026-01-02" }),
    deleteSecret: vi.fn().mockResolvedValue(undefined),
    hasSecret: vi.fn().mockResolvedValue(false),
    setEnv: vi.fn().mockResolvedValue(undefined),
  } as unknown as SupervisorClient;
}

function createMockTreeProvider(): SecretsTreeProvider {
  return {
    update: vi.fn(),
    dispose: vi.fn(),
  } as unknown as SecretsTreeProvider;
}

describe("SecretsPanel", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let client: SupervisorClient;
  let treeProvider: SecretsTreeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    SecretsPanel.currentPanel = undefined;
    (vscode.window as any)._resetPanel();
    ctx = createMockContext();
    client = createMockClient();
    treeProvider = createMockTreeProvider();
  });

  describe("createOrShow()", () => {
    it("creates panel with viewType 'claudeos.secrets.editor'", () => {
      SecretsPanel.createOrShow(ctx as any, client, treeProvider);

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        "claudeos.secrets.editor",
        "Secrets Editor",
        vscode.ViewColumn.One,
        expect.objectContaining({
          enableScripts: true,
          retainContextWhenHidden: true,
        }),
      );
    });

    it("reveals existing panel instead of creating duplicate", () => {
      SecretsPanel.createOrShow(ctx as any, client, treeProvider);
      const firstCallCount = (vscode.window.createWebviewPanel as any).mock.calls.length;

      const panel = (vscode.window as any)._getLastPanel();

      SecretsPanel.createOrShow(ctx as any, client, treeProvider);
      const secondCallCount = (vscode.window.createWebviewPanel as any).mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount);
      expect(panel.reveal).toHaveBeenCalled();
    });

    it("posts selectSecret message when secretName arg is provided", () => {
      SecretsPanel.createOrShow(ctx as any, client, treeProvider, undefined, "ANTHROPIC_API_KEY");

      const panel = (vscode.window as any)._getLastPanel();
      expect(panel.webview.postMessage).toHaveBeenCalledWith({
        command: "selectSecret",
        name: "ANTHROPIC_API_KEY",
      });
    });
  });

  describe("message handling", () => {
    function setupPanelAndGetEmitter() {
      SecretsPanel.createOrShow(ctx as any, client, treeProvider);
      const panel = (vscode.window as any)._getLastPanel();
      return panel.webview._onDidReceiveMessageEmitter;
    }

    it("'getSecrets' calls client.listSecrets and posts secretsList response", async () => {
      const secrets: SecretMeta[] = [
        { name: "key1", category: "api", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        { name: "key2", createdAt: "2026-01-02", updatedAt: "2026-01-02" },
      ];
      (client.listSecrets as any).mockResolvedValue(secrets);

      const emitter = setupPanelAndGetEmitter();
      const panel = (vscode.window as any)._getLastPanel();

      emitter.fire({ command: "getSecrets" });

      await vi.waitFor(() => {
        expect(client.listSecrets).toHaveBeenCalled();
        expect(panel.webview.postMessage).toHaveBeenCalledWith({
          command: "secretsList",
          data: secrets,
        });
      });
    });

    it("'getSecretValue' calls client.getSecretValue and posts secretValue response", async () => {
      (client.getSecretValue as any).mockResolvedValue("my-secret-value");

      const emitter = setupPanelAndGetEmitter();
      const panel = (vscode.window as any)._getLastPanel();

      emitter.fire({ command: "getSecretValue", name: "my-key" });

      await vi.waitFor(() => {
        expect(client.getSecretValue).toHaveBeenCalledWith("my-key");
        expect(panel.webview.postMessage).toHaveBeenCalledWith({
          command: "secretValue",
          data: { name: "my-key", value: "my-secret-value" },
        });
      });
    });

    it("'saveSecret' for new secret calls client.createSecret", async () => {
      const emitter = setupPanelAndGetEmitter();

      emitter.fire({
        command: "saveSecret",
        name: "new-secret",
        value: "new-value",
        category: "api",
        tags: ["prod"],
        isNew: true,
      });

      await vi.waitFor(() => {
        expect(client.createSecret).toHaveBeenCalledWith("new-secret", "new-value", "api", ["prod"]);
      });
    });

    it("'saveSecret' for existing secret calls client.updateSecret", async () => {
      const emitter = setupPanelAndGetEmitter();

      emitter.fire({
        command: "saveSecret",
        name: "existing-secret",
        value: "updated-value",
        category: "db",
        tags: [],
        isNew: false,
      });

      await vi.waitFor(() => {
        expect(client.updateSecret).toHaveBeenCalledWith("existing-secret", "updated-value", "db", []);
      });
    });

    it("'saveSecret' for ANTHROPIC_API_KEY also calls client.setEnv", async () => {
      const emitter = setupPanelAndGetEmitter();

      emitter.fire({
        command: "saveSecret",
        name: "ANTHROPIC_API_KEY",
        value: "sk-ant-12345",
        isNew: true,
      });

      await vi.waitFor(() => {
        expect(client.createSecret).toHaveBeenCalled();
        expect(client.setEnv).toHaveBeenCalledWith("ANTHROPIC_API_KEY", "sk-ant-12345");
      });
    });

    it("'deleteSecret' calls client.deleteSecret", async () => {
      // Set up mock BEFORE firing message so it resolves correctly
      (vscode.window.showWarningMessage as any).mockResolvedValueOnce("Delete");

      const emitter = setupPanelAndGetEmitter();

      emitter.fire({ command: "confirmDelete", name: "old-key" });

      await vi.waitFor(() => {
        expect(vscode.window.showWarningMessage).toHaveBeenCalled();
        expect(client.deleteSecret).toHaveBeenCalledWith("old-key");
      });
    });

    it("'copySecret' calls vscode.env.clipboard.writeText (not navigator.clipboard)", async () => {
      (client.getSecretValue as any).mockResolvedValue("secret-to-copy");

      const emitter = setupPanelAndGetEmitter();

      emitter.fire({ command: "copySecret", name: "copy-key" });

      await vi.waitFor(() => {
        expect(client.getSecretValue).toHaveBeenCalledWith("copy-key");
        expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith("secret-to-copy");
      });
    });

    it("after save, refreshes tree provider", async () => {
      const secrets: SecretMeta[] = [
        { name: "key1", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      ];
      (client.listSecrets as any).mockResolvedValue(secrets);

      const emitter = setupPanelAndGetEmitter();

      emitter.fire({
        command: "saveSecret",
        name: "key1",
        value: "val",
        isNew: true,
      });

      await vi.waitFor(() => {
        expect(treeProvider.update).toHaveBeenCalledWith(secrets);
      });
    });

    it("after delete, refreshes tree provider", async () => {
      const secrets: SecretMeta[] = [];
      (client.listSecrets as any).mockResolvedValue(secrets);
      (vscode.window.showWarningMessage as any).mockResolvedValueOnce("Delete");

      const emitter = setupPanelAndGetEmitter();

      emitter.fire({ command: "confirmDelete", name: "to-delete" });

      await vi.waitFor(() => {
        expect(treeProvider.update).toHaveBeenCalledWith(secrets);
      });
    });
  });

  describe("HTML output", () => {
    it("includes CSP meta tag with nonce", () => {
      SecretsPanel.createOrShow(ctx as any, client, treeProvider);
      const panel = (vscode.window as any)._getLastPanel();
      const html = panel.webview.html;

      expect(html).toContain("Content-Security-Policy");
      expect(html).toContain("nonce-");
    });
  });
});
