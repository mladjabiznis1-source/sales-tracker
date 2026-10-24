import { decrypt, encrypt } from "./crypto.ts";
import { getAuthRow, saveAuthRow, type LinkedInAuthRow } from "./db.ts";
import { refreshAccessToken, type TokenResponse } from "./linkedin.ts";

export const EXPIRY_WARNING_DAYS = 10;
const DAY_MS = 86_400_000;

export interface AuthStatus {
  state: "not_connected" | "expired" | "expiring_soon" | "ok";
  member_urn: string | null;
  member_name: string | null;
  expires_at: string | null;
  days_left: number | null;
  can_auto_refresh: boolean;
  message: string;
}

/** Pure: derive the warning state from the stored row. */
export function computeAuthStatus(row: LinkedInAuthRow | null, nowMs: number, reauthUrl: string): AuthStatus {
  if (!row) {
    return {
      state: "not_connected",
      member_urn: null,
      member_name: null,
      expires_at: null,
      days_left: null,
      can_auto_refresh: false,
      message: `LinkedIn is not connected. Open ${reauthUrl} to connect.`,
    };
  }
  const expiresMs = Date.parse(row.access_token_expires_at);
  const daysLeft = Math.floor((expiresMs - nowMs) / DAY_MS);
  const canRefresh =
    !!row.refresh_token_enc && (!row.refresh_token_expires_at || Date.parse(row.refresh_token_expires_at) > nowMs);
  const base = {
    member_urn: row.member_urn,
    member_name: row.member_name,
    expires_at: row.access_token_expires_at,
    days_left: Math.max(daysLeft, 0),
    can_auto_refresh: canRefresh,
  };
  if (expiresMs <= nowMs) {
    return { ...base, state: "expired", message: `LinkedIn token EXPIRED. Re-authorize at ${reauthUrl}.` };
  }
  if (expiresMs - nowMs < EXPIRY_WARNING_DAYS * DAY_MS) {
    return {
      ...base,
      state: "expiring_soon",
      message: canRefresh
        ? `LinkedIn token expires in ${daysLeft} day(s); it will be refreshed automatically.`
        : `LinkedIn token expires in ${daysLeft} day(s). Re-authorize at ${reauthUrl} before then or scheduled posts will fail.`,
    };
  }
  return { ...base, state: "ok", message: `LinkedIn connected; token valid for ${daysLeft} more day(s).` };
}

export async function storeTokens(
  db: D1Database,
  encKey: string,
  tokens: TokenResponse,
  member: { memberUrn: string; name: string | null },
  nowMs = Date.now(),
): Promise<void> {
  const iso = (ms: number) => new Date(ms).toISOString();
  await saveAuthRow(db, {
    member_urn: member.memberUrn,
    member_name: member.name,
    access_token_enc: await encrypt(tokens.access_token, encKey),
    access_token_expires_at: iso(nowMs + tokens.expires_in * 1000),
    refresh_token_enc: tokens.refresh_token ? await encrypt(tokens.refresh_token, encKey) : null,
    refresh_token_expires_at: tokens.refresh_token_expires_in
      ? iso(nowMs + tokens.refresh_token_expires_in * 1000)
      : null,
    scope: tokens.scope ?? null,
    updated_at: iso(nowMs),
  });
}

/** Returns a usable access token, or null if not connected / expired. */
export async function getAccessToken(
  db: D1Database,
  encKey: string,
  nowMs = Date.now(),
): Promise<{ token: string; memberUrn: string } | null> {
  const row = await getAuthRow(db);
  if (!row || Date.parse(row.access_token_expires_at) <= nowMs) return null;
  return { token: await decrypt(row.access_token_enc, encKey), memberUrn: row.member_urn };
}

/**
 * Only does anything if LinkedIn issued a refresh token (most self-serve apps don't get one).
 * Refreshes once the access token is inside the warning window.
 */
export async function maybeRefresh(
  db: D1Database,
  env: { TOKEN_ENCRYPTION_KEY: string; LINKEDIN_CLIENT_ID: string; LINKEDIN_CLIENT_SECRET: string },
  nowMs = Date.now(),
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  const row = await getAuthRow(db);
  if (!row?.refresh_token_enc) return false;
  if (Date.parse(row.access_token_expires_at) - nowMs > EXPIRY_WARNING_DAYS * DAY_MS) return false;
  if (row.refresh_token_expires_at && Date.parse(row.refresh_token_expires_at) <= nowMs) return false;
  const refreshToken = await decrypt(row.refresh_token_enc, env.TOKEN_ENCRYPTION_KEY);
  const tokens = await refreshAccessToken(refreshToken, env.LINKEDIN_CLIENT_ID, env.LINKEDIN_CLIENT_SECRET, fetchFn);
  // LinkedIn keeps the original refresh token's lifetime; keep the old one if none is returned.
  await saveAuthRow(db, {
    ...row,
    access_token_enc: await encrypt(tokens.access_token, env.TOKEN_ENCRYPTION_KEY),
    access_token_expires_at: new Date(nowMs + tokens.expires_in * 1000).toISOString(),
    refresh_token_enc: tokens.refresh_token
      ? await encrypt(tokens.refresh_token, env.TOKEN_ENCRYPTION_KEY)
      : row.refresh_token_enc,
    updated_at: new Date(nowMs).toISOString(),
  });
  return true;
}
