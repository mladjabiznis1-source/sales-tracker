// Publishing with an at-most-once guarantee.
//
// 1. CLAIM: a single conditional UPDATE flips the post to 'publishing' and stamps a
//    unique attempt id. SQLite/D1 executes it atomically, so if two cron runs (or a
//    cron run and publish_now) race, exactly one sees changes === 1. Only that one
//    calls LinkedIn.
// 2. PUBLISH: one LinkedIn call. No automatic retries, ever.
// 3. RECORD: the result is written only if our attempt id still owns the row.
// If the worker dies between 2 and 3, the row stays 'publishing'; the reaper later
// marks it 'error' with "outcome unknown" instead of re-sending it.

import { getAccessToken } from "./auth.ts";
import { randomId } from "./crypto.ts";
import { getPost, type Post, type PostStatus } from "./db.ts";
import { publishTextPost, validatePostText } from "./linkedin.ts";

/** A 'publishing' row older than this is assumed to have crashed mid-flight. */
export const STALE_LOCK_MS = 10 * 60_000;
/** Scheduled posts more than this late (e.g. after an outage) are not published silently. */
export const MAX_LATENESS_MS = 60 * 60_000;

export interface PublishDeps {
  db: D1Database;
  encKey: string;
  linkedinVersion: string;
  fetchFn?: typeof fetch;
  nowMs?: () => number;
}

const iso = (ms: number) => new Date(ms).toISOString();

async function claim(
  db: D1Database,
  id: string,
  fromStatuses: PostStatus[],
  nowMs: number,
  dueOnly: boolean,
): Promise<string | null> {
  const attempt = randomId(8);
  const placeholders = fromStatuses.map(() => "?").join(",");
  const due = dueOnly ? `AND scheduled_at IS NOT NULL AND scheduled_at <= ?` : "";
  const res = await db
    .prepare(
      `UPDATE posts SET status = 'publishing', publish_attempt_id = ?, publish_started_at = ?, updated_at = ?
       WHERE id = ? AND status IN (${placeholders}) ${due}`,
    )
    .bind(attempt, iso(nowMs), iso(nowMs), id, ...fromStatuses, ...(dueOnly ? [iso(nowMs)] : []))
    .run();
  return res.meta.changes === 1 ? attempt : null;
}

async function finish(
  db: D1Database,
  id: string,
  attempt: string,
  nowMs: number,
  outcome: { ok: true; urn: string; url: string } | { ok: false; message: string },
): Promise<void> {
  if (outcome.ok) {
    await db
      .prepare(
        `UPDATE posts SET status = 'published', published_at = ?, linkedin_post_urn = ?, linkedin_post_url = ?,
           error_message = NULL, updated_at = ?
         WHERE id = ? AND publish_attempt_id = ?`,
      )
      .bind(iso(nowMs), outcome.urn, outcome.url, iso(nowMs), id, attempt)
      .run();
  } else {
    await db
      .prepare(
        `UPDATE posts SET status = 'error', error_message = ?, updated_at = ? WHERE id = ? AND publish_attempt_id = ?`,
      )
      .bind(outcome.message, iso(nowMs), id, attempt)
      .run();
  }
}

/**
 * Claim and publish one post. Returns the post's final state, or null if someone
 * else holds it / it is not in a publishable status.
 */
export async function publishOne(
  deps: PublishDeps,
  id: string,
  opts: { fromStatuses: PostStatus[]; dueOnly: boolean },
): Promise<Post | null> {
  const now = deps.nowMs ?? Date.now;
  const attempt = await claim(deps.db, id, opts.fromStatuses, now(), opts.dueOnly);
  if (!attempt) return null;

  const post = (await getPost(deps.db, id))!;
  const invalid = validatePostText(post.text);
  const auth = invalid ? null : await getAccessToken(deps.db, deps.encKey, now());
  if (invalid || !auth) {
    await finish(deps.db, id, attempt, now(), {
      ok: false,
      message: invalid ?? "LinkedIn is not connected or the token has expired. Re-authorize at /reauth, then reschedule.",
    });
    return getPost(deps.db, id);
  }

  const result = await publishTextPost(
    { accessToken: auth.token, authorUrn: auth.memberUrn, text: post.text, version: deps.linkedinVersion },
    deps.fetchFn,
  );
  if (result.kind === "ok") {
    await finish(deps.db, id, attempt, now(), { ok: true, urn: result.urn, url: result.url });
  } else if (result.kind === "rejected") {
    await finish(deps.db, id, attempt, now(), { ok: false, message: result.message });
  } else {
    await finish(deps.db, id, attempt, now(), {
      ok: false,
      message: `OUTCOME UNKNOWN - check your LinkedIn profile before retrying, the post may be live. ${result.message}`,
    });
  }
  return getPost(deps.db, id);
}

/** Cron entry point: reap stale locks, skip badly-late posts, publish what's due. */
export async function runScheduler(deps: PublishDeps): Promise<{ published: number; failed: number }> {
  const now = deps.nowMs ?? Date.now;
  const db = deps.db;

  await db
    .prepare(
      `UPDATE posts SET status = 'error', updated_at = ?,
         error_message = 'OUTCOME UNKNOWN - publishing was interrupted. Check your LinkedIn profile before retrying.'
       WHERE status = 'publishing' AND publish_started_at < ?`,
    )
    .bind(iso(now()), iso(now() - STALE_LOCK_MS))
    .run();

  await db
    .prepare(
      `UPDATE posts SET status = 'error', updated_at = ?,
         error_message = 'Missed its scheduled time by more than 60 minutes (scheduler outage?). Not published; reschedule it.'
       WHERE status = 'scheduled' AND scheduled_at < ?`,
    )
    .bind(iso(now()), iso(now() - MAX_LATENESS_MS))
    .run();

  const due = await db
    .prepare(`SELECT id FROM posts WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 10`)
    .bind(iso(now()))
    .all<{ id: string }>();

  let published = 0;
  let failed = 0;
  for (const { id } of due.results) {
    const post = await publishOne(deps, id, { fromStatuses: ["scheduled"], dueOnly: true });
    if (post?.status === "published") published++;
    else if (post) failed++;
  }
  return { published, failed };
}
