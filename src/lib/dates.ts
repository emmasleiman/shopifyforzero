/**
 * Turning vague dates ("last week", "this month") into exact, inclusive ranges.
 *
 * THE RULE
 *  - All dates are calendar dates (YYYY-MM-DD) in the store's time zone.
 *  - Ranges include both ends: { start: "2025-10-20", end: "2025-10-26" }.
 *  - "today" is always passed in, never read from the clock, so the same
 *    question always gives the same dates.
 *  - "last week"  = the most recent COMPLETE Monday–Sunday week.
 *      today Tue 2025-10-28 -> 2025-10-20 .. 2025-10-26
 *      today Sun 2025-10-26 -> 2025-10-13 .. 2025-10-19 (this week isn't over yet)
 *  - "this month" = the 1st of the current month through today.
 *      today Tue 2025-10-28 -> 2025-10-01 .. 2025-10-28
 *  - Returns are counted on the return date (see ./metrics).
 */

export interface DateRange {
  start: string;
  end: string;
}

export type RelativePeriod = "last_week" | "this_month";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Work in UTC internally so the server's own time zone and DST never shift a date.
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
};

/** Monday of the Monday–Sunday week containing `date`. */
export function startOfWeek(date: string): string {
  const dow = parse(date).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

export function resolvePeriod(period: RelativePeriod, today: string): DateRange {
  if (!isIsoDate(today)) throw new Error(`today must be YYYY-MM-DD, got "${today}"`);
  switch (period) {
    case "last_week": {
      const thisMonday = startOfWeek(today);
      return { start: addDays(thisMonday, -7), end: addDays(thisMonday, -1) };
    }
    case "this_month":
      return { start: `${today.slice(0, 7)}-01`, end: today };
    default:
      throw new Error(`Unknown period "${period as string}". Known: last_week, this_month`);
  }
}

/** Number of calendar days in an inclusive range. */
export function daysInRange({ start, end }: DateRange): number {
  return Math.round((parse(end).getTime() - parse(start).getTime()) / 86_400_000) + 1;
}

/** Every date from start to end, inclusive. */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * The store's "today". The bundled history ends on Monday 2025-10-27, the same
 * day the merchant questions were sent; set STORE_TODAY to override.
 */
export const DEFAULT_STORE_TODAY = "2025-10-27";
/** First day the bundled order history covers. */
export const DATA_START = "2025-05-01";

/** Splits an inclusive range into Monday–Sunday weeks or calendar months (edges clipped to the range). */
export function splitRange(start: string, end: string, by: "week" | "month"): DateRange[] {
  const out: DateRange[] = [];
  let s = start;
  while (s <= end) {
    const next = by === "week" ? addDays(startOfWeek(s), 7) : nextMonth(s);
    const e = addDays(next, -1) < end ? addDays(next, -1) : end;
    out.push({ start: s, end: e });
    s = next;
  }
  return out;
}
const nextMonth = (s: string) => {
  const d = parse(s);
  return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
};

/** Weekday name for a date, e.g. "Monday". */
export const weekday = (s: string) =>
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][parse(s).getUTCDay()];
export { addDays };
export function storeToday(): string {
  const env = process.env.STORE_TODAY;
  return env && isIsoDate(env) ? env : DEFAULT_STORE_TODAY;
}

export function assertRange(start: string, end: string): void {
  if (!isIsoDate(start)) throw new Error(`start must be YYYY-MM-DD, got "${start}"`);
  if (!isIsoDate(end)) throw new Error(`end must be YYYY-MM-DD, got "${end}"`);
  if (start > end) throw new Error(`start (${start}) is after end (${end})`);
}

export const inRange = (date: string | null, start: string, end: string) =>
  date !== null && date >= start && date <= end;
