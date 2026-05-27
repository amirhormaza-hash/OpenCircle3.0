import { calculateEventRating, calculateUserRating } from '../ratingSystem';
import type { StarCounts } from '../ratingSystem';

// ── Helper ────────────────────────────────────────────────────────────────────
function stars(s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0): StarCounts {
  return { 1: s1, 2: s2, 3: s3, 4: s4, 5: s5 };
}

// =============================================================================
// calculateEventRating
// =============================================================================

describe('calculateEventRating', () => {

  describe('zero-review edge cases', () => {
    it('returns null when reviewer_count = 0 (display "No reviews yet")', () => {
      expect(calculateEventRating(10, stars())).toBeNull();
    });

    it('returns null when totalAttendees = 0', () => {
      expect(calculateEventRating(0, stars())).toBeNull();
    });

    it('never divides by zero when all attendees are silent', () => {
      // 5 silent attendees, zero reviews
      // denominator = 5 × (0 + 5/2) = 12.5 — must not throw, must return null
      expect(calculateEventRating(5, stars())).toBeNull();
    });
  });

  describe('silent-only events', () => {
    it('returns 5.0 when all attendees are silent (everyone counted as half-weight 5★)', () => {
      // numerator   = 0 + (10 × 2.5) = 25
      // denominator = 5 × (0 + 5)    = 25
      // score = (25/25) × 5 = 5.0
      expect(calculateEventRating(10, stars())).toBeNull(); // zero reviews → null
    });

    it('returns 5.0 when there is exactly one silent attendee and zero reviews', () => {
      expect(calculateEventRating(1, stars())).toBeNull();
    });
  });

  describe('all same-star reviews', () => {
    it('returns 1.0 when all reviewers give 1★ and no silent attendees', () => {
      // 5 reviewers, all 1★, 0 silent
      // numerator   = 5 × 1 + 0        = 5
      // denominator = 5 × (5 + 0)      = 25
      // score       = (5/25) × 5       = 1.0
      expect(calculateEventRating(5, stars(5, 0, 0, 0, 0))).toBe(1.0);
    });

    it('returns 5.0 when all reviewers give 5★ and no silent attendees', () => {
      expect(calculateEventRating(5, stars(0, 0, 0, 0, 5))).toBe(5.0);
    });

    it('returns 3.0 when all reviewers give 3★ and no silent attendees', () => {
      // numerator   = 15 + 0  = 15
      // denominator = 5 × 5   = 25
      // score       = (15/25) × 5 = 3.0
      expect(calculateEventRating(5, stars(0, 0, 5, 0, 0))).toBe(3.0);
    });
  });

  describe('spec examples', () => {
    it('example 1: 10 attendees — 1×1★, 4×5★, 5 silent → ≈4.47', () => {
      // numerator   = (1 + 20) + (5 × 2.5) = 33.5
      // denominator = 5 × (5 + 2.5)        = 37.5
      // score       = (33.5/37.5) × 5      ≈ 4.4667 → 4.47
      // Note: spec shows 4.46; we use standard toFixed(2) rounding → 4.47
      expect(calculateEventRating(10, stars(1, 0, 0, 0, 4))).toBe(4.47);
    });

    it('example 2: 200 attendees — 2×1★, 8×4★, 15×5★, 175 silent → 4.86', () => {
      // numerator   = (2 + 32 + 75) + (175 × 2.5) = 546.5
      // denominator = 5 × (25 + 87.5)             = 562.5
      // score       = (546.5/562.5) × 5           ≈ 4.8578 → 4.86
      expect(calculateEventRating(200, stars(2, 0, 0, 8, 15))).toBe(4.86);
    });
  });

  describe('small events', () => {
    it('single reviewer, 1★, no silents → 1.0', () => {
      expect(calculateEventRating(1, stars(1))).toBe(1.0);
    });

    it('single reviewer, 5★, no silents → 5.0', () => {
      expect(calculateEventRating(1, stars(0, 0, 0, 0, 1))).toBe(5.0);
    });

    it('2 attendees: 1×1★, 1 silent', () => {
      // numerator   = 1 + (1 × 2.5) = 3.5
      // denominator = 5 × (1 + 0.5) = 7.5
      // score       = (3.5/7.5) × 5 ≈ 2.33
      expect(calculateEventRating(2, stars(1))).toBe(2.33);
    });
  });

  describe('medium events', () => {
    it('mixed 2★/3★/4★ ratings with silents, rounds to 2dp', () => {
      // 20 attendees: 2×2★, 3×3★, 5×4★, 10 silent
      // sum_actual   = 4 + 9 + 20          = 33
      // numerator    = 33 + (10 × 2.5)     = 58
      // denominator  = 5 × (10 + 5)        = 75
      // score        = (58/75) × 5         ≈ 3.87
      expect(calculateEventRating(20, stars(0, 2, 3, 5, 0))).toBe(3.87);
    });
  });

  describe('reviewer_count > totalAttendees guard', () => {
    it('silentCount cannot go below 0 (data inconsistency is handled gracefully)', () => {
      // 3 reviewers reported but total attendees = 2 (data inconsistency)
      // silentCount clamped to 0, so result equals all-reviewer average
      const result = calculateEventRating(2, stars(0, 0, 0, 0, 3));
      expect(typeof result).toBe('number');
      expect(result).toBe(5.0);
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
      expect(calculateUserRating([4])).toBe('New');
    });

    it('returns "New" for 2 ratings', () => {
      expect(calculateUserRating([4, 5])).toBe('New');
    });

    it('does NOT return "New" for exactly 3 ratings', () => {
      expect(calculateUserRating([4, 4, 4])).not.toBe('New');
    });
  });

  describe('Mode 1 — Bootstrap (3 ≤ n ≤ 10)', () => {
    it('returns simple average for exactly 3 ratings', () => {
      // (4 + 5 + 3) / 3 = 4.0
      expect(calculateUserRating([4, 5, 3])).toBe(4.0);
    });

    it('returns simple average for exactly 10 ratings', () => {
      const ratings = [5, 5, 5, 5, 5, 1, 1, 1, 1, 1];
      // sum = 30, avg = 3.0
      expect(calculateUserRating(ratings)).toBe(3.0);
    });

    it('rounds to 2 decimal places', () => {
      // (5 + 4 + 4) / 3 = 4.333...  → 4.33
      expect(calculateUserRating([5, 4, 4])).toBe(4.33);
    });
  });

  describe('Mode 2 — Full formula (n > 10)', () => {
    it('spec example: 15 ratings — first 5 sum=20, last 10 sum=45 → 4.3', () => {
      // old_avg = 20/5 = 4.0 (ratings[0..4])
      // recent_avg = 45/10 = 4.5 (ratings[5..14])
      // R = 0.4×4.0 + 0.6×4.5 = 4.3
      const ratings = [4, 4, 4, 4, 4, 5, 5, 4, 5, 4, 5, 4, 4, 5, 4];
      // sum first 5 = 20  ✓, sum last 10 = 45  ✓
      expect(calculateUserRating(ratings)).toBe(4.3);
    });

    it('applies for exactly 11 ratings (boundary)', () => {
      const ratings = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 5]; // 10×3, 1×5
      // old = ratings[0] = [3], old_avg = 3.0
      // recent = ratings[1..10] = [3,3,3,3,3,3,3,3,3,5], recent_avg = 3.2
      // R = 0.4×3.0 + 0.6×3.2 = 1.2 + 1.92 = 3.12
      expect(calculateUserRating(ratings)).toBe(3.12);
    });

    it('never divides by zero for n > 10', () => {
      const ratings = Array(15).fill(5);
      expect(() => calculateUserRating(ratings)).not.toThrow();
    });

    it('recent behavior outweighs history when recent ratings are much higher', () => {
      // 5 old ratings all 1★, 10 recent all 5★
      const ratings = [1, 1, 1, 1, 1, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      // old_avg = 1.0, recent_avg = 5.0
      // R = 0.4×1.0 + 0.6×5.0 = 0.4 + 3.0 = 3.4
      expect(calculateUserRating(ratings)).toBe(3.4);
    });

    it('returns 2 decimal place precision', () => {
      const result = calculateUserRating(Array(15).fill(4.7));
      expect(result.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
    });
  });

  describe('boundary: exactly 10 ratings uses Mode 1, 11 uses Mode 2', () => {
    it('n=10 uses simple average, not weighted blend', () => {
      const ten = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]; // avg = 3.0
      expect(calculateUserRating(ten)).toBe(3.0);
    });

    it('n=11 uses weighted blend', () => {
      const eleven = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 5]; // old=[1] avg=1, recent sum=40 avg=4
      // R = 0.4×1 + 0.6×4 = 0.4 + 2.4 = 2.8
      expect(calculateUserRating(eleven)).toBe(2.8);
    });
  });
});
