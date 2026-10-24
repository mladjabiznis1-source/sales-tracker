// Timezone helpers built on Intl only (no tz library needed in Workers).
// All instants are stored as UTC ISO strings ("...Z"); local wall-clock time
// only exists at the edges (slot definitions, user input, display).

export interface LocalDateTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of an instant in a timezone. */
export function toLocal(instantMs: number, tz: string): LocalDateTime & { second: number } {
  const parts: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(instantMs))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Offset of tz from UTC at the given instant, in ms (e.g. -4h for EDT). */
export function offsetMs(instantMs: number, tz: string): number {
  const l = toLocal(instantMs, tz);
  const asUtc = Date.UTC(l.year, l.month - 1, l.day, l.hour, l.minute, l.second);
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * Convert a wall-clock time in tz to a UTC instant.
 * - Ambiguous times (DST fall-back, e.g. 01:30 happens twice) resolve to the
 *   EARLIER occurrence.
 * - Non-existent times (DST spring-forward gap, e.g. 02:30) are shifted forward
 *   by the size of the gap (02:30 -> 03:30).
 */
export function zonedToUtc(local: LocalDateTime, tz: string): number {
  const naive = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const DAY = 86_400_000;
  // Offsets a day either side; at most one DST transition sits in between.
  const before = offsetMs(naive - DAY, tz);
  const after = offsetMs(naive + DAY, tz);
  const candidates = [...new Set([before, after])]
    .map((o) => naive - o)
    .filter((utc) => offsetMs(utc, tz) === naive - utc);
  if (candidates.length > 0) return Math.min(...candidates);
  // Gap: interpret with the pre-transition offset, which lands after the jump.
  return naive - before;
}

/** ISO weekday 1=Mon .. 7=Sun for a calendar date. */
export function isoWeekday(year: number, month: number, day: number): number {
  const d = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Calendar date `days` after the given one (pure date math, no tz). */
export function addDays(
  date: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const HAS_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const NAIVE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/;

/**
 * Parse a user-supplied time. Accepts ISO 8601 with an offset ("2026-11-03T12:00:00-05:00",
 * "...Z") or a wall-clock time without offset ("2026-11-03T12:00"), which is read in `tz`.
 * Returns a UTC ISO string.
 */
export function parseUserTime(input: string, tz: string): string {
  const s = input.trim();
  if (HAS_OFFSET.test(s)) {
    const ms = Date.parse(s);
    if (Number.isNaN(ms)) throw new Error(`Invalid date: ${input}`);
    return new Date(ms).toISOString();
  }
  const m = NAIVE.exec(s);
  if (m) {
    const [year, month, day, hour, minute] = m.slice(1).map(Number);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
      throw new Error(`Invalid date: ${input}`);
    }
    const local = { year, month, day, hour, minute };
    // Rejects e.g. Feb 30, which Date.UTC would silently roll over.
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day) {
      throw new Error(`Invalid date: ${input}`);
    }
    return new Date(zonedToUtc(local, tz)).toISOString();
  }
  throw new Error(
    `Unrecognised time "${input}". Use ISO 8601, e.g. 2026-11-03T12:00 (read in ${tz}) or 2026-11-03T17:00:00Z.`,
  );
}

/** Human-readable local rendering, e.g. "Tue 2026-11-03 12:00 EST". */
export function formatLocal(isoUtc: string | null, tz: string): string | null {
  if (!isoUtc) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(new Date(isoUtc));
}
