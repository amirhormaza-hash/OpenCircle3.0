import { supabase } from './supabase/client';
import { calculateUserRating } from './ratingSystem';
import type { StarCounts } from './ratingSystem';

// ── Existing helpers (unchanged) ─────────────────────────────────────────────

export async function fetchProfile(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return data;
}

export async function fetchEventStats(userId: string): Promise<{ attended: number; hosted: number }> {
  const [{ count: attended }, { count: hosted }] = await Promise.all([
    supabase.from('event_attendees').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('event').select('*', { count: 'exact', head: true }).eq('profile_id', userId),
  ]);
  return { attended: attended ?? 0, hosted: hosted ?? 0 };
}

export async function fetchReputationTags(userId: string): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('user_ratings')
    .select('tags')
    .eq('rated_id', userId);
  const counts: Record<string, number> = {};
  data?.forEach(row =>
    (row.tags as string[]).forEach(tag => {
      counts[tag] = (counts[tag] || 0) + 1;
    })
  );
  return counts;
}

export async function fetchVoucheCount(userId: string): Promise<number> {
  const tags = await fetchReputationTags(userId);
  return Object.values(tags).reduce((a, b) => a + b, 0);
}

export async function fetchBadges(userId: string) {
  const { data } = await supabase
    .from('user_badges')
    .select('*')
    .eq('user_id', userId);
  return data ?? [];
}

export async function fetchStreak(userId: string) {
  const { data } = await supabase
    .from('user_streaks')
    .select('*')
    .eq('user_id', userId)
    .single();
  return data;
}

export async function fetchEventHistory(userId: string) {
  const { data: attendeeRows } = await supabase
    .from('event_attendees')
    .select('event_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);

  const attendedIds = (attendeeRows ?? []).map(r => r.event_id).filter(Boolean);

  const [{ data: attendedEvents }, { data: hostedEvents }] = await Promise.all([
    attendedIds.length > 0
      ? supabase
          .from('event')
          .select('id, name, date_time, address, category, profile_id')
          .in('id', attendedIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    supabase
      .from('event')
      .select('id, name, date_time, address, category, profile_id')
      .eq('profile_id', userId)
      .order('date_time', { ascending: false })
      .limit(10),
  ]);

  const map = new Map<string, Record<string, unknown>>();
  (attendedEvents ?? []).forEach((e: Record<string, unknown>) => {
    map.set(e.id as string, { ...e, isHosted: e.profile_id === userId });
  });
  (hostedEvents ?? []).forEach((e: Record<string, unknown>) => {
    map.set(e.id as string, { ...e, isHosted: true });
  });

  return [...map.values()].sort(
    (a, b) => new Date(b.date_time as string).getTime() - new Date(a.date_time as string).getTime()
  );
}

export async function fetchSkillLevels(userId: string): Promise<Record<string, string>> {
  const { data: attendeeRows } = await supabase
    .from('event_attendees')
    .select('event_id')
    .eq('user_id', userId);

  const eventIds = (attendeeRows ?? []).map(r => r.event_id).filter(Boolean);
  if (eventIds.length === 0) return {};

  const { data: events } = await supabase
    .from('event')
    .select('category, level')
    .in('id', eventIds);

  const levelOrder = ['For All', 'Newbie', 'Beginner', 'Intermediate', 'Advanced', 'Expert'];
  const skills: Record<string, string> = {};

  (events ?? []).forEach(({ category, level }: { category?: string; level?: string }) => {
    if (!category || !level) return;
    if (!skills[category] || levelOrder.indexOf(level) > levelOrder.indexOf(skills[category])) {
      skills[category] = level;
    }
  });

  return skills;
}

// ── New: Event Rating helpers ─────────────────────────────────────────────────

/**
 * Fetch the raw star counts for an event from verified attendees.
 * Returns { starCounts, totalAttendees, reviewerCount }.
 */
export async function fetchEventRatingData(eventId: string): Promise<{
  starCounts:     StarCounts;
  totalAttendees: number;
  reviewerCount:  number;
}> {
  const [{ count: totalAttendees }, { data: ratings }] = await Promise.all([
    supabase
      .from('event_attendees')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId),
    supabase
      .from('event_ratings')
      .select('stars')
      .eq('event_id', eventId),
  ]);

  const starCounts: StarCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  (ratings ?? []).forEach(({ stars }: { stars: number }) => {
    if (stars >= 1 && stars <= 5) starCounts[stars as keyof StarCounts]++;
  });

  return {
    starCounts,
    totalAttendees: totalAttendees ?? 0,
    reviewerCount:  ratings?.length ?? 0,
  };
}

/**
 * Submit a star rating for an event.  Only callable during the 48-hour
 * review window after the event ends.  Enforced server-side by RLS policy.
 */
export async function submitEventRating(
  eventId: string,
  raterId: string,
  stars:   1 | 2 | 3 | 4 | 5,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('event_ratings')
    .insert({ event_id: eventId, rater_id: raterId, stars });
  return { error: error?.message ?? null };
}

// ── New: User Reputation helpers ─────────────────────────────────────────────

/**
 * Fetch all star ratings received by a user, ordered oldest → newest.
 * Feeds directly into calculateUserRating().
 */
export async function fetchUserRatingsReceived(userId: string): Promise<number[]> {
  const { data } = await supabase
    .from('user_ratings')
    .select('score, created_at')
    .eq('rated_id', userId)
    .not('score', 'is', null)
    .order('created_at', { ascending: true });

  return (data ?? []).map((r: { score: number }) => Number(r.score));
}

/**
 * Calculate and return a user's current reputation score.
 * Returns a numeric score or "New" when fewer than 3 ratings exist.
 */
export async function fetchUserReputationScore(userId: string): Promise<number | 'New'> {
  const ratings = await fetchUserRatingsReceived(userId);
  return calculateUserRating(ratings);
}

// ── New: Behavior Score helpers ───────────────────────────────────────────────

export interface BehaviorProfile {
  behavior_score:                  number;
  trust_tier:                      string;
  is_restricted:                   boolean;
  is_permanently_banned:           boolean;
  new_user_protection_active:      boolean;
  new_user_protection_expiry:      string | null;
  first_no_show_warning_given:     boolean;
  first_late_cancel_warning_given: boolean;
}

export async function fetchBehaviorProfile(userId: string): Promise<BehaviorProfile | null> {
  const { data } = await supabase
    .from('profiles')
    .select(
      'behavior_score, trust_tier, is_restricted, is_permanently_banned, ' +
      'new_user_protection_active, new_user_protection_expiry, ' +
      'first_no_show_warning_given, first_late_cancel_warning_given',
    )
    .eq('id', userId)
    .single();
  return (data as BehaviorProfile | null) ?? null;
}

/**
 * Fetch the full score transaction history for a user, newest first.
 */
export async function fetchScoreHistory(
  userId: string,
  limit = 50,
): Promise<Array<{ action: string; points_delta: number; running_total: number; context: Record<string, unknown>; created_at: string }>> {
  const { data } = await supabase
    .from('behavior_score_log')
    .select('action, points_delta, running_total, context, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as Array<{ action: string; points_delta: number; running_total: number; context: Record<string, unknown>; created_at: string }>;
}

// ── New: Add / Deduct points (client wrappers for Edge Functions) ─────────────

import { supabase as supabaseClient } from './supabase/client';

async function callScoreFunction(
  fnName:  'add-points' | 'deduct-points',
  userId:  string,
  action:  string,
  context: Record<string, unknown> = {},
): Promise<{ data: unknown; error: string | null }> {
  const { data, error } = await supabaseClient.functions.invoke(fnName, {
    body: { user_id: userId, action, context },
  });
  return { data, error: error?.message ?? null };
}

export const addPoints   = (userId: string, action: string, context?: Record<string, unknown>) =>
  callScoreFunction('add-points',    userId, action, context);

export const deductPoints = (userId: string, action: string, context?: Record<string, unknown>) =>
  callScoreFunction('deduct-points', userId, action, context);

export const checkAchievements = (userId: string) =>
  supabaseClient.functions.invoke('quick-service', { body: { user_id: userId } });

// ── User-to-User Rating ───────────────────────────────────────────────────────

/**
 * Finds the most recent event both users attended where the rater hasn't
 * already submitted a rating for the rated user.  Returns null if none exists.
 */
export async function fetchRateableEvent(
  myId: string,
  theirId: string,
): Promise<{ id: string; name: string } | null> {
  const [{ data: mine }, { data: theirs }] = await Promise.all([
    supabase.from('event_attendees').select('event_id').eq('user_id', myId),
    supabase.from('event_attendees').select('event_id').eq('user_id', theirId),
  ]);

  const theirSet = new Set((theirs ?? []).map((r: { event_id: string }) => r.event_id));
  const sharedIds = (mine ?? [])
    .map((r: { event_id: string }) => r.event_id)
    .filter((id: string) => theirSet.has(id));

  if (sharedIds.length === 0) return null;

  const { data: existing } = await supabase
    .from('user_ratings')
    .select('event_id')
    .eq('rater_id', myId)
    .eq('rated_id', theirId)
    .in('event_id', sharedIds);

  const ratedIds = new Set((existing ?? []).map((r: { event_id: string }) => r.event_id));
  const unratedIds = sharedIds.filter((id: string) => !ratedIds.has(id));
  if (unratedIds.length === 0) return null;

  const { data: events } = await supabase
    .from('event')
    .select('id, name')
    .in('id', unratedIds)
    .order('date_time', { ascending: false })
    .limit(1);

  return (events?.[0] as { id: string; name: string }) ?? null;
}

/**
 * Insert a user-to-user rating row and award behavior score points to both
 * the rater (leave_review) and the rated user (receive_4star / receive_5star).
 */
export async function submitUserRating(
  raterId: string,
  ratedId: string,
  eventId: string,
  score:   1 | 2 | 3 | 4 | 5,
  tags:    string[],
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('user_ratings')
    .insert({ rater_id: raterId, rated_id: ratedId, event_id: eventId, score, tags });

  if (error) return { error: error.message };

  await addPoints(raterId, 'leave_review', { rated_user_id: ratedId, event_id: eventId });

  if (score === 5) {
    await addPoints(ratedId, 'receive_5star', { rater_id: raterId, event_id: eventId });
  } else if (score === 4) {
    await addPoints(ratedId, 'receive_4star', { rater_id: raterId, event_id: eventId });
  }

  await Promise.all([checkAchievements(raterId), checkAchievements(ratedId)]);

  return { error: null };
}
