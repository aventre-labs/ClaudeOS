import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildServer } from "./server.js";
import { BootService } from "./services/boot.js";
import { CredentialWriter } from "./services/credential-writer.js";
import { WizardStateService } from "./services/wizard-state.js";
import { SecretStore } from "./services/secret-store.js";
import type { ServerOptions, WizardState } from "./types.js";

const DEFAULT_PORT = 3100;
const DEFAULT_PUBLIC_PORT = 8080;
const DEFAULT_DATA_DIR = "/data";

/**
 * Boot sequence — exported for testing.
 *
 * 1. Start Fastify on the supervisor port (3100) — always first, so wizard
 *    API calls can be proxied to it.
 * 2. If not configured, serve the setup wizard on the public port (8080)
 *    and block until the user completes setup.
 * 3. Install extensions and start code-server on the public port (8080).
 */
export async function boot(options: ServerOptions): Promise<void> {
  const { dataDir, isDryRun } = options;
  const supervisorPort = options.port ?? DEFAULT_PORT;
  const publicPort = Number(process.env.CLAUDEOS_PUBLIC_PORT) || DEFAULT_PUBLIC_PORT;

  // Build and start the Fastify server first (so wizard API proxy works)
  const server = await buildServer({
    dataDir,
    isDryRun,
    port: supervisorPort,
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    server.log.info(`Received ${signal}, shutting down...`);
    await server.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await server.listen({ port: supervisorPort, host: "0.0.0.0" });
  server.log.info(`Supervisor API listening on :${supervisorPort}`);

  if (isDryRun) {
    server.log.info("Dry run mode -- server ready but not starting boot sequence");
    return;
  }

  const bootService = (server as unknown as { bootService: BootService }).bootService;

  // Determine boot path: wizard or fast-path
  let wizardCompleted = false;

  if (!bootService.isConfigured()) {
    // First boot: serve wizard on the public port (8080).
    // The wizard proxies /api/v1/* to Fastify on the supervisor port.
    await bootService.serveSetupPage(publicPort);
    // Wizard resolved — POST /wizard/launch already started code-server
    // and installed extensions via the wizard flow. Nothing more to do.
    return;
  }

  // Configured: check for completed wizard → fast-path
  const wizardStatePath = join(dataDir, "config", "wizard-state.json");
  if (existsSync(wizardStatePath)) {
    try {
      const raw = readFileSync(wizardStatePath, "utf-8");
      const state = JSON.parse(raw) as WizardState;
      if (state.status === "completed") {
        wizardCompleted = true;
        // Re-write credentials from SecretStore on every restart
        const secretStore = SecretStore.tryCreate(dataDir);
        if (secretStore) {
          const wizardState = WizardStateService.create(wizardStatePath);
          const credentialWriter = new CredentialWriter();
          await credentialWriter.writeAll(secretStore, wizardState);
          console.log("[boot] Fast-path: credentials written from SecretStore");
        }
      }
    } catch {
      // Corrupted wizard state — fall through to normal boot
    }
  }

  // Post-server boot: install extensions and start code-server
  await bootService.installExtensions();
  await bootService.startCodeServer(
    wizardCompleted ? { auth: "none", port: publicPort } : { port: publicPort },
  );
}

async function main(): Promise<void> {
  const isDryRun = process.argv.includes("--dry-run");
  const dataDir = process.env.CLAUDEOS_DATA_DIR ?? DEFAULT_DATA_DIR;
  const port = Number(process.env.CLAUDEOS_PORT) || DEFAULT_PORT;

  try {
    await boot({ dataDir, isDryRun, port });
  } catch (err) {
    console.error("Fatal error starting supervisor:", err);
    process.exit(1);
  }
}

// Only run main() when executed directly (not imported for testing)
if (process.env.VITEST === undefined) {
  main().catch((err) => {
    console.error("Fatal error starting supervisor:", err);
    process.exit(1);
  });
}
