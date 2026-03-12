import type { FastifyInstance } from "fastify";
import { HealthResponseSchema } from "../schemas/common.js";
import type { BootState } from "../types.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

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
        version: pkg.version,
        uptime: process.uptime(),
      };
    },
  );
}
