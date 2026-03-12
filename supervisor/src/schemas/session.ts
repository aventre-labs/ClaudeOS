import { z } from "zod";

// --- Session Status ---

export const SessionStatusSchema = z.enum([
  "active",
  "idle",
  "waiting",
  "stopped",
  "archived",
  "zombie",
]);

// --- Create Session ---

export const CreateSessionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  workdir: z.string().optional(),
  model: z.string().optional(),
  flags: z.array(z.string()).optional(),
});

// --- Session Response ---

export const SessionResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: SessionStatusSchema,
  createdAt: z.string(),
  workdir: z.string().optional(),
  model: z.string().optional(),
  flags: z.array(z.string()).optional(),
  pid: z.number().optional(),
});

// --- Session List Response ---

export const SessionListResponseSchema = z.array(SessionResponseSchema);

// --- Send Input ---

export const SendInputSchema = z.object({
  text: z.string().min(1),
});

// --- Capture Output ---

export const CaptureOutputSchema = z.object({
  scrollback: z.boolean().optional().default(false),
});

// --- Type exports ---

export type CreateSessionType = z.infer<typeof CreateSessionSchema>;
export type SessionResponseType = z.infer<typeof SessionResponseSchema>;
export type SessionListResponseType = z.infer<typeof SessionListResponseSchema>;
export type SendInputType = z.infer<typeof SendInputSchema>;
export type CaptureOutputType = z.infer<typeof CaptureOutputSchema>;
