// ============================================================
// ClaudeOS Sessions Extension - Group TreeItem Factory
// ============================================================
// Creates TreeItems for status group headers in the sidebar.
// Groups are non-clickable parent nodes that contain sessions.
// ============================================================

import * as vscode from "vscode";
import type { SessionStatus } from "../supervisor/types.js";

// Status groups that should default to Collapsed
const COLLAPSED_GROUPS: ReadonlySet<SessionStatus> = new Set(["archived", "zombie"]);

/**
 * Creates a TreeItem for a status group header.
 *
 * - Label is the capitalized status name (e.g., "Active", "Zombie").
 * - Description shows the session count (e.g., "(3)").
 * - CollapsibleState: Expanded for active/idle/waiting/stopped; Collapsed for archived/zombie.
 * - contextValue enables group-level context menu filtering.
 * - No command (groups are not clickable).
 */
export function createGroupItem(
  status: SessionStatus,
  count: number,
): vscode.TreeItem {
  const displayName = status.charAt(0).toUpperCase() + status.slice(1);

  const collapsibleState = COLLAPSED_GROUPS.has(status)
    ? vscode.TreeItemCollapsibleState.Collapsed
    : vscode.TreeItemCollapsibleState.Expanded;

  const item = new vscode.TreeItem(displayName, collapsibleState);
  item.description = `(${count})`;
  item.contextValue = `group.${status}`;

  return item;
}
