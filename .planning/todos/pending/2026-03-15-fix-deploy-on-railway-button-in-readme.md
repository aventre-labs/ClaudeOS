---
created: 2026-03-15T20:28:44.980Z
title: Fix deploy on Railway button in README
area: docs
files:
  - README.md
---

## Problem

The "Deploy on Railway" button in the project README currently leads to a 404 page. The deployment link is broken and needs to be updated with a valid Railway template/deployment URL.

## Solution

Use the Railway dashboard in Chrome to find or generate the correct deployment URL/template link, then update the README with the working URL. This will require:
1. Navigating to Railway dashboard to find the correct deploy template URL
2. Updating the button link in README.md
