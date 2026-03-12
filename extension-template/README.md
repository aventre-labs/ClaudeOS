# ClaudeOS Extension Template

A scaffold for building ClaudeOS extensions. Clone this repo, replace the placeholder names, and start building.

## Quick Start

1. Clone this template:
   ```bash
   git clone https://github.com/aventre-labs/claudeos-extension-template.git claudeos-my-extension
   cd claudeos-my-extension
   ```

2. Replace placeholder names throughout the project:
   - `extension-name` -> your extension's kebab-case name (e.g., `session-manager`)
   - `Extension Name` -> your extension's display name (e.g., `Session Manager`)
   - Update `description` in package.json
   - Update the `repository.url` in package.json

3. Install dependencies and build:
   ```bash
   npm install
   npm run compile
   ```

4. Package as VSIX:
   ```bash
   npm run package
   ```

## Scripts

| Script          | Command                     | Description                          |
|-----------------|-----------------------------|--------------------------------------|
| `npm run compile` | esbuild bundle             | Bundle TypeScript to out/extension.js |
| `npm run watch`   | esbuild bundle --watch     | Rebuild on file changes              |
| `npm run package` | vsce package               | Create .vsix for distribution        |
| `npm run test`    | vitest run                 | Run tests with Vitest                |
| `npm run lint`    | tsc --noEmit               | Type-check without emitting          |

## Project Structure

```
extension-name/
  src/
    extension.ts          # Extension entry point (activate/deactivate)
  webview/                # Optional: webview UI assets
  mcp-server/             # Optional: MCP server for Claude Code tools
  out/                    # Compiled output (gitignored)
  package.json            # Extension manifest
  tsconfig.json           # TypeScript configuration
  .vscodeignore           # Files excluded from VSIX
```

## Development Guide

See [AGENTS.md](./AGENTS.md) for the full development guide, including:

- Kernel principles all extensions must follow
- Complete supervisor API reference (sessions, secrets, extensions, settings, WebSocket)
- Code patterns for API communication and real-time monitoring
- MCP server pattern for exposing tools to Claude Code
- GitHub Actions CI setup

## Local Testing

Build and install the extension into code-server:

```bash
npm run compile
npm run package
code-server --install-extension *.vsix
```

Reload code-server to activate the extension.

## Releasing

1. Update the version in `package.json`
2. Commit and tag: `git tag v0.1.0 && git push --tags`
3. GitHub Actions builds the VSIX and attaches it to the release
4. The ClaudeOS supervisor installs extensions from GitHub release assets

## License

See LICENSE file.
