// Triggered after every event_attendees insert.
// Evaluates all badge unlock conditions for the user and upserts newly earned badges.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req: Request) => {
  const { user_id } = await req.json() as { user_id: string };

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── Fetch stats in parallel ─────────────────────────────────────────────
  const [
    { count: attended },
    { count: hosted },
    { data: categoryRows },
    { data: earlyRows },
    { data: streakRow },
  ] = await Promise.all([
    supabase.from('event_attendees').select('*', { count: 'exact', head: true }).eq('user_id', user_id),
    supabase.from('event').select('*', { count: 'exact', head: true }).eq('profile_id', user_id),
    supabase.from('event_attendees').select('event:event_id(category, level)').eq('user_id', user_id),
    supabase.from('event_attendees').select('created_at, event:event_id(created_at)').eq('user_id', user_id),
    supabase.from('user_streaks').select('current_streak').eq('user_id', user_id).single(),
  ]);

  // ── Derive category stats ────────────────────────────────────────────────
  const categories = new Set<string>();
  const catCounts: Record<string, number> = {};

  (categoryRows ?? []).forEach((row: unknown) => {
    const cat = (row as { event?: { category?: string } }).event?.category;
    if (!cat) return;
    categories.add(cat);
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });

  const maxCatCount = Math.max(0, ...Object.values(catCounts));

  // ── Determine early-bird eligibility ─────────────────────────────────────
  const isEarlyBird = (earlyRows ?? []).some((row: unknown) => {
    const r = row as { created_at?: string; event?: { created_at?: string } };
    if (!r.created_at || !r.event?.created_at) return false;
    return new Date(r.created_at).getTime() - new Date(r.event.created_at).getTime() <= 3_600_000;
  });

  const currentStreak = (streakRow as { current_streak?: number } | null)?.current_streak ?? 0;

  // ── Evaluate badge conditions ────────────────────────────────────────────
  const toAward: string[] = [];
  if ((attended ?? 0) >= 1)   toAward.push('first_timer');
  if (currentStreak >= 4)     toAward.push('on_fire');
  if ((hosted ?? 0) >= 3)     toAward.push('host');
  if (categories.size >= 10)  toAward.push('social_butterfly');
  if (maxCatCount >= 5)       toAward.push('specialist');
  if (isEarlyBird)            toAward.push('early_bird');
  if ((attended ?? 0) >= 50)  toAward.push('diamond');
  if (categories.size >= 5)   toAward.push('explorer');

  // ── Upsert earned badges (ignoreDuplicates keeps seen=true if already earned) ──
  if (toAward.length > 0) {
    await supabase.from('user_badges').upsert(
      toAward.map(badge_key => ({ user_id, badge_key, seen: false })),
      { onConflict: 'user_id,badge_key', ignoreDuplicates: true },
    );
  }

  return new Response(JSON.stringify({ awarded: toAward }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
