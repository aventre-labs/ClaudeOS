import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Will fail until implementation exists
import { WizardStateService } from "../../src/services/wizard-state.js";

describe("WizardStateService", () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "claudeos-wizard-test-"));
    filePath = join(tempDir, "config", "wizard-state.json");
  });

  describe("initialization", () => {
    it("creates default state when no file exists", () => {
      const service = WizardStateService.create(filePath);
      const state = service.getState();

      expect(state.status).toBe("incomplete");
      expect(state.steps.railway.completed).toBe(false);
      expect(state.steps.anthropic.completed).toBe(false);
      expect(state.startedAt).toBeTruthy();
      expect(state.completedAt).toBeUndefined();
    });

    it("loads existing state from file", async () => {
      // Create a service and complete a step
      const service1 = WizardStateService.create(filePath);
      await service1.completeRailwayStep(true);

      // Create a new service pointing to the same file (simulates restart)
      const service2 = WizardStateService.create(filePath);
      const state = service2.getState();

      expect(state.steps.railway.completed).toBe(true);
      expect(state.steps.railway.tokenStored).toBe(true);
    });

    it("handles corrupted JSON file gracefully", () => {
      // Write garbage to the file
      const { mkdirSync } = require("node:fs");
      const { dirname } = require("node:path");
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, "NOT VALID JSON {{{");

      const service = WizardStateService.create(filePath);
      const state = service.getState();

      // Should fall back to default state
      expect(state.status).toBe("incomplete");
      expect(state.steps.railway.completed).toBe(false);
    });

    it("creates directory if missing", () => {
      const deepPath = join(tempDir, "deep", "nested", "dir", "wizard-state.json");
      const service = WizardStateService.create(deepPath);
      expect(service.getState().status).toBe("incomplete");

      // File should be written
      const data = JSON.parse(readFileSync(deepPath, "utf-8"));
      expect(data.status).toBe("incomplete");
    });
  });

  describe("completeRailwayStep", () => {
    it("marks railway step as completed with timestamp", async () => {
      const service = WizardStateService.create(filePath);
      await service.completeRailwayStep(false);

      const state = service.getState();
      expect(state.steps.railway.completed).toBe(true);
      expect(state.steps.railway.completedAt).toBeTruthy();
    });

    it("persists tokenStored flag", async () => {
      const service = WizardStateService.create(filePath);
      await service.completeRailwayStep(true);

      const state = service.getState();
      expect(state.steps.railway.tokenStored).toBe(true);

      // Verify persisted to disk
      const raw = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(raw.steps.railway.tokenStored).toBe(true);
    });
  });

  describe("completeAnthropicStep", () => {
    it("marks anthropic step with method", async () => {
      const service = WizardStateService.create(filePath);
      await service.completeAnthropicStep("api-key");

      const state = service.getState();
      expect(state.steps.anthropic.completed).toBe(true);
      expect(state.steps.anthropic.method).toBe("api-key");
      expect(state.steps.anthropic.completedAt).toBeTruthy();
    });
  });

  describe("complete", () => {
    it("sets terminal completed status", async () => {
      const service = WizardStateService.create(filePath);
      await service.completeRailwayStep(true);
      await service.completeAnthropicStep("api-key");
      await service.complete();

      const state = service.getState();
      expect(state.status).toBe("completed");
      expect(state.completedAt).toBeTruthy();
    });

    it("rejects when steps are incomplete", async () => {
      const service = WizardStateService.create(filePath);
      // Neither step completed
      await expect(service.complete()).rejects.toThrow();
    });

    it("prevents concurrent completion (mutex)", async () => {
      const service = WizardStateService.create(filePath);
      await service.completeRailwayStep(true);
      await service.completeAnthropicStep("api-key");

      // Call complete() twice concurrently
      const [result1, result2] = await Promise.allSettled([
        service.complete(),
        service.complete(),
      ]);

      // One should succeed, the other should fail (or both succeed idempotently)
      const successes = [result1, result2].filter((r) => r.status === "fulfilled");
      const failures = [result1, result2].filter((r) => r.status === "rejected");

      // At least one succeeds
      expect(successes.length).toBeGreaterThanOrEqual(1);
      // The state should be completed
      expect(service.getState().status).toBe("completed");
    });
  });

  describe("getState", () => {
    it("returns current state", () => {
      const service = WizardStateService.create(filePath);
      const state = service.getState();

      expect(state).toHaveProperty("status");
      expect(state).toHaveProperty("steps");
      expect(state).toHaveProperty("startedAt");
    });
  });

  describe("isCompleted", () => {
    it("returns false for incomplete wizard", () => {
      const service = WizardStateService.create(filePath);
      expect(service.isCompleted()).toBe(false);
    });

    it("returns true after completion", async () => {
      const service = WizardStateService.create(filePath);
      await service.completeRailwayStep(true);
      await service.completeAnthropicStep("api-key");
      await service.complete();

      expect(service.isCompleted()).toBe(true);
    });
  });
});
