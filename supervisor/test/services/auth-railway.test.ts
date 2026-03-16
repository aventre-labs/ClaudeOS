import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";

// Mock child_process before importing the service
const mockSpawn = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

// Mock node:fs for extractToken tests
const mockReadFileSync = vi.fn();
const mockExistsSync = vi.fn();
vi.mock("node:fs", () => ({
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

import { RailwayAuthService } from "../../src/services/auth-railway.js";

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

describe("RailwayAuthService", () => {
  let service: RailwayAuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RailwayAuthService();
  });

  afterEach(() => {
    service.cancel();
  });

  describe("startLogin", () => {
    it("spawns railway CLI process", () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      service.startLogin({
        onPairingInfo: vi.fn(),
        onComplete: vi.fn(),
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        "railway",
        ["login", "--browserless"],
        expect.objectContaining({
          stdio: ["pipe", "pipe", "pipe"],
        }),
      );
    });

    it("parses pairing code and URL from stdout and calls onPairingInfo", async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      const onPairingInfo = vi.fn();
      const onComplete = vi.fn();

      service.startLogin({ onPairingInfo, onComplete });

      // Simulate stdout data with pairing code and URL
      proc.stdout.emit(
        "data",
        Buffer.from(
          "Your pairing code is: quick-brown-fox\nOpen https://railway.com/cli-login?code=abc123 to authenticate\n",
        ),
      );

      expect(onPairingInfo).toHaveBeenCalledWith({
        pairingCode: "quick-brown-fox",
        url: "https://railway.com/cli-login?code=abc123",
      });
    });

    it("calls onComplete on process exit with success", async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      const onComplete = vi.fn();

      service.startLogin({ onPairingInfo: vi.fn(), onComplete });

      proc.emit("exit", 0, null);

      expect(onComplete).toHaveBeenCalledWith({ success: true });
    });

    it("calls onComplete with error on non-zero exit", async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      const onComplete = vi.fn();

      service.startLogin({ onPairingInfo: vi.fn(), onComplete });

      proc.stderr.emit("data", Buffer.from("Login failed"));
      proc.emit("exit", 1, null);

      expect(onComplete).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining("Login failed"),
      });
    });

    it("rejects startLogin when already running", () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      service.startLogin({ onPairingInfo: vi.fn(), onComplete: vi.fn() });

      expect(() => {
        service.startLogin({ onPairingInfo: vi.fn(), onComplete: vi.fn() });
      }).toThrow(/already running/i);
    });

    it("handles ENOENT (railway not installed)", async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      const onComplete = vi.fn();

      service.startLogin({ onPairingInfo: vi.fn(), onComplete });

      const err = new Error("spawn railway ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      proc.emit("error", err);

      expect(onComplete).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining("Railway CLI not installed"),
      });
    });
  });

  describe("cancel", () => {
    it("kills running process", () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      service.startLogin({ onPairingInfo: vi.fn(), onComplete: vi.fn() });
      service.cancel();

      expect(proc.kill).toHaveBeenCalled();
    });
  });

  describe("isRunning", () => {
    it("returns correct state", () => {
      expect(service.isRunning()).toBe(false);

      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      service.startLogin({ onPairingInfo: vi.fn(), onComplete: vi.fn() });

      expect(service.isRunning()).toBe(true);

      proc.emit("exit", 0, null);

      expect(service.isRunning()).toBe(false);
    });
  });

  describe("extractToken", () => {
    it("reads token from ~/.railway/config.json", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ user: { token: "railway-test-token" } }),
      );

      const token = service.extractToken();

      expect(token).toBe("railway-test-token");
    });

    it("returns null when config file does not exist", () => {
      mockExistsSync.mockReturnValue(false);

      const token = service.extractToken();

      expect(token).toBeNull();
    });

    it("returns null when config has no user token", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({}));

      const token = service.extractToken();

      expect(token).toBeNull();
    });
  });

  describe("storeToken", () => {
    it("stores extracted token in SecretStore", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ user: { token: "railway-test-token" } }),
      );

      const secretStore = createMockSecretStore();
      const result = await service.storeToken(secretStore as any);

      expect(result).toBe(true);
      expect(secretStore.set).toHaveBeenCalledWith(
        "railway-token",
        "railway-test-token",
        "auth",
        ["railway"],
      );
    });

    it("returns false when no token can be extracted", async () => {
      mockExistsSync.mockReturnValue(false);

      const secretStore = createMockSecretStore();
      const result = await service.storeToken(secretStore as any);

      expect(result).toBe(false);
      expect(secretStore.set).not.toHaveBeenCalled();
    });
  });
});
