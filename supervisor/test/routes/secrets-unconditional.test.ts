// ============================================================
// Secrets Routes - Unconditional Registration Tests
// ============================================================
// Verify that secrets routes are always registered, returning 503
// when auth.json is missing and 200 when it exists.
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../../src/server.js";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";

describe("Secrets routes unconditional registration", () => {
  describe("fresh server without auth.json", () => {
    let server: FastifyInstance;
    let dataDir: string;

    beforeAll(async () => {
      dataDir = mkdtempSync(join(tmpdir(), "claudeos-fresh-"));
      // Create directories but NOT auth.json
      mkdirSync(join(dataDir, "config"), { recursive: true });
      mkdirSync(join(dataDir, "secrets"), { recursive: true });
      mkdirSync(join(dataDir, "extensions"), { recursive: true });
      mkdirSync(join(dataDir, "sessions"), { recursive: true });

      // Build with isDryRun=false but pre-create directories
      // so buildServer doesn't fail. We DON'T create auth.json.
      // However, isDryRun=false means real TmuxService is created
      // (which is fine -- constructor doesn't throw).
      server = await buildServer({
        dataDir,
        isDryRun: false,
        port: 0,
      });
    });

    afterAll(async () => {
      await server.close();
    });

    it("GET /api/v1/secrets returns 503 without auth.json", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/secrets",
      });

      expect(response.statusCode).toBe(503);
      const body = response.json();
      expect(body.statusCode).toBe(503);
      expect(body.error).toContain("unavailable");
    });

    it("POST /api/v1/secrets returns 503 without auth.json", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/secrets",
        payload: {
          name: "test-key",
          value: "test-value",
        },
      });

      expect(response.statusCode).toBe(503);
    });

    it("GET /api/v1/secrets/:name returns 503 without auth.json", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/secrets/any-name",
      });

      expect(response.statusCode).toBe(503);
    });
  });

  describe("server with auth.json present", () => {
    let server: FastifyInstance;
    let dataDir: string;

    beforeAll(async () => {
      dataDir = mkdtempSync(join(tmpdir(), "claudeos-auth-"));
      mkdirSync(join(dataDir, "config"), { recursive: true });
      mkdirSync(join(dataDir, "secrets"), { recursive: true });
      mkdirSync(join(dataDir, "extensions"), { recursive: true });
      mkdirSync(join(dataDir, "sessions"), { recursive: true });

      // Create a valid auth.json
      const encryptionKey = randomBytes(32).toString("hex");
      writeFileSync(
        join(dataDir, "config", "auth.json"),
        JSON.stringify({ encryptionKey }),
      );

      server = await buildServer({
        dataDir,
        isDryRun: false,
        port: 0,
      });
    });

    afterAll(async () => {
      await server.close();
    });

    it("GET /api/v1/secrets returns 200 with auth.json", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/secrets",
      });

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.json())).toBe(true);
    });

    it("POST /api/v1/secrets returns 201 with auth.json", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/secrets",
        payload: {
          name: "test-secret",
          value: "test-value",
          category: "test",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().name).toBe("test-secret");
    });
  });
});
