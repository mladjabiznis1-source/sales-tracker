import assert from "node:assert/strict";
import { test } from "node:test";
import { storeTokens } from "../src/auth.ts";
import { createPost, getPost } from "../src/db.ts";
import { opConfirm, opPublishNow, opSetTime, OpError } from "../src/ops.ts";
import { runScheduler, STALE_LOCK_MS } from "../src/publisher.ts";
import { makeDb, TEST_KEY } from "./d1-shim.ts";

const T0 = Date.parse("2026-10-26T15:00:00Z"); // Mon 11:00 EDT

async function setup(nowMs = T0) {
  const db = makeDb();
  await storeTokens(db, TEST_KEY, { access_token: "tok", expires_in: 60 * 86400 }, { memberUrn: "urn:li:person:abc", name: "Me" }, nowMs);
  return db;
}

/** Fake LinkedIn that counts calls and yields to the event loop so concurrent runs interleave. */
function fakeLinkedIn(status = 201) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    await new Promise((r) => setTimeout(r, 5));
    return new Response(status === 201 ? null : "boom", {
      status,
      headers: status === 201 ? { "x-restli-id": `urn:li:share:${calls.length}` } : {},
    });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const deps = (db: D1Database, fetchFn: typeof fetch, now: number) => ({
  db,
  encKey: TEST_KEY,
  linkedinVersion: "202609",
  fetchFn,
  nowMs: () => now,
});

test("due scheduled post publishes once and records the URL", async () => {
  const db = await setup();
  const p = await createPost(db, { text: "Hello #world", status: "scheduled", scheduled_at: "2026-10-26T14:59:00.000Z" });
  const li = fakeLinkedIn();
  const r = await runScheduler(deps(db, li.fetchFn, T0));
  assert.deepEqual(r, { published: 1, failed: 0 });
  const after = (await getPost(db, p.id))!;
  assert.equal(after.status, "published");
  assert.equal(after.linkedin_post_url, "https://www.linkedin.com/feed/update/urn:li:share:1/");
  const req = li.calls[0];
  const headers = req.init.headers as Record<string, string>;
  assert.equal(headers["Linkedin-Version"], "202609");
  assert.equal(headers["X-Restli-Protocol-Version"], "2.0.0");
  const body = JSON.parse(String(req.init.body));
  assert.equal(body.author, "urn:li:person:abc");
  assert.equal(body.commentary, "Hello {hashtag|\\#|world}");
  assert.equal(body.lifecycleState, "PUBLISHED");
});

test("NO DOUBLE PUBLISH: two overlapping cron runs publish exactly once", async () => {
  const db = await setup();
  await createPost(db, { text: "once", status: "scheduled", scheduled_at: "2026-10-26T14:59:00.000Z" });
  const li = fakeLinkedIn();
  await Promise.all([runScheduler(deps(db, li.fetchFn, T0)), runScheduler(deps(db, li.fetchFn, T0))]);
  assert.equal(li.calls.length, 1);
  // And a later run doesn't touch it again.
  await runScheduler(deps(db, li.fetchFn, T0 + 60_000));
  assert.equal(li.calls.length, 1);
});

test("NO DOUBLE PUBLISH: publish_now racing the cron publishes exactly once", async () => {
  const db = await setup();
  const p = await createPost(db, { text: "race", status: "scheduled", scheduled_at: "2026-10-26T14:59:00.000Z" });
  const li = fakeLinkedIn();
  const results = await Promise.allSettled([
    runScheduler(deps(db, li.fetchFn, T0)),
    opPublishNow(deps(db, li.fetchFn, T0), p.id),
  ]);
  assert.equal(li.calls.length, 1);
  assert.equal((await getPost(db, p.id))!.status, "published");
  // The loser of the race reports a clean error rather than publishing.
  const rejected = results.filter((r) => r.status === "rejected");
  for (const r of rejected) assert.ok((r as PromiseRejectedResult).reason instanceof OpError);
});

test("NO DOUBLE PUBLISH: a crash mid-publish becomes 'outcome unknown', never a retry", async () => {
  const db = await setup();
  const p = await createPost(db, { text: "crash", status: "scheduled", scheduled_at: "2026-10-26T14:59:00.000Z" });
  // Simulate a worker that claimed the row then died.
  await db.prepare(`UPDATE posts SET status='publishing', publish_attempt_id='dead', publish_started_at=? WHERE id=?`)
    .bind(new Date(T0).toISOString(), p.id).run();
  const li = fakeLinkedIn();
  await runScheduler(deps(db, li.fetchFn, T0 + 60_000)); // lock still fresh: left alone
  assert.equal((await getPost(db, p.id))!.status, "publishing");
  await runScheduler(deps(db, li.fetchFn, T0 + STALE_LOCK_MS + 60_000));
  const after = (await getPost(db, p.id))!;
  assert.equal(after.status, "error");
  assert.match(after.error_message!, /OUTCOME UNKNOWN/);
  assert.equal(li.calls.length, 0);
});

test("LinkedIn 5xx is 'outcome unknown' and is not retried by later runs", async () => {
  const db = await setup();
  const p = await createPost(db, { text: "flaky", status: "scheduled", scheduled_at: "2026-10-26T14:59:00.000Z" });
  const li = fakeLinkedIn(503);
  await runScheduler(deps(db, li.fetchFn, T0));
  await runScheduler(deps(db, li.fetchFn, T0 + 60_000));
  assert.equal(li.calls.length, 1);
  assert.match((await getPost(db, p.id))!.error_message!, /OUTCOME UNKNOWN/);
});

test("LinkedIn 4xx is recorded as an error with LinkedIn's message", async () => {
  const db = await setup();
  const p = await createPost(db, { text: "bad", status: "scheduled", scheduled_at: "2026-10-26T14:59:00.000Z" });
  await runScheduler(deps(db, fakeLinkedIn(422).fetchFn, T0));
  const after = (await getPost(db, p.id))!;
  assert.equal(after.status, "error");
  assert.match(after.error_message!, /rejected the post \(422\)/);
});

test("planned posts never publish until confirmed", async () => {
  const db = await setup();
  const p = await createPost(db, { text: "needs approval", status: "draft" });
  await opSetTime(db, p.id, "2026-10-26T11:30", "planned", T0); // 11:30 EDT
  const li = fakeLinkedIn();
  await runScheduler(deps(db, li.fetchFn, Date.parse("2026-10-26T15:31:00Z")));
  assert.equal(li.calls.length, 0);
  assert.equal((await getPost(db, p.id))!.status, "planned");
});

test("confirm_post moves planned -> scheduled, then it publishes on time", async () => {
  const db = await setup();
  const p = await createPost(db, { text: "approved", status: "draft" });
  await opSetTime(db, p.id, "next-free-slot", "planned", T0);
  assert.equal((await getPost(db, p.id))!.scheduled_at, "2026-10-26T16:00:00.000Z");
  await opConfirm(db, p.id, T0);
  const li = fakeLinkedIn();
  await runScheduler(deps(db, li.fetchFn, Date.parse("2026-10-26T15:59:00Z")));
  assert.equal(li.calls.length, 0, "not due yet");
  await runScheduler(deps(db, li.fetchFn, Date.parse("2026-10-26T16:00:30Z")));
  assert.equal(li.calls.length, 1);
});

test("confirm_post refuses a planned time that already passed", async () => {
  const db = await setup();
  const p = await createPost(db, { text: "late", status: "planned", scheduled_at: "2026-10-26T14:00:00.000Z" });
  await assert.rejects(opConfirm(db, p.id, T0), /already passed/);
});

test("posts more than an hour late (outage) are errored, not silently published", async () => {
  const db = await setup();
  const p = await createPost(db, { text: "stale", status: "scheduled", scheduled_at: "2026-10-26T13:00:00.000Z" });
  const li = fakeLinkedIn();
  await runScheduler(deps(db, li.fetchFn, T0));
  assert.equal(li.calls.length, 0);
  assert.match((await getPost(db, p.id))!.error_message!, /Missed its scheduled time/);
});

test("expired token: post fails with a re-auth message and LinkedIn is not called", async () => {
  const db = await setup(T0 - 61 * 86400_000);
  const p = await createPost(db, { text: "x", status: "scheduled", scheduled_at: "2026-10-26T14:59:00.000Z" });
  const li = fakeLinkedIn();
  await runScheduler(deps(db, li.fetchFn, T0));
  assert.equal(li.calls.length, 0);
  assert.match((await getPost(db, p.id))!.error_message!, /Re-authorize/);
});

test("next-free-slot skips slots held by planned and scheduled posts", async () => {
  const db = await setup();
  const a = await createPost(db, { text: "a", status: "draft" });
  const b = await createPost(db, { text: "b", status: "draft" });
  const c = await createPost(db, { text: "c", status: "draft" });
  await opSetTime(db, a.id, "next-free-slot", "scheduled", T0);
  await opSetTime(db, b.id, "next-free-slot", "planned", T0);
  await opSetTime(db, c.id, "next-free-slot", "scheduled", T0);
  const times = await Promise.all([a, b, c].map(async (p) => (await getPost(db, p.id))!.scheduled_at));
  assert.deepEqual(times, ["2026-10-26T16:00:00.000Z", "2026-10-26T21:00:00.000Z", "2026-10-27T16:00:00.000Z"]);
  // Re-queuing a post doesn't treat its own slot as taken.
  await opSetTime(db, a.id, "next-free-slot", "scheduled", T0);
  assert.equal((await getPost(db, a.id))!.scheduled_at, "2026-10-26T16:00:00.000Z");
});
