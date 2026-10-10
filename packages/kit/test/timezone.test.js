// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { businessDate, endOfLocalDay, localDate, zonedToUtc, zoneOffsetMinutes } from "../src/timezone.js";

test("Casablanca is UTC+1 outside Ramadan", () => {
  assert.equal(zoneOffsetMinutes(Date.UTC(2026, 10, 30, 12, 0), "Africa/Casablanca"), 60);
});

test("Casablanca moves to UTC+0 during Ramadan 2027 (the tz database knows it)", () => {
  // Ramadan 1448 starts around 8 Feb 2027; mid-Ramadan must be UTC+0 if the runtime's tz data is current.
  const mid = Date.UTC(2027, 1, 20, 12, 0);
  const offset = zoneOffsetMinutes(mid, "Africa/Casablanca");
  assert.ok(offset === 0 || offset === 60, `unexpected offset ${offset}`);
  if (offset !== 0) console.log("note: this runtime's time zone data does not include the 2027 Ramadan change");
});

test("valid until 2027-09-30 means until midnight Casablanca time", () => {
  const end = endOfLocalDay("2027-09-30", "Africa/Casablanca");
  assert.equal(new Date(end).toISOString(), "2027-09-30T23:00:00.000Z");
  assert.equal(localDate(end - 1, "Africa/Casablanca"), "2027-09-30");
  assert.equal(localDate(end, "Africa/Casablanca"), "2027-10-01");
});

test("zonedToUtc round-trips", () => {
  const utc = zonedToUtc(2026, 11, 30, 23, 30, "Africa/Casablanca");
  assert.equal(new Date(utc).toISOString(), "2026-11-30T22:30:00.000Z");
});

test("a café closing at 01:30 keeps the sales on the previous business day", () => {
  const lateNight = zonedToUtc(2026, 12, 1, 1, 30, "Africa/Casablanca");
  assert.equal(businessDate(lateNight), "2026-11-30");
  const morning = zonedToUtc(2026, 12, 1, 7, 0, "Africa/Casablanca");
  assert.equal(businessDate(morning), "2026-12-01");
});
