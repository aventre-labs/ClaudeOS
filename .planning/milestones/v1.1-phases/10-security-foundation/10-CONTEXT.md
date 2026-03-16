# Phase 10: Security Foundation - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the setup race condition, replace password-based auth with Railway-integrated auth token flow, update the deploy button to work for any fork, and create the railway.json template config. This phase eliminates auth.json and the password creation step entirely.

</domain>

<decisions>
## Implementation Decisions

### Deploy Button
- GitHub Action triggers on fork creation event to auto-patch the README deploy button URL
- URL format: `https://railway.app/new/template?template=https://github.com/OWNER/REPO`
- Action replaces OWNER/REPO with the forked repo's owner and name, then commits the change
- Original repo has the correct button; every fork gets auto-patched

### Auth Model (major change from v1.0)
- **No password creation step.** The entire password flow is removed.
- `CLAUDEOS_AUTH_TOKEN` is a Railway template variable, auto-generated via `${{secret(32)}}` at deploy time
- Railway login verifies ownership by matching `RAILWAY_PROJECT_ID` env var against the user's Railway projects
- After successful Railway login, browser gets a cookie with the auth token — this is how they stay logged in
- Code-server uses `CLAUDEOS_AUTH_TOKEN` as its `PASSWORD` env var
- Multiple devices supported: each device that completes Railway login gets the cookie
- Small "use auth token instead" button below "Sign in with Railway" for manual access
- Auth token visible only in Railway dashboard env vars, never shown in ClaudeOS UI

### Encryption Key
- Derive encryption key from auth token via `scrypt(CLAUDEOS_AUTH_TOKEN)` — deterministic, no file storage needed
- `auth.json` is eliminated entirely
- Secrets extension encryption still works, just sources the key differently

### Auth Migration
- Not a concern for v1.1 — no real users on v1.0 yet
- Breaking change is acceptable: v1.0 auth.json is simply ignored

### Setup Page Behavior
- Sign-in page shown immediately on first visit, even while extensions are still installing
- Build progress bar visible alongside/below the sign-in UI
- v1.1 is Railway-focused — local deploy auth support deferred to v1.2

### Claude's Discretion
- Exact railway.json template configuration (build command, health check, start command)
- Lock file vs in-memory mutex for any remaining race conditions
- Setup page CSS/branding details
- Cookie expiration and security settings (httpOnly, secure, sameSite)

</decisions>

<specifics>
## Specific Ideas

- "Use auth token instead" should be small/subtle — Railway login is the primary path
- Auth flow should feel like "Sign in with Google" — familiar OAuth-style UX even though it's CLI-based under the hood
- Fork auto-patching via GitHub Action is preferred over maintaining a Railway template

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BootService` class (`supervisor/src/services/boot.ts`): Has the boot state machine, setup page serving, and code-server launch. Will be heavily modified.
- `first-boot/setup.html`: Existing setup page HTML. Will be replaced with Railway auth UI.
- `ExtensionInstaller`: Already handles install state tracking — reusable for progress display.

### Established Patterns
- Boot state machine: `initializing -> setup -> installing -> ready -> ok` — will need new states or modification
- Setup server runs on port 8080, same port code-server uses later. Clean handoff pattern already exists.
- `isConfigured()` checks auth.json existence — will change to check `CLAUDEOS_AUTH_TOKEN` env var

### Integration Points
- `supervisor/src/index.ts:27-29`: First-boot detection and setup page serving
- `supervisor/src/services/boot.ts:131-206`: POST /api/v1/setup handler (to be replaced)
- `supervisor/src/services/boot.ts:317-371`: code-server launch with PASSWORD env var
- `README.md:21`: Deploy button markdown
- Secrets extension reads encryption key — will need to source from scrypt(auth token) instead of auth.json

</code_context>

<deferred>
## Deferred Ideas

- Local (non-Railway) deploy auth support — v1.2
- Railway sign out + re-auth from within running ClaudeOS — future
- Password fallback for non-Railway deployments — future

</deferred>

---

*Phase: 10-security-foundation*
*Context gathered: 2026-03-15*
