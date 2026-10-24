import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { maybeRefresh } from "./auth.ts";
import type { Env } from "./env.ts";
import { mcpApiHandler } from "./mcp.ts";
import { runScheduler } from "./publisher.ts";
import { webHandler } from "./web.ts";

// The provider needs the public URL for its resource metadata, which only exists
// in env, so it is built on the first request rather than at module load.
let provider: OAuthProvider<Env> | null = null;

function getProvider(env: Env): OAuthProvider<Env> {
  if (!/^(https:\/\/|http:\/\/localhost[:/])/.test(env.PUBLIC_URL ?? "") || env.PUBLIC_URL.endsWith("/")) {
    throw new Error("PUBLIC_URL must be the Worker's https URL, without a trailing slash");
  }
  provider ??= new OAuthProvider<Env>({
    apiRoute: "/mcp",
    apiHandler: mcpApiHandler,
    defaultHandler: webHandler,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    scopesSupported: ["postline"],
    resourceMetadata: { resource: `${env.PUBLIC_URL}/mcp`, authorization_servers: [env.PUBLIC_URL] },
    clientIdMetadataDocumentEnabled: true,
  });
  return provider;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return getProvider(env).fetch(request, env, ctx);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const result = await runScheduler({
      db: env.DB,
      encKey: env.TOKEN_ENCRYPTION_KEY,
      linkedinVersion: env.LINKEDIN_VERSION,
    });
    if (result.published || result.failed) console.log("scheduler", result);
    ctx.waitUntil(maybeRefresh(env.DB, env).catch((e) => console.error("token refresh failed", e)));
  },
} satisfies ExportedHandler<Env>;
