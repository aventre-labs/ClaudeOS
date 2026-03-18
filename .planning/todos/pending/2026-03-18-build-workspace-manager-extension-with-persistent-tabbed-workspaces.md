---
created: 2026-03-18T00:09:24.175Z
title: Build workspace-manager extension with persistent tabbed workspaces
area: ui
files: []
---

## Problem

The left side panel currently shows GitHub Copilot (which is being removed). There's no way to organize work into separate projects/workspaces within ClaudeOS, and the explorer often shows "no folder opened." Users need a way to multitask across multiple projects with isolated contexts.

## Solution

Create a `workspace-manager` default extension that replaces the Copilot side panel. Key requirements:

**Global vs Workspace modes:**
- Global mode: all Claude Code sessions work from the main app directory
- Workspace mode: each workspace maps to a folder inside a `workspaces/` directory in the main app folder

**Workspace structure:**
- Each workspace is a subfolder of `workspaces/` in the main app directory
- Each workspace folder is git-controlled independently
- Maps directly to Claude Code's existing project system

**UI behavior:**
- Workspaces show as switchable tabs (like persistent browser tabs) in the side panel
- Switching workspaces changes the VS Code window's working directory to that workspace folder
- Each workspace maintains its own set of open editor tabs
- Sessions panel only shows sessions belonging to the active workspace
- The explorer tab always has a folder open — either the app directory (global) or the workspace directory (workspace mode)
- Never show "no folder opened" state

**Integration:**
- Leverage Claude Code's project system for workspace isolation
- Each workspace = a Claude Code project directory
