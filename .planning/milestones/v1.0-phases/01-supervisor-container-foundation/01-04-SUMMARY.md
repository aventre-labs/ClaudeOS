---
phase: 01-supervisor-container-foundation
plan: 04
subsystem: infra
tags: [nix, docker, container, oci, railway, docker-compose, entrypoint, deployment]

# Dependency graph
requires:
  - phase: 01-supervisor-container-foundation
    plan: 02
    provides: Session management service, tmux integration, WebSocket routes
  - phase: 01-supervisor-container-foundation
    plan: 03
    provides: Platform services (secrets, extensions, settings, boot), config files, first-boot HTML
provides:
  - Complete Nix flake with devShell, supervisor build (buildNpmPackage), and OCI container image (buildLayeredImage)
  - Container entrypoint script with /data directory setup, Claude Code runtime install, and privilege drop via su-exec
  - docker-compose.yml for local development with port mapping, volume mount, and healthcheck
  - railway.toml for Railway deployment with GHCR image, healthcheck, restart policy, and persistent volume
affects: [02-sessions, 03-secrets, 04-self-improvement]

# Tech tracking
tech-stack:
  added: [nix-flakes, dockerTools.buildLayeredImage, buildNpmPackage, su-exec]
  patterns: [nix-layered-oci-image, runtime-install-on-persistent-volume, privilege-drop-entrypoint]

key-files:
  created:
    - flake.nix
    - entrypoint.sh
    - docker-compose.yml
    - railway.toml
  modified: []

key-decisions:
  - "Claude Code installed at container runtime (not build time) and cached on /data volume -- Nix build sandbox has no network access"
  - "su-exec for privilege drop (lightweight, exec-based, no PID overhead vs gosu)"
  - "buildLayeredImage with fakeRootCommands for cross-platform container builds (no runAsRoot)"
  - "60s start_period for docker-compose healthcheck to allow first-boot setup time"
  - "Railway healthcheck timeout 120s for first-boot Claude Code installation"

patterns-established:
  - "Nix layered OCI image: buildLayeredImage with fakeRootCommands for user creation and file copying"
  - "Runtime install pattern: check for binary, install to persistent volume, skip on subsequent boots"
  - "Entrypoint privilege model: start as root for chown, drop to app user via su-exec for supervisor"

requirements-completed: [DEP-01, DEP-02, DEP-03, DEP-05, DEP-06, DEP-07]

# Metrics
duration: 8min
completed: 2026-03-12
---

# Phase 1 Plan 04: Container Image and Deployment Summary

**Nix-built OCI container image with layered dependencies, su-exec privilege drop entrypoint, docker-compose local dev, and Railway production deployment config**

## Performance

- **Duration:** 8 min (across two sessions with checkpoint)
- **Started:** 2026-03-12T07:41:00Z
- **Completed:** 2026-03-12T07:56:13Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Complete Nix flake with supervisor build derivation (buildNpmPackage + esbuild), OCI container image derivation (buildLayeredImage with Node.js 22, tmux, git, code-server, su-exec), and devShell
- Entrypoint script handling /data directory creation, ownership, Claude Code runtime installation (cached on persistent volume), and privilege drop from root to app user via su-exec
- docker-compose.yml mapping ports 8080 (code-server) and 3100 (supervisor API), mounting /data volume, with healthcheck and 60s start period
- railway.toml configuring GHCR image pull, /api/v1/health healthcheck at 120s timeout, ON_FAILURE restart with 3 retries, and persistent /data volume

## Task Commits

Each task was committed atomically:

1. **Task 1: Complete Nix flake with supervisor build and container image derivations** - `d8d1fc8` (feat)
2. **Task 2: Create docker-compose.yml and railway.toml deployment configs** - `b2864d0` (feat)
3. **Task 3: Verify container build pipeline and deployment configs** - Checkpoint (human-verify, approved via structural review)

## Files Created/Modified
- `flake.nix` - Complete Nix flake: devShell, supervisor buildNpmPackage derivation, OCI container buildLayeredImage derivation
- `entrypoint.sh` - Container entrypoint: /data directory setup, chown, Claude Code install, su-exec privilege drop, exec supervisor
- `docker-compose.yml` - Local dev compose: claudeos service with port mapping, /data volume, healthcheck, env vars
- `railway.toml` - Railway deployment: GHCR image reference, healthcheck path, restart policy, persistent volume mount

## Decisions Made
- Claude Code installed at container runtime rather than build time because Nix build sandbox prohibits network access; installation cached on /data persistent volume so it only runs on first boot
- su-exec chosen for privilege drop (lightweight, exec-based replacement with no PID overhead unlike gosu)
- buildLayeredImage with fakeRootCommands used instead of runAsRoot for cross-platform Nix builds (works on macOS without Linux builder for image definition)
- 60s start_period in docker-compose and 120s healthcheck timeout in Railway to accommodate first-boot Claude Code installation and extension setup
- App user created in Nix image via fakeRootCommands (UID 1000, /home/app) rather than runtime user creation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Nix is not installed on the local macOS machine, so `nix flake check` and `nix build .#container` could not be run. Verification was done via structural review of flake.nix syntax and entrypoint.sh logic. User approved via checkpoint.
- `docker compose config` validation also could not run because the image referenced in docker-compose.yml does not exist locally (it requires the Nix build). User confirmed structural review is sufficient.

## User Setup Required
None - no external service configuration required. Container build requires Nix with flakes enabled.

## Next Phase Readiness
- Container image definition is complete; building requires `nix build .#container` on a system with Nix installed
- All Phase 1 plans are now complete (01-01 through 01-05)
- Phase 2 (Session Management) can begin: supervisor API, session management, and container foundation are all in place
- First actual deployment will validate the Nix build + docker load + docker compose up pipeline end-to-end

## Self-Check: PASSED

All 4 created files verified present (flake.nix, entrypoint.sh, docker-compose.yml, railway.toml). Both task commits (d8d1fc8, b2864d0) verified in git log.

---
*Phase: 01-supervisor-container-foundation*
*Completed: 2026-03-12*
