// ============================================================
// ClaudeOS Supervisor - Wizard Routes
// ============================================================
// REST+SSE endpoints for the setup wizard. Exposes auth flows
// and wizard state management as HTTP surface for Phase 12
// frontend. Rate-limited, with completion guard (410 Gone).
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import rateLimit from "@fastify/rate-limit";
import type { WizardStateService } from "../services/wizard-state.js";
import type { RailwayAuthService } from "../services/auth-railway.js";
import type { AnthropicAuthService } from "../services/auth-anthropic.js";
import { OAuthAnthropicService } from "../services/oauth-anthropic.js";
import type { SecretStore } from "../services/secret-store.js";
import type { ExtensionInstaller } from "../services/extension-installer.js";
import type { BootService } from "../services/boot.js";
import type { ExtensionRecord } from "../types.js";
import { CredentialWriter } from "../services/credential-writer.js";
import { z } from "zod";
import {
  WizardStatusResponseSchema,
  AnthropicKeyBodySchema,
  AnthropicCodeBodySchema,
  WizardCompleteResponseSchema,
  WizardLaunchResponseSchema,
  WizardGoneSchema,
  WizardErrorSchema,
  OAuthStartResponseSchema,
} from "../schemas/wizard.js";

const MessageResponseSchema = z.object({
  message: z.string(),
});

const SuccessResponseSchema = z.object({
  success: z.boolean(),
});

const ExtensionRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  method: z.enum(["github-release", "build-from-source", "local-vsix"]),
  state: z.enum(["pending", "downloading", "installing", "installed", "failed"]),
  installedAt: z.string().optional(),
  error: z.string().optional(),
});

const BuildStatusResponseSchema = z.object({
  extensions: z.array(ExtensionRecordSchema),
  installing: z.boolean(),
});

export interface WizardRouteOptions {
  wizardState: WizardStateService;
  railwayAuth: RailwayAuthService;
  anthropicAuth: AnthropicAuthService;
  secretStore: SecretStore | null;
  extensionInstaller?: ExtensionInstaller;
  bootService?: BootService;
}

export async function wizardRoutes(
  server: FastifyInstance,
  options: WizardRouteOptions,
): Promise<void> {
  const { wizardState, railwayAuth, anthropicAuth, secretStore, extensionInstaller, bootService } = options;

  // OAuth PKCE service instance (persists across requests for PKCE state)
  let oauthService: OAuthAnthropicService | null = null;

  // --- Rate Limiting ---
  await server.register(rateLimit, {
    max: 30,
    timeWindow: 60000,
  });

  // --- SSE Client Management ---
  const sseClients = new Map<string, ServerResponse>();
  const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();

  function broadcastEvent(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [, res] of sseClients) {
      res.write(payload);
    }
  }

  // --- Completion Guard ---
  // Applied as preHandler to all routes except GET /wizard/status
  function completionGuard(
    request: FastifyRequest,
    reply: FastifyReply,
    done: () => void,
  ): void {
    if (wizardState.isCompleted()) {
      reply.status(410).send({
        error: "Wizard already completed",
        statusCode: 410,
      });
      return;
    }
    done();
  }

  // --- GET /wizard/status ---
  server.get(
    "/wizard/status",
    {
      schema: {
        response: {
          200: WizardStatusResponseSchema,
        },
      },
    },
    async () => {
      return wizardState.getState();
    },
  );

  // --- POST /wizard/railway/start ---
  server.post(
    "/wizard/railway/start",
    {
      preHandler: completionGuard,
      schema: {
        response: {
          202: MessageResponseSchema,
          409: WizardErrorSchema,
          410: WizardGoneSchema,
        },
      },
    },
    async (_request, reply) => {
      if (railwayAuth.isRunning()) {
        return reply.status(409).send({
          error: "Railway login already running",
          statusCode: 409,
        });
      }

      railwayAuth.startLogin({
        onPairingInfo: (info) => {
          broadcastEvent("railway:started", {
            pairingCode: info.pairingCode,
            url: info.url,
          });
        },
        onComplete: async (result) => {
          if (result.success) {
            // Attempt to extract and store token
            let tokenStored = false;
            if (secretStore) {
              tokenStored = await railwayAuth.storeToken(secretStore);
            }
            await wizardState.completeRailwayStep(tokenStored);
            broadcastEvent("railway:complete", result);
            broadcastEvent("wizard:step-completed", {
              step: "railway",
              completedAt: new Date().toISOString(),
            });
          } else {
            broadcastEvent("railway:complete", result);
          }
        },
      });

      return reply.status(202).send({ message: "Railway login started" });
    },
  );

  // --- POST /wizard/anthropic/key ---
  server.post(
    "/wizard/anthropic/key",
    {
      preHandler: completionGuard,
      schema: {
        body: AnthropicKeyBodySchema,
        response: {
          200: SuccessResponseSchema,
          400: WizardErrorSchema,
          410: WizardGoneSchema,
        },
      },
    },
    async (request, reply) => {
      const { apiKey } = request.body as { apiKey: string };

      const result = await anthropicAuth.validateApiKey(apiKey);
      if (!result.valid) {
        return reply.status(400).send({
          error: result.error ?? "Invalid API key",
          statusCode: 400,
        });
      }

      if (secretStore) {
        await anthropicAuth.storeApiKey(apiKey, secretStore);
      }

      await wizardState.completeAnthropicStep("api-key");

      broadcastEvent("anthropic:key-validated", { success: true });
      broadcastEvent("wizard:step-completed", {
        step: "anthropic",
        completedAt: new Date().toISOString(),
      });

      return { success: true };
    },
  );

  // --- POST /wizard/anthropic/login ---
  server.post(
    "/wizard/anthropic/login",
    {
      preHandler: completionGuard,
      schema: {
        response: {
          202: MessageResponseSchema,
          409: WizardErrorSchema,
          410: WizardGoneSchema,
        },
      },
    },
    async (_request, reply) => {
      if (anthropicAuth.isRunning()) {
        return reply.status(409).send({
          error: "Claude login already running",
          statusCode: 409,
        });
      }

      anthropicAuth.startClaudeLogin({
        onLoginUrl: (url) => {
          broadcastEvent("anthropic:login-started", { url });
        },
        onComplete: async (result) => {
          if (result.success) {
            await wizardState.completeAnthropicStep("claude-login");
            broadcastEvent("anthropic:login-complete", result);
            broadcastEvent("wizard:step-completed", {
              step: "anthropic",
              completedAt: new Date().toISOString(),
            });
          } else {
            broadcastEvent("anthropic:login-complete", result);
          }
        },
      });

      return reply.status(202).send({ message: "Claude login started" });
    },
  );

  // --- POST /wizard/anthropic/code ---
  server.post(
    "/wizard/anthropic/code",
    {
      preHandler: completionGuard,
      schema: {
        body: AnthropicCodeBodySchema,
      },
    },
    async (request, reply) => {
      const { code } = request.body as { code: string };
      if (!anthropicAuth.isRunning()) {
        return reply.status(409).send({ error: "No login process running", statusCode: 409 });
      }
      const sent = anthropicAuth.submitAuthCode(code);
      if (!sent) {
        return reply.status(500).send({ error: "Failed to send code to CLI", statusCode: 500 });
      }
      return reply.send({ message: "Auth code submitted" });
    },
  );

  // --- POST /wizard/anthropic/oauth/start ---
  server.post(
    "/wizard/anthropic/oauth/start",
    {
      preHandler: completionGuard,
      schema: {
        response: {
          200: OAuthStartResponseSchema,
          410: WizardGoneSchema,
        },
      },
    },
    async () => {
      oauthService = new OAuthAnthropicService();
      const { url } = oauthService.generateAuthUrl();
      return { url };
    },
  );

  // --- POST /wizard/anthropic/oauth/callback ---
  server.post(
    "/wizard/anthropic/oauth/callback",
    {
      preHandler: completionGuard,
      schema: {
        body: AnthropicCodeBodySchema,
        response: {
          200: SuccessResponseSchema,
          400: WizardErrorSchema,
          410: WizardGoneSchema,
        },
      },
    },
    async (request, reply) => {
      const { code } = request.body as { code: string };

      if (!oauthService) {
        return reply.status(400).send({
          error: "No OAuth session active. Start OAuth flow first.",
          statusCode: 400,
        });
      }

      try {
        const tokens = await oauthService.exchangeCode(code);

        if (secretStore) {
          await secretStore.set("CLAUDE_CODE_OAUTH_TOKEN", tokens.accessToken, "auth", ["anthropic", "oauth"]);
          await secretStore.set("anthropic-refresh-token", tokens.refreshToken, "auth", ["anthropic", "oauth"]);
        }

        await wizardState.completeAnthropicStep("oauth");
        broadcastEvent("anthropic:login-complete", { success: true });
        broadcastEvent("wizard:step-completed", {
          step: "anthropic",
          completedAt: new Date().toISOString(),
        });

        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        broadcastEvent("anthropic:login-complete", { success: false, error: message });
        return reply.status(400).send({ error: message, statusCode: 400 });
      }
    },
  );

  // --- POST /wizard/anthropic/skip ---
  server.post(
    "/wizard/anthropic/skip",
    {
      preHandler: completionGuard,
    },
    async (_request, reply) => {
      await wizardState.completeAnthropicStep("skipped");
      broadcastEvent("anthropic:login-complete", { success: true });
      broadcastEvent("wizard:step-completed", {
        step: "anthropic",
        completedAt: new Date().toISOString(),
      });
      return reply.send({ message: "Anthropic step skipped" });
    },
  );

  // --- GET /wizard/events (SSE) ---
  server.get(
    "/wizard/events",
    {
      preHandler: completionGuard,
    },
    async (request, reply) => {
      const clientId = randomUUID();

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      // Send initial connected event
      reply.raw.write(
        `event: connected\ndata: ${JSON.stringify({ clientId, timestamp: Date.now() })}\n\n`,
      );

      // Register client
      sseClients.set(clientId, reply.raw);

      // Start heartbeat
      const heartbeat = setInterval(() => {
        reply.raw.write(": heartbeat\n\n");
      }, 15000);
      heartbeatTimers.set(clientId, heartbeat);

      // Cleanup on disconnect
      request.raw.on("close", () => {
        sseClients.delete(clientId);
        const timer = heartbeatTimers.get(clientId);
        if (timer) {
          clearInterval(timer);
          heartbeatTimers.delete(clientId);
        }
      });

      // Don't call reply.send() — SSE stays open
      return reply;
    },
  );

  // --- GET /wizard/build-status ---
  server.get(
    "/wizard/build-status",
    {
      schema: {
        response: {
          200: BuildStatusResponseSchema,
        },
      },
    },
    async () => {
      const extensions = extensionInstaller?.getInstallState() ?? [];
      const installing = extensions.some(
        (ext: ExtensionRecord) =>
          ext.state === "pending" ||
          ext.state === "downloading" ||
          ext.state === "installing",
      );
      return { extensions, installing };
    },
  );

  // --- Build Progress Polling ---
  if (extensionInstaller) {
    let previousStateJson = "";
    const buildPollInterval = setInterval(() => {
      const extensions = extensionInstaller.getInstallState();
      const currentJson = JSON.stringify(extensions);

      // Skip if no state change
      if (currentJson === previousStateJson) return;
      previousStateJson = currentJson;

      const total = extensions.length;
      if (total === 0) return;

      const installed = extensions.filter((e: ExtensionRecord) => e.state === "installed").length;
      const failed = extensions.find((e: ExtensionRecord) => e.state === "failed");
      const inProgress = extensions.find(
        (e: ExtensionRecord) =>
          e.state === "pending" ||
          e.state === "downloading" ||
          e.state === "installing",
      );

      if (failed) {
        broadcastEvent("build:error", { error: `Extension ${failed.name} failed: ${failed.error ?? "unknown error"}` });
        clearInterval(buildPollInterval);
        return;
      }

      if (installed === total) {
        broadcastEvent("build:complete", { timestamp: Date.now() });
        clearInterval(buildPollInterval);
        return;
      }

      if (inProgress) {
        broadcastEvent("build:progress", {
          current: inProgress.name,
          progress: installed,
          total,
        });
      }
    }, 2000);

    // Clean up polling on server close
    server.addHook("onClose", async () => {
      clearInterval(buildPollInterval);
    });
  }

  // --- POST /wizard/launch ---
  server.post(
    "/wizard/launch",
    {
      schema: {
        response: {
          200: WizardLaunchResponseSchema,
          400: WizardErrorSchema,
        },
      },
    },
    async (_request, reply) => {
      // Validate both auth steps are complete
      const state = wizardState.getState();
      if (!state.steps.railway.completed || !state.steps.anthropic.completed) {
        return reply.status(400).send({
          error: "Cannot launch: not all auth steps are completed",
          statusCode: 400,
        });
      }

      // Mark wizard as complete
      await wizardState.complete();

      // Write credentials from SecretStore to native config locations
      // Non-fatal: if Anthropic step was skipped, credentials may not exist yet
      if (secretStore) {
        try {
          const credentialWriter = new CredentialWriter();
          await credentialWriter.writeAll(secretStore, wizardState);
        } catch (err) {
          server.log.warn("Credential write skipped: %s", (err as Error).message);
        }
      }

      // NOTE: Do NOT broadcast wizard:completed -- SSE stays open for launch:ready
      // Code-server start + health check + SSE broadcast handled in background (Task 2)
      if (bootService) {
        // Fire background code-server launch (Task 2 wires this)
        void (async () => {
          try {
            const setupServer = bootService.getSetupServer();
            if (setupServer) {
              await new Promise<void>((resolve) => {
                setupServer.close(() => resolve());
              });
            }
            await bootService.startCodeServer({ auth: "none" });
            const healthy = await bootService.waitForCodeServer(8080);
            if (healthy) {
              broadcastEvent("launch:ready", { url: "/" });
            } else {
              broadcastEvent("launch:error", { error: "Code-server failed to start" });
            }
            // Force-close SSE clients after launch:ready delivered
            setTimeout(() => {
              for (const [id, res] of sseClients) {
                res.end();
                sseClients.delete(id);
              }
            }, 2000);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            broadcastEvent("launch:error", { error: message });
          }
        })();
      }

      return { success: true, message: "Launch initiated" };
    },
  );

  // --- POST /wizard/complete ---
  server.post(
    "/wizard/complete",
    {
      preHandler: completionGuard,
      schema: {
        response: {
          200: WizardCompleteResponseSchema,
          400: WizardErrorSchema,
          410: WizardGoneSchema,
        },
      },
    },
    async (_request, reply) => {
      try {
        await wizardState.complete();
      } catch (err) {
        return reply.status(400).send({
          error: (err as Error).message,
          statusCode: 400,
        });
      }

      const state = wizardState.getState();

      broadcastEvent("wizard:completed", {
        completedAt: state.completedAt,
      });

      return {
        success: true,
        completedAt: state.completedAt!,
      };
    },
  );
}
