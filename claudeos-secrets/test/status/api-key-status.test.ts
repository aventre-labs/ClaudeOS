// ============================================================
// ApiKeyStatusItem Tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { ApiKeyStatusItem } from "../../src/status/api-key-status.js";
import type { SupervisorClient } from "../../src/supervisor/client.js";

function createMockClient(): SupervisorClient {
  return {
    listSecrets: vi.fn().mockResolvedValue([]),
    getSecretValue: vi.fn().mockResolvedValue(""),
    createSecret: vi.fn().mockResolvedValue({}),
    updateSecret: vi.fn().mockResolvedValue({}),
    deleteSecret: vi.fn().mockResolvedValue(undefined),
    hasSecret: vi.fn().mockResolvedValue(false),
    setEnv: vi.fn().mockResolvedValue(undefined),
  } as unknown as SupervisorClient;
}

describe("ApiKeyStatusItem", () => {
  let client: SupervisorClient;

  beforeEach(() => {
    vi.clearAllMocks();
    (vscode.window as any)._resetStatusBarItem();
    client = createMockClient();
  });

  it("creates status bar item and shows it", () => {
    const statusItem = new ApiKeyStatusItem(client);

    expect(vscode.window.createStatusBarItem).toHaveBeenCalled();
    const item = (vscode.window as any)._getLastStatusBarItem();
    expect(item.show).toHaveBeenCalled();

    statusItem.dispose();
  });

  it("shows checkmark text when Anthropic key exists", async () => {
    (client.hasSecret as any).mockResolvedValue(true);

    const statusItem = new ApiKeyStatusItem(client);
    await statusItem.refresh();

    const item = (vscode.window as any)._getLastStatusBarItem();
    expect(item.text).toBe("$(key) API Key");
    expect(item.tooltip).toContain("configured");
    expect(item.backgroundColor).toBeUndefined();

    statusItem.dispose();
  });

  it("shows warning text when Anthropic key is missing", async () => {
    (client.hasSecret as any).mockResolvedValue(false);

    const statusItem = new ApiKeyStatusItem(client);
    await statusItem.refresh();

    const item = (vscode.window as any)._getLastStatusBarItem();
    expect(item.text).toBe("$(warning) API Key");
    expect(item.tooltip).toContain("not configured");
    expect(item.backgroundColor).toBeDefined();
    expect(item.backgroundColor!.id).toBe("statusBarItem.warningBackground");

    statusItem.dispose();
  });

  it("has command that opens secrets editor for ANTHROPIC_API_KEY", () => {
    const statusItem = new ApiKeyStatusItem(client);

    const item = (vscode.window as any)._getLastStatusBarItem();
    expect(item.command).toBe("claudeos.secrets.openAnthropicKey");

    statusItem.dispose();
  });

  it("refresh() re-checks hasSecret and updates display", async () => {
    (client.hasSecret as any).mockResolvedValue(false);

    const statusItem = new ApiKeyStatusItem(client);
    await statusItem.refresh();

    const item = (vscode.window as any)._getLastStatusBarItem();
    expect(item.text).toBe("$(warning) API Key");

    // Now key exists
    (client.hasSecret as any).mockResolvedValue(true);
    await statusItem.refresh();

    expect(item.text).toBe("$(key) API Key");
    expect(client.hasSecret).toHaveBeenCalledTimes(2);

    statusItem.dispose();
  });

  it("dispose() disposes the status bar item", () => {
    const statusItem = new ApiKeyStatusItem(client);
    const item = (vscode.window as any)._getLastStatusBarItem();

    statusItem.dispose();

    expect(item.dispose).toHaveBeenCalled();
  });
});
