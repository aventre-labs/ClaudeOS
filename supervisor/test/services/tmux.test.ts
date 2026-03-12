import { describe, it, expect, beforeEach, vi } from "vitest";
import { TmuxService } from "../../src/services/tmux.js";

// Mock child_process.execFile
// promisify(execFile) calls execFile(cmd, args, callback) where callback
// is the last argument. We need to handle that the callback is at position 2.
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";

const mockExecFile = vi.mocked(execFile);

function mockExecSuccess(stdout = ""): void {
  mockExecFile.mockImplementation((...allArgs: unknown[]) => {
    // promisify calls with (cmd, args, callback)
    const callback = allArgs[allArgs.length - 1];
    if (typeof callback === "function") {
      callback(null, stdout, "");
    }
    return {} as ReturnType<typeof execFile>;
  });
}

function mockExecError(message: string): void {
  mockExecFile.mockImplementation((...allArgs: unknown[]) => {
    const callback = allArgs[allArgs.length - 1];
    if (typeof callback === "function") {
      const err = new Error(message);
      callback(err, "", message);
    }
    return {} as ReturnType<typeof execFile>;
  });
}

describe("TmuxService", () => {
  let tmux: TmuxService;

  beforeEach(() => {
    vi.clearAllMocks();
    tmux = new TmuxService();
  });

  describe("createSession", () => {
    it("creates a tmux session with correct arguments", async () => {
      mockExecSuccess();
      await tmux.createSession("abc123", "claude", "/home/user");
      expect(mockExecFile).toHaveBeenCalledWith(
        "tmux",
        expect.arrayContaining(["new-session", "-d", "-s", "claudeos_abc123"]),
        expect.any(Function),
      );
    });

    it("includes workdir via -c flag when provided", async () => {
      mockExecSuccess();
      await tmux.createSession("abc123", "claude", "/home/user");
      const args = mockExecFile.mock.calls[0]![1] as string[];
      expect(args).toContain("-c");
      expect(args).toContain("/home/user");
    });

    it("includes window dimensions -x 200 -y 50", async () => {
      mockExecSuccess();
      await tmux.createSession("abc123", "claude");
      const args = mockExecFile.mock.calls[0]![1] as string[];
      expect(args).toContain("-x");
      expect(args).toContain("200");
      expect(args).toContain("-y");
      expect(args).toContain("50");
    });

    it("passes command as initial process (not via send-keys)", async () => {
      mockExecSuccess();
      await tmux.createSession("abc123", "claude --model opus");
      const args = mockExecFile.mock.calls[0]![1] as string[];
      // Command should be the last argument after all flags
      expect(args[args.length - 1]).toBe("claude --model opus");
    });
  });

  describe("sendKeys", () => {
    it("sends text followed by Enter", async () => {
      mockExecSuccess();
      await tmux.sendKeys("abc123", "hello world");
      expect(mockExecFile).toHaveBeenCalledWith(
        "tmux",
        ["send-keys", "-t", "claudeos_abc123", "hello world", "Enter"],
        expect.any(Function),
      );
    });
  });

  describe("capturePane", () => {
    it("captures visible pane content by default", async () => {
      mockExecSuccess("some terminal output\n");
      const result = await tmux.capturePane("abc123");
      expect(result).toBe("some terminal output\n");
      expect(mockExecFile).toHaveBeenCalledWith(
        "tmux",
        ["capture-pane", "-t", "claudeos_abc123", "-p"],
        expect.any(Function),
      );
    });

    it("includes scrollback when requested", async () => {
      mockExecSuccess("scrollback content\n");
      const result = await tmux.capturePane("abc123", true);
      expect(result).toBe("scrollback content\n");
      const args = mockExecFile.mock.calls[0]![1] as string[];
      expect(args).toContain("-S");
      expect(args).toContain("-1000");
    });
  });

  describe("killSession", () => {
    it("captures scrollback before killing session", async () => {
      mockExecFile.mockImplementation((...allArgs: unknown[]) => {
        const args = allArgs[1] as string[];
        const callback = allArgs[allArgs.length - 1] as Function;
        if (args[0] === "capture-pane") {
          callback(null, "full scrollback content", "");
        } else {
          callback(null, "", "");
        }
        return {} as ReturnType<typeof execFile>;
      });

      const scrollback = await tmux.killSession("abc123");
      expect(scrollback).toBe("full scrollback content");

      // Verify capture-pane was called before kill-session
      const calls = mockExecFile.mock.calls;
      const captureIdx = calls.findIndex(
        (c) => (c[1] as string[])[0] === "capture-pane",
      );
      const killIdx = calls.findIndex(
        (c) => (c[1] as string[])[0] === "kill-session",
      );
      expect(captureIdx).toBeLessThan(killIdx);
    });

    it("destroys the tmux session", async () => {
      mockExecFile.mockImplementation((...allArgs: unknown[]) => {
        const callback = allArgs[allArgs.length - 1] as Function;
        callback(null, "", "");
        return {} as ReturnType<typeof execFile>;
      });

      await tmux.killSession("abc123");
      const killCall = mockExecFile.mock.calls.find(
        (c) => (c[1] as string[])[0] === "kill-session",
      );
      expect(killCall).toBeDefined();
      expect((killCall![1] as string[])).toContain("claudeos_abc123");
    });
  });

  describe("stopSession", () => {
    it("sends Ctrl+C to the session", async () => {
      mockExecSuccess();
      await tmux.stopSession("abc123");
      expect(mockExecFile).toHaveBeenCalledWith(
        "tmux",
        ["send-keys", "-t", "claudeos_abc123", "C-c", ""],
        expect.any(Function),
      );
    });
  });

  describe("setSessionHooks", () => {
    it("sets pane-exited hook to POST to internal endpoint", async () => {
      mockExecSuccess();
      await tmux.setSessionHooks("abc123", 3100);
      const args = mockExecFile.mock.calls[0]![1] as string[];
      expect(args).toContain("set-hook");
      expect(args.join(" ")).toContain("pane-exited");
      expect(args.join(" ")).toContain("session-event");
      expect(args.join(" ")).toContain("abc123");
    });
  });

  describe("enableOutputPipe", () => {
    it("sets up pipe-pane to write to live-output file", async () => {
      mockExecSuccess();
      await tmux.enableOutputPipe("abc123", "/data/sessions");
      const args = mockExecFile.mock.calls[0]![1] as string[];
      expect(args).toContain("pipe-pane");
      expect(args).toContain("-t");
      expect(args).toContain("claudeos_abc123");
      expect(args.join(" ")).toContain("live-output");
    });
  });

  describe("listSessions", () => {
    it("returns only claudeos sessions", async () => {
      mockExecSuccess("claudeos_abc123\nother_session\nclaudeos_def456\n");
      const sessions = await tmux.listSessions();
      expect(sessions).toEqual(["abc123", "def456"]);
    });

    it("returns empty array when no sessions exist", async () => {
      mockExecError("no server running");
      const sessions = await tmux.listSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe("hasSession", () => {
    it("returns true when session exists", async () => {
      mockExecSuccess();
      const result = await tmux.hasSession("abc123");
      expect(result).toBe(true);
    });

    it("returns false when session does not exist", async () => {
      mockExecError("session not found");
      const result = await tmux.hasSession("nonexistent");
      expect(result).toBe(false);
    });
  });
});
