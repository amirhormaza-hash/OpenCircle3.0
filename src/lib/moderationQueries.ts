import { supabase } from './supabase/client';

// Blocking and reporting, the two user-facing halves of App Store
// Guideline 1.2. The server side lives in migration 015: blocking is applied
// through the block_user RPC so a block, the report it files, and the
// friendship teardown all happen in one transaction.

/** Shared across every report sheet in the app so the reasons stay consistent. */
export const REPORT_REASONS = [
  'Spam',
  'Harassment or bullying',
  'Hate speech',
  'Sexual or explicit content',
  'Violence or threats',
  'Inappropriate content',
  'Other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number] | string;

export type BlockedUser = {
  id: string;
  blockedId: string;
  name: string;
  username: string;
  profileImage: string | null;
  createdAt: string;
};

type Result = { error: string | null };

/**
 * Block a user. Passing a reason also files a report, which is what puts the
 * offending content in front of the developer — Guideline 1.2 asks for
 * blocking to notify us, not just to hide the user.
 *
 * Their content disappears from the blocker's feed immediately: the RESTRICTIVE
 * RLS policies in migration 015 stop it being returned at all.
 */
export async function blockUser(userId: string, reason?: string): Promise<Result> {
  const { error } = await supabase.rpc('block_user', {
    p_blocked_id: userId,
    p_reason: reason?.trim() || null,
  });
  return { error: error?.message ?? null };
}

/** Lift a block. The other user's content becomes visible again. */
export async function unblockUser(userId: string): Promise<Result> {
  const { error } = await supabase.rpc('unblock_user', { p_blocked_id: userId });
  return { error: error?.message ?? null };
}

/** Every user I have blocked, for the management screen in Settings. */
export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('id, blocked_id, created_at, profile:profiles!blocked_id(name, username, profile_image_url)')
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row: any) => {
    // Supabase types a to-one join as an array; the FK guarantees one row.
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    return {
      id: row.id,
      blockedId: row.blocked_id,
      name: profile?.name ?? 'Unknown user',
      username: profile?.username ?? '',
      profileImage: profile?.profile_image_url ?? null,
      createdAt: row.created_at,
    };
  });
}

/**
 * IDs of everyone I have blocked. Screens that render lists the database
 * cannot filter for us (search results, attendee lists) use this to drop
 * blocked users client-side.
 */
export async function fetchBlockedIds(): Promise<Set<string>> {
  const { data } = await supabase.from('blocked_users').select('blocked_id');
  return new Set((data ?? []).map((row: { blocked_id: string }) => row.blocked_id));
}

/** True when I have blocked this user. */
export async function isUserBlocked(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('blocked_users')
    .select('id')
    .eq('blocked_id', userId)
    .maybeSingle();
  return !!data;
}

/** Report a user. `source` records which screen the report came from. */
export async function reportUser(
  reportedId: string,
  reason: ReportReason,
  opts: { eventId?: string; source?: string } = {},
): Promise<Result> {
  const me = (await supabase.auth.getUser()).data.user;
  if (!me) return { error: 'Not signed in' };

  const { error } = await supabase.from('user_reports').insert({
    reporter_id: me.id,
    reported_id: reportedId,
    reason,
    event_id: opts.eventId ?? null,
    source: opts.source ?? null,
  });
  return { error: error?.message ?? null };
}

/**
 * Report a chat message. The message text is copied onto the report so it
 * survives the sender deleting it, and so triage does not need to join back
 * to two different message tables.
 */
export async function reportMessage(
  messageId: string,
  context: 'event_chat' | 'dm',
  reason: ReportReason,
  contentText?: string,
): Promise<Result> {
  const me = (await supabase.auth.getUser()).data.user;
  if (!me) return { error: 'Not signed in' };

  const { error } = await supabase.from('message_reports').insert({
    reporter_id: me.id,
    message_id: messageId,
    context,
    reason,
    content_text: contentText ?? null,
  });
  return { error: error?.message ?? null };
}

/**
 * Report an event. Names and descriptions are user-generated, so they need a
 * report path of their own. Three distinct reports auto-hide the event
 * pending review (trigger in migration 015).
 */
export async function reportEvent(eventId: string, reason: ReportReason): Promise<Result> {
  const me = (await supabase.auth.getUser()).data.user;
  if (!me) return { error: 'Not signed in' };

  const { error } = await supabase
    .from('event_reports')
    .insert({ reporter_id: me.id, event_id: eventId, reason });

  // The (reporter, event) unique constraint means a second report is a no-op,
  // not a failure worth surfacing.
  if (error?.code === '23505') return { error: null };
  return { error: error?.message ?? null };
}
