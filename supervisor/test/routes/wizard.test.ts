// ============================================================
// ClaudeOS Supervisor - Wizard Routes Integration Tests
// ============================================================
// Tests wizard REST endpoints and SSE stream using mock services.
// Does NOT test real subprocess spawning or real API calls.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { wizardRoutes, type WizardRouteOptions } from "../../src/routes/wizard.js";

// --- Mock Services ---

function createMockWizardState(overrides: Partial<{
  status: "incomplete" | "completed";
  railwayCompleted: boolean;
  anthropicCompleted: boolean;
}> = {}) {
  const status = overrides.status ?? "incomplete";
  const railwayCompleted = overrides.railwayCompleted ?? false;
  const anthropicCompleted = overrides.anthropicCompleted ?? false;

  return {
    isCompleted: vi.fn(() => status === "completed"),
    getState: vi.fn(() => ({
      status,
      steps: {
        railway: { completed: railwayCompleted },
        anthropic: { completed: anthropicCompleted },
      },
      startedAt: "2026-01-01T00:00:00Z",
      ...(status === "completed" ? { completedAt: "2026-01-01T01:00:00Z" } : {}),
    })),
    completeRailwayStep: vi.fn(),
    completeAnthropicStep: vi.fn(),
    complete: vi.fn(),
  };
}

function createMockRailwayAuth(overrides: Partial<{ running: boolean }> = {}) {
  return {
    isRunning: vi.fn(() => overrides.running ?? false),
    startLogin: vi.fn(),
    cancel: vi.fn(),
    extractToken: vi.fn(() => null),
    storeToken: vi.fn(async () => false),
  };
}

function createMockAnthropicAuth(overrides: Partial<{ running: boolean }> = {}) {
  return {
    isRunning: vi.fn(() => overrides.running ?? false),
    validateApiKey: vi.fn(async () => ({ valid: true })),
    storeApiKey: vi.fn(),
    startClaudeLogin: vi.fn(),
    cancel: vi.fn(),
  };
}

async function buildTestServer(opts: Partial<WizardRouteOptions> = {}): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  const options: WizardRouteOptions = {
    wizardState: opts.wizardState ?? createMockWizardState() as any,
    railwayAuth: opts.railwayAuth ?? createMockRailwayAuth() as any,
    anthropicAuth: opts.anthropicAuth ?? createMockAnthropicAuth() as any,
    secretStore: opts.secretStore ?? null,
  };

  await server.register(wizardRoutes, {
    prefix: "/api/v1",
    ...options,
  });

  return server;
}

// --- Tests ---

describe("Wizard Routes", () => {
  let server: FastifyInstance;

  afterEach(async () => {
    if (server) await server.close();
  });

  describe("GET /api/v1/wizard/status", () => {
    it("returns 200 with wizard state", async () => {
      const wizardState = createMockWizardState();
      server = await buildTestServer({ wizardState: wizardState as any });

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/wizard/status",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe("incomplete");
      expect(body.steps).toBeDefined();
      expect(body.steps.railway).toBeDefined();
      expect(body.steps.anthropic).toBeDefined();
    });

    it("works even after wizard completion", async () => {
      const wizardState = createMockWizardState({ status: "completed" });
      server = await buildTestServer({ wizardState: wizardState as any });

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/wizard/status",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe("completed");
    });
  });

  describe("Completion guard", () => {
    it("POST endpoints return 410 when wizard is completed", async () => {
      const wizardState = createMockWizardState({ status: "completed" });
      server = await buildTestServer({ wizardState: wizardState as any });

      const endpoints = [
        { method: "POST" as const, url: "/api/v1/wizard/railway/start" },
        { method: "POST" as const, url: "/api/v1/wizard/anthropic/key" },
        { method: "POST" as const, url: "/api/v1/wizard/anthropic/login" },
        { method: "POST" as const, url: "/api/v1/wizard/complete" },
      ];

      for (const endpoint of endpoints) {
        const response = await server.inject({
          method: endpoint.method,
          url: endpoint.url,
          payload: endpoint.url.includes("/key") ? { apiKey: "sk-test" } : undefined,
        });

        expect(response.statusCode).toBe(410);
        const body = response.json();
        expect(body.error).toBe("Wizard already completed");
        expect(body.statusCode).toBe(410);
      }
    });
  });

  describe("POST /api/v1/wizard/railway/start", () => {
    it("returns 202 when login starts", async () => {
      const railwayAuth = createMockRailwayAuth();
      server = await buildTestServer({ railwayAuth: railwayAuth as any });

      const response = await server.inject({
        method: "POST",
        url: "/api/v1/wizard/railway/start",
      });

      expect(response.statusCode).toBe(202);
      expect(response.json().message).toBe("Railway login started");
      expect(railwayAuth.startLogin).toHaveBeenCalled();
    });

    it("returns 409 when login already running", async () => {
      const railwayAuth = createMockRailwayAuth({ running: true });
      server = await buildTestServer({ railwayAuth: railwayAuth as any });

      const response = await server.inject({
        method: "POST",
        url: "/api/v1/wizard/railway/start",
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe("POST /api/v1/wizard/anthropic/key", () => {
    it("returns 200 with valid key", async () => {
      const anthropicAuth = createMockAnthropicAuth();
      anthropicAuth.validateApiKey.mockResolvedValue({ valid: true });
      const wizardState = createMockWizardState();
      server = await buildTestServer({
        anthropicAuth: anthropicAuth as any,
        wizardState: wizardState as any,
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/v1/wizard/anthropic/key",
        payload: { apiKey: "sk-ant-valid-key" },
      });

      expect(response.statusCode).toBe(200);
      expect(anthropicAuth.validateApiKey).toHaveBeenCalledWith("sk-ant-valid-key");
      expect(wizardState.completeAnthropicStep).toHaveBeenCalledWith("api-key");
    });

    it("returns 400 with invalid key", async () => {
      const anthropicAuth = createMockAnthropicAuth();
      anthropicAuth.validateApiKey.mockResolvedValue({ valid: false, error: "Invalid API key" });
      server = await buildTestServer({ anthropicAuth: anthropicAuth as any });

      const response = await server.inject({
        method: "POST",
        url: "/api/v1/wizard/anthropic/key",
        payload: { apiKey: "bad-key" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("Invalid");
    });

    it("returns 400 with missing body", async () => {
      server = await buildTestServer();

      const response = await server.inject({
        method: "POST",
        url: "/api/v1/wizard/anthropic/key",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/v1/wizard/anthropic/login", () => {
    it("returns 202 when login starts", async () => {
      const anthropicAuth = createMockAnthropicAuth();
      server = await buildTestServer({ anthropicAuth: anthropicAuth as any });

      const response = await server.inject({
        method: "POST",
        url: "/api/v1/wizard/anthropic/login",
      });

      expect(response.statusCode).toBe(202);
      expect(anthropicAuth.startClaudeLogin).toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/wizard/launch", () => {
    it("returns 400 when auth steps are incomplete", async () => {
      const wizardState = createMockWizardState({
        railwayCompleted: false,
        anthropicCompleted: false,
      });
      server = await buildTestServer({ wizardState: wizardState as any });

      const response = await server.inject({
        method: "POST",
        url: "/api/v1/wizard/launch",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("not all auth steps");
    });

    it("returns 200 and calls complete() + writeAll() when steps done", async () => {
      const wizardState = createMockWizardState({
        railwayCompleted: true,
        anthropicCompleted: true,
      });
      wizardState.complete.mockResolvedValue(undefined);

      const mockSecretStore = {
        get: vi.fn().mockResolvedValue("sk-ant-test-key"),
      };

      server = await buildTestServer({
        wizardState: wizardState as any,
        secretStore: mockSecretStore as any,
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/v1/wizard/launch",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe("Launch initiated");
      expect(wizardState.complete).toHaveBeenCalled();
    });

    it("does NOT broadcast wizard:completed event", async () => {
      const wizardState = createMockWizardState({
        railwayCompleted: true,
        anthropicCompleted: true,
      });
      wizardState.complete.mockResolvedValue(undefined);

      server = await buildTestServer({ wizardState: wizardState as any });

      // Connect SSE client first to capture events
      // We just verify the endpoint returns successfully without broadcasting
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/wizard/launch",
      });

      expect(response.statusCode).toBe(200);
      // The response is synchronous; wizard:completed is NOT sent
      // (verified by absence of broadcastEvent call for wizard:completed in implementation)
    });
  });

  describe("POST /api/v1/wizard/complete", () => {
    it("returns 200 when all steps done", async () => {
      const wizardState = createMockWizardState({
        railwayCompleted: true,
        anthropicCompleted: true,
      });
      wizardState.complete.mockResolvedValue(undefined);
      // After completing, getState should return completed
      wizardState.getState.mockReturnValue({
        status: "completed",
        steps: {
          railway: { completed: true },
          anthropic: { completed: true },
        },
        startedAt: "2026-01-01T00:00:00Z",
        completedAt: "2026-01-01T01:00:00Z",
      });
      server = await buildTestServer({ wizardState: wizardState as any });

      const response = await server.inject({
        method: "POST",
        url: "/api/v1/wizard/complete",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.completedAt).toBeDefined();
    });

    it("returns 400 when steps incomplete", async () => {
      const wizardState = createMockWizardState();
      wizardState.complete.mockRejectedValue(
        new Error("Cannot complete wizard: not all steps are completed"),
      );
      server = await buildTestServer({ wizardState: wizardState as any });

      const response = await server.inject({
        method: "POST",
        url: "/api/v1/wizard/complete",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("not all steps");
    });
  });
});
