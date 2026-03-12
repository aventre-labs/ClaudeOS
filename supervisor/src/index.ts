import { buildServer } from "./server.js";

const DEFAULT_PORT = 3100;
const DEFAULT_DATA_DIR = "/data";

async function main(): Promise<void> {
  const isDryRun = process.argv.includes("--dry-run");
  const dataDir = process.env.CLAUDEOS_DATA_DIR ?? DEFAULT_DATA_DIR;
  const port = Number(process.env.CLAUDEOS_PORT) || DEFAULT_PORT;

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

  try {
    await server.listen({ port, host: "0.0.0.0" });
    server.log.info(`Supervisor API listening on :${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error starting supervisor:", err);
  process.exit(1);
});
