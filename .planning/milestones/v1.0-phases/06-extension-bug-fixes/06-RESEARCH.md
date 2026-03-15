# Phase 6: Extension Bug Fixes - Research

**Researched:** 2026-03-14
**Domain:** VS Code extension postMessage wiring, Zod schema passthrough, GitHub API authentication
**Confidence:** HIGH

## Summary

Phase 6 closes two partial requirement implementations identified in the v1.0 milestone audit. Both are small, well-scoped wiring bugs where the code exists but critical connections are missing.

**Bug 1 (IMP-03):** The `claudeos-self-improve` extension correctly detects GitHub PAT secrets and sends `secretName` in the install request body. However, the supervisor's `GithubReleaseInstallSchema` Zod schema (in `supervisor/src/schemas/extension.ts`) does not include a `secretName` field, so Zod strips it during validation. Additionally, `ExtensionInstaller.installFromGitHub()` never receives or uses the PAT token when calling the GitHub API. The fix requires: (1) adding `secretName` to the Zod schema, (2) passing it through the route handler, (3) resolving the secret value via the secrets API/store, and (4) including it as an `Authorization: Bearer <token>` header on GitHub API requests.

**Bug 2 (HOM-04):** The `claudeos-home` extension's `checkApiKeyStatus()` function (in `claudeos-home/src/extension.ts`) correctly queries the secrets extension for `ANTHROPIC_API_KEY` existence but dead-ends at a comment stub. The `HomePanel` webview already handles the `anthropicKeyStatus` message (line 463 of home-panel.ts). The fix is a single `postMessage` call. There is also a secondary issue: `HomePanel.currentPanel` references a `HomePanel` instance, but `postMessage` must be called on `panel.webview` which is a private member. Either expose a public method on `HomePanel` or make the panel's webview accessible.

**Primary recommendation:** These are two isolated, small fixes. Plan as a single plan with two tasks.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| IMP-03 | User can select a GitHub PAT secret for private repo access during install | Zod schema fix + installFromGitHub auth header + route handler secretName passthrough |
| HOM-04 | User can access shortcuts grid with frequently used actions | checkApiKeyStatus() postMessage fix (banner status is the missing piece; shortcuts grid itself works) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.25 (Zod 4 API) | Schema validation for Fastify routes | Already in use throughout supervisor |
| vscode API | N/A | Extension webview postMessage | Standard VS Code extension API |

### Supporting
No additional libraries needed. Both fixes use existing dependencies.

## Architecture Patterns

### Pattern 1: Zod Schema Extension with Optional Field
**What:** Add `secretName` as an optional field to `GithubReleaseInstallSchema`
**When to use:** When extending an existing discriminated union variant
**Example:**
```typescript
// supervisor/src/schemas/extension.ts
const GithubReleaseInstallSchema = z.object({
  method: z.literal("github-release"),
  repo: z.string().min(1),
  tag: z.string().min(1),
  secretName: z.string().min(1).optional(),  // <-- add this
});
```

### Pattern 2: Secret Resolution in Route Handler
**What:** The route handler resolves `secretName` to an actual token value before passing to the installer service
**When to use:** When a route needs to translate a reference (secret name) into a value
**Example:**
```typescript
// In extensions.ts route handler
case "github-release": {
  let token: string | undefined;
  if (body.secretName) {
    // Resolve secret via internal API call or direct SecretStore access
    const res = await fetch(`http://localhost:3100/api/v1/secrets/${encodeURIComponent(body.secretName)}`);
    if (res.ok) {
      const data = await res.json();
      token = data.value;
    }
  }
  await extensionInstaller.installFromGitHub(body.repo!, body.tag!, token);
  break;
}
```

### Pattern 3: Public postMessage Method on Singleton Panel
**What:** Expose a method on HomePanel to send messages to the webview
**When to use:** When external code needs to post to a webview owned by a panel class
**Example:**
```typescript
// On HomePanel class
public postMessage(message: unknown): Thenable<boolean> {
  return this.panel.webview.postMessage(message);
}
```

### Anti-Patterns to Avoid
- **Direct SecretStore import in extension routes:** The extension routes currently receive only `extensionInstaller`. Use the internal HTTP API (`localhost:3100/api/v1/secrets/:name`) to resolve secrets, keeping routes decoupled from the secrets service. Alternatively, pass a secret resolver function or the dataDir to extension routes, but the HTTP approach is simplest and already proven.
- **Storing PAT in ExtensionInstaller state:** The token should be used transiently for the API call only, never persisted to `install-state.json`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub API auth | Custom auth header logic | Standard `Authorization: Bearer <token>` header on fetch | GitHub API standard, already using fetch |
| Secret resolution | Direct file system crypto | Existing `/api/v1/secrets/:name` endpoint | Already built, handles decryption, error cases |

## Common Pitfalls

### Pitfall 1: Zod Strips Unknown Fields Silently
**What goes wrong:** `secretName` sent by client but Zod schema does not include it, so the field is silently removed before the route handler sees it
**Why it happens:** Zod's default behavior strips unknown keys during parsing (`.strip()` mode)
**How to avoid:** Add the field to the schema. This is the root cause of IMP-03.
**Warning signs:** Client sends field, server handler never receives it, no error logged

### Pitfall 2: Race Condition Between Panel Creation and postMessage
**What goes wrong:** `checkApiKeyStatus()` runs before the HomePanel webview is fully loaded, so `postMessage` is lost
**Why it happens:** `checkApiKeyStatus()` is called immediately after `HomePanel.createOrShow()` in `activate()`. The panel may not have rendered its HTML yet.
**How to avoid:** Either: (a) have the webview request API key status via a message (like it does for sessions/shortcuts), or (b) add a small delay, or (c) have the panel request the status after it initializes. Option (a) is most robust and follows the existing pattern.
**Warning signs:** Banner never appears even when API key is not set

### Pitfall 3: Private Panel Member Access
**What goes wrong:** `checkApiKeyStatus()` in extension.ts cannot call `this.panel.webview.postMessage()` because `panel` is private on `HomePanel`
**Why it happens:** HomePanel encapsulates the WebviewPanel as a private member
**How to avoid:** Add a public `postMessage()` method on HomePanel, or restructure so the panel requests status itself
**Warning signs:** TypeScript compilation error

### Pitfall 4: GitHub API Token Format
**What goes wrong:** Token passed with wrong prefix or format
**Why it happens:** GitHub classic PATs use `token <PAT>`, fine-grained tokens use `Bearer <token>`
**How to avoid:** Use `Authorization: Bearer <token>` which works for both fine-grained tokens and GitHub Apps. For classic PATs, `token <PAT>` is traditional but `Bearer` also works.
**Warning signs:** 401 from GitHub API despite correct token value

### Pitfall 5: Self-Referencing Fetch in Route Handler
**What goes wrong:** Route handler calls `fetch("http://localhost:3100/api/v1/secrets/...")` to resolve a secret, but the server may not be fully listening yet during tests
**Why it happens:** Route handler making HTTP call to its own server
**How to avoid:** Consider passing a `getSecret` callback or the `dataDir` to extensionRoutes options, allowing direct SecretStore access. Alternatively, use `server.inject()` for internal requests. The simplest approach: pass a `resolveSecret?: (name: string) => Promise<string | undefined>` function in the route options.
**Warning signs:** Tests fail with ECONNREFUSED when running extension install with secretName

## Code Examples

### Fix 1: GithubReleaseInstallSchema (IMP-03)

```typescript
// supervisor/src/schemas/extension.ts - Add secretName to github-release variant
const GithubReleaseInstallSchema = z.object({
  method: z.literal("github-release"),
  repo: z.string().min(1),
  tag: z.string().min(1),
  secretName: z.string().min(1).optional(),
});
```

### Fix 2: ExtensionInstaller.installFromGitHub (IMP-03)

```typescript
// supervisor/src/services/extension-installer.ts - Accept optional token
async installFromGitHub(repo: string, tag: string, token?: string): Promise<void> {
  // ... existing code ...
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "ClaudeOS-Supervisor",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(apiUrl, { headers });
  // ... rest unchanged ...

  // Also add auth header to VSIX download for private repos
  const vsixResponse = await fetch(vsixAsset.browser_download_url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
```

### Fix 3: Route Handler Secret Resolution (IMP-03)

```typescript
// supervisor/src/routes/extensions.ts - Resolve secret and pass token
export interface ExtensionRouteOptions {
  extensionInstaller: ExtensionInstaller;
  resolveSecret?: (name: string) => Promise<string | undefined>;
}

// In the route handler:
case "github-release": {
  let token: string | undefined;
  if (body.secretName && options.resolveSecret) {
    token = await options.resolveSecret(body.secretName);
  }
  await extensionInstaller.installFromGitHub(body.repo!, body.tag!, token);
  break;
}
```

### Fix 4: checkApiKeyStatus postMessage (HOM-04)

Two approaches, recommend approach A (webview-initiated, matches existing patterns):

**Approach A: Webview requests status (recommended)**
```typescript
// In home-panel.ts _handleMessage, add a case:
case "checkApiKeyStatus": {
  try {
    const secretsExt = vscode.extensions.getExtension("claudeos.claudeos-secrets");
    if (secretsExt) {
      const api = secretsExt.isActive ? secretsExt.exports : await secretsExt.activate();
      const hasKey = await api?.hasSecret?.("ANTHROPIC_API_KEY");
      await this.panel.webview.postMessage({
        command: "anthropicKeyStatus",
        data: !!hasKey,
      });
    }
  } catch { /* ignore */ }
  break;
}

// In the webview JS, add to the initial data requests:
vscode.postMessage({ command: 'checkApiKeyStatus' });
```

**Approach B: Extension pushes status (simpler but has race condition risk)**
```typescript
// In extension.ts checkApiKeyStatus():
if (HomePanel.currentPanel) {
  HomePanel.currentPanel.postMessage({
    command: "anthropicKeyStatus",
    data: !!hasKey,
  });
}

// Requires adding to HomePanel:
public postMessage(message: unknown): Thenable<boolean> {
  return this.panel.webview.postMessage(message);
}
```

## State of the Art

No changes to approach needed. Both fixes use existing patterns already established in the codebase.

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A | N/A | N/A | Both bugs are wiring omissions, not stale patterns |

## Open Questions

1. **Secret resolution mechanism in route handler**
   - What we know: The extension route needs to resolve a secret name to a token value. SecretStore is accessed lazily via `dataDir` in secret routes (Phase 5 pattern). Extension routes only receive `extensionInstaller`.
   - What's unclear: Whether to use self-referencing HTTP call, direct SecretStore access, or a callback function
   - Recommendation: Pass a `resolveSecret` callback in the route options. In `server.ts`, create it using the same lazy SecretStore pattern from Phase 5. This avoids self-referencing HTTP and keeps routes decoupled.

2. **Whether to also add auth to the VSIX download URL**
   - What we know: `browser_download_url` for private repo release assets requires authentication too
   - What's unclear: Whether GitHub redirect-based download URLs accept Bearer tokens
   - Recommendation: Include the auth header on VSIX download as well. GitHub release asset downloads for private repos require the `Authorization` header. The `Accept: application/octet-stream` header on the release asset URL is the standard pattern, but `browser_download_url` also works with the token.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | `supervisor/vitest.config.ts`, `claudeos-home/vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `cd supervisor && npx vitest run && cd ../claudeos-home && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IMP-03 | secretName passes through Zod schema | unit | `cd supervisor && npx vitest run test/routes/extensions.test.ts -x` | Yes (extend) |
| IMP-03 | installFromGitHub uses auth header when token provided | unit | `cd supervisor && npx vitest run test/services/extension-installer.test.ts -x` | Yes (extend) |
| HOM-04 | API key status posted to webview | unit | `cd claudeos-home && npx vitest run test/webview/home-panel.test.ts -x` | Yes (extend) |

### Sampling Rate
- **Per task commit:** `cd supervisor && npx vitest run -x && cd ../claudeos-home && npx vitest run -x`
- **Per wave merge:** Full suite across both packages
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements. Extend existing test files with new test cases.

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `supervisor/src/schemas/extension.ts` (GithubReleaseInstallSchema missing secretName)
- Direct code inspection of `claudeos-home/src/extension.ts` (checkApiKeyStatus dead-end at comment stub)
- Direct code inspection of `claudeos-home/src/webview/home-panel.ts` (anthropicKeyStatus handler exists in webview JS at line 463)
- Direct code inspection of `supervisor/src/services/extension-installer.ts` (installFromGitHub has no token parameter)
- Direct code inspection of `supervisor/src/routes/extensions.ts` (route handler does not extract secretName)
- v1.0 Milestone Audit (`.planning/v1.0-MILESTONE-AUDIT.md`) -- gap identification

### Secondary (MEDIUM confidence)
- GitHub API docs: Bearer token auth for private repo release access (well-known pattern)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries needed, using existing codebase patterns
- Architecture: HIGH - both fixes follow established patterns (Zod schema, postMessage, fetch headers)
- Pitfalls: HIGH - code inspection reveals exact bugs and their fixes

**Research date:** 2026-03-14
**Valid until:** indefinite (bug fixes for existing code, not library-version-sensitive)
