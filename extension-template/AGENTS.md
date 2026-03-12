# ClaudeOS Extension Development Guide

This document provides AI agent guidance for building ClaudeOS extensions. It covers the kernel principles that all extensions must follow, the supervisor API contract, recommended development patterns, the MCP server pattern for tool-exposing extensions, and CI/CD recommendations.

## Kernel Principles

These constraints are inherited from ClaudeOS core and are non-negotiable.

1. **Extensions run inside code-server.** The ClaudeOS container runs code-server as the primary UI. Extensions are standard VS Code extensions installed into code-server.

2. **Never modify Claude Code.** Claude Code runs stock in a tmux session managed by the supervisor. Extensions interact with Claude Code only through the supervisor API -- never by modifying Claude Code's source, config, or runtime.

3. **Never fork code-server.** All customization happens through extensions, product.json branding, and VS Code settings. Do not patch or fork code-server.

4. **All state persists on /data volume.** Extensions must store their data in `/data/extensions/{extension-name}/`. The /data volume survives container restarts and redeployments. Never write persistent state outside /data.

5. **Single-user system.** ClaudeOS is designed for one user per container. There are no multi-tenant concerns, no user IDs, and no access control between extensions.

## Supervisor API Contract

The supervisor runs on `http://localhost:3100` inside the container. All API endpoints are prefixed with `/api/v1`. No authentication is required for API calls (container-internal only).

### Base URL

```
http://localhost:3100/api/v1
```

### Health

| Method | Endpoint  | Description                          |
|--------|-----------|--------------------------------------|
| GET    | /health   | Returns `{ status, version, uptime }` |

The health endpoint is available immediately at boot. During extension installation, `status` is `"installing"`. When ready, `status` is `"ok"`.

### Sessions

| Method | Endpoint                  | Description                              | Body / Query                                  |
|--------|---------------------------|------------------------------------------|-----------------------------------------------|
| POST   | /sessions                 | Create a new Claude Code session         | `{ name?, workdir?, model?, flags? }`         |
| GET    | /sessions                 | List all sessions                        | --                                            |
| GET    | /sessions/:id             | Get a single session                     | --                                            |
| POST   | /sessions/:id/stop        | Stop a session gracefully                | --                                            |
| DELETE | /sessions/:id             | Kill a session (returns scrollback)      | --                                            |
| POST   | /sessions/:id/input       | Send input text to a session             | `{ text }`                                    |
| GET    | /sessions/:id/output      | Capture session output                   | `?scrollback=true` for full scrollback        |
| POST   | /sessions/:id/archive     | Archive a session (saves scrollback)     | --                                            |
| POST   | /sessions/:id/revive      | Revive an archived session               | --                                            |

**Session lifecycle:** Created -> Active -> Idle/Waiting -> Stopped -> Archived (or Killed).

**Archive behavior:** Saves scrollback text and metadata (session name, creation time, working directory, model, flags). Revive starts a new Claude Code session and feeds full scrollback as context.

### Secrets

| Method | Endpoint        | Description                       | Body                                    |
|--------|-----------------|-----------------------------------|-----------------------------------------|
| POST   | /secrets        | Create a secret                   | `{ name, value, category?, tags? }`     |
| GET    | /secrets        | List all secrets (no values)      | --                                      |
| GET    | /secrets/:name  | Get a secret's value              | --                                      |
| PUT    | /secrets/:name  | Update a secret                   | `{ value, category?, tags? }`           |
| DELETE | /secrets/:name  | Delete a secret                   | --                                      |

**Important:** Never store secrets directly in files or extension settings. Always use the secrets API. Secrets are encrypted at rest with AES-256-GCM.

### Extensions

| Method | Endpoint             | Description              | Body                                     |
|--------|----------------------|--------------------------|------------------------------------------|
| POST   | /extensions/install  | Install an extension     | `{ repo, tag } or { vsixPath }`          |
| GET    | /extensions          | List installed extensions | --                                       |

Extensions are pre-built as VSIX files in CI (GitHub Actions). The supervisor downloads the VSIX from GitHub release assets and installs it into code-server.

### Settings

| Method | Endpoint   | Description                | Body                       |
|--------|------------|----------------------------|----------------------------|
| GET    | /settings  | Get supervisor settings    | --                         |
| PUT    | /settings  | Update supervisor settings | `{ key: value, ... }`     |

### WebSocket

**URL:** `ws://localhost:3100/api/v1/ws`

The WebSocket endpoint provides real-time session events. No authentication required.

**Subscribe to a session:**
```json
{ "type": "subscribe", "sessionId": "session-id-here" }
```

**Status change events (broadcast to all subscribers):**
```json
{ "type": "status", "sessionId": "session-id", "status": "active" }
```

**Output events (sent to session subscribers only):**
```json
{ "type": "output", "sessionId": "session-id", "data": "..." }
```

## Extension Development Patterns

### API Communication

Use the built-in `fetch()` API for supervisor calls. It is available in code-server's Node.js runtime (Node 22+).

```typescript
const SUPERVISOR_API = 'http://localhost:3100/api/v1';

// List sessions
const sessions = await fetch(`${SUPERVISOR_API}/sessions`).then(r => r.json());

// Create a session
const session = await fetch(`${SUPERVISOR_API}/sessions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'my-session', workdir: '/data' }),
}).then(r => r.json());
```

### Real-Time Monitoring

Use WebSocket for live session status and output streaming.

```typescript
const ws = new WebSocket('ws://localhost:3100/api/v1/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'subscribe', sessionId: 'session-id' }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'status') {
    // Session status changed
  } else if (msg.type === 'output') {
    // New output from session
  }
};
```

### Data Storage

Store extension-specific data on the persistent volume:

```typescript
const DATA_DIR = `/data/extensions/${extensionName}`;
```

Create the directory on activation if it does not exist. Use JSON files for configuration, SQLite for structured data.

### Credentials

Always use the secrets API for credentials. Never store API keys, tokens, or passwords in extension settings or files.

```typescript
// Store a credential
await fetch(`${SUPERVISOR_API}/secrets`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'my-api-key',
    value: 'sk-...',
    category: 'api-keys',
    tags: ['external'],
  }),
});

// Retrieve a credential
const secret = await fetch(`${SUPERVISOR_API}/secrets/my-api-key`).then(r => r.json());
```

### Build Toolchain

- **Bundler:** esbuild (fast, zero-config for VS Code extensions)
- **Packager:** vsce (produces .vsix files)
- **Test runner:** Vitest
- **Type checker:** TypeScript with `tsc --noEmit`

Build with `npm run compile`, package with `npm run package`, test with `npm run test`.

## MCP Server Pattern

Extensions that expose tools to Claude Code use the Model Context Protocol (MCP). The MCP server runs as a separate process alongside the extension.

### Directory Structure

Place MCP server code in the `mcp-server/` directory:

```
extension-name/
  src/
    extension.ts       # VS Code extension entry point
  mcp-server/
    src/
      index.ts         # MCP server entry point
    package.json       # Separate package for MCP dependencies
```

### MCP Lifecycle

1. The supervisor starts the MCP server process when the extension is installed
2. Claude Code connects to the MCP server via stdio transport
3. The MCP server exposes tools that Claude Code can call
4. When the extension is uninstalled, the supervisor stops the MCP server

### Tool Definitions

Use `@modelcontextprotocol/sdk` for defining tools:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'extension-name', version: '0.1.0' });

server.tool('my-tool', { input: z.object({ query: z.string() }) }, async ({ input }) => {
  return { content: [{ type: 'text', text: `Result for: ${input.query}` }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

## GitHub Actions CI

Recommended CI pipeline for extension repos:

```yaml
name: Build and Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run compile
      - run: npm run package
      - name: Upload VSIX
        uses: softprops/action-gh-release@v2
        with:
          files: '*.vsix'
```

**Release convention:**
- Tag releases with semver: `v0.1.0`, `v0.2.0`, etc.
- VSIX asset name: `{extension-name}-{version}.vsix`
- The supervisor's extension install pipeline fetches the VSIX from the GitHub release

**default-extensions.json format** (used by the supervisor at boot):
```json
[
  { "repo": "aventre-labs/claudeos-sessions", "tag": "v0.1.0" },
  { "repo": "aventre-labs/claudeos-secrets", "tag": "v0.1.0" }
]
```
