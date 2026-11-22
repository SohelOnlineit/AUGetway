import assert from "node:assert/strict";
import test from "node:test";
import { reportBounds } from "./report-bounds.ts";

const iso = (date: Date) => date.toISOString();

test("a sale at 1 am in Dhaka belongs to that Dhaka day, not to the UTC day before", () => {
  // 2026-11-22 19:00 UTC is 2026-11-23 01:00 in Dhaka (a Monday).
  const bounds = reportBounds(new Date("2026-11-22T19:00:00Z"));
  assert.equal(iso(bounds.today.start), "2026-11-22T18:00:00.000Z");
  assert.equal(iso(bounds.today.end), "2026-11-23T18:00:00.000Z");
  assert.equal(iso(bounds.yesterday.start), "2026-11-21T18:00:00.000Z");
  assert.equal(iso(bounds.yesterday.end), "2026-11-22T18:00:00.000Z");
});

test("the day does not change at 6 am UTC any more", () => {
  const before = reportBounds(new Date("2026-11-22T17:59:00Z"));
  const after = reportBounds(new Date("2026-11-22T18:01:00Z"));
  assert.equal(iso(before.today.start), "2026-11-21T18:00:00.000Z");
  assert.equal(iso(after.today.start), "2026-11-22T18:00:00.000Z");
});

test("the week starts on Monday in Dhaka", () => {
  // Monday 2026-11-23 01:00 Dhaka.
  const monday = reportBounds(new Date("2026-11-22T19:00:00Z"));
  assert.equal(iso(monday.this_week.start), "2026-11-22T18:00:00.000Z");
  assert.equal(iso(monday.this_week.end), "2026-11-29T18:00:00.000Z");
  assert.equal(iso(monday.last_week.start), "2026-11-15T18:00:00.000Z");
  // Sunday 2026-11-29 12:00 Dhaka is still the same week.
  const sunday = reportBounds(new Date("2026-11-29T06:00:00Z"));
  assert.equal(iso(sunday.this_week.start), "2026-11-22T18:00:00.000Z");
});

test("month and year ranges roll over correctly, including January and December", () => {
  const january = reportBounds(new Date("2026-01-15T06:00:00Z"));
  assert.equal(iso(january.this_month.start), "2025-12-31T18:00:00.000Z");
  assert.equal(iso(january.last_month.start), "2025-11-30T18:00:00.000Z");
  assert.equal(iso(january.last_month.end), "2025-12-31T18:00:00.000Z");
  assert.equal(iso(january.last_year.start), "2024-12-31T18:00:00.000Z");
  const december = reportBounds(new Date("2026-12-31T20:00:00Z"));
  // 2026-12-31 20:00 UTC is already 2027-01-01 02:00 in Dhaka.
  assert.equal(iso(december.this_year.start), "2026-12-31T18:00:00.000Z");
  assert.equal(iso(december.this_year.end), "2027-12-31T18:00:00.000Z");
  assert.equal(iso(december.this_month.start), "2026-12-31T18:00:00.000Z");
});

test("every range is one whole piece with no gap before the next", () => {
  const bounds = reportBounds(new Date("2026-06-10T08:00:00Z"));
  assert.equal(iso(bounds.yesterday.end), iso(bounds.today.start));
  assert.equal(iso(bounds.last_week.end), iso(bounds.this_week.start));
  assert.equal(iso(bounds.last_month.end), iso(bounds.this_month.start));
  assert.equal(iso(bounds.last_year.end), iso(bounds.this_year.start));
});
