/**
 * add-points — Supabase Edge Function
 *
 * Adds points to a user's behavior score for a given action.
 * Enforces anti-gaming caps, updates trust tier, logs every transaction,
 * and triggers Diamond-badge threshold tracking.
 *
 * Expected body: { user_id: string; action: string; context?: Record<string,unknown> }
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Point table (kept in sync with src/lib/behaviorScore.ts) ─────────────────
const POINT_VALUES: Record<string, number> = {
  daily_login:              2,
  complete_profile:         10,
  add_profile_photo:        5,
  write_bio:                5,
  first_event_joined:       20,
  join_event:               5,
  join_event_early:         3,
  event_chat_message:       2,
  geofence_confirmed:       10,
  leave_review:             5,
  receive_5star:            10,
  receive_4star:            5,
  post_photo_live:          8,
  post_video_live:          10,
  post_shared_externally:   15,
  share_event:              10,
  join_via_shared_link:     20,
  vouch_user:               5,
  get_vouched:              15,
  refer_friend:             30,
  first_event_hosted:       25,
  host_event_above_4star:   20,
  host_event_above_4_5star: 35,
  event_full_attendance:    25,
  respond_within_1hr:       5,
};

// ── Trust-tier derivation ─────────────────────────────────────────────────────
function trustTierFromScore(score: number): { tier: string; isRestricted: boolean } {
  if (score >= 1200) return { tier: 'Trusted',    isRestricted: false };
  if (score >= 1000) return { tier: 'Reliable',   isRestricted: false };
  if (score >= 900)  return { tier: 'Casual',     isRestricted: false };
  if (score >= 800)  return { tier: 'Flagged',    isRestricted: false };
  return               { tier: 'Restricted', isRestricted: true  };
}

// ─────────────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const { user_id, action, context = {} } =
    await req.json() as { user_id: string; action: string; context?: Record<string, unknown> };

  const delta = POINT_VALUES[action];
  if (delta === undefined) {
    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── Fetch current profile ────────────────────────────────────────────────
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('behavior_score, is_permanently_banned')
    .eq('id', user_id)
    .single();

  if (profileErr || !profile) {
    return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 404 });
  }

  if (profile.is_permanently_banned) {
    return new Response(JSON.stringify({ error: 'User is permanently banned' }), { status: 403 });
  }

  // ── Anti-gaming caps ──────────────────────────────────────────────────────

  // 1. Daily login: once per 24 hours
  if (action === 'daily_login') {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('behavior_score_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .eq('action', 'daily_login')
      .gte('created_at', cutoff);

    if ((count ?? 0) > 0) {
      return new Response(JSON.stringify({ skipped: 'daily_login already awarded today' }), { status: 200 });
    }
  }

  // 2. Event chat message: capped at 5 rewarded messages per event (+10 pts max)
  if (action === 'event_chat_message') {
    const eventId = (context as { event_id?: string }).event_id;
    if (!eventId) {
      return new Response(JSON.stringify({ error: 'event_id required for event_chat_message' }), { status: 400 });
    }

    const { data: capRow } = await supabase
      .from('event_message_rewards')
      .select('messages_rewarded')
      .eq('user_id', user_id)
      .eq('event_id', eventId)
      .single();

    const rewarded = capRow?.messages_rewarded ?? 0;
    if (rewarded >= 5) {
      return new Response(JSON.stringify({ skipped: 'message reward cap reached for this event' }), { status: 200 });
    }

    // Upsert the cap counter
    await supabase.from('event_message_rewards').upsert(
      { user_id, event_id: eventId, messages_rewarded: rewarded + 1 },
      { onConflict: 'user_id,event_id' },
    );
  }

  // 3. One-time actions: only award once per user lifetime
  const ONE_TIME_ACTIONS = new Set([
    'complete_profile', 'add_profile_photo', 'write_bio',
    'first_event_joined', 'first_event_hosted',
  ]);
  if (ONE_TIME_ACTIONS.has(action)) {
    const { count } = await supabase
      .from('behavior_score_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .eq('action', action);

    if ((count ?? 0) > 0) {
      return new Response(JSON.stringify({ skipped: `${action} already awarded` }), { status: 200 });
    }
  }

  // ── Apply delta ───────────────────────────────────────────────────────────
  const newScore = Math.max(0, (profile.behavior_score ?? 1000) + delta);
  const { tier, isRestricted } = trustTierFromScore(newScore);

  // ── Diamond threshold tracking ────────────────────────────────────────────
  // Record the moment the score first crosses 1200 so check-achievements
  // can verify it has been sustained for 30 days.
  const crossedThreshold = newScore >= 1200 && (profile.behavior_score ?? 1000) < 1200;
  const droppedThreshold  = newScore < 1200  && (profile.behavior_score ?? 1000) >= 1200;

  if (crossedThreshold) {
    await supabase.from('achievement_progress').upsert(
      { user_id, diamond_threshold_reached: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  } else if (droppedThreshold) {
    // Reset: score fell below 1200, restart the 30-day clock
    await supabase.from('achievement_progress')
      .update({ diamond_threshold_reached: null, updated_at: new Date().toISOString() })
      .eq('user_id', user_id);
  }

  // ── Persist score update + log in parallel ────────────────────────────────
  await Promise.all([
    supabase
      .from('profiles')
      .update({ behavior_score: newScore, trust_tier: tier, is_restricted: isRestricted })
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
    JSON.stringify({ previous_score: profile.behavior_score, new_score: newScore, delta, tier }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
