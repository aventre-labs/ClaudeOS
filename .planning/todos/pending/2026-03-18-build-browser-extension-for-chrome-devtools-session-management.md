---
created: 2026-03-18T03:39:00.000Z
title: Build browser extension for Chrome DevTools session management
area: ui
files: []
---

## Problem

Claude Code already has Chrome DevTools MCP tools for interacting with the browser, but there's no way to see or manage browser sessions from within ClaudeOS. Users can't see what browser sessions are active, review past sessions, or get a visual overview of what Claude is doing in the browser.

## Solution

Build a VS Code extension (default in ClaudeOS) that provides a browser session management UI:

1. **Session management page:** A new UI page accessible from the ClaudeOS sidebar that shows browser sessions managed through the Chrome DevTools MCP

2. **Active sessions section:** Shows currently active browser sessions as clickable tiles. Clicking one opens a live view of that browser session. An overview mode shows all active sessions in a tiled grid layout.

3. **Past sessions section:** Below a divider, shows past/completed browser sessions. Thumbnails for past sessions are displayed in greyscale to visually distinguish them from active sessions. Clicking a past session shows a snapshot/replay view.

4. **Integration with Chrome DevTools MCP:** Uses the same Chrome DevTools MCP that Claude Code already ships with — no Playwright or custom browser tools needed. The extension surfaces the MCP's page listing, screenshots, and navigation capabilities through a visual UI.

5. **Self-testing integration:** This extension is the foundation for the UI self-testing workflow (see companion todo). Claude Code can use Chrome DevTools MCP to test UI while this extension gives the user visibility into those sessions.
