import type { FastifyInstance } from "fastify";
import { HealthResponseSchema } from "../schemas/common.js";
import type { BootState } from "../types.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let version = "0.1.0";
try {
  // Works in dev (ESM via tsx) - resolve relative to source file
  const dir = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(resolve(dir, "../../package.json"), "utf-8"));
  version = pkg.version;
} catch {
  // In CJS bundle, import.meta.url is undefined - use fallback
}

export interface HealthRouteOptions {
  getBootState: () => BootState;
}

export async function healthRoutes(
  server: FastifyInstance,
  options: HealthRouteOptions,
): Promise<void> {
  server.get(
    "/health",
    {
      schema: {
        response: {
          200: HealthResponseSchema,
        },
      },
    },
    async (_request, _reply) => {
      return {
        status: options.getBootState(),
        version,
        uptime: process.uptime(),
      };
    },
  );
}
