---
created: 2026-03-18T03:39:00.000Z
title: Build browser extension for Claude in Chrome session management
area: ui
files: []
---

## Problem

Stock Claude Code includes **Claude in Chrome** — a built-in browser interaction feature that works via a Chrome extension + native messaging host (enabled with `claude --chrome` or `/chrome`). It lets Claude take screenshots, navigate pages, click elements, type, and read DOM state in the user's actual Chrome browser. However, there's no way to see or manage these browser sessions from within ClaudeOS. Users can't see what sessions are active, review past sessions, or get a visual overview of what Claude is doing in the browser.

## Solution

Build a VS Code extension (default in ClaudeOS) that provides a browser session management UI on top of the stock **Claude in Chrome** capability. **This must use only the built-in Claude in Chrome feature — no Playwright, no Chrome DevTools MCP plugin, no third-party browser tools.**

1. **Session management page:** A new UI page accessible from the ClaudeOS sidebar that shows browser sessions initiated through Claude in Chrome

2. **Active sessions section:** Shows currently active browser sessions as clickable tiles. Clicking one opens a live view of that browser session. An overview mode shows all active sessions in a tiled grid layout.

3. **Past sessions section:** Below a divider, shows past/completed browser sessions. Thumbnails for past sessions are displayed in greyscale to visually distinguish them from active sessions. Clicking a past session shows a snapshot/replay view.

4. **Integration with Claude in Chrome:** Surfaces the built-in Claude in Chrome capabilities (page listing, screenshots, navigation) through a visual UI. The extension reads session state from the native messaging channel that Claude in Chrome already establishes.

5. **Self-testing integration:** This extension is the foundation for the UI self-testing workflow (see companion todo). Claude Code uses Claude in Chrome to test UI while this extension gives the user visibility into those sessions.
