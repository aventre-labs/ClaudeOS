// ============================================================
// ClaudeOS Supervisor - Config API Routes
// ============================================================
// Configuration endpoints under /api/v1/config.
// Includes environment variable injection via tmux.
// ============================================================

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { ErrorResponseSchema } from "../schemas/common.js";
import type { ITmuxService } from "../services/tmux.js";

const SetEnvSchema = z.object({
  key: z.string().regex(/^[A-Z_][A-Z0-9_]*$/, "Key must be uppercase with underscores (e.g. MY_VAR)"),
  value: z.string(),
});

export interface ConfigRouteOptions {
  tmuxService: ITmuxService;
}

export async function configRoutes(
  server: FastifyInstance,
  options: ConfigRouteOptions,
): Promise<void> {
  const { tmuxService } = options;

  // POST /api/v1/config/env - Set a tmux global environment variable
  server.post(
    "/config/env",
    {
      schema: {
        body: SetEnvSchema,
        response: {
          200: z.object({ success: z.boolean() }),
          400: ErrorResponseSchema,
        },
      },
    },
    async (request, _reply) => {
      const { key, value } = request.body as { key: string; value: string };
      await tmuxService.setEnvironment(key, value);
      return { success: true };
    },
  );
}
