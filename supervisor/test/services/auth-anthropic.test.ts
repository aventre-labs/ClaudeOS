import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";

// Mock child_process before importing the service
const mockSpawn = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

import { AnthropicAuthService } from "../../src/services/auth-anthropic.js";

function createMockProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = 12345;
  proc.kill = vi.fn();
  return proc;
}

function createMockSecretStore() {
  return {
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(""),
    has: vi.fn().mockResolvedValue(false),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

describe("AnthropicAuthService", () => {
  let service: AnthropicAuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AnthropicAuthService();
  });

  afterEach(() => {
    service.cancel();
    vi.restoreAllMocks();
  });

  describe("validateApiKey", () => {
    it("returns valid:true for non-401 response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 200 }),
      );

      const result = await service.validateApiKey("sk-ant-valid-key");

      expect(result).toEqual({ valid: true });
    });

    it("returns valid:false for 401 response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 401 }),
      );

      const result = await service.validateApiKey("sk-ant-invalid-key");

      expect(result).toEqual({ valid: false, error: "Invalid API key" });
    });

    it("returns valid:false on network error", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(
        new Error("Network unreachable"),
      );

      const result = await service.validateApiKey("sk-ant-any-key");

      expect(result).toEqual({
        valid: false,
        error: expect.stringContaining("Network unreachable"),
      });
    });

    it("sends correct headers (x-api-key, anthropic-version, content-type)", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 200 }));

      await service.validateApiKey("sk-ant-test-key");

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.anthropic.com/v1/messages",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "x-api-key": "sk-ant-test-key",
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          }),
        }),
      );
    });

    it("uses minimal request body (haiku model, max_tokens:1)", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 200 }));

      await service.validateApiKey("sk-ant-test-key");

      const callArgs = fetchSpy.mock.calls[0];
      const body = JSON.parse((callArgs[1] as RequestInit).body as string);

      expect(body).toEqual({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      });
    });

    it("treats 429 (rate limited) as valid key", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 429 }),
      );

      const result = await service.validateApiKey("sk-ant-rate-limited");

      expect(result).toEqual({ valid: true });
    });
  });

  describe("storeApiKey", () => {
    it("stores API key in SecretStore with category 'auth'", async () => {
      const secretStore = createMockSecretStore();

      await service.storeApiKey("sk-ant-api-key", secretStore as any);

      expect(secretStore.set).toHaveBeenCalledWith(
        "anthropic-api-key",
        "sk-ant-api-key",
        "auth",
        ["anthropic"],
      );
    });
  });

  describe("startClaudeLogin", () => {
    it("spawns claude CLI process", () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      service.startClaudeLogin({
        onLoginUrl: vi.fn(),
        onComplete: vi.fn(),
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        ["login"],
        expect.objectContaining({
          stdio: ["pipe", "pipe", "pipe"],
        }),
      );
    });

    it("parses URL from stdout", () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      const onLoginUrl = vi.fn();

      service.startClaudeLogin({ onLoginUrl, onComplete: vi.fn() });

      proc.stdout.emit(
        "data",
        Buffer.from("Open https://console.anthropic.com/auth?code=abc to login\n"),
      );

      expect(onLoginUrl).toHaveBeenCalledWith(
        "https://console.anthropic.com/auth?code=abc",
      );
    });

    it("calls onComplete on process exit", () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      const onComplete = vi.fn();

      service.startClaudeLogin({ onLoginUrl: vi.fn(), onComplete });

      proc.emit("exit", 0, null);

      expect(onComplete).toHaveBeenCalledWith({ success: true });
    });

    it("handles ENOENT (claude not installed)", () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      const onComplete = vi.fn();

      service.startClaudeLogin({ onLoginUrl: vi.fn(), onComplete });

      const err = new Error("spawn claude ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      proc.emit("error", err);

      expect(onComplete).toHaveBeenCalledWith({
        success: false,
        fallbackToApiKey: true,
        error: expect.stringContaining("Claude CLI not installed"),
      });
    });

    it("rejects when already running", () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      service.startClaudeLogin({ onLoginUrl: vi.fn(), onComplete: vi.fn() });

      expect(() => {
        service.startClaudeLogin({ onLoginUrl: vi.fn(), onComplete: vi.fn() });
      }).toThrow(/already running/i);
    });

    it("cancel kills running process", () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      service.startClaudeLogin({ onLoginUrl: vi.fn(), onComplete: vi.fn() });
      service.cancel();

      expect(proc.kill).toHaveBeenCalled();
    });

    it("calls onComplete with fallback if no URL within timeout", () => {
      vi.useFakeTimers();

      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      const onComplete = vi.fn();

      service.startClaudeLogin({ onLoginUrl: vi.fn(), onComplete });

      // Advance time past the 10-second timeout
      vi.advanceTimersByTime(10_000);

      expect(onComplete).toHaveBeenCalledWith({
        success: false,
        fallbackToApiKey: true,
        error: expect.stringContaining("Could not capture login URL"),
      });

      vi.useRealTimers();
    });
  });

  describe("isRunning", () => {
    it("returns correct state", () => {
      expect(service.isRunning()).toBe(false);

      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      service.startClaudeLogin({ onLoginUrl: vi.fn(), onComplete: vi.fn() });

      expect(service.isRunning()).toBe(true);

      proc.emit("exit", 0, null);

      expect(service.isRunning()).toBe(false);
    });
  });
});
