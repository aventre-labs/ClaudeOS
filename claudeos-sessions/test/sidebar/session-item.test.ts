// ============================================================
// Tests for session-item.ts and group-item.ts TreeItem factories
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import { TreeItemCollapsibleState, ThemeIcon, ThemeColor } from "vscode";
import { createSessionItem, STATUS_ICONS, timeAgo } from "../../src/sidebar/session-item.js";
import { createGroupItem } from "../../src/sidebar/group-item.js";
import type { Session, SessionStatus } from "../../src/supervisor/types.js";

// --- Helper ---

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "ses_abc123",
    name: "Test Session",
    status: "active",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// --- STATUS_ICONS ---

describe("STATUS_ICONS", () => {
  const allStatuses: SessionStatus[] = [
    "active",
    "idle",
    "waiting",
    "stopped",
    "archived",
    "zombie",
  ];

  it("has an entry for every SessionStatus", () => {
    for (const status of allStatuses) {
      expect(STATUS_ICONS[status]).toBeDefined();
      expect(STATUS_ICONS[status]).toBeInstanceOf(ThemeIcon);
    }
  });

  it("maps active to sync~spin with charts.green", () => {
    const icon = STATUS_ICONS.active;
    expect(icon.id).toBe("sync~spin");
    expect(icon.color).toBeInstanceOf(ThemeColor);
    expect(icon.color!.id).toBe("charts.green");
  });

  it("maps idle to debug-pause with charts.yellow", () => {
    const icon = STATUS_ICONS.idle;
    expect(icon.id).toBe("debug-pause");
    expect(icon.color!.id).toBe("charts.yellow");
  });

  it("maps waiting to question with charts.orange", () => {
    const icon = STATUS_ICONS.waiting;
    expect(icon.id).toBe("question");
    expect(icon.color!.id).toBe("charts.orange");
  });

  it("maps stopped to stop-circle with charts.red", () => {
    const icon = STATUS_ICONS.stopped;
    expect(icon.id).toBe("stop-circle");
    expect(icon.color!.id).toBe("charts.red");
  });

  it("maps archived to archive with descriptionForeground", () => {
    const icon = STATUS_ICONS.archived;
    expect(icon.id).toBe("archive");
    expect(icon.color!.id).toBe("descriptionForeground");
  });

  it("maps zombie to bug with errorForeground", () => {
    const icon = STATUS_ICONS.zombie;
    expect(icon.id).toBe("bug");
    expect(icon.color!.id).toBe("errorForeground");
  });
});

// --- createSessionItem ---

describe("createSessionItem", () => {
  it("sets correct icon for each status", () => {
    const statuses: SessionStatus[] = [
      "active",
      "idle",
      "waiting",
      "stopped",
      "archived",
      "zombie",
    ];
    for (const status of statuses) {
      const session = makeSession({ status });
      const item = createSessionItem(session, false);
      expect(item.iconPath).toBe(STATUS_ICONS[status]);
    }
  });

  it("sets highlights on label for unread session", () => {
    const session = makeSession({ name: "My Session" });
    const item = createSessionItem(session, true);
    // label is a TreeItemLabel object with highlights
    const label = item.label as { label: string; highlights?: [number, number][] };
    expect(label.label).toBe("My Session");
    expect(label.highlights).toEqual([[0, "My Session".length]]);
  });

  it("sets no highlights on label for read session", () => {
    const session = makeSession({ name: "My Session" });
    const item = createSessionItem(session, false);
    const label = item.label as { label: string; highlights?: [number, number][] };
    expect(label.label).toBe("My Session");
    expect(label.highlights).toBeUndefined();
  });

  it("sets contextValue to session.{status}", () => {
    const session = makeSession({ status: "waiting" });
    const item = createSessionItem(session, false);
    expect(item.contextValue).toBe("session.waiting");
  });

  it("sets command to claudeos.sessions.openTerminal", () => {
    const session = makeSession();
    const item = createSessionItem(session, false);
    expect(item.command).toBeDefined();
    expect(item.command!.command).toBe("claudeos.sessions.openTerminal");
    expect(item.command!.title).toBe("Open Terminal");
    expect(item.command!.arguments).toEqual([session]);
  });

  it("sets collapsibleState to None", () => {
    const session = makeSession();
    const item = createSessionItem(session, false);
    expect(item.collapsibleState).toBe(TreeItemCollapsibleState.None);
  });

  it("shows 'archived' prefix in description for archived sessions", () => {
    const session = makeSession({
      status: "archived",
      createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    });
    const item = createSessionItem(session, false);
    expect(item.description).toMatch(/^archived /);
  });

  it("shows time-ago in description for zombie sessions", () => {
    const session = makeSession({
      status: "zombie",
      createdAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
    });
    const item = createSessionItem(session, false);
    expect(item.description).toBeDefined();
    expect(typeof item.description).toBe("string");
    expect((item.description as string).length).toBeGreaterThan(0);
  });

  it("does not set description for active sessions", () => {
    const session = makeSession({ status: "active" });
    const item = createSessionItem(session, false);
    expect(item.description).toBeUndefined();
  });
});

// --- timeAgo ---

describe("timeAgo", () => {
  it("returns seconds-ago for very recent dates", () => {
    const recent = new Date(Date.now() - 30000).toISOString(); // 30s ago
    expect(timeAgo(recent)).toMatch(/\d+s ago/);
  });

  it("returns minutes-ago for dates within the hour", () => {
    const fiveMinAgo = new Date(Date.now() - 300000).toISOString();
    expect(timeAgo(fiveMinAgo)).toMatch(/\d+m ago/);
  });

  it("returns hours-ago for dates within the day", () => {
    const twoHoursAgo = new Date(Date.now() - 7200000).toISOString();
    expect(timeAgo(twoHoursAgo)).toMatch(/\d+h ago/);
  });

  it("returns days-ago for dates beyond one day", () => {
    const twoDaysAgo = new Date(Date.now() - 172800000).toISOString();
    expect(timeAgo(twoDaysAgo)).toMatch(/\d+d ago/);
  });
});

// --- createGroupItem ---

describe("createGroupItem", () => {
  it("sets Expanded collapsibleState for active", () => {
    const item = createGroupItem("active", 3);
    expect(item.collapsibleState).toBe(TreeItemCollapsibleState.Expanded);
  });

  it("sets Expanded collapsibleState for idle", () => {
    const item = createGroupItem("idle", 2);
    expect(item.collapsibleState).toBe(TreeItemCollapsibleState.Expanded);
  });

  it("sets Expanded collapsibleState for waiting", () => {
    const item = createGroupItem("waiting", 1);
    expect(item.collapsibleState).toBe(TreeItemCollapsibleState.Expanded);
  });

  it("sets Expanded collapsibleState for stopped", () => {
    const item = createGroupItem("stopped", 4);
    expect(item.collapsibleState).toBe(TreeItemCollapsibleState.Expanded);
  });

  it("sets Collapsed collapsibleState for archived", () => {
    const item = createGroupItem("archived", 5);
    expect(item.collapsibleState).toBe(TreeItemCollapsibleState.Collapsed);
  });

  it("sets Collapsed collapsibleState for zombie", () => {
    const item = createGroupItem("zombie", 2);
    expect(item.collapsibleState).toBe(TreeItemCollapsibleState.Collapsed);
  });

  it("capitalizes status name for label", () => {
    const item = createGroupItem("active", 3);
    expect(item.label).toBe("Active");
  });

  it("shows count in description", () => {
    const item = createGroupItem("waiting", 7);
    expect(item.description).toBe("(7)");
  });

  it("sets contextValue to group.{status}", () => {
    const item = createGroupItem("idle", 1);
    expect(item.contextValue).toBe("group.idle");
  });

  it("does not set a command (groups are not clickable)", () => {
    const item = createGroupItem("active", 3);
    expect(item.command).toBeUndefined();
  });
});
