// ============================================================
// SupervisorClient Tests
// ============================================================
// Tests the HTTP client for all supervisor REST endpoints.
// Uses mocked global fetch.
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SupervisorClient } from "../../src/supervisor/client.js";
import type { Session } from "../../src/supervisor/types.js";

const TEST_SESSION: Session = {
  id: "ses_abc12345",
  name: "test-session",
  status: "active",
  createdAt: "2026-03-12T00:00:00Z",
};

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  });
}

describe("SupervisorClient", () => {
  let client: SupervisorClient;
  const baseUrl = "http://localhost:3100/api/v1";

  beforeEach(() => {
    client = new SupervisorClient(baseUrl);
    vi.restoreAllMocks();
  });

  describe("listSessions", () => {
    it("calls GET /sessions and returns Session[]", async () => {
      const sessions = [TEST_SESSION];
      global.fetch = mockFetch(sessions);

      const result = await client.listSessions();

      expect(global.fetch).toHaveBeenCalledWith(`${baseUrl}/sessions`, expect.objectContaining({ method: "GET" }));
      expect(result).toEqual(sessions);
    });

    it("throws on non-2xx response", async () => {
      global.fetch = mockFetch({ error: "fail" }, 500);

      await expect(client.listSessions()).rejects.toThrow("500");
    });
  });

  describe("createSession", () => {
    it("calls POST /sessions with optional name", async () => {
      global.fetch = mockFetch(TEST_SESSION, 201);

      const result = await client.createSession("my-session");

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/sessions`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
          body: JSON.stringify({ name: "my-session" }),
        }),
      );
      expect(result).toEqual(TEST_SESSION);
    });

    it("calls POST /sessions without name", async () => {
      global.fetch = mockFetch(TEST_SESSION, 201);

      await client.createSession();

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/sessions`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({}),
        }),
      );
    });
  });

  describe("getSession", () => {
    it("calls GET /sessions/:id and returns Session", async () => {
      global.fetch = mockFetch(TEST_SESSION);

      const result = await client.getSession("ses_abc12345");

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/sessions/ses_abc12345`,
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toEqual(TEST_SESSION);
    });

    it("throws on 404", async () => {
      global.fetch = mockFetch({ error: "not found" }, 404);

      await expect(client.getSession("ses_nope")).rejects.toThrow("404");
    });
  });

  describe("renameSession", () => {
    it("calls PATCH /sessions/:id with { name }", async () => {
      const updated = { ...TEST_SESSION, name: "renamed" };
      global.fetch = mockFetch(updated);

      const result = await client.renameSession("ses_abc12345", "renamed");

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/sessions/ses_abc12345`,
        expect.objectContaining({
          method: "PATCH",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
          body: JSON.stringify({ name: "renamed" }),
        }),
      );
      expect(result).toEqual(updated);
    });
  });

  describe("stopSession", () => {
    it("calls POST /sessions/:id/stop", async () => {
      global.fetch = mockFetch({ success: true });

      await client.stopSession("ses_abc12345");

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/sessions/ses_abc12345/stop`,
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("killSession", () => {
    it("calls DELETE /sessions/:id", async () => {
      global.fetch = mockFetch({ success: true, scrollback: "output" });

      await client.killSession("ses_abc12345");

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/sessions/ses_abc12345`,
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  describe("archiveSession", () => {
    it("calls POST /sessions/:id/archive", async () => {
      global.fetch = mockFetch({ success: true });

      await client.archiveSession("ses_abc12345");

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/sessions/ses_abc12345/archive`,
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("reviveSession", () => {
    it("calls POST /sessions/:id/revive and returns Session", async () => {
      const revived = { ...TEST_SESSION, id: "ses_new12345" };
      global.fetch = mockFetch(revived, 201);

      const result = await client.reviveSession("ses_abc12345");

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/sessions/ses_abc12345/revive`,
        expect.objectContaining({ method: "POST" }),
      );
      expect(result).toEqual(revived);
    });

    it("throws on non-2xx response", async () => {
      global.fetch = mockFetch({ error: "fail" }, 404);

      await expect(client.reviveSession("ses_nope")).rejects.toThrow("404");
    });
  });

  describe("sendInput", () => {
    it("calls POST /sessions/:id/input with { text }", async () => {
      global.fetch = mockFetch({ success: true });

      await client.sendInput("ses_abc12345", "hello world");

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/sessions/ses_abc12345/input`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ text: "hello world" }),
        }),
      );
    });
  });

  describe("getOutput", () => {
    it("calls GET /sessions/:id/output without scrollback by default", async () => {
      global.fetch = mockFetch({ output: "some output" });

      const result = await client.getOutput("ses_abc12345");

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/sessions/ses_abc12345/output?scrollback=false`,
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toBe("some output");
    });

    it("calls GET /sessions/:id/output with scrollback=true", async () => {
      global.fetch = mockFetch({ output: "full output" });

      const result = await client.getOutput("ses_abc12345", true);

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/sessions/ses_abc12345/output?scrollback=true`,
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toBe("full output");
    });
  });
});
