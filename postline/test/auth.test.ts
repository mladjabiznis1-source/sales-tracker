import assert from "node:assert/strict";
import { test } from "node:test";
import { computeAuthStatus, getAccessToken, maybeRefresh, storeTokens } from "../src/auth.ts";
import { decrypt, encrypt } from "../src/crypto.ts";
import { getAuthRow, type LinkedInAuthRow } from "../src/db.ts";
import { makeDb, TEST_KEY } from "./d1-shim.ts";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-24T12:00:00Z");
const URL_ = "https://x.workers.dev/reauth";

function row(expiresInDays: number, refresh = false): LinkedInAuthRow {
  return {
    member_urn: "urn:li:person:abc",
    member_name: "Me",
    access_token_enc: "v1:x",
    access_token_expires_at: new Date(NOW + expiresInDays * DAY).toISOString(),
    refresh_token_enc: refresh ? "v1:y" : null,
    refresh_token_expires_at: null,
    scope: null,
    updated_at: new Date(NOW).toISOString(),
  };
}

test("token expiry warning: ok / expiring_soon (<10 days) / expired / not connected", () => {
  assert.equal(computeAuthStatus(row(59), NOW, URL_).state, "ok");
  assert.equal(computeAuthStatus(row(10.5), NOW, URL_).state, "ok");
  const soon = computeAuthStatus(row(9.9), NOW, URL_);
  assert.equal(soon.state, "expiring_soon");
  assert.equal(soon.days_left, 9);
  assert.match(soon.message, /Re-authorize at https:\/\/x\.workers\.dev\/reauth/);
  assert.equal(computeAuthStatus(row(-0.01), NOW, URL_).state, "expired");
  assert.equal(computeAuthStatus(null, NOW, URL_).state, "not_connected");
});

test("expiring_soon with a refresh token says it will auto-refresh", () => {
  const s = computeAuthStatus(row(5, true), NOW, URL_);
  assert.equal(s.can_auto_refresh, true);
  assert.match(s.message, /refreshed automatically/);
});

test("tokens are encrypted at rest and round-trip", async () => {
  const db = makeDb();
  await storeTokens(db, TEST_KEY, { access_token: "secret-token", expires_in: 5184000 }, { memberUrn: "urn:li:person:abc", name: "Me" }, NOW);
  const r = (await getAuthRow(db))!;
  assert.ok(!r.access_token_enc.includes("secret-token"));
  assert.equal(r.access_token_expires_at, "2026-12-23T12:00:00.000Z"); // +60 days
  assert.deepEqual(await getAccessToken(db, TEST_KEY, NOW), { token: "secret-token", memberUrn: "urn:li:person:abc" });
  assert.equal(await getAccessToken(db, TEST_KEY, NOW + 61 * DAY), null);
  assert.equal(await decrypt(await encrypt("hi", TEST_KEY), TEST_KEY), "hi");
});

test("maybeRefresh: no-op without a refresh token; refreshes inside the warning window", async () => {
  const db = makeDb();
  const env = { TOKEN_ENCRYPTION_KEY: TEST_KEY, LINKEDIN_CLIENT_ID: "id", LINKEDIN_CLIENT_SECRET: "s" };
  let calls = 0;
  const fetchFn = (async () => {
    calls++;
    return Response.json({ access_token: "new", expires_in: 5184000 });
  }) as unknown as typeof fetch;

  await storeTokens(db, TEST_KEY, { access_token: "old", expires_in: 5 * 86400 }, { memberUrn: "u", name: null }, NOW);
  assert.equal(await maybeRefresh(db, env, NOW, fetchFn), false);

  await storeTokens(db, TEST_KEY, { access_token: "old", expires_in: 30 * 86400, refresh_token: "r", refresh_token_expires_in: 365 * 86400 }, { memberUrn: "u", name: null }, NOW);
  assert.equal(await maybeRefresh(db, env, NOW, fetchFn), false, "outside the window");
  assert.equal(await maybeRefresh(db, env, NOW + 25 * DAY, fetchFn), true);
  assert.equal(calls, 1);
  assert.equal((await getAccessToken(db, TEST_KEY, NOW + 25 * DAY))!.token, "new");
});
