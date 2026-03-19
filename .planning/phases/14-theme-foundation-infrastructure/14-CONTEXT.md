# Phase 14: Theme Foundation & Infrastructure - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

ClaudeOS gets a unified visual identity — custom dark theme applied by default, all VS Code webview panels (Home, Secrets) migrated to pure `var(--vscode-*)` CSS variables, the setup wizard keeps its independent theme, Copilot UI is disabled, a custom welcome page replaces VS Code defaults, and default extensions are restructured into an in-repo directory.

</domain>

<decisions>
## Implementation Decisions

### CSS Migration Strategy
- Wizard keeps its own independent `theme.css` — it runs before code-server starts and has no VS Code theme context
- VS Code webview panels (Home, Secrets) migrate to pure `var(--vscode-*)` variables with NO hardcoded hex fallbacks — variables are guaranteed to exist inside VS Code
- VS Code panels use native VS Code font stack (`var(--vscode-font-family)`, `var(--vscode-editor-font-family)`) — no custom fonts in webviews
- Wizard keeps its custom fonts (Syne, Figtree, JetBrains Mono) — these are wizard-only
- Noise texture overlay and radial ambient glow effects from the wizard should be brought into VS Code webview panels (Home panel, etc.) for a branded, premium feel

### Claude's Discretion
- ClaudeOS dark theme color palette (accent colors, activity bar, sidebar tones) — define what looks right as a cohesive VS Code color theme
- Welcome page layout, quick actions, and getting-started content
- Default extensions directory structure and build integration approach
- Copilot disable mechanism (settings keys and values)
- How to implement noise/glow effects in VS Code webviews while respecting theme variable usage

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Theming
- `.planning/REQUIREMENTS.md` — THEME-01 through THEME-05: custom dark theme, CSS variable migration, Copilot removal
- `config/settings.json` — Current VS Code settings (theme is "Default Dark Modern")
- `config/product.json` — ClaudeOS branding (nameShort, applicationName, extensionsGallery)

### Existing CSS
- `supervisor/wizard/src/theme.css` — Wizard's standalone color system and decorative effects (noise texture, radial glow)
- `claudeos-home/src/webview/home-panel.ts` — Home panel inline CSS with var(--vscode-*) + hardcoded fallbacks to strip
- `claudeos-secrets/src/webview/secrets-panel.ts` — Secrets panel inline CSS with var(--vscode-*) + hardcoded fallbacks to strip

### Welcome Page
- `.planning/REQUIREMENTS.md` — WELC-01 through WELC-03: custom welcome page replacing VS Code default

### Extensions Infrastructure
- `.planning/REQUIREMENTS.md` — INFR-01 through INFR-03: default-extensions/ directory, build sourcing
- `config/default-extensions.json` — Current 4-extension manifest (local-vsix method, paths to /app/extensions/)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `supervisor/wizard/src/theme.css` — Noise texture SVG and radial glow CSS can be adapted for VS Code webview panels
- `claudeos-home/src/webview/home-panel.ts` — Already structured with inline CSS block, ready for variable cleanup
- `claudeos-secrets/src/webview/secrets-panel.ts` — Same inline CSS pattern, ready for variable cleanup

### Established Patterns
- VS Code webview panels use inline CSS in TypeScript template literals (not external CSS files)
- All webview CSS uses `var(--vscode-*)` with fallback values — migration strips fallbacks
- Wizard is a standalone React + Vite app with CSS modules — completely independent from VS Code

### Integration Points
- `config/settings.json` — Where the custom theme will be set as default (`workbench.colorTheme`)
- `config/settings.json` — Where Copilot disable settings go (`chat.disableAIFeatures`, `github.copilot.enable`)
- `config/default-extensions.json` → new `default-extensions/` directory — build process (Nix/Dockerfile) needs to source from new location
- VS Code color theme can be defined inline in settings.json or as a contribution in an extension's package.json

</code_context>

<specifics>
## Specific Ideas

- Noise texture and ambient glow from the wizard should carry through to the VS Code experience — branded, premium feel throughout
- Wizard and VS Code panels are intentionally decoupled — wizard is its own standalone React app

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-theme-foundation-infrastructure*
*Context gathered: 2026-03-18*
