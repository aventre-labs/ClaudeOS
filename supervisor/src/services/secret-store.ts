// ============================================================
// ClaudeOS Supervisor - Secret Store
// ============================================================
// AES-256-GCM encrypted secret storage with CRUD operations.
// Uses a random master key (NOT derived from password).
// Each encrypt operation uses a unique random 96-bit IV.
// ============================================================

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { join, dirname } from "node:path";
import type { Secret, SecretEntry } from "../types.js";

interface EncryptResult {
  encrypted: string;
  iv: string;
  authTag: string;
}

interface SecretsData {
  [name: string]: SecretEntry;
}

export class SecretStore {
  private readonly masterKey: Buffer;
  private readonly secretsPath: string;
  private secrets: SecretsData;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(dataDir: string) {
    const authPath = join(dataDir, "config", "auth.json");

    if (!existsSync(authPath)) {
      throw new Error(
        `Auth config not found at ${authPath}. Run first-boot setup to generate encryption key.`,
      );
    }

    const authData = JSON.parse(readFileSync(authPath, "utf-8"));

    if (!authData.encryptionKey) {
      throw new Error(
        "No encryption key found in auth.json. Run first-boot setup to generate encryption key.",
      );
    }

    this.masterKey = Buffer.from(authData.encryptionKey, "hex");
    this.secretsPath = join(dataDir, "secrets", "secrets.json");

    // Ensure secrets directory exists
    mkdirSync(dirname(this.secretsPath), { recursive: true });

    // Load existing secrets
    if (existsSync(this.secretsPath)) {
      this.secrets = JSON.parse(readFileSync(this.secretsPath, "utf-8"));
    } else {
      this.secrets = {};
    }
  }

  /**
   * Factory method that returns null instead of throwing when auth.json
   * is missing or invalid. Used for lazy initialization in routes.
   */
  static tryCreate(dataDir: string): SecretStore | null {
    const authPath = join(dataDir, "config", "auth.json");
    if (!existsSync(authPath)) return null;
    try {
      return new SecretStore(dataDir);
    } catch {
      return null;
    }
  }

  /**
   * Generate a random 256-bit master encryption key.
   * Used during first-boot to create the key stored on persistent volume.
   */
  static generateMasterKey(): string {
    return randomBytes(32).toString("hex");
  }

  /**
   * Encrypt a plaintext string with AES-256-GCM.
   * Each call generates a unique random 96-bit (12-byte) IV.
   */
  private encrypt(plaintext: string): EncryptResult {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.masterKey, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
    };
  }

  /**
   * Decrypt a ciphertext with AES-256-GCM.
   */
  private decrypt(encrypted: string, ivHex: string, authTagHex: string): string {
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = createDecipheriv("aes-256-gcm", this.masterKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Persist secrets to disk atomically (write to temp, then rename).
   */
  private async persistToDisk(): Promise<void> {
    // Serialize writes to prevent corruption on concurrent access
    this.writeQueue = this.writeQueue.then(() => {
      const tmpPath = this.secretsPath + ".tmp";
      writeFileSync(tmpPath, JSON.stringify(this.secrets, null, 2));
      renameSync(tmpPath, this.secretsPath);
    });
    return this.writeQueue;
  }

  /**
   * Store a secret. Encrypts the value with AES-256-GCM.
   */
  async set(
    name: string,
    value: string,
    category?: string,
    tags?: string[],
  ): Promise<void> {
    const now = new Date().toISOString();
    const { encrypted, iv, authTag } = this.encrypt(value);

    const existing = this.secrets[name];

    this.secrets[name] = {
      name,
      category,
      tags,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      encrypted,
      iv,
      authTag,
    };

    await this.persistToDisk();
  }

  /**
   * Retrieve and decrypt a secret value.
   * Throws if the secret does not exist.
   */
  async get(name: string): Promise<string> {
    const entry = this.secrets[name];
    if (!entry) {
      throw new Error(`Secret "${name}" not found`);
    }

    return this.decrypt(entry.encrypted, entry.iv, entry.authTag);
  }

  /**
   * Check if a secret exists.
   */
  async has(name: string): Promise<boolean> {
    return name in this.secrets;
  }

  /**
   * Delete a secret.
   */
  async delete(name: string): Promise<void> {
    delete this.secrets[name];
    await this.persistToDisk();
  }

  /**
   * List all secrets WITHOUT their encrypted values.
   * Returns only name, category, tags, and timestamps.
   */
  async list(): Promise<Secret[]> {
    return Object.values(this.secrets).map((entry) => ({
      name: entry.name,
      category: entry.category,
      tags: entry.tags,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }));
  }
}
