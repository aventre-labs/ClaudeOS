import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { BootState, ServerOptions } from "./types.js";
import { healthRoutes } from "./routes/health.js";
import { sessionRoutes, internalRoutes } from "./routes/sessions.js";
import { secretRoutes } from "./routes/secrets.js";
import { extensionRoutes } from "./routes/extensions.js";
import { settingsRoutes } from "./routes/settings.js";
import { configRoutes } from "./routes/config.js";
import { wizardRoutes } from "./routes/wizard.js";
import { WizardStateService } from "./services/wizard-state.js";
import { RailwayAuthService } from "./services/auth-railway.js";
import { AnthropicAuthService } from "./services/auth-anthropic.js";
import { TmuxService, DryRunTmuxService } from "./services/tmux.js";
import { SessionManager } from "./services/session-manager.js";
import { ExtensionInstaller } from "./services/extension-installer.js";
import { SecretStore } from "./services/secret-store.js";
import { SettingsStore } from "./services/settings-store.js";
import { broadcastStatus } from "./ws/handler.js";
import { wsHandler } from "./ws/handler.js";
import websocket from "@fastify/websocket";

export async function buildServer(options: ServerOptions) {
  const server = Fastify({
    logger: {
      level: options.isDryRun ? "warn" : "info",
    },
  });

  // Set up Zod type provider
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  // Shared mutable boot state
  let bootState: BootState = "initializing";

  // Expose boot state getter/setter via decorators
  server.decorate("getBootState", () => bootState);
  server.decorate("setBootState", (state: BootState) => {
    bootState = state;
  });

  // Ensure data directories exist
  const configDir = join(options.dataDir, "config");
  const secretsDir = join(options.dataDir, "secrets");
  const extensionsDir = join(options.dataDir, "extensions");
  mkdirSync(configDir, { recursive: true });
  mkdirSync(secretsDir, { recursive: true });
  mkdirSync(extensionsDir, { recursive: true });

  // In dry-run mode, ensure CLAUDEOS_AUTH_TOKEN is set for SecretStore
  if (options.isDryRun && !process.env.CLAUDEOS_AUTH_TOKEN) {
    process.env.CLAUDEOS_AUTH_TOKEN = randomBytes(32).toString("hex");
  }

  // Ensure sessions directory exists
  const sessionsDir = join(options.dataDir, "sessions");
  mkdirSync(sessionsDir, { recursive: true });

  // Create session management services
  // In dry-run mode, use no-op stub to avoid requiring tmux binary
  const tmuxService = options.isDryRun
    ? new DryRunTmuxService()
    : new TmuxService();
  const port = options.port ?? 3100;
  const sessionManager = new SessionManager(
    options.dataDir,
    tmuxService,
    (sessionId, status) => broadcastStatus(sessionId, status),
    port,
  );

  // Create wizard services
  const wizardStatePath = join(options.dataDir, "config", "wizard-state.json");
  const wizardState = WizardStateService.create(wizardStatePath);
  const railwayAuth = new RailwayAuthService();
  const anthropicAuth = new AnthropicAuthService();

  // Create service instances
  const extensionInstaller = new ExtensionInstaller(options.dataDir);
  const settingsStore = new SettingsStore(options.dataDir);

  // Register WebSocket support
  await server.register(websocket);

  // Register wizard routes (before other routes for scoped rate limiting)
  await server.register(wizardRoutes, {
    prefix: "/api/v1",
    wizardState,
    railwayAuth,
    anthropicAuth,
    secretStore: SecretStore.tryCreate(options.dataDir),
  });

  // Register routes under /api/v1 prefix
  await server.register(healthRoutes, {
    prefix: "/api/v1",
    getBootState: () => bootState,
  });

  await server.register(sessionRoutes, {
    prefix: "/api/v1",
    sessionManager,
  });

  // Register WebSocket handler under /api/v1
  await server.register(wsHandler, {
    prefix: "/api/v1",
  });

  // Register internal routes (tmux hook callbacks)
  await server.register(internalRoutes, {
    prefix: "/internal",
    sessionManager,
  });

  await server.register(secretRoutes, {
    prefix: "/api/v1",
    dataDir: options.dataDir,
  });

  // Lazy SecretStore for resolving PAT secrets during extension install
  let cachedSecretStore: SecretStore | null | undefined;
  const resolveSecret = async (name: string): Promise<string | undefined> => {
    if (cachedSecretStore === undefined) {
      cachedSecretStore = SecretStore.tryCreate(options.dataDir);
    }
    if (!cachedSecretStore) return undefined;
    try {
      return await cachedSecretStore.get(name);
    } catch {
      return undefined;
    }
  };

  await server.register(extensionRoutes, {
    prefix: "/api/v1",
    extensionInstaller,
    resolveSecret,
  });

  await server.register(settingsRoutes, {
    prefix: "/api/v1",
    settingsStore,
  });

  await server.register(configRoutes, {
    prefix: "/api/v1",
    tmuxService,
  });

  // Decorate with service references for boot service access
  server.decorate("sessionManager", sessionManager);
  server.decorate("extensionInstaller", extensionInstaller);
  server.decorate("settingsStore", settingsStore);

  return server;
}
