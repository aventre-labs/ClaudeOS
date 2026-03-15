---
phase: 02-session-management
plan: 02
subsystem: ui
tags: [vscode-extension, treeview, sidebar, tree-data-provider, codicons, theme-icons]

# Dependency graph
requires:
  - phase: 02-session-management
    provides: SessionStore with getSessionsByStatus(), isUnread(), getWaitingCount(), onDidChange; Session and SessionStatus types; VS Code mock
provides:
  - "SessionTreeProvider: TreeDataProvider with status-grouped children and ViewBadge for waiting count"
  - "createSessionItem: TreeItem factory with status icons, read/unread highlights, contextValue, openTerminal command"
  - "createGroupItem: TreeItem factory for status group headers with Expanded/Collapsed state"
  - "STATUS_ICONS: Record<SessionStatus, ThemeIcon> mapping all 6 statuses to codicons with ThemeColors"
  - "timeAgo: relative time formatter (Xs ago, Xm ago, Xh ago, Xd ago)"
  - "package.json contributes: viewsContainers, views, viewsWelcome, 9 commands, context menus with status filtering, F2 keybinding"
affects: [02-03-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [tree-item-factory-pattern, tree-data-provider-status-groups, view-badge-waiting-count, context-value-regex-menus]

key-files:
  created:
    - "claudeos-sessions/src/sidebar/session-item.ts"
    - "claudeos-sessions/src/sidebar/group-item.ts"
    - "claudeos-sessions/src/sidebar/session-tree.ts"
    - "claudeos-sessions/test/sidebar/session-item.test.ts"
    - "claudeos-sessions/test/sidebar/session-tree.test.ts"
  modified:
    - "claudeos-sessions/package.json"

key-decisions:
  - "TreeView.badge for aggregate waiting count (not per-item badge, which does not exist in VS Code API)"
  - "TreeItemLabel.highlights for unread bold effect (full-range highlight on session name)"
  - "contextValue format session.{status} with regex when clauses for status-filtered menus"
  - "Activation event changed from onStartupFinished to onView:claudeos.sessions (lazy activation)"

patterns-established:
  - "TreeItem factory pattern: pure functions (createSessionItem, createGroupItem) that produce TreeItems from domain data"
  - "Status group ordering: active, idle, waiting, stopped, archived, zombie -- top-to-bottom in sidebar"
  - "Collapsed groups: archived and zombie default to Collapsed; all others Expanded"
  - "Context menu grouping: 0_open, 1_edit, 2_lifecycle, 3_manage, 4_danger with separators"

requirements-completed: [SES-01, SES-03, SES-05, SES-06, SES-08, SES-09]

# Metrics
duration: 6min
completed: 2026-03-12
---

# Phase 2 Plan 2: Sessions Sidebar Summary

**TreeView sidebar with status-grouped sessions, codicon status icons, read/unread highlights, ViewBadge for waiting count, and full package.json contributes manifest**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-12T09:13:24Z
- **Completed:** 2026-03-12T09:20:02Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- STATUS_ICONS maps all 6 session statuses to ThemeIcons with correct codicons and ThemeColors (sync~spin/green, debug-pause/yellow, question/orange, stop-circle/red, archive/descriptionForeground, bug/errorForeground)
- SessionTreeProvider groups sessions by status with correct ordering, hides empty groups, sorts sessions most-recent-first within groups
- TreeView badge shows aggregate waiting session count; unread sessions render with highlighted (bold) labels
- package.json contributes section with 9 commands, status-filtered context menus using viewItem regex, F2 keybinding, welcome view, and activity bar container

## Task Commits

Each task was committed atomically:

1. **Task 1: Create TreeItem factories for sessions and status groups** - `4d60661` (test), `7732341` (feat)
2. **Task 2: Build SessionTreeProvider and package.json contributes** - `c29db16` (test), `bd1ee06` (feat)

_Note: TDD tasks have separate test and implementation commits._

## Files Created/Modified
- `claudeos-sessions/src/sidebar/session-item.ts` - TreeItem factory for individual sessions with status icons, highlights, contextValue, command
- `claudeos-sessions/src/sidebar/group-item.ts` - TreeItem factory for status group headers with Expanded/Collapsed state and count description
- `claudeos-sessions/src/sidebar/session-tree.ts` - SessionTreeProvider implementing TreeDataProvider with status groups, badge updates, store integration
- `claudeos-sessions/test/sidebar/session-item.test.ts` - 30 tests for session-item and group-item factories
- `claudeos-sessions/test/sidebar/session-tree.test.ts` - 13 tests for SessionTreeProvider
- `claudeos-sessions/package.json` - Full contributes section (views, commands, menus, keybindings), activation event changed to onView

## Decisions Made
- TreeView.badge (ViewBadge) for aggregate waiting count rather than per-item badges (VS Code API does not support per-item badges)
- TreeItemLabel.highlights with full-range highlight for unread session bold effect (VS Code closest equivalent to bold text in tree items)
- contextValue format uses `session.{status}` enabling regex-based when clauses for menu filtering (e.g., `viewItem =~ /session\.(active|idle|waiting)/`)
- Changed activation event from `onStartupFinished` to `onView:claudeos.sessions` for lazy activation (extension only loads when sidebar view is opened)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SessionTreeProvider, TreeItem factories, and package.json manifest are ready for Plan 03 (terminal tabs + wiring)
- Plan 03 needs to register SessionTreeProvider in extension.ts activate() and wire commands
- All 43 sidebar tests and TypeScript compilation pass cleanly

## Self-Check: PASSED

All 5 created files verified on disk. All 4 task commits (4d60661, 7732341, c29db16, bd1ee06) found in git log.
