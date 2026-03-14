// ============================================================
// ClaudeOS Self-Improve Extension - Skill File Content
// ============================================================
// Provides Claude Code sessions with context about ClaudeOS
// and available MCP tools for self-improvement.
// Written to /data/config/claudeos-skill.md on activation.
// ============================================================

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SKILL_PATH = "/data/config/claudeos-skill.md";

export const SKILL_CONTENT = `# ClaudeOS Self-Improvement Skill

You are running inside ClaudeOS, a VS Code-based operating environment for Claude Code.

## What You Can Do

You have access to MCP tools for managing ClaudeOS extensions:

- **install_extension**: Install an extension from GitHub release, local source, or VSIX file
- **uninstall_extension**: Uninstall an extension by its VS Code extension ID
- **list_extensions**: List all installed extensions and their status
- **get_extension_template**: Get the template repo URL for scaffolding new extensions

## Building New Extensions

When asked to build a new feature for ClaudeOS:

1. Call get_extension_template to get the template repo URL
2. Clone/fork the template into the current working directory
3. Implement the extension (TypeScript, esbuild, VS Code API)
4. Build: npm run compile && npm run package
5. Install: call install_extension with method "build-from-source" and localPath pointing to the extension directory

Extensions are standard VS Code extensions. They communicate with the supervisor at http://localhost:3100/api/v1.

## Key Constraints

- Never modify Claude Code itself -- it runs stock in tmux
- Never fork code-server -- extend via VS Code extensions only
- Store persistent data in /data/extensions/{extension-name}/
- Use the claudeos-secrets API for any credentials
`;

/**
 * Return the path where the skill file is written.
 */
export function getSkillPath(): string {
  return SKILL_PATH;
}

/**
 * Write the skill file to /data/config/claudeos-skill.md.
 * Non-fatal if /data is not mounted (e.g., development environment).
 */
export async function writeSkillFile(): Promise<void> {
  await mkdir(dirname(SKILL_PATH), { recursive: true });
  await writeFile(SKILL_PATH, SKILL_CONTENT, "utf-8");
}
