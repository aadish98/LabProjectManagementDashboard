import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
  FIRESTORE_DATABASE_ID: z.string().min(1).default("(default)"),
  GOOGLE_OAUTH_CLIENT_IDS: z.string().min(1),
  // The desktop app performs PKCE but never holds the client secret; the backend
  // brokers Google's token endpoint on its behalf. Supplied from Secret Manager.
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  // Which of GOOGLE_OAUTH_CLIENT_IDS the broker exchanges codes for. Optional
  // when exactly one audience is configured.
  GOOGLE_OAUTH_TOKEN_CLIENT_ID: z.string().min(1).optional(),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default("tauri://localhost,http://tauri.localhost,https://tauri.localhost")
});

export interface AppConfig {
  port: number;
  projectId?: string;
  databaseId: string;
  googleOAuthClientIds: string[];
  googleOAuthClientSecret: string;
  brokeredClientId: string;
  corsAllowedOrigins: string[];
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.parse(environment);
  const googleOAuthClientIds = split(parsed.GOOGLE_OAUTH_CLIENT_IDS);
  if (googleOAuthClientIds.length === 0) {
    throw new Error("GOOGLE_OAUTH_CLIENT_IDS must list at least one OAuth client ID.");
  }
  return {
    port: parsed.PORT,
    ...(parsed.GOOGLE_CLOUD_PROJECT ? { projectId: parsed.GOOGLE_CLOUD_PROJECT } : {}),
    databaseId: parsed.FIRESTORE_DATABASE_ID,
    googleOAuthClientIds,
    googleOAuthClientSecret: parsed.GOOGLE_OAUTH_CLIENT_SECRET,
    brokeredClientId: resolveBrokeredClientId(
      parsed.GOOGLE_OAUTH_TOKEN_CLIENT_ID,
      googleOAuthClientIds
    ),
    corsAllowedOrigins: split(parsed.CORS_ALLOWED_ORIGINS)
  };
}

function resolveBrokeredClientId(
  configured: string | undefined,
  audiences: string[]
): string {
  if (!configured) {
    if (audiences.length > 1) {
      throw new Error(
        "GOOGLE_OAUTH_TOKEN_CLIENT_ID is required when GOOGLE_OAUTH_CLIENT_IDS lists more than one client ID."
      );
    }
    return audiences[0] as string;
  }
  const trimmed = configured.trim();
  if (!audiences.includes(trimmed)) {
    throw new Error(
      "GOOGLE_OAUTH_TOKEN_CLIENT_ID must be one of the client IDs listed in GOOGLE_OAUTH_CLIENT_IDS."
    );
  }
  return trimmed;
}

function split(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
