// ============================================================
// Secrets Routes - Unconditional Registration Tests
// ============================================================
// Verify that secrets routes are always registered, returning 503
// when CLAUDEOS_AUTH_TOKEN is missing and 200 when it is set.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { buildServer } from "../../src/server.js";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";

describe("Secrets routes unconditional registration", () => {
  let savedToken: string | undefined;

  beforeEach(() => {
    savedToken = process.env.CLAUDEOS_AUTH_TOKEN;
  });

  afterEach(() => {
    if (savedToken !== undefined) {
      process.env.CLAUDEOS_AUTH_TOKEN = savedToken;
    } else {
      delete process.env.CLAUDEOS_AUTH_TOKEN;
    }
  });

  describe("server without CLAUDEOS_AUTH_TOKEN", () => {
    let server: FastifyInstance;
    let dataDir: string;

    beforeAll(async () => {
      delete process.env.CLAUDEOS_AUTH_TOKEN;
      dataDir = mkdtempSync(join(tmpdir(), "claudeos-fresh-"));
      mkdirSync(join(dataDir, "config"), { recursive: true });
      mkdirSync(join(dataDir, "secrets"), { recursive: true });
      mkdirSync(join(dataDir, "extensions"), { recursive: true });
      mkdirSync(join(dataDir, "sessions"), { recursive: true });

      server = await buildServer({
        dataDir,
        isDryRun: false,
        port: 0,
      });
    });

    afterAll(async () => {
      await server.close();
    });

    it("GET /api/v1/secrets returns 503 without auth token", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/secrets",
      });

      expect(response.statusCode).toBe(503);
      const body = response.json();
      expect(body.statusCode).toBe(503);
      expect(body.error).toContain("unavailable");
    });

    it("POST /api/v1/secrets returns 503 without auth token", async () => {
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

    it("GET /api/v1/secrets/:name returns 503 without auth token", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/secrets/any-name",
      });

      expect(response.statusCode).toBe(503);
    });
  });

  describe("server with CLAUDEOS_AUTH_TOKEN set", () => {
    let server: FastifyInstance;
    let dataDir: string;

    beforeAll(async () => {
      process.env.CLAUDEOS_AUTH_TOKEN = randomBytes(32).toString("hex");
      dataDir = mkdtempSync(join(tmpdir(), "claudeos-auth-"));
      mkdirSync(join(dataDir, "config"), { recursive: true });
      mkdirSync(join(dataDir, "secrets"), { recursive: true });
      mkdirSync(join(dataDir, "extensions"), { recursive: true });
      mkdirSync(join(dataDir, "sessions"), { recursive: true });

      server = await buildServer({
        dataDir,
        isDryRun: false,
        port: 0,
      });
    });

    afterAll(async () => {
      await server.close();
    });

    it("GET /api/v1/secrets returns 200 with auth token", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/secrets",
      });

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.json())).toBe(true);
    });

    it("POST /api/v1/secrets returns 201 with auth token", async () => {
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
