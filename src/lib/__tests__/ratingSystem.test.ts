import {
  calculateEventRating,
  calculateUserRating,
  emptyRatingCounts,
  isRatingValue,
  ratingLabel,
  ratingSentiment,
  MAX_RATING,
  MIN_RATING,
  NEUTRAL_RATING,
} from '../ratingSystem';
import type { RatingCounts, RatingValue } from '../ratingSystem';

// ── Helper ────────────────────────────────────────────────────────────────────
// Positional args stopped being readable at ten values, so name them instead:
// counts({ 10: 4 }) is "four reviewers gave a 10".
function counts(partial: Partial<Record<RatingValue, number>>): RatingCounts {
  return { ...emptyRatingCounts(), ...partial };
}

// =============================================================================
// Scale constants
// =============================================================================

describe('scale constants', () => {
  it('runs 1 to 10', () => {
    expect(MIN_RATING).toBe(1);
    expect(MAX_RATING).toBe(10);
  });

  it('treats 5 as neutral', () => {
    expect(NEUTRAL_RATING).toBe(5);
  });
});

// =============================================================================
// calculateEventRating
// =============================================================================

describe('calculateEventRating', () => {

  describe('zero-review edge cases', () => {
    it('returns null when reviewer count = 0 (display "No reviews yet")', () => {
      expect(calculateEventRating(10, counts({}))).toBeNull();
    });

    it('returns null when totalAttendees = 0', () => {
      expect(calculateEventRating(0, counts({}))).toBeNull();
    });

    it('returns null — not a divide-by-zero — when every attendee is silent', () => {
      expect(calculateEventRating(5, counts({}))).toBeNull();
    });

    it('returns null for a single silent attendee and no reviews', () => {
      expect(calculateEventRating(1, counts({}))).toBeNull();
    });
  });

  describe('all reviewers agree, no silent attendees', () => {
    it('bottom of the scale → 1.0', () => {
      // sum = 5 × 1 = 5, denominator = 5 → 1.0
      expect(calculateEventRating(5, counts({ 1: 5 }))).toBe(1.0);
    });

    it('top of the scale → 10.0', () => {
      expect(calculateEventRating(5, counts({ 10: 5 }))).toBe(10.0);
    });

    it('everyone neutral → exactly 5.0', () => {
      // The point of the new scale: a room full of shrugs reads as 5, not as
      // the midpoint of a star rating.
      expect(calculateEventRating(5, counts({ 5: 5 }))).toBe(5.0);
    });
  });

  describe('spec examples, carried over from the 1–5 scale', () => {
    it('10 attendees — 1×2, 4×10, 5 silent → 8.93 (was 4.47 at half scale)', () => {
      // sum         = 2 + 40          = 42
      // numerator   = 42 + (5 × 5)    = 67
      // denominator = 5 + 2.5         = 7.5
      // score       = 67 / 7.5        ≈ 8.9333 → 8.93
      expect(calculateEventRating(10, counts({ 2: 1, 10: 4 }))).toBe(8.93);
    });

    it('200 attendees — 2×2, 8×8, 15×10, 175 silent → 9.72 (was 4.86)', () => {
      // sum         = 4 + 64 + 150       = 218
      // numerator   = 218 + (175 × 5)    = 1093
      // denominator = 25 + 87.5          = 112.5
      // score       = 1093 / 112.5       ≈ 9.7156 → 9.72
      expect(calculateEventRating(200, counts({ 2: 2, 8: 8, 10: 15 }))).toBe(9.72);
    });
  });

  describe('small events', () => {
    it('single reviewer at 1, no silents → 1.0', () => {
      expect(calculateEventRating(1, counts({ 1: 1 }))).toBe(1.0);
    });

    it('single reviewer at 10, no silents → 10.0', () => {
      expect(calculateEventRating(1, counts({ 10: 1 }))).toBe(10.0);
    });

    it('one 1-star review plus one silent attendee → 4.0', () => {
      // numerator   = 1 + (1 × 5) = 6
      // denominator = 1 + 0.5     = 1.5
      // score       = 6 / 1.5     = 4.0
      // The silent attendee drags a lone bad review up to just under neutral.
      expect(calculateEventRating(2, counts({ 1: 1 }))).toBe(4.0);
    });
  });

  describe('medium events', () => {
    it('mixed 4/6/8 ratings with silents, rounds to 2dp', () => {
      // 20 attendees: 2×4, 3×6, 5×8, 10 silent
      // sum         = 8 + 18 + 40   = 66
      // numerator   = 66 + (10 × 5) = 116
      // denominator = 10 + 5        = 15
      // score       = 116 / 15      ≈ 7.7333 → 7.73
      expect(calculateEventRating(20, counts({ 4: 2, 6: 3, 8: 5 }))).toBe(7.73);
    });
  });

  describe('reviewers > attendees guard', () => {
    it('clamps silent count at 0 rather than going negative', () => {
      // 3 reviewers but only 2 recorded attendees — inconsistent data.
      const result = calculateEventRating(2, counts({ 10: 3 }));
      expect(typeof result).toBe('number');
      expect(result).toBe(10.0);
    });
  });

  describe('range', () => {
    it('never exceeds MAX_RATING', () => {
      expect(calculateEventRating(50, counts({ 10: 50 }))).toBe(MAX_RATING);
    });

    it('never falls below MIN_RATING when there are no silent attendees', () => {
      expect(calculateEventRating(50, counts({ 1: 50 }))).toBe(MIN_RATING);
    });
  });
});

// =============================================================================
// calculateUserRating
// =============================================================================

describe('calculateUserRating', () => {

  describe('"New" status', () => {
    it('returns "New" for 0 ratings', () => {
      expect(calculateUserRating([])).toBe('New');
    });

    it('returns "New" for 1 rating', () => {
      expect(calculateUserRating([8])).toBe('New');
    });

    it('returns "New" for 2 ratings', () => {
      expect(calculateUserRating([8, 10])).toBe('New');
    });

    it('does NOT return "New" for exactly 3 ratings', () => {
      expect(calculateUserRating([8, 8, 8])).not.toBe('New');
    });
  });

  describe('Mode 1 — Bootstrap (3 ≤ n ≤ 10)', () => {
    it('returns simple average for exactly 3 ratings', () => {
      // (8 + 10 + 6) / 3 = 8.0
      expect(calculateUserRating([8, 10, 6])).toBe(8.0);
    });

    it('returns simple average for exactly 10 ratings', () => {
      const ratings = [10, 10, 10, 10, 10, 2, 2, 2, 2, 2];
      // sum = 60, avg = 6.0
      expect(calculateUserRating(ratings)).toBe(6.0);
    });

    it('rounds to 2 decimal places', () => {
      // (10 + 8 + 8) / 3 = 8.666… → 8.67
      expect(calculateUserRating([10, 8, 8])).toBe(8.67);
    });
  });

  describe('Mode 2 — Full formula (n > 10)', () => {
    it('15 ratings — first 5 avg 8, last 10 avg 9 → 8.6', () => {
      // R = 0.4×8.0 + 0.6×9.0 = 3.2 + 5.4 = 8.6
      const ratings = [8, 8, 8, 8, 8, 10, 10, 8, 10, 8, 10, 8, 8, 10, 8];
      expect(calculateUserRating(ratings)).toBe(8.6);
    });

    it('applies at exactly 11 ratings (boundary)', () => {
      const ratings = [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 10]; // 10×6, 1×10
      // old    = [6]                      → 6.0
      // recent = nine 6s and one 10 = 64  → 6.4
      // R = 0.4×6.0 + 0.6×6.4 = 2.4 + 3.84 = 6.24
      expect(calculateUserRating(ratings)).toBe(6.24);
    });

    it('never divides by zero for n > 10', () => {
      expect(() => calculateUserRating(Array(15).fill(10))).not.toThrow();
    });

    it('recent behaviour outweighs history', () => {
      // 5 old ratings at 2, 10 recent at 10
      // R = 0.4×2.0 + 0.6×10.0 = 0.8 + 6.0 = 6.8
      const ratings = [2, 2, 2, 2, 2, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
      expect(calculateUserRating(ratings)).toBe(6.8);
    });

    it('returns at most 2 decimal places', () => {
      const result = calculateUserRating(Array(15).fill(9.4));
      expect(result.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
    });
  });

  describe('boundary: n=10 uses Mode 1, n=11 uses Mode 2', () => {
    it('n=10 uses the simple average', () => {
      const ten = [2, 4, 6, 8, 10, 2, 4, 6, 8, 10]; // avg = 6.0
      expect(calculateUserRating(ten)).toBe(6.0);
    });

    it('n=11 uses the weighted blend', () => {
      const eleven = [2, 4, 6, 8, 10, 2, 4, 6, 8, 10, 10];
      // old = [2] → 2.0; recent sum = 68 → 6.8
      // R = 0.4×2.0 + 0.6×6.8 = 0.8 + 4.08 = 4.88
      expect(calculateUserRating(eleven)).toBe(4.88);
    });
  });
});

// =============================================================================
// Sentiment helpers — these drive the colour of the slider and of any score
// =============================================================================

describe('ratingSentiment', () => {
  it('above 5 is positive', () => {
    expect(ratingSentiment(6)).toBe('positive');
    expect(ratingSentiment(10)).toBe('positive');
    expect(ratingSentiment(5.01)).toBe('positive');
  });

  it('exactly 5 is neutral', () => {
    expect(ratingSentiment(5)).toBe('neutral');
  });

  it('below 5 is negative', () => {
    expect(ratingSentiment(4)).toBe('negative');
    expect(ratingSentiment(1)).toBe('negative');
    expect(ratingSentiment(4.99)).toBe('negative');
  });
});

describe('ratingLabel', () => {
  it('names each band', () => {
    expect(ratingLabel(10)).toBe('Excellent');
    expect(ratingLabel(9)).toBe('Excellent');
    expect(ratingLabel(8)).toBe('Good');
    expect(ratingLabel(7)).toBe('Good');
    expect(ratingLabel(6)).toBe('Decent');
    expect(ratingLabel(5)).toBe('Neutral');
    expect(ratingLabel(4)).toBe('Poor');
    expect(ratingLabel(3)).toBe('Poor');
    expect(ratingLabel(2)).toBe('Bad');
    expect(ratingLabel(1)).toBe('Bad');
  });

  it('agrees with ratingSentiment at the neutral boundary', () => {
    expect(ratingLabel(5)).toBe('Neutral');
    expect(ratingSentiment(5)).toBe('neutral');
    expect(ratingSentiment(6)).toBe('positive');
    expect(ratingLabel(6)).not.toBe('Neutral');
  });
});

describe('isRatingValue', () => {
  it('accepts whole numbers 1 through 10', () => {
    for (let n = 1; n <= 10; n++) expect(isRatingValue(n)).toBe(true);
  });

  it('rejects out-of-range values', () => {
    expect(isRatingValue(0)).toBe(false);
    expect(isRatingValue(11)).toBe(false);
    expect(isRatingValue(-1)).toBe(false);
  });

  it('rejects fractions — the slider must snap before submitting', () => {
    expect(isRatingValue(5.5)).toBe(false);
    expect(isRatingValue(7.1)).toBe(false);
  });
});

describe('emptyRatingCounts', () => {
  it('has a zeroed slot for every value on the scale', () => {
    const c = emptyRatingCounts();
    for (let n = 1; n <= 10; n++) expect(c[n as RatingValue]).toBe(0);
  });

  it('returns a fresh object each call', () => {
    const a = emptyRatingCounts();
    a[7] = 3;
    expect(emptyRatingCounts()[7]).toBe(0);
  });
});
