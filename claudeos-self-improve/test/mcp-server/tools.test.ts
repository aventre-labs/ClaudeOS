// ============================================================
// MCP Server Tools - Unit Tests
// ============================================================
// Tests for the 4 MCP tool handler functions.
// Mocks global fetch to verify supervisor API delegation.
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleInstall,
  handleUninstall,
  handleList,
  handleTemplate,
  TEMPLATE_REPO,
} from "../../mcp-server/src/tools.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("install_extension handler", () => {
  it("sends POST to /api/v1/extensions/install with correct body fields", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "ext-1", name: "test-ext", state: "installed" }),
    });

    await handleInstall({ method: "github-release", repo: "owner/repo", tag: "v1.0.0" });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3100/api/v1/extensions/install",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.method).toBe("github-release");
    expect(body.repo).toBe("owner/repo");
    expect(body.tag).toBe("v1.0.0");
  });

  it("includes repo and tag for github-release method", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "ext-1", name: "test-ext" }),
    });

    await handleInstall({ method: "github-release", repo: "org/ext", tag: "v2.0.0" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.repo).toBe("org/ext");
    expect(body.tag).toBe("v2.0.0");
  });

  it("includes localPath for build-from-source method", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "ext-1", name: "local-ext" }),
    });

    await handleInstall({ method: "build-from-source", localPath: "/workspace/my-ext" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.method).toBe("build-from-source");
    expect(body.localPath).toBe("/workspace/my-ext");
    expect(body.repo).toBeUndefined();
  });

  it("returns formatted JSON result on success", async () => {
    const result = { id: "ext-1", name: "test-ext", state: "installed", version: "1.0.0" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(result),
    });

    const response = await handleInstall({ method: "github-release", repo: "o/r", tag: "v1" });
    expect(response).toBe(JSON.stringify(result, null, 2));
  });

  it("returns error message on fetch failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const response = await handleInstall({ method: "github-release", repo: "o/r", tag: "v1" });
    expect(response).toContain("Install failed");
    expect(response).toContain("Internal Server Error");
  });
});

describe("uninstall_extension handler", () => {
  it("sends DELETE to /api/v1/extensions/{encoded_id}", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await handleUninstall({ extensionId: "claudeos.claudeos-memory" });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3100/api/v1/extensions/claudeos.claudeos-memory",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("returns success message when DELETE succeeds", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const response = await handleUninstall({ extensionId: "claudeos.claudeos-memory" });
    expect(response).toContain("claudeos.claudeos-memory");
    expect(response).toContain("uninstalled");
  });

  it("returns error message when DELETE fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve("Extension not found"),
    });

    const response = await handleUninstall({ extensionId: "unknown.ext" });
    expect(response).toContain("Uninstall failed");
    expect(response).toContain("Extension not found");
  });
});

describe("list_extensions handler", () => {
  it("sends GET to /api/v1/extensions", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await handleList();

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:3100/api/v1/extensions");
  });

  it("returns formatted JSON array of extensions", async () => {
    const extensions = [
      { id: "ext-1", name: "ext-a", state: "installed" },
      { id: "ext-2", name: "ext-b", state: "installed" },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(extensions),
    });

    const response = await handleList();
    expect(response).toBe(JSON.stringify(extensions, null, 2));
  });
});

describe("get_extension_template handler", () => {
  it("returns the aventre-labs/claudeos-extension-template GitHub URL", async () => {
    const response = await handleTemplate();
    expect(response).toBe("https://github.com/aventre-labs/claudeos-extension-template");
  });

  it("TEMPLATE_REPO constant has the correct value", () => {
    expect(TEMPLATE_REPO).toBe("https://github.com/aventre-labs/claudeos-extension-template");
  });
});
