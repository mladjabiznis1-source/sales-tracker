import { randomId } from "./crypto.ts";
import type { QueueSlot } from "./slots.ts";

export type PostStatus = "draft" | "planned" | "scheduled" | "publishing" | "published" | "error";
export const USER_STATUSES = ["draft", "planned", "scheduled", "published", "error"] as const;

export interface Post {
  id: string;
  text: string;
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  linkedin_post_urn: string | null;
  linkedin_post_url: string | null;
  error_message: string | null;
  publish_attempt_id: string | null;
  publish_started_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LinkedInAuthRow {
  member_urn: string;
  member_name: string | null;
  access_token_enc: string;
  access_token_expires_at: string;
  refresh_token_enc: string | null;
  refresh_token_expires_at: string | null;
  scope: string | null;
  updated_at: string;
}

const iso = (ms: number) => new Date(ms).toISOString();

export async function createPost(
  db: D1Database,
  fields: { text: string; status: PostStatus; scheduled_at?: string | null },
  nowMs = Date.now(),
): Promise<Post> {
  const id = `p_${randomId(8)}`;
  const now = iso(nowMs);
  await db
    .prepare(
      `INSERT INTO posts (id, text, status, scheduled_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, fields.text, fields.status, fields.scheduled_at ?? null, now, now)
    .run();
  return (await getPost(db, id))!;
}

export function getPost(db: D1Database, id: string): Promise<Post | null> {
  return db.prepare(`SELECT * FROM posts WHERE id = ?`).bind(id).first<Post>();
}

export async function listPosts(db: D1Database, status?: PostStatus, limit = 50): Promise<Post[]> {
  const order = `ORDER BY COALESCE(scheduled_at, published_at, created_at) ASC`;
  const q = status
    ? db.prepare(`SELECT * FROM posts WHERE status = ? ${order} LIMIT ?`).bind(status, limit)
    : db.prepare(`SELECT * FROM posts ${order} LIMIT ?`).bind(limit);
  return (await q.all<Post>()).results;
}

export async function recentPublished(db: D1Database, limit = 10): Promise<Post[]> {
  return (
    await db
      .prepare(`SELECT * FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT ?`)
      .bind(limit)
      .all<Post>()
  ).results;
}

/** UTC instants already occupied by queued posts (used for next-free-slot). */
export async function takenInstants(db: D1Database): Promise<Set<number>> {
  const rows = await db
    .prepare(
      `SELECT scheduled_at FROM posts WHERE status IN ('planned','scheduled','publishing') AND scheduled_at IS NOT NULL`,
    )
    .all<{ scheduled_at: string }>();
  return new Set(rows.results.map((r) => Date.parse(r.scheduled_at)));
}

/**
 * Update a post only if it is still in one of `fromStatuses` (optimistic guard so
 * MCP edits can never race with the scheduler's lock). Returns true if a row changed.
 */
export async function updatePostIf(
  db: D1Database,
  id: string,
  fromStatuses: PostStatus[],
  set: Partial<Pick<Post, "text" | "status" | "scheduled_at" | "error_message">>,
  nowMs = Date.now(),
): Promise<boolean> {
  const cols = Object.keys(set) as (keyof typeof set)[];
  const assignments = [...cols.map((c) => `${c} = ?`), "updated_at = ?"].join(", ");
  const placeholders = fromStatuses.map(() => "?").join(",");
  const res = await db
    .prepare(`UPDATE posts SET ${assignments} WHERE id = ? AND status IN (${placeholders})`)
    .bind(...cols.map((c) => set[c] ?? null), iso(nowMs), id, ...fromStatuses)
    .run();
  return res.meta.changes === 1;
}

export async function deletePostIf(db: D1Database, id: string, fromStatuses: PostStatus[]): Promise<boolean> {
  const placeholders = fromStatuses.map(() => "?").join(",");
  const res = await db
    .prepare(`DELETE FROM posts WHERE id = ? AND status IN (${placeholders})`)
    .bind(id, ...fromStatuses)
    .run();
  return res.meta.changes === 1;
}

export async function getSlots(db: D1Database): Promise<QueueSlot[]> {
  return (await db.prepare(`SELECT weekday, time FROM queue_slots ORDER BY weekday, time`).all<QueueSlot>())
    .results;
}

export async function replaceSlots(db: D1Database, slots: QueueSlot[]): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM queue_slots`),
    ...slots.map((s) => db.prepare(`INSERT INTO queue_slots (weekday, time) VALUES (?, ?)`).bind(s.weekday, s.time)),
  ]);
}

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = ?`).bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(key, value)
    .run();
}

export async function getQueueTimezone(db: D1Database): Promise<string> {
  return (await getSetting(db, "queue_timezone")) ?? "America/New_York";
}

export function getAuthRow(db: D1Database): Promise<LinkedInAuthRow | null> {
  return db.prepare(`SELECT * FROM linkedin_auth WHERE id = 1`).first<LinkedInAuthRow>();
}

export async function saveAuthRow(db: D1Database, row: LinkedInAuthRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO linkedin_auth (id, member_urn, member_name, access_token_enc, access_token_expires_at,
         refresh_token_enc, refresh_token_expires_at, scope, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         member_urn = excluded.member_urn, member_name = excluded.member_name,
         access_token_enc = excluded.access_token_enc, access_token_expires_at = excluded.access_token_expires_at,
         refresh_token_enc = excluded.refresh_token_enc, refresh_token_expires_at = excluded.refresh_token_expires_at,
         scope = excluded.scope, updated_at = excluded.updated_at`,
    )
    .bind(
      row.member_urn,
      row.member_name,
      row.access_token_enc,
      row.access_token_expires_at,
      row.refresh_token_enc,
      row.refresh_token_expires_at,
      row.scope,
      row.updated_at,
    )
    .run();
}
