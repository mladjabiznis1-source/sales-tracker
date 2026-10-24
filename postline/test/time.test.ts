import assert from "node:assert/strict";
import { test } from "node:test";
import { formatLocal, parseUserTime, zonedToUtc } from "../src/time.ts";

const NY = "America/New_York";
const iso = (ms: number) => new Date(ms).toISOString();

test("noon New York is 17:00Z in winter (EST) and 16:00Z in summer (EDT)", () => {
  assert.equal(iso(zonedToUtc({ year: 2026, month: 1, day: 15, hour: 12, minute: 0 }, NY)), "2026-01-15T17:00:00.000Z");
  assert.equal(iso(zonedToUtc({ year: 2026, month: 7, day: 15, hour: 12, minute: 0 }, NY)), "2026-07-15T16:00:00.000Z");
});

test("DST transition days: wall-clock noon stays noon", () => {
  // 2026 US DST: starts Sun Mar 8, ends Sun Nov 1.
  assert.equal(iso(zonedToUtc({ year: 2026, month: 3, day: 8, hour: 12, minute: 0 }, NY)), "2026-03-08T16:00:00.000Z");
  assert.equal(iso(zonedToUtc({ year: 2026, month: 11, day: 1, hour: 12, minute: 0 }, NY)), "2026-11-01T17:00:00.000Z");
});

test("spring-forward gap (02:30 doesn't exist) shifts forward to 03:30 EDT", () => {
  const utc = zonedToUtc({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, NY);
  assert.equal(iso(utc), "2026-03-08T07:30:00.000Z");
  assert.match(formatLocal(iso(utc), NY)!, /03:30/);
});

test("fall-back ambiguity (01:30 happens twice) picks the first, EDT", () => {
  assert.equal(iso(zonedToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, NY)), "2026-11-01T05:30:00.000Z");
});

test("non-US zones work too (Europe/Berlin, Australia/Sydney)", () => {
  assert.equal(
    iso(zonedToUtc({ year: 2026, month: 10, day: 25, hour: 12, minute: 0 }, "Europe/Berlin")),
    "2026-10-25T11:00:00.000Z",
  );
  assert.equal(
    iso(zonedToUtc({ year: 2026, month: 1, day: 10, hour: 9, minute: 0 }, "Australia/Sydney")),
    "2026-01-09T22:00:00.000Z",
  );
});

test("parseUserTime: offsets are respected, naive times use the queue timezone", () => {
  assert.equal(parseUserTime("2026-11-03T12:00:00-05:00", NY), "2026-11-03T17:00:00.000Z");
  assert.equal(parseUserTime("2026-11-03T17:00:00Z", NY), "2026-11-03T17:00:00.000Z");
  assert.equal(parseUserTime("2026-11-03T12:00", NY), "2026-11-03T17:00:00.000Z");
  assert.equal(parseUserTime("2026-10-30 12:00", NY), "2026-10-30T16:00:00.000Z");
});

test("parseUserTime rejects garbage and impossible dates", () => {
  assert.throws(() => parseUserTime("next tuesday", NY));
  assert.throws(() => parseUserTime("2026-02-30T12:00", NY));
  assert.throws(() => parseUserTime("2026-13-01T12:00", NY));
});
