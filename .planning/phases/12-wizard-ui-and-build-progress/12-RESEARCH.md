# Phase 12: Wizard UI and Build Progress - Research

**Researched:** 2026-03-15
**Domain:** React SPA with SSE real-time updates, Vite build tooling, static file serving from Node.js
**Confidence:** HIGH

## Summary

Phase 12 builds a TypeScript React single-page application in `supervisor/wizard/` that replaces the existing `first-boot/setup.html` with a multi-step wizard. The wizard consumes the Phase 11 backend API (6 REST+SSE endpoints already implemented) and displays real-time build progress via Server-Sent Events. The app is built with Vite during Docker build and served as static files by the existing `BootService.serveSetupPage()` mechanism.

The existing backend is complete and well-typed with Zod schemas. The frontend needs to: (1) scaffold a Vite+React+TypeScript project, (2) implement a horizontal stepper with three steps, (3) consume SSE for real-time auth and build progress, (4) serve the built output from BootService. The technology choices are locked: React, Vite, CSS Modules, TypeScript.

**Primary recommendation:** Keep the React app minimal with zero external UI dependencies. Use native `EventSource` API with a custom hook for SSE. CSS Modules for scoped styling. Build output served via the existing raw `http.createServer` in BootService by reading files from disk and serving with correct MIME types.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Horizontal top stepper bar showing steps: Railway -> Claude -> Launch
- Centered card layout (~600px wide) with background fill
- ClaudeOS logo + "ClaudeOS Setup" heading above the stepper
- Theme sourced from the default ClaudeOS VS Code theme -- CSS variables extracted from theme JSON at build time
- Active step highlighted, completed steps show checkmark
- Persistent footer bar at the bottom of the wizard card for build progress -- visible while auth steps proceed
- Auth steps are available immediately; build progress does NOT block auth flow
- Footer shows progress bar + currently installing extension name + count (e.g., "Installing claudeos-terminal... (3/5)")
- On completion: footer transitions to green checkmark, stays briefly, then fades/shrinks
- On failure: error message in footer with retry button; auth steps remain accessible
- Build progress updates via SSE from the existing boot state machine
- Not started / In progress / Completed / Error states for each auth step as described in CONTEXT.md
- Alternative methods always visible below primary method (not hidden behind expand)
- TypeScript React app in `supervisor/wizard/` directory
- Vite for build tooling, CSS modules for scoped styling
- Built during Docker build, output served by BootService as static files
- Consumes Phase 11 wizard API endpoints

### Claude's Discretion
- Exact component decomposition (Stepper, StepCard, ProgressBar, etc.)
- Animation/transition details for step changes and footer completion
- Exact spacing, typography, and responsive breakpoints
- SSE reconnection strategy for the events stream
- How the "Save Railway login for Claude" checkbox is styled
- Loading skeleton or spinner design while fetching initial wizard state

### Deferred Ideas (OUT OF SCOPE)
- Auth settings accessible in VS Code native settings panel (extension settings) -- runtime feature, not first-boot wizard
- Railway sign-out and re-auth from within running ClaudeOS -- future capability
- Multiple simultaneous Anthropic accounts -- UI shows "+ Add method" but actual multi-account is future (MULTI-01, MULTI-02)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SETUP-01 | User sees build progress with status updates during first boot while extensions install | SSE hook consuming `GET /api/v1/wizard/events`, footer progress bar component displaying extension install count |
| SETUP-02 | User is guided through a multi-step stepper wizard (Railway auth -> Claude auth -> Launch) | Horizontal stepper component with step state management, consuming `GET /api/v1/wizard/status` for initial state |
| AUTH-04 | Each wizard step shows current auth status when pre-configured (e.g., "Railway already signed in" with Sign Out button) | Wizard status API returns `steps.railway.completed` and `steps.anthropic.completed` -- render completed state with sign-out link |
| AUTH-05 | Each auth step shows option to add another auth method | Railway: "Use auth token instead" link always visible. Anthropic: API key and claude login shown as equal options side by side |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x | UI framework | Locked decision from CONTEXT.md |
| Vite | 6.x | Build tooling + dev server | Locked decision, fast builds, native TypeScript |
| TypeScript | ~5.8 | Type safety | Matches supervisor tsconfig |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| CSS Modules | (built-in Vite) | Scoped styling | All component styles -- `.module.css` files |

### What NOT to Install
| Library | Why Not |
|---------|---------|
| Any UI framework (MUI, Chakra, etc.) | Simple wizard, custom theme from VS Code -- external UI lib adds bloat |
| React Router | Single-page wizard with steps, not routes -- state-driven step switching |
| State management (Redux, Zustand) | Simple enough for useState/useReducer + context |
| SSE library (react-hooks-sse, etc.) | Native EventSource API is sufficient, custom hook is ~30 lines |
| Axios/fetch wrapper | Native fetch for REST calls, native EventSource for SSE |

**Installation (new project):**
```bash
cd supervisor/wizard
npm create vite@latest . -- --template react-ts
npm install
```

Note: The wizard is a separate package from supervisor. It has its own `package.json`, `tsconfig.json`, and `vite.config.ts`. It does NOT share `node_modules` with the supervisor.

## Architecture Patterns

### Recommended Project Structure
```
supervisor/wizard/
├── index.html              # Vite entry point
├── package.json            # Separate from supervisor
├── tsconfig.json           # React-oriented TS config
├── vite.config.ts          # Build config, output to ../wizard-dist/
├── src/
│   ├── main.tsx            # React root mount
│   ├── App.tsx             # Top-level: fetch status, manage state, render stepper
│   ├── components/
│   │   ├── Stepper.tsx     # Horizontal step indicators (Railway | Claude | Launch)
│   │   ├── Stepper.module.css
│   │   ├── StepCard.tsx    # Container for active step content
│   │   ├── StepCard.module.css
│   │   ├── RailwayStep.tsx # Railway auth: pairing code, token input, status
│   │   ├── RailwayStep.module.css
│   │   ├── AnthropicStep.tsx # Anthropic auth: API key input, claude login, status
│   │   ├── AnthropicStep.module.css
│   │   ├── LaunchStep.tsx  # Final step: launch button
│   │   ├── LaunchStep.module.css
│   │   ├── BuildProgress.tsx # Footer bar: progress bar + extension name
│   │   └── BuildProgress.module.css
│   ├── hooks/
│   │   ├── useWizardStatus.ts  # GET /api/v1/wizard/status polling/initial fetch
│   │   └── useSSE.ts           # EventSource hook with reconnection
│   ├── api/
│   │   └── wizard.ts           # REST API call functions (typed)
│   └── types.ts                # Shared types (mirrors backend WizardSSEEvents, WizardState)
└── public/                 # Static assets (logo SVG, etc.)
```

### Pattern 1: SSE Hook with Reconnection
**What:** Custom React hook wrapping native EventSource with automatic reconnect
**When to use:** Consuming the `GET /api/v1/wizard/events` SSE stream

```typescript
// supervisor/wizard/src/hooks/useSSE.ts
import { useEffect, useRef, useCallback, useState } from 'react';

type SSEHandler = (data: unknown) => void;

interface UseSSEOptions {
  url: string;
  handlers: Record<string, SSEHandler>;
  maxRetries?: number;
  retryDelay?: number;
}

export function useSSE({ url, handlers, maxRetries = 5, retryDelay = 2000 }: UseSSEOptions) {
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);

  const connect = useCallback(() => {
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
      retriesRef.current = 0;
    };

    // Register typed event handlers
    for (const [event, handler] of Object.entries(handlers)) {
      es.addEventListener(event, (e: MessageEvent) => {
        handler(JSON.parse(e.data));
      });
    }

    es.onerror = () => {
      es.close();
      setConnected(false);
      if (retriesRef.current < maxRetries) {
        retriesRef.current++;
        setTimeout(connect, retryDelay * Math.pow(2, retriesRef.current - 1));
      }
    };
  }, [url, handlers, maxRetries, retryDelay]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
```

### Pattern 2: Wizard State Machine (Client-Side)
**What:** useReducer managing wizard step states derived from backend status + SSE events
**When to use:** App.tsx top-level state management

```typescript
type WizardStep = 'railway' | 'anthropic' | 'launch';

interface WizardUIState {
  activeStep: WizardStep;
  railway: { status: 'idle' | 'pairing' | 'complete' | 'error'; pairingCode?: string; url?: string; error?: string };
  anthropic: { status: 'idle' | 'validating' | 'complete' | 'error'; error?: string };
  build: { status: 'installing' | 'complete' | 'error'; current?: string; progress?: number; total?: number; error?: string };
}

type WizardAction =
  | { type: 'INIT'; payload: WizardStatusResponse }
  | { type: 'RAILWAY_STARTED'; payload: { pairingCode: string; url: string } }
  | { type: 'RAILWAY_COMPLETE'; payload: { success: boolean; error?: string } }
  | { type: 'ANTHROPIC_KEY_VALIDATED'; payload: { success: boolean; error?: string } }
  | { type: 'ANTHROPIC_LOGIN_STARTED'; payload: { url: string } }
  | { type: 'ANTHROPIC_LOGIN_COMPLETE'; payload: { success: boolean; error?: string } }
  | { type: 'STEP_COMPLETED'; payload: { step: string } }
  | { type: 'SET_ACTIVE_STEP'; payload: WizardStep };
```

### Pattern 3: Static File Serving from BootService
**What:** Modify `BootService.serveSetupPage()` to serve Vite build output instead of a single HTML file
**When to use:** During boot `setup` state

```typescript
// The existing BootService.serveSetupPage() uses raw http.createServer
// It needs to serve static files from the wizard build directory:
// - index.html for / and /setup
// - JS/CSS assets from /assets/*
// - Correct MIME types for .js, .css, .html, .svg, etc.

// The wizard build output (from vite build) goes to a known directory
// e.g., supervisor/wizard-dist/ or a location copied during Docker build

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};
```

### Pattern 4: Vite Build Configuration
**What:** Configure Vite to output build artifacts to a predictable location
**When to use:** `supervisor/wizard/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../wizard-dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3100',  // Dev proxy to supervisor
    },
  },
});
```

### Anti-Patterns to Avoid
- **Using React Router for wizard steps:** Steps are not URL routes. Use state to track active step. Avoids URL manipulation complexity.
- **Polling instead of SSE for real-time updates:** The SSE endpoint exists -- use it. Polling adds latency and unnecessary requests.
- **Blocking auth on build progress:** CONTEXT.md explicitly says auth steps must be available immediately while extensions install in parallel.
- **Over-engineering state management:** useState/useReducer handles this. No need for Redux, Zustand, or context providers for a simple wizard.
- **Sharing node_modules between supervisor and wizard:** They are separate projects with different targets (Node.js vs browser). Separate package.json files.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE parsing | Custom SSE parser | Native EventSource API | Browser handles reconnection, parsing, heartbeat detection |
| CSS scoping | BEM naming conventions or CSS-in-JS | CSS Modules (built into Vite) | Zero config, type-safe class names, no runtime overhead |
| Build tooling | Webpack/esbuild config | Vite (`npm create vite@latest`) | Pre-configured for React+TS, HMR, production builds |
| MIME type detection | File extension parsing | Static map of known extensions | Wizard build output is predictable (HTML, JS, CSS, SVG only) |
| API key masking | Custom masking logic | `type="password"` input | Browser handles masking natively |

## Common Pitfalls

### Pitfall 1: SSE Connection Blocked by Completion Guard
**What goes wrong:** The `GET /api/v1/wizard/events` endpoint has a `completionGuard` preHandler that returns 410 if the wizard is already completed. If the user completes the wizard and the SSE reconnect fires, it gets 410.
**Why it happens:** EventSource auto-reconnects on error. After wizard completion, reconnection hits 410 Gone.
**How to avoid:** In the SSE hook, check for wizard completion state before reconnecting. When `wizard:completed` event is received, close the EventSource and do not reconnect.
**Warning signs:** Console errors showing 410 responses after wizard completion.

### Pitfall 2: Vite Base Path Mismatch
**What goes wrong:** Vite defaults to `base: '/'` which works when served from root. If the wizard is served from a subpath, asset URLs break.
**Why it happens:** Vite generates absolute asset paths (`/assets/main.abc123.js`).
**How to avoid:** Keep `base: '/'` since BootService serves the wizard at root (`/`). Ensure all API calls use absolute paths (`/api/v1/wizard/...`).
**Warning signs:** 404 errors for JS/CSS assets in the browser console.

### Pitfall 3: Build Progress SSE Events Not Defined Yet
**What goes wrong:** The existing `WizardSSEEvents` type map does not include build/extension install progress events. The boot state machine and extension installer don't broadcast SSE events for install progress.
**Why it happens:** Phase 11 focused on auth flows. Extension install progress tracking exists in `ExtensionInstaller.getInstallState()` but isn't exposed via SSE.
**How to avoid:** This phase needs to either: (a) add new SSE event types for build progress and hook into ExtensionInstaller state changes, or (b) poll `GET /api/v1/health` for boot state and `GET /api/v1/extensions` for install state. Option (a) is preferred since SSE is already set up.
**Warning signs:** Build progress footer showing no updates.

### Pitfall 4: BootService Uses Raw http.createServer, Not Fastify
**What goes wrong:** Assuming the wizard static files can be served via Fastify static middleware. The setup page is served by a separate `http.createServer` in `BootService.serveSetupPage()` on port 8080, which is NOT the Fastify server (port 3100).
**Why it happens:** During setup state, the Fastify server handles API routes on port 3100, while a separate HTTP server handles the setup page on port 8080 (the port Railway exposes).
**How to avoid:** Modify `BootService.serveSetupPage()` to serve static files from the wizard build directory. The setup HTTP server already proxies to `/api/v1/*` -- need to add static file serving for wizard assets and forward API requests to the Fastify server.
**Warning signs:** Wizard HTML loads but JS/CSS assets return 404.

### Pitfall 5: EventSource Handler Reference Stability
**What goes wrong:** SSE hook reconnects constantly because `handlers` object changes identity on every render.
**Why it happens:** Object literal `{ 'railway:started': handleRailway, ... }` creates a new object each render, triggering useEffect cleanup and reconnect.
**How to avoid:** Memoize the handlers object with `useMemo` or define it outside the component. Use `useRef` for the handlers map so the SSE connection is stable.
**Warning signs:** Multiple SSE connections opening, flickering connected state.

### Pitfall 6: CSS Module Class Names Not Found
**What goes wrong:** TypeScript errors on `.module.css` imports because TS doesn't know the type.
**Why it happens:** TypeScript has no built-in understanding of CSS Module imports.
**How to avoid:** Vite's `react-ts` template includes a `vite-env.d.ts` that declares `*.module.css` types. Ensure this file is in place. If not, add a declaration: `declare module '*.module.css' { const classes: Record<string, string>; export default classes; }`
**Warning signs:** TS2307 "Cannot find module" errors for `.module.css` imports.

## Code Examples

### REST API Client Functions
```typescript
// supervisor/wizard/src/api/wizard.ts
const API_BASE = '/api/v1/wizard';

export interface WizardStatus {
  status: 'incomplete' | 'completed';
  steps: {
    railway: { completed: boolean; completedAt?: string; tokenStored?: boolean };
    anthropic: { completed: boolean; completedAt?: string; method?: 'api-key' | 'claude-login' };
  };
  startedAt: string;
  completedAt?: string;
}

export async function getWizardStatus(): Promise<WizardStatus> {
  const res = await fetch(`${API_BASE}/status`);
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
  return res.json();
}

export async function startRailwayLogin(): Promise<void> {
  const res = await fetch(`${API_BASE}/railway/start`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || `Railway start failed: ${res.status}`);
  }
}

export async function submitAnthropicKey(apiKey: string): Promise<void> {
  const res = await fetch(`${API_BASE}/anthropic/key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || `Key validation failed: ${res.status}`);
  }
}

export async function startClaudeLogin(): Promise<void> {
  const res = await fetch(`${API_BASE}/anthropic/login`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || `Claude login failed: ${res.status}`);
  }
}

export async function completeWizard(): Promise<void> {
  const res = await fetch(`${API_BASE}/complete`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || `Complete failed: ${res.status}`);
  }
}
```

### Horizontal Stepper Component
```typescript
// supervisor/wizard/src/components/Stepper.tsx
import styles from './Stepper.module.css';

interface Step {
  key: string;
  label: string;
  completed: boolean;
  active: boolean;
}

interface StepperProps {
  steps: Step[];
  onStepClick: (key: string) => void;
}

export function Stepper({ steps, onStepClick }: StepperProps) {
  return (
    <div className={styles.stepper}>
      {steps.map((step, i) => (
        <div key={step.key} className={styles.stepWrapper}>
          {i > 0 && <div className={`${styles.connector} ${step.completed || step.active ? styles.connectorActive : ''}`} />}
          <button
            className={`${styles.step} ${step.active ? styles.active : ''} ${step.completed ? styles.completed : ''}`}
            onClick={() => onStepClick(step.key)}
            type="button"
          >
            <span className={styles.indicator}>
              {step.completed ? '\u2713' : i + 1}
            </span>
            <span className={styles.label}>{step.label}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
```

### Build Progress Footer
```typescript
// supervisor/wizard/src/components/BuildProgress.tsx
import { useState, useEffect } from 'react';
import styles from './BuildProgress.module.css';

interface BuildProgressProps {
  status: 'installing' | 'complete' | 'error';
  currentExtension?: string;
  progress?: number;
  total?: number;
  error?: string;
  onRetry?: () => void;
}

export function BuildProgress({ status, currentExtension, progress, total, error, onRetry }: BuildProgressProps) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (status === 'complete') {
      const timer = setTimeout(() => setFadeOut(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  if (fadeOut) return null;

  return (
    <div className={`${styles.footer} ${status === 'complete' ? styles.complete : ''} ${status === 'error' ? styles.error : ''}`}>
      {status === 'installing' && (
        <>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${total ? (progress! / total) * 100 : 0}%` }} />
          </div>
          <span className={styles.text}>
            Installing {currentExtension}... ({progress}/{total})
          </span>
        </>
      )}
      {status === 'complete' && (
        <span className={styles.text}>{'\u2713'} Extensions installed</span>
      )}
      {status === 'error' && (
        <>
          <span className={styles.errorText}>{error}</span>
          <button className={styles.retryBtn} onClick={onRetry} type="button">Retry</button>
        </>
      )}
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Create React App | Vite (`npm create vite@latest`) | 2023+ | CRA deprecated, Vite is standard |
| Webpack for bundling | Vite (Rollup under hood) | 2023+ | 40x faster builds, native ESM |
| CSS-in-JS (styled-components) | CSS Modules | 2024+ trend | Zero runtime, better perf, built into Vite |
| Polling for real-time | SSE (EventSource) | Always available | Native browser API, auto-reconnect, lower overhead than WS for unidirectional |

## Open Questions

1. **Build progress SSE events**
   - What we know: `WizardSSEEvents` has auth events but no extension install progress events. `ExtensionInstaller` tracks state changes but doesn't broadcast them.
   - What's unclear: Whether to add new SSE events to the wizard routes or poll a separate endpoint.
   - Recommendation: Add SSE events (`build:progress`, `build:complete`, `build:error`) by hooking into `ExtensionInstaller` state changes from the boot sequence. This requires a small backend addition in this phase or as a prerequisite.

2. **How BootService setup server proxies to Fastify API**
   - What we know: BootService runs its own `http.createServer` on port 8080 during setup. Wizard API runs on Fastify port 3100.
   - What's unclear: Whether the setup server needs to proxy `/api/v1/*` to Fastify, or if the wizard React app can call port 3100 directly.
   - Recommendation: Proxy API requests through the setup server (port 8080) to avoid CORS issues. The setup server should forward any `/api/v1/*` request to `localhost:3100`. Alternatively, run Fastify on the same port -- but that requires architectural changes to BootService.

3. **Theme extraction from VS Code theme JSON**
   - What we know: CONTEXT.md says "CSS variables extracted from theme JSON at build time."
   - What's unclear: Which theme JSON file, what colors to extract, and the build script mechanism.
   - Recommendation: For now, hardcode the dark theme colors from the existing `setup.html` (which already uses the ClaudeOS dark palette: `#1e1e1e`, `#252526`, `#3c3c3c`, `#4a9eff`, etc.). Theme extraction can be a follow-up enhancement. The existing colors match VS Code dark theme.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (already configured for supervisor) |
| Config file | `supervisor/vitest.config.ts` (exists for backend); wizard needs its own or extends |
| Quick run command | `cd supervisor && npx vitest run test/routes/wizard.test.ts` |
| Full suite command | `cd supervisor && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SETUP-01 | Build progress footer displays extension install status from SSE events | unit | `cd supervisor/wizard && npx vitest run src/components/BuildProgress.test.tsx` | No -- Wave 0 |
| SETUP-02 | Stepper renders 3 steps, highlights active, shows checkmarks for complete | unit | `cd supervisor/wizard && npx vitest run src/components/Stepper.test.tsx` | No -- Wave 0 |
| AUTH-04 | Completed auth step shows status text and sign-out link | unit | `cd supervisor/wizard && npx vitest run src/components/RailwayStep.test.tsx` | No -- Wave 0 |
| AUTH-05 | Alternative auth methods always visible (not collapsed) | unit | `cd supervisor/wizard && npx vitest run src/components/AnthropicStep.test.tsx` | No -- Wave 0 |
| Integration | BootService serves wizard build output with correct MIME types | integration | `cd supervisor && npx vitest run test/services/boot.test.ts` | Yes (exists, needs updates) |

### Sampling Rate
- **Per task commit:** `cd supervisor && npx vitest run` (backend tests)
- **Per wave merge:** `cd supervisor && npx vitest run && cd ../wizard && npx vitest run` (if wizard tests are set up)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `supervisor/wizard/` -- entire React project scaffold (Vite, React, TS)
- [ ] `supervisor/wizard/vitest.config.ts` -- test config for React component tests (needs jsdom environment)
- [ ] `supervisor/wizard/src/components/*.test.tsx` -- component unit tests
- [ ] Backend: SSE events for build progress (currently missing from WizardSSEEvents type)

## Sources

### Primary (HIGH confidence)
- Existing codebase: `supervisor/src/routes/wizard.ts` -- all 6 wizard API endpoints
- Existing codebase: `supervisor/src/types.ts` -- WizardSSEEvents, WizardState types
- Existing codebase: `supervisor/src/services/boot.ts` -- BootService setup page serving
- Existing codebase: `supervisor/src/schemas/wizard.ts` -- Zod response schemas
- Existing codebase: `first-boot/setup.html` -- existing UI with color palette reference

### Secondary (MEDIUM confidence)
- [Vite Getting Started](https://vite.dev/guide/) -- v8 confirmed, `npm create vite@latest` template
- [Vite Features](https://vite.dev/guide/features) -- CSS Modules built-in, TypeScript support
- [React SSE patterns](https://medium.com/@dlrnjstjs/implementing-react-sse-server-sent-events-real-time-notification-system-a999bb983d1b) -- EventSource hook patterns

### Tertiary (LOW confidence)
- None -- all findings verified against codebase or official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- locked decisions in CONTEXT.md, well-known tools
- Architecture: HIGH -- backend API fully implemented and documented in code, patterns are standard React
- Pitfalls: HIGH -- identified from direct codebase analysis (BootService architecture, SSE completion guard, missing build progress events)

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable technologies, locked decisions)
