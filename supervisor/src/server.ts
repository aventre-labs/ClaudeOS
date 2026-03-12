import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { BootState, ServerOptions } from "./types.js";
import { healthRoutes } from "./routes/health.js";
import { secretRoutes } from "./routes/secrets.js";
import { extensionRoutes } from "./routes/extensions.js";
import { settingsRoutes } from "./routes/settings.js";
import { SecretStore } from "./services/secret-store.js";
import { ExtensionInstaller } from "./services/extension-installer.js";
import { SettingsStore } from "./services/settings-store.js";

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

  // In dry-run mode, ensure auth.json exists with a generated key for testing
  const authPath = join(configDir, "auth.json");
  if (options.isDryRun && !existsSync(authPath)) {
    const testKey = randomBytes(32).toString("hex");
    writeFileSync(
      authPath,
      JSON.stringify({ encryptionKey: testKey }),
    );
  }

  // Create service instances
  const secretStore = existsSync(authPath)
    ? new SecretStore(options.dataDir)
    : null;
  const extensionInstaller = new ExtensionInstaller(options.dataDir);
  const settingsStore = new SettingsStore(options.dataDir);

  // Register routes under /api/v1 prefix
  await server.register(healthRoutes, {
    prefix: "/api/v1",
    getBootState: () => bootState,
  });

  if (secretStore) {
    await server.register(secretRoutes, {
      prefix: "/api/v1",
      secretStore,
    });
  }

  await server.register(extensionRoutes, {
    prefix: "/api/v1",
    extensionInstaller,
  });

  await server.register(settingsRoutes, {
    prefix: "/api/v1",
    settingsStore,
  });

  // Decorate with service references for boot service access
  server.decorate("secretStore", secretStore);
  server.decorate("extensionInstaller", extensionInstaller);
  server.decorate("settingsStore", settingsStore);

  return server;
}
