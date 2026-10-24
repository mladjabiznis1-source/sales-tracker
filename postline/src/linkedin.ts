// LinkedIn official API client: OAuth (OpenID Connect), userinfo, and the versioned Posts API.

export const LINKEDIN_AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
export const LINKEDIN_POSTS_URL = "https://api.linkedin.com/rest/posts";
export const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social"];

/** LinkedIn's post length limit, counted on the text you typed (not the escaped markup). */
export const MAX_POST_LENGTH = 3000;

type FetchFn = typeof fetch;

// Characters reserved by LinkedIn's "little text format". Every one must be
// backslash-escaped in `commentary`, or LinkedIn silently truncates/garbles the post.
const RESERVED = /[\\|{}@[\]()<>#*_~]/g;
// A hashtag: '#' at start or after whitespace, followed by letters/digits/underscore.
const HASHTAG = /(^|\s)#([\p{L}\p{N}_]+)/gu;

function escapeReserved(s: string): string {
  return s.replace(RESERVED, (c) => `\\${c}`);
}

/**
 * Convert plain post text to LinkedIn little-text commentary. Escapes reserved characters
 * exactly once, and turns #hashtags into LinkedIn's hashtag template so they stay clickable.
 */
export function toCommentary(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(HASHTAG)) {
    const start = m.index + m[1].length; // position of '#'
    out += escapeReserved(text.slice(last, start));
    out += `{hashtag|\\#|${escapeReserved(m[2])}}`;
    last = start + 1 + m[2].length;
  }
  return out + escapeReserved(text.slice(last));
}

export function validatePostText(text: string): string | null {
  if (text.trim().length === 0) return "Post text is empty.";
  if (text.length > MAX_POST_LENGTH) {
    return `Post is ${text.length} characters; LinkedIn's limit is ${MAX_POST_LENGTH}.`;
  }
  return null;
}

export function postUrl(urn: string): string {
  return `https://www.linkedin.com/feed/update/${urn}/`;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const u = new URL(LINKEDIN_AUTHORIZE_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));
  return u.toString();
}

async function tokenRequest(params: Record<string, string>, fetchFn: FetchFn): Promise<TokenResponse> {
  const res = await fetchFn(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`LinkedIn token endpoint returned ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body) as TokenResponse;
}

export function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  fetchFn: FetchFn = fetch,
): Promise<TokenResponse> {
  return tokenRequest(
    { grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret },
    fetchFn,
  );
}

export function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  fetchFn: FetchFn = fetch,
): Promise<TokenResponse> {
  return tokenRequest(
    { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret },
    fetchFn,
  );
}

export async function fetchUserInfo(
  accessToken: string,
  fetchFn: FetchFn = fetch,
): Promise<{ memberUrn: string; name: string | null }> {
  const res = await fetchFn(LINKEDIN_USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await res.text();
  if (!res.ok) throw new Error(`LinkedIn userinfo returned ${res.status}: ${body.slice(0, 300)}`);
  const info = JSON.parse(body) as { sub: string; name?: string };
  if (!info.sub) throw new Error("LinkedIn userinfo response had no 'sub'");
  return { memberUrn: `urn:li:person:${info.sub}`, name: info.name ?? null };
}

export type PublishResult =
  | { kind: "ok"; urn: string; url: string }
  // LinkedIn definitely rejected the post (4xx): nothing was published.
  | { kind: "rejected"; status: number; message: string }
  // Network error / 5xx / missing id: the post MAY exist. Never retry automatically.
  | { kind: "unknown"; message: string };

export async function publishTextPost(
  opts: { accessToken: string; authorUrn: string; text: string; version: string },
  fetchFn: FetchFn = fetch,
): Promise<PublishResult> {
  let res: Response;
  try {
    res = await fetchFn(LINKEDIN_POSTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json",
        "Linkedin-Version": opts.version,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: opts.authorUrn,
        commentary: toCommentary(opts.text),
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });
  } catch (e) {
    return { kind: "unknown", message: `Network error talking to LinkedIn: ${(e as Error).message}` };
  }
  if (res.status === 201 || res.ok) {
    const urn = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id");
    if (!urn) return { kind: "unknown", message: `LinkedIn returned ${res.status} without a post id header` };
    return { kind: "ok", urn, url: postUrl(urn) };
  }
  const body = (await res.text().catch(() => "")).slice(0, 500);
  if (res.status >= 400 && res.status < 500) {
    return { kind: "rejected", status: res.status, message: `LinkedIn rejected the post (${res.status}): ${body}` };
  }
  return { kind: "unknown", message: `LinkedIn returned ${res.status}: ${body}` };
}
