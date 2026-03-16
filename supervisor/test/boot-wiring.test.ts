// ============================================================
// Boot Wiring Tests
// ============================================================
// Verify BootService is properly wired from the boot() function.
// Tests pre-server setup (first-boot), post-server boot sequence,
// and wizard-completed fast-path (credential write + auth: none).
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// Track calls via module-level arrays (safe for hoisted vi.mock)
const calls: string[] = [];
let isConfiguredReturn = true;

// Control wizard fast-path behavior
let wizardStateFileExists = false;
let wizardStateContent = "{}";

vi.mock("node:fs", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    existsSync: vi.fn((p: string) => {
      if (typeof p === "string" && p.includes("wizard-state.json")) {
        return wizardStateFileExists;
      }
      // Default: delegate to real
      return (actual.existsSync as (p: string) => boolean)(p);
    }),
    readFileSync: vi.fn((p: string, encoding?: string) => {
      if (typeof p === "string" && p.includes("wizard-state.json")) {
        return wizardStateContent;
      }
      return (actual.readFileSync as (p: string, encoding?: string) => string | Buffer)(p, encoding);
    }),
    writeFileSync: actual.writeFileSync,
    mkdirSync: actual.mkdirSync,
    renameSync: actual.renameSync,
  };
});

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
    async startCodeServer(options?: { auth?: string }) {
      const auth = options?.auth ?? "password";
      calls.push(`BootService.startCodeServer(auth:${auth})`);
    }
    getSetupServer() {
      return null;
    }
    async waitForCodeServer() {
      return true;
    }
  },
}));

vi.mock("../src/services/extension-installer.js", () => ({
  ExtensionInstaller: class MockExtensionInstaller {
    constructor() {}
  },
}));

vi.mock("../src/services/credential-writer.js", () => ({
  CredentialWriter: class MockCredentialWriter {
    async writeAll() {
      calls.push("CredentialWriter.writeAll");
    }
  },
}));

vi.mock("../src/services/wizard-state.js", () => ({
  WizardStateService: {
    create: vi.fn(() => {
      calls.push("WizardStateService.create");
      return {
        getState: () => ({
          status: "completed",
          steps: {
            railway: { completed: true, tokenStored: false },
            anthropic: { completed: true },
          },
          startedAt: "2026-01-01T00:00:00Z",
          completedAt: "2026-01-01T01:00:00Z",
        }),
        isCompleted: () => true,
      };
    }),
  },
}));

vi.mock("../src/services/secret-store.js", () => ({
  SecretStore: {
    tryCreate: vi.fn(() => {
      calls.push("SecretStore.tryCreate");
      return {
        get: vi.fn().mockResolvedValue("sk-ant-test"),
      };
    }),
  },
}));

// Mock server -- bootService property uses calls array (safe for hoisting)
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
    bootService: {
      installExtensions: vi.fn().mockImplementation(async () => {
        calls.push("BootService.installExtensions");
      }),
      startCodeServer: vi.fn().mockImplementation(async (options?: { auth?: string }) => {
        const auth = options?.auth ?? "password";
        calls.push(`BootService.startCodeServer(auth:${auth})`);
      }),
    },
  }),
}));

import { boot } from "../src/index.js";

describe("boot() wiring", () => {
  beforeEach(() => {
    calls.length = 0;
    isConfiguredReturn = true;
    wizardStateFileExists = false;
    wizardStateContent = "{}";
  });

  it("when isDryRun=false and isConfigured()=true, calls installExtensions and startCodeServer after listen", async () => {
    await boot({ dataDir: "/tmp/test-data", isDryRun: false, port: 3100 });

    expect(calls).toContain("BootService.constructor");
    expect(calls).toContain("BootService.isConfigured");
    expect(calls.some(c => c.includes("serveSetupPage"))).toBe(false);
    expect(calls).toContain("server.listen");
    expect(calls).toContain("BootService.installExtensions");
    expect(calls.some(c => c.startsWith("BootService.startCodeServer"))).toBe(true);

    // installExtensions and startCodeServer must come AFTER server.listen
    const listenIdx = calls.indexOf("server.listen");
    const installIdx = calls.indexOf("BootService.installExtensions");
    expect(installIdx).toBeGreaterThan(listenIdx);
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
  });

  it("when isDryRun=true, BootService is NOT constructed and no boot sequence runs", async () => {
    await boot({ dataDir: "/tmp/test-data", isDryRun: true, port: 3100 });

    expect(calls).not.toContain("BootService.constructor");
    expect(calls).not.toContain("BootService.isConfigured");
    expect(calls.some(c => c.includes("serveSetupPage"))).toBe(false);
    expect(calls).not.toContain("BootService.installExtensions");
    expect(calls.some(c => c.startsWith("BootService.startCodeServer"))).toBe(false);
    // Server still starts
    expect(calls).toContain("server.listen");
  });

  describe("wizard fast-path", () => {
    it("when wizard-state.json says 'completed', skips serveSetupPage and writes credentials", async () => {
      wizardStateFileExists = true;
      wizardStateContent = JSON.stringify({
        status: "completed",
        steps: {
          railway: { completed: true, tokenStored: false },
          anthropic: { completed: true, method: "api-key" },
        },
        startedAt: "2026-01-01T00:00:00Z",
        completedAt: "2026-01-01T01:00:00Z",
      });

      await boot({ dataDir: "/tmp/test-data", isDryRun: false, port: 3100 });

      // Should NOT call serveSetupPage
      expect(calls.some(c => c.includes("serveSetupPage"))).toBe(false);

      // Should call credentialWriter.writeAll
      expect(calls).toContain("CredentialWriter.writeAll");
      expect(calls).toContain("SecretStore.tryCreate");
      expect(calls).toContain("WizardStateService.create");
    });

    it("fast-path boot calls startCodeServer with auth: 'none'", async () => {
      wizardStateFileExists = true;
      wizardStateContent = JSON.stringify({
        status: "completed",
        steps: {
          railway: { completed: true, tokenStored: false },
          anthropic: { completed: true, method: "api-key" },
        },
        startedAt: "2026-01-01T00:00:00Z",
        completedAt: "2026-01-01T01:00:00Z",
      });

      await boot({ dataDir: "/tmp/test-data", isDryRun: false, port: 3100 });

      // startCodeServer should be called with auth: "none"
      expect(calls).toContain("BootService.startCodeServer(auth:none)");
    });

    it("normal boot (no wizard state) uses default auth", async () => {
      wizardStateFileExists = false;

      await boot({ dataDir: "/tmp/test-data", isDryRun: false, port: 3100 });

      // startCodeServer should use default (password) auth
      expect(calls).toContain("BootService.startCodeServer(auth:password)");
      expect(calls).not.toContain("CredentialWriter.writeAll");
    });
  });
});
