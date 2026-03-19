# Phase 14: Theme Foundation & Infrastructure - Research

**Researched:** 2026-03-18
**Domain:** VS Code theming, webview CSS variables, welcome page, extension infrastructure
**Confidence:** HIGH

## Summary

Phase 14 gives ClaudeOS a unified visual identity through four workstreams: (1) a custom dark color theme defined via `workbench.colorCustomizations` in settings.json, (2) migration of all webview panel CSS from hardcoded hex values to `var(--vscode-*)` CSS variables, (3) a custom welcome page replacing VS Code defaults, and (4) restructuring default extensions into a `default-extensions/` repo directory.

The approach is well-supported by VS Code's API. Color themes can be fully defined via `workbench.colorCustomizations` in settings.json without needing a separate extension -- this is a documented, supported mechanism. VS Code webviews automatically receive all theme colors as CSS variables prefixed with `--vscode-`, with dot-delimited token names converted to dashes (e.g., `editor.background` becomes `var(--vscode-editor-background)`). The existing Home and Secrets panels already partially use these variables but include hardcoded hex fallbacks that must be stripped.

A key design tension exists around the noise texture overlay. The wizard's `theme.css` uses an inline SVG data URI in a `body::before` pseudo-element for the noise effect. Bringing this into VS Code webviews requires adding `data:` to the CSP `img-src` directive, which is a minor but acceptable security relaxation since the data URIs are static SVG content controlled by the extension author.

**Primary recommendation:** Define the full ClaudeOS theme palette via `workbench.colorCustomizations` in `config/settings.json`, strip all hardcoded CSS from webview panels, add noise/glow effects to webview panels via CSP-aware inline SVG, and restructure the welcome page as an enhanced version of the existing Home panel that opens on startup.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Wizard keeps its own independent `theme.css` -- it runs before code-server starts and has no VS Code theme context
- VS Code webview panels (Home, Secrets) migrate to pure `var(--vscode-*)` variables with NO hardcoded hex fallbacks -- variables are guaranteed to exist inside VS Code
- VS Code panels use native VS Code font stack (`var(--vscode-font-family)`, `var(--vscode-editor-font-family)`) -- no custom fonts in webviews
- Wizard keeps its custom fonts (Syne, Figtree, JetBrains Mono) -- these are wizard-only
- Noise texture overlay and radial ambient glow effects from the wizard should be brought into VS Code webview panels (Home panel, etc.) for a branded, premium feel

### Claude's Discretion
- ClaudeOS dark theme color palette (accent colors, activity bar, sidebar tones) -- define what looks right as a cohesive VS Code color theme
- Welcome page layout, quick actions, and getting-started content
- Default extensions directory structure and build integration approach
- Copilot disable mechanism (settings keys and values)
- How to implement noise/glow effects in VS Code webviews while respecting theme variable usage

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| THEME-01 | ClaudeOS ships a custom dark color theme as the default (via settings.json, not a separate extension) | `workbench.colorCustomizations` in settings.json fully supports defining a complete theme inline; set `workbench.colorTheme` to "Default Dark Modern" and overlay colors via colorCustomizations |
| THEME-02 | All Home panel webview CSS uses `var(--vscode-*)` variables instead of hardcoded hex values | VS Code auto-injects all theme colors as CSS variables in webviews; current panel has ~20 hardcoded hex values with `var()` fallbacks to strip |
| THEME-03 | Setup wizard CSS uses `var(--vscode-*)` variables instead of its own `theme.css` palette | **CONFLICT**: CONTEXT.md locks the decision that wizard keeps its own independent `theme.css`. The wizard runs before code-server and has no VS Code context. This requirement should be marked SUPERSEDED by the context decision. |
| THEME-04 | Changing VS Code theme automatically updates all custom panels and wizard to match | For VS Code panels: automatic once all CSS uses `var(--vscode-*)`. For wizard: N/A per context decision (wizard is independent). |
| THEME-05 | Copilot UI elements disabled via settings | Use `"chat.disableAIFeatures": true` and `"github.copilot.enable": {"*": false}` in settings.json |
| INFR-01 | Default extensions live in `default-extensions/` repo directory | Create `default-extensions/` directory, move VSIX references there |
| INFR-02 | Build process (Nix/Dockerfile) sources extensions from `default-extensions/` | Update Dockerfile Stage 3 COPY paths and `flake.nix` extensionVsix derivation to reference new directory |
| INFR-03 | Adding/removing default extensions is a single directory change | Replace `config/default-extensions.json` manifest with directory-based discovery (scan `default-extensions/*.vsix`) |
| WELC-01 | Custom ClaudeOS welcome page replaces the default VS Code welcome content | The existing Home panel already opens on startup via `onStartupFinished`; enhance it to serve as the welcome page with getting-started content |
| WELC-02 | Welcome page provides ClaudeOS-specific quick actions and getting-started guidance | Add quick action cards and getting-started steps to the Home panel webview |
| WELC-03 | Welcome page uses unified theming (reads from VS Code theme variables) | Home panel CSS migration (THEME-02) ensures this automatically |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| VS Code API | ^1.85.0 | Webview panels, commands, settings | Already used by all extensions |
| `workbench.colorCustomizations` | N/A (settings.json) | Define theme colors inline | Official VS Code mechanism for theme customization without extension |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| esbuild | ^0.27.0 | Bundle extension TypeScript | Already in devDependencies |
| @vscode/vsce | ^3.7.0 | Package extensions as VSIX | Already in devDependencies |
| vitest | ^3.0.0 | Unit testing | Already configured per extension |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `workbench.colorCustomizations` | Separate theme extension | Extension approach adds complexity; settings.json is simpler and already how ClaudeOS ships config |
| Inline CSS in template literals | External CSS files | Inline is the established pattern in this codebase; external adds build complexity |
| Walkthroughs API for welcome | WebviewPanel (current) | Walkthroughs are limited to step-by-step format; WebviewPanel is more flexible for a dashboard-style welcome page |

## Architecture Patterns

### Recommended Project Structure
```
config/
  settings.json            # Theme colors (colorCustomizations) + Copilot disable
  product.json             # Branding (unchanged)
default-extensions/        # NEW: replaces config/default-extensions.json
  claudeos-sessions.vsix   # Copied from build output
  claudeos-secrets.vsix
  claudeos-home.vsix
  claudeos-self-improve.vsix
claudeos-home/
  src/
    webview/
      home-panel.ts        # MODIFIED: pure var(--vscode-*) CSS, noise/glow effects, welcome content
    extension.ts           # Opens Home panel on startup (already does this)
claudeos-secrets/
  src/
    webview/
      secrets-panel.ts     # MODIFIED: pure var(--vscode-*) CSS
```

### Pattern 1: Theme via `workbench.colorCustomizations`
**What:** Define the ClaudeOS dark theme as an overlay on "Default Dark Modern" using the `workbench.colorCustomizations` settings key.
**When to use:** When shipping a branded theme as part of settings.json config rather than a separate extension.
**Example:**
```json
// Source: https://code.visualstudio.com/docs/configure/themes
{
  "workbench.colorTheme": "Default Dark Modern",
  "workbench.colorCustomizations": {
    "editor.background": "#0a0a0c",
    "sideBar.background": "#0f0f11",
    "activityBar.background": "#0a0a0c",
    "activityBar.foreground": "#d4a054",
    "activityBarBadge.background": "#d4a054",
    "statusBar.background": "#0a0a0c",
    "titleBar.activeBackground": "#0a0a0c",
    "tab.activeBackground": "#131315",
    "tab.activeBorderTop": "#d4a054",
    "button.background": "#d4a054",
    "button.foreground": "#0a0a0c",
    "focusBorder": "#d4a054",
    "list.activeSelectionBackground": "rgba(212, 160, 84, 0.15)",
    "list.hoverBackground": "rgba(255, 255, 255, 0.04)",
    "input.border": "rgba(255, 255, 255, 0.08)",
    "panel.border": "rgba(255, 255, 255, 0.06)"
  }
}
```

### Pattern 2: Pure `var(--vscode-*)` CSS in Webview Panels
**What:** Use only VS Code CSS variables for all colors/fonts in webview panel HTML. No hardcoded hex fallbacks.
**When to use:** All webview panels inside VS Code (Home, Secrets).
**Example:**
```css
/* Source: https://code.visualstudio.com/api/extension-guides/webview */
/* BEFORE (current) */
.session-card {
  background: var(--vscode-sideBar-background, var(--vscode-editor-background));
  border: 1px solid var(--vscode-panel-border, #333);
}

/* AFTER (target) */
.session-card {
  background: var(--vscode-sideBar-background);
  border: 1px solid var(--vscode-panel-border);
}
```

### Pattern 3: Noise Texture in VS Code Webviews
**What:** Bring the wizard's noise texture and ambient glow into webview panels using inline SVG data URIs and CSS pseudo-elements.
**When to use:** Home panel (and potentially Secrets panel) for branded premium feel.
**Example:**
```css
/* Noise texture overlay -- requires img-src data: in CSP */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E");
  pointer-events: none;
  z-index: 0;
}

/* Radial ambient glow using theme accent color */
body::after {
  content: "";
  position: fixed;
  top: 30%;
  left: 50%;
  width: 800px;
  height: 600px;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    ellipse at center,
    var(--vscode-focusBorder, rgba(212, 160, 84, 0.04)),
    transparent 70%
  );
  pointer-events: none;
  z-index: 0;
}
```

**CSP update required:**
```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
    style-src ${cspSource} 'nonce-${nonce}';
    script-src 'nonce-${nonce}';
    img-src ${cspSource} data:;">
```

### Pattern 4: Directory-Based Extension Discovery
**What:** Replace the JSON manifest (`config/default-extensions.json`) with a directory scan of `default-extensions/`.
**When to use:** INFR-01/02/03 -- makes adding/removing extensions a single file operation.
**Approach:**
```
# Before: config/default-extensions.json
[
  { "method": "local-vsix", "localPath": "/app/extensions/claudeos-sessions.vsix" },
  ...
]

# After: default-extensions/ directory contains VSIX files
# Dockerfile copies entire directory, boot service scans it
```

### Anti-Patterns to Avoid
- **Hardcoded hex fallbacks in var():** Never use `var(--vscode-foreground, #ccc)` -- the variables are guaranteed to exist in VS Code webviews
- **Custom `--claudeos-*` CSS variables in VS Code panels:** The current panels define `--claudeos-accent: #c084fc` -- these must be replaced with `workbench.colorCustomizations` tokens mapped through `var(--vscode-*)` equivalents
- **Separate welcome extension:** The Home panel already opens on startup; creating a separate welcome extension adds unnecessary complexity

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Color theme | Custom theme extension with package.json contributes.colors | `workbench.colorCustomizations` in settings.json | Simpler, already how ClaudeOS ships config; no extension build/install needed |
| Welcome page framework | Custom walkthrough system | Existing Home panel WebviewPanel (enhanced) | Home panel already opens on startup, has session/shortcut infrastructure |
| Theme variable resolution | Manual CSS variable mapping layer | VS Code's built-in theme variable injection | VS Code automatically injects all theme colors as `--vscode-*` CSS variables in webviews |
| Extension discovery | Custom manifest parser | Directory glob scan in boot service | `fs.readdirSync()` + `.vsix` filter is simpler than JSON manifest parsing |

**Key insight:** The existing codebase already has 80% of the infrastructure. The Home panel opens on startup and can serve as the welcome page. Theme colors flow through `workbench.colorCustomizations`. The main work is cleanup (stripping fallbacks) and enhancement (adding welcome content, noise effects).

## Common Pitfalls

### Pitfall 1: CSP Blocking Noise Texture SVGs
**What goes wrong:** The inline SVG data URI in `background-image` is blocked by the Content Security Policy because the default CSP has `default-src 'none'` and no `img-src data:` directive.
**Why it happens:** Data URIs for background images are governed by `img-src` in CSP; the current panels don't allow `data:` sources.
**How to avoid:** Add `img-src ${cspSource} data:` to the CSP meta tag in webview HTML.
**Warning signs:** Noise texture doesn't render; DevTools console shows CSP violation.

### Pitfall 2: The `--claudeos-accent` Variable Mismatch
**What goes wrong:** The current panels define `--claudeos-accent: #c084fc` (purple) but the wizard uses `--color-accent: #d4a054` (gold). After theme migration, the accent color source of truth needs to be the VS Code theme (via `workbench.colorCustomizations`).
**Why it happens:** Two different color systems were independently developed.
**How to avoid:** Choose one accent color for the VS Code theme (gold `#d4a054` to match the wizard brand), define it via `workbench.colorCustomizations` on appropriate tokens (e.g., `focusBorder`, `activityBar.foreground`, `button.background`), and reference it in webviews via the corresponding `var(--vscode-*)` variable.
**Warning signs:** Purple accents remaining after migration; inconsistent accent colors between activity bar and panel content.

### Pitfall 3: THEME-03 / CONTEXT.md Conflict
**What goes wrong:** REQUIREMENTS.md says "Setup wizard CSS uses `var(--vscode-*)` variables instead of its own `theme.css` palette" but CONTEXT.md explicitly locks "Wizard keeps its own independent `theme.css`".
**Why it happens:** The requirement was written before the discussion that revealed the wizard runs pre-code-server with no VS Code theme context.
**How to avoid:** Follow the CONTEXT.md decision. Mark THEME-03 as SUPERSEDED in the plan. The wizard cannot use VS Code variables because it runs standalone before code-server starts.
**Warning signs:** Attempting to make the wizard use `var(--vscode-*)` will fail silently (variables undefined, all colors transparent/invisible).

### Pitfall 4: Radial Glow Using Theme Variable with Wrong Opacity
**What goes wrong:** Using `var(--vscode-focusBorder)` directly in a `radial-gradient()` produces a solid-colored glow instead of a subtle ambient effect because the variable resolves to a fully opaque hex color.
**Why it happens:** VS Code theme variables are opaque hex values; you cannot apply opacity to them within CSS `var()` references.
**How to avoid:** For the glow effect, use a hardcoded `rgba()` value matching the theme accent color. This is acceptable because the glow is a decorative effect, not a semantic UI color. Alternatively, use CSS `color-mix()` if browser support allows.
**Warning signs:** Glow appears as a solid color blob instead of a subtle gradient.

### Pitfall 5: Default Extensions Directory Not Sourced in Both Build Paths
**What goes wrong:** Updating the Dockerfile to use `default-extensions/` but forgetting to update `flake.nix` (or vice versa) causes one build path to fail.
**Why it happens:** Two independent build systems (Docker, Nix) reference extension paths.
**How to avoid:** Update both `Dockerfile` and `flake.nix` in the same task. Also update `supervisor/src/services/boot.ts` to scan the new directory.
**Warning signs:** Nix build succeeds but Docker fails (or vice versa); extensions not found at runtime.

## Code Examples

### Verified: Complete `workbench.colorCustomizations` for ClaudeOS Dark Theme
```json
// Recommended theme palette based on wizard's theme.css brand colors
// Source: wizard accent #d4a054, backgrounds #0a0a0c, cards #131315
{
  "workbench.colorTheme": "Default Dark Modern",
  "workbench.colorCustomizations": {
    // Editor
    "editor.background": "#0e0e10",
    "editor.foreground": "#b0a99e",
    "editor.lineHighlightBackground": "#131315",
    "editor.selectionBackground": "rgba(212, 160, 84, 0.20)",
    "editorCursor.foreground": "#d4a054",

    // Activity Bar
    "activityBar.background": "#0a0a0c",
    "activityBar.foreground": "#d4a054",
    "activityBar.inactiveForeground": "#6b6560",
    "activityBarBadge.background": "#d4a054",
    "activityBarBadge.foreground": "#0a0a0c",

    // Sidebar
    "sideBar.background": "#0c0c0e",
    "sideBar.foreground": "#b0a99e",
    "sideBar.border": "rgba(255, 255, 255, 0.06)",
    "sideBarTitle.foreground": "#ede8e0",

    // Title Bar
    "titleBar.activeBackground": "#0a0a0c",
    "titleBar.activeForeground": "#ede8e0",
    "titleBar.inactiveBackground": "#0a0a0c",

    // Status Bar
    "statusBar.background": "#0a0a0c",
    "statusBar.foreground": "#8a847c",

    // Tabs
    "tab.activeBackground": "#131315",
    "tab.inactiveBackground": "#0a0a0c",
    "tab.activeBorderTop": "#d4a054",
    "tab.border": "rgba(255, 255, 255, 0.06)",

    // Panel (terminal area)
    "panel.background": "#0a0a0c",
    "panel.border": "rgba(255, 255, 255, 0.06)",

    // Buttons
    "button.background": "#d4a054",
    "button.foreground": "#0a0a0c",
    "button.hoverBackground": "#e0b56a",

    // Inputs
    "input.background": "rgba(255, 255, 255, 0.03)",
    "input.border": "rgba(255, 255, 255, 0.08)",
    "input.foreground": "#b0a99e",
    "input.placeholderForeground": "#6b6560",

    // Focus
    "focusBorder": "#d4a054",

    // Lists
    "list.activeSelectionBackground": "rgba(212, 160, 84, 0.15)",
    "list.hoverBackground": "rgba(255, 255, 255, 0.04)",
    "list.activeSelectionForeground": "#ede8e0",

    // Notifications
    "notifications.background": "#131315",
    "notifications.foreground": "#b0a99e"
  }
}
```

### Verified: Copilot Disable Settings
```json
// Source: https://code.visualstudio.com/docs/copilot/faq
{
  "chat.disableAIFeatures": true,
  "github.copilot.enable": {
    "*": false
  }
}
```

### Verified: CSP for Noise Texture Support
```html
<!-- Source: https://code.visualstudio.com/api/extension-guides/webview -->
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
    style-src ${cspSource} 'nonce-${nonce}';
    script-src 'nonce-${nonce}';
    img-src ${cspSource} data:;">
```

### Verified: Inline CSS Variable Usage (No Fallbacks)
```typescript
// Source: https://code.visualstudio.com/api/extension-guides/webview
// In _getHtmlForWebview() template literal:
`
body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background-color: var(--vscode-editor-background);
}

.card {
  background: var(--vscode-sideBar-background);
  border: 1px solid var(--vscode-panel-border);
  color: var(--vscode-foreground);
}

.card:hover {
  border-color: var(--vscode-focusBorder);
}

.description {
  color: var(--vscode-descriptionForeground);
}

.btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.btn-primary:hover {
  background: var(--vscode-button-hoverBackground);
}

.input {
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
}
`
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @vscode/webview-ui-toolkit | Deprecated (archived Jan 2025) | Jan 2025 | Use raw `var(--vscode-*)` CSS variables directly; no toolkit needed |
| Separate theme extension | `workbench.colorCustomizations` in settings | Always available | No extension build step needed for themes |
| Custom `--claudeos-*` CSS vars | `var(--vscode-*)` equivalents | This phase | Theme changes automatically flow to all panels |

**Deprecated/outdated:**
- `@vscode/webview-ui-toolkit`: Archived January 2025, explicitly listed as out of scope in REQUIREMENTS.md

## Open Questions

1. **Accent color for the glow effect**
   - What we know: VS Code theme variables are opaque hex colors; `var(--vscode-focusBorder)` cannot be used with opacity in `radial-gradient()`
   - What's unclear: Whether to use a hardcoded `rgba(212, 160, 84, 0.04)` for the glow (matching the theme accent) or attempt CSS `color-mix()` for dynamic theming
   - Recommendation: Use hardcoded `rgba()` for the glow -- it's decorative and only needs to approximately match the accent. This matches the wizard's existing approach.

2. **THEME-03 requirement conflict**
   - What we know: CONTEXT.md explicitly locks "wizard keeps its own theme.css". REQUIREMENTS.md says wizard should use `var(--vscode-*)`.
   - What's unclear: Whether to update REQUIREMENTS.md or just note the exception in the plan
   - Recommendation: Plan should note THEME-03 as superseded by context decision. Wizard genuinely cannot use VS Code variables (no VS Code context available).

3. **Boot service extension discovery mechanism**
   - What we know: Currently reads `config/default-extensions.json` manifest file
   - What's unclear: Whether to keep the JSON manifest pointing to `default-extensions/` or switch to pure directory scanning
   - Recommendation: Switch to directory scanning -- `readdirSync('default-extensions/').filter(f => f.endsWith('.vsix'))` is simpler and satisfies INFR-03 ("single directory change")

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^3.0.0 |
| Config file | Per-extension: `claudeos-home/vitest.config.ts`, `claudeos-secrets/vitest.config.ts`, `supervisor/vitest.config.ts` |
| Quick run command | `cd claudeos-home && npx vitest run --reporter=verbose` |
| Full suite command | `for d in claudeos-home claudeos-secrets supervisor; do (cd $d && npx vitest run); done` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| THEME-01 | settings.json contains colorCustomizations | unit | `cd supervisor && npx vitest run -t "settings" -x` | No -- Wave 0 |
| THEME-02 | Home panel CSS has no hardcoded hex values | unit | `cd claudeos-home && npx vitest run -t "no hardcoded" -x` | No -- Wave 0 |
| THEME-03 | SUPERSEDED by context decision | N/A | N/A | N/A |
| THEME-04 | Changing theme updates panels automatically | manual-only | Visual verification in running container | N/A (requires VS Code runtime) |
| THEME-05 | settings.json contains Copilot disable settings | unit | `cd supervisor && npx vitest run -t "copilot" -x` | No -- Wave 0 |
| INFR-01 | `default-extensions/` directory exists with VSIX files | unit | `cd supervisor && npx vitest run -t "default-extensions" -x` | No -- Wave 0 |
| INFR-02 | Build process sources from `default-extensions/` | integration | Docker build test (manual) | N/A |
| INFR-03 | Adding extension is single directory change | unit | `cd supervisor && npx vitest run -t "extension discovery" -x` | No -- Wave 0 |
| WELC-01 | Home panel opens on startup with welcome content | unit | `cd claudeos-home && npx vitest run -t "welcome" -x` | No -- Wave 0 |
| WELC-02 | Welcome page has quick actions and getting-started | unit | `cd claudeos-home && npx vitest run -t "quick actions" -x` | No -- Wave 0 |
| WELC-03 | Welcome page uses theme variables | unit | `cd claudeos-home && npx vitest run -t "no hardcoded" -x` | Covered by THEME-02 test |

### Sampling Rate
- **Per task commit:** `cd claudeos-home && npx vitest run --reporter=verbose`
- **Per wave merge:** `for d in claudeos-home claudeos-secrets supervisor; do (cd $d && npx vitest run); done`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `claudeos-home/test/webview/theme-compliance.test.ts` -- covers THEME-02, WELC-03 (assert no hardcoded hex in CSS output)
- [ ] `supervisor/test/services/boot-extensions-dir.test.ts` -- covers INFR-01, INFR-03 (directory scanning)
- [ ] `supervisor/test/config/settings-validation.test.ts` -- covers THEME-01, THEME-05 (settings.json content assertions)

## Sources

### Primary (HIGH confidence)
- [VS Code Theme Color Reference](https://code.visualstudio.com/api/references/theme-color) - Complete list of customizable color tokens
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview) - CSP, CSS variables, webview lifecycle
- [VS Code Themes Documentation](https://code.visualstudio.com/docs/configure/themes) - workbench.colorCustomizations usage
- [VS Code Contribution Points](https://code.visualstudio.com/api/references/contribution-points) - Walkthroughs API structure
- [VS Code Copilot Settings Reference](https://code.visualstudio.com/docs/copilot/reference/copilot-settings) - chat.disableAIFeatures, github.copilot.enable

### Secondary (MEDIUM confidence)
- [VS Code Webview CSS Variables Issue #2060](https://github.com/microsoft/vscode-docs/issues/2060) - Confirmed CSS variable naming convention
- [Elio Struyf: Theme VS Code Webview](https://www.eliostruyf.com/code-driven-approach-theme-vscode-webview/) - Practical webview theming patterns

### Tertiary (LOW confidence)
- Noise texture in VS Code webviews -- CSP `img-src data:` approach is standard web practice but not explicitly documented for VS Code webviews; needs runtime verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All approaches use documented VS Code APIs, no third-party libraries
- Architecture: HIGH - Patterns verified against official documentation; existing codebase already 80% aligned
- Pitfalls: HIGH - CSP, variable naming, and accent color issues are well-documented; THEME-03 conflict is explicitly flagged
- Extensions infrastructure: MEDIUM - Directory scanning approach is straightforward but requires coordinated updates across Dockerfile, flake.nix, and boot service

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable -- VS Code theming API is mature and rarely changes)
