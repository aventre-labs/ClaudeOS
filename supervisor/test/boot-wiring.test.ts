// ============================================================
// Boot Wiring Tests
// ============================================================
// Verify BootService is properly wired from the boot() function.
// Tests pre-server setup (first-boot) and post-server boot sequence.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Track calls via module-level arrays (safe for hoisted vi.mock)
const calls: string[] = [];
let isConfiguredReturn = true;

vi.mock("../src/services/boot.js", () => ({
  BootService: class MockBootService {
    constructor(opts: unknown) {
      calls.push("BootService.constructor");
    }
    isConfigured() {
      calls.push("BootService.isConfigured");
      return isConfiguredReturn;
    }
    async serveSetupPage(port: number) {
      calls.push(`BootService.serveSetupPage(${port})`);
    }
    async installExtensions() {
      calls.push("BootService.installExtensions");
    }
    async startCodeServer() {
      calls.push("BootService.startCodeServer");
    }
  },
}));

vi.mock("../src/services/extension-installer.js", () => ({
  ExtensionInstaller: class MockExtensionInstaller {
    constructor() {}
  },
}));

vi.mock("../src/server.js", () => ({
  buildServer: vi.fn().mockResolvedValue({
    listen: vi.fn().mockImplementation(async () => {
      calls.push("server.listen");
    }),
    close: vi.fn().mockResolvedValue(undefined),
    decorate: vi.fn(),
    log: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      bind: vi.fn().mockReturnThis(),
    },
    extensionInstaller: {},
    setBootState: vi.fn(),
  }),
}));

import { boot } from "../src/index.js";

describe("boot() wiring", () => {
  beforeEach(() => {
    calls.length = 0;
    isConfiguredReturn = true;
  });

  it("when isDryRun=false and isConfigured()=true, calls installExtensions and startCodeServer after listen", async () => {
    await boot({ dataDir: "/tmp/test-data", isDryRun: false, port: 3100 });

    expect(calls).toContain("BootService.constructor");
    expect(calls).toContain("BootService.isConfigured");
    expect(calls).not.toContain(expect.stringContaining("serveSetupPage"));
    expect(calls).toContain("server.listen");
    expect(calls).toContain("BootService.installExtensions");
    expect(calls).toContain("BootService.startCodeServer");

    // installExtensions and startCodeServer must come AFTER server.listen
    const listenIdx = calls.indexOf("server.listen");
    const installIdx = calls.indexOf("BootService.installExtensions");
    const startIdx = calls.indexOf("BootService.startCodeServer");
    expect(installIdx).toBeGreaterThan(listenIdx);
    expect(startIdx).toBeGreaterThan(listenIdx);
  });

  it("when isDryRun=false and isConfigured()=false, calls serveSetupPage before listen", async () => {
    isConfiguredReturn = false;

    await boot({ dataDir: "/tmp/test-data", isDryRun: false, port: 3100 });

    expect(calls).toContain("BootService.serveSetupPage(3100)");
    expect(calls).toContain("server.listen");

    // serveSetupPage must come BEFORE server.listen
    const setupIdx = calls.indexOf("BootService.serveSetupPage(3100)");
    const listenIdx = calls.indexOf("server.listen");
    expect(setupIdx).toBeLessThan(listenIdx);

    // Post-listen boot still runs
    expect(calls).toContain("BootService.installExtensions");
    expect(calls).toContain("BootService.startCodeServer");
  });

  it("when isDryRun=true, BootService is NOT constructed and no boot sequence runs", async () => {
    await boot({ dataDir: "/tmp/test-data", isDryRun: true, port: 3100 });

    expect(calls).not.toContain("BootService.constructor");
    expect(calls).not.toContain("BootService.isConfigured");
    expect(calls).not.toContain(expect.stringContaining("serveSetupPage"));
    expect(calls).not.toContain("BootService.installExtensions");
    expect(calls).not.toContain("BootService.startCodeServer");
    // Server still starts
    expect(calls).toContain("server.listen");
  });
});
