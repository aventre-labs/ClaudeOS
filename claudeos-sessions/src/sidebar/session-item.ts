// ============================================================
// ClaudeOS Sessions Extension - Session TreeItem Factory
// ============================================================
// Creates TreeItems for individual sessions with status-aware
// icons, read/unread label highlights, and context values.
// ============================================================

import * as vscode from "vscode";
import type { Session, SessionStatus } from "../supervisor/types.js";

// --- Status Icon Mapping ---

/**
 * Maps each SessionStatus to a ThemeIcon with the correct codicon and color.
 *
 * active:   sync~spin  (spinning animation, green)
 * idle:     debug-pause (yellow)
 * waiting:  question   (orange)
 * stopped:  stop-circle (red)
 * archived: archive    (muted/description foreground)
 * zombie:   bug        (error foreground)
 */
export const STATUS_ICONS: Record<SessionStatus, vscode.ThemeIcon> = {
  active: new vscode.ThemeIcon("sync~spin", new vscode.ThemeColor("charts.green")),
  idle: new vscode.ThemeIcon("debug-pause", new vscode.ThemeColor("charts.yellow")),
  waiting: new vscode.ThemeIcon("question", new vscode.ThemeColor("charts.orange")),
  stopped: new vscode.ThemeIcon("stop-circle", new vscode.ThemeColor("charts.red")),
  archived: new vscode.ThemeIcon("archive", new vscode.ThemeColor("descriptionForeground")),
  zombie: new vscode.ThemeIcon("bug", new vscode.ThemeColor("errorForeground")),
};

// --- Time Ago Helper ---

/**
 * Formats a date string as a relative time description.
 * Examples: "30s ago", "5m ago", "2h ago", "3d ago"
 */
export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// --- Session TreeItem Factory ---

/**
 * Creates a TreeItem for an individual session.
 *
 * - Label uses TreeItemLabel with highlights for unread sessions (bold effect).
 * - Icon reflects session status via STATUS_ICONS.
 * - contextValue enables status-based context menu filtering.
 * - Command opens the session's terminal on single-click.
 * - Description shows time info for archived/zombie sessions.
 */
export function createSessionItem(
  session: Session,
  isUnread: boolean,
): vscode.TreeItem {
  const label: vscode.TreeItemLabel = {
    label: session.name,
    highlights: isUnread ? [[0, session.name.length]] : undefined,
  };

  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.id = session.id;
  item.iconPath = STATUS_ICONS[session.status];
  item.contextValue = `session.${session.status}`;

  // Single-click opens terminal
  item.command = {
    command: "claudeos.sessions.openTerminal",
    title: "Open Terminal",
    arguments: [session],
  };

  // Description for archived and zombie sessions
  if (session.status === "archived") {
    item.description = `archived ${timeAgo(session.createdAt)}`;
  } else if (session.status === "zombie") {
    item.description = timeAgo(session.createdAt);
  }

  return item;
}
