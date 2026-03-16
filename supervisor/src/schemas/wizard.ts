import { z } from "zod";

// --- Wizard Step Schemas ---

const WizardStepRailwaySchema = z.object({
  completed: z.boolean(),
  completedAt: z.string().optional(),
  tokenStored: z.boolean().optional(),
});

const WizardStepAnthropicSchema = z.object({
  completed: z.boolean(),
  completedAt: z.string().optional(),
  method: z.enum(["api-key", "claude-login"]).optional(),
});

// --- Wizard Status Response ---

export const WizardStatusResponseSchema = z.object({
  status: z.enum(["incomplete", "completed"]),
  steps: z.object({
    railway: WizardStepRailwaySchema,
    anthropic: WizardStepAnthropicSchema,
  }),
  startedAt: z.string(),
  completedAt: z.string().optional(),
});

// --- Anthropic Key Body ---

export const AnthropicKeyBodySchema = z.object({
  apiKey: z.string().min(1),
});

// --- Wizard Complete Response ---

export const WizardCompleteResponseSchema = z.object({
  success: z.boolean(),
  completedAt: z.string(),
});

// --- Wizard Error ---

export const WizardErrorSchema = z.object({
  error: z.string(),
  statusCode: z.number(),
});

// --- Wizard Gone (410) ---

export const WizardGoneSchema = z.object({
  error: z.string(),
  statusCode: z.literal(410),
});

// --- Wizard Launch Response ---

export const WizardLaunchResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

// --- Railway Start Response ---

export const RailwayStartResponseSchema = z.object({
  pairingCode: z.string(),
  url: z.string(),
});

// --- Type exports ---

export type WizardStatusResponseType = z.infer<typeof WizardStatusResponseSchema>;
export type AnthropicKeyBodyType = z.infer<typeof AnthropicKeyBodySchema>;
export type WizardCompleteResponseType = z.infer<typeof WizardCompleteResponseSchema>;
export type WizardErrorType = z.infer<typeof WizardErrorSchema>;
export type WizardGoneType = z.infer<typeof WizardGoneSchema>;
export type WizardLaunchResponseType = z.infer<typeof WizardLaunchResponseSchema>;
export type RailwayStartResponseType = z.infer<typeof RailwayStartResponseSchema>;
