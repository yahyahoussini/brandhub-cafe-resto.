// @ts-check
/**
 * Dates in the client's time zone (default Africa/Casablanca).
 *
 * Morocco is on UTC+1 most of the year and moves to UTC+0 during Ramadan, so never hard-code an
 * offset: always go through the IANA zone. Works in Node 22, Cloudflare Workers and browsers.
 */

export const DEFAULT_TZ = "Africa/Casablanca";

/**
 * Offset of a zone at an instant, in minutes (local = UTC + offset).
 * @param {number} utcMs
 * @param {string} tz
 */
export function zoneOffsetMinutes(utcMs, tz = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  /** @param {string} t */
  const get = (t) => Number(/** @type {{ value: string }} */ (parts.find((p) => p.type === t)).value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/**
 * UTC instant of a local wall-clock time in a zone.
 * @param {number} year
 * @param {number} month 1..12
 * @param {number} day
 * @param {number} [hour]
 * @param {number} [minute]
 * @param {string} [tz]
 */
export function zonedToUtc(year, month, day, hour = 0, minute = 0, tz = DEFAULT_TZ) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let utc = guess - zoneOffsetMinutes(guess, tz) * 60000;
  utc = guess - zoneOffsetMinutes(utc, tz) * 60000;
  return utc;
}

/**
 * Local calendar date "YYYY-MM-DD" of an instant.
 * @param {number} utcMs
 * @param {string} [tz]
 */
export function localDate(utcMs, tz = DEFAULT_TZ) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(utcMs));
  return p; // en-CA formats as YYYY-MM-DD
}

/**
 * First instant after a local date ends ("valid until 2027-09-30" means until the end of that day, local time).
 * @param {string} isoDate YYYY-MM-DD
 * @param {string} [tz]
 */
export function endOfLocalDay(isoDate, tz = DEFAULT_TZ) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) throw new RangeError(`not a date: ${isoDate}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1));
  return zonedToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0, 0, tz);
}

/**
 * Business day of an instant: a service that runs past midnight belongs to the previous day until
 * the cut-off hour (default 05:00), so a café closing at 01:30 reports one day, not two.
 * @param {number} utcMs
 * @param {{ tz?: string, cutoffHour?: number }} [opts]
 */
export function businessDate(utcMs, opts = {}) {
  const tz = opts.tz ?? DEFAULT_TZ;
  const cutoff = opts.cutoffHour ?? 5;
  const offset = zoneOffsetMinutes(utcMs, tz);
  const local = new Date(utcMs + offset * 60000);
  if (local.getUTCHours() < cutoff) return localDate(utcMs - 24 * 3600 * 1000, tz);
  return localDate(utcMs, tz);
}
