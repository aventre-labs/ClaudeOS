// ============================================================
// ClaudeOS Supervisor - Boot Service
// ============================================================
// Boot sequence: first-boot detection, setup page serving,
// extension install, code-server launch.
//
// Boot states: initializing -> setup -> installing -> ready -> ok
// ============================================================

import { createServer, type Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  readFileSync,
  mkdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { BootState } from "../types.js";
import type { ExtensionInstaller } from "./extension-installer.js";

type DefaultExtension =
  | { method: "github-release"; repo: string; tag: string }
  | { method: "local-vsix"; localPath: string };

interface BootServiceOptions {
  dataDir: string;
  extensionInstaller: ExtensionInstaller;
  setBootState: (state: BootState) => void;
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
}

export class BootService {
  private readonly dataDir: string;
  private readonly configDir: string;
  private readonly extensionInstaller: ExtensionInstaller;
  private readonly setBootState: (state: BootState) => void;
  private readonly logger: { info: (msg: string) => void; error: (msg: string) => void };
  private codeServerProcess: ChildProcess | null = null;
  private setupInProgress = false;

  constructor(options: BootServiceOptions) {
    this.dataDir = options.dataDir;
    this.configDir = join(options.dataDir, "config");
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
   * Check if the system has been configured (CLAUDEOS_AUTH_TOKEN env var is set).
   */
  isConfigured(): boolean {
    return Boolean(process.env.CLAUDEOS_AUTH_TOKEN);
  }

  /**
   * Serve the first-boot setup page and wait for instance claim.
   * Returns a Promise that resolves when setup is complete.
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

        // Handle instance claim
        if (req.method === "POST" && req.url === "/api/v1/setup") {
          // Mutex: reject if already configured or setup in progress
          if (this.isConfigured()) {
            res.writeHead(409, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Instance already claimed" }));
            return;
          }
          if (this.setupInProgress) {
            res.writeHead(409, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Setup already in progress" }));
            return;
          }
          this.setupInProgress = true;

          try {
            this.logger.info("Instance claimed, proceeding with setup");
            this.setBootState("installing");

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));

            // Close the setup server and resolve
            // Note: setupInProgress stays true — once claimed, subsequent
            // requests (from already-accepted connections) get 409.
            setupServer.close(() => {
              resolvePromise();
            });
          } catch (err) {
            this.setupInProgress = false;
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Setup error: ${message}`);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal server error" }));
          }
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
      // Compute extension name for skip/fail-fast logic
      const extName = ext.method === "local-vsix"
        ? ext.localPath.split("/").pop()?.replace(".vsix", "") ?? ext.localPath
        : ext.repo;

      // Skip already-installed extensions, retry failed ones
      const allState = this.extensionInstaller.getInstallState();
      const existing = allState.find((e) => e.name === extName);
      if (existing?.state === "installed" && !pendingNames.has(extName)) {
        this.logger.info(`Extension ${extName} already installed, skipping`);
        continue;
      }

      if (ext.method === "local-vsix") {
        this.logger.info(`Installing local extension: ${ext.localPath}`);
        await this.extensionInstaller.installFromVsix(ext.localPath);
      } else {
        this.logger.info(`Installing extension: ${ext.repo}@${ext.tag}`);
        await this.extensionInstaller.installFromGitHub(ext.repo, ext.tag);
      }

      // Check if install failed (fail-fast)
      const state = this.extensionInstaller.getInstallState();
      const record = state.find((e) => e.name === extName);
      if (record?.state === "failed") {
        throw new Error(
          `Extension install failed for ${extName}: ${record.error}`,
        );
      }
    }

    this.logger.info("All default extensions installed");
    this.setBootState("ready");
  }

  /**
   * Start code-server as a child process with CLAUDEOS_AUTH_TOKEN as password.
   */
  async startCodeServer(options?: {
    port?: number;
    productJsonPath?: string;
    userDataDir?: string;
  }): Promise<void> {
    const port = options?.port ?? 8080;
    const password = process.env.CLAUDEOS_AUTH_TOKEN;

    if (!password) {
      throw new Error("CLAUDEOS_AUTH_TOKEN required to start code-server");
    }

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
