import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
  FIRESTORE_DATABASE_ID: z.string().min(1).default("(default)"),
  GOOGLE_OAUTH_CLIENT_IDS: z.string().min(1),
  CORS_ALLOWED_ORIGINS: z.string().default("tauri://localhost,http://tauri.localhost"),
  BOOTSTRAP_CLAIM_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600)
});

export interface AppConfig {
  port: number;
  projectId?: string;
  databaseId: string;
  googleOAuthClientIds: string[];
  corsAllowedOrigins: string[];
  bootstrapClaimTtlSeconds: number;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.parse(environment);
  return {
    port: parsed.PORT,
    ...(parsed.GOOGLE_CLOUD_PROJECT ? { projectId: parsed.GOOGLE_CLOUD_PROJECT } : {}),
    databaseId: parsed.FIRESTORE_DATABASE_ID,
    googleOAuthClientIds: split(parsed.GOOGLE_OAUTH_CLIENT_IDS),
    corsAllowedOrigins: split(parsed.CORS_ALLOWED_ORIGINS),
    bootstrapClaimTtlSeconds: parsed.BOOTSTRAP_CLAIM_TTL_SECONDS
  };
}

function split(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
