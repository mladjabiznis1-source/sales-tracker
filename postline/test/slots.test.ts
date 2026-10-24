import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SLOTS, nextFreeSlot, validateSlots } from "../src/slots.ts";

const NY = "America/New_York";
const at = (s: string) => Date.parse(s);
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

test("picks the next slot today when it's still ahead", () => {
  // Mon 2026-10-26 09:00 EDT
  assert.equal(iso(nextFreeSlot(at("2026-10-26T13:00:00Z"), DEFAULT_SLOTS, NY, new Set())), "2026-10-26T16:00:00.000Z");
});

test("skips taken slots and slots already passed", () => {
  const now = at("2026-10-26T16:30:00Z"); // Mon 12:30 EDT
  const taken = new Set([at("2026-10-26T21:00:00Z")]); // Mon 17:00 EDT taken
  assert.equal(iso(nextFreeSlot(now, DEFAULT_SLOTS, NY, taken)), "2026-10-27T16:00:00.000Z"); // Tue 12:00
});

test("a slot at exactly 'now' is not free (must be strictly in the future)", () => {
  assert.equal(iso(nextFreeSlot(at("2026-10-26T16:00:00Z"), DEFAULT_SLOTS, NY, new Set())), "2026-10-26T21:00:00.000Z");
});

test("Friday evening rolls over the weekend to Monday", () => {
  const now = at("2026-10-30T22:00:00Z"); // Fri 18:00 EDT
  assert.equal(iso(nextFreeSlot(now, DEFAULT_SLOTS, NY, new Set())), "2026-11-02T17:00:00.000Z"); // Mon 12:00 EST
});

test("slots keep wall-clock time across DST (12:00 is 16Z before, 17Z after Nov 1)", () => {
  const fri = nextFreeSlot(at("2026-10-30T12:00:00Z"), DEFAULT_SLOTS, NY, new Set());
  assert.equal(iso(fri), "2026-10-30T16:00:00.000Z");
  const mon = nextFreeSlot(at("2026-10-31T12:00:00Z"), DEFAULT_SLOTS, NY, new Set());
  assert.equal(iso(mon), "2026-11-02T17:00:00.000Z");
});

test("day boundary uses local date, not UTC date", () => {
  // Mon 2026-10-26 22:00 EDT == Tue 02:00Z. Next slot is Tue 12:00 EDT.
  assert.equal(iso(nextFreeSlot(at("2026-10-27T02:00:00Z"), DEFAULT_SLOTS, NY, new Set())), "2026-10-27T16:00:00.000Z");
});

test("filling the queue walks forward slot by slot", () => {
  const taken = new Set<number>();
  const now = at("2026-10-26T13:00:00Z");
  const got: string[] = [];
  for (let i = 0; i < 4; i++) {
    const s = nextFreeSlot(now, DEFAULT_SLOTS, NY, taken)!;
    taken.add(s);
    got.push(iso(s)!);
  }
  assert.deepEqual(got, [
    "2026-10-26T16:00:00.000Z",
    "2026-10-26T21:00:00.000Z",
    "2026-10-27T16:00:00.000Z",
    "2026-10-27T21:00:00.000Z",
  ]);
});

test("no slots -> null; validation rejects bad input and dedupes", () => {
  assert.equal(nextFreeSlot(Date.now(), [], NY, new Set()), null);
  assert.throws(() => validateSlots([{ weekday: 0, time: "12:00" }]));
  assert.throws(() => validateSlots([{ weekday: 1, time: "24:00" }]));
  assert.deepEqual(
    validateSlots([
      { weekday: 2, time: "09:00" },
      { weekday: 1, time: "12:00" },
      { weekday: 1, time: "12:00" },
    ]),
    [
      { weekday: 1, time: "12:00" },
      { weekday: 2, time: "09:00" },
    ],
  );
});
