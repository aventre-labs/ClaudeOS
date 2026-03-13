// ============================================================
// First-Run Walkthrough Tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { checkFirstRun } from "../../src/onboarding/first-run.js";
import type { SupervisorClient } from "../../src/supervisor/client.js";

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
    listSecrets: vi.fn().mockResolvedValue([]),
    getSecretValue: vi.fn().mockResolvedValue(""),
    createSecret: vi.fn().mockResolvedValue({}),
    updateSecret: vi.fn().mockResolvedValue({}),
    deleteSecret: vi.fn().mockResolvedValue(undefined),
    hasSecret: vi.fn().mockResolvedValue(false),
    setEnv: vi.fn().mockResolvedValue(undefined),
  } as unknown as SupervisorClient;
}

describe("checkFirstRun", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let client: SupervisorClient;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    client = createMockClient();
  });

  it("shows info message on first activation (hasRunBefore=false)", async () => {
    await checkFirstRun(ctx as any, client);

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("Welcome to ClaudeOS"),
      "Set Up Now",
      "Later",
    );
  });

  it("does not show message on subsequent activations (hasRunBefore=true)", async () => {
    // Simulate first run already happened
    ctx.globalState.update("claudeos.secrets.hasRunBefore", true);

    await checkFirstRun(ctx as any, client);

    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  });

  it("'Set Up Now' action opens secrets editor for ANTHROPIC_API_KEY", async () => {
    (vscode.window.showInformationMessage as any).mockResolvedValueOnce("Set Up Now");

    await checkFirstRun(ctx as any, client);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      "claudeos.secrets.openEditor",
      "ANTHROPIC_API_KEY",
    );
  });

  it("sets hasRunBefore=true after first run", async () => {
    await checkFirstRun(ctx as any, client);

    expect(ctx.globalState.update).toHaveBeenCalledWith(
      "claudeos.secrets.hasRunBefore",
      true,
    );
  });

  it("sets context key claudeos.secrets.anthropicKeyConfigured", async () => {
    (client.hasSecret as any).mockResolvedValue(true);

    await checkFirstRun(ctx as any, client);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      "setContext",
      "claudeos.secrets.anthropicKeyConfigured",
      true,
    );
  });

  it("sets anthropicKeyConfigured to false when key missing", async () => {
    (client.hasSecret as any).mockResolvedValue(false);

    await checkFirstRun(ctx as any, client);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      "setContext",
      "claudeos.secrets.anthropicKeyConfigured",
      false,
    );
  });
});
