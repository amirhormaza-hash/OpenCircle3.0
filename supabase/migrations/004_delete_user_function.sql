-- Allows a user to delete their own account from the client.
-- Deletes all user data then removes the auth user via the admin API.
-- Called via supabase.rpc('delete_user') from the app.

create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Remove all user-generated data in dependency order
  delete from public.chat_messages   where user_id    = _uid;
  delete from public.event_attendees where user_id    = _uid;
  delete from public.event_ratings   where rater_id   = _uid;
  delete from public.user_ratings    where rater_id   = _uid or rated_id = _uid;
  delete from public.user_badges     where user_id    = _uid;
  delete from public.user_streaks    where user_id    = _uid;
  delete from public.behavior_score_log where user_id = _uid;

  -- Delete events the user created (cascades to event_images, event_chats, etc.)
  delete from public.event           where profile_id = _uid;

  -- Delete the profile row
  delete from public.profiles        where id         = _uid;

  -- Delete the auth user (requires the function to run as service role via security definer)
  delete from auth.users             where id         = _uid;
end;
$$;

-- Only the authenticated user can call this on themselves
revoke all on function public.delete_user() from public;
grant execute on function public.delete_user() to authenticated;
