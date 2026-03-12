import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExtensionInstaller } from "../../src/services/extension-installer.js";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock child_process.execFile
vi.mock("node:child_process", () => ({
  execFile: vi.fn(
    (
      _cmd: string,
      _args: string[],
      _opts: Record<string, unknown>,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      cb(null, "Extension installed successfully", "");
    },
  ),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("ExtensionInstaller", () => {
  let dataDir: string;
  let installer: ExtensionInstaller;

  beforeEach(() => {
    vi.clearAllMocks();
    dataDir = mkdtempSync(join(tmpdir(), "claudeos-ext-test-"));
    mkdirSync(join(dataDir, "extensions"), { recursive: true });
    installer = new ExtensionInstaller(dataDir);
  });

  describe("state transitions", () => {
    it("should transition to installed on successful GitHub install", async () => {
      // Mock GitHub API response with VSIX asset
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          assets: [
            {
              name: "my-ext-0.1.0.vsix",
              browser_download_url:
                "https://github.com/org/repo/releases/download/v0.1.0/my-ext-0.1.0.vsix",
            },
          ],
        }),
      });

      // Mock VSIX download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      await installer.installFromGitHub("org/repo", "v0.1.0");

      const state = installer.getInstallState();
      const ext = state.find((e) => e.name === "org/repo");
      expect(ext).toBeDefined();
      expect(ext!.state).toBe("installed");
      expect(ext!.installedAt).toBeDefined();
    });

    it("should transition to failed on GitHub API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await installer.installFromGitHub("org/missing-repo", "v0.1.0");

      const state = installer.getInstallState();
      const ext = state.find((e) => e.name === "org/missing-repo");
      expect(ext).toBeDefined();
      expect(ext!.state).toBe("failed");
      expect(ext!.error).toBeDefined();
    });

    it("should transition to failed when no VSIX asset found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          assets: [{ name: "readme.md", browser_download_url: "https://example.com/readme.md" }],
        }),
      });

      await installer.installFromGitHub("org/no-vsix", "v0.1.0");

      const state = installer.getInstallState();
      const ext = state.find((e) => e.name === "org/no-vsix");
      expect(ext!.state).toBe("failed");
      expect(ext!.error).toContain("VSIX");
    });
  });

  describe("installFromVsix", () => {
    it("should install from a local VSIX file", async () => {
      // Create a fake VSIX file
      const vsixPath = join(dataDir, "test.vsix");
      const { writeFileSync } = await import("node:fs");
      writeFileSync(vsixPath, "fake-vsix-content");

      await installer.installFromVsix(vsixPath);

      const state = installer.getInstallState();
      expect(state.some((e) => e.state === "installed")).toBe(true);
    });

    it("should fail if VSIX file does not exist", async () => {
      await installer.installFromVsix("/nonexistent/path.vsix");

      const state = installer.getInstallState();
      expect(state.some((e) => e.state === "failed")).toBe(true);
    });

    it("should fail if file does not end in .vsix", async () => {
      const badPath = join(dataDir, "test.zip");
      const { writeFileSync } = await import("node:fs");
      writeFileSync(badPath, "fake-content");

      await installer.installFromVsix(badPath);

      const state = installer.getInstallState();
      expect(state.some((e) => e.state === "failed")).toBe(true);
    });
  });

  describe("GitHub API URL construction", () => {
    it("should call correct GitHub API URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          assets: [
            {
              name: "ext.vsix",
              browser_download_url: "https://example.com/ext.vsix",
            },
          ],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      await installer.installFromGitHub("aventre-labs/claudeos-sessions", "v0.1.0");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/aventre-labs/claudeos-sessions/releases/tags/v0.1.0",
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: "application/vnd.github.v3+json",
          }),
        }),
      );
    });
  });

  describe("getPendingExtensions", () => {
    it("should return failed extensions for retry", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Server Error",
      });

      await installer.installFromGitHub("org/failing", "v1.0.0");

      const pending = installer.getPendingExtensions();
      expect(pending).toHaveLength(1);
      expect(pending[0].state).toBe("failed");
      expect(pending[0].name).toBe("org/failing");
    });

    it("should not return installed extensions", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          assets: [
            {
              name: "ext.vsix",
              browser_download_url: "https://example.com/ext.vsix",
            },
          ],
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      await installer.installFromGitHub("org/success", "v1.0.0");

      const pending = installer.getPendingExtensions();
      expect(pending).toHaveLength(0);
    });
  });

  describe("state persistence", () => {
    it("should persist install state to disk", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await installer.installFromGitHub("org/test", "v1.0.0");

      // Create new installer from same dataDir
      const installer2 = new ExtensionInstaller(dataDir);
      const state = installer2.getInstallState();
      expect(state).toHaveLength(1);
      expect(state[0].name).toBe("org/test");
    });
  });
});
