# ============================================================
# ClaudeOS - Multi-stage Docker Build
# ============================================================
# Builds the supervisor, wizard UI, and VS Code extensions,
# then assembles the runtime container with code-server, tmux,
# git, and all ClaudeOS components.
# ============================================================

# ---------- Stage 1: Build supervisor ----------
FROM node:22-bookworm-slim AS supervisor-builder

WORKDIR /build/supervisor
COPY supervisor/package.json supervisor/package-lock.json ./
RUN npm ci

COPY supervisor/src ./src
COPY supervisor/tsconfig.json ./
RUN npx esbuild src/index.ts \
      --bundle \
      --platform=node \
      --format=cjs \
      --outfile=dist/supervisor.cjs \
      --external:@fastify/websocket

# ---------- Stage 2: Build wizard UI ----------
FROM node:22-bookworm-slim AS wizard-builder

WORKDIR /build/wizard
COPY supervisor/wizard/package.json supervisor/wizard/package-lock.json ./
RUN npm ci

COPY supervisor/wizard/ ./
RUN npx vite build --outDir /build/wizard-dist

# ---------- Stage 3: Build extensions ----------
FROM node:22-bookworm-slim AS extension-builder

# Install vsce globally for VSIX packaging
RUN npm install -g @vscode/vsce

# Build claudeos-sessions
WORKDIR /build/claudeos-sessions
COPY claudeos-sessions/package.json claudeos-sessions/package-lock.json ./
RUN npm ci
COPY claudeos-sessions/ ./
RUN npx esbuild src/extension.ts \
      --bundle --platform=node --format=cjs \
      --outfile=out/extension.js \
      --external:vscode --external:bufferutil --external:utf-8-validate \
    && vsce package --no-dependencies -o /build/claudeos-sessions.vsix

# Build claudeos-secrets
WORKDIR /build/claudeos-secrets
COPY claudeos-secrets/package.json claudeos-secrets/package-lock.json ./
RUN npm ci
COPY claudeos-secrets/ ./
RUN npx esbuild src/extension.ts \
      --bundle --platform=node --format=cjs \
      --outfile=out/extension.js \
      --external:vscode --external:bufferutil --external:utf-8-validate \
    && vsce package --no-dependencies -o /build/claudeos-secrets.vsix

# Build claudeos-home
WORKDIR /build/claudeos-home
COPY claudeos-home/package.json claudeos-home/package-lock.json ./
RUN npm ci
COPY claudeos-home/ ./
RUN npx esbuild src/extension.ts \
      --bundle --platform=node --format=cjs \
      --outfile=out/extension.js \
      --external:vscode \
    && vsce package --no-dependencies -o /build/claudeos-home.vsix

# Build claudeos-self-improve
WORKDIR /build/claudeos-self-improve
COPY claudeos-self-improve/package.json claudeos-self-improve/package-lock.json ./
RUN npm ci
COPY claudeos-self-improve/ ./
RUN node esbuild.mjs \
    && vsce package --no-dependencies -o /build/claudeos-self-improve.vsix

# ---------- Stage 4: Build su-exec ----------
FROM node:22-bookworm-slim AS su-exec-builder

RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev curl ca-certificates \
    && curl -fsSL https://raw.githubusercontent.com/ncopa/su-exec/master/su-exec.c -o /tmp/su-exec.c \
    && gcc -Wall -O2 -o /tmp/su-exec /tmp/su-exec.c

# ---------- Stage 5: Runtime ----------
FROM node:22-bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
      tmux \
      git \
      curl \
      ca-certificates \
      procps \
      grep \
    && rm -rf /var/lib/apt/lists/*

# Copy su-exec from builder
COPY --from=su-exec-builder /tmp/su-exec /usr/local/bin/su-exec

# Install code-server
RUN curl -fsSL https://code-server.dev/install.sh | sh

# Create app user
RUN groupadd -g 1000 app \
    && useradd -u 1000 -g app -m -s /bin/bash app

# Create data directories
RUN mkdir -p /data/extensions /data/sessions /data/secrets /data/config \
    && chown -R app:app /data

# Create /app directory
RUN mkdir -p /app/config /app/extensions /app/wizard-dist

# Copy supervisor build output
COPY --from=supervisor-builder /build/supervisor/dist/supervisor.cjs /bin/supervisor.cjs
COPY --from=supervisor-builder /build/supervisor/node_modules/@fastify /usr/local/lib/node_modules/@fastify
COPY --from=supervisor-builder /build/supervisor/node_modules/ws /usr/local/lib/node_modules/ws

# Copy wizard build output
COPY --from=wizard-builder /build/wizard-dist /app/wizard-dist

# Copy extension VSIX files
COPY --from=extension-builder /build/claudeos-sessions.vsix /app/extensions/
COPY --from=extension-builder /build/claudeos-secrets.vsix /app/extensions/
COPY --from=extension-builder /build/claudeos-home.vsix /app/extensions/
COPY --from=extension-builder /build/claudeos-self-improve.vsix /app/extensions/

# Copy config files
COPY config/product.json /app/product.json
COPY config/settings.json /app/settings.json
COPY config/default-extensions.json /app/config/default-extensions.json
COPY first-boot/setup.html /app/setup.html

# Copy entrypoint
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Create tmp directory
RUN mkdir -p /tmp && chmod 1777 /tmp

# Environment
ENV NODE_ENV=production \
    CLAUDEOS_DATA_DIR=/data \
    TERM=xterm-256color \
    HOME=/home/app \
    PATH="/usr/local/bin:/usr/bin:/bin:/home/app/.claude/bin" \
    NODE_PATH=/usr/local/lib/node_modules \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

WORKDIR /app

EXPOSE 8080 3100

ENTRYPOINT ["/app/entrypoint.sh"]
