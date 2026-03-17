#!/bin/bash
# ClaudeOS Container Entrypoint
#
# This script runs as root (PID 1) to:
# 1. Ensure /data directory structure exists and is owned by the app user
# 2. Auto-generate CLAUDEOS_AUTH_TOKEN if not set (persisted to /data)
# 3. Install Railway CLI if not already present
# 4. Install Claude Code if not already present on the persistent volume
# 5. Drop privileges and exec the supervisor process as the app user
#
# The supervisor (Fastify on :3100) then handles the full boot sequence:
# first-boot setup, extension installation, and code-server launch.

set -euo pipefail

APP_USER="app"
APP_UID=1000
APP_GID=1000
DATA_DIR="${CLAUDEOS_DATA_DIR:-/data}"
SUPERVISOR_BIN="/bin/supervisor.cjs"

echo "[ClaudeOS] Starting container entrypoint..."

# ---- Step 1: Ensure data directories exist ----
echo "[ClaudeOS] Ensuring data directories..."
mkdir -p \
  "${DATA_DIR}/extensions" \
  "${DATA_DIR}/sessions" \
  "${DATA_DIR}/secrets" \
  "${DATA_DIR}/config"

# Recursively chown /data to the app user.
# This handles both fresh volumes and pre-existing data.
chown -R "${APP_UID}:${APP_GID}" "${DATA_DIR}"

# ---- Step 2: Auto-generate auth token if not set ----
# If CLAUDEOS_AUTH_TOKEN is not provided via env, generate one and persist
# it to the data volume so it survives restarts.
AUTH_TOKEN_FILE="${DATA_DIR}/config/auth-token"
if [ -z "${CLAUDEOS_AUTH_TOKEN:-}" ]; then
  if [ -f "${AUTH_TOKEN_FILE}" ]; then
    export CLAUDEOS_AUTH_TOKEN
    CLAUDEOS_AUTH_TOKEN="$(cat "${AUTH_TOKEN_FILE}")"
    echo "[ClaudeOS] Loaded auth token from persistent storage"
  else
    export CLAUDEOS_AUTH_TOKEN
    CLAUDEOS_AUTH_TOKEN="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
    echo "${CLAUDEOS_AUTH_TOKEN}" > "${AUTH_TOKEN_FILE}"
    chown "${APP_UID}:${APP_GID}" "${AUTH_TOKEN_FILE}"
    chmod 600 "${AUTH_TOKEN_FILE}"
    echo "[ClaudeOS] Generated and persisted new auth token"
  fi
fi

# ---- Step 3: Install Railway CLI if not already present ----
# Installed at runtime to avoid GitHub API rate limits during Docker build
if ! command -v railway &>/dev/null; then
  echo "[ClaudeOS] Railway CLI not found, installing..."
  curl -fsSL https://railway.com/install.sh | sh
  echo "[ClaudeOS] Railway CLI installed successfully"
else
  echo "[ClaudeOS] Railway CLI already installed"
fi

# ---- Step 4: Install Claude Code if not already present ----
# Claude Code is installed at runtime (not in Docker build) because:
# - The installer uses curl (no network in Nix sandbox)
# - Installation is cached on the persistent /data volume via HOME=/home/app
# - Subsequent boots skip this step if `claude` is already on PATH
if ! su-exec "${APP_USER}" bash -c 'command -v claude' &>/dev/null; then
  echo "[ClaudeOS] Claude Code not found, installing..."
  su-exec "${APP_USER}" bash -c 'curl -fsSL https://claude.ai/install.sh | bash'
  echo "[ClaudeOS] Claude Code installed successfully"
else
  echo "[ClaudeOS] Claude Code already installed"
fi

# ---- Step 5: Drop privileges and exec supervisor ----
# su-exec replaces the current process (no extra PID, signals propagate correctly).
# NODE_PATH is set in container config.Env to include externalized @fastify/websocket.
echo "[ClaudeOS] Starting supervisor as ${APP_USER}..."
exec su-exec "${APP_USER}" node "${SUPERVISOR_BIN}"
