import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestServer, closeTestServer } from "../helpers/test-server.js";
import type { FastifyInstance } from "fastify";

describe("Secrets API Routes", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer();
  });

  describe("POST /api/v1/secrets", () => {
    it("should create a secret and return 201", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/secrets",
        payload: {
          name: "api-key",
          value: "sk-12345",
          category: "api",
          tags: ["openai"],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.name).toBe("api-key");
      expect(body.category).toBe("api");
      expect(body.tags).toEqual(["openai"]);
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();
      // Must NOT include the value in response
      expect(body.value).toBeUndefined();
      expect(body.encrypted).toBeUndefined();
    });

    it("should return 400 for missing name", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/secrets",
        payload: { value: "something" },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /api/v1/secrets", () => {
    it("should list secrets without values", async () => {
      // Create a secret first
      await server.inject({
        method: "POST",
        url: "/api/v1/secrets",
        payload: { name: "list-test", value: "secret-val" },
      });

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/secrets",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);

      // Verify no values exposed
      for (const secret of body) {
        expect(secret.value).toBeUndefined();
        expect(secret.encrypted).toBeUndefined();
        expect(secret.iv).toBeUndefined();
        expect(secret.authTag).toBeUndefined();
      }
    });
  });

  describe("GET /api/v1/secrets/:name", () => {
    it("should return secret value", async () => {
      await server.inject({
        method: "POST",
        url: "/api/v1/secrets",
        payload: { name: "get-test", value: "my-secret" },
      });

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/secrets/get-test",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.name).toBe("get-test");
      expect(body.value).toBe("my-secret");
    });

    it("should return 404 for non-existent secret", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/secrets/nonexistent",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("PUT /api/v1/secrets/:name", () => {
    it("should update a secret", async () => {
      await server.inject({
        method: "POST",
        url: "/api/v1/secrets",
        payload: { name: "update-test", value: "old-value" },
      });

      const response = await server.inject({
        method: "PUT",
        url: "/api/v1/secrets/update-test",
        payload: { value: "new-value", category: "updated" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.name).toBe("update-test");
      expect(body.category).toBe("updated");

      // Verify the value was actually updated
      const getResponse = await server.inject({
        method: "GET",
        url: "/api/v1/secrets/update-test",
      });
      expect(getResponse.json().value).toBe("new-value");
    });
  });

  describe("DELETE /api/v1/secrets/:name", () => {
    it("should delete a secret", async () => {
      await server.inject({
        method: "POST",
        url: "/api/v1/secrets",
        payload: { name: "delete-test", value: "to-delete" },
      });

      const response = await server.inject({
        method: "DELETE",
        url: "/api/v1/secrets/delete-test",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);

      // Verify it's gone
      const getResponse = await server.inject({
        method: "GET",
        url: "/api/v1/secrets/delete-test",
      });
      expect(getResponse.statusCode).toBe(404);
    });
  });
});
