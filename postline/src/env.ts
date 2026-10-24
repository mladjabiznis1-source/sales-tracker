import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export interface Env {
  DB: D1Database;
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;

  // vars (wrangler.jsonc)
  PUBLIC_URL: string; // e.g. https://postline.<you>.workers.dev (no trailing slash)
  LINKEDIN_VERSION: string; // YYYYMM, sent as the Linkedin-Version header

  // secrets (wrangler secret put)
  LINKEDIN_CLIENT_ID: string;
  LINKEDIN_CLIENT_SECRET: string;
  ADMIN_PASSWORD: string;
  TOKEN_ENCRYPTION_KEY: string; // 32 random bytes, base64
}
