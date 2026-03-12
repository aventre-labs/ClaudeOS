// ============================================================
// ClaudeOS Supervisor - Session Routes
// ============================================================
// REST API for session lifecycle management.
// All routes under /api/v1/sessions prefix.
// ============================================================

import type { FastifyInstance } from "fastify";
import type { SessionManager } from "../services/session-manager.js";
import {
  CreateSessionSchema,
  SessionResponseSchema,
  SessionListResponseSchema,
  SendInputSchema,
  UpdateSessionSchema,
} from "../schemas/session.js";
import { ErrorResponseSchema } from "../schemas/common.js";
import { z } from "zod";

export interface SessionRouteOptions {
  sessionManager: SessionManager;
}

export async function sessionRoutes(
  server: FastifyInstance,
  options: SessionRouteOptions,
): Promise<void> {
  const { sessionManager } = options;

  // POST /sessions -- Create a new session
  server.post(
    "/sessions",
    {
      schema: {
        body: CreateSessionSchema,
        response: {
          201: SessionResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as z.infer<typeof CreateSessionSchema>;
      const session = await sessionManager.create(body);
      return reply.status(201).send(session);
    },
  );

  // GET /sessions -- List all sessions
  server.get(
    "/sessions",
    {
      schema: {
        response: {
          200: SessionListResponseSchema,
        },
      },
    },
    async (_request, _reply) => {
      return sessionManager.list();
    },
  );

  // GET /sessions/:id -- Get single session
  server.get(
    "/sessions/:id",
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: {
          200: SessionResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const session = sessionManager.getSession(id);
      if (!session) {
        return reply.status(404).send({ error: "Session not found", statusCode: 404 });
      }
      return session;
    },
  );

  // PATCH /sessions/:id -- Update session (rename)
  server.patch(
    "/sessions/:id",
    {
      schema: {
        params: z.object({ id: z.string() }),
        body: UpdateSessionSchema,
        response: {
          200: SessionResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const session = sessionManager.getSession(id);
      if (!session) {
        return reply.status(404).send({ error: "Session not found", statusCode: 404 });
      }
      const body = request.body as z.infer<typeof UpdateSessionSchema>;
      if (body.name) {
        const updated = sessionManager.rename(id, body.name);
        return updated;
      }
      return session;
    },
  );

  // POST /sessions/:id/stop -- Stop session
  server.post(
    "/sessions/:id/stop",
    {
      schema: {
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const session = sessionManager.getSession(id);
      if (!session) {
        return reply.status(404).send({ error: "Session not found", statusCode: 404 });
      }
      await sessionManager.stop(id);
      return { success: true };
    },
  );

  // DELETE /sessions/:id -- Kill session (captures scrollback)
  server.delete(
    "/sessions/:id",
    {
      schema: {
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const session = sessionManager.getSession(id);
      if (!session) {
        return reply.status(404).send({ error: "Session not found", statusCode: 404 });
      }
      const scrollback = await sessionManager.kill(id);
      return { success: true, scrollback };
    },
  );

  // POST /sessions/:id/input -- Send input to session
  server.post(
    "/sessions/:id/input",
    {
      schema: {
        params: z.object({ id: z.string() }),
        body: SendInputSchema,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const session = sessionManager.getSession(id);
      if (!session) {
        return reply.status(404).send({ error: "Session not found", statusCode: 404 });
      }
      const { text } = request.body as { text: string };
      await sessionManager.sendInput(id, text);
      return { success: true };
    },
  );

  // GET /sessions/:id/output -- Capture output from session
  server.get(
    "/sessions/:id/output",
    {
      schema: {
        params: z.object({ id: z.string() }),
        querystring: z.object({
          scrollback: z.coerce.boolean().optional().default(false),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const session = sessionManager.getSession(id);
      if (!session) {
        return reply.status(404).send({ error: "Session not found", statusCode: 404 });
      }
      const { scrollback } = request.query as { scrollback: boolean };
      const output = await sessionManager.captureOutput(id, scrollback);
      return { output };
    },
  );

  // POST /sessions/:id/archive -- Archive session
  server.post(
    "/sessions/:id/archive",
    {
      schema: {
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const session = sessionManager.getSession(id);
      if (!session) {
        return reply.status(404).send({ error: "Session not found", statusCode: 404 });
      }
      await sessionManager.archive(id);
      return { success: true };
    },
  );

  // POST /sessions/:id/revive -- Revive archived session
  server.post(
    "/sessions/:id/revive",
    {
      schema: {
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const session = sessionManager.getSession(id);
      if (!session) {
        return reply.status(404).send({ error: "Session not found", statusCode: 404 });
      }
      const revived = await sessionManager.revive(id);
      return reply.status(201).send(revived);
    },
  );
}

/**
 * Internal session-event route for tmux hook callbacks.
 * NOT under /api/v1 -- registered at /internal/session-event.
 */
export async function internalRoutes(
  server: FastifyInstance,
  options: SessionRouteOptions,
): Promise<void> {
  const { sessionManager } = options;

  server.post(
    "/session-event",
    {
      schema: {
        body: z.object({
          sessionId: z.string(),
          event: z.string(),
        }),
      },
    },
    async (request, _reply) => {
      const { sessionId, event } = request.body as {
        sessionId: string;
        event: string;
      };
      sessionManager.handleSessionEvent(sessionId, event);
      return { success: true };
    },
  );
}
