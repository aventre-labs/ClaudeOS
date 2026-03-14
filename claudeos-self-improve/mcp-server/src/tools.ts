// ============================================================
// ClaudeOS Self-Improve MCP Server - Tool Handlers
// ============================================================
// Pure async functions for each MCP tool. Delegating all
// operations to the supervisor REST API at localhost:3100.
// Separated from index.ts for testability.
// ============================================================

export const SUPERVISOR_API = "http://localhost:3100/api/v1";
export const TEMPLATE_REPO = "https://github.com/aventre-labs/claudeos-extension-template";

/**
 * Install a ClaudeOS extension via the supervisor API.
 */
export async function handleInstall(args: {
  method: string;
  repo?: string;
  tag?: string;
  localPath?: string;
}): Promise<string> {
  const body: Record<string, unknown> = { method: args.method };
  if (args.repo) body.repo = args.repo;
  if (args.tag) body.tag = args.tag;
  if (args.localPath) body.localPath = args.localPath;

  const res = await fetch(`${SUPERVISOR_API}/extensions/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    return `Install failed: ${err}`;
  }

  const result = await res.json();
  return JSON.stringify(result, null, 2);
}

/**
 * Uninstall a ClaudeOS extension by its extension ID.
 */
export async function handleUninstall(args: { extensionId: string }): Promise<string> {
  const res = await fetch(
    `${SUPERVISOR_API}/extensions/${encodeURIComponent(args.extensionId)}`,
    { method: "DELETE" },
  );

  if (!res.ok) {
    const err = await res.text();
    return `Uninstall failed: ${err}`;
  }

  return `Extension ${args.extensionId} uninstalled.`;
}

/**
 * List all installed ClaudeOS extensions.
 */
export async function handleList(): Promise<string> {
  const res = await fetch(`${SUPERVISOR_API}/extensions`);
  const extensions = await res.json();
  return JSON.stringify(extensions, null, 2);
}

/**
 * Get the ClaudeOS extension template repository URL.
 */
export async function handleTemplate(): Promise<string> {
  return TEMPLATE_REPO;
}
