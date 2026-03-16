import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildServer } from "./server.js";
import { BootService } from "./services/boot.js";
import { ExtensionInstaller } from "./services/extension-installer.js";
import { CredentialWriter } from "./services/credential-writer.js";
import { WizardStateService } from "./services/wizard-state.js";
import { SecretStore } from "./services/secret-store.js";
import type { ServerOptions, WizardState } from "./types.js";

const DEFAULT_PORT = 3100;
const DEFAULT_DATA_DIR = "/data";

/**
 * Boot sequence — exported for testing.
 * Handles pre-server setup (first-boot) and post-server boot (extensions + code-server).
 */
export async function boot(options: ServerOptions): Promise<void> {
  const { dataDir, isDryRun } = options;
  const port = options.port ?? DEFAULT_PORT;

  // Pre-server boot: first-boot detection, wizard fast-path, and setup page
  let wizardCompleted = false;
  if (!isDryRun) {
    const extensionInstaller = new ExtensionInstaller(dataDir);
    const bootService = new BootService({
      dataDir,
      extensionInstaller,
      setBootState: () => {},
      logger: console,
    });

    if (!bootService.isConfigured()) {
      await bootService.serveSetupPage(port);
    } else {
      // Check for completed wizard -> fast-path (skip wizard UI)
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
    }
  }

  // Build and start the server
  const server = await buildServer({
    dataDir,
    isDryRun,
    port,
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    server.log.info(`Received ${signal}, shutting down...`);
    await server.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  if (isDryRun) {
    server.log.info("Dry run mode -- server ready but not starting boot sequence");
  }

  await server.listen({ port, host: "0.0.0.0" });
  server.log.info(`Supervisor API listening on :${port}`);

  // Post-server boot: install extensions and start code-server
  // Uses the BootService instance from buildServer (shared with wizard routes)
  if (!isDryRun) {
    const bootService = (server as unknown as { bootService: BootService }).bootService;

    await bootService.installExtensions();
    await bootService.startCodeServer(
      wizardCompleted ? { auth: "none" } : undefined,
    );
  }
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
