/**
 * Week helpers. A "week" is identified by its Monday, stored as a UTC midnight
 * DateTime so that the same week always maps to the same value regardless of
 * the server timezone.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday (UTC midnight) of the week containing `date`. */
export function weekStart(date: Date = new Date()): Date {
  const utc = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  // getUTCDay(): 0 = Sunday ... 6 = Saturday
  const offset = (utc.getUTCDay() + 6) % 7;
  return new Date(utc.getTime() - offset * DAY_MS);
}

export function addWeeks(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 7 * DAY_MS);
}

export function currentWeekStart(): Date {
  return weekStart(new Date());
}

export function nextWeekStart(): Date {
  return addWeeks(currentWeekStart(), 1);
}

/** Parse a `YYYY-MM-DD` (or ISO) string and normalise it to that week's Monday. */
export function parseWeekParam(raw: unknown): Date | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = String(raw);
  if (value === "current" || value === "this") return currentWeekStart();
  if (value === "next") return nextWeekStart();
  if (value === "previous" || value === "prev" || value === "last") {
    return addWeeks(currentWeekStart(), -1);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return weekStart(parsed);
}

/** `YYYY-MM-DD` form, useful for prompts and API payloads. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
