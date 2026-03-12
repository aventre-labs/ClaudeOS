import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SessionManager } from "../../src/services/session-manager.js";
import type { TmuxService } from "../../src/services/tmux.js";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function createMockTmux(): TmuxService {
  return {
    createSession: vi.fn().mockResolvedValue(undefined),
    sendKeys: vi.fn().mockResolvedValue(undefined),
    capturePane: vi.fn().mockResolvedValue("mock output"),
    killSession: vi.fn().mockResolvedValue("mock scrollback"),
    stopSession: vi.fn().mockResolvedValue(undefined),
    setSessionHooks: vi.fn().mockResolvedValue(undefined),
    enableOutputPipe: vi.fn().mockResolvedValue(undefined),
    listSessions: vi.fn().mockResolvedValue([]),
    hasSession: vi.fn().mockResolvedValue(true),
  } as unknown as TmuxService;
}

describe("SessionManager", () => {
  let manager: SessionManager;
  let mockTmux: TmuxService;
  let dataDir: string;
  let statusCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "claudeos-sm-test-"));
    mkdirSync(join(dataDir, "sessions"), { recursive: true });
    mockTmux = createMockTmux();
    statusCallback = vi.fn();
    manager = new SessionManager(dataDir, mockTmux, statusCallback);
  });

  describe("create", () => {
    it("creates a tmux session with claude command", async () => {
      const session = await manager.create({});
      expect(mockTmux.createSession).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("claude"),
        undefined,
      );
      expect(session.id).toBeDefined();
      expect(session.status).toBe("active");
    });

    it("generates a unique session ID with ses_ prefix", async () => {
      const session = await manager.create({});
      expect(session.id).toMatch(/^ses_/);
    });

    it("includes model flag when provided", async () => {
      await manager.create({ model: "opus" });
      const cmd = (mockTmux.createSession as ReturnType<typeof vi.fn>).mock
        .calls[0]![1] as string;
      expect(cmd).toContain("--model");
      expect(cmd).toContain("opus");
    });

    it("includes extra flags when provided", async () => {
      await manager.create({ flags: ["--verbose", "--debug"] });
      const cmd = (mockTmux.createSession as ReturnType<typeof vi.fn>).mock
        .calls[0]![1] as string;
      expect(cmd).toContain("--verbose");
      expect(cmd).toContain("--debug");
    });

    it("sets hooks and enables output pipe", async () => {
      await manager.create({});
      expect(mockTmux.setSessionHooks).toHaveBeenCalled();
      expect(mockTmux.enableOutputPipe).toHaveBeenCalled();
    });

    it("saves metadata to disk", async () => {
      const session = await manager.create({});
      const metaPath = join(dataDir, "sessions", session.id, "meta.json");
      expect(existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
      expect(meta.id).toBe(session.id);
      expect(meta.status).toBe("active");
    });

    it("emits status callback with active status", async () => {
      const session = await manager.create({});
      expect(statusCallback).toHaveBeenCalledWith(session.id, "active");
    });

    it("assigns a default name when none provided", async () => {
      const session = await manager.create({});
      expect(session.name).toBeTruthy();
    });

    it("uses provided name when given", async () => {
      const session = await manager.create({ name: "my-session" });
      expect(session.name).toBe("my-session");
    });
  });

  describe("list", () => {
    it("returns all sessions from in-memory map", async () => {
      await manager.create({ name: "session-1" });
      await manager.create({ name: "session-2" });
      const sessions = manager.list();
      expect(sessions).toHaveLength(2);
    });

    it("returns empty array when no sessions exist", () => {
      const sessions = manager.list();
      expect(sessions).toEqual([]);
    });
  });

  describe("getSession", () => {
    it("returns session by id", async () => {
      const created = await manager.create({ name: "test" });
      const found = manager.getSession(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it("returns null for non-existent session", () => {
      const found = manager.getSession("ses_nonexistent");
      expect(found).toBeNull();
    });
  });

  describe("stop", () => {
    it("sends Ctrl+C via tmux", async () => {
      const session = await manager.create({});
      await manager.stop(session.id);
      expect(mockTmux.stopSession).toHaveBeenCalledWith(session.id);
    });

    it("updates session status to stopped", async () => {
      const session = await manager.create({});
      await manager.stop(session.id);
      const updated = manager.getSession(session.id);
      expect(updated!.status).toBe("stopped");
    });

    it("emits status callback", async () => {
      const session = await manager.create({});
      statusCallback.mockClear();
      await manager.stop(session.id);
      expect(statusCallback).toHaveBeenCalledWith(session.id, "stopped");
    });

    it("throws for non-existent session", async () => {
      await expect(manager.stop("ses_nope")).rejects.toThrow();
    });
  });

  describe("kill", () => {
    it("captures scrollback via tmux killSession", async () => {
      const session = await manager.create({});
      await manager.kill(session.id);
      expect(mockTmux.killSession).toHaveBeenCalledWith(session.id);
    });

    it("saves scrollback to disk", async () => {
      const session = await manager.create({});
      await manager.kill(session.id);
      const scrollbackPath = join(
        dataDir,
        "sessions",
        session.id,
        "scrollback.txt",
      );
      expect(existsSync(scrollbackPath)).toBe(true);
      expect(readFileSync(scrollbackPath, "utf-8")).toBe("mock scrollback");
    });

    it("removes session from active map", async () => {
      const session = await manager.create({});
      await manager.kill(session.id);
      expect(manager.getSession(session.id)).toBeNull();
    });

    it("throws for non-existent session", async () => {
      await expect(manager.kill("ses_nope")).rejects.toThrow();
    });
  });

  describe("archive", () => {
    it("stops the session before archiving", async () => {
      const session = await manager.create({});
      await manager.archive(session.id);
      expect(mockTmux.stopSession).toHaveBeenCalledWith(session.id);
    });

    it("saves scrollback to archive directory", async () => {
      (mockTmux.capturePane as ReturnType<typeof vi.fn>).mockResolvedValue(
        "full scrollback data",
      );
      const session = await manager.create({});
      await manager.archive(session.id);
      const archiveScrollback = join(
        dataDir,
        "sessions",
        session.id,
        "archive",
        "scrollback.txt",
      );
      expect(existsSync(archiveScrollback)).toBe(true);
      expect(readFileSync(archiveScrollback, "utf-8")).toBe(
        "full scrollback data",
      );
    });

    it("saves metadata JSON to archive directory", async () => {
      const session = await manager.create({ name: "archive-test" });
      await manager.archive(session.id);
      const archiveMeta = join(
        dataDir,
        "sessions",
        session.id,
        "archive",
        "meta.json",
      );
      expect(existsSync(archiveMeta)).toBe(true);
      const meta = JSON.parse(readFileSync(archiveMeta, "utf-8"));
      expect(meta.name).toBe("archive-test");
      expect(meta.archivedAt).toBeDefined();
      expect(meta.createdAt).toBeDefined();
    });

    it("updates session status to archived", async () => {
      const session = await manager.create({});
      await manager.archive(session.id);
      const updated = manager.getSession(session.id);
      expect(updated!.status).toBe("archived");
    });

    it("emits status callback with archived", async () => {
      const session = await manager.create({});
      statusCallback.mockClear();
      await manager.archive(session.id);
      expect(statusCallback).toHaveBeenCalledWith(session.id, "archived");
    });

    it("throws for non-existent session", async () => {
      await expect(manager.archive("ses_nope")).rejects.toThrow();
    });
  });

  describe("revive", () => {
    it("reads archived scrollback and creates new session with --continue", async () => {
      const session = await manager.create({ name: "revive-test" });
      await manager.archive(session.id);

      // Clear mocks to track revive calls
      (mockTmux.createSession as ReturnType<typeof vi.fn>).mockClear();

      const revived = await manager.revive(session.id);
      expect(revived).toBeDefined();
      expect(revived.status).toBe("active");

      const createCmd = (
        mockTmux.createSession as ReturnType<typeof vi.fn>
      ).mock.calls[0]![1] as string;
      expect(createCmd).toContain("--continue");
    });

    it("generates a new session ID for the revived session", async () => {
      const session = await manager.create({});
      await manager.archive(session.id);
      const revived = await manager.revive(session.id);
      expect(revived.id).not.toBe(session.id);
    });

    it("throws when session is not archived", async () => {
      const session = await manager.create({});
      await expect(manager.revive(session.id)).rejects.toThrow();
    });

    it("throws for non-existent session", async () => {
      await expect(manager.revive("ses_nope")).rejects.toThrow();
    });
  });

  describe("handleSessionEvent", () => {
    it("updates session status based on event", async () => {
      const session = await manager.create({});
      statusCallback.mockClear();
      manager.handleSessionEvent(session.id, "exited");
      const updated = manager.getSession(session.id);
      expect(updated!.status).toBe("stopped");
    });

    it("emits status callback", async () => {
      const session = await manager.create({});
      statusCallback.mockClear();
      manager.handleSessionEvent(session.id, "exited");
      expect(statusCallback).toHaveBeenCalledWith(session.id, "stopped");
    });

    it("ignores events for unknown sessions", () => {
      // Should not throw
      manager.handleSessionEvent("ses_nonexistent", "exited");
      expect(statusCallback).not.toHaveBeenCalled();
    });
  });

  describe("sendInput", () => {
    it("sends text via tmux sendKeys", async () => {
      const session = await manager.create({});
      await manager.sendInput(session.id, "hello");
      expect(mockTmux.sendKeys).toHaveBeenCalledWith(session.id, "hello");
    });

    it("throws for non-existent session", async () => {
      await expect(
        manager.sendInput("ses_nope", "hello"),
      ).rejects.toThrow();
    });
  });

  describe("captureOutput", () => {
    it("captures pane content via tmux", async () => {
      const session = await manager.create({});
      const output = await manager.captureOutput(session.id);
      expect(output).toBe("mock output");
      expect(mockTmux.capturePane).toHaveBeenCalledWith(session.id, false);
    });

    it("captures with scrollback when requested", async () => {
      const session = await manager.create({});
      await manager.captureOutput(session.id, true);
      expect(mockTmux.capturePane).toHaveBeenCalledWith(session.id, true);
    });

    it("throws for non-existent session", async () => {
      await expect(
        manager.captureOutput("ses_nope"),
      ).rejects.toThrow();
    });
  });
});
