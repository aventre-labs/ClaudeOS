import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SecretStore } from "../../src/services/secret-store.js";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("SecretStore", () => {
  let dataDir: string;
  let store: SecretStore;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "claudeos-secret-test-"));
    // Create config dir with auth.json containing a master key
    const configDir = join(dataDir, "config");
    mkdirSync(configDir, { recursive: true });

    // Generate a fake 256-bit (32 byte) master key as hex
    const masterKey = "a".repeat(64); // 32 bytes in hex
    writeFileSync(
      join(configDir, "auth.json"),
      JSON.stringify({ encryptionKey: masterKey }),
    );

    // Create secrets dir
    mkdirSync(join(dataDir, "secrets"), { recursive: true });

    store = new SecretStore(dataDir);
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
    it("should throw if no encryption key found", () => {
      const emptyDir = mkdtempSync(join(tmpdir(), "claudeos-nokey-"));
      mkdirSync(join(emptyDir, "config"), { recursive: true });
      writeFileSync(
        join(emptyDir, "config", "auth.json"),
        JSON.stringify({}),
      );
      mkdirSync(join(emptyDir, "secrets"), { recursive: true });

      expect(() => new SecretStore(emptyDir)).toThrow();
    });

    it("should throw if auth.json does not exist", () => {
      const emptyDir = mkdtempSync(join(tmpdir(), "claudeos-noauth-"));
      mkdirSync(join(emptyDir, "secrets"), { recursive: true });

      expect(() => new SecretStore(emptyDir)).toThrow();
    });
  });

  describe("generateMasterKey", () => {
    it("should generate a 64-character hex string (32 bytes)", () => {
      const key = SecretStore.generateMasterKey();
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should generate unique keys each time", () => {
      const key1 = SecretStore.generateMasterKey();
      const key2 = SecretStore.generateMasterKey();
      expect(key1).not.toBe(key2);
    });
  });
});
