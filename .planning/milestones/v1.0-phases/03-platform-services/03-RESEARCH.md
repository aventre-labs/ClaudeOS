# Phase 3: Platform Services - Research

**Researched:** 2026-03-12
**Domain:** VS Code extension webview UI (secrets management + home page), extension-to-extension public API, status bar indicators
**Confidence:** HIGH

## Summary

Phase 3 builds two extensions -- `claudeos-secrets` (separate repo) and `claudeos-home` (in main repo) -- that are both pure UI wrappers around the existing supervisor REST API. The supervisor already has full secrets CRUD with AES-256-GCM encryption (Phase 1), and session listing (Phase 1). The work is entirely on the VS Code extension side: webview panels, sidebar tree views, status bar items, message passing, and inter-extension communication.

The two primary technical challenges are: (1) webview development without the deprecated VS Code Webview UI Toolkit (deprecated Jan 2025), requiring hand-crafted HTML/CSS using VS Code's CSS variables for theming, and (2) exposing a public API from claudeos-secrets so other extensions can programmatically access secrets via `vscode.extensions.getExtension().exports`.

The established project patterns from Phase 2 (SupervisorClient, vitest with vscode mock, esbuild bundling, codicon-based icons, OutputChannel logging) apply directly and should be replicated exactly.

**Primary recommendation:** Both extensions follow the exact same architecture as claudeos-sessions -- SupervisorClient for REST calls, vitest with vscode alias mock for testing, esbuild for CJS bundling, codicon ThemeIcons for all icons. Webview HTML/CSS uses VS Code CSS variables directly (no component library). The secrets extension exports a public API object from `activate()` for cross-extension access.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- List + detail panel layout: left side shows secret names, clicking one opens edit form on right
- Values always masked (bullet dots) by default, click eye icon to reveal temporarily
- Copy button works without revealing the value
- Both a sidebar tree view (simple secret list) AND an editor tab (full list+detail webview)
- Clicking a secret in the sidebar opens the full editor tab with that secret selected
- '+' button above the list in the left panel switches detail panel to an empty form
- Secret is only created when save button is clicked (not on form open)
- Category and tags fields available (supervisor API already supports these)
- Delete requires confirmation
- First-run walkthrough triggers on first extension activation AND shows persistent banner on home page until key is set
- Prompts for two essential secrets: Anthropic API key AND GitHub PAT
- When Anthropic API key is set, it is written to Claude Code's env/config so sessions can use it automatically
- Status bar shows simple configured/not-configured indicator (key icon with checkmark or warning)
- Clicking status bar opens secrets webview filtered to the Anthropic key
- Branded hero style with ClaudeOS logo/wordmark -- distinct product identity, not generic VS Code feel
- Custom accent colors, makes ClaudeOS feel like its own product
- Opens as first tab every time ClaudeOS launches (no "don't show again" option)
- Recent sessions displayed as cards with preview (name, status, last message snippet, time)
- Click a session card to open its terminal
- New session button on home page
- Customizable shortcuts grid -- default shortcuts provided, user can add/remove/reorder
- claudeos-home: Built-in extension in the main ClaudeOS repo, alongside the supervisor
- claudeos-secrets: Separate repo at aventre-labs/claudeos-secrets, own CI/CD, VSIX as GitHub release
- claudeos-secrets has optional dependency on claudeos-sessions (runtime check, not extensionDependencies)

### Claude's Discretion
- Sidebar tree view design for secrets list (codicons, grouping by category)
- Webview CSS/HTML implementation (within branded constraint)
- Shortcuts grid default contents and customization persistence mechanism
- Home page session card layout details (how many to show, card sizing)
- How the Anthropic key is written to Claude Code env (env var injection method)
- Notification toast wording for first-run walkthrough
- Status bar position and exact icon choices

### Deferred Ideas (OUT OF SCOPE)
- Usage visualizer extension -- Status bar showing Anthropic API costs (past 24h/7d/30d) for API key users, or usage limit progress bars (session/weekly/sonnet-only) for subscription users. Should be its own extension and phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEC-01 | User can store API keys and tokens in encrypted storage (AES-256-GCM, key derived from CLAUDEOS_AUTH_TOKEN) | Supervisor SecretStore already implements this (Phase 1). Extension calls POST /api/v1/secrets. |
| SEC-02 | User can add, edit, and delete secrets via a webview form UI | WebviewPanel with postMessage communication pattern. List+detail layout per locked decision. |
| SEC-03 | Other extensions can access secrets via a public API (getSecret, setSecret, hasSecret, deleteSecret, listSecrets) | VS Code extension public API pattern: return API object from activate(), consumers use vscode.extensions.getExtension().exports |
| SEC-04 | Status bar indicator shows whether Anthropic API key is configured | vscode.window.createStatusBarItem with alignment and priority. Poll supervisor API on activation. |
| SEC-05 | First-run walkthrough prompts user to set up essential secrets (Anthropic API key) | globalState.get/update for first-run tracking. Information message with action buttons. |
| SEC-06 | When Anthropic API key is set, it is also written to Claude Code's expected environment so Claude Code can use it | tmux set-environment or supervisor-side env file approach. See Architecture Patterns section. |
| HOM-01 | User sees a welcome webview tab on startup with ClaudeOS branding | WebviewPanel created in activate(), opened on onStartupFinished. Custom CSS with branded accent colors. |
| HOM-02 | User can create a new session from the home page | Webview postMessage -> extension executes claudeos.sessions.create command or calls supervisor API directly. |
| HOM-03 | User can see recent sessions on the home page | Extension calls GET /api/v1/sessions, renders session cards in webview HTML. |
| HOM-04 | User can access shortcuts grid with frequently used actions | Webview renders grid of shortcut cards, click triggers vscode.commands.executeCommand via postMessage. Customization persisted in globalState. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vscode API | ^1.85.0 | Extension host API (webviews, tree views, status bar, commands) | Native VS Code extension development -- all UI primitives come from here |
| esbuild | ^0.27.0 | Bundle TypeScript to CJS for extension host | Established in Phase 1/2, used by extension-template and claudeos-sessions |
| vitest | ^4.0.0 | Unit testing with VS Code mock alias | Established in Phase 2 with vscode mock pattern |
| @vscode/vsce | ^3.7.0 | Package VSIX for distribution | Standard VS Code extension packaging tool |
| TypeScript | ~5.8.0 | Type safety | Project standard from Phase 1 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ws | ^8.18.0 | WebSocket client for real-time updates | Only if secrets extension needs reactive updates from supervisor (optional) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw HTML/CSS webviews | React/Svelte in webview | Adds build complexity for webview bundle; raw HTML is simpler for list+detail forms and keeps bundle small |
| VS Code CSS variables | vscode-elements (Lit components) | Community toolkit exists but adds dependency; CSS variables are native and zero-dependency |
| globalState for shortcuts | JSON file on disk | globalState is VS Code-native, survives extension updates, no file I/O needed |

**Installation (claudeos-secrets):**
```bash
npm init -y
npm install --save-dev @types/vscode@^1.85.0 typescript@~5.8.0 esbuild@^0.27.0 @vscode/vsce@^3.7.0 vitest@^4.0.0
```

**Installation (claudeos-home -- in main repo):**
```bash
# Same devDependencies pattern, added as new workspace or directory
```

## Architecture Patterns

### Recommended Project Structure -- claudeos-secrets
```
claudeos-secrets/
  src/
    extension.ts           # activate/deactivate, wiring
    supervisor/
      client.ts            # SupervisorClient (secrets-specific methods)
    sidebar/
      secrets-tree.ts      # TreeDataProvider for sidebar list
      secrets-item.ts      # TreeItem factory for individual secrets
    webview/
      secrets-panel.ts     # WebviewPanel manager (create, message handling)
      html/
        secrets.html       # Main webview HTML template
        secrets.css        # Webview styles using VS Code CSS vars
        secrets.js         # Webview-side script (acquireVsCodeApi, postMessage)
    status/
      api-key-status.ts    # Status bar item for Anthropic key
    onboarding/
      first-run.ts         # First-run walkthrough logic
    api/
      public-api.ts        # Public API object returned from activate()
  test/
    __mocks__/
      vscode.ts            # Copy from claudeos-sessions (extended with webview mocks)
    supervisor/
      client.test.ts
    sidebar/
      secrets-tree.test.ts
    webview/
      secrets-panel.test.ts
    api/
      public-api.test.ts
  vitest.config.ts
  tsconfig.json
  package.json
  .vscodeignore
  .gitignore
```

### Recommended Project Structure -- claudeos-home
```
claudeos-home/
  src/
    extension.ts           # activate/deactivate, open home on startup
    supervisor/
      client.ts            # SupervisorClient (sessions + health)
    webview/
      home-panel.ts        # WebviewPanel manager
      html/
        home.html          # Home page HTML template
        home.css           # Branded styles
        home.js            # Webview-side script
    shortcuts/
      shortcut-store.ts    # globalState-based shortcut persistence
  test/
    __mocks__/
      vscode.ts
    webview/
      home-panel.test.ts
    shortcuts/
      shortcut-store.test.ts
  vitest.config.ts
  tsconfig.json
  package.json
  .vscodeignore
  .gitignore
```

### Pattern 1: WebviewPanel with Message Passing
**What:** Create a webview panel, render HTML with VS Code CSS variable theming, communicate bidirectionally via postMessage.
**When to use:** For the secrets list+detail webview and the home page.
**Example:**
```typescript
// Source: VS Code official docs - https://code.visualstudio.com/api/extension-guides/webview

// Extension side: create panel and handle messages
function createSecretsPanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'claudeos.secrets',           // viewType
    'ClaudeOS Secrets',           // title
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,  // keep webview state when tab is hidden
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview')]
    }
  );

  // Handle messages from webview
  panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.command) {
      case 'getSecrets':
        const secrets = await client.listSecrets();
        panel.webview.postMessage({ command: 'secretsList', data: secrets });
        break;
      case 'saveSecret':
        await client.createSecret(message.data);
        break;
      case 'deleteSecret':
        await client.deleteSecret(message.data.name);
        break;
    }
  });

  panel.webview.html = getSecretsHtml(panel.webview, context.extensionUri);
  return panel;
}
```

```javascript
// Webview side: acquireVsCodeApi + message handling
// Source: VS Code official docs
(function() {
  const vscode = acquireVsCodeApi();

  // Request data from extension
  vscode.postMessage({ command: 'getSecrets' });

  // Handle responses
  window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
      case 'secretsList':
        renderSecretsList(message.data);
        break;
    }
  });

  // Persist UI state across tab switches
  vscode.setState({ selectedSecret: currentSecretName });
})();
```

### Pattern 2: Content Security Policy with Nonce
**What:** Every webview must include a CSP meta tag with nonce-based script/style sources for security.
**When to use:** Every webview HTML template.
**Example:**
```typescript
// Source: VS Code official docs
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function getHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'webview', 'secrets.css')
  );
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'webview', 'secrets.js')
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
</head>
<body>
  <!-- content -->
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
```

### Pattern 3: Public Extension API
**What:** Return an API object from `activate()` so other extensions can call `vscode.extensions.getExtension('claudeos.claudeos-secrets').exports`.
**When to use:** SEC-03 requires cross-extension secret access.
**Example:**
```typescript
// Source: VS Code official docs - https://code.visualstudio.com/api/references/vscode-api

// In claudeos-secrets/src/extension.ts
export async function activate(context: vscode.ExtensionContext) {
  const client = new SupervisorClient();
  // ... setup sidebar, webview, status bar ...

  // Public API for other extensions
  const api = {
    async getSecret(name: string): Promise<string | undefined> {
      try {
        return await client.getSecretValue(name);
      } catch {
        return undefined;
      }
    },
    async setSecret(name: string, value: string, category?: string): Promise<void> {
      await client.createOrUpdateSecret(name, value, category);
    },
    async hasSecret(name: string): Promise<boolean> {
      return client.hasSecret(name);
    },
    async deleteSecret(name: string): Promise<void> {
      await client.deleteSecret(name);
    },
    async listSecrets(): Promise<Array<{ name: string; category?: string }>> {
      return client.listSecrets();
    },
  };

  return api;  // This becomes extension.exports
}

// In consuming extension (e.g., claudeos-self-improve):
const secretsExt = vscode.extensions.getExtension('claudeos.claudeos-secrets');
if (secretsExt) {
  const secretsApi = secretsExt.isActive ? secretsExt.exports : await secretsExt.activate();
  const apiKey = await secretsApi.getSecret('ANTHROPIC_API_KEY');
}
```

### Pattern 4: SupervisorClient for Secrets
**What:** HTTP client wrapping the supervisor secrets REST API, following the exact same pattern as the sessions SupervisorClient.
**When to use:** All secrets extension interactions with the supervisor.
**Example:**
```typescript
// Modeled after claudeos-sessions/src/supervisor/client.ts
export class SupervisorClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3100/api/v1') {
    this.baseUrl = baseUrl;
  }

  async listSecrets(): Promise<SecretMeta[]> {
    const res = await fetch(`${this.baseUrl}/secrets`, { method: 'GET' });
    if (!res.ok) throw new Error(`Failed to list secrets: ${res.status}`);
    return res.json() as Promise<SecretMeta[]>;
  }

  async getSecretValue(name: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/secrets/${encodeURIComponent(name)}`, { method: 'GET' });
    if (!res.ok) throw new Error(`Failed to get secret: ${res.status}`);
    const data = await res.json() as { name: string; value: string };
    return data.value;
  }

  async createSecret(name: string, value: string, category?: string, tags?: string[]): Promise<void> {
    const res = await fetch(`${this.baseUrl}/secrets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, value, category, tags }),
    });
    if (!res.ok) throw new Error(`Failed to create secret: ${res.status}`);
  }

  async updateSecret(name: string, value?: string, category?: string, tags?: string[]): Promise<void> {
    const res = await fetch(`${this.baseUrl}/secrets/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value, category, tags }),
    });
    if (!res.ok) throw new Error(`Failed to update secret: ${res.status}`);
  }

  async deleteSecret(name: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/secrets/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to delete secret: ${res.status}`);
  }

  async hasSecret(name: string): Promise<boolean> {
    try {
      const secrets = await this.listSecrets();
      return secrets.some(s => s.name === name);
    } catch {
      return false;
    }
  }
}
```

### Pattern 5: Status Bar Item
**What:** A persistent status bar item showing Anthropic API key configuration state.
**When to use:** SEC-04 requires visual indicator.
**Example:**
```typescript
// Source: VS Code API docs
function createApiKeyStatusItem(context: vscode.ExtensionContext): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(
    'claudeos.apiKeyStatus',
    vscode.StatusBarAlignment.Right,
    100
  );
  item.command = 'claudeos.secrets.openAnthropicKey';
  item.name = 'ClaudeOS API Key Status';
  context.subscriptions.push(item);
  return item;
}

function updateStatusItem(item: vscode.StatusBarItem, isConfigured: boolean): void {
  if (isConfigured) {
    item.text = '$(key) API Key';
    item.tooltip = 'Anthropic API key is configured';
    item.backgroundColor = undefined;
  } else {
    item.text = '$(warning) API Key';
    item.tooltip = 'Anthropic API key not configured - click to set up';
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  item.show();
}
```

### Pattern 6: Anthropic Key -> Claude Code Environment Injection
**What:** When the Anthropic API key is set/updated, write it so tmux sessions can access it.
**When to use:** SEC-06.
**Recommended approach:** Use tmux `set-environment` to set `ANTHROPIC_API_KEY` in the tmux server's global environment. All new tmux sessions inherit global environment variables. For existing sessions, use `send-keys` to export the variable.

This approach is cleanest because:
- tmux `set-environment -g ANTHROPIC_API_KEY <value>` sets it globally for all future sessions
- No file I/O needed, no shell config modification
- The supervisor already has full tmux control
- Alternative (writing to ~/.bashrc or a file) is fragile and requires shell restarts

**Implementation:** Add a supervisor API endpoint (e.g., `POST /api/v1/config/env`) that accepts key-value pairs and runs `tmux set-environment -g`. The secrets extension calls this endpoint after saving the Anthropic API key.

```typescript
// New supervisor endpoint approach:
// POST /api/v1/config/env { key: "ANTHROPIC_API_KEY", value: "sk-ant-..." }
// Supervisor runs: tmux set-environment -g ANTHROPIC_API_KEY sk-ant-...

// Simpler approach (secrets extension calls existing secrets API + new env endpoint):
async function onAnthropicKeyUpdated(value: string): Promise<void> {
  // Set in supervisor's tmux global environment
  await fetch('http://localhost:3100/api/v1/config/env', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'ANTHROPIC_API_KEY', value }),
  });
}
```

### Pattern 7: WebviewViewProvider for Sidebar
**What:** Register a WebviewViewProvider for the secrets sidebar tree. However, since the sidebar is a simple list (not a rich webview), use a standard TreeDataProvider instead.
**When to use:** The secrets sidebar uses TreeDataProvider (like sessions sidebar), NOT WebviewViewProvider. The full webview is only for the editor tab.
**Key distinction:** The sidebar tree view is a native VS Code tree (TreeDataProvider). The editor tab is a WebviewPanel. Clicking a tree item opens the WebviewPanel.

### Anti-Patterns to Avoid
- **Using the deprecated @vscode/webview-ui-toolkit:** Deprecated Jan 2025. Use raw HTML with VS Code CSS variables instead.
- **Building a React/Svelte app for simple forms:** The secrets form is just a text input, masked password field, category dropdown, and tags input. Raw HTML is sufficient and avoids a separate build pipeline for the webview.
- **Storing secrets in extension globalState:** Secrets MUST go through the supervisor API which handles AES-256-GCM encryption. Never store secret values client-side.
- **Hard-coding colors in webview CSS:** Always use `var(--vscode-*)` CSS variables so the UI respects the user's theme.
- **Missing retainContextWhenHidden:** Without this option, the webview re-renders every time the user switches tabs, losing form state. Set `retainContextWhenHidden: true` for the secrets editor panel.
- **Calling acquireVsCodeApi() more than once:** This function can only be called once per webview lifecycle. Store the reference and pass it around.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secret encryption | Custom crypto in extension | Supervisor SecretStore API (already done) | AES-256-GCM with proper IV management is already implemented and tested |
| Webview theming | Custom color system | VS Code CSS variables (--vscode-*) | Automatic theme support for light/dark/high-contrast |
| Extension communication | Custom IPC/events between extensions | VS Code public API exports pattern | Standard, supported, handles activation ordering |
| Form validation | Custom validators | HTML5 constraint validation + pattern attribute | Simple forms don't need a validation library |
| Nonce generation | uuid/crypto library | Simple random string function | getNonce() is ~5 lines, no dependency needed |
| Status bar management | Custom status UI | vscode.window.createStatusBarItem | Native API with proper alignment, priority, theming |

**Key insight:** Both extensions are thin UI shells over the supervisor REST API. The "hard" crypto work is done. The challenge is clean webview HTML/CSS/message-passing, not business logic.

## Common Pitfalls

### Pitfall 1: Webview Content Security Policy Blocking Scripts
**What goes wrong:** Webview shows HTML but scripts don't execute, no error visible.
**Why it happens:** Missing or misconfigured CSP meta tag. Scripts require nonce-based source.
**How to avoid:** Always include `<meta http-equiv="Content-Security-Policy" content="...">` with nonce for script-src and style-src. Generate fresh nonce on each HTML render.
**Warning signs:** Webview renders but buttons don't work, no console errors visible (webview DevTools needed).

### Pitfall 2: Lost Webview State on Tab Switch
**What goes wrong:** User fills in a form, switches to another tab, switches back, form is empty.
**Why it happens:** Without `retainContextWhenHidden: true`, VS Code destroys the webview DOM when the tab is hidden.
**How to avoid:** Set `retainContextWhenHidden: true` in WebviewPanel options for the secrets editor. Alternatively, use `getState()`/`setState()` to persist and restore on webview recreation.
**Warning signs:** Form data disappears when switching tabs.

### Pitfall 3: Extension Activation Order for Public API
**What goes wrong:** Consuming extension calls `getExtension().exports` but gets undefined.
**Why it happens:** The secrets extension hasn't activated yet. `exports` is only available after `activate()` returns.
**How to avoid:** Always check `isActive` first. If not active, call `await ext.activate()`. Better: use `extensionDependencies` in package.json (but CONTEXT.md says optional dep, so use runtime check).
**Warning signs:** `exports` is undefined, methods throw "not a function" errors.

### Pitfall 4: Webview Resource URIs
**What goes wrong:** CSS/JS files in webview show as broken links (404).
**Why it happens:** Webviews run in a sandboxed iframe. Local file paths don't work. Must use `webview.asWebviewUri()` to convert.
**How to avoid:** Always convert resource paths with `webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'path'))`. Set `localResourceRoots` to the webview assets directory.
**Warning signs:** Styles don't load, scripts don't execute, network tab shows blocked requests.

### Pitfall 5: Home Page Opening Multiple Times
**What goes wrong:** Every window reload opens another home tab, leading to duplicates.
**Why it happens:** `onStartupFinished` fires on every activation. No check for existing panel.
**How to avoid:** Track the panel reference. If the panel already exists, `panel.reveal()` instead of creating a new one. Use `panel.onDidDispose` to clear the reference.
**Warning signs:** Multiple "ClaudeOS Home" tabs accumulate.

### Pitfall 6: Encoding in Secret Names for URL Paths
**What goes wrong:** Secrets with special characters (dots, slashes) cause 404 on GET/PUT/DELETE.
**Why it happens:** Secret name is used as URL path parameter without encoding.
**How to avoid:** Always use `encodeURIComponent(name)` when building URLs for secret operations.
**Warning signs:** CRUD works for simple names, fails for names with special characters.

### Pitfall 7: Copy-to-Clipboard in Webview
**What goes wrong:** `navigator.clipboard.writeText()` fails silently in webview.
**Why it happens:** Webview sandbox restrictions may block clipboard API depending on CSP.
**How to avoid:** Send a postMessage to the extension host, then use `vscode.env.clipboard.writeText()` from the extension side.
**Warning signs:** Copy button appears to work but clipboard is empty.

## Code Examples

### Webview CSS with VS Code Theme Variables
```css
/* Source: VS Code official docs - https://code.visualstudio.com/api/references/theme-color */

:root {
  /* ClaudeOS custom accent -- layered on top of VS Code theme */
  --claudeos-accent: #c084fc;       /* purple-400 */
  --claudeos-accent-hover: #a855f7; /* purple-500 */
}

body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background-color: var(--vscode-editor-background);
  padding: 0;
  margin: 0;
}

.panel {
  background: var(--vscode-sideBar-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
}

input, select, textarea {
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 2px;
  padding: 4px 8px;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  outline: none;
}

input:focus, select:focus, textarea:focus {
  border-color: var(--vscode-focusBorder);
}

button.primary {
  background: var(--claudeos-accent);
  color: #fff;
  border: none;
  padding: 6px 14px;
  border-radius: 2px;
  cursor: pointer;
}

button.primary:hover {
  background: var(--claudeos-accent-hover);
}

button.secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: none;
  padding: 6px 14px;
  border-radius: 2px;
  cursor: pointer;
}

button.danger {
  background: var(--vscode-inputValidation-errorBackground);
  color: var(--vscode-errorForeground);
}

/* Masked secret value */
.secret-value-masked {
  font-family: monospace;
  letter-spacing: 2px;
}

/* Codicon usage in webview */
.codicon {
  font-family: codicon;
  font-size: 16px;
}
```

### Secrets Sidebar TreeDataProvider
```typescript
// Follows claudeos-sessions/src/sidebar/session-tree.ts pattern exactly

import * as vscode from 'vscode';

interface SecretMeta {
  name: string;
  category?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

type TreeElement =
  | { type: 'category'; category: string }
  | { type: 'secret'; secret: SecretMeta };

export class SecretsTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private secrets: SecretMeta[] = [];

  update(secrets: SecretMeta[]): void {
    this.secrets = secrets;
    this._onDidChangeTreeData.fire(undefined);
  }

  getChildren(element?: TreeElement): TreeElement[] {
    if (!element) {
      // Group by category at root
      const categories = new Map<string, SecretMeta[]>();
      for (const secret of this.secrets) {
        const cat = secret.category || 'Uncategorized';
        const list = categories.get(cat) || [];
        list.push(secret);
        categories.set(cat, list);
      }
      return Array.from(categories.keys()).map(cat => ({ type: 'category' as const, category: cat }));
    }
    if (element.type === 'category') {
      return this.secrets
        .filter(s => (s.category || 'Uncategorized') === element.category)
        .map(s => ({ type: 'secret' as const, secret: s }));
    }
    return [];
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    if (element.type === 'category') {
      const item = new vscode.TreeItem(element.category, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon('key');
      return item;
    }
    const item = new vscode.TreeItem(element.secret.name, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('lock');
    item.command = {
      command: 'claudeos.secrets.openEditor',
      title: 'Edit Secret',
      arguments: [element.secret.name],
    };
    item.contextValue = 'secret';
    return item;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
```

### Home Page -- Opening on Startup
```typescript
// Source: VS Code API pattern
export async function activate(context: vscode.ExtensionContext) {
  let homePanel: vscode.WebviewPanel | undefined;

  // Open home page on startup
  homePanel = createHomePanel(context);

  // Track disposal
  homePanel.onDidDispose(() => {
    homePanel = undefined;
  });

  // Command to re-open if closed
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeos.home.open', () => {
      if (homePanel) {
        homePanel.reveal();
      } else {
        homePanel = createHomePanel(context);
        homePanel.onDidDispose(() => { homePanel = undefined; });
      }
    })
  );
}
```

### First-Run Walkthrough
```typescript
// SEC-05: First-run detection using globalState
async function checkFirstRun(
  context: vscode.ExtensionContext,
  client: SupervisorClient,
): Promise<void> {
  const hasRunBefore = context.globalState.get<boolean>('claudeos.secrets.hasRunBefore');

  if (!hasRunBefore) {
    await context.globalState.update('claudeos.secrets.hasRunBefore', true);

    const action = await vscode.window.showInformationMessage(
      'Welcome to ClaudeOS! Set up your Anthropic API key and GitHub PAT to get started.',
      'Set Up Now',
      'Later',
    );

    if (action === 'Set Up Now') {
      vscode.commands.executeCommand('claudeos.secrets.openEditor', 'ANTHROPIC_API_KEY');
    }
  }

  // Also check if Anthropic key exists (for persistent banner on home page)
  const hasAnthropicKey = await client.hasSecret('ANTHROPIC_API_KEY');
  vscode.commands.executeCommand(
    'setContext',
    'claudeos.secrets.anthropicKeyConfigured',
    hasAnthropicKey,
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @vscode/webview-ui-toolkit (FAST-based components) | Raw HTML + VS Code CSS variables OR community vscode-elements | Jan 2025 (deprecated) | Must write form HTML manually; CSS variables provide theming for free |
| Extension-to-extension via commands only | Public API via activate() return + extensionDependencies | Stable since VS Code 1.x | Cleaner typed API for cross-extension communication |
| onStartupFinished only | onView + onWebviewPanel activation events | Stable | Use onView:claudeos.secrets for sidebar, onStartupFinished for home page |

**Deprecated/outdated:**
- @vscode/webview-ui-toolkit: Deprecated Jan 2025 due to FAST Foundation deprecation. Do not use.
- webview.enableFindWidget: Still available but rarely needed for form-based webviews.

## Open Questions

1. **Tmux `-e` flag availability in container**
   - What we know: tmux supports `-e` flag for setting environment variables during `new-session`. tmux also supports `set-environment -g` for global env vars.
   - What's unclear: Whether the container's tmux version supports `-e` (added in tmux 3.0+). The container uses Nix-built tmux.
   - Recommendation: Use `set-environment -g` instead of `-e` flag. It works on all tmux versions and sets the variable globally so all future sessions inherit it. This avoids version concerns entirely.

2. **Codicon font availability in webviews**
   - What we know: VS Code ships codicons. In the extension host, `ThemeIcon` references codicons. In webviews, you may need to load the codicon font explicitly.
   - What's unclear: Whether code-server's webview environment automatically provides the codicon font.
   - Recommendation: Include the codicon font CSS as a webview resource. VS Code provides `vscode.Uri.joinPath(context.extensionUri)` for bundled assets. If not available, use simple Unicode symbols or SVG icons as fallback.

3. **Home page brand assets (logo, wordmark)**
   - What we know: Decision says "ClaudeOS logo/wordmark" with branded hero.
   - What's unclear: Whether brand assets already exist or need to be created.
   - Recommendation: Create simple SVG logo/wordmark during implementation. SVGs work natively in webviews and scale to any size.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.0.0 |
| Config file | vitest.config.ts in each extension directory |
| Quick run command | `npx vitest run` |
| Full suite command | `cd claudeos-secrets && npx vitest run && cd ../claudeos-home && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01 | Store secrets via supervisor API | unit | `npx vitest run test/supervisor/client.test.ts -t "createSecret"` | Wave 0 |
| SEC-02 | Add/edit/delete via webview form | unit | `npx vitest run test/webview/secrets-panel.test.ts` | Wave 0 |
| SEC-03 | Public API (getSecret, setSecret, etc.) | unit | `npx vitest run test/api/public-api.test.ts` | Wave 0 |
| SEC-04 | Status bar shows API key state | unit | `npx vitest run test/status/api-key-status.test.ts` | Wave 0 |
| SEC-05 | First-run walkthrough triggers | unit | `npx vitest run test/onboarding/first-run.test.ts` | Wave 0 |
| SEC-06 | Anthropic key written to Claude Code env | unit | `npx vitest run test/supervisor/client.test.ts -t "setEnv"` | Wave 0 |
| HOM-01 | Welcome tab opens on startup | unit | `npx vitest run test/webview/home-panel.test.ts -t "opens on activate"` | Wave 0 |
| HOM-02 | Create session from home page | unit | `npx vitest run test/webview/home-panel.test.ts -t "create session"` | Wave 0 |
| HOM-03 | Recent sessions displayed | unit | `npx vitest run test/webview/home-panel.test.ts -t "recent sessions"` | Wave 0 |
| HOM-04 | Shortcuts grid rendered | unit | `npx vitest run test/shortcuts/shortcut-store.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run` (in the relevant extension directory)
- **Per wave merge:** Run vitest in both claudeos-secrets and claudeos-home directories
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `claudeos-secrets/test/__mocks__/vscode.ts` -- extended VS Code mock with webview and status bar mocks (copy from claudeos-sessions and extend)
- [ ] `claudeos-secrets/vitest.config.ts` -- vitest config with vscode alias
- [ ] `claudeos-secrets/test/supervisor/client.test.ts` -- SupervisorClient for secrets API
- [ ] `claudeos-secrets/test/webview/secrets-panel.test.ts` -- webview panel message handling
- [ ] `claudeos-secrets/test/api/public-api.test.ts` -- public API contract tests
- [ ] `claudeos-secrets/test/status/api-key-status.test.ts` -- status bar update logic
- [ ] `claudeos-secrets/test/onboarding/first-run.test.ts` -- first-run detection
- [ ] `claudeos-home/test/__mocks__/vscode.ts` -- VS Code mock with webview mocks
- [ ] `claudeos-home/vitest.config.ts` -- vitest config with vscode alias
- [ ] `claudeos-home/test/webview/home-panel.test.ts` -- home panel creation and message handling
- [ ] `claudeos-home/test/shortcuts/shortcut-store.test.ts` -- shortcut persistence

## Sources

### Primary (HIGH confidence)
- Supervisor source code: `supervisor/src/routes/secrets.ts`, `supervisor/src/services/secret-store.ts`, `supervisor/src/schemas/secret.ts` -- full secrets CRUD API already implemented
- Supervisor types: `supervisor/src/types.ts` -- Secret, SecretEntry interfaces defined
- Sessions extension: `claudeos-sessions/src/` -- established patterns for SupervisorClient, TreeDataProvider, vitest mock, esbuild config
- VS Code official webview docs: https://code.visualstudio.com/api/extension-guides/webview -- postMessage, CSP, nonce, state management
- VS Code API reference: https://code.visualstudio.com/api/references/vscode-api -- WebviewPanel, StatusBarItem, extension exports
- VS Code theme color reference: https://code.visualstudio.com/api/references/theme-color -- CSS variable names for webview theming

### Secondary (MEDIUM confidence)
- VS Code extension samples (webview-sample, webview-view-sample): https://github.com/microsoft/vscode-extension-samples -- verified patterns for WebviewPanel and WebviewViewProvider
- Claude Code API key docs: https://support.claude.com/en/articles/12304248 -- ANTHROPIC_API_KEY environment variable is the standard mechanism
- tmux manual: https://man7.org/linux/man-pages/man1/tmux.1.html -- set-environment -g for global env vars

### Tertiary (LOW confidence)
- vscode-elements / VSCode Community UI Toolkit as alternative to deprecated webview-ui-toolkit -- community projects, not verified for code-server compatibility
- Codicon font loading in webview -- needs hands-on validation in code-server environment

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- same libraries and patterns as Phase 1/2, all verified in codebase
- Architecture: HIGH -- supervisor API already exists, extension patterns well-established from claudeos-sessions
- Webview patterns: HIGH -- VS Code official docs are comprehensive and stable
- Public API pattern: HIGH -- standard VS Code extension mechanism, well-documented
- Environment injection (SEC-06): MEDIUM -- tmux set-environment approach is sound but not yet tested in this container
- Pitfalls: HIGH -- documented from official sources and common extension development issues

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable domain, VS Code extension API is mature)
