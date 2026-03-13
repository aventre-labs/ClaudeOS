import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestServer, closeTestServer } from "../helpers/test-server.js";
import type { FastifyInstance } from "fastify";

describe("Config API Routes", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer();
  });

  describe("POST /api/v1/config/env", () => {
    it("should set environment variable and return success", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/config/env",
        payload: {
          key: "ANTHROPIC_API_KEY",
          value: "sk-ant-12345",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
    });

    it("should return 400 for missing key", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/config/env",
        payload: {
          value: "some-value",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 400 for missing value", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/config/env",
        payload: {
          key: "SOME_KEY",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 400 for invalid key format", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/config/env",
        payload: {
          key: "invalid-key",
          value: "some-value",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should accept keys starting with underscore", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/config/env",
        payload: {
          key: "_MY_VAR",
          value: "test",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
    });
  });
});
