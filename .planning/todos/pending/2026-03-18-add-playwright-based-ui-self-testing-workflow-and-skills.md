---
created: 2026-03-18T00:12:32.407Z
title: Add Playwright-based UI self-testing workflow and skills
area: tooling
files: []
---

## Problem

ClaudeOS has no way to test its own UI when adding new UI elements. Claude Code running inside ClaudeOS can't see or interact with the browser it's being served in, so there's no feedback loop for UI development — you build it blind and hope it looks right.

## Solution

Multi-part setup to enable ClaudeOS to test its own UI:

1. **Browser extension:** Add a default extension that integrates the Playwright MCP, allowing Claude Code sessions inside ClaudeOS to interact with and inspect ClaudeOS's own browser UI

2. **Browser testing skill:** Create a Claude Code skill (slash command) that teaches Claude how to use the Playwright MCP to test UI elements — take screenshots, click elements, verify layouts, check responsiveness, etc.

3. **Self-improvement skill update:** Add or update the self-improvement skill to link to the browser testing skill, so when Claude is building new UI for ClaudeOS it knows to use the browser skill to verify its work

4. **Global CLAUDE.md updates:** Add both the browser testing skill and the updated self-improvement skill to the global CLAUDE.md so they're always available

This creates a closed loop: Claude builds UI → uses Playwright to view it in the actual browser → iterates until it looks right.
