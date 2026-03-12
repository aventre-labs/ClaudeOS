import { describe, it, expect, afterAll } from "vitest";
import { createTestServer, closeTestServer } from "../helpers/test-server.js";

describe("GET /api/v1/health", () => {
  afterAll(async () => {
    await closeTestServer();
  });

  it("returns 200 status code", async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/v1/health",
    });
    expect(response.statusCode).toBe(200);
  });

  it("returns JSON with status field set to 'initializing'", async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/v1/health",
    });
    const body = response.json();
    expect(body.status).toBe("initializing");
  });

  it("returns a version string", async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/v1/health",
    });
    const body = response.json();
    expect(body.version).toBeDefined();
    expect(typeof body.version).toBe("string");
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("returns uptime as a positive number", async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/v1/health",
    });
    const body = response.json();
    expect(body.uptime).toBeDefined();
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it("returns correct content-type header", async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/v1/health",
    });
    expect(response.headers["content-type"]).toContain("application/json");
  });
});
