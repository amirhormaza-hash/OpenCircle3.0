/**
 * Event lifecycle rules — pure functions, no I/O.
 *
 * An event is visible from creation until 24 hours after its start time
 * (`date_time`). The window between start and that cutoff is the rating
 * window: attendees can leave a star rating only during it. After the
 * cutoff the event disappears from the feed and My List (rows are kept
 * in the database for history and reputation).
 */

export const EVENT_TTL_MS = 24 * 60 * 60 * 1000;

/** ISO timestamp for the oldest `date_time` still visible — use in queries. */
export function eventVisibilityCutoffISO(now: number = Date.now()): string {
  return new Date(now - EVENT_TTL_MS).toISOString();
}

/** True once the event is more than 24h past its start time. */
export function isEventExpired(dateTime: string, now: number = Date.now()): boolean {
  const start = new Date(dateTime).getTime();
  if (Number.isNaN(start)) return false;
  return now >= start + EVENT_TTL_MS;
}

/** True between the event's start time and 24h after it. */
export function isInRatingWindow(dateTime: string, now: number = Date.now()): boolean {
  const start = new Date(dateTime).getTime();
  if (Number.isNaN(start)) return false;
  return now >= start && now < start + EVENT_TTL_MS;
}
