---
created: 2026-03-17T23:44:53.893Z
title: Redesign session view to use terminal UI like opencode
area: ui
files: []
---

## Problem

The session view currently looks terrible and doesn't auto-resize properly. The display of Claude Code terminal sessions needs a complete redesign to match the quality and behavior of the opencode VS Code extension, which renders terminal sessions in a polished, auto-resizing way.

## Solution

Rework the session view to display Claude Code terminal sessions using Claude Code's existing terminal UI, matching the approach used by the opencode VS Code extension. This should include:
- Auto-resizing to fit the available viewport
- Proper terminal rendering that leverages Claude Code's built-in terminal UI capabilities
- Visual parity with the opencode extension's clean, professional look
