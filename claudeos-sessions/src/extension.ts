// ============================================================
// ClaudeOS Sessions Extension - Entry Point
// ============================================================
// Activates the session sidebar and terminal tabs for ClaudeOS.
// Wires together: SupervisorClient, WsClient, SessionStore,
// SessionTreeProvider, TerminalManager, and all commands.
// ============================================================

import * as vscode from "vscode";
import { SupervisorClient } from "./supervisor/client.js";
import { WsClient } from "./supervisor/ws-client.js";
import { SessionStore } from "./state/session-store.js";
import { SessionTreeProvider, type TreeElement } from "./sidebar/session-tree.js";
import { TerminalManager } from "./terminal/terminal-manager.js";
import type { Session } from "./supervisor/types.js";

// --- Output Channel for debugging ---
let outputChannel: vscode.OutputChannel;

function log(message: string): void {
  outputChannel?.appendLine(`[${new Date().toISOString()}] ${message}`);
}

// --- Activate ---

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel("ClaudeOS Sessions");
  context.subscriptions.push(outputChannel);

  log("Activating ClaudeOS Sessions extension");

  // --- Core services ---
  const supervisorClient = new SupervisorClient();
  const wsClient = new WsClient();
  const sessionStore = new SessionStore(supervisorClient, wsClient);

  try {
    await sessionStore.initialize();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Failed to initialize session store: ${message}`);
    vscode.window.showErrorMessage(
      `ClaudeOS: Failed to connect to supervisor: ${message}`,
    );
  }

  // --- Sidebar tree view ---
  const treeProvider = new SessionTreeProvider(sessionStore);
  const treeView = vscode.window.createTreeView<TreeElement>(
    "claudeos.sessions",
    {
      treeDataProvider: treeProvider,
      showCollapseAll: true,
    },
  );
  treeProvider.setTreeView(treeView);

  // --- Terminal manager ---
  const terminalManager = new TerminalManager(
    supervisorClient,
    wsClient,
    sessionStore,
  );

  // --- Commands ---

  // Create session
  const createCmd = vscode.commands.registerCommand(
    "claudeos.sessions.create",
    async () => {
      try {
        const name = await vscode.window.showInputBox({
          prompt: "Session name (optional)",
          placeHolder: "My Session",
        });
        if (name === undefined) return; // User cancelled
        const session = await supervisorClient.createSession(
          name || undefined,
        );
        log(`Created session: ${session.id} (${session.name})`);
        treeProvider.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Failed to create session: ${message}`);
        vscode.window.showErrorMessage(
          `Failed to create session: ${message}`,
        );
      }
    },
  );

  // Rename session
  const renameCmd = vscode.commands.registerCommand(
    "claudeos.sessions.rename",
    async (element?: TreeElement) => {
      try {
        const session = extractSession(element);
        if (!session) return;

        const newName = await vscode.window.showInputBox({
          prompt: "New session name",
          value: session.name,
        });
        if (!newName || newName === session.name) return;

        await supervisorClient.renameSession(session.id, newName);
        log(`Renamed session ${session.id} to "${newName}"`);
        terminalManager.updateTerminalName(session.id, newName);
        treeProvider.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Failed to rename session: ${message}`);
        vscode.window.showErrorMessage(
          `Failed to rename session: ${message}`,
        );
      }
    },
  );

  // Open terminal
  const openTerminalCmd = vscode.commands.registerCommand(
    "claudeos.sessions.openTerminal",
    async (sessionOrElement?: Session | TreeElement) => {
      try {
        const session = extractSessionFromArg(sessionOrElement);
        if (!session) return;

        await terminalManager.openTerminal(session);
        log(`Opened terminal for session: ${session.id}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Failed to open terminal: ${message}`);
        vscode.window.showErrorMessage(
          `Failed to open terminal: ${message}`,
        );
      }
    },
  );

  // Stop session
  const stopCmd = vscode.commands.registerCommand(
    "claudeos.sessions.stop",
    async (element?: TreeElement) => {
      try {
        const session = extractSession(element);
        if (!session) return;

        await supervisorClient.stopSession(session.id);
        log(`Stopped session: ${session.id}`);
        treeProvider.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Failed to stop session: ${message}`);
        vscode.window.showErrorMessage(
          `Failed to stop session: ${message}`,
        );
      }
    },
  );

  // Kill session
  const killCmd = vscode.commands.registerCommand(
    "claudeos.sessions.kill",
    async (element?: TreeElement) => {
      try {
        const session = extractSession(element);
        if (!session) return;

        await supervisorClient.killSession(session.id);
        terminalManager.closeTerminal(session.id);
        log(`Killed session: ${session.id}`);
        treeProvider.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Failed to kill session: ${message}`);
        vscode.window.showErrorMessage(
          `Failed to kill session: ${message}`,
        );
      }
    },
  );

  // Archive session
  const archiveCmd = vscode.commands.registerCommand(
    "claudeos.sessions.archive",
    async (element?: TreeElement) => {
      try {
        const session = extractSession(element);
        if (!session) return;

        await supervisorClient.archiveSession(session.id);
        terminalManager.closeTerminal(session.id);
        log(`Archived session: ${session.id}`);
        treeProvider.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Failed to archive session: ${message}`);
        vscode.window.showErrorMessage(
          `Failed to archive session: ${message}`,
        );
      }
    },
  );

  // Delete session
  const deleteCmd = vscode.commands.registerCommand(
    "claudeos.sessions.delete",
    async (element?: TreeElement) => {
      try {
        const session = extractSession(element);
        if (!session) return;

        const confirm = await vscode.window.showWarningMessage(
          `Delete session "${session.name}"? This cannot be undone.`,
          { modal: true },
          "Delete",
        );
        if (confirm !== "Delete") return;

        await supervisorClient.killSession(session.id);
        terminalManager.closeTerminal(session.id);
        log(`Deleted session: ${session.id}`);
        treeProvider.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Failed to delete session: ${message}`);
        vscode.window.showErrorMessage(
          `Failed to delete session: ${message}`,
        );
      }
    },
  );

  // Revive session
  const reviveCmd = vscode.commands.registerCommand(
    "claudeos.sessions.revive",
    async (element?: TreeElement) => {
      try {
        const session = extractSession(element);
        if (!session) return;

        const revived = await supervisorClient.reviveSession(session.id);
        log(`Revived session: ${revived.id}`);
        treeProvider.refresh();
        await terminalManager.openTerminal(revived);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Failed to revive session: ${message}`);
        vscode.window.showErrorMessage(
          `Failed to revive session: ${message}`,
        );
      }
    },
  );

  // Refresh
  const refreshCmd = vscode.commands.registerCommand(
    "claudeos.sessions.refresh",
    async () => {
      try {
        await sessionStore.initialize();
        treeProvider.refresh();
        log("Refreshed sessions");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Failed to refresh sessions: ${message}`);
        vscode.window.showErrorMessage(
          `Failed to refresh sessions: ${message}`,
        );
      }
    },
  );

  // --- Status change handler ---
  // When session status changes, update terminal names and handle exits.
  const storeChangeDisposable = sessionStore.onDidChange(() => {
    for (const session of sessionStore.getSessions()) {
      const terminal = terminalManager.getTerminal(session.id);
      if (terminal) {
        // Update terminal name with status prefix
        const isExited =
          session.status === "stopped" ||
          session.status === "archived" ||
          session.status === "zombie";
        const prefix = isExited ? "[Stopped] " : "";
        terminalManager.updateTerminalName(
          session.id,
          `${prefix}${session.name}`,
        );

        // Handle session exit
        if (isExited) {
          terminalManager.notifySessionExit(session.id, session.name);
        }
      }
    }
  });

  // --- Register disposables ---
  context.subscriptions.push(
    treeView,
    treeProvider,
    sessionStore,
    terminalManager,
    createCmd,
    renameCmd,
    openTerminalCmd,
    stopCmd,
    killCmd,
    archiveCmd,
    deleteCmd,
    reviveCmd,
    refreshCmd,
    storeChangeDisposable,
  );

  log("ClaudeOS Sessions extension activated");
}

// --- Deactivate ---

export function deactivate(): void {
  // No-op: VS Code handles disposal via context.subscriptions
}

// --- Helpers ---

/**
 * Extract a Session from a TreeElement argument (context menu click).
 */
function extractSession(element?: TreeElement): Session | undefined {
  if (!element) return undefined;
  if (element.type === "session") return element.session;
  return undefined;
}

/**
 * Extract a Session from either a direct Session argument or a TreeElement.
 * Handles both TreeItem.command arguments (Session) and context menu arguments (TreeElement).
 */
function extractSessionFromArg(
  arg?: Session | TreeElement,
): Session | undefined {
  if (!arg) return undefined;

  // Direct Session object (from TreeItem.command.arguments)
  if ("id" in arg && "status" in arg && "name" in arg) {
    return arg as Session;
  }

  // TreeElement (from context menu)
  if ("type" in arg && (arg as TreeElement).type === "session") {
    return (arg as TreeElement & { type: "session" }).session;
  }

  return undefined;
}
