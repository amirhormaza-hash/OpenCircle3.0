/**
 * deduct-points — Supabase Edge Function
 *
 * Deducts points for rule violations.  Applies new-user protection for
 * the first no-show and first late cancellation.  Inappropriate-behaviour
 * deductions bypass protection entirely.  Score floors at 0.
 *
 * Expected body: { user_id: string; action: string; context?: Record<string,unknown> }
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEDUCTION_VALUES: Record<string, number> = {
  no_show:                      -30,
  late_cancellation:            -20,
  hosted_below_2star:           -20,
  harassment_confirmed:         -200,
  hate_speech:                  -300,
  inappropriate_live_content:   -150,
  fake_reviews:                 -200,
  multiple_reports:             -100,
  predatory_behavior:           -1000,
};

const INAPPROPRIATE_ACTIONS = new Set([
  'harassment_confirmed',
  'hate_speech',
  'inappropriate_live_content',
  'fake_reviews',
  'multiple_reports',
  'predatory_behavior',
]);

function trustTierFromScore(score: number): { tier: string; isRestricted: boolean } {
  if (score >= 1200) return { tier: 'Trusted',    isRestricted: false };
  if (score >= 1000) return { tier: 'Reliable',   isRestricted: false };
  if (score >= 900)  return { tier: 'Casual',     isRestricted: false };
  if (score >= 800)  return { tier: 'Flagged',    isRestricted: false };
  return               { tier: 'Restricted', isRestricted: true  };
}

serve(async (req: Request) => {
  const { user_id, action, context = {} } =
    await req.json() as { user_id: string; action: string; context?: Record<string, unknown> };

  const delta = DEDUCTION_VALUES[action];
  if (delta === undefined) {
    return new Response(JSON.stringify({ error: `Unknown deduction action: ${action}` }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── Fetch profile ─────────────────────────────────────────────────────────
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select(
      'behavior_score, is_permanently_banned, new_user_protection_active, ' +
      'new_user_protection_expiry, first_no_show_warning_given, first_late_cancel_warning_given',
    )
    .eq('id', user_id)
    .single();

  if (profileErr || !profile) {
    return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 404 });
  }

  // Permanently banned users cannot be deducted further (except predatory_behavior
  // which sets the ban flag; handled below)
  if (profile.is_permanently_banned && action !== 'predatory_behavior') {
    return new Response(JSON.stringify({ error: 'User is permanently banned' }), { status: 403 });
  }

  // ── New-user protection ───────────────────────────────────────────────────
  const protectionActive: boolean = (() => {
    if (!profile.new_user_protection_active) return false;
    if (!profile.new_user_protection_expiry) return false;
    const expired      = new Date() > new Date(profile.new_user_protection_expiry);
    const exceededScore = (profile.behavior_score ?? 1000) > 1050;
    return !expired && !exceededScore;
  })();

  const isInappropriate = INAPPROPRIATE_ACTIONS.has(action);

  if (protectionActive && !isInappropriate) {
    // No-show: first offence → warning only
    if (action === 'no_show' && !profile.first_no_show_warning_given) {
      await supabase
        .from('profiles')
        .update({ first_no_show_warning_given: true })
        .eq('id', user_id);

      await supabase.from('behavior_score_log').insert({
        user_id,
        action: 'first_no_show_warning',
        points_delta:  0,
        running_total: profile.behavior_score ?? 1000,
        context,
      });

      return new Response(
        JSON.stringify({ protected: true, warning: 'first_no_show_warning', score_unchanged: true }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Late cancellation: first offence → warning only
    if (action === 'late_cancellation' && !profile.first_late_cancel_warning_given) {
      await supabase
        .from('profiles')
        .update({ first_late_cancel_warning_given: true })
        .eq('id', user_id);

      await supabase.from('behavior_score_log').insert({
        user_id,
        action: 'first_late_cancel_warning',
        points_delta:  0,
        running_total: profile.behavior_score ?? 1000,
        context,
      });

      return new Response(
        JSON.stringify({ protected: true, warning: 'first_late_cancel_warning', score_unchanged: true }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  // ── Apply deduction ───────────────────────────────────────────────────────
  const currentScore = profile.behavior_score ?? 1000;
  const newScore     = Math.max(0, currentScore + delta); // floor at 0
  const { tier, isRestricted } = trustTierFromScore(newScore);

  const isPermanentBan = action === 'predatory_behavior';

  // ── Diamond threshold: reset if score drops below 1200 ───────────────────
  if (newScore < 1200 && currentScore >= 1200) {
    await supabase
      .from('achievement_progress')
      .update({ diamond_threshold_reached: null, updated_at: new Date().toISOString() })
      .eq('user_id', user_id);
  }

  // ── Persist updates in parallel ───────────────────────────────────────────
  await Promise.all([
    supabase
      .from('profiles')
      .update({
        behavior_score:       newScore,
        trust_tier:           tier,
        is_restricted:        isRestricted,
        ...(isPermanentBan ? { is_permanently_banned: true } : {}),
      })
      .eq('id', user_id),

    supabase.from('behavior_score_log').insert({
      user_id,
      action,
      points_delta:  delta,
      running_total: newScore,
      context,
    }),
  ]);

  return new Response(
    JSON.stringify({
      previous_score:    currentScore,
      new_score:         newScore,
      delta,
      tier,
      permanently_banned: isPermanentBan,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
