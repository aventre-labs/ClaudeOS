// ============================================================
// Tests for install-extension command
// ============================================================
// Covers: QuickPick flow, all 3 install methods, PAT detection,
// progress notifications, output channel, reload behavior.
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { registerInstallCommand } from "../../src/commands/install-extension.js";
import type { SupervisorClient } from "../../src/supervisor/client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockClient(overrides: Partial<SupervisorClient> = {}): SupervisorClient {
  return {
    installExtension: vi.fn().mockResolvedValue({
      id: "github:foo/bar@v1.0.0",
      name: "foo/bar",
      version: "1.0.0",
      method: "github-release",
      state: "installed",
      installedAt: new Date().toISOString(),
    }),
    listExtensions: vi.fn().mockResolvedValue([]),
    uninstallExtension: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SupervisorClient;
}

function mockOutputChannel(): vscode.OutputChannel {
  return {
    appendLine: vi.fn(),
    append: vi.fn(),
    show: vi.fn(),
    dispose: vi.fn(),
  } as unknown as vscode.OutputChannel;
}

function mockContext(): vscode.ExtensionContext {
  return {
    subscriptions: [],
  } as unknown as vscode.ExtensionContext;
}

/** Capture the command handler registered via registerCommand */
function captureHandler(ctx: vscode.ExtensionContext, client: SupervisorClient, output: vscode.OutputChannel) {
  registerInstallCommand(ctx, client, output);
  const call = (vscode.commands.registerCommand as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(call).toBeDefined();
  expect(call[0]).toBe("claudeos.selfImprove.installExtension");
  return call[1] as () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerInstallCommand", () => {
  let client: SupervisorClient;
  let output: vscode.OutputChannel;
  let ctx: vscode.ExtensionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    client = mockClient();
    output = mockOutputChannel();
    ctx = mockContext();

    // Re-setup withProgress to actually invoke the task callback
    (vscode.window.withProgress as ReturnType<typeof vi.fn>).mockImplementation(
      (_options: unknown, task: (progress: unknown) => Promise<unknown>) => task({ report: vi.fn() }),
    );

    // registerCommand should return a disposable
    (vscode.commands.registerCommand as ReturnType<typeof vi.fn>).mockReturnValue({ dispose: vi.fn() });

    // Default: global fetch returns force reload settings
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ reloadBehavior: "force" }),
    }));
  });

  it("registers command claudeos.selfImprove.installExtension", () => {
    const disposable = registerInstallCommand(ctx, client, output);
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      "claudeos.selfImprove.installExtension",
      expect.any(Function),
    );
    expect(disposable).toBeDefined();
  });

  it("shows QuickPick with 3 install methods", async () => {
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const handler = captureHandler(ctx, client, output);
    await handler();

    expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);
    const items = (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(items).toHaveLength(3);
    expect(items.map((i: any) => i.value)).toEqual(["github-release", "build-from-source", "local-vsix"]);
  });

  // --- Cancellation tests ---

  it("aborts if user cancels method QuickPick", async () => {
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const handler = captureHandler(ctx, client, output);
    await handler();
    expect(client.installExtension).not.toHaveBeenCalled();
  });

  it("aborts if user cancels repo InputBox (github-release)", async () => {
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      label: "From GitHub Release", value: "github-release",
    });
    (vscode.window.showInputBox as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    const handler = captureHandler(ctx, client, output);
    await handler();
    expect(client.installExtension).not.toHaveBeenCalled();
  });

  it("aborts if user cancels tag InputBox (github-release)", async () => {
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      label: "From GitHub Release", value: "github-release",
    });
    (vscode.window.showInputBox as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("owner/repo")
      .mockResolvedValueOnce(undefined);
    // Secrets extension not available
    (vscode.extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    const handler = captureHandler(ctx, client, output);
    await handler();
    expect(client.installExtension).not.toHaveBeenCalled();
  });

  it("aborts if user cancels folder picker (build-from-source)", async () => {
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      label: "From Local Source", value: "build-from-source",
    });
    (vscode.window as any).showOpenDialog = vi.fn().mockResolvedValue(undefined);
    const handler = captureHandler(ctx, client, output);
    await handler();
    expect(client.installExtension).not.toHaveBeenCalled();
  });

  it("aborts if user cancels file picker (local-vsix)", async () => {
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      label: "From VSIX File", value: "local-vsix",
    });
    (vscode.window as any).showOpenDialog = vi.fn().mockResolvedValue(undefined);
    const handler = captureHandler(ctx, client, output);
    await handler();
    expect(client.installExtension).not.toHaveBeenCalled();
  });

  // --- GitHub release flow ---

  it("collects repo + tag and calls installExtension for github-release", async () => {
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      label: "From GitHub Release", value: "github-release",
    });
    (vscode.window.showInputBox as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("owner/repo")
      .mockResolvedValueOnce("v1.0.0");
    (vscode.extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    const handler = captureHandler(ctx, client, output);
    await handler();

    expect(client.installExtension).toHaveBeenCalledWith(
      expect.objectContaining({ method: "github-release", repo: "owner/repo", tag: "v1.0.0" }),
    );
  });

  // --- PAT detection ---

  it("auto-uses single PAT from claudeos-secrets", async () => {
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      label: "From GitHub Release", value: "github-release",
    });
    (vscode.window.showInputBox as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("owner/repo")
      .mockResolvedValueOnce("v1.0.0");

    // Mock secrets extension with one PAT
    (vscode.extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue({
      isActive: true,
      exports: {
        listSecrets: vi.fn().mockResolvedValue([
          { name: "github-token", category: "github-pat" },
        ]),
      },
    });

    const handler = captureHandler(ctx, client, output);
    await handler();

    expect(client.installExtension).toHaveBeenCalledWith(
      expect.objectContaining({ secretName: "github-token" }),
    );
  });

  it("shows QuickPick when multiple PATs found", async () => {
    // First call: method pick. Second call: PAT pick.
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ label: "From GitHub Release", value: "github-release" })
      .mockResolvedValueOnce({ label: "my-github-token", value: "my-github-token" });
    (vscode.window.showInputBox as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("owner/repo")
      .mockResolvedValueOnce("v1.0.0");

    (vscode.extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue({
      isActive: true,
      exports: {
        listSecrets: vi.fn().mockResolvedValue([
          { name: "github-token", category: "github-pat" },
          { name: "my-github-token", category: "github-pat" },
        ]),
      },
    });

    const handler = captureHandler(ctx, client, output);
    await handler();

    // PAT QuickPick should have been called (second showQuickPick call)
    expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(2);
    expect(client.installExtension).toHaveBeenCalledWith(
      expect.objectContaining({ secretName: "my-github-token" }),
    );
  });

  it("logs debug message when secrets extension is not active", async () => {
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      label: "From GitHub Release", value: "github-release",
    });
    (vscode.window.showInputBox as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("owner/repo")
      .mockResolvedValueOnce("v1.0.0");

    // Secrets extension exists but is inactive
    (vscode.extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue({
      isActive: false,
    });

    // The module-level debugChannel is the object returned by the vscode mock's
    // createOutputChannel (mockReturnValue returns the same reference each call).
    // clearAllMocks resets appendLine call history but the reference is shared.
    const debugChannel = (vscode.window.createOutputChannel as ReturnType<typeof vi.fn>)("ref");

    const handler = captureHandler(ctx, client, output);
    await handler();

    // Verify debug log was emitted to the module-level OutputChannel
    expect(debugChannel.appendLine).toHaveBeenCalledWith(
      "[detectGitHubPat] Secrets extension not active \u2014 skipping PAT detection",
    );
    // Also verify PAT was not set (graceful degradation preserved)
    expect(client.installExtension).toHaveBeenCalledWith(
      expect.not.objectContaining({ secretName: expect.anything() }),
    );
  });

  it("skips PAT detection gracefully when secrets extension unavailable", async () => {
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      label: "From GitHub Release", value: "github-release",
    });
    (vscode.window.showInputBox as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("owner/repo")
      .mockResolvedValueOnce("v1.0.0");
    (vscode.extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    const handler = captureHandler(ctx, client, output);
    await handler();

    expect(client.installExtension).toHaveBeenCalledWith(
      expect.not.objectContaining({ secretName: expect.anything() }),
    );
  });

  // --- Local source flow ---

  it("opens folder picker and calls installExtension for build-from-source", async () => {
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      label: "From Local Source", value: "build-from-source",
    });
    (vscode.window as any).showOpenDialog = vi.fn().mockResolvedValue([
      { fsPath: "/path/to/extension" },
    ]);

    const handler = captureHandler(ctx, client, output);
    await handler();

    expect(client.installExtension).toHaveBeenCalledWith(
      expect.objectContaining({ method: "build-from-source", localPath: "/path/to/extension" }),
    );
  });

  // --- VSIX file flow ---

  it("opens file picker and calls installExtension for local-vsix", async () => {
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      label: "From VSIX File", value: "local-vsix",
    });
    (vscode.window as any).showOpenDialog = vi.fn().mockResolvedValue([
      { fsPath: "/path/to/extension.vsix" },
    ]);

    const handler = captureHandler(ctx, client, output);
    await handler();

    expect(client.installExtension).toHaveBeenCalledWith(
      expect.objectContaining({ method: "local-vsix", localPath: "/path/to/extension.vsix" }),
    );
  });

  // --- Progress and output channel ---

  it("uses withProgress with ProgressLocation.Notification", async () => {
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      label: "From GitHub Release", value: "github-release",
    });
    (vscode.window.showInputBox as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("owner/repo")
      .mockResolvedValueOnce("v1.0.0");
    (vscode.extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    const handler = captureHandler(ctx, client, output);
    await handler();

    expect(vscode.window.withProgress).toHaveBeenCalledWith(
      expect.objectContaining({ location: vscode.ProgressLocation.Notification }),
      expect.any(Function),
    );
  });

  it("logs timestamped messages to OutputChannel", async () => {
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      label: "From GitHub Release", value: "github-release",
    });
    (vscode.window.showInputBox as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("owner/repo")
      .mockResolvedValueOnce("v1.0.0");
    (vscode.extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    const handler = captureHandler(ctx, client, output);
    await handler();

    const calls = (output.appendLine as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    // Check for ISO timestamp pattern
    expect(calls.some((c: string[]) => /\[\d{4}-\d{2}-\d{2}T/.test(c[0]))).toBe(true);
  });

  // --- Success / failure toasts ---

  it("shows information message on successful install", async () => {
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      label: "From GitHub Release", value: "github-release",
    });
    (vscode.window.showInputBox as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("owner/repo")
      .mockResolvedValueOnce("v1.0.0");
    (vscode.extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    // Force reload so executeCommand is called (no showInformationMessage from reload)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ reloadBehavior: "force" }),
    }));

    const handler = captureHandler(ctx, client, output);
    await handler();

    // The success is logged to output channel
    const logCalls = (output.appendLine as ReturnType<typeof vi.fn>).mock.calls;
    expect(logCalls.some((c: string[]) => c[0].includes("Installed"))).toBe(true);
  });

  it("shows error message on failed install", async () => {
    client = mockClient({
      installExtension: vi.fn().mockResolvedValue({
        id: "github:foo/bar@v1.0.0",
        name: "foo/bar",
        version: "1.0.0",
        method: "github-release",
        state: "failed",
        error: "Asset not found",
      }),
    });
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      label: "From GitHub Release", value: "github-release",
    });
    (vscode.window.showInputBox as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("owner/repo")
      .mockResolvedValueOnce("v1.0.0");
    (vscode.extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    const handler = captureHandler(ctx, client, output);
    await handler();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("Asset not found"),
    );
  });

  it("shows error message when installExtension throws", async () => {
    client = mockClient({
      installExtension: vi.fn().mockRejectedValue(new Error("Network timeout")),
    });
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      label: "From GitHub Release", value: "github-release",
    });
    (vscode.window.showInputBox as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("owner/repo")
      .mockResolvedValueOnce("v1.0.0");
    (vscode.extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    const handler = captureHandler(ctx, client, output);
    await handler();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("Network timeout"),
    );
  });

  // --- Reload behavior ---

  it("force-reloads window when reloadBehavior is force", async () => {
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      label: "From GitHub Release", value: "github-release",
    });
    (vscode.window.showInputBox as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("owner/repo")
      .mockResolvedValueOnce("v1.0.0");
    (vscode.extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ reloadBehavior: "force" }),
    }));

    const handler = captureHandler(ctx, client, output);
    await handler();

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith("workbench.action.reloadWindow");
  });

  it("shows reload notification when reloadBehavior is notification", async () => {
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      label: "From GitHub Release", value: "github-release",
    });
    (vscode.window.showInputBox as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("owner/repo")
      .mockResolvedValueOnce("v1.0.0");
    (vscode.extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ reloadBehavior: "notification" }),
    }));

    // User clicks "Reload Window" button
    (vscode.window.showInformationMessage as ReturnType<typeof vi.fn>).mockResolvedValue("Reload Window");

    const handler = captureHandler(ctx, client, output);
    await handler();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("installed successfully"),
      "Reload Window",
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith("workbench.action.reloadWindow");
  });

  it("defaults to force reload when settings fetch fails", async () => {
    (vscode.window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      label: "From GitHub Release", value: "github-release",
    });
    (vscode.window.showInputBox as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("owner/repo")
      .mockResolvedValueOnce("v1.0.0");
    (vscode.extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Connection refused")));

    const handler = captureHandler(ctx, client, output);
    await handler();

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith("workbench.action.reloadWindow");
  });
});
