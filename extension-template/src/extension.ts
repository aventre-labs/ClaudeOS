import * as vscode from 'vscode';

// ClaudeOS Supervisor API base URL (container-internal)
const SUPERVISOR_API = 'http://localhost:3100/api/v1';

export function activate(context: vscode.ExtensionContext) {
  // TODO: Replace "extension-name" with your extension's name
  console.log('ClaudeOS extension "extension-name" is now active');

  // Example: Register a command
  const disposable = vscode.commands.registerCommand('claudeos.extension-name.hello', () => {
    vscode.window.showInformationMessage('Hello from ClaudeOS extension-name!');
  });
  context.subscriptions.push(disposable);

  // Example: Fetch from supervisor API
  // const health = await fetch(`${SUPERVISOR_API}/health`);
}

export function deactivate() {
  // Cleanup resources here
}
