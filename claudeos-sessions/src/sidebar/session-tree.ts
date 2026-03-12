// ============================================================
// ClaudeOS Sessions Extension - SessionTreeProvider
// ============================================================
// TreeDataProvider for the sessions sidebar. Sessions are grouped
// by status with status group headers as parent nodes. The tree
// refreshes automatically via SessionStore.onDidChange events.
// ============================================================

import * as vscode from "vscode";
import type { Session, SessionStatus } from "../supervisor/types.js";
import type { SessionStore } from "../state/session-store.js";
import { createSessionItem } from "./session-item.js";
import { createGroupItem } from "./group-item.js";

// --- Types ---

export type TreeElement =
  | { type: "group"; status: SessionStatus }
  | { type: "session"; session: Session };

// Status display order (top to bottom in sidebar)
const STATUS_ORDER: readonly SessionStatus[] = [
  "active",
  "idle",
  "waiting",
  "stopped",
  "archived",
  "zombie",
];

// --- SessionTreeProvider ---

export class SessionTreeProvider
  implements vscode.TreeDataProvider<TreeElement>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TreeElement | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private treeView: vscode.TreeView<TreeElement> | undefined;
  private storeDisposable: { dispose: () => void } | undefined;

  constructor(private readonly store: SessionStore) {
    // Wire store changes to tree refresh
    this.storeDisposable = this.store.onDidChange(() => {
      this.refresh();
    });
  }

  // --- TreeDataProvider ---

  getChildren(element?: TreeElement): TreeElement[] {
    if (!element) {
      return this.getRootChildren();
    }

    if (element.type === "group") {
      return this.getGroupChildren(element.status);
    }

    // Session elements have no children
    return [];
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    if (element.type === "group") {
      const sessions = this.store.getSessionsByStatus(element.status);
      return createGroupItem(element.status, sessions.length);
    }

    const isUnread = this.store.isUnread(element.session.id);
    return createSessionItem(element.session, isUnread);
  }

  // --- Public Methods ---

  /**
   * Refresh the tree and update the badge.
   */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
    this.updateBadge();
  }

  /**
   * Store a reference to the TreeView for badge updates.
   */
  setTreeView(treeView: vscode.TreeView<TreeElement>): void {
    this.treeView = treeView;
    this.updateBadge();
  }

  /**
   * Clean up event emitters and subscriptions.
   */
  dispose(): void {
    this.storeDisposable?.dispose();
    this._onDidChangeTreeData.dispose();
  }

  // --- Private Methods ---

  /**
   * Build root-level group elements for statuses that have sessions.
   */
  private getRootChildren(): TreeElement[] {
    const groups: TreeElement[] = [];

    for (const status of STATUS_ORDER) {
      const sessions = this.store.getSessionsByStatus(status);
      if (sessions.length > 0) {
        groups.push({ type: "group", status });
      }
    }

    return groups;
  }

  /**
   * Build session elements for a given status group.
   * Sessions are already sorted most-recent-first by the store.
   */
  private getGroupChildren(status: SessionStatus): TreeElement[] {
    const sessions = this.store.getSessionsByStatus(status);
    return sessions.map((session) => ({ type: "session", session }));
  }

  /**
   * Update the TreeView badge to show the total count of waiting sessions.
   */
  private updateBadge(): void {
    if (!this.treeView) {
      return;
    }

    const waitingCount = this.store.getWaitingCount();
    if (waitingCount > 0) {
      this.treeView.badge = {
        value: waitingCount,
        tooltip: "sessions waiting for input",
      };
    } else {
      this.treeView.badge = undefined;
    }
  }
}
