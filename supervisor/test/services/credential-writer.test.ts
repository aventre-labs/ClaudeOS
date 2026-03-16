// ============================================================
// ClaudeOS Supervisor - CredentialWriter Tests
// ============================================================
// Tests credential writing to native config locations.
// Uses tmp directories to avoid touching real config files.
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CredentialWriter } from "../../src/services/credential-writer.js";

describe("CredentialWriter", () => {
  let tmpHome: string;
  let savedHome: string | undefined;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "claudeos-cred-test-"));
    savedHome = process.env.HOME;
    process.env.HOME = tmpHome;
  });

  afterEach(() => {
    if (savedHome !== undefined) {
      process.env.HOME = savedHome;
    }
  });

  describe("writeAnthropicKey", () => {
    it("writes ANTHROPIC_API_KEY to ~/.claude/settings.json", async () => {
      const writer = new CredentialWriter();
      await writer.writeAnthropicKey("sk-ant-test-key-123");

      const settingsPath = join(tmpHome, ".claude", "settings.json");
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      expect(settings.env.ANTHROPIC_API_KEY).toBe("sk-ant-test-key-123");
    });

    it("creates ~/.claude/ directory if it does not exist", async () => {
      const writer = new CredentialWriter();
      await writer.writeAnthropicKey("sk-ant-test-key");

      const settingsPath = join(tmpHome, ".claude", "settings.json");
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      expect(settings.env.ANTHROPIC_API_KEY).toBe("sk-ant-test-key");
    });

    it("merges with existing settings (does not overwrite other keys)", async () => {
      const claudeDir = join(tmpHome, ".claude");
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(
        join(claudeDir, "settings.json"),
        JSON.stringify({ theme: "dark", env: { OTHER_KEY: "keep-me" } }),
      );

      const writer = new CredentialWriter();
      await writer.writeAnthropicKey("sk-ant-merged-key");

      const settings = JSON.parse(
        readFileSync(join(claudeDir, "settings.json"), "utf-8"),
      );
      expect(settings.theme).toBe("dark");
      expect(settings.env.OTHER_KEY).toBe("keep-me");
      expect(settings.env.ANTHROPIC_API_KEY).toBe("sk-ant-merged-key");
    });

    it("handles corrupted existing settings.json gracefully", async () => {
      const claudeDir = join(tmpHome, ".claude");
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, "settings.json"), "NOT VALID JSON{{{");

      const writer = new CredentialWriter();
      await writer.writeAnthropicKey("sk-ant-fresh-key");

      const settings = JSON.parse(
        readFileSync(join(claudeDir, "settings.json"), "utf-8"),
      );
      expect(settings.env.ANTHROPIC_API_KEY).toBe("sk-ant-fresh-key");
    });
  });

  describe("writeRailwayToken", () => {
    it("writes token to ~/.railway/config.json", async () => {
      const writer = new CredentialWriter();
      await writer.writeRailwayToken("railway-token-xyz");

      const configPath = join(tmpHome, ".railway", "config.json");
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(config.user.token).toBe("railway-token-xyz");
    });
  });

  describe("writeAll", () => {
    it("reads from SecretStore and writes anthropic key", async () => {
      const mockSecretStore = {
        get: vi.fn().mockResolvedValue("sk-ant-from-store"),
      };
      const mockWizardState = {
        getState: vi.fn().mockReturnValue({
          steps: { railway: { tokenStored: false }, anthropic: { completed: true } },
        }),
      };

      const writer = new CredentialWriter();
      await writer.writeAll(mockSecretStore as any, mockWizardState as any);

      expect(mockSecretStore.get).toHaveBeenCalledWith("anthropic-api-key");
      const settingsPath = join(tmpHome, ".claude", "settings.json");
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      expect(settings.env.ANTHROPIC_API_KEY).toBe("sk-ant-from-store");
    });

    it("writes railway token when tokenStored is true", async () => {
      const mockSecretStore = {
        get: vi.fn()
          .mockResolvedValueOnce("sk-ant-key")
          .mockResolvedValueOnce("railway-tok"),
      };
      const mockWizardState = {
        getState: vi.fn().mockReturnValue({
          steps: { railway: { tokenStored: true }, anthropic: { completed: true } },
        }),
      };

      const writer = new CredentialWriter();
      await writer.writeAll(mockSecretStore as any, mockWizardState as any);

      expect(mockSecretStore.get).toHaveBeenCalledWith("railway-token");
      const configPath = join(tmpHome, ".railway", "config.json");
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(config.user.token).toBe("railway-tok");
    });

    it("skips railway token when tokenStored is false", async () => {
      const mockSecretStore = {
        get: vi.fn().mockResolvedValue("sk-ant-key"),
      };
      const mockWizardState = {
        getState: vi.fn().mockReturnValue({
          steps: { railway: { tokenStored: false }, anthropic: { completed: true } },
        }),
      };

      const writer = new CredentialWriter();
      await writer.writeAll(mockSecretStore as any, mockWizardState as any);

      expect(mockSecretStore.get).toHaveBeenCalledTimes(1);
      expect(mockSecretStore.get).toHaveBeenCalledWith("anthropic-api-key");
    });

    it("throws if anthropic-api-key not found in SecretStore", async () => {
      const mockSecretStore = {
        get: vi.fn().mockRejectedValue(new Error('Secret "anthropic-api-key" not found')),
      };
      const mockWizardState = {
        getState: vi.fn().mockReturnValue({
          steps: { railway: { tokenStored: false }, anthropic: { completed: true } },
        }),
      };

      const writer = new CredentialWriter();
      await expect(writer.writeAll(mockSecretStore as any, mockWizardState as any)).rejects.toThrow(
        "anthropic-api-key",
      );
    });
  });
});
