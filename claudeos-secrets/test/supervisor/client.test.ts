// ============================================================
// SupervisorClient Tests
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SupervisorClient } from "../../src/supervisor/client.js";

// Stub global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

describe("SupervisorClient", () => {
  let client: SupervisorClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new SupervisorClient();
  });

  describe("listSecrets", () => {
    it("calls GET /api/v1/secrets and returns SecretMeta[]", async () => {
      const secrets = [
        { name: "key1", category: "api", tags: [], createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        { name: "key2", createdAt: "2026-01-02", updatedAt: "2026-01-02" },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(secrets));

      const result = await client.listSecrets();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3100/api/v1/secrets",
        { method: "GET" },
      );
      expect(result).toEqual(secrets);
    });

    it("throws on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

      await expect(client.listSecrets()).rejects.toThrow("Failed to list secrets: 500");
    });
  });

  describe("getSecretValue", () => {
    it("calls GET /api/v1/secrets/{name} and returns the value string", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ name: "my-key", value: "sk-12345" }));

      const result = await client.getSecretValue("my-key");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3100/api/v1/secrets/my-key",
        { method: "GET" },
      );
      expect(result).toBe("sk-12345");
    });

    it("URL-encodes special characters in secret name", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ name: "my/key", value: "val" }));

      await client.getSecretValue("my/key");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3100/api/v1/secrets/my%2Fkey",
        { method: "GET" },
      );
    });

    it("throws on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));

      await expect(client.getSecretValue("nope")).rejects.toThrow("Failed to get secret: 404");
    });
  });

  describe("createSecret", () => {
    it("calls POST /api/v1/secrets with name, value, category, tags", async () => {
      const created = { name: "new-key", category: "api", tags: ["prod"], createdAt: "2026-01-01", updatedAt: "2026-01-01" };
      mockFetch.mockResolvedValueOnce(jsonResponse(created, 201));

      const result = await client.createSecret("new-key", "secret-val", "api", ["prod"]);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3100/api/v1/secrets",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "new-key", value: "secret-val", category: "api", tags: ["prod"] }),
        },
      );
      expect(result).toEqual(created);
    });

    it("sends only name and value when category/tags omitted", async () => {
      const created = { name: "simple", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
      mockFetch.mockResolvedValueOnce(jsonResponse(created, 201));

      await client.createSecret("simple", "val");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3100/api/v1/secrets",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "simple", value: "val" }),
        },
      );
    });

    it("throws on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 400));

      await expect(client.createSecret("x", "y")).rejects.toThrow("Failed to create secret: 400");
    });
  });

  describe("updateSecret", () => {
    it("calls PUT /api/v1/secrets/{name} with optional fields", async () => {
      const updated = { name: "key1", category: "updated", createdAt: "2026-01-01", updatedAt: "2026-01-02" };
      mockFetch.mockResolvedValueOnce(jsonResponse(updated));

      const result = await client.updateSecret("key1", "new-val", "updated", ["tag1"]);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3100/api/v1/secrets/key1",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: "new-val", category: "updated", tags: ["tag1"] }),
        },
      );
      expect(result).toEqual(updated);
    });

    it("sends only provided fields", async () => {
      const updated = { name: "key1", createdAt: "2026-01-01", updatedAt: "2026-01-02" };
      mockFetch.mockResolvedValueOnce(jsonResponse(updated));

      await client.updateSecret("key1", "new-val");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3100/api/v1/secrets/key1",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: "new-val" }),
        },
      );
    });

    it("throws on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));

      await expect(client.updateSecret("nope", "val")).rejects.toThrow("Failed to update secret: 404");
    });
  });

  describe("deleteSecret", () => {
    it("calls DELETE /api/v1/secrets/{name}", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

      await client.deleteSecret("old-key");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3100/api/v1/secrets/old-key",
        { method: "DELETE" },
      );
    });

    it("URL-encodes secret name", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

      await client.deleteSecret("my special/key");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3100/api/v1/secrets/my%20special%2Fkey",
        { method: "DELETE" },
      );
    });

    it("throws on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));

      await expect(client.deleteSecret("nope")).rejects.toThrow("Failed to delete secret: 404");
    });
  });

  describe("hasSecret", () => {
    it("returns true when secret exists in list", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse([
          { name: "target", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
          { name: "other", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        ]),
      );

      const result = await client.hasSecret("target");

      expect(result).toBe(true);
    });

    it("returns false when secret not in list", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse([
          { name: "other", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        ]),
      );

      const result = await client.hasSecret("nope");

      expect(result).toBe(false);
    });

    it("returns false on error", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

      const result = await client.hasSecret("error-key");

      expect(result).toBe(false);
    });
  });

  describe("setEnv", () => {
    it("calls POST /api/v1/config/env with key and value", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

      await client.setEnv("ANTHROPIC_API_KEY", "sk-ant-12345");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3100/api/v1/config/env",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "ANTHROPIC_API_KEY", value: "sk-ant-12345" }),
        },
      );
    });

    it("throws on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 400));

      await expect(client.setEnv("BAD", "val")).rejects.toThrow("Failed to set environment: 400");
    });
  });
});
