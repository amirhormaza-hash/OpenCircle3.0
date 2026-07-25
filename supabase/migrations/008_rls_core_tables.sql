-- ============================================================
-- RLS for core tables (profiles, event, event_attendees,
-- event_images, event_chats, chat_messages).
--
-- These tables were created outside the repo migrations, so this
-- migration only hardens them. Policies mirror what the app does:
--   * feed is visible to every signed-in user
--   * you create/update/delete only your own rows
--   * event chat is visible only to that event's attendees
--
-- NOTE: if any of these tables already has RLS with differently
-- named policies, review for overlap before applying. Verify with
-- Supabase advisors after running.
-- ============================================================

ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE event           ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_images    ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_chats     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages   ENABLE ROW LEVEL SECURITY;

-- ── profiles ──
DROP POLICY IF EXISTS "authenticated can read profiles" ON profiles;
CREATE POLICY "authenticated can read profiles"
  ON profiles FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "users insert own profile" ON profiles;
CREATE POLICY "users insert own profile"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "users update own profile" ON profiles;
CREATE POLICY "users update own profile"
  ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ── event ──
DROP POLICY IF EXISTS "authenticated can read events" ON event;
CREATE POLICY "authenticated can read events"
  ON event FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "owners insert own events" ON event;
CREATE POLICY "owners insert own events"
  ON event FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "owners update own events" ON event;
CREATE POLICY "owners update own events"
  ON event FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "owners delete own events" ON event;
CREATE POLICY "owners delete own events"
  ON event FOR DELETE TO authenticated
  USING (profile_id = auth.uid());

-- ── event_attendees ──
-- Read is open to signed-in users: the feed shows attendee counts
-- for every event before joining.
DROP POLICY IF EXISTS "authenticated can read attendees" ON event_attendees;
CREATE POLICY "authenticated can read attendees"
  ON event_attendees FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "users join as themselves" ON event_attendees;
CREATE POLICY "users join as themselves"
  ON event_attendees FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Leave your own attendance, or clean up attendees of an event you
-- own (used by create-event rollback and event deletion).
DROP POLICY IF EXISTS "users leave own attendance or own event" ON event_attendees;
CREATE POLICY "users leave own attendance or own event"
  ON event_attendees FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM event e
      WHERE e.id = event_attendees.event_id AND e.profile_id = auth.uid()
    )
  );

-- ── event_images: managed only by the event owner ──
DROP POLICY IF EXISTS "authenticated can read event images" ON event_images;
CREATE POLICY "authenticated can read event images"
  ON event_images FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "owners insert images for own events" ON event_images;
CREATE POLICY "owners insert images for own events"
  ON event_images FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event e
      WHERE e.id = event_images.event_id AND e.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "owners delete images of own events" ON event_images;
CREATE POLICY "owners delete images of own events"
  ON event_images FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event e
      WHERE e.id = event_images.event_id AND e.profile_id = auth.uid()
    )
  );

-- ── event_chats: attendees only ──
DROP POLICY IF EXISTS "attendees read event chats" ON event_chats;
CREATE POLICY "attendees read event chats"
  ON event_chats FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_attendees ea
      WHERE ea.event_id = event_chats.event_id AND ea.user_id = auth.uid()
    )
  );

-- The app creates the chat row on demand when an attendee first opens it.
DROP POLICY IF EXISTS "attendees create event chat" ON event_chats;
CREATE POLICY "attendees create event chat"
  ON event_chats FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_attendees ea
      WHERE ea.event_id = event_chats.event_id AND ea.user_id = auth.uid()
    )
  );

-- ── chat_messages: attendees of the chat's event only ──
DROP POLICY IF EXISTS "attendees read chat messages" ON chat_messages;
CREATE POLICY "attendees read chat messages"
  ON chat_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_chats ec
      JOIN event_attendees ea ON ea.event_id = ec.event_id
      WHERE ec.id = chat_messages.chat_id AND ea.user_id = auth.uid()
    )
  );

-- Sending closes when the event's 24h window ends — chats live and die
-- with the event (src/lib/eventLifecycle.ts).
DROP POLICY IF EXISTS "attendees send messages as themselves" ON chat_messages;
CREATE POLICY "attendees send messages as themselves"
  ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM event_chats ec
      JOIN event_attendees ea ON ea.event_id = ec.event_id
      JOIN event e ON e.id = ec.event_id
      WHERE ec.id = chat_messages.chat_id
        AND ea.user_id = auth.uid()
        AND now() < e.date_time::timestamptz + INTERVAL '24 hours'
    )
  );
