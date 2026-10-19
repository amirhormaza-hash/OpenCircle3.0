/**
 * Pure rating calculation functions — no I/O, fully testable.
 *
 * Ratings run 1–10, where 5 is neutral: above 5 is positive, below 5 is
 * negative. The scale changed from 1–5 in v1.0.2; migration 017 doubled every
 * stored value, which maps the old scale onto the new one exactly (an old 4.47
 * becomes 8.93), so historical ratings stay comparable with new ones.
 *
 * Event rating formula:
 *   score = (sum_actual + silent × NEUTRAL/2) / (reviewers + silent/2)
 *
 * Silent attendees (verified present but left no review) count as half-weight
 * NEUTRAL reviews. The 1–5 scale scored them as a perfect 5, and carrying that
 * over literally would have made every silent attendee a 10 — treating "said
 * nothing" as "loved it", which is a claim the data does not support. Silence
 * is absence of evidence, so it pulls toward the middle instead.
 *
 * They stay at half weight: someone who turned up and said nothing is weaker
 * evidence than someone who bothered to rate, so they should not drown out
 * the people who did.
 */

export const MIN_RATING = 1;
export const MAX_RATING = 10;

/** Ratings at this value are neutral; above is positive, below is negative. */
export const NEUTRAL_RATING = 5;

export type RatingValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** How many reviewers gave each rating value. */
export type RatingCounts = Record<RatingValue, number>;

/** All-zero counts, for accumulating into. */
export function emptyRatingCounts(): RatingCounts {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };
}

/** True when `n` is a whole number inside the 1–10 scale. */
export function isRatingValue(n: number): n is RatingValue {
  return Number.isInteger(n) && n >= MIN_RATING && n <= MAX_RATING;
}

export type Sentiment = 'negative' | 'neutral' | 'positive';

/**
 * Which side of neutral a score falls on. Drives the colour of the rating
 * slider and of any score we display.
 */
export function ratingSentiment(score: number): Sentiment {
  if (score > NEUTRAL_RATING) return 'positive';
  if (score < NEUTRAL_RATING) return 'negative';
  return 'neutral';
}

/**
 * Render a score for display, always with its denominator.
 *
 * The "/ 10" is not decoration. A bare "9.2" next to a star glyph reads as
 * out-of-five to anyone who has used any other app, and the old UI did exactly
 * that — so every surface that shows a score spells out the scale.
 */
export function formatRating(score: number, decimals = 1): string {
  return `${score.toFixed(decimals)} / ${MAX_RATING}`;
}

/** Short word for a score, shown under the slider as the user drags it. */
export function ratingLabel(score: number): string {
  if (score >= 9) return 'Excellent';
  if (score >= 7) return 'Good';
  if (score > 5)  return 'Decent';
  if (score === 5) return 'Neutral';
  if (score >= 3) return 'Poor';
  return 'Bad';
}

/**
 * Calculate the aggregate rating for a completed event.
 *
 * @param totalAttendees  Total geofence-verified attendees.
 * @param counts          How many reviewers gave each rating value.
 * @returns               Score 1.0–10.0 rounded to 2 dp, or null when there
 *                        are zero reviews (caller shows "No reviews yet").
 */
export function calculateEventRating(
  totalAttendees: number,
  counts: RatingCounts,
): number | null {
  if (totalAttendees <= 0) return null;

  let reviewerCount = 0;
  let sumActual = 0;
  for (let value = MIN_RATING; value <= MAX_RATING; value++) {
    const n = counts[value as RatingValue] ?? 0;
    reviewerCount += n;
    sumActual += value * n;
  }

  if (reviewerCount === 0) return null; // "No reviews yet"

  const silentCount = Math.max(0, totalAttendees - reviewerCount);

  // Silent attendees: half a reviewer each, scoring NEUTRAL.
  const numerator = sumActual + silentCount * (NEUTRAL_RATING / 2);
  const denominator = reviewerCount + silentCount / 2;

  if (denominator === 0) return null;

  return Number((numerator / denominator).toFixed(2));
}

/**
 * Calculate a user's personal reputation score from peer reviews.
 *
 * Mode 1 – Bootstrap (3 ≤ n ≤ 10): simple average.
 * Mode 2 – Full     (n > 10):       60 % recent (last 10) + 40 % lifetime.
 *
 * @param allRatings  Every rating received, ordered oldest → newest.
 * @returns           Score 1.0–10.0 rounded to 2 dp, or "New" when n < 3.
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
  const recent = allRatings.slice(-10);
  const old = allRatings.slice(0, n - 10);

  const recentAvg = recent.reduce((acc, v) => acc + v, 0) / 10;
  const oldAvg = old.reduce((acc, v) => acc + v, 0) / old.length;

  const score = 0.4 * oldAvg + 0.6 * recentAvg;
  return Number(score.toFixed(2));
}
