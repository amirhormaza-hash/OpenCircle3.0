import { supabase } from './supabase/client';

export type InviteStatus = 'pending' | 'accepted' | 'rejected';

export type Invitee = {
  id: string;
  name: string;
  username: string;
  profile_image_url: string | null;
  status: InviteStatus;
};

/** Create pending invitations for a friends-only event. */
export async function createInvitations(
  eventId: string,
  inviterId: string,
  inviteeIds: string[],
): Promise<{ error: string | null }> {
  if (inviteeIds.length === 0) return { error: null };
  const rows = inviteeIds.map((invitee_id) => ({
    event_id: eventId, inviter_id: inviterId, invitee_id, status: 'pending' as const,
  }));
  const { error } = await supabase.from('event_invitations').insert(rows);
  return { error: error?.message ?? null };
}

/** Respond to an invitation. Accepting also joins the event as an attendee. */
export async function respondToInvite(
  eventId: string,
  myId: string,
  status: 'accepted' | 'rejected',
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('event_invitations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('event_id', eventId)
    .eq('invitee_id', myId);
  if (error) return { error: error.message };

  if (status === 'accepted') {
    // Idempotent join — ignore duplicate if they somehow already attend.
    const { error: joinError } = await supabase
      .from('event_attendees')
      .insert({ event_id: eventId, user_id: myId });
    if (joinError && joinError.code !== '23505') return { error: joinError.message };
  } else {
    // Rejecting: make sure they are not an attendee (defensive — loses chat access).
    await supabase.from('event_attendees').delete().eq('event_id', eventId).eq('user_id', myId);
  }
  return { error: null };
}

/**
 * Called when a user leaves an event: if they had an invitation, mark it
 * 'rejected' so the host's invitee list stays accurate and they fully lose
 * their place. No-op when there is no invitation. Chat access is separately
 * revoked because leaving removes them from event_attendees (RLS).
 */
export async function markInviteLeft(eventId: string, myId: string): Promise<void> {
  await supabase
    .from('event_invitations')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('event_id', eventId)
    .eq('invitee_id', myId);
}

/** All invitees for an event, with their profile and current status (host view). */
export async function getEventInvitees(eventId: string): Promise<Invitee[]> {
  const { data } = await supabase
    .from('event_invitations')
    .select('invitee_id, status')
    .eq('event_id', eventId);

  const rows = (data ?? []) as { invitee_id: string; status: InviteStatus }[];
  if (rows.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, username, profile_image_url')
    .in('id', rows.map((r) => r.invitee_id));

  const byId: Record<string, { name: string; username: string; profile_image_url: string | null }> = {};
  (profiles ?? []).forEach((p: any) => { byId[p.id] = p; });

  return rows.map((r) => ({
    id: r.invitee_id,
    name: byId[r.invitee_id]?.name ?? 'User',
    username: byId[r.invitee_id]?.username ?? '',
    profile_image_url: byId[r.invitee_id]?.profile_image_url ?? null,
    status: r.status,
  }));
}

/** Event IDs the current user has a pending invitation to. */
export async function getPendingInviteEventIds(myId: string): Promise<string[]> {
  const { data } = await supabase
    .from('event_invitations')
    .select('event_id')
    .eq('invitee_id', myId)
    .eq('status', 'pending');
  return (data ?? []).map((r: { event_id: string }) => r.event_id);
}
