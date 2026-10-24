// Browser-facing routes: MCP OAuth consent, LinkedIn (re)auth, status page.

import { AuthorizationError, CimdFetchError, type ConsentDescription } from "@cloudflare/workers-oauth-provider";
import { computeAuthStatus, storeTokens } from "./auth.ts";
import { randomId, safeEqual } from "./crypto.ts";
import { getAuthRow, getQueueTimezone, listPosts, recentPublished, type Post } from "./db.ts";
import type { Env } from "./env.ts";
import { authorizeUrl, exchangeCode, fetchUserInfo } from "./linkedin.ts";
import { formatLocal } from "./time.ts";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const MAX_FAILURES = 10;
const FAILURE_WINDOW_S = 900;

// Coarse brute-force brake on the admin password (KV is eventually consistent; that's fine here).
async function tooManyFailures(env: Env, req: Request): Promise<boolean> {
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  return Number((await env.OAUTH_KV.get(`fail:${ip}`)) ?? 0) >= MAX_FAILURES;
}
async function recordFailure(env: Env, req: Request): Promise<void> {
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const n = Number((await env.OAUTH_KV.get(`fail:${ip}`)) ?? 0) + 1;
  await env.OAUTH_KV.put(`fail:${ip}`, String(n), { expirationTtl: FAILURE_WINDOW_S });
}

async function checkPassword(env: Env, req: Request, password: string): Promise<boolean> {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 16) return false; // refuse weak/missing config
  if (await safeEqual(password, env.ADMIN_PASSWORD)) return true;
  await recordFailure(env, req);
  return false;
}

/** HTTP Basic auth gate for /status and /reauth. Any username; password = ADMIN_PASSWORD. */
async function requireAdmin(env: Env, req: Request): Promise<Response | null> {
  if (await tooManyFailures(env, req)) return new Response("Too many failed attempts. Try later.", { status: 429 });
  const header = req.headers.get("Authorization") ?? "";
  if (header.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = atob(header.slice(6));
    } catch {
      /* fall through */
    }
    const password = decoded.slice(decoded.indexOf(":") + 1);
    if (await checkPassword(env, req, password)) return null;
  }
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Postline", charset="UTF-8"' },
  });
}

function page(title: string, body: string, headers: HeadersInit = {}, status = 200): Response {
  const h = new Headers(headers);
  h.set("Content-Type", "text/html; charset=utf-8");
  h.set("X-Frame-Options", "DENY");
  h.set("Cache-Control", "no-store");
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1a1a1a;--muted:#666;--line:#ddd;--warn:#b45309;--bad:#b91c1c;--good:#15803d}
@media (prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--muted:#999;--line:#333;--warn:#f59e0b;--bad:#f87171;--good:#4ade80}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;max-width:860px;margin:0 auto;padding:16px}
h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:2rem;border-bottom:1px solid var(--line)}
.muted{color:var(--muted)}.warn{color:var(--warn)}.bad{color:var(--bad)}.good{color:var(--good)}
.post{border:1px solid var(--line);border-radius:6px;padding:8px 12px;margin:8px 0;overflow-wrap:anywhere}
.post pre{white-space:pre-wrap;font:inherit;margin:4px 0}
input,button{font:inherit;padding:6px 10px}
</style></head><body>${body}</body></html>`,
    { status, headers: h },
  );
}

// ---------- MCP OAuth consent (/authorize) ----------

function consentForm(d: ConsentDescription, handle: string, error?: string): string {
  return `<h1>Allow ${esc(d.clientName)} to control Postline?</h1>
<p>${d.clientDomain ? `Published by <strong>${esc(d.clientDomain)}</strong>.` : "This app registered itself; its name is not verified."}
Access will be sent to <strong>${esc(d.redirectHost)}</strong>.</p>
${d.redirectIsLoopback ? "<p class=warn><strong>This sends access to an app on your computer.</strong> Continue only if you just started connecting from it.</p>" : ""}
<p>It will be able to create, schedule, edit, delete and publish LinkedIn posts on your behalf.</p>
${error ? `<p class=bad>${esc(error)}</p>` : ""}
<form method="post">
<input type="hidden" name="handle" value="${esc(handle)}">
<p><label>Admin password<br><input type="password" name="password" autocomplete="current-password" required></label></p>
<p><button name="decision" value="approve">Allow</button> <button name="decision" value="deny" formnovalidate>Deny</button></p>
</form>`;
}

async function handleAuthorize(req: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  try {
    if (req.method === "GET") {
      const authReq = await oauth.parseAuthRequest(req);
      const details = await oauth.describeConsent(authReq);
      const consent = await oauth.beginConsent(authReq);
      return page("Authorize", consentForm(details, consent.handle), consent.headers);
    }
    if (req.method === "POST") {
      const form = await req.formData();
      const handle = String(form.get("handle") ?? "");
      if (form.get("decision") !== "approve") {
        const denied = await oauth.denyConsent(req, handle);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      if ((await tooManyFailures(env, req)) || !(await checkPassword(env, req, String(form.get("password") ?? "")))) {
        // The handle is single-use only once approved/denied, so the user can retry on the same page.
        return page("Authorize", `<h1>Wrong password</h1><p>Go back and try again.</p>`, {}, 403);
      }
      const approved = await oauth.approveConsent(req, handle);
      const { redirectTo } = await oauth.completeAuthorization({
        request: approved.request,
        userId: "owner",
        metadata: {},
        scope: approved.request.scope,
        props: { userId: "owner" },
      });
      approved.headers.set("Location", redirectTo);
      return new Response(null, { status: 302, headers: approved.headers });
    }
    return new Response("Method not allowed", { status: 405 });
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
    if (error instanceof AuthorizationError || error instanceof CimdFetchError) {
      const msg = error instanceof AuthorizationError ? error.description : "This app could not be verified.";
      return page("Authorization error", `<h1>Authorization error</h1><p>${esc(msg)}</p>`, {}, 400);
    }
    throw error;
  }
}

// ---------- LinkedIn OAuth (/reauth, /linkedin/callback) ----------

const callbackUrl = (env: Env) => `${env.PUBLIC_URL}/linkedin/callback`;

async function handleReauth(req: Request, env: Env): Promise<Response> {
  const denied = await requireAdmin(env, req);
  if (denied) return denied;
  const state = randomId(16);
  await env.OAUTH_KV.put(`li_state:${state}`, "1", { expirationTtl: 600 });
  return Response.redirect(authorizeUrl(env.LINKEDIN_CLIENT_ID, callbackUrl(env), state), 302);
}

async function handleCallback(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  if (!state || !(await env.OAUTH_KV.get(`li_state:${state}`))) {
    return page("LinkedIn", `<h1>Link expired</h1><p>Start again at <a href="/reauth">/reauth</a>.</p>`, {}, 400);
  }
  await env.OAUTH_KV.delete(`li_state:${state}`);
  const err = url.searchParams.get("error");
  if (err) {
    const desc = url.searchParams.get("error_description") ?? err;
    return page("LinkedIn", `<h1>LinkedIn said no</h1><p>${esc(desc)}</p><p><a href="/reauth">Try again</a></p>`, {}, 400);
  }
  const code = url.searchParams.get("code");
  if (!code) return page("LinkedIn", `<h1>No code returned</h1>`, {}, 400);

  const tokens = await exchangeCode(code, callbackUrl(env), env.LINKEDIN_CLIENT_ID, env.LINKEDIN_CLIENT_SECRET);
  const member = await fetchUserInfo(tokens.access_token);
  await storeTokens(env.DB, env.TOKEN_ENCRYPTION_KEY, tokens, member);
  const status = computeAuthStatus(await getAuthRow(env.DB), Date.now(), `${env.PUBLIC_URL}/reauth`);
  return page(
    "LinkedIn connected",
    `<h1 class=good>LinkedIn connected</h1>
<p>Signed in as <strong>${esc(member.name)}</strong> (<code>${esc(member.memberUrn)}</code>).</p>
<p>Token expires ${esc(formatLocal(status.expires_at, await getQueueTimezone(env.DB)))}.
${tokens.refresh_token ? "LinkedIn issued a refresh token, so it will renew automatically." : "No refresh token was issued: re-authorize before it expires (the status page will warn you 10 days ahead)."}</p>
<p><a href="/status">Go to status page</a></p>`,
  );
}

// ---------- Status page ----------

function postCard(p: Post, tz: string): string {
  const when = p.status === "published" ? formatLocal(p.published_at, tz) : formatLocal(p.scheduled_at, tz);
  return `<div class=post><div class=muted>${esc(p.id)} · <strong>${esc(p.status)}</strong>${when ? ` · ${esc(when)}` : ""}
${p.linkedin_post_url ? ` · <a href="${esc(p.linkedin_post_url)}" rel="noopener">view on LinkedIn</a>` : ""}</div>
${p.error_message ? `<div class=bad>${esc(p.error_message)}</div>` : ""}<pre>${esc(p.text)}</pre></div>`;
}

async function handleStatus(req: Request, env: Env): Promise<Response> {
  const denied = await requireAdmin(env, req);
  if (denied) return denied;
  const db = env.DB;
  const tz = await getQueueTimezone(db);
  const auth = computeAuthStatus(await getAuthRow(db), Date.now(), `${env.PUBLIC_URL}/reauth`);
  const [scheduled, planned, errors, published] = await Promise.all([
    listPosts(db, "scheduled", 50),
    listPosts(db, "planned", 50),
    listPosts(db, "error", 50),
    recentPublished(db, 10),
  ]);
  const upcoming = [...scheduled, ...planned].sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
  const cls = auth.state === "ok" ? "good" : auth.state === "expiring_soon" ? "warn" : "bad";
  const section = (title: string, posts: Post[], empty: string) =>
    `<h2>${esc(title)} (${posts.length})</h2>${posts.length ? posts.map((p) => postCard(p, tz)).join("") : `<p class=muted>${esc(empty)}</p>`}`;
  return page(
    "Postline status",
    `<h1>Postline</h1>
<p class=${cls}><strong>${esc(auth.message)}</strong>${auth.expires_at ? ` <span class=muted>(expires ${esc(formatLocal(auth.expires_at, tz))})</span>` : ""}</p>
${auth.member_name ? `<p class=muted>Posting as ${esc(auth.member_name)}</p>` : ""}
<p><a href="/reauth">Re-authorize LinkedIn</a></p>
${errors.length ? section("Errors", errors, "") : ""}
${section("Upcoming", upcoming, "Nothing scheduled or planned.")}
${section("Last 10 published", published, "Nothing published yet.")}
<p class=muted>Times shown in ${esc(tz)}.</p>`,
  );
}

export const webHandler = {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    switch (pathname) {
      case "/":
        return Response.redirect(`${env.PUBLIC_URL}/status`, 302);
      case "/authorize":
        return handleAuthorize(req, env);
      case "/reauth":
        return handleReauth(req, env);
      case "/linkedin/callback":
        return handleCallback(req, env);
      case "/status":
        return handleStatus(req, env);
      default:
        return new Response("Not found", { status: 404 });
    }
  },
};
