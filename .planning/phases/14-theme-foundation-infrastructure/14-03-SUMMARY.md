---
phase: 14-theme-foundation-infrastructure
plan: 03
subsystem: ui
tags: [vscode-webview, css-variables, theme-migration, welcome-page, noise-texture, radial-glow]

# Dependency graph
requires:
  - phase: 14-01
    provides: "ClaudeOS Dark theme palette via workbench.colorCustomizations (38 color tokens, gold #d4a054 accent)"
provides:
  - "Fully themed Home panel with pure var(--vscode-*) CSS (31 variable references, zero hardcoded hex fallbacks)"
  - "Welcome page with Get Started section containing 4 quick action cards"
  - "Noise texture overlay and radial ambient glow decorative effects"
  - "openTerminal and browseExtensions message handlers"
affects: [14-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure var(--vscode-*) CSS in webview panels with no hardcoded hex fallbacks in var() calls"
    - "CSS pseudo-element noise texture via inline SVG data URI with CSP img-src data: allowance"
    - "Decorative radial glow using hardcoded rgba(212,160,84,0.04) for opacity control"
    - "Quick action cards with data-action attribute pattern for webview-to-extension messaging"

key-files:
  created: []
  modified:
    - claudeos-home/src/webview/home-panel.ts

key-decisions:
  - "Hero wordmark rendered as HTML h1 text (not SVG) for accessibility and theme-responsiveness"
  - "Radial glow uses hardcoded rgba() value since VS Code theme variables resolve to opaque hex and cannot be used with opacity"
  - "Removed statusColor() JS function (unused after CSS-only status badge implementation)"

patterns-established:
  - "Pure var(--vscode-*) CSS: no custom --claudeos-* variables, no hex fallbacks in var() calls"
  - "Status badge colors remain hardcoded hex (semantic indicators, not theme-dependent)"
  - "8px grid gap standard across all card grids (sessions, shortcuts, quick-actions)"

requirements-completed: [THEME-02, WELC-01, WELC-02, WELC-03]

# Metrics
duration: 3min
completed: 2026-03-19
---

# Phase 14 Plan 03: Home Panel Theme Migration & Welcome Page Summary

**Home panel migrated to pure var(--vscode-*) CSS (31 refs, zero hex fallbacks) with noise/glow effects and 4-card Get Started welcome section**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-19T07:33:32Z
- **Completed:** 2026-03-19T07:37:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Migrated all Home panel CSS from hardcoded hex/custom variables to pure var(--vscode-*) references (31 occurrences, 0 hex fallbacks)
- Added noise texture overlay (SVG feTurbulence on body::before) and radial ambient glow (body::after) with CSP data: directive
- Built Get Started section with 4 quick action cards (New Session, Manage Secrets, Open Terminal, Browse Extensions)
- Replaced SVG hero wordmark with accessible HTML h1 at 28px/600 weight per UI-SPEC typography contract
- Added openTerminal and browseExtensions message handlers delegating to VS Code built-in commands
- Added contextual getting-started-tip that changes based on API key status

## Task Commits

Each task was committed atomically:

1. **Task 1: Add quick-action message handlers to HomePanel** - `316f43f` (feat)
2. **Task 2: Rewrite Home panel HTML/CSS/JS with themed CSS, welcome content, and effects** - `1ec5cc8` (feat)

## Files Created/Modified
- `claudeos-home/src/webview/home-panel.ts` - Complete rewrite of _getHtmlForWebview template: pure var(--vscode-*) CSS, noise/glow pseudo-elements, Get Started section with quick action cards, HTML h1 hero, getting-started-tip element, new message handler cases

## Decisions Made
- Hero wordmark changed from SVG to HTML h1 for accessibility and automatic theme color inheritance
- Radial glow uses hardcoded rgba(212,160,84,0.04) because VS Code CSS variables resolve to opaque hex values that cannot express partial opacity
- Removed unused statusColor() JavaScript function (status badges are CSS-only with hardcoded semantic colors)
- Banner warning link color changed from --claudeos-accent to var(--vscode-focusBorder) for consistency with hover states

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Home panel is fully themed; changing VS Code theme automatically updates all panel colors
- Ready for Plan 04 (Secrets panel CSS migration) which follows the same var(--vscode-*) pattern
- CSP data: directive pattern established for any future panels needing noise texture

## Self-Check: PASSED

- [x] claudeos-home/src/webview/home-panel.ts exists and is 688 lines
- [x] 14-03-SUMMARY.md exists
- [x] Commit 316f43f verified in git log
- [x] Commit 1ec5cc8 verified in git log

---
*Phase: 14-theme-foundation-infrastructure*
*Completed: 2026-03-19*
