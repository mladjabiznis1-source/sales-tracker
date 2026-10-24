import { addDays, isoWeekday, toLocal, zonedToUtc } from "./time.ts";

export interface QueueSlot {
  weekday: number; // ISO: 1=Mon .. 7=Sun
  time: string; // "HH:MM", wall-clock in the queue timezone
}

export const DEFAULT_SLOTS: QueueSlot[] = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, time: "12:00" },
  { weekday, time: "17:00" },
]);

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function validateSlots(slots: QueueSlot[]): QueueSlot[] {
  const seen = new Set<string>();
  const out: QueueSlot[] = [];
  for (const s of slots) {
    if (!Number.isInteger(s.weekday) || s.weekday < 1 || s.weekday > 7) {
      throw new Error(`Invalid weekday ${s.weekday} (use 1=Mon .. 7=Sun)`);
    }
    if (!TIME_RE.test(s.time)) throw new Error(`Invalid time "${s.time}" (use HH:MM, 24h)`);
    const key = `${s.weekday}-${s.time}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ weekday: s.weekday, time: s.time });
    }
  }
  return out.sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time));
}

/**
 * Earliest slot strictly after `nowMs` whose instant isn't already taken.
 * `takenMs` holds the UTC instants of posts already sitting in the queue.
 * Slots are wall-clock times, so 12:00 stays 12:00 local across DST changes.
 */
export function nextFreeSlot(
  nowMs: number,
  slots: QueueSlot[],
  tz: string,
  takenMs: Set<number>,
  horizonDays = 366,
): number | null {
  if (slots.length === 0) return null;
  const sorted = validateSlots(slots);
  const today = toLocal(nowMs, tz);
  for (let i = 0; i <= horizonDays; i++) {
    const date = addDays(today, i);
    const weekday = isoWeekday(date.year, date.month, date.day);
    for (const slot of sorted) {
      if (slot.weekday !== weekday) continue;
      const [hour, minute] = slot.time.split(":").map(Number);
      const utc = zonedToUtc({ ...date, hour, minute }, tz);
      if (utc > nowMs && !takenMs.has(utc)) return utc;
    }
  }
  return null;
}
