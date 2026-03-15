import { z } from "zod";

// --- Extension Install Method ---

export const ExtensionInstallMethodSchema = z.enum([
  "github-release",
  "build-from-source",
  "local-vsix",
]);

// --- Extension Install State ---

export const ExtensionInstallStateSchema = z.enum([
  "pending",
  "downloading",
  "installing",
  "installed",
  "failed",
]);

// --- Install Extension (discriminated union) ---

const GithubReleaseInstallSchema = z.object({
  method: z.literal("github-release"),
  repo: z.string().min(1),
  tag: z.string().min(1),
  secretName: z.string().min(1).optional(),
});

const BuildFromSourceInstallSchema = z.object({
  method: z.literal("build-from-source"),
  localPath: z.string().min(1),
});

const LocalVsixInstallSchema = z.object({
  method: z.literal("local-vsix"),
  localPath: z.string().min(1),
});

export const InstallExtensionSchema = z.discriminatedUnion("method", [
  GithubReleaseInstallSchema,
  BuildFromSourceInstallSchema,
  LocalVsixInstallSchema,
]);

// --- Extension Response ---

export const ExtensionResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  method: ExtensionInstallMethodSchema,
  state: ExtensionInstallStateSchema,
  installedAt: z.string().optional(),
  error: z.string().optional(),
});

// --- Extension List Response ---

export const ExtensionListResponseSchema = z.array(ExtensionResponseSchema);

// --- Type exports ---

export type InstallExtensionType = z.infer<typeof InstallExtensionSchema>;
export type ExtensionResponseType = z.infer<typeof ExtensionResponseSchema>;
export type ExtensionListResponseType = z.infer<
  typeof ExtensionListResponseSchema
>;
