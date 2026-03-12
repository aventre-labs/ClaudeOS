# Technology Stack

**Project:** ClaudeOS
**Researched:** 2026-03-11
**Overall Confidence:** HIGH

---

## Recommended Stack

### Runtime & Language

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js | 22.x LTS (Jod) | Runtime for supervisor, extensions, build tooling | Active LTS with support through 2027-04-30. Node 20 enters maintenance April 2026, so start on 22. Node 24 LTS exists but is too new for ecosystem compatibility. | HIGH |
| TypeScript | ~5.8.x or ~5.9.x | All source code | 5.9 is latest stable. TS 6.0 is imminent (Q1 2026) but is the last pre-Go release. Pin to 5.8 or 5.9 for stability -- TS 7.0 (Go-based compiler) targets mid-2026 and will have breaking changes. Avoid being an early adopter of 6.0/7.0 during kernel development. | HIGH |

### Core Infrastructure

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| code-server | 4.109.x | VS Code in the browser | Latest stable. Bundles VS Code 1.109.x. Actively maintained by Coder (releases every few days). Provides full extension API compatibility, product.json branding, and password auth. Uses Open-VSX gallery by default. Extension gallery is configurable via `$EXTENSIONS_GALLERY` env var. | HIGH |
| tmux | 3.4+ (system) | Session multiplexing for Claude Code | Claude Code has native tmux support. Sessions are isolated tmux windows. No Node.js wrapper library needed -- use `child_process.execFile` directly with tmux CLI commands (`tmux new-session`, `tmux send-keys`, `tmux capture-pane`, etc.). The `node-tmux` npm package is unmaintained; raw CLI calls are more reliable and transparent. | HIGH |
| Claude Code | latest (CLI) | AI agent engine | Install via `curl` or Homebrew (npm install is deprecated per Anthropic). The npm package `@anthropic-ai/claude-code` exists but Anthropic recommends native installers. In Docker, use the curl installer in the build step. Never pin a version -- Claude Code updates should not break ClaudeOS because we only interact via tmux and CLI. | HIGH |
| Docker | Multi-stage | Container packaging | Use multi-stage build: build stage compiles supervisor TypeScript, runtime stage is `node:22-bookworm-slim` (NOT alpine -- tmux, git, and Claude Code's dependencies work better with glibc than musl). Final image ~200-300MB. | HIGH |

### Supervisor HTTP Server

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Fastify | 5.8.x | HTTP API framework for supervisor (:3100) | The supervisor API is a small internal HTTP server (~10 endpoints). Fastify is the right choice over Express (2-3x faster, first-class TypeScript, built-in JSON schema validation via Ajv, structured logging via Pino). It is NOT overkill -- Fastify's schema validation replaces the need for a separate validation library for request/response typing. Hono was considered but its strength is multi-runtime portability (edge, Deno, Bun) which is irrelevant here -- we only run on Node.js in Docker. Fastify's Node.js-specific optimizations win. | HIGH |
| Pino | 10.x (via Fastify) | Structured JSON logging | Fastify bundles Pino by default. 5x faster than Winston, produces structured JSON logs ideal for Railway's log viewer. No additional install needed -- Fastify exposes `fastify.log`. Add `pino-pretty` as a dev dependency for human-readable dev output. | HIGH |

### Validation & Type Safety

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Zod | 4.x | Runtime validation for supervisor API, extension configs | Zod 4 is stable with 6.5x faster object validation vs Zod 3. Use for validating API request bodies, extension manifest fields, and configuration. Fastify can use Zod schemas via `fastify-type-provider-zod` for integrated request/response validation with automatic OpenAPI schema generation. | HIGH |
| @sinclair/typebox | (alternative) | N/A | Do NOT use. While Typebox is Fastify's native schema library, Zod has better ecosystem adoption, the MCP SDK uses Zod, and extensions will also use Zod for their own validation. One validation library across the entire project. | HIGH |

### VS Code Extension Tooling

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @types/vscode | ^1.85.0 | VS Code extension API types | Pin to `^1.85.0` as the minimum engine version in extension manifests. This ensures broad compatibility with code-server versions. The types package version matches VS Code versions -- 1.85 gives access to all needed APIs (webviews, tree views, terminal profiles, commands, etc.) while not requiring bleeding-edge code-server. | HIGH |
| @vscode/vsce | ^3.7.x | VSIX packaging tool | Official Microsoft tool for building `.vsix` packages. Use `vsce package --no-dependencies` to build extensions without requiring a publisher account. This is the standard, no alternatives needed. | HIGH |
| esbuild | ^0.27.x | Extension bundling | VS Code officially recommends esbuild for extension bundling. 10-100x faster than webpack. Produces single-file bundles that load faster in code-server. Use `--bundle --platform=node --format=cjs --external:vscode` for extension host code. For webview React apps, use `--bundle --platform=browser --format=esm`. | HIGH |

### Extension Webview UI

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| React | 19.x | Webview panel UI (home tab, extension manager, secrets UI) | React is the standard for VS Code extension webviews. GitHub Next maintains a React Webview UI Toolkit specifically for VS Code extensions. Use React for any extension that needs a rich panel UI (home, extension manager, secrets form). Extensions that only need tree views or status bars do NOT need React -- use VS Code's native APIs. | MEDIUM |
| @vscode/webview-ui-toolkit | latest | VS Code-native UI components | Provides React components that match VS Code's design language (buttons, text fields, dropdowns, data grids). Ensures extensions look native in code-server. Note: this toolkit's maintenance has slowed -- if it becomes abandoned, fall back to plain CSS matching VS Code's variables (`--vscode-button-background`, etc.). | MEDIUM |

### MCP (Model Context Protocol)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @modelcontextprotocol/sdk | ^1.27.x | MCP server implementation in extensions | The official TypeScript SDK for building MCP servers. Used by extensions that expose tools to Claude Code (e.g., `claudeos-self-improve` exposes `install_extension`, `get_extension_template`). v2 is anticipated Q1 2026 but v1.x is the production recommendation. Pin to `^1.27` and upgrade to v2 when it stabilizes. 32K+ dependents -- this is the standard. | HIGH |

### Testing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Vitest | ^4.0.x | Unit and integration testing | Vitest 4.0 is the current major release. Fast, TypeScript-native, compatible with Jest APIs for familiarity. Use for supervisor unit tests, extension logic tests, and integration tests that spawn real tmux sessions. The SPEC already specifies Vitest -- this confirms it is the right choice. | HIGH |
| @vscode/test-electron | latest | VS Code extension integration tests | Official test runner for extensions that need access to the VS Code API in tests. Use sparingly -- most extension logic should be testable with Vitest alone by separating business logic from VS Code API calls. | MEDIUM |

### Security

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js `crypto` (built-in) | N/A | AES-256-GCM encryption for secrets | No external crypto library needed. Node's built-in `crypto` module supports AES-256-GCM natively. Derive the encryption key from `CLAUDEOS_AUTH_TOKEN` using `crypto.scryptSync()` with a random salt. Store salt alongside encrypted data. This is the approach specified in the SPEC. | HIGH |

### Build & Dev Tooling

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| esbuild | ^0.27.x | TypeScript compilation and bundling | Used for both supervisor build (fast tsc replacement) and extension bundling. Single tool for all compilation needs. | HIGH |
| tsx | latest | TypeScript execution in dev mode | Run supervisor directly with `tsx watch src/index.ts` during development. No compile step needed. tsx handles ESM/CJS interop transparently. | HIGH |
| npm | (bundled with Node) | Package management | npm 10.x ships with Node 22. No need for pnpm or yarn for the kernel -- it is a single-package repo. Extensions are also single-package repos. If a monorepo structure emerges later, reconsider with npm workspaces. | HIGH |

### Container & Deployment

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Docker | Multi-stage Dockerfile | Production container | Base image: `node:22-bookworm-slim`. Install tmux, git, curl in the runtime stage. Install Claude Code via curl. Copy compiled supervisor. NOT alpine -- Claude Code and tmux have glibc dependencies that cause issues with musl. Use a non-root user for the runtime stage. | HIGH |
| Nix flake | (optional, parallel) | Reproducible dev environment | The SPEC mentions `flake.nix` as an alternative build path. Use Nix for local development (`nix develop` gives you Node, tmux, git in a reproducible shell). Do NOT make Nix required -- Docker is the primary build/deploy path. Nix is a convenience for contributors who use NixOS/nix-darwin. | MEDIUM |
| Railway | (deployment target) | Cloud hosting | Railway supports Dockerfile builds natively. Use `railway.toml` for healthcheck config. Mount a persistent volume at `/data` for extensions, sessions, secrets. Set `RAILWAY_RUN_UID=0` if using non-root user in Dockerfile to avoid volume permission issues. | HIGH |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| HTTP Framework | Fastify 5 | Express 4/5 | Express is 2-3x slower, no built-in schema validation, middleware-based architecture is more complex for a small API. Express 5 has been in beta for years. |
| HTTP Framework | Fastify 5 | Hono | Hono excels at multi-runtime (edge, Deno) which is irrelevant here. Fastify has better Node.js-specific performance, richer plugin ecosystem for server-side concerns (auth, rate limiting, CORS). |
| HTTP Framework | Fastify 5 | Raw `http.createServer` | Tempting for a ~10 endpoint API, but Fastify adds routing, validation, serialization, and logging with negligible overhead. The supervisor will grow over time. |
| Bundler | esbuild | webpack | 10-100x slower. VS Code used to recommend webpack but now recommends esbuild. No reason to use webpack for new extensions in 2026. |
| Bundler | esbuild | tsup | tsup wraps esbuild but is no longer actively maintained. Use esbuild directly -- the config is simple enough. |
| Bundler | esbuild | Rolldown/Vite | Rolldown is promising but still beta. Vite 8 (with Rolldown) targets 2026 release. Too early for production use in this project. |
| Testing | Vitest | Jest | Vitest is faster, TypeScript-native, and actively maintained. Jest 30 is catching up but Vitest has won the ecosystem mindshare for new TS projects. |
| Validation | Zod 4 | Typebox | Typebox is Fastify-native but Zod has broader ecosystem adoption, is used by the MCP SDK, and is more ergonomic for TypeScript developers. One library across all components. |
| Logger | Pino (via Fastify) | Winston | Pino is 5x faster and produces structured JSON. Winston's transport system is overkill for container logging (stdout to Railway's log aggregator). |
| Package Manager | npm | pnpm/yarn | Single-package repos don't benefit from pnpm's disk savings or yarn's workspaces. npm ships with Node and requires zero setup. |
| Base Image | node:22-bookworm-slim | node:22-alpine | Alpine uses musl libc which causes issues with native modules (node-pty, some Claude Code dependencies). bookworm-slim is ~50MB larger but avoids compatibility headaches. |
| tmux Control | child_process.execFile | node-tmux npm package | The `node-tmux` package is small, unmaintained, and adds unnecessary abstraction. tmux CLI is stable and well-documented. Direct `execFile('tmux', [...args])` calls are more transparent and debuggable. |
| VS Code in Browser | code-server | OpenVSCode Server (Gitpod) | code-server has more customization points (product.json branding, extension gallery override), wider deployment documentation, and better community support. OpenVSCode Server is more bare-bones. |
| VS Code in Browser | code-server | Eclipse Theia | Theia has its own extension API that is not 100% VS Code compatible. We need full VS Code extension API compatibility for the extension system to work. |

---

## Version Pinning Strategy

```jsonc
// Supervisor package.json - key dependencies
{
  "dependencies": {
    "fastify": "^5.8.0",
    "zod": "^4.3.0",
    "@modelcontextprotocol/sdk": "^1.27.0"
  },
  "devDependencies": {
    "typescript": "~5.8.0",
    "esbuild": "^0.27.0",
    "tsx": "^4.0.0",
    "vitest": "^4.0.0",
    "pino-pretty": "^13.0.0",
    "@types/node": "^22.0.0"
  }
}

// Extension template package.json - key dependencies
{
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "typescript": "~5.8.0",
    "esbuild": "^0.27.0",
    "@vscode/vsce": "^3.7.0",
    "vitest": "^4.0.0"
  }
}

// Extension with MCP server - additional dependency
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.27.0",
    "zod": "^4.3.0"
  }
}

// Extension with webview - additional dependencies
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

**Pinning philosophy:**
- Use `~` (patch-only) for TypeScript to avoid surprise minor version breaks during TS 5->6->7 transition.
- Use `^` (minor+patch) for everything else -- Fastify, Vitest, esbuild, Zod all follow semver reliably.
- Pin `@types/vscode` to `^1.85.0` to match the `engines.vscode` field in extension manifests.

---

## Installation

### Supervisor

```bash
# In supervisor/ directory
npm install fastify zod @modelcontextprotocol/sdk

# Dev dependencies
npm install -D typescript@~5.8 esbuild @types/node@22 tsx vitest pino-pretty
```

### Extension (from template)

```bash
# In extension directory
npm install -D @types/vscode@^1.85.0 typescript@~5.8 esbuild @vscode/vsce vitest
```

### Extension with MCP server

```bash
# Additional dependencies for MCP-enabled extensions
npm install @modelcontextprotocol/sdk zod
```

### Extension with React webview

```bash
# Additional dependencies for webview extensions
npm install react react-dom
npm install -D @types/react @types/react-dom
```

---

## Dockerfile Skeleton

```dockerfile
# Build stage
FROM node:22-bookworm-slim AS builder
WORKDIR /build
COPY supervisor/package*.json ./
RUN npm ci
COPY supervisor/ .
RUN npx esbuild src/index.ts --bundle --platform=node --format=cjs --outfile=dist/supervisor.cjs

# Runtime stage
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    tmux git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install code-server
RUN curl -fsSL https://code-server.dev/install.sh | sh

# Install Claude Code (curl method, not npm)
RUN curl -fsSL https://claude.ai/install.sh | sh
# Note: Exact install URL may differ -- verify at https://code.claude.com/docs/en/setup

# Copy supervisor
WORKDIR /app
COPY --from=builder /build/dist/supervisor.cjs ./supervisor.cjs
COPY product.json settings.json default-extensions.json ./
COPY extension-template/ ./extension-template/

# Create data directory
RUN mkdir -p /data/extensions /data/sessions /data/secrets /data/config

# Non-root user (optional, see Railway note about RAILWAY_RUN_UID=0)
RUN useradd -m claudeos
USER claudeos

EXPOSE 8080
CMD ["node", "supervisor.cjs"]
```

---

## Key Technical Decisions Explained

### Why Fastify over raw HTTP for a ~300 line supervisor

The supervisor starts at ~300 lines but will grow. It needs:
- Routing (10+ endpoints with path params like `/api/sessions/:id/send`)
- Request body parsing and validation
- JSON serialization
- Structured logging
- Error handling with proper HTTP status codes
- Potential CORS for local dev

Fastify provides all of these with ~zero overhead. A raw `http.createServer` would require manually implementing each of these, and the code would be longer, buggier, and harder to maintain than using Fastify.

### Why NOT alpine for the Docker base image

Alpine Linux uses musl libc instead of glibc. Three problems for ClaudeOS:
1. Claude Code may have native dependencies that expect glibc.
2. tmux on Alpine requires additional musl-compat packages.
3. Any extension that uses native Node modules (e.g., node-pty for terminal integration) will need to be recompiled against musl.

`node:22-bookworm-slim` is ~50MB larger than alpine but eliminates an entire class of "works locally, breaks in container" bugs.

### Why direct tmux CLI calls over a wrapper library

The tmux CLI is stable, well-documented, and has not changed its core commands in years. The Node.js tmux wrapper libraries on npm (`node-tmux`, `tmuxn`) are small, unmaintained hobby projects. Wrapping `child_process.execFile('tmux', ['new-session', '-d', '-s', sessionName])` is straightforward and gives full control. Build a thin internal abstraction (a `TmuxManager` class) rather than depending on an external package.

### Why Zod in the supervisor when Fastify has Typebox

The MCP SDK (`@modelcontextprotocol/sdk`) uses Zod for tool parameter schemas. Extensions that build MCP servers will already depend on Zod. Using Zod in the supervisor too means one validation library across the entire ClaudeOS ecosystem -- supervisor, extensions, and MCP servers. The `fastify-type-provider-zod` plugin bridges Fastify's schema system with Zod seamlessly.

---

## Sources

- [code-server releases](https://github.com/coder/code-server/releases) - v4.109.x, actively maintained
- [code-server npm](https://www.npmjs.com/package/code-server) - v4.109.5 published 6 days ago
- [Node.js releases](https://nodejs.org/en/about/previous-releases) - Node 22 LTS active through 2027
- [Node.js endoflife.date](https://endoflife.date/nodejs) - Release schedule and EOL dates
- [TypeScript 5.9 docs](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html) - Latest stable
- [TypeScript 7 progress](https://devblogs.microsoft.com/typescript/progress-on-typescript-7-december-2025/) - Go-based compiler mid-2026
- [Fastify npm](https://www.npmjs.com/package/fastify) - v5.8.2, actively maintained
- [Fastify vs Express](https://betterstack.com/community/guides/scaling-nodejs/fastify-express/) - Performance benchmarks
- [Hono vs Fastify](https://betterstack.com/community/guides/scaling-nodejs/hono-vs-fastify/) - Framework comparison
- [Vitest 4.0 announcement](https://vitest.dev/blog/vitest-4) - Current major version
- [Zod v4 release notes](https://zod.dev/v4) - 6.5x faster, stable
- [esbuild](https://esbuild.github.io/) - v0.27.x, Go-based bundler
- [VS Code extension bundling docs](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) - Official esbuild recommendation
- [@vscode/vsce npm](https://www.npmjs.com/package/@vscode/vsce) - v3.7.1, official packaging tool
- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - v1.27.1, 32K dependents
- [@anthropic-ai/claude-code npm](https://www.npmjs.com/package/@anthropic-ai/claude-code) - npm install deprecated, use curl
- [Pino npm](https://www.npmjs.com/package/pino) - v10.3.1, structured JSON logger
- [Railway volumes docs](https://docs.railway.com/volumes/reference) - Persistent storage configuration
- [Railway Dockerfiles docs](https://docs.railway.com/builds/dockerfiles) - Docker build support
- [code-server FAQ](https://coder.com/docs/code-server/FAQ) - Extension gallery configuration
- [Docker Node.js best practices](https://snyk.io/blog/choosing-the-best-node-js-docker-image/) - Image selection guidance
- [node-tmux npm](https://www.npmjs.com/package/node-tmux) - Unmaintained, not recommended
