import { z } from "zod";

// --- Boot State ---

export const BootStateSchema = z.enum([
  "initializing",
  "setup",
  "installing",
  "ready",
  "ok",
]);

// --- Health Response ---

export const HealthResponseSchema = z.object({
  status: BootStateSchema,
  version: z.string(),
  uptime: z.number(),
});

// --- Error Response ---

export const ErrorResponseSchema = z.object({
  error: z.string(),
  statusCode: z.number(),
});

// --- Pagination ---

export const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

// --- Type exports ---

export type HealthResponseType = z.infer<typeof HealthResponseSchema>;
export type ErrorResponseType = z.infer<typeof ErrorResponseSchema>;
export type PaginationType = z.infer<typeof PaginationSchema>;
