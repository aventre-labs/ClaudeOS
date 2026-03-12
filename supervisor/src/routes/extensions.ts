// ============================================================
// ClaudeOS Supervisor - Extensions API Routes
// ============================================================
// Extension install/list routes under /api/v1/extensions
// ============================================================

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  InstallExtensionSchema,
  ExtensionResponseSchema,
  ExtensionListResponseSchema,
} from "../schemas/extension.js";
import { ErrorResponseSchema } from "../schemas/common.js";
import type { ExtensionInstaller } from "../services/extension-installer.js";

export interface ExtensionRouteOptions {
  extensionInstaller: ExtensionInstaller;
}

export async function extensionRoutes(
  server: FastifyInstance,
  options: ExtensionRouteOptions,
): Promise<void> {
  const { extensionInstaller } = options;

  // POST /api/v1/extensions/install - Install extension
  server.post(
    "/extensions/install",
    {
      schema: {
        body: InstallExtensionSchema,
        response: {
          200: ExtensionResponseSchema,
          400: ErrorResponseSchema,
        },
      },
    },
    async (request, _reply) => {
      const body = request.body as {
        method: string;
        repo?: string;
        tag?: string;
        localPath?: string;
      };

      switch (body.method) {
        case "github-release":
          await extensionInstaller.installFromGitHub(body.repo!, body.tag!);
          break;
        case "build-from-source":
          await extensionInstaller.installFromSource(body.localPath!);
          break;
        case "local-vsix":
          await extensionInstaller.installFromVsix(body.localPath!);
          break;
      }

      // Return the most recently added extension record
      const state = extensionInstaller.getInstallState();
      const latest = state[state.length - 1];
      return latest;
    },
  );

  // GET /api/v1/extensions - List installed extensions
  server.get(
    "/extensions",
    {
      schema: {
        response: {
          200: ExtensionListResponseSchema,
        },
      },
    },
    async (_request, _reply) => {
      return extensionInstaller.getInstallState();
    },
  );

  // DELETE /api/v1/extensions/:id - Uninstall extension (future use)
  server.delete(
    "/extensions/:id",
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: {
          200: z.object({ success: z.boolean() }),
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Future: implement uninstall
      return reply.status(404).send({
        error: `Extension uninstall not yet implemented for: ${id}`,
        statusCode: 404,
      });
    },
  );
}
