// Time math for the 72-hour appeal window (migration 017).
//
// Display only — the server is the authority. submit_appeal() rejects an
// appeal filed after the deadline, and purge_expired_bans() is what actually
// deletes the account. This just tells the user how long they have.

/**
 * Human-readable time left until `deadline`, or null once it has passed.
 *
 * `now` is injectable so this can be tested without freezing the clock.
 * Rounds down: with 90 seconds left it says "00h 01m", never "00h 02m".
 */
export function formatRemaining(
  deadline: string | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!deadline) return null;

  const end = new Date(deadline).getTime();
  if (Number.isNaN(end)) return null;

  const ms = end - now;
  if (ms <= 0) return null;

  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  return days > 0
    ? `${days}d ${pad(hours)}h ${pad(minutes)}m`
    : `${pad(hours)}h ${pad(minutes)}m`;
}

/** True once the appeal window has closed and the account is due for deletion. */
export function isWindowClosed(
  deadline: string | null | undefined,
  now: number = Date.now(),
): boolean {
  return formatRemaining(deadline, now) === null;
}
