---
created: 2026-03-17T23:54:24.012Z
title: Move default extensions to repo folder
area: tooling
files: []
---

## Problem

Default extensions are currently installed or referenced outside the repo structure. This makes it harder to track, version, and manage which extensions ship with ClaudeOS.

## Solution

Create a `default-extensions/` folder in the GitHub repo and move all default extensions into it. Update the build/install process to source extensions from this folder. This keeps everything version-controlled, makes it easy to add/remove defaults, and gives contributors a clear place to find and modify bundled extensions.
