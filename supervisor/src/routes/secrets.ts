// ============================================================
// ClaudeOS Supervisor - Secrets API Routes
// ============================================================
// CRUD operations for encrypted secrets under /api/v1/secrets.
// Routes are always registered; returns 503 when SecretStore
// cannot initialize (no auth.json yet).
// ============================================================

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  CreateSecretSchema,
  UpdateSecretSchema,
  SecretResponseSchema,
  SecretValueResponseSchema,
  SecretListResponseSchema,
} from "../schemas/secret.js";
import { ErrorResponseSchema } from "../schemas/common.js";
import { SecretStore } from "../services/secret-store.js";

const NameParamSchema = z.object({
  name: z.string(),
});

const UnavailableResponseSchema = z.object({
  error: z.string(),
  statusCode: z.literal(503),
});

export interface SecretRouteOptions {
  dataDir: string;
}

export async function secretRoutes(
  server: FastifyInstance,
  options: SecretRouteOptions,
): Promise<void> {
  let cachedStore: SecretStore | null = null;

  function getStore(): SecretStore | null {
    if (!cachedStore) {
      cachedStore = SecretStore.tryCreate(options.dataDir);
    }
    return cachedStore;
  }

  function unavailable(reply: { status: (code: number) => { send: (body: unknown) => unknown } }) {
    return reply.status(503).send({
      error: "Secrets unavailable — complete first-boot setup",
      statusCode: 503,
    });
  }

  // POST /api/v1/secrets - Create a secret
  server.post(
    "/secrets",
    {
      schema: {
        body: CreateSecretSchema,
        response: {
          201: SecretResponseSchema,
          400: ErrorResponseSchema,
          503: UnavailableResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const secretStore = getStore();
      if (!secretStore) return unavailable(reply);

      const { name, value, category, tags } = request.body as {
        name: string;
        value: string;
        category?: string;
        tags?: string[];
      };

      await secretStore.set(name, value, category, tags);
      const secrets = await secretStore.list();
      const created = secrets.find((s) => s.name === name);

      return reply.status(201).send(created);
    },
  );

  // GET /api/v1/secrets - List secrets (no values)
  server.get(
    "/secrets",
    {
      schema: {
        response: {
          200: SecretListResponseSchema,
          503: UnavailableResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const secretStore = getStore();
      if (!secretStore) return unavailable(reply);

      return secretStore.list();
    },
  );

  // GET /api/v1/secrets/:name - Get secret value
  server.get(
    "/secrets/:name",
    {
      schema: {
        params: NameParamSchema,
        response: {
          200: SecretValueResponseSchema,
          404: ErrorResponseSchema,
          503: UnavailableResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const secretStore = getStore();
      if (!secretStore) return unavailable(reply);

      const { name } = request.params as { name: string };

      const exists = await secretStore.has(name);
      if (!exists) {
        return reply.status(404).send({
          error: `Secret "${name}" not found`,
          statusCode: 404,
        });
      }

      const value = await secretStore.get(name);
      return { name, value };
    },
  );

  // PUT /api/v1/secrets/:name - Update secret
  server.put(
    "/secrets/:name",
    {
      schema: {
        params: NameParamSchema,
        body: UpdateSecretSchema,
        response: {
          200: SecretResponseSchema,
          404: ErrorResponseSchema,
          503: UnavailableResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const secretStore = getStore();
      if (!secretStore) return unavailable(reply);

      const { name } = request.params as { name: string };
      const { value, category, tags } = request.body as {
        value?: string;
        category?: string;
        tags?: string[];
      };

      const exists = await secretStore.has(name);
      if (!exists) {
        return reply.status(404).send({
          error: `Secret "${name}" not found`,
          statusCode: 404,
        });
      }

      // Get existing value if not updating it
      const currentValue = value ?? (await secretStore.get(name));

      // Get current metadata
      const secrets = await secretStore.list();
      const current = secrets.find((s) => s.name === name);

      await secretStore.set(
        name,
        currentValue,
        category ?? current?.category,
        tags ?? current?.tags,
      );

      const updatedSecrets = await secretStore.list();
      const updated = updatedSecrets.find((s) => s.name === name);
      return updated;
    },
  );

  // DELETE /api/v1/secrets/:name - Delete secret
  server.delete(
    "/secrets/:name",
    {
      schema: {
        params: NameParamSchema,
        response: {
          200: z.object({ success: z.boolean() }),
          404: ErrorResponseSchema,
          503: UnavailableResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const secretStore = getStore();
      if (!secretStore) return unavailable(reply);

      const { name } = request.params as { name: string };

      const exists = await secretStore.has(name);
      if (!exists) {
        return reply.status(404).send({
          error: `Secret "${name}" not found`,
          statusCode: 404,
        });
      }

      await secretStore.delete(name);
      return { success: true };
    },
  );
}
