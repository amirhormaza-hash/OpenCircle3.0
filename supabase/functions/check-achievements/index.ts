/**
 * check-achievements — Supabase Edge Function
 *
 * Evaluates every badge unlock condition for a user and upserts newly
 * earned badges.  Call this after:
 *   - A new event_attendees row is inserted
 *   - A behavior score transaction occurs (for Diamond)
 *   - A user sends a message (social_butterfly)
 *
 * Expected body: { user_id: string }
 *
 * Badge conditions (per spec):
 *   first_timer      — attended ≥ 1 event
 *   on_fire          — weekly attendance streak ≥ 3
 *   host             — hosted ≥ 1 event rated above 3.0⭐
 *   social_butterfly — sent messages in ≥ 10 distinct event group chats
 *   specialist       — attended ≥ 5 events in the same category
 *   early_bird       — joined ≥ 5 events ≥ 24 hrs before event start
 *   diamond          — behavior_score ≥ 1200 sustained for ≥ 30 days
 *   explorer         — attended events in ≥ 5 different categories
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BADGE_POINTS: Record<string, number> = {
  first_timer:      25,
  on_fire:          50,
  host:             50,
  social_butterfly: 40,
  specialist:       45,
  early_bird:       30,
  diamond:          100,
  explorer:         60,
};

function trustTierFromScore(score: number): { tier: string; isRestricted: boolean } {
  if (score >= 1200) return { tier: 'Trusted',    isRestricted: false };
  if (score >= 1000) return { tier: 'Reliable',   isRestricted: false };
  if (score >= 900)  return { tier: 'Casual',     isRestricted: false };
  if (score >= 800)  return { tier: 'Flagged',    isRestricted: false };
  return               { tier: 'Restricted', isRestricted: true  };
}

serve(async (req: Request) => {
  const { user_id } = await req.json() as { user_id: string };

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── Fetch all required stats in parallel ──────────────────────────────────
  const [
    { count: attendedCount },
    { data: categoryRows },
    { data: attendeeRows },
    { data: streakRow },
    { data: hostedRatings },
    { data: messagedEvents },
    { data: achievementRow },
    { data: profileRow },
    { data: existingBadges },
  ] = await Promise.all([
    // Total events attended
    supabase
      .from('event_attendees')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id),

    // Category + level for each attended event
    supabase
      .from('event_attendees')
      .select('event:event_id(category, date_time)')
      .eq('user_id', user_id),

    // Attendance join time vs. event start time (for early_bird)
    supabase
      .from('event_attendees')
      .select('created_at, event:event_id(date_time)')
      .eq('user_id', user_id),

    // Weekly attendance streak
    supabase
      .from('user_streaks')
      .select('current_streak')
      .eq('user_id', user_id)
      .single(),

    // Events hosted and their ratings (for host badge)
    supabase
      .from('event')
      .select('id')
      .eq('profile_id', user_id),

    // Distinct events where user posted a chat message (for social_butterfly)
    // We infer this from behavior_score_log entries with action='event_chat_message'
    supabase
      .from('behavior_score_log')
      .select('context')
      .eq('user_id', user_id)
      .eq('action', 'event_chat_message'),

    // Diamond threshold tracking
    supabase
      .from('achievement_progress')
      .select('diamond_threshold_reached')
      .eq('user_id', user_id)
      .single(),

    // Current behavior score
    supabase
      .from('profiles')
      .select('behavior_score')
      .eq('user_id', user_id)
      .single(),

    // Badges already earned (to avoid re-awarding)
    supabase
      .from('user_badges')
      .select('badge_key')
      .eq('user_id', user_id),
  ]);

  const alreadyEarned = new Set((existingBadges ?? []).map((b: { badge_key: string }) => b.badge_key));

  // ── Category analysis ─────────────────────────────────────────────────────
  const categories  = new Set<string>();
  const catCounts: Record<string, number> = {};

  (categoryRows ?? []).forEach((row: unknown) => {
    const cat = (row as { event?: { category?: string } }).event?.category;
    if (!cat) return;
    categories.add(cat);
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });

  const maxCatCount = Math.max(0, ...Object.values(catCounts));

  // ── Early Bird: joined ≥ 5 events at least 24 hrs before event start ──────
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const earlyJoinCount = (attendeeRows ?? []).filter((row: unknown) => {
    const r = row as { created_at?: string; event?: { date_time?: string } };
    if (!r.created_at || !r.event?.date_time) return false;
    return new Date(r.event.date_time).getTime() - new Date(r.created_at).getTime() >= TWENTY_FOUR_HOURS_MS;
  }).length;

  // ── Social Butterfly: messaged in ≥ 10 distinct event chats ──────────────
  const messagedEventIds = new Set<string>();
  (messagedEvents ?? []).forEach((row: unknown) => {
    const eventId = ((row as { context?: { event_id?: string } }).context)?.event_id;
    if (eventId) messagedEventIds.add(eventId);
  });

  // ── Host badge: hosted ≥ 1 event rated above 3.0⭐ ───────────────────────
  let hostBadgeEarned = false;
  if ((hostedRatings ?? []).length > 0) {
    const hostedEventIds = (hostedRatings as { id: string }[]).map(r => r.id);
    const { data: eventRatingRows } = await supabase
      .from('event_ratings')
      .select('event_id, stars')
      .in('event_id', hostedEventIds);

    // Compute average star rating per hosted event
    const eventStarMap: Record<string, number[]> = {};
    (eventRatingRows ?? []).forEach((r: { event_id: string; stars: number }) => {
      if (!eventStarMap[r.event_id]) eventStarMap[r.event_id] = [];
      eventStarMap[r.event_id].push(r.stars);
    });

    hostBadgeEarned = Object.values(eventStarMap).some(stars => {
      const avg = stars.reduce((a, b) => a + b, 0) / stars.length;
      return avg > 3.0;
    });
  }

  // ── Diamond: behavior_score ≥ 1200 sustained for 30 days ─────────────────
  const THIRTY_DAYS_MS  = 30 * 24 * 60 * 60 * 1000;
  const thresholdDate   = (achievementRow as { diamond_threshold_reached?: string } | null)?.diamond_threshold_reached;
  const currentScore    = (profileRow as { behavior_score?: number } | null)?.behavior_score ?? 0;

  const diamondEarned =
    currentScore >= 1200 &&
    !!thresholdDate &&
    Date.now() - new Date(thresholdDate).getTime() >= THIRTY_DAYS_MS;

  const currentStreak = (streakRow as { current_streak?: number } | null)?.current_streak ?? 0;

  // ── Evaluate conditions ───────────────────────────────────────────────────
  const toAward: string[] = [];

  if (!alreadyEarned.has('first_timer')      && (attendedCount ?? 0) >= 1) toAward.push('first_timer');
  if (!alreadyEarned.has('on_fire')          && currentStreak >= 3)        toAward.push('on_fire');
  if (!alreadyEarned.has('host')             && hostBadgeEarned)            toAward.push('host');
  if (!alreadyEarned.has('social_butterfly') && messagedEventIds.size >= 10) toAward.push('social_butterfly');
  if (!alreadyEarned.has('specialist')       && maxCatCount >= 5)           toAward.push('specialist');
  if (!alreadyEarned.has('early_bird')       && earlyJoinCount >= 5)        toAward.push('early_bird');
  if (!alreadyEarned.has('diamond')          && diamondEarned)              toAward.push('diamond');
  if (!alreadyEarned.has('explorer')         && categories.size >= 5)       toAward.push('explorer');

  if (toAward.length === 0) {
    return new Response(JSON.stringify({ awarded: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Upsert badges (ignoreDuplicates = true = once per user only) ──────────
  await supabase.from('user_badges').upsert(
    toAward.map(badge_key => ({ user_id, badge_key, seen: false })),
    { onConflict: 'user_id,badge_key', ignoreDuplicates: true },
  );

  // ── Award bonus points for each new badge ─────────────────────────────────
  // Process sequentially to keep running_total accurate
  let rollingScore = currentScore;
  for (const badge_key of toAward) {
    const pts = BADGE_POINTS[badge_key] ?? 0;
    if (pts === 0) continue;
    rollingScore = Math.max(0, rollingScore + pts);
    const { tier, isRestricted } = trustTierFromScore(rollingScore);

    await supabase
      .from('profiles')
      .update({ behavior_score: rollingScore, trust_tier: tier, is_restricted: isRestricted })
      .eq('id', user_id);

    await supabase.from('behavior_score_log').insert({
      user_id,
      action:        `badge_${badge_key}`,
      points_delta:  pts,
      running_total: rollingScore,
      context:       { badge_key },
    });
  }

  return new Response(JSON.stringify({ awarded: toAward, new_score: rollingScore }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
