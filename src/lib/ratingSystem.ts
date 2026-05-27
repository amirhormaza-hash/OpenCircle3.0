/**
 * Pure rating calculation functions — no I/O, fully testable.
 *
 * Event Rating formula:
 *   R = (sum_actual + silent_count × 2.5) / (5 × (reviewer_count + silent_count / 2))
 *   score = R × 5   →  range [0.0, 5.0]
 *
 * Silent attendees (verified but no review) count as half-weight 5★ reviews,
 * making the default assumption generous while still rewarding real engagement.
 */

export interface StarCounts {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

/**
 * Calculate the aggregate star rating for a completed event.
 *
 * @param totalAttendees  Total geofence-verified attendees.
 * @param starCounts      How many reviewers gave each star value.
 * @returns               Score 0.0–5.0 rounded to 2 dp, or null when there
 *                        are zero reviews (caller should display "No reviews yet").
 */
export function calculateEventRating(
  totalAttendees: number,
  starCounts: StarCounts,
): number | null {
  if (totalAttendees <= 0) return null;

  const reviewerCount =
    starCounts[1] + starCounts[2] + starCounts[3] + starCounts[4] + starCounts[5];

  if (reviewerCount === 0) return null; // "No reviews yet"

  const silentCount = Math.max(0, totalAttendees - reviewerCount);

  const sumActual =
    1 * starCounts[1] +
    2 * starCounts[2] +
    3 * starCounts[3] +
    4 * starCounts[4] +
    5 * starCounts[5];

  // silent_count × (5/2) = silent half-weight 5★ contribution
  const numerator   = sumActual + silentCount * 2.5;
  const denominator = 5 * (reviewerCount + silentCount / 2);

  if (denominator === 0) return null;

  const score = (numerator / denominator) * 5;
  return Number(score.toFixed(2));
}

/**
 * Calculate a user's personal reputation score from peer reviews.
 *
 * Mode 1 – Bootstrap (3 ≤ n ≤ 10): simple average.
 * Mode 2 – Full     (n > 10):       60 % recent (last 10) + 40 % lifetime.
 *
 * @param allRatings  Every star rating received, ordered oldest → newest.
 * @returns           Score 0.0–5.0 rounded to 2 dp, or "New" when n < 3.
 */
export function calculateUserRating(allRatings: number[]): number | 'New' {
  const n = allRatings.length;

  if (n < 3) return 'New';

  if (n <= 10) {
    // Mode 1: simple average
    const sum = allRatings.reduce((acc, v) => acc + v, 0);
    return Number((sum / n).toFixed(2));
  }

  // Mode 2: weighted blend
  const recent    = allRatings.slice(-10);
  const old       = allRatings.slice(0, n - 10);

  const recentAvg = recent.reduce((acc, v) => acc + v, 0) / 10;
  const oldAvg    = old.reduce((acc, v) => acc + v, 0) / old.length;

  const score = 0.4 * oldAvg + 0.6 * recentAvg;
  return Number(score.toFixed(2));
}
