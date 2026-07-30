import { supabase } from './supabase/client';

// Relationship between the current user and another user, from the
// current user's point of view.
export type FriendState =
  | 'none'             // no row exists
  | 'requested_by_me'  // I sent a pending request
  | 'requested_by_them'// they sent me a pending request
  | 'friends';         // accepted

/**
 * Resolve the friendship state between me and another user, in either
 * direction (one row can have me as requester or addressee).
 */
export async function getFriendState(myId: string, otherId: string): Promise<FriendState> {
  const { data } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id, status')
    .or(
      `and(requester_id.eq.${myId},addressee_id.eq.${otherId}),` +
      `and(requester_id.eq.${otherId},addressee_id.eq.${myId})`,
    )
    .maybeSingle();

  if (!data) return 'none';
  if (data.status === 'accepted') return 'friends';
  return data.requester_id === myId ? 'requested_by_me' : 'requested_by_them';
}

/** Send a friend request to another user. */
export async function sendFriendRequest(myId: string, otherId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: myId, addressee_id: otherId, status: 'pending' });
  return { error: error?.message ?? null };
}

/** Accept a pending request that the other user sent me. */
export async function acceptFriendRequest(myId: string, otherId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('requester_id', otherId)
    .eq('addressee_id', myId);
  return { error: error?.message ?? null };
}

/** Remove any relationship (cancel my request, decline theirs, or unfriend). */
export async function removeFriend(myId: string, otherId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(
      `and(requester_id.eq.${myId},addressee_id.eq.${otherId}),` +
      `and(requester_id.eq.${otherId},addressee_id.eq.${myId})`,
    );
  return { error: error?.message ?? null };
}

/** Count a user's accepted friendships (either direction). */
export async function getFriendCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('friendships')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  return count ?? 0;
}

export type FriendProfile = {
  id: string;
  name: string;
  username: string;
  profile_image_url: string | null;
};

async function profilesByIds(ids: string[]): Promise<FriendProfile[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from('profiles')
    .select('id, name, username, profile_image_url')
    .in('id', ids);
  return (data ?? []) as FriendProfile[];
}

/** Incoming pending requests (people who added me and are waiting). */
export async function getPendingRequests(myId: string): Promise<FriendProfile[]> {
  const { data } = await supabase
    .from('friendships')
    .select('requester_id')
    .eq('addressee_id', myId)
    .eq('status', 'pending');
  return profilesByIds((data ?? []).map((r: { requester_id: string }) => r.requester_id));
}

/** Accepted friends (either direction). */
export async function getFriends(myId: string): Promise<FriendProfile[]> {
  const { data } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`);
  const otherIds = (data ?? []).map((r: { requester_id: string; addressee_id: string }) =>
    r.requester_id === myId ? r.addressee_id : r.requester_id,
  );
  return profilesByIds(otherIds);
}

/** Number of incoming pending requests — for the badge dot. */
export async function getPendingRequestCount(myId: string): Promise<number> {
  const { count } = await supabase
    .from('friendships')
    .select('*', { count: 'exact', head: true })
    .eq('addressee_id', myId)
    .eq('status', 'pending');
  return count ?? 0;
}
