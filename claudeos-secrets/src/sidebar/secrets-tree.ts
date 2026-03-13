// ============================================================
// ClaudeOS Secrets Extension - Sidebar Tree Data Provider
// ============================================================
// Shows secrets grouped by category in the sidebar tree view.
// Categories use $(key) icon, secrets use $(lock) icon.
// ============================================================

import * as vscode from "vscode";
import type { SecretMeta } from "../types.js";

export type TreeElement =
  | { type: "category"; category: string }
  | { type: "secret"; secret: SecretMeta };

export class SecretsTreeProvider
  implements vscode.TreeDataProvider<TreeElement>
{
  private secrets: SecretMeta[] = [];

  private _onDidChangeTreeData = new vscode.EventEmitter<
    TreeElement | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /**
   * Replace the full secrets list and refresh the tree.
   */
  update(secrets: SecretMeta[]): void {
    this.secrets = secrets;
    this._onDidChangeTreeData.fire();
  }

  getChildren(element?: TreeElement): TreeElement[] {
    if (!element) {
      // Root: return unique category groups
      const categorySet = new Set<string>();
      for (const secret of this.secrets) {
        categorySet.add(secret.category ?? "Uncategorized");
      }
      const categories = Array.from(categorySet).sort();
      return categories.map((category) => ({
        type: "category" as const,
        category,
      }));
    }

    if (element.type === "category") {
      // Return secrets in this category
      return this.secrets
        .filter(
          (s) =>
            (s.category ?? "Uncategorized") === element.category,
        )
        .map((secret) => ({
          type: "secret" as const,
          secret,
        }));
    }

    return [];
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    if (element.type === "category") {
      const item = new vscode.TreeItem(
        element.category,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.iconPath = new vscode.ThemeIcon("key");
      return item;
    }

    // Secret item
    const item = new vscode.TreeItem(
      element.secret.name,
      vscode.TreeItemCollapsibleState.None,
    );
    item.iconPath = new vscode.ThemeIcon("lock");
    item.contextValue = "secret";
    item.command = {
      command: "claudeos.secrets.openEditor",
      title: "Open Secret Editor",
      arguments: [element.secret.name],
    };
    return item;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
