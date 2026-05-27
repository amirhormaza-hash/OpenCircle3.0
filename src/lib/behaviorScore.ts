/**
 * Behavior score helpers — pure logic, no I/O.
 *
 * Every user starts at 1000.  Score is a non-negative integer.
 * Trust tier is recomputed from the live score after every transaction.
 */

// ── Trust Tiers ──────────────────────────────────────────────────────────────

export type TrustTier = 'Trusted' | 'Reliable' | 'Casual' | 'Flagged' | 'Restricted';

export interface TrustTierInfo {
  tier:     TrustTier;
  emoji:    string;
  canJoin:  boolean;
  canHost:  boolean;
}

export function getTrustTier(score: number): TrustTierInfo {
  if (score >= 1200) return { tier: 'Trusted',    emoji: '🥇', canJoin: true,  canHost: true  };
  if (score >= 1000) return { tier: 'Reliable',   emoji: '🥈', canJoin: true,  canHost: true  };
  if (score >= 900)  return { tier: 'Casual',     emoji: '🥉', canJoin: true,  canHost: true  };
  if (score >= 800)  return { tier: 'Flagged',    emoji: '⚠️', canJoin: true,  canHost: false };
  return               { tier: 'Restricted', emoji: '🚫', canJoin: false, canHost: false };
}

// ── Point Values ─────────────────────────────────────────────────────────────

export const POINT_VALUES = {
  // App interaction
  daily_login:             2,
  complete_profile:        10,
  add_profile_photo:       5,
  write_bio:               5,
  first_event_joined:      20,

  // Event engagement
  join_event:              5,
  join_event_early:        3,   // bonus for joining 24 h+ before start
  event_chat_message:      2,   // capped at 5 rewarded msgs per event
  geofence_confirmed:      10,
  leave_review:            5,
  receive_5star:           10,
  receive_4star:           5,

  // Live event mode
  post_photo_live:         8,
  post_video_live:         10,
  post_shared_externally:  15,  // requires verified external click

  // Sharing & growth
  share_event:             10,  // requires verified external click
  join_via_shared_link:    20,
  vouch_user:              5,
  get_vouched:             15,
  refer_friend:            30,  // only after referred friend attends first event

  // Hosting
  first_event_hosted:      25,
  host_event_above_4star:  20,
  host_event_above_4_5star:35,
  event_full_attendance:   25,
  respond_within_1hr:      5,

  // Deductions — recoverable mistakes
  no_show:                 -30,
  late_cancellation:       -20,
  hosted_below_2star:      -20,

  // Deductions — inappropriate (zero tolerance; bypass new-user protection)
  harassment_confirmed:          -200,
  hate_speech:                   -300,
  inappropriate_live_content:    -150,
  fake_reviews:                  -200,
  multiple_reports:              -100, // per confirmed report
  predatory_behavior:            -1000,
} as const;

export type PointAction = keyof typeof POINT_VALUES;

// ── Deduction categorisation ─────────────────────────────────────────────────

export const INAPPROPRIATE_ACTIONS = new Set<PointAction>([
  'harassment_confirmed',
  'hate_speech',
  'inappropriate_live_content',
  'fake_reviews',
  'multiple_reports',
  'predatory_behavior',
]);

// ── New-user protection ───────────────────────────────────────────────────────

export interface ProtectionResult {
  /** True → skip the deduction; issue a warning instead. */
  protected:     boolean;
  warningAction: 'first_no_show_warning' | 'first_late_cancel_warning' | null;
}

/**
 * Decide whether new-user protection applies to a deduction action.
 *
 * Protection is NEVER applied to inappropriate-behaviour actions.
 * It covers at most one no-show and one late cancellation per user.
 */
export function checkNewUserProtection(
  action:                   PointAction,
  protectionActive:         boolean,
  firstNoShowGiven:         boolean,
  firstLateCancelGiven:     boolean,
): ProtectionResult {
  if (!protectionActive || INAPPROPRIATE_ACTIONS.has(action)) {
    return { protected: false, warningAction: null };
  }

  if (action === 'no_show' && !firstNoShowGiven) {
    return { protected: true, warningAction: 'first_no_show_warning' };
  }

  if (action === 'late_cancellation' && !firstLateCancelGiven) {
    return { protected: true, warningAction: 'first_late_cancel_warning' };
  }

  return { protected: false, warningAction: null };
}

// ── Score arithmetic ──────────────────────────────────────────────────────────

/** Apply a delta to a score, clamping at 0 from below. */
export function applyDelta(currentScore: number, delta: number): number {
  return Math.max(0, currentScore + delta);
}

/**
 * Check whether new-user protection has naturally expired.
 * Returns true when the 30-day window has elapsed AND the score is still ≤ 1050.
 * Protection ends as soon as either condition is no longer met.
 */
export function isProtectionExpired(
  expiryTimestamp: string | null,
  currentScore:    number,
): boolean {
  if (!expiryTimestamp) return true;
  const expired = new Date() > new Date(expiryTimestamp);
  const exceededScore = currentScore > 1050;
  return expired || exceededScore;
}
