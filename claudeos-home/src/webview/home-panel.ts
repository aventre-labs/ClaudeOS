// ============================================================
// ClaudeOS Home Extension - Home Panel (WebviewPanel manager)
// ============================================================
// Manages the branded ClaudeOS Home webview panel. Singleton
// pattern: createOrShow reveals existing panel or creates new.
// All HTML/CSS/JS embedded as template literals (no separate files).
// ============================================================

import * as vscode from "vscode";
import type { SupervisorClient } from "../supervisor/client.js";
import type { ShortcutStore } from "../shortcuts/shortcut-store.js";
import type { Session } from "../types.js";

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export class HomePanel {
  static currentPanel: HomePanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly client: SupervisorClient;
  private readonly shortcutStore: ShortcutStore;
  private disposables: vscode.Disposable[] = [];

  /**
   * Create or reveal the home panel. Singleton -- only one panel at a time.
   */
  static createOrShow(
    context: vscode.ExtensionContext,
    client: SupervisorClient,
    shortcutStore: ShortcutStore,
  ): void {
    if (HomePanel.currentPanel) {
      HomePanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "claudeos.home",
      "ClaudeOS Home",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "webview"),
        ],
      },
    );

    HomePanel.currentPanel = new HomePanel(panel, client, shortcutStore);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    client: SupervisorClient,
    shortcutStore: ShortcutStore,
  ) {
    this.panel = panel;
    this.client = client;
    this.shortcutStore = shortcutStore;

    // Set webview HTML content
    this.panel.webview.html = this._getHtmlForWebview(this.panel.webview);

    // Handle messages from the webview
    this.disposables.push(
      this.panel.webview.onDidReceiveMessage(
        async (message: {
          command: string;
          sessionId?: string;
          commandId?: string;
          args?: unknown[];
          shortcut?: unknown;
          id?: string;
          ids?: string[];
        }) => {
          await this._handleMessage(message);
        },
      ),
    );

    // Clean up on dispose
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private async _handleMessage(message: {
    command: string;
    sessionId?: string;
    commandId?: string;
    args?: unknown[];
    shortcut?: unknown;
    id?: string;
    ids?: string[];
  }): Promise<void> {
    switch (message.command) {
      case "createSession":
        await vscode.commands.executeCommand("claudeos.sessions.create");
        break;

      case "openSession":
        if (message.sessionId) {
          await vscode.commands.executeCommand(
            "claudeos.sessions.openTerminal",
            { id: message.sessionId },
          );
        }
        break;

      case "getRecentSessions":
        try {
          const sessions = await this.client.listSessions();
          const recent = sessions
            .filter((s: Session) => s.status !== "archived")
            .sort(
              (a: Session, b: Session) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            )
            .slice(0, 8);
          await this.panel.webview.postMessage({
            command: "recentSessions",
            data: recent,
          });
        } catch {
          await this.panel.webview.postMessage({
            command: "recentSessions",
            data: [],
          });
        }
        break;

      case "getShortcuts":
        await this.panel.webview.postMessage({
          command: "shortcuts",
          data: this.shortcutStore.getShortcuts(),
        });
        break;

      case "addShortcut":
        if (message.shortcut) {
          this.shortcutStore.addShortcut(message.shortcut as any);
          await this.panel.webview.postMessage({
            command: "shortcuts",
            data: this.shortcutStore.getShortcuts(),
          });
        }
        break;

      case "removeShortcut":
        if (message.id) {
          this.shortcutStore.removeShortcut(message.id);
          await this.panel.webview.postMessage({
            command: "shortcuts",
            data: this.shortcutStore.getShortcuts(),
          });
        }
        break;

      case "reorderShortcuts":
        if (message.ids) {
          this.shortcutStore.reorderShortcuts(message.ids);
          await this.panel.webview.postMessage({
            command: "shortcuts",
            data: this.shortcutStore.getShortcuts(),
          });
        }
        break;

      case "executeShortcut":
        if (message.commandId) {
          await vscode.commands.executeCommand(
            message.commandId,
            ...(message.args ?? []),
          );
        }
        break;

      case "openSecrets":
        await vscode.commands.executeCommand(
          "claudeos.secrets.openEditor",
          "ANTHROPIC_API_KEY",
        );
        break;
    }
  }

  /**
   * Generate the full HTML for the home webview with CSP nonce.
   * All HTML, CSS, and JS are embedded as template literals.
   */
  _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();
    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    :root {
      --claudeos-accent: #c084fc;
      --claudeos-accent-hover: #a855f7;
      --claudeos-gradient-start: #7c3aed;
      --claudeos-gradient-end: #c084fc;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 0;
      overflow-y: auto;
    }

    .hero {
      background: linear-gradient(135deg, var(--claudeos-gradient-start), var(--claudeos-gradient-end));
      padding: 48px 32px;
      text-align: center;
      border-radius: 0 0 16px 16px;
    }

    .hero-wordmark {
      font-size: 36px;
      font-weight: 700;
      color: #fff;
      letter-spacing: 2px;
      margin-bottom: 8px;
    }

    .hero-tagline {
      color: rgba(255,255,255,0.85);
      font-size: 14px;
      margin-bottom: 24px;
    }

    .btn-primary {
      background: rgba(255,255,255,0.2);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.4);
      padding: 10px 24px;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-primary:hover {
      background: rgba(255,255,255,0.35);
    }

    .banner {
      display: none;
      margin: 16px 32px 0;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 13px;
    }

    .banner.warning {
      background: var(--vscode-inputValidation-warningBackground, #5a4000);
      border: 1px solid var(--vscode-inputValidation-warningBorder, #997a00);
      color: var(--vscode-foreground);
    }

    .banner.warning a {
      color: var(--claudeos-accent);
      cursor: pointer;
      text-decoration: underline;
    }

    .section {
      padding: 24px 32px;
    }

    .section h2 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
      color: var(--vscode-foreground);
    }

    .sessions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
    }

    .session-card {
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-panel-border, #333);
      border-radius: 8px;
      padding: 16px;
      cursor: pointer;
      transition: border-color 0.2s;
    }

    .session-card:hover {
      border-color: var(--claudeos-accent);
    }

    .session-card .name {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 6px;
    }

    .session-card .meta {
      font-size: 12px;
      color: var(--vscode-descriptionForeground, #888);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-badge {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .status-active { background: #22c55e; }
    .status-idle { background: #facc15; }
    .status-waiting { background: #3b82f6; }
    .status-stopped { background: #6b7280; }
    .status-zombie { background: #ef4444; }

    .session-card .workdir {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #666);
      margin-top: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .shortcuts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 10px;
    }

    .shortcut-card {
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-panel-border, #333);
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s;
    }

    .shortcut-card:hover {
      border-color: var(--claudeos-accent);
    }

    .shortcut-card .icon {
      font-size: 24px;
      margin-bottom: 8px;
      color: var(--claudeos-accent);
    }

    .shortcut-card .label {
      font-size: 12px;
      font-weight: 500;
    }

    .empty-state {
      color: var(--vscode-descriptionForeground, #888);
      font-style: italic;
      padding: 16px 0;
    }
  </style>
</head>
<body>
  <div class="hero">
    <div class="hero-wordmark">
      <svg width="200" height="40" viewBox="0 0 200 40" xmlns="http://www.w3.org/2000/svg">
        <text x="0" y="32" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="700" fill="white" letter-spacing="3">ClaudeOS</text>
      </svg>
    </div>
    <p class="hero-tagline">Your AI-Powered Development Environment</p>
    <button class="btn-primary" id="btn-new-session">+ New Session</button>
  </div>

  <div class="banner warning" id="api-key-banner">
    Set up your <a id="setup-api-key">Anthropic API key</a> to enable Claude Code sessions.
  </div>

  <div class="section">
    <h2>Recent Sessions</h2>
    <div class="sessions-grid" id="sessions-grid">
      <p class="empty-state">Loading sessions...</p>
    </div>
  </div>

  <div class="section">
    <h2>Shortcuts</h2>
    <div class="shortcuts-grid" id="shortcuts-grid">
      <p class="empty-state">Loading shortcuts...</p>
    </div>
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();

      // Restore scroll position
      const prevState = vscode.getState();
      if (prevState && prevState.scrollTop) {
        window.scrollTo(0, prevState.scrollTop);
      }

      // Save scroll position on scroll
      window.addEventListener('scroll', () => {
        vscode.setState({ scrollTop: window.scrollY });
      });

      // Request initial data
      document.addEventListener('DOMContentLoaded', () => {
        vscode.postMessage({ command: 'getRecentSessions' });
        vscode.postMessage({ command: 'getShortcuts' });
      });

      // Also fire immediately (DOMContentLoaded may have already fired)
      vscode.postMessage({ command: 'getRecentSessions' });
      vscode.postMessage({ command: 'getShortcuts' });

      // New session button
      document.getElementById('btn-new-session').addEventListener('click', () => {
        vscode.postMessage({ command: 'createSession' });
      });

      // API key banner link
      document.getElementById('setup-api-key').addEventListener('click', () => {
        vscode.postMessage({ command: 'openSecrets' });
      });

      // Handle messages from extension
      window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
          case 'recentSessions':
            renderSessions(message.data);
            break;
          case 'shortcuts':
            renderShortcuts(message.data);
            break;
          case 'anthropicKeyStatus':
            const banner = document.getElementById('api-key-banner');
            banner.style.display = message.data ? 'none' : 'block';
            break;
        }
      });

      function renderSessions(sessions) {
        const grid = document.getElementById('sessions-grid');
        if (!sessions || sessions.length === 0) {
          grid.innerHTML = '<p class="empty-state">No recent sessions. Click + New Session to get started.</p>';
          return;
        }
        grid.innerHTML = sessions.map(s => {
          const time = timeAgo(s.createdAt);
          const workdirSnippet = s.workdir ? s.workdir.split('/').slice(-2).join('/') : '';
          return '<div class="session-card" data-id="' + s.id + '">'
            + '<div class="name">' + escapeHtml(s.name) + '</div>'
            + '<div class="meta">'
            + '<span class="status-badge status-' + s.status + '"></span>'
            + '<span>' + s.status + '</span>'
            + '<span>' + time + '</span>'
            + '</div>'
            + (workdirSnippet ? '<div class="workdir">' + escapeHtml(workdirSnippet) + '</div>' : '')
            + '</div>';
        }).join('');

        grid.querySelectorAll('.session-card').forEach(card => {
          card.addEventListener('click', () => {
            vscode.postMessage({ command: 'openSession', sessionId: card.dataset.id });
          });
        });
      }

      function renderShortcuts(shortcuts) {
        const grid = document.getElementById('shortcuts-grid');
        if (!shortcuts || shortcuts.length === 0) {
          grid.innerHTML = '<p class="empty-state">No shortcuts configured.</p>';
          return;
        }
        grid.innerHTML = shortcuts.map(s => {
          return '<div class="shortcut-card" data-command="' + s.command + '">'
            + '<div class="icon">$(' + s.icon + ')</div>'
            + '<div class="label">' + escapeHtml(s.label) + '</div>'
            + '</div>';
        }).join('');

        grid.querySelectorAll('.shortcut-card').forEach(card => {
          card.addEventListener('click', () => {
            vscode.postMessage({
              command: 'executeShortcut',
              commandId: card.dataset.command,
            });
          });
        });
      }

      function timeAgo(dateStr) {
        const now = Date.now();
        const then = new Date(dateStr).getTime();
        const diff = Math.floor((now - then) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return Math.floor(diff / 86400) + 'd ago';
      }

      function statusColor(status) {
        const colors = {
          active: '#22c55e',
          idle: '#facc15',
          waiting: '#3b82f6',
          stopped: '#6b7280',
          zombie: '#ef4444'
        };
        return colors[status] || '#6b7280';
      }

      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }
    })();
  </script>
</body>
</html>`;
  }

  /**
   * Dispose the panel and clear the singleton reference.
   */
  dispose(): void {
    HomePanel.currentPanel = undefined;
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
