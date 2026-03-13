// ============================================================
// Public API Tests
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPublicApi } from "../../src/api/public-api.js";
import type { SupervisorClient } from "../../src/supervisor/client.js";
import type { SecretsPublicApi, SecretMeta } from "../../src/types.js";

function createMockClient(): SupervisorClient {
  return {
    listSecrets: vi.fn(),
    getSecretValue: vi.fn(),
    createSecret: vi.fn(),
    updateSecret: vi.fn(),
    deleteSecret: vi.fn(),
    hasSecret: vi.fn(),
    setEnv: vi.fn(),
  } as unknown as SupervisorClient;
}

describe("Public API", () => {
  let client: SupervisorClient;
  let api: SecretsPublicApi;

  beforeEach(() => {
    client = createMockClient();
    api = createPublicApi(client);
  });

  it("returns an object with all 5 public methods", () => {
    expect(typeof api.getSecret).toBe("function");
    expect(typeof api.setSecret).toBe("function");
    expect(typeof api.hasSecret).toBe("function");
    expect(typeof api.deleteSecret).toBe("function");
    expect(typeof api.listSecrets).toBe("function");
  });

  describe("getSecret", () => {
    it("delegates to client.getSecretValue and returns the value", async () => {
      (client.getSecretValue as ReturnType<typeof vi.fn>).mockResolvedValueOnce("sk-12345");

      const result = await api.getSecret("ANTHROPIC_API_KEY");

      expect(client.getSecretValue).toHaveBeenCalledWith("ANTHROPIC_API_KEY");
      expect(result).toBe("sk-12345");
    });

    it("returns undefined on error", async () => {
      (client.getSecretValue as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("not found"));

      const result = await api.getSecret("nope");

      expect(result).toBeUndefined();
    });
  });

  describe("setSecret", () => {
    it("creates a new secret when it does not exist", async () => {
      (client.hasSecret as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
      (client.createSecret as ReturnType<typeof vi.fn>).mockResolvedValueOnce({} as SecretMeta);

      await api.setSecret("NEW_KEY", "value123", "api");

      expect(client.hasSecret).toHaveBeenCalledWith("NEW_KEY");
      expect(client.createSecret).toHaveBeenCalledWith("NEW_KEY", "value123", "api");
    });

    it("updates an existing secret when it already exists", async () => {
      (client.hasSecret as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
      (client.updateSecret as ReturnType<typeof vi.fn>).mockResolvedValueOnce({} as SecretMeta);

      await api.setSecret("EXISTING_KEY", "new-value", "api");

      expect(client.hasSecret).toHaveBeenCalledWith("EXISTING_KEY");
      expect(client.updateSecret).toHaveBeenCalledWith("EXISTING_KEY", "new-value", "api");
    });
  });

  describe("hasSecret", () => {
    it("delegates to client.hasSecret", async () => {
      (client.hasSecret as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

      const result = await api.hasSecret("MY_KEY");

      expect(client.hasSecret).toHaveBeenCalledWith("MY_KEY");
      expect(result).toBe(true);
    });
  });

  describe("deleteSecret", () => {
    it("delegates to client.deleteSecret", async () => {
      (client.deleteSecret as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      await api.deleteSecret("OLD_KEY");

      expect(client.deleteSecret).toHaveBeenCalledWith("OLD_KEY");
    });
  });

  describe("listSecrets", () => {
    it("calls client.listSecrets and maps to {name, category}", async () => {
      const secrets: SecretMeta[] = [
        { name: "KEY1", category: "api", tags: ["prod"], createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        { name: "KEY2", createdAt: "2026-01-02", updatedAt: "2026-01-02" },
      ];
      (client.listSecrets as ReturnType<typeof vi.fn>).mockResolvedValueOnce(secrets);

      const result = await api.listSecrets();

      expect(result).toEqual([
        { name: "KEY1", category: "api" },
        { name: "KEY2", category: undefined },
      ]);
    });
  });
});
