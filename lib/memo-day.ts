export const REVEAL_HOUR = 21;
export const TIMEZONE = "Europe/Copenhagen";

/**
 * Returns the calendar date for a given instant as an ISO date string
 * (YYYY-MM-DD) in Europe/Copenhagen. Mirrors the Postgres memo_day()
 * function after migration 0008.
 *
 * As of the calendar-day shift, this is just the local calendar date —
 * the previous "after 21:00 belongs to tomorrow" pivot is gone. Photos
 * taken at 22:00 are filed under the same day they were taken.
 */
export function memoDay(t: Date = new Date()): string {
  return localDateString(t);
}

export function isCurrentMemoDay(t: Date): boolean {
  return memoDay(t) === memoDay();
}

/** YYYY-MM-DD calendar date for an instant in TIMEZONE. */
export function localDateString(t: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(t);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Whether a revealed photo is still within the visible window.
 * Window opens at `reveal_at` (REVEAL_HOUR local) and closes at the
 * next local midnight — i.e. revealed photos are shown until the day
 * rolls over, not for a full 24h. After midnight the next batch becomes
 * the locked-countdown view.
 */
export function revealWindowOpen(
  photo: { reveal_at: string },
  now: Date = new Date(),
): boolean {
  const revealAt = new Date(photo.reveal_at);
  if (revealAt.getTime() > now.getTime()) return false;
  return localDateString(revealAt) === localDateString(now);
}

/** Minutes between now and the next REVEAL_HOUR boundary in TIMEZONE. */
export function minutesUntilNextReveal(now: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? "0");
  const h = get("hour");
  const m = get("minute");
  const mins =
    h < REVEAL_HOUR
      ? (REVEAL_HOUR - h) * 60 - m
      : (24 - h + REVEAL_HOUR) * 60 - m;
  return Math.max(0, mins);
}
