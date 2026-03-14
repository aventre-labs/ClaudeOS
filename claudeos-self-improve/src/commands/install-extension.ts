// ============================================================
// ClaudeOS Self-Improve Extension - Install Extension Command
// ============================================================
// Command palette install flow with QuickPick, InputBox,
// PAT detection from claudeos-secrets, progress notifications,
// output channel logging, and post-install reload behavior.
// ============================================================

import * as vscode from "vscode";
import type { SupervisorClient, InstallExtensionBody } from "../supervisor/client.js";
import type { SecretsPublicApi } from "../types.js";

interface QuickPickMethod {
  label: string;
  value: InstallExtensionBody["method"];
  description: string;
}

/**
 * Register the "ClaudeOS: Install Extension" command.
 * Returns a Disposable that the caller should push to context.subscriptions.
 */
export function registerInstallCommand(
  context: vscode.ExtensionContext,
  client: SupervisorClient,
  outputChannel: vscode.OutputChannel,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "claudeos.selfImprove.installExtension",
    async () => {
      // Step 1: Pick install method
      const method = await vscode.window.showQuickPick<QuickPickMethod>(
        [
          { label: "From GitHub Release", value: "github-release", description: "Install from a GitHub release VSIX asset" },
          { label: "From Local Source", value: "build-from-source", description: "Build and install from a local directory" },
          { label: "From VSIX File", value: "local-vsix", description: "Install a pre-built .vsix file" },
        ],
        { placeHolder: "Select install method" },
      );
      if (!method) return;

      // Step 2: Collect method-specific inputs
      const body: InstallExtensionBody & { secretName?: string } = { method: method.value };

      if (method.value === "github-release") {
        const repo = await vscode.window.showInputBox({
          prompt: "GitHub repository (owner/repo)",
          placeHolder: "aventre-labs/claudeos-memory",
        });
        if (!repo) return;
        body.repo = repo;

        const tag = await vscode.window.showInputBox({
          prompt: "Release tag",
          placeHolder: "v0.1.0",
        });
        if (!tag) return;
        body.tag = tag;

        // Auto-detect PAT from claudeos-secrets
        const secretName = await detectGitHubPat();
        if (secretName) {
          body.secretName = secretName;
        }
      } else if (method.value === "build-from-source") {
        const selected = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: "Select Extension Directory",
        });
        if (!selected || selected.length === 0) return;
        body.localPath = selected[0].fsPath;
      } else if (method.value === "local-vsix") {
        const selected = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { VSIX: ["vsix"] },
          openLabel: "Select VSIX File",
        });
        if (!selected || selected.length === 0) return;
        body.localPath = selected[0].fsPath;
      }

      // Step 3: Execute install with progress
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Installing extension...",
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: "Sending install request..." });
          const target = body.repo ?? body.localPath ?? "unknown";
          outputChannel.appendLine(`[${new Date().toISOString()}] Installing via ${method.value}: ${target}`);
          outputChannel.show(true);

          try {
            const result = await client.installExtension(body);
            if (result.state === "installed") {
              outputChannel.appendLine(`[${new Date().toISOString()}] Installed: ${result.name} v${result.version}`);
              await triggerReload(result.name, outputChannel);
            } else if (result.state === "failed") {
              outputChannel.appendLine(`[${new Date().toISOString()}] FAILED: ${result.error}`);
              vscode.window.showErrorMessage(`Extension install failed: ${result.error}`);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            outputChannel.appendLine(`[${new Date().toISOString()}] ERROR: ${msg}`);
            vscode.window.showErrorMessage(`Extension install error: ${msg}`);
          }
        },
      );
    },
  );
}

/**
 * Detect GitHub PAT secrets from the claudeos-secrets extension.
 * Returns the secret name to use, or undefined if none found.
 */
async function detectGitHubPat(): Promise<string | undefined> {
  try {
    const secretsExt = vscode.extensions.getExtension<SecretsPublicApi>("claudeos.claudeos-secrets");
    if (!secretsExt || !secretsExt.isActive) return undefined;

    const api = secretsExt.exports;
    if (!api) return undefined;

    const allSecrets = await api.listSecrets();
    const patSecrets = allSecrets.filter(
      (s) => s.category === "github-pat" || s.name.toLowerCase().includes("github"),
    );

    if (patSecrets.length === 0) return undefined;

    if (patSecrets.length === 1) {
      return patSecrets[0].name;
    }

    // Multiple PATs: let user choose
    const items = patSecrets.map((s) => ({ label: s.name, value: s.name }));
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "Select GitHub PAT for private repo access",
    });
    return picked?.value;
  } catch {
    // Secrets extension unavailable or errored -- skip gracefully
    return undefined;
  }
}

/**
 * Trigger window reload based on supervisor reloadBehavior setting.
 * Defaults to "force" if settings cannot be fetched.
 */
async function triggerReload(
  extensionName: string,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  let reloadBehavior: "force" | "notification" = "force";
  try {
    const res = await fetch("http://localhost:3100/api/v1/settings");
    if (res.ok) {
      const settings = (await res.json()) as { reloadBehavior?: "force" | "notification" };
      reloadBehavior = settings.reloadBehavior ?? "force";
    }
  } catch {
    outputChannel.appendLine(
      `[${new Date().toISOString()}] Could not fetch supervisor settings, defaulting to force reload`,
    );
  }

  if (reloadBehavior === "force") {
    outputChannel.appendLine(`[${new Date().toISOString()}] Force-reloading window for "${extensionName}"`);
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
  } else {
    const action = await vscode.window.showInformationMessage(
      `Extension "${extensionName}" installed successfully. Reload to activate.`,
      "Reload Window",
    );
    if (action === "Reload Window") {
      await vscode.commands.executeCommand("workbench.action.reloadWindow");
    }
  }
}
