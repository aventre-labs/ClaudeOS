import { describe, it, expect, beforeEach, vi } from "vitest";
import { BootService } from "../../src/services/boot.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionInstaller } from "../../src/services/extension-installer.js";

function createMockInstaller(overrides: Partial<ExtensionInstaller> = {}): ExtensionInstaller {
  return {
    installFromVsix: vi.fn().mockResolvedValue(undefined),
    installFromGitHub: vi.fn().mockResolvedValue(undefined),
    getInstallState: vi.fn().mockReturnValue([]),
    getPendingExtensions: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as ExtensionInstaller;
}

describe("BootService.installExtensions", () => {
  let dataDir: string;
  let configDir: string;
  let mockInstaller: ExtensionInstaller;
  let mockSetBootState: ReturnType<typeof vi.fn>;
  let mockLogger: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    dataDir = mkdtempSync(join(tmpdir(), "claudeos-boot-test-"));
    configDir = join(dataDir, "config");
    mkdirSync(configDir, { recursive: true });
    mockInstaller = createMockInstaller();
    mockSetBootState = vi.fn();
    mockLogger = { info: vi.fn(), error: vi.fn() };
  });

  function createBootService(installer?: ExtensionInstaller): BootService {
    return new BootService({
      dataDir,
      extensionInstaller: installer ?? mockInstaller,
      setBootState: mockSetBootState,
      logger: mockLogger,
    });
  }

  it("dispatches local-vsix to installFromVsix", async () => {
    const extensions = [
      { method: "local-vsix", localPath: "/app/extensions/claudeos-sessions.vsix" },
    ];
    writeFileSync(join(configDir, "default-extensions.json"), JSON.stringify(extensions));

    const boot = createBootService();
    await boot.installExtensions();

    expect(mockInstaller.installFromVsix).toHaveBeenCalledWith(
      "/app/extensions/claudeos-sessions.vsix",
    );
  });

  it("dispatches github-release to installFromGitHub", async () => {
    const extensions = [
      { method: "github-release", repo: "org/some-ext", tag: "v1.0.0" },
    ];
    writeFileSync(join(configDir, "default-extensions.json"), JSON.stringify(extensions));

    const boot = createBootService();
    await boot.installExtensions();

    expect(mockInstaller.installFromGitHub).toHaveBeenCalledWith("org/some-ext", "v1.0.0");
  });

  it("computes extName from localPath for skip logic", async () => {
    const extensions = [
      { method: "local-vsix", localPath: "/app/extensions/claudeos-sessions.vsix" },
    ];
    writeFileSync(join(configDir, "default-extensions.json"), JSON.stringify(extensions));

    // Already installed under the basename (without .vsix)
    const installer = createMockInstaller({
      getInstallState: vi.fn().mockReturnValue([
        { name: "claudeos-sessions", state: "installed" },
      ]),
    });

    const boot = createBootService(installer);
    await boot.installExtensions();

    expect(installer.installFromVsix).not.toHaveBeenCalled();
  });

  it("skips already-installed github-release by repo name", async () => {
    const extensions = [
      { method: "github-release", repo: "org/some-ext", tag: "v1.0.0" },
    ];
    writeFileSync(join(configDir, "default-extensions.json"), JSON.stringify(extensions));

    const installer = createMockInstaller({
      getInstallState: vi.fn().mockReturnValue([
        { name: "org/some-ext", state: "installed" },
      ]),
    });

    const boot = createBootService(installer);
    await boot.installExtensions();

    expect(installer.installFromGitHub).not.toHaveBeenCalled();
  });

  it("handles empty extensions list", async () => {
    writeFileSync(join(configDir, "default-extensions.json"), JSON.stringify([]));

    const boot = createBootService();
    await boot.installExtensions();

    expect(mockSetBootState).toHaveBeenCalledWith("ready");
    expect(mockInstaller.installFromVsix).not.toHaveBeenCalled();
    expect(mockInstaller.installFromGitHub).not.toHaveBeenCalled();
  });
});
