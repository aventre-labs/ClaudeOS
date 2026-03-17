---
created: 2026-03-17T23:50:24.989Z
title: Remove GitHub Copilot features from ClaudeOS UI
area: ui
files: []
---

## Problem

The ClaudeOS UI (based on VS Code / code-server) still exposes GitHub Copilot features — chat panels, inline suggestions UI, menu items, etc. These are confusing and irrelevant since ClaudeOS uses Claude Code, not Copilot.

## Solution

Strip all GitHub Copilot-related UI elements from the ClaudeOS interface. This includes disabling/removing Copilot extensions, hiding Copilot menu entries, and removing any Copilot-related UI affordances so the experience is clean and focused on Claude Code.
