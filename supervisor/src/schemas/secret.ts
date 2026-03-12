import { z } from "zod";

// --- Create Secret ---

export const CreateSecretSchema = z.object({
  name: z.string().min(1).max(100),
  value: z.string().min(1),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// --- Update Secret ---

export const UpdateSecretSchema = z.object({
  value: z.string().min(1).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// --- Secret Response (never includes encrypted value) ---

export const SecretResponseSchema = z.object({
  name: z.string(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// --- Secret Value Response (for getSecret only) ---

export const SecretValueResponseSchema = z.object({
  name: z.string(),
  value: z.string(),
});

// --- Secret List Response ---

export const SecretListResponseSchema = z.array(SecretResponseSchema);

// --- Type exports ---

export type CreateSecretType = z.infer<typeof CreateSecretSchema>;
export type UpdateSecretType = z.infer<typeof UpdateSecretSchema>;
export type SecretResponseType = z.infer<typeof SecretResponseSchema>;
export type SecretValueResponseType = z.infer<typeof SecretValueResponseSchema>;
export type SecretListResponseType = z.infer<typeof SecretListResponseSchema>;
