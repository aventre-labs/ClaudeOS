// ============================================================
// SecretsTreeProvider Tests
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TreeItemCollapsibleState,
  ThemeIcon,
} from "vscode";
import { SecretsTreeProvider } from "../../src/sidebar/secrets-tree.js";
import type { SecretMeta } from "../../src/types.js";

const mockSecrets: SecretMeta[] = [
  { name: "ANTHROPIC_API_KEY", category: "api", tags: ["prod"], createdAt: "2026-01-01", updatedAt: "2026-01-01" },
  { name: "GITHUB_PAT", category: "api", tags: [], createdAt: "2026-01-02", updatedAt: "2026-01-02" },
  { name: "DB_PASSWORD", category: "database", createdAt: "2026-01-03", updatedAt: "2026-01-03" },
  { name: "MISC_SECRET", createdAt: "2026-01-04", updatedAt: "2026-01-04" },
];

describe("SecretsTreeProvider", () => {
  let provider: SecretsTreeProvider;

  beforeEach(() => {
    provider = new SecretsTreeProvider();
  });

  describe("getChildren", () => {
    it("returns category groups when called with no element (root)", async () => {
      provider.update(mockSecrets);

      const children = await provider.getChildren(undefined);

      // Should have 3 categories: api, database, Uncategorized
      expect(children).toHaveLength(3);
      expect(children.every((c) => c.type === "category")).toBe(true);
      const categories = children.map((c) => {
        if (c.type === "category") return c.category;
        return "";
      });
      expect(categories).toContain("api");
      expect(categories).toContain("database");
      expect(categories).toContain("Uncategorized");
    });

    it("returns secrets in a category when called with a category element", async () => {
      provider.update(mockSecrets);

      const apiCategory = { type: "category" as const, category: "api" };
      const children = await provider.getChildren(apiCategory);

      expect(children).toHaveLength(2);
      expect(children.every((c) => c.type === "secret")).toBe(true);
    });

    it("groups uncategorized secrets under 'Uncategorized'", async () => {
      provider.update(mockSecrets);

      const uncategorized = { type: "category" as const, category: "Uncategorized" };
      const children = await provider.getChildren(uncategorized);

      expect(children).toHaveLength(1);
      if (children[0].type === "secret") {
        expect(children[0].secret.name).toBe("MISC_SECRET");
      }
    });

    it("returns empty array when no secrets loaded", async () => {
      const children = await provider.getChildren(undefined);
      expect(children).toHaveLength(0);
    });
  });

  describe("getTreeItem", () => {
    it("returns TreeItem with lock icon for secrets", () => {
      const element = { type: "secret" as const, secret: mockSecrets[0] };
      const item = provider.getTreeItem(element);

      expect(item.label).toBe("ANTHROPIC_API_KEY");
      expect(item.iconPath).toBeInstanceOf(ThemeIcon);
      expect((item.iconPath as ThemeIcon).id).toBe("lock");
      expect(item.collapsibleState).toBe(TreeItemCollapsibleState.None);
      expect(item.contextValue).toBe("secret");
    });

    it("includes command to open editor on secret items", () => {
      const element = { type: "secret" as const, secret: mockSecrets[0] };
      const item = provider.getTreeItem(element);

      expect(item.command).toBeDefined();
      expect(item.command!.command).toBe("claudeos.secrets.openEditor");
      expect(item.command!.arguments).toEqual(["ANTHROPIC_API_KEY"]);
    });

    it("returns TreeItem with key icon for categories", () => {
      const element = { type: "category" as const, category: "api" };
      const item = provider.getTreeItem(element);

      expect(item.label).toBe("api");
      expect(item.iconPath).toBeInstanceOf(ThemeIcon);
      expect((item.iconPath as ThemeIcon).id).toBe("key");
      expect(item.collapsibleState).toBe(TreeItemCollapsibleState.Expanded);
    });
  });

  describe("update", () => {
    it("fires onDidChangeTreeData when update is called", async () => {
      const listener = vi.fn();
      provider.onDidChangeTreeData(listener);

      provider.update(mockSecrets);

      expect(listener).toHaveBeenCalled();
    });
  });

  describe("dispose", () => {
    it("can be disposed without error", () => {
      expect(() => provider.dispose()).not.toThrow();
    });
  });
});
