// ============================================================
// ClaudeOS Supervisor - Extension Installer
// ============================================================
// Extension install pipeline: GitHub release, build-from-source, local VSIX.
// Per-extension install tracking with state transitions:
//   pending -> downloading -> installing -> installed/failed
// ============================================================

import { execFile } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import type { ExtensionRecord, ExtensionInstallState } from "../types.js";

interface InstallStateData {
  [id: string]: ExtensionRecord;
}

export class ExtensionInstaller {
  private readonly statePath: string;
  private state: InstallStateData;

  constructor(dataDir: string) {
    const extDir = join(dataDir, "extensions");
    mkdirSync(extDir, { recursive: true });

    this.statePath = join(extDir, "install-state.json");

    // Load existing install state
    if (existsSync(this.statePath)) {
      this.state = JSON.parse(readFileSync(this.statePath, "utf-8"));
    } else {
      this.state = {};
    }
  }

  /**
   * Persist install state to disk.
   */
  private persistState(): void {
    writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
  }

  /**
   * Update the state for a specific extension.
   */
  private updateState(
    id: string,
    name: string,
    version: string,
    method: ExtensionRecord["method"],
    installState: ExtensionInstallState,
    error?: string,
  ): void {
    this.state[id] = {
      id,
      name,
      version,
      method,
      state: installState,
      installedAt:
        installState === "installed"
          ? new Date().toISOString()
          : this.state[id]?.installedAt,
      error: installState === "failed" ? error : undefined,
    };
    this.persistState();
  }

  /**
   * Run code-server --install-extension with a VSIX file path.
   */
  private async runCodeServerInstall(vsixPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      execFile(
        "code-server",
        ["--install-extension", vsixPath],
        { timeout: 120_000 },
        (err, _stdout, stderr) => {
          if (err) {
            reject(new Error(`code-server install failed: ${err.message}${stderr ? ` (${stderr})` : ""}`));
          } else {
            resolve();
          }
        },
      );
    });
  }

  /**
   * Install extension from a GitHub release.
   * Fetches the VSIX asset from the release and installs it.
   */
  async installFromGitHub(repo: string, tag: string, token?: string): Promise<void> {
    const id = `github:${repo}@${tag}`;
    const name = repo;
    const version = tag;

    this.updateState(id, name, version, "github-release", "downloading");

    try {
      // Fetch release info from GitHub API
      const apiUrl = `https://api.github.com/repos/${repo}/releases/tags/${tag}`;
      const apiHeaders: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "ClaudeOS-Supervisor",
      };
      if (token) {
        apiHeaders.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(apiUrl, {
        headers: apiHeaders,
      });

      if (!response.ok) {
        throw new Error(
          `GitHub API returned ${response.status} ${response.statusText}`,
        );
      }

      const release = (await response.json()) as {
        assets: Array<{ name: string; browser_download_url: string }>;
      };

      // Find VSIX asset
      const vsixAsset = release.assets.find((a) =>
        a.name.endsWith(".vsix"),
      );

      if (!vsixAsset) {
        throw new Error(
          `No VSIX asset found in release ${tag} for ${repo}`,
        );
      }

      // Download VSIX to temp directory
      this.updateState(id, name, version, "github-release", "downloading");

      const vsixResponse = await fetch(vsixAsset.browser_download_url, token ? {
        headers: { Authorization: `Bearer ${token}` },
      } : undefined);
      if (!vsixResponse.ok) {
        throw new Error(
          `Failed to download VSIX: ${vsixResponse.status}`,
        );
      }

      const vsixData = await vsixResponse.arrayBuffer();
      const tmpVsixPath = join(tmpdir(), `${basename(vsixAsset.name)}`);
      writeFileSync(tmpVsixPath, Buffer.from(vsixData));

      // Install VSIX
      this.updateState(id, name, version, "github-release", "installing");
      await this.runCodeServerInstall(tmpVsixPath);

      this.updateState(id, name, version, "github-release", "installed");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      this.updateState(
        id,
        name,
        version,
        "github-release",
        "failed",
        message,
      );
    }
  }

  /**
   * Install extension from source directory.
   * Runs npm install, compile, package, then installs the resulting VSIX.
   */
  async installFromSource(localPath: string): Promise<void> {
    const id = `source:${localPath}`;
    const name = basename(localPath);
    const version = "source";

    this.updateState(id, name, version, "build-from-source", "installing");

    try {
      // Build: npm install && npm run compile && npm run package
      await new Promise<void>((resolve, reject) => {
        execFile(
          "npm",
          ["install"],
          { cwd: localPath, timeout: 120_000 },
          (err) => {
            if (err) reject(new Error(`npm install failed: ${err.message}`));
            else resolve();
          },
        );
      });

      await new Promise<void>((resolve, reject) => {
        execFile(
          "npm",
          ["run", "compile"],
          { cwd: localPath, timeout: 120_000 },
          (err) => {
            if (err) reject(new Error(`npm run compile failed: ${err.message}`));
            else resolve();
          },
        );
      });

      await new Promise<void>((resolve, reject) => {
        execFile(
          "npm",
          ["run", "package"],
          { cwd: localPath, timeout: 120_000 },
          (err) => {
            if (err) reject(new Error(`npm run package failed: ${err.message}`));
            else resolve();
          },
        );
      });

      // Find .vsix file in localPath
      const { readdirSync } = await import("node:fs");
      const files = readdirSync(localPath);
      const vsixFile = files.find((f) => f.endsWith(".vsix"));

      if (!vsixFile) {
        throw new Error(`No .vsix file found in ${localPath} after build`);
      }

      const vsixPath = join(localPath, vsixFile);
      await this.runCodeServerInstall(vsixPath);

      this.updateState(id, name, version, "build-from-source", "installed");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      this.updateState(
        id,
        name,
        version,
        "build-from-source",
        "failed",
        message,
      );
    }
  }

  /**
   * Install extension from a local VSIX file.
   */
  async installFromVsix(vsixPath: string): Promise<void> {
    const id = `vsix:${basename(vsixPath)}`;
    const name = basename(vsixPath, ".vsix");
    const version = "local";

    try {
      // Validate file exists and ends in .vsix
      if (!vsixPath.endsWith(".vsix")) {
        throw new Error(`File must end in .vsix: ${vsixPath}`);
      }

      if (!existsSync(vsixPath)) {
        throw new Error(`VSIX file not found: ${vsixPath}`);
      }

      this.updateState(id, name, version, "local-vsix", "installing");
      await this.runCodeServerInstall(vsixPath);

      this.updateState(id, name, version, "local-vsix", "installed");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      this.updateState(id, name, version, "local-vsix", "failed", message);
    }
  }

  /**
   * Run code-server --uninstall-extension with an extension ID.
   */
  private async runCodeServerUninstall(extensionName: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      execFile(
        "code-server",
        ["--uninstall-extension", extensionName],
        { timeout: 120_000 },
        (err, _stdout, stderr) => {
          if (err) {
            reject(new Error(`code-server uninstall failed: ${err.message}${stderr ? ` (${stderr})` : ""}`));
          } else {
            resolve();
          }
        },
      );
    });
  }

  /**
   * Uninstall a previously installed extension.
   * Removes from code-server and deletes install state record.
   */
  async uninstallExtension(id: string): Promise<void> {
    const record = this.state[id];
    if (!record) {
      throw new Error(`Extension not found: ${id}`);
    }

    // Use the name field for code-server uninstall command
    await this.runCodeServerUninstall(record.name);

    delete this.state[id];
    this.persistState();
  }

  /**
   * Get the current install state of all extensions.
   */
  getInstallState(): ExtensionRecord[] {
    return Object.values(this.state);
  }

  /**
   * Get extensions in pending, downloading, or failed states (for retry on boot).
   */
  getPendingExtensions(): ExtensionRecord[] {
    return Object.values(this.state).filter(
      (ext) =>
        ext.state === "pending" ||
        ext.state === "downloading" ||
        ext.state === "failed",
    );
  }
}
