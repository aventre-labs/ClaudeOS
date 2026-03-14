"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode2 = __toESM(require("vscode"));

// src/supervisor/client.ts
var SupervisorClient = class {
  baseUrl;
  constructor(baseUrl = "http://localhost:3100/api/v1") {
    this.baseUrl = baseUrl;
  }
  /**
   * Install an extension via the supervisor.
   */
  async installExtension(body) {
    const response = await fetch(`${this.baseUrl}/extensions/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Install extension failed (${response.status}): ${text}`);
    }
    return response.json();
  }
  /**
   * List all installed extensions.
   */
  async listExtensions() {
    const response = await fetch(`${this.baseUrl}/extensions`, {
      method: "GET"
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`List extensions failed (${response.status}): ${text}`);
    }
    return response.json();
  }
  /**
   * Uninstall an extension by ID.
   */
  async uninstallExtension(extensionId) {
    const response = await fetch(
      `${this.baseUrl}/extensions/${encodeURIComponent(extensionId)}`,
      { method: "DELETE" }
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Uninstall extension failed (${response.status}): ${text}`);
    }
  }
};

// src/commands/install-extension.ts
var vscode = __toESM(require("vscode"));
function registerInstallCommand(context, client, outputChannel2) {
  return vscode.commands.registerCommand(
    "claudeos.selfImprove.installExtension",
    async () => {
      const method = await vscode.window.showQuickPick(
        [
          { label: "From GitHub Release", value: "github-release", description: "Install from a GitHub release VSIX asset" },
          { label: "From Local Source", value: "build-from-source", description: "Build and install from a local directory" },
          { label: "From VSIX File", value: "local-vsix", description: "Install a pre-built .vsix file" }
        ],
        { placeHolder: "Select install method" }
      );
      if (!method) return;
      const body = { method: method.value };
      if (method.value === "github-release") {
        const repo = await vscode.window.showInputBox({
          prompt: "GitHub repository (owner/repo)",
          placeHolder: "aventre-labs/claudeos-memory"
        });
        if (!repo) return;
        body.repo = repo;
        const tag = await vscode.window.showInputBox({
          prompt: "Release tag",
          placeHolder: "v0.1.0"
        });
        if (!tag) return;
        body.tag = tag;
        const secretName = await detectGitHubPat();
        if (secretName) {
          body.secretName = secretName;
        }
      } else if (method.value === "build-from-source") {
        const selected = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: "Select Extension Directory"
        });
        if (!selected || selected.length === 0) return;
        body.localPath = selected[0].fsPath;
      } else if (method.value === "local-vsix") {
        const selected = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { VSIX: ["vsix"] },
          openLabel: "Select VSIX File"
        });
        if (!selected || selected.length === 0) return;
        body.localPath = selected[0].fsPath;
      }
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Installing extension...",
          cancellable: false
        },
        async (progress) => {
          progress.report({ message: "Sending install request..." });
          const target = body.repo ?? body.localPath ?? "unknown";
          outputChannel2.appendLine(`[${(/* @__PURE__ */ new Date()).toISOString()}] Installing via ${method.value}: ${target}`);
          outputChannel2.show(true);
          try {
            const result = await client.installExtension(body);
            if (result.state === "installed") {
              outputChannel2.appendLine(`[${(/* @__PURE__ */ new Date()).toISOString()}] Installed: ${result.name} v${result.version}`);
              await triggerReload(result.name, outputChannel2);
            } else if (result.state === "failed") {
              outputChannel2.appendLine(`[${(/* @__PURE__ */ new Date()).toISOString()}] FAILED: ${result.error}`);
              vscode.window.showErrorMessage(`Extension install failed: ${result.error}`);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            outputChannel2.appendLine(`[${(/* @__PURE__ */ new Date()).toISOString()}] ERROR: ${msg}`);
            vscode.window.showErrorMessage(`Extension install error: ${msg}`);
          }
        }
      );
    }
  );
}
async function detectGitHubPat() {
  try {
    const secretsExt = vscode.extensions.getExtension("claudeos.claudeos-secrets");
    if (!secretsExt || !secretsExt.isActive) return void 0;
    const api = secretsExt.exports;
    if (!api) return void 0;
    const allSecrets = await api.listSecrets();
    const patSecrets = allSecrets.filter(
      (s) => s.category === "github-pat" || s.name.toLowerCase().includes("github")
    );
    if (patSecrets.length === 0) return void 0;
    if (patSecrets.length === 1) {
      return patSecrets[0].name;
    }
    const items = patSecrets.map((s) => ({ label: s.name, value: s.name }));
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "Select GitHub PAT for private repo access"
    });
    return picked?.value;
  } catch {
    return void 0;
  }
}
async function triggerReload(extensionName, outputChannel2) {
  let reloadBehavior = "force";
  try {
    const res = await fetch("http://localhost:3100/api/v1/settings");
    if (res.ok) {
      const settings = await res.json();
      reloadBehavior = settings.reloadBehavior ?? "force";
    }
  } catch {
    outputChannel2.appendLine(
      `[${(/* @__PURE__ */ new Date()).toISOString()}] Could not fetch supervisor settings, defaulting to force reload`
    );
  }
  if (reloadBehavior === "force") {
    outputChannel2.appendLine(`[${(/* @__PURE__ */ new Date()).toISOString()}] Force-reloading window for "${extensionName}"`);
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
  } else {
    const action = await vscode.window.showInformationMessage(
      `Extension "${extensionName}" installed successfully. Reload to activate.`,
      "Reload Window"
    );
    if (action === "Reload Window") {
      await vscode.commands.executeCommand("workbench.action.reloadWindow");
    }
  }
}

// src/mcp/register.ts
var import_node_child_process = require("node:child_process");
var import_node_util = require("node:util");
var import_node_path = require("node:path");
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process.execFile);
async function registerMcpServer(extensionPath) {
  const serverScript = (0, import_node_path.join)(extensionPath, "out", "mcp-server.js");
  const config = JSON.stringify({
    type: "stdio",
    command: "node",
    args: [serverScript]
  });
  try {
    await execFileAsync("claude", [
      "mcp",
      "add-json",
      "claudeos-self-improve",
      config,
      "--scope",
      "user"
    ], { timeout: 1e4 });
  } catch (err) {
    console.error("Failed to register MCP server:", err);
  }
}
async function deregisterMcpServer() {
  try {
    await execFileAsync("claude", [
      "mcp",
      "remove",
      "claudeos-self-improve"
    ], { timeout: 1e4 });
  } catch {
  }
}

// src/skill/skill-content.ts
var import_promises = require("node:fs/promises");
var import_node_path2 = require("node:path");
var SKILL_PATH = "/data/config/claudeos-skill.md";
var SKILL_CONTENT = `# ClaudeOS Self-Improvement Skill

You are running inside ClaudeOS, a VS Code-based operating environment for Claude Code.

## What You Can Do

You have access to MCP tools for managing ClaudeOS extensions:

- **install_extension**: Install an extension from GitHub release, local source, or VSIX file
- **uninstall_extension**: Uninstall an extension by its VS Code extension ID
- **list_extensions**: List all installed extensions and their status
- **get_extension_template**: Get the template repo URL for scaffolding new extensions

## Building New Extensions

When asked to build a new feature for ClaudeOS:

1. Call get_extension_template to get the template repo URL
2. Clone/fork the template into the current working directory
3. Implement the extension (TypeScript, esbuild, VS Code API)
4. Build: npm run compile && npm run package
5. Install: call install_extension with method "build-from-source" and localPath pointing to the extension directory

Extensions are standard VS Code extensions. They communicate with the supervisor at http://localhost:3100/api/v1.

## Key Constraints

- Never modify Claude Code itself -- it runs stock in tmux
- Never fork code-server -- extend via VS Code extensions only
- Store persistent data in /data/extensions/{extension-name}/
- Use the claudeos-secrets API for any credentials
`;
async function writeSkillFile() {
  await (0, import_promises.mkdir)((0, import_node_path2.dirname)(SKILL_PATH), { recursive: true });
  await (0, import_promises.writeFile)(SKILL_PATH, SKILL_CONTENT, "utf-8");
}

// src/extension.ts
var outputChannel;
function log(message) {
  outputChannel?.appendLine(`[${(/* @__PURE__ */ new Date()).toISOString()}] ${message}`);
}
async function activate(context) {
  outputChannel = vscode2.window.createOutputChannel("ClaudeOS Extensions");
  context.subscriptions.push(outputChannel);
  log("Activating ClaudeOS Self-Improve extension");
  const client = new SupervisorClient();
  const installCmd = registerInstallCommand(context, client, outputChannel);
  context.subscriptions.push(installCmd);
  try {
    await registerMcpServer(context.extensionPath);
    log("MCP server registered with Claude Code");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`MCP registration failed (will retry on Claude CLI availability): ${msg}`);
  }
  try {
    await writeSkillFile();
    log("Skill file written to /data/config/claudeos-skill.md");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Skill file write failed (non-fatal): ${msg}`);
  }
  log("ClaudeOS Self-Improve extension activated");
}
async function deactivate() {
  await deregisterMcpServer();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
