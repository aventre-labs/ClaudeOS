---
created: 2026-03-17T23:51:36.258Z
title: Prettify all custom UI with unified VS Code theming
area: ui
files: []
---

## Problem

The custom UI elements in ClaudeOS (setup wizard, session view, extension panels, etc.) don't look polished and aren't consistently themed. They need a visual overhaul that ties into a universal theming system.

## Solution

Use Claude's frontend design skill to redesign all custom UI elements with high design quality. Build a universal theming system that stores themes the native VS Code way (standard color theme contributions), making it easy for users to customize. All custom UI elements should pull their colors, typography, and styling from this single VS Code theme source — so changing the VS Code theme automatically updates every custom panel and view to match.

Key points:
- Store themes using VS Code's native theming mechanism for easy user customization
- Apply the frontend-design skill for production-grade, polished visuals
- Ensure every custom UI element (wizard, session view, panels) reads from the same theme
- Users can swap themes like any normal VS Code theme
