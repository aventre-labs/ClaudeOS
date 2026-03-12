// ============================================================
// ClaudeOS Supervisor - Settings API Routes
// ============================================================
// Settings read/update routes under /api/v1/settings
// ============================================================

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { SettingsStore } from "../services/settings-store.js";

const SettingsResponseSchema = z.object({
  reloadBehavior: z.enum(["force", "notification"]),
  logLevel: z.enum(["debug", "info", "warn", "error"]),
  sessionDefaults: z.object({
    model: z.string().optional(),
    flags: z.array(z.string()).optional(),
    workdir: z.string().optional(),
  }),
});

const UpdateSettingsSchema = z.object({
  reloadBehavior: z.enum(["force", "notification"]).optional(),
  logLevel: z.enum(["debug", "info", "warn", "error"]).optional(),
  sessionDefaults: z
    .object({
      model: z.string().optional(),
      flags: z.array(z.string()).optional(),
      workdir: z.string().optional(),
    })
    .optional(),
});

export interface SettingsRouteOptions {
  settingsStore: SettingsStore;
}

export async function settingsRoutes(
  server: FastifyInstance,
  options: SettingsRouteOptions,
): Promise<void> {
  const { settingsStore } = options;

  // GET /api/v1/settings - Get current settings
  server.get(
    "/settings",
    {
      schema: {
        response: {
          200: SettingsResponseSchema,
        },
      },
    },
    async (_request, _reply) => {
      return settingsStore.get();
    },
  );

  // PUT /api/v1/settings - Update settings
  server.put(
    "/settings",
    {
      schema: {
        body: UpdateSettingsSchema,
        response: {
          200: SettingsResponseSchema,
        },
      },
    },
    async (request, _reply) => {
      const updates = request.body as {
        reloadBehavior?: "force" | "notification";
        logLevel?: "debug" | "info" | "warn" | "error";
        sessionDefaults?: { model?: string; flags?: string[]; workdir?: string };
      };

      return settingsStore.update(updates);
    },
  );
}
