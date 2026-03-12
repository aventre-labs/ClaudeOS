import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createTestServer, closeTestServer } from "../helpers/test-server.js";
import type { FastifyInstance } from "fastify";

describe("Extensions API Routes", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer();
  });

  describe("GET /api/v1/extensions", () => {
    it("should return list of extensions", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/extensions",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe("POST /api/v1/extensions/install", () => {
    it("should accept github-release install request", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/extensions/install",
        payload: {
          method: "github-release",
          repo: "aventre-labs/claudeos-sessions",
          tag: "v0.1.0",
        },
      });

      // Should accept the request (may fail the actual install in test env)
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.name).toBeDefined();
      expect(body.method).toBe("github-release");
    });

    it("should accept local-vsix install request", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/extensions/install",
        payload: {
          method: "local-vsix",
          localPath: "/tmp/test.vsix",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.method).toBe("local-vsix");
    });

    it("should accept build-from-source install request", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/extensions/install",
        payload: {
          method: "build-from-source",
          localPath: "/tmp/extension-source",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.method).toBe("build-from-source");
    });

    it("should return 400 for invalid method", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/extensions/install",
        payload: {
          method: "invalid-method",
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
