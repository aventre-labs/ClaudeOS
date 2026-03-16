# Requirements: ClaudeOS

**Defined:** 2026-03-15
**Core Value:** Give Claude Code a real, extensible browser UI and the ability to expand its own capabilities by building and installing new extensions — without ever modifying Claude Code itself.

## v1.1 Requirements

Requirements for Zero-Config Onboarding milestone. Each maps to roadmap phases.

### Setup Wizard

- [x] **SETUP-01**: User sees build progress with status updates during first boot while extensions install
- [x] **SETUP-02**: User is guided through a multi-step stepper wizard (Railway auth → Claude auth → Launch)
- [x] **SETUP-03**: Setup wizard state persists across container restarts so user can resume where they left off
- [x] **SETUP-04**: Setup wizard is protected from race conditions — only one visitor can claim the instance

### Authentication

- [x] **AUTH-01**: User can sign in with Railway via `railway login --browserless` pairing code flow
- [x] **AUTH-02**: User can paste an Anthropic API key to credential Claude Code
- [x] **AUTH-03**: User can sign in with Anthropic via `claude login` flow (experimental, falls back to API key if container doesn't support it)
- [x] **AUTH-04**: Each wizard step shows current auth status when pre-configured (e.g., "Railway already signed in" with Sign Out button)
- [x] **AUTH-05**: Each auth step shows option to add another auth method (e.g., "+ Add auth token" for Railway, "+ Add another method" for Anthropic)

### Deployment

- [x] **DEPLOY-01**: README deploy button works for any fork without hardcoded repo URLs
- [ ] **DEPLOY-02**: User can launch ClaudeOS after completing auth steps

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Multi-Account

- **MULTI-01**: User can configure multiple Anthropic auth methods/accounts simultaneously
- **MULTI-02**: User can sign out and re-auth Railway from within running ClaudeOS

## Out of Scope

| Feature | Reason |
|---------|--------|
| Custom Railway OAuth app | `railway login --browserless` pairing flow eliminates need for OAuth app registration |
| Static OAuth callback page | Pairing code flow has no redirect URIs |
| Password-based auth (CLAUDEOS_AUTH_TOKEN) | Replaced by Railway CLI auth for ownership verification |
| Passkey/WebAuthn | Railway CLI auth covers this use case |
| Multiple simultaneous Anthropic accounts | Deferred — UI shows "+ Add method" but actual multi-account is future |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETUP-01 | Phase 12 | Complete |
| SETUP-02 | Phase 12 | Complete |
| SETUP-03 | Phase 11 | Complete |
| SETUP-04 | Phase 10 | Complete |
| AUTH-01 | Phase 11 | Complete |
| AUTH-02 | Phase 11 | Complete |
| AUTH-03 | Phase 11 | Complete |
| AUTH-04 | Phase 12 | Complete |
| AUTH-05 | Phase 12 | Complete |
| DEPLOY-01 | Phase 10 | Complete |
| DEPLOY-02 | Phase 13 | Pending |

**Coverage:**
- v1.1 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after roadmap creation*
