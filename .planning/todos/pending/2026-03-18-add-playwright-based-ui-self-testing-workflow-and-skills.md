---
created: 2026-03-18T00:12:32.407Z
title: Add UI self-testing workflow using Claude in Chrome
area: tooling
files: []
---

## Problem

ClaudeOS has no way to test its own UI when adding new UI elements. Claude Code running inside ClaudeOS can't see or interact with the browser it's being served in, so there's no feedback loop for UI development — you build it blind and hope it looks right.

## Solution

Multi-part setup to enable ClaudeOS to test its own UI, using **Claude in Chrome** — the built-in browser interaction capability that ships with stock Claude Code. This is NOT a plugin or MCP server. Claude in Chrome works via a Chrome extension + native messaging host that lets Claude Code directly control the user's Chrome browser (take screenshots, navigate, click, type, read DOM, etc.). It requires no additional installation beyond the Claude in Chrome extension from the Chrome Web Store.

**Important: Do NOT use Playwright, Chrome DevTools MCP plugin, or any other third-party browser tool. Use only the stock Claude in Chrome feature (`claude --chrome` / `/chrome`).**

1. **Browser extension:** Add a default ClaudeOS extension that ensures Claude in Chrome is properly configured for the ClaudeOS browser environment, so Claude Code sessions inside ClaudeOS can interact with and inspect ClaudeOS's own UI (see companion todo: "Build browser extension for Chrome DevTools session management")

2. **Browser testing skill:** Create a Claude Code skill (slash command) that teaches Claude how to use Claude in Chrome to test UI elements — take screenshots, click elements, verify layouts, check responsiveness, etc.

3. **Self-improvement skill update:** Add or update the self-improvement skill to link to the browser testing skill, so when Claude is building new UI for ClaudeOS it knows to use the browser skill to verify its work

4. **Global CLAUDE.md updates:** Add both the browser testing skill and the updated self-improvement skill to the global CLAUDE.md so they're always available

This creates a closed loop: Claude builds UI → uses Claude in Chrome to view it in the actual browser → iterates until it looks right.
