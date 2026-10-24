// Business operations behind the MCP tools. Each throws OpError with a message
// meant to be shown to the user (via Claude) when a request can't be done.

import {
  createPost,
  deletePostIf,
  getPost,
  getQueueTimezone,
  getSlots,
  replaceSlots,
  setSetting,
  takenInstants,
  updatePostIf,
  type Post,
  type PostStatus,
} from "./db.ts";
import { validatePostText } from "./linkedin.ts";
import { publishOne, type PublishDeps } from "./publisher.ts";
import { nextFreeSlot, validateSlots, type QueueSlot } from "./slots.ts";
import { formatLocal, isValidTimeZone, parseUserTime } from "./time.ts";

export class OpError extends Error {}

const EDITABLE: PostStatus[] = ["draft", "planned", "scheduled", "error"];
export const NEXT_FREE_SLOT = "next-free-slot";

export interface PostView extends Omit<Post, "publish_attempt_id" | "publish_started_at"> {
  scheduled_at_local: string | null;
  published_at_local: string | null;
}

export function view(post: Post, tz: string): PostView {
  const { publish_attempt_id: _a, publish_started_at: _b, ...rest } = post;
  return {
    ...rest,
    scheduled_at_local: formatLocal(post.scheduled_at, tz),
    published_at_local: formatLocal(post.published_at, tz),
  };
}

async function mustGet(db: D1Database, id: string): Promise<Post> {
  const post = await getPost(db, id);
  if (!post) throw new OpError(`No post with id ${id}.`);
  return post;
}

function checkText(text: string): void {
  const problem = validatePostText(text);
  if (problem) throw new OpError(problem);
}

/** Resolve "next-free-slot" or a user time to a UTC ISO string in the future. */
export async function resolveTime(
  db: D1Database,
  when: string,
  nowMs: number,
  ownInstant?: string | null,
): Promise<string> {
  const tz = await getQueueTimezone(db);
  if (when === NEXT_FREE_SLOT) {
    const taken = await takenInstants(db);
    // A post being re-queued shouldn't block the slot it currently holds.
    if (ownInstant) taken.delete(Date.parse(ownInstant));
    const slot = nextFreeSlot(nowMs, await getSlots(db), tz, taken);
    if (slot === null) throw new OpError("No free queue slot in the next year. Add slots with set_queue_slots.");
    return new Date(slot).toISOString();
  }
  let isoUtc: string;
  try {
    isoUtc = parseUserTime(when, tz);
  } catch (e) {
    throw new OpError((e as Error).message);
  }
  if (Date.parse(isoUtc) <= nowMs) {
    throw new OpError(`${formatLocal(isoUtc, tz)} is in the past. Pick a future time or use publish_now.`);
  }
  return isoUtc;
}

export async function opCreate(db: D1Database, text: string, nowMs = Date.now()): Promise<Post> {
  checkText(text);
  return createPost(db, { text, status: "draft" }, nowMs);
}

export async function opEdit(db: D1Database, id: string, text: string, nowMs = Date.now()): Promise<Post> {
  checkText(text);
  const post = await mustGet(db, id);
  if (!(await updatePostIf(db, id, EDITABLE, { text }, nowMs))) {
    throw new OpError(`Post ${id} is ${post.status} and can no longer be edited.`);
  }
  return mustGet(db, id);
}

export async function opDelete(db: D1Database, id: string): Promise<Post> {
  const post = await mustGet(db, id);
  if (!(await deletePostIf(db, id, [...EDITABLE, "published"]))) {
    throw new OpError(`Post ${id} is being published right now; try again in a minute.`);
  }
  return post;
}

/** schedule (will auto-publish) or plan (dated, waits for confirm_post). */
export async function opSetTime(
  db: D1Database,
  id: string,
  when: string,
  status: "scheduled" | "planned",
  nowMs = Date.now(),
): Promise<Post> {
  const post = await mustGet(db, id);
  if (!EDITABLE.includes(post.status)) throw new OpError(`Post ${id} is ${post.status}; it can't be rescheduled.`);
  checkText(post.text);
  const scheduled_at = await resolveTime(db, when, nowMs, post.scheduled_at);
  if (!(await updatePostIf(db, id, EDITABLE, { status, scheduled_at, error_message: null }, nowMs))) {
    throw new OpError(`Post ${id} changed while scheduling; fetch it and try again.`);
  }
  return mustGet(db, id);
}

export async function opConfirm(db: D1Database, id: string, nowMs = Date.now()): Promise<Post> {
  const post = await mustGet(db, id);
  if (post.status !== "planned") throw new OpError(`Post ${id} is ${post.status}, not planned.`);
  if (!post.scheduled_at || Date.parse(post.scheduled_at) <= nowMs) {
    throw new OpError(
      `Post ${id}'s planned time has already passed. Use schedule_post with a new time (or publish_now).`,
    );
  }
  if (!(await updatePostIf(db, id, ["planned"], { status: "scheduled" }, nowMs))) {
    throw new OpError(`Post ${id} changed while confirming; fetch it and try again.`);
  }
  return mustGet(db, id);
}

export async function opPublishNow(deps: PublishDeps, id: string): Promise<Post> {
  const post = await mustGet(deps.db, id);
  const result = await publishOne(deps, id, { fromStatuses: EDITABLE, dueOnly: false });
  if (!result) throw new OpError(`Post ${id} is ${post.status} and can't be published now.`);
  return result;
}

export async function opSetSlots(
  db: D1Database,
  slots: QueueSlot[],
  timezone?: string,
): Promise<{ slots: QueueSlot[]; timezone: string }> {
  let clean: QueueSlot[];
  try {
    clean = validateSlots(slots);
  } catch (e) {
    throw new OpError((e as Error).message);
  }
  if (timezone !== undefined) {
    if (!isValidTimeZone(timezone)) throw new OpError(`Unknown timezone "${timezone}" (use IANA, e.g. America/New_York).`);
    await setSetting(db, "queue_timezone", timezone);
  }
  await replaceSlots(db, clean);
  return { slots: clean, timezone: await getQueueTimezone(db) };
}
