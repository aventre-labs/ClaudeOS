import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SecretStore } from "../../src/services/secret-store.js";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("SecretStore", () => {
  let dataDir: string;
  let store: SecretStore;
  let savedToken: string | undefined;

  beforeEach(() => {
    savedToken = process.env.CLAUDEOS_AUTH_TOKEN;
    dataDir = mkdtempSync(join(tmpdir(), "claudeos-secret-test-"));
    mkdirSync(join(dataDir, "config"), { recursive: true });
    mkdirSync(join(dataDir, "secrets"), { recursive: true });

    // Set auth token for tests that need a valid store
    process.env.CLAUDEOS_AUTH_TOKEN = "test-auth-token-for-encryption";
    store = new SecretStore(dataDir);
  });

  afterEach(() => {
    if (savedToken !== undefined) {
      process.env.CLAUDEOS_AUTH_TOKEN = savedToken;
    } else {
      delete process.env.CLAUDEOS_AUTH_TOKEN;
    }
  });

  describe("scrypt-derived key", () => {
    it("derives key from CLAUDEOS_AUTH_TOKEN via scryptSync", () => {
      // If we got here without throwing, the key was derived successfully
      expect(store).toBeDefined();
    });

    it("constructor throws when CLAUDEOS_AUTH_TOKEN is not set", () => {
      delete process.env.CLAUDEOS_AUTH_TOKEN;
      expect(() => new SecretStore(dataDir)).toThrow(
        "CLAUDEOS_AUTH_TOKEN not set",
      );
    });

    it("same auth token always produces same encryption key (deterministic)", async () => {
      // Encrypt with one instance
      await store.set("determinism-test", "secret-value");

      // Create a new instance with the same token
      const store2 = new SecretStore(dataDir);
      const value = await store2.get("determinism-test");
      expect(value).toBe("secret-value");
    });
  });

  describe("tryCreate", () => {
    it("returns null when CLAUDEOS_AUTH_TOKEN is not set", () => {
      delete process.env.CLAUDEOS_AUTH_TOKEN;
      const result = SecretStore.tryCreate(dataDir);
      expect(result).toBeNull();
    });

    it("returns valid instance when CLAUDEOS_AUTH_TOKEN is set", () => {
      const result = SecretStore.tryCreate(dataDir);
      expect(result).toBeInstanceOf(SecretStore);
    });
  });

  describe("encrypt/decrypt roundtrip", () => {
    it("should encrypt and decrypt a value correctly", async () => {
      await store.set("test-secret", "my-secret-value");
      const value = await store.get("test-secret");
      expect(value).toBe("my-secret-value");
    });

    it("should produce different ciphertext for same plaintext (unique IV)", async () => {
      await store.set("secret-a", "same-value");
      await store.set("secret-b", "same-value");

      // Read raw data to check IVs differ
      const secretsPath = join(dataDir, "secrets", "secrets.json");
      const data = JSON.parse(readFileSync(secretsPath, "utf-8"));
      expect(data["secret-a"].iv).not.toBe(data["secret-b"].iv);
    });
  });

  describe("CRUD operations", () => {
    it("should set and get a secret", async () => {
      await store.set("api-key", "sk-12345");
      const value = await store.get("api-key");
      expect(value).toBe("sk-12345");
    });

    it("should set a secret with category and tags", async () => {
      await store.set("api-key", "sk-12345", "api", ["openai", "production"]);
      const secrets = await store.list();
      expect(secrets).toHaveLength(1);
      expect(secrets[0].name).toBe("api-key");
      expect(secrets[0].category).toBe("api");
      expect(secrets[0].tags).toEqual(["openai", "production"]);
    });

    it("should check if a secret exists with has()", async () => {
      expect(await store.has("missing")).toBe(false);
      await store.set("exists", "value");
      expect(await store.has("exists")).toBe(true);
    });

    it("should delete a secret", async () => {
      await store.set("to-delete", "value");
      expect(await store.has("to-delete")).toBe(true);
      await store.delete("to-delete");
      expect(await store.has("to-delete")).toBe(false);
    });

    it("should update an existing secret", async () => {
      await store.set("updatable", "old-value", "cat1", ["tag1"]);
      await store.set("updatable", "new-value", "cat2", ["tag2"]);
      const value = await store.get("updatable");
      expect(value).toBe("new-value");
      const secrets = await store.list();
      const secret = secrets.find((s) => s.name === "updatable");
      expect(secret?.category).toBe("cat2");
    });

    it("should throw when getting a non-existent secret", async () => {
      await expect(store.get("nonexistent")).rejects.toThrow();
    });
  });

  describe("list()", () => {
    it("should return secrets without values", async () => {
      await store.set("secret1", "value1", "cat");
      await store.set("secret2", "value2");

      const secrets = await store.list();
      expect(secrets).toHaveLength(2);

      for (const secret of secrets) {
        expect(secret).toHaveProperty("name");
        expect(secret).toHaveProperty("createdAt");
        expect(secret).toHaveProperty("updatedAt");
        // MUST NOT expose encrypted data
        expect(secret).not.toHaveProperty("encrypted");
        expect(secret).not.toHaveProperty("iv");
        expect(secret).not.toHaveProperty("authTag");
        expect((secret as Record<string, unknown>)["value"]).toBeUndefined();
      }
    });

    it("should return empty array when no secrets exist", async () => {
      const secrets = await store.list();
      expect(secrets).toEqual([]);
    });
  });

  describe("atomic writes", () => {
    it("should persist secrets to disk", async () => {
      await store.set("persistent", "value");

      // Create new store instance from same dataDir
      const store2 = new SecretStore(dataDir);
      const value = await store2.get("persistent");
      expect(value).toBe("value");
    });
  });

  describe("error handling", () => {
    it("should throw if CLAUDEOS_AUTH_TOKEN is not set", () => {
      delete process.env.CLAUDEOS_AUTH_TOKEN;
      const emptyDir = mkdtempSync(join(tmpdir(), "claudeos-notoken-"));
      mkdirSync(join(emptyDir, "secrets"), { recursive: true });

      expect(() => new SecretStore(emptyDir)).toThrow("CLAUDEOS_AUTH_TOKEN not set");
    });
  });
});
