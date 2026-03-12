// ============================================================
// ClaudeOS Supervisor - Boot Service
// ============================================================
// Boot sequence: first-boot detection, setup page serving,
// extension install, code-server launch.
//
// Boot states: initializing -> setup -> installing -> ready -> ok
// ============================================================

import { createServer, type Server } from "node:http";
import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { BootState } from "../types.js";
import type { ExtensionInstaller } from "./extension-installer.js";

interface AuthConfig {
  passwordHash: string;
  salt: string;
  encryptedPassword: string;
  passwordIv: string;
  passwordAuthTag: string;
  encryptionKey: string;
}

interface DefaultExtension {
  repo: string;
  tag: string;
}

interface BootServiceOptions {
  dataDir: string;
  extensionInstaller: ExtensionInstaller;
  setBootState: (state: BootState) => void;
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
}

export class BootService {
  private readonly dataDir: string;
  private readonly configDir: string;
  private readonly authPath: string;
  private readonly extensionInstaller: ExtensionInstaller;
  private readonly setBootState: (state: BootState) => void;
  private readonly logger: { info: (msg: string) => void; error: (msg: string) => void };
  private codeServerProcess: ChildProcess | null = null;

  constructor(options: BootServiceOptions) {
    this.dataDir = options.dataDir;
    this.configDir = join(options.dataDir, "config");
    this.authPath = join(this.configDir, "auth.json");
    this.extensionInstaller = options.extensionInstaller;
    this.setBootState = options.setBootState;
    this.logger = options.logger ?? {
      info: (msg: string) => console.log(`[boot] ${msg}`),
      error: (msg: string) => console.error(`[boot] ${msg}`),
    };

    // Ensure config directory exists
    mkdirSync(this.configDir, { recursive: true });
  }

  /**
   * Check if the system has been configured (auth.json exists with encryption key).
   */
  isConfigured(): boolean {
    if (!existsSync(this.authPath)) {
      return false;
    }
    try {
      const data = JSON.parse(readFileSync(this.authPath, "utf-8"));
      return Boolean(data.encryptionKey && data.passwordHash);
    } catch {
      return false;
    }
  }

  /**
   * Serve the first-boot setup page and wait for password creation.
   * Returns a Promise that resolves when the user submits their password.
   */
  async serveSetupPage(port: number): Promise<void> {
    this.setBootState("setup");

    return new Promise<void>((resolvePromise, rejectPromise) => {
      const setupServer: Server = createServer(async (req, res) => {
        // Serve the setup HTML page
        if (req.method === "GET" && (req.url === "/" || req.url === "/setup")) {
          try {
            // Look for setup.html in first-boot directory relative to project root
            const htmlPath = resolve(this.dataDir, "..", "first-boot", "setup.html");
            let html: string;

            if (existsSync(htmlPath)) {
              html = readFileSync(htmlPath, "utf-8");
            } else {
              // Fallback: try common locations
              const altPaths = [
                resolve("first-boot", "setup.html"),
                resolve(join(this.dataDir, "first-boot", "setup.html")),
              ];
              const found = altPaths.find((p) => existsSync(p));
              if (found) {
                html = readFileSync(found, "utf-8");
              } else {
                html = "<html><body><h1>Setup page not found</h1></body></html>";
              }
            }

            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(html);
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Failed to load setup page" }));
          }
          return;
        }

        // Handle health endpoint during setup
        if (req.method === "GET" && req.url === "/api/v1/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "setup", version: "0.1.0", uptime: process.uptime() }));
          return;
        }

        // Handle password creation
        if (req.method === "POST" && req.url === "/api/v1/setup") {
          let body = "";
          req.on("data", (chunk: Buffer) => {
            body += chunk.toString();
          });

          req.on("end", () => {
            try {
              const { password, confirmPassword } = JSON.parse(body);

              // Validate
              if (!password || !confirmPassword) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Password and confirmation required" }));
                return;
              }

              if (password !== confirmPassword) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Passwords do not match" }));
                return;
              }

              if (password.length < 8) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Password must be at least 8 characters" }));
                return;
              }

              // Generate master encryption key (32 bytes = 256-bit)
              const encryptionKey = randomBytes(32);

              // Hash password with scrypt for future verification
              const salt = randomBytes(16);
              const passwordHash = scryptSync(password, salt, 64);

              // Encrypt the plaintext password with master key using AES-256-GCM
              // (code-server needs the plaintext password at boot for PASSWORD env var)
              const passwordIv = randomBytes(12);
              const cipher = createCipheriv("aes-256-gcm", encryptionKey, passwordIv);
              let encryptedPassword = cipher.update(password, "utf8", "hex");
              encryptedPassword += cipher.final("hex");
              const passwordAuthTag = cipher.getAuthTag();

              // Store auth config
              const authConfig: AuthConfig = {
                passwordHash: passwordHash.toString("hex"),
                salt: salt.toString("hex"),
                encryptedPassword,
                passwordIv: passwordIv.toString("hex"),
                passwordAuthTag: passwordAuthTag.toString("hex"),
                encryptionKey: encryptionKey.toString("hex"),
              };

              mkdirSync(this.configDir, { recursive: true });
              writeFileSync(this.authPath, JSON.stringify(authConfig, null, 2));

              this.logger.info("Password set and encryption key generated");
              this.setBootState("installing");

              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true }));

              // Close the setup server and resolve
              setupServer.close(() => {
                resolvePromise();
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              this.logger.error(`Setup error: ${message}`);
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Internal server error" }));
            }
          });
          return;
        }

        // 404 for everything else
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      });

      setupServer.listen(port, "0.0.0.0", () => {
        this.logger.info(`First-boot setup page available at http://localhost:${port}`);
      });

      setupServer.on("error", (err) => {
        rejectPromise(err);
      });
    });
  }

  /**
   * Decrypt the stored plaintext password for code-server.
   */
  getStoredPassword(): string {
    if (!existsSync(this.authPath)) {
      throw new Error("Auth config not found. Run first-boot setup first.");
    }

    const authConfig: AuthConfig = JSON.parse(
      readFileSync(this.authPath, "utf-8"),
    );

    const encryptionKey = Buffer.from(authConfig.encryptionKey, "hex");
    const iv = Buffer.from(authConfig.passwordIv, "hex");
    const authTag = Buffer.from(authConfig.passwordAuthTag, "hex");

    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let password = decipher.update(authConfig.encryptedPassword, "hex", "utf8");
    password += decipher.final("utf8");

    return password;
  }

  /**
   * Install default extensions from config/default-extensions.json.
   * Fail-fast: if any install fails, halt and throw.
   * On next boot, getPendingExtensions() finds failed ones, retries only those.
   */
  async installExtensions(): Promise<void> {
    const defaultExtensionsPath = join(this.configDir, "default-extensions.json");

    let extensions: DefaultExtension[] = [];

    if (existsSync(defaultExtensionsPath)) {
      extensions = JSON.parse(readFileSync(defaultExtensionsPath, "utf-8"));
    } else {
      // Also check project config directory
      const projectConfigPath = resolve("config", "default-extensions.json");
      if (existsSync(projectConfigPath)) {
        extensions = JSON.parse(readFileSync(projectConfigPath, "utf-8"));
      }
    }

    if (extensions.length === 0) {
      this.logger.info("No default extensions to install");
      this.setBootState("ready");
      return;
    }

    // Check for previously failed extensions to retry
    const pending = this.extensionInstaller.getPendingExtensions();
    const pendingNames = new Set(pending.map((p) => p.name));

    for (const ext of extensions) {
      // Skip already-installed extensions, retry failed ones
      const allState = this.extensionInstaller.getInstallState();
      const existing = allState.find((e) => e.name === ext.repo);
      if (existing?.state === "installed" && !pendingNames.has(ext.repo)) {
        this.logger.info(`Extension ${ext.repo} already installed, skipping`);
        continue;
      }

      this.logger.info(`Installing extension: ${ext.repo}@${ext.tag}`);
      await this.extensionInstaller.installFromGitHub(ext.repo, ext.tag);

      // Check if install failed (fail-fast)
      const state = this.extensionInstaller.getInstallState();
      const record = state.find((e) => e.name === ext.repo);
      if (record?.state === "failed") {
        throw new Error(
          `Extension install failed for ${ext.repo}: ${record.error}`,
        );
      }
    }

    this.logger.info("All default extensions installed");
    this.setBootState("ready");
  }

  /**
   * Start code-server as a child process with user's password.
   */
  async startCodeServer(options?: {
    port?: number;
    productJsonPath?: string;
    userDataDir?: string;
  }): Promise<void> {
    const port = options?.port ?? 8080;
    const password = this.getStoredPassword();

    const args = [
      "--bind-addr",
      `0.0.0.0:${port}`,
      "--auth",
      "password",
    ];

    // Product.json for ClaudeOS branding (SUP-01)
    if (options?.productJsonPath) {
      args.push("--config", options.productJsonPath);
    }

    // User data dir on persistent volume
    if (options?.userDataDir) {
      args.push("--user-data-dir", options.userDataDir);
    }

    const env = {
      ...process.env,
      PASSWORD: password,
    };

    this.logger.info(`Starting code-server on port ${port}`);

    this.codeServerProcess = spawn("code-server", args, {
      env,
      stdio: "inherit",
    });

    this.codeServerProcess.on("error", (err) => {
      this.logger.error(`code-server error: ${err.message}`);
    });

    this.codeServerProcess.on("exit", (code, signal) => {
      this.logger.error(
        `code-server exited (code=${code}, signal=${signal}). Restarting...`,
      );
      // Auto-restart on crash
      if (code !== 0 && code !== null) {
        setTimeout(() => {
          void this.startCodeServer(options);
        }, 2000);
      }
    });

    this.setBootState("ok");
  }

  /**
   * Stop code-server process gracefully.
   */
  stopCodeServer(): void {
    if (this.codeServerProcess) {
      this.codeServerProcess.kill("SIGTERM");
      this.codeServerProcess = null;
    }
  }
}
