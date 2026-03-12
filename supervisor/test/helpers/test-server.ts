import { buildServer } from "../../src/server.js";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";

let server: FastifyInstance | null = null;

export async function createTestServer(): Promise<FastifyInstance> {
  const dataDir = mkdtempSync(join(tmpdir(), "claudeos-test-"));
  server = await buildServer({
    dataDir,
    isDryRun: true,
    port: 0,
  });
  return server;
}

export async function closeTestServer(): Promise<void> {
  if (server) {
    await server.close();
    server = null;
  }
}
