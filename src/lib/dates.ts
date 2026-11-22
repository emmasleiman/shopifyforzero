/**
 * Turning relative phrases ("last week") into exact, inclusive date ranges.
 *
 * THE RULE
 *  - All dates are calendar dates (YYYY-MM-DD) in the store's local time zone.
 *  - Ranges are inclusive on both ends: { start: "2025-10-20", end: "2025-10-26" }.
 *  - Weeks run Monday through Sunday (ISO 8601).
 *  - "Last week" = the most recent COMPLETE Monday–Sunday week before the week
 *    that contains `today`. It never includes today and never a partial week.
 *      today Mon 2025-10-27 -> 2025-10-20 .. 2025-10-26
 *      today Tue 2025-10-28 -> 2025-10-20 .. 2025-10-26
 *      today Sun 2025-10-26 -> 2025-10-13 .. 2025-10-19  (this week isn't over yet)
 *  - "Last 7 days" is different on purpose: the 7 days ending yesterday.
 *  - "Last month" = the previous full calendar month.
 *  - `today` is always passed in explicitly so answers are reproducible. The
 *    app's default is STORE_TODAY (see storeToday()).
 */

export interface DateRange {
  start: string;
  end: string;
}

export type RelativePeriod = "last_week" | "this_week" | "last_7_days" | "last_month";

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

/** Monday of the ISO week containing `date`. */
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
    case "this_week":
      return { start: startOfWeek(today), end: today };
    case "last_7_days":
      return { start: addDays(today, -7), end: addDays(today, -1) };
    case "last_month": {
      const d = parse(today);
      const firstOfThisMonth = fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
      const end = addDays(firstOfThisMonth, -1);
      return { start: `${end.slice(0, 7)}-01`, end };
    }
  }
}

/** Number of calendar days in an inclusive range. */
export function daysInRange({ start, end }: DateRange): number {
  return Math.round((parse(end).getTime() - parse(start).getTime()) / 86_400_000) + 1;
}

/**
 * The store's "today". The bundled history ends on 2025-10-27, so the demo
 * defaults to the day after; set STORE_TODAY to override (e.g. in .env.local).
 */
export const DEFAULT_STORE_TODAY = "2025-10-28";
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
