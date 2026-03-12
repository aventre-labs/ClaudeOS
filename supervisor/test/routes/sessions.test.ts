import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestServer, closeTestServer } from "../helpers/test-server.js";

describe("Session Routes", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer();
  });

  describe("POST /api/v1/sessions", () => {
    it("returns 201 with session data", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/sessions",
        payload: { name: "test-session" },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toBeDefined();
      expect(body.name).toBe("test-session");
      expect(body.status).toBe("active");
      expect(body.createdAt).toBeDefined();
    });

    it("creates session with defaults when no body provided", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/sessions",
        payload: {},
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toMatch(/^ses_/);
      expect(body.status).toBe("active");
    });

    it("accepts model and flags", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/sessions",
        payload: { model: "opus", flags: ["--verbose"] },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.model).toBe("opus");
      expect(body.flags).toEqual(["--verbose"]);
    });
  });

  describe("GET /api/v1/sessions", () => {
    it("returns array of sessions", async () => {
      // Create a session first
      await server.inject({
        method: "POST",
        url: "/api/v1/sessions",
        payload: { name: "list-test" },
      });

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/sessions",
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
    });
  });

  describe("GET /api/v1/sessions/:id", () => {
    it("returns session when found", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/api/v1/sessions",
        payload: { name: "get-test" },
      });
      const session = createRes.json();

      const response = await server.inject({
        method: "GET",
        url: `/api/v1/sessions/${session.id}`,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().id).toBe(session.id);
    });

    it("returns 404 for non-existent session", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/sessions/ses_nonexistent",
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("PATCH /api/v1/sessions/:id", () => {
    it("returns 200 with updated session on rename", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/api/v1/sessions",
        payload: { name: "original-name" },
      });
      const session = createRes.json();

      const response = await server.inject({
        method: "PATCH",
        url: `/api/v1/sessions/${session.id}`,
        payload: { name: "renamed-session" },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.name).toBe("renamed-session");
      expect(body.id).toBe(session.id);
    });

    it("returns 404 for non-existent session", async () => {
      const response = await server.inject({
        method: "PATCH",
        url: "/api/v1/sessions/ses_nonexistent",
        payload: { name: "new-name" },
      });
      expect(response.statusCode).toBe(404);
    });

    it("returns 400 for empty name", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/api/v1/sessions",
        payload: { name: "test" },
      });
      const session = createRes.json();

      const response = await server.inject({
        method: "PATCH",
        url: `/api/v1/sessions/${session.id}`,
        payload: { name: "" },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/v1/sessions/:id/stop", () => {
    it("returns 200 on success", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/api/v1/sessions",
        payload: {},
      });
      const session = createRes.json();

      const response = await server.inject({
        method: "POST",
        url: `/api/v1/sessions/${session.id}/stop`,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
    });

    it("returns 404 for non-existent session", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/sessions/ses_nonexistent/stop",
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/v1/sessions/:id", () => {
    it("returns 200 with scrollback on success", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/api/v1/sessions",
        payload: {},
      });
      const session = createRes.json();

      const response = await server.inject({
        method: "DELETE",
        url: `/api/v1/sessions/${session.id}`,
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(typeof body.scrollback).toBe("string");
    });

    it("returns 404 for non-existent session", async () => {
      const response = await server.inject({
        method: "DELETE",
        url: "/api/v1/sessions/ses_nonexistent",
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /api/v1/sessions/:id/input", () => {
    it("returns 200 on success", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/api/v1/sessions",
        payload: {},
      });
      const session = createRes.json();

      const response = await server.inject({
        method: "POST",
        url: `/api/v1/sessions/${session.id}/input`,
        payload: { text: "hello world" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
    });

    it("returns 400 for missing text", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/api/v1/sessions",
        payload: {},
      });
      const session = createRes.json();

      const response = await server.inject({
        method: "POST",
        url: `/api/v1/sessions/${session.id}/input`,
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });

    it("returns 404 for non-existent session", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/sessions/ses_nonexistent/input",
        payload: { text: "hello" },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("GET /api/v1/sessions/:id/output", () => {
    it("returns 200 with captured output", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/api/v1/sessions",
        payload: {},
      });
      const session = createRes.json();

      const response = await server.inject({
        method: "GET",
        url: `/api/v1/sessions/${session.id}/output`,
      });
      expect(response.statusCode).toBe(200);
      expect(typeof response.json().output).toBe("string");
    });

    it("returns 404 for non-existent session", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/sessions/ses_nonexistent/output",
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /api/v1/sessions/:id/archive", () => {
    it("returns 200 on success", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/api/v1/sessions",
        payload: {},
      });
      const session = createRes.json();

      const response = await server.inject({
        method: "POST",
        url: `/api/v1/sessions/${session.id}/archive`,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
    });

    it("returns 404 for non-existent session", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/sessions/ses_nonexistent/archive",
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /api/v1/sessions/:id/revive", () => {
    it("returns 201 with new session on success", async () => {
      // Create and archive first
      const createRes = await server.inject({
        method: "POST",
        url: "/api/v1/sessions",
        payload: { name: "revive-test" },
      });
      const session = createRes.json();

      await server.inject({
        method: "POST",
        url: `/api/v1/sessions/${session.id}/archive`,
      });

      const response = await server.inject({
        method: "POST",
        url: `/api/v1/sessions/${session.id}/revive`,
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toBeDefined();
      expect(body.status).toBe("active");
    });

    it("returns 404 for non-existent session", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/sessions/ses_nonexistent/revive",
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /internal/session-event", () => {
    it("returns 200 for valid event", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/api/v1/sessions",
        payload: {},
      });
      const session = createRes.json();

      const response = await server.inject({
        method: "POST",
        url: "/internal/session-event",
        payload: { sessionId: session.id, event: "exited" },
      });
      expect(response.statusCode).toBe(200);
    });
  });
});
