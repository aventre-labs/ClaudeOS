#!/bin/bash
# ClaudeOS Container Entrypoint
#
# This script runs as root (PID 1) to:
# 1. Ensure /data directory structure exists and is owned by the app user
# 2. Install Claude Code if not already present on the persistent volume
# 3. Drop privileges and exec the supervisor process as the app user
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

# ---- Step 2: Install Claude Code if not already present ----
# Claude Code is installed at runtime (not in Nix build) because:
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

# ---- Step 3: Drop privileges and exec supervisor ----
# su-exec replaces the current process (no extra PID, signals propagate correctly).
# NODE_PATH is set in container config.Env to include externalized @fastify/websocket.
echo "[ClaudeOS] Starting supervisor as ${APP_USER}..."
exec su-exec "${APP_USER}" node "${SUPERVISOR_BIN}"
