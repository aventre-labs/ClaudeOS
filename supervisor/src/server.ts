import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { BootState, ServerOptions } from "./types.js";
import { healthRoutes } from "./routes/health.js";

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

  // Register routes under /api/v1 prefix
  await server.register(healthRoutes, {
    prefix: "/api/v1",
    getBootState: () => bootState,
  });

  return server;
}
