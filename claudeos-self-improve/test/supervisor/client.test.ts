// ============================================================
// SupervisorClient Unit Tests
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SupervisorClient } from "../../src/supervisor/client.js";
import type { ExtensionRecord } from "../../src/types.js";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("SupervisorClient", () => {
  let client: SupervisorClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new SupervisorClient("http://localhost:3100/api/v1");
  });

  describe("installExtension", () => {
    it("should send POST with correct body and return parsed ExtensionRecord", async () => {
      const mockRecord: ExtensionRecord = {
        id: "github:org/ext@v1.0.0",
        name: "org/ext",
        version: "v1.0.0",
        method: "github-release",
        state: "installed",
        installedAt: "2026-03-14T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRecord,
      });

      const result = await client.installExtension({
        method: "github-release",
        repo: "org/ext",
        tag: "v1.0.0",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3100/api/v1/extensions/install",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "github-release",
            repo: "org/ext",
            tag: "v1.0.0",
          }),
        }),
      );

      expect(result).toEqual(mockRecord);
    });

    it("should throw on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Bad request",
      });

      await expect(
        client.installExtension({
          method: "github-release",
          repo: "org/ext",
          tag: "v1.0.0",
        }),
      ).rejects.toThrow("Install extension failed (400)");
    });
  });

  describe("listExtensions", () => {
    it("should send GET and return array of ExtensionRecords", async () => {
      const mockRecords: ExtensionRecord[] = [
        {
          id: "github:org/ext@v1.0.0",
          name: "org/ext",
          version: "v1.0.0",
          method: "github-release",
          state: "installed",
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRecords,
      });

      const result = await client.listExtensions();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3100/api/v1/extensions",
        expect.objectContaining({ method: "GET" }),
      );

      expect(result).toEqual(mockRecords);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should throw on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal server error",
      });

      await expect(client.listExtensions()).rejects.toThrow(
        "List extensions failed (500)",
      );
    });
  });

  describe("uninstallExtension", () => {
    it("should send DELETE with encoded extensionId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await client.uninstallExtension("github:org/ext@v1.0.0");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3100/api/v1/extensions/github%3Aorg%2Fext%40v1.0.0",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("should throw on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Extension not found",
      });

      await expect(
        client.uninstallExtension("github:org/nonexistent@v1.0.0"),
      ).rejects.toThrow("Uninstall extension failed (404)");
    });
  });
});
