export type DayRange = { start: Date; end: Date };

// The shop works in Bangladesh time (UTC+6, no daylight saving). "Today" in a report means that day there,
// not the day of the server's own clock. The server runs in UTC, which cut every day at 6 am and moved sales
// made after midnight into the wrong day.
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

/** Calendar ranges (start included, end excluded) for the reports page, in Asia/Dhaka. */
export function reportBounds(now: Date): Record<
  "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "this_year" | "last_year",
  DayRange
> {
  // Shifted by +6h, the UTC fields of this date read like the wall clock in Dhaka.
  const wall = new Date(now.getTime() + DHAKA_OFFSET_MS);
  const year = wall.getUTCFullYear();
  const month = wall.getUTCMonth();
  const day = wall.getUTCDate();
  // The real instant at which a Dhaka calendar day begins. Date.UTC accepts day 0, -1 or month 12 and rolls over.
  const dayStart = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - DHAKA_OFFSET_MS);
  const weekDay = (wall.getUTCDay() + 6) % 7; // Monday is 0
  const range = (start: Date, end: Date): DayRange => ({ start, end });
  const today = dayStart(year, month, day);
  const thisWeek = dayStart(year, month, day - weekDay);
  const thisMonth = dayStart(year, month, 1);
  const thisYear = dayStart(year, 0, 1);
  return {
    today: range(today, dayStart(year, month, day + 1)),
    yesterday: range(dayStart(year, month, day - 1), today),
    this_week: range(thisWeek, dayStart(year, month, day - weekDay + 7)),
    last_week: range(dayStart(year, month, day - weekDay - 7), thisWeek),
    this_month: range(thisMonth, dayStart(year, month + 1, 1)),
    last_month: range(dayStart(year, month - 1, 1), thisMonth),
    this_year: range(thisYear, dayStart(year + 1, 0, 1)),
    last_year: range(dayStart(year - 1, 0, 1), thisYear),
  };
}
