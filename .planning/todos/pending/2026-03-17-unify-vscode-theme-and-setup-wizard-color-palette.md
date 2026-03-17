---
created: 2026-03-17T23:47:45.229Z
title: Unify VS Code theme and setup wizard color palette
area: ui
files: []
---

## Problem

The default VS Code theme and the setup wizard use different color palettes. They should share the same theming so the experience feels consistent. Currently the colors are defined independently, leading to visual mismatch.

## Solution

Make both the VS Code theme and the setup wizard pull their colors from the same source — the standard place VS Code stores theming. The setup wizard should read from VS Code's theme system rather than defining its own palette, ensuring visual consistency across the entire experience.
