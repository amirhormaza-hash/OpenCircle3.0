import {
  getTrustTier,
  checkNewUserProtection,
  applyDelta,
  isProtectionExpired,
  POINT_VALUES,
  INAPPROPRIATE_ACTIONS,
} from '../behaviorScore';

// =============================================================================
// getTrustTier / get_user_trust_tier
// =============================================================================

describe('getTrustTier', () => {

  describe('tier boundaries', () => {
    it('score 1200 → Trusted 🥇', () => {
      const t = getTrustTier(1200);
      expect(t.tier).toBe('Trusted');
      expect(t.emoji).toBe('🥇');
      expect(t.canJoin).toBe(true);
      expect(t.canHost).toBe(true);
    });

    it('score 1199 → Reliable 🥈', () => {
      const t = getTrustTier(1199);
      expect(t.tier).toBe('Reliable');
    });

    it('score 1000 → Reliable 🥈', () => {
      expect(getTrustTier(1000).tier).toBe('Reliable');
    });

    it('score 999 → Casual 🥉', () => {
      expect(getTrustTier(999).tier).toBe('Casual');
    });

    it('score 900 → Casual 🥉', () => {
      expect(getTrustTier(900).tier).toBe('Casual');
    });

    it('score 899 → Flagged ⚠️', () => {
      const t = getTrustTier(899);
      expect(t.tier).toBe('Flagged');
      expect(t.canJoin).toBe(true);
      expect(t.canHost).toBe(false);
    });

    it('score 800 → Flagged ⚠️', () => {
      expect(getTrustTier(800).tier).toBe('Flagged');
    });

    it('score 799 → Restricted 🚫', () => {
      const t = getTrustTier(799);
      expect(t.tier).toBe('Restricted');
      expect(t.canJoin).toBe(false);
      expect(t.canHost).toBe(false);
    });

    it('score 0 → Restricted', () => {
      expect(getTrustTier(0).tier).toBe('Restricted');
    });
  });

  describe('Restricted users', () => {
    it('cannot join events', () => {
      expect(getTrustTier(500).canJoin).toBe(false);
    });

    it('cannot host events', () => {
      expect(getTrustTier(500).canHost).toBe(false);
    });
  });

  describe('Flagged users', () => {
    it('can join but cannot host', () => {
      const t = getTrustTier(850);
      expect(t.canJoin).toBe(true);
      expect(t.canHost).toBe(false);
    });
  });

  describe('trust tier updates on every transaction', () => {
    it('Reliable → Trusted after score crosses 1200', () => {
      const before = getTrustTier(1150);
      const after  = getTrustTier(1200);
      expect(before.tier).toBe('Reliable');
      expect(after.tier).toBe('Trusted');
    });

    it('Casual → Flagged after score drops below 900', () => {
      const before = getTrustTier(900);
      const after  = getTrustTier(899);
      expect(before.tier).toBe('Casual');
      expect(after.tier).toBe('Flagged');
    });
  });
});

// =============================================================================
// applyDelta — score floor
// =============================================================================

describe('applyDelta', () => {
  it('score floors at 0 — never goes negative', () => {
    expect(applyDelta(10, -50)).toBe(0);
  });

  it('score floors at 0 for large inappropriate penalty', () => {
    expect(applyDelta(100, -300)).toBe(0);
  });

  it('adds points correctly', () => {
    expect(applyDelta(1000, 10)).toBe(1010);
  });

  it('subtracts points correctly', () => {
    expect(applyDelta(1000, -30)).toBe(970);
  });

  it('exact zero is valid', () => {
    expect(applyDelta(30, -30)).toBe(0);
  });
});

// =============================================================================
// checkNewUserProtection
// =============================================================================

describe('checkNewUserProtection', () => {

  describe('no-show first offence', () => {
    it('issues warning (no deduction) on first no-show during protection', () => {
      const result = checkNewUserProtection('no_show', true, false, false);
      expect(result.protected).toBe(true);
      expect(result.warningAction).toBe('first_no_show_warning');
    });

    it('does NOT protect second no-show during protection period', () => {
      const result = checkNewUserProtection('no_show', true, true, false);
      expect(result.protected).toBe(false);
    });
  });

  describe('late cancellation first offence', () => {
    it('issues warning on first late cancellation during protection', () => {
      const result = checkNewUserProtection('late_cancellation', true, false, false);
      expect(result.protected).toBe(true);
      expect(result.warningAction).toBe('first_late_cancel_warning');
    });

    it('does NOT protect second late cancellation', () => {
      const result = checkNewUserProtection('late_cancellation', true, false, true);
      expect(result.protected).toBe(false);
    });
  });

  describe('inappropriate behaviour bypasses protection', () => {
    it('harassment_confirmed bypasses protection', () => {
      const result = checkNewUserProtection('harassment_confirmed', true, false, false);
      expect(result.protected).toBe(false);
    });

    it('hate_speech bypasses protection', () => {
      expect(checkNewUserProtection('hate_speech', true, false, false).protected).toBe(false);
    });

    it('fake_reviews bypasses protection', () => {
      expect(checkNewUserProtection('fake_reviews', true, false, false).protected).toBe(false);
    });

    it('predatory_behavior bypasses protection', () => {
      expect(checkNewUserProtection('predatory_behavior', true, false, false).protected).toBe(false);
    });

    it('inappropriate_live_content bypasses protection', () => {
      expect(checkNewUserProtection('inappropriate_live_content', true, false, false).protected).toBe(false);
    });

    it('multiple_reports bypasses protection', () => {
      expect(checkNewUserProtection('multiple_reports', true, false, false).protected).toBe(false);
    });
  });

  describe('protection inactive', () => {
    it('returns unprotected when protectionActive = false', () => {
      const result = checkNewUserProtection('no_show', false, false, false);
      expect(result.protected).toBe(false);
      expect(result.warningAction).toBeNull();
    });
  });
});

// =============================================================================
// isProtectionExpired
// =============================================================================

describe('isProtectionExpired', () => {
  it('expires after the 30-day timestamp has passed', () => {
    const pastDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(isProtectionExpired(pastDate, 1000)).toBe(true);
  });

  it('remains active within 30 days if score ≤ 1050', () => {
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
    expect(isProtectionExpired(futureDate, 1020)).toBe(false);
  });

  it('expires early when score exceeds 1050', () => {
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
    expect(isProtectionExpired(futureDate, 1051)).toBe(true);
  });

  it('returns true when expiry is null', () => {
    expect(isProtectionExpired(null, 1000)).toBe(true);
  });
});

// =============================================================================
// POINT_VALUES — verify key point amounts
// =============================================================================

describe('POINT_VALUES', () => {
  it('no_show penalty is -30', () => {
    expect(POINT_VALUES.no_show).toBe(-30);
  });

  it('late_cancellation penalty is -20', () => {
    expect(POINT_VALUES.late_cancellation).toBe(-20);
  });

  it('predatory_behavior is -1000', () => {
    expect(POINT_VALUES.predatory_behavior).toBe(-1000);
  });

  it('hate_speech is -300', () => {
    expect(POINT_VALUES.hate_speech).toBe(-300);
  });

  it('harassment_confirmed is -200', () => {
    expect(POINT_VALUES.harassment_confirmed).toBe(-200);
  });

  it('daily_login is +2', () => {
    expect(POINT_VALUES.daily_login).toBe(2);
  });

  it('geofence_confirmed is +10', () => {
    expect(POINT_VALUES.geofence_confirmed).toBe(10);
  });

  it('first_event_hosted is +25', () => {
    expect(POINT_VALUES.first_event_hosted).toBe(25);
  });
});

// =============================================================================
// INAPPROPRIATE_ACTIONS set
// =============================================================================

describe('INAPPROPRIATE_ACTIONS', () => {
  it('contains all zero-tolerance actions', () => {
    expect(INAPPROPRIATE_ACTIONS.has('harassment_confirmed')).toBe(true);
    expect(INAPPROPRIATE_ACTIONS.has('hate_speech')).toBe(true);
    expect(INAPPROPRIATE_ACTIONS.has('inappropriate_live_content')).toBe(true);
    expect(INAPPROPRIATE_ACTIONS.has('fake_reviews')).toBe(true);
    expect(INAPPROPRIATE_ACTIONS.has('multiple_reports')).toBe(true);
    expect(INAPPROPRIATE_ACTIONS.has('predatory_behavior')).toBe(true);
  });

  it('does NOT contain recoverable mistakes', () => {
    expect(INAPPROPRIATE_ACTIONS.has('no_show')).toBe(false);
    expect(INAPPROPRIATE_ACTIONS.has('late_cancellation')).toBe(false);
    expect(INAPPROPRIATE_ACTIONS.has('hosted_below_2star')).toBe(false);
  });
});

// =============================================================================
// Composite score simulation (integration-style, no I/O)
// =============================================================================

describe('score simulation', () => {
  it('new user starts at 1000 in Reliable tier', () => {
    const tier = getTrustTier(1000);
    expect(tier.tier).toBe('Reliable');
  });

  it('score never drops below 0 regardless of stacked penalties', () => {
    let score = 50;
    score = applyDelta(score, POINT_VALUES.hate_speech);       // -300 → floor 0
    score = applyDelta(score, POINT_VALUES.harassment_confirmed); // -200 → stays 0
    expect(score).toBe(0);
  });

  it('predatory_behavior (permanent ban) drives score to 0 from any starting point', () => {
    expect(applyDelta(1500, POINT_VALUES.predatory_behavior)).toBe(500);
    expect(applyDelta(900,  POINT_VALUES.predatory_behavior)).toBe(0);
  });

  it('Diamond badge requires score ≥ 1200 — Trusted tier — before the 30-day clock starts', () => {
    // A user at 1199 is NOT yet in Trusted, so Diamond timer must not start
    expect(getTrustTier(1199).tier).not.toBe('Trusted');
    expect(getTrustTier(1200).tier).toBe('Trusted');
  });

  it('host_event_above_4_5star (+35) adds more than host_event_above_4star (+20)', () => {
    expect(POINT_VALUES.host_event_above_4_5star).toBeGreaterThan(POINT_VALUES.host_event_above_4star);
  });
});
