-- One-shot database setup: creates any missing tables (001 + 002),
-- then applies RLS hardening (007 + 008). Idempotent — safe to re-run.

-- ══ Base tables (from add_profile_tables.sql) ══
-- Reputation tags given by other users after shared events
CREATE TABLE IF NOT EXISTS user_ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rater_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  rated_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID REFERENCES event(id) ON DELETE CASCADE,
  tags TEXT[] NOT NULL,
  score NUMERIC(2,1) CHECK (score >= 1 AND score <= 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(rater_id, rated_id, event_id)
);

-- Badges earned by each user
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT now(),
  seen BOOLEAN DEFAULT false,
  UNIQUE(user_id, badge_key)
);

-- Weekly attendance streaks
CREATE TABLE IF NOT EXISTS user_streaks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_attended_week DATE,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Extended profile columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trust_score NUMERIC(2,1) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location TEXT;

-- ══ Rating/behavior tables (from 002) ══
-- ============================================================
-- Event Ratings: per-event star reviews from verified attendees
-- ============================================================
CREATE TABLE IF NOT EXISTS event_ratings (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id   UUID REFERENCES event(id) ON DELETE CASCADE,
  rater_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  stars      SMALLINT NOT NULL CHECK (stars >= 1 AND stars <= 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, rater_id)
);

-- ============================================================
-- Behavior Score Log: immutable audit trail for every point
-- transaction (adds and deductions)
-- ============================================================
CREATE TABLE IF NOT EXISTS behavior_score_log (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,
  points_delta  INTEGER NOT NULL,
  running_total INTEGER NOT NULL,
  context       JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Achievement Progress: tracks sustained-condition badges
-- (Diamond requires score > 1200 for 30 consecutive days)
-- ============================================================
CREATE TABLE IF NOT EXISTS achievement_progress (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                   UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  diamond_threshold_reached TIMESTAMPTZ,
  updated_at                TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Extended profile columns for behavior system
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS behavior_score             INTEGER    DEFAULT 1000;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trust_tier                 TEXT       DEFAULT 'Reliable';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_restricted              BOOLEAN    DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_permanently_banned      BOOLEAN    DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS new_user_protection_active BOOLEAN    DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS new_user_protection_expiry TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days');
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_no_show_warning_given    BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_late_cancel_warning_given BOOLEAN DEFAULT false;

-- ============================================================
-- Message reward cap tracking: one row per (user, event) pair
-- to enforce the 5-message / +10-point per-event cap
-- ============================================================
CREATE TABLE IF NOT EXISTS event_message_rewards (
  user_id        UUID REFERENCES profiles(id) ON DELETE CASCADE,
  event_id       UUID REFERENCES event(id) ON DELETE CASCADE,
  messages_rewarded INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, event_id)
);

-- ============================================================
-- Indexes for common query patterns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_event_ratings_event_id      ON event_ratings(event_id);
CREATE INDEX IF NOT EXISTS idx_event_ratings_rater_id      ON event_ratings(rater_id);
CREATE INDEX IF NOT EXISTS idx_bslog_user_id               ON behavior_score_log(user_id);
CREATE INDEX IF NOT EXISTS idx_bslog_user_created          ON behavior_score_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bslog_user_action           ON behavior_score_log(user_id, action);

-- ============================================================
-- RLS for gamification / reputation tables
-- (created in add_profile_tables.sql and 002 without any RLS).
--
-- Write model: edge functions use the service role (bypasses RLS),
-- so client policies only need to allow what the app does directly:
--   * insert event_ratings / user_ratings as yourself, for events
--     you actually attended
--   * mark your own badges as seen
-- Everything else is read-only from the client.
-- ============================================================

ALTER TABLE user_ratings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges           ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_streaks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_ratings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavior_score_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievement_progress  ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_message_rewards ENABLE ROW LEVEL SECURITY;

-- ── user_ratings: public reputation, rate only as yourself after attending ──
DROP POLICY IF EXISTS "authenticated can read user ratings" ON user_ratings;
CREATE POLICY "authenticated can read user ratings"
  ON user_ratings FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "raters insert own ratings for events they attended" ON user_ratings;
CREATE POLICY "raters insert own ratings for events they attended"
  ON user_ratings FOR INSERT TO authenticated
  WITH CHECK (
    rater_id = auth.uid()
    AND rater_id <> rated_id
    AND EXISTS (
      SELECT 1 FROM event_attendees ea
      WHERE ea.event_id = user_ratings.event_id AND ea.user_id = auth.uid()
    )
  );

-- ── user_badges: public to read, owner may only flip the seen flag ──
DROP POLICY IF EXISTS "authenticated can read badges" ON user_badges;
CREATE POLICY "authenticated can read badges"
  ON user_badges FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "owner can mark badges seen" ON user_badges;
CREATE POLICY "owner can mark badges seen"
  ON user_badges FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── user_streaks: read-only from the client ──
DROP POLICY IF EXISTS "authenticated can read streaks" ON user_streaks;
CREATE POLICY "authenticated can read streaks"
  ON user_streaks FOR SELECT TO authenticated
  USING (true);

-- ── event_ratings: public to read, rate only as yourself after attending ──
DROP POLICY IF EXISTS "authenticated can read event ratings" ON event_ratings;
CREATE POLICY "authenticated can read event ratings"
  ON event_ratings FOR SELECT TO authenticated
  USING (true);

-- Rating is only allowed during the 24h window after the event starts —
-- the same window in which the event remains visible in the app
-- (src/lib/eventLifecycle.ts).
DROP POLICY IF EXISTS "attendees insert own event ratings" ON event_ratings;
CREATE POLICY "attendees insert own event ratings"
  ON event_ratings FOR INSERT TO authenticated
  WITH CHECK (
    rater_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM event_attendees ea
      JOIN event e ON e.id = ea.event_id
      WHERE ea.event_id = event_ratings.event_id
        AND ea.user_id = auth.uid()
        AND now() >= e.date_time::timestamptz
        AND now() <  e.date_time::timestamptz + INTERVAL '24 hours'
    )
  );

-- ── internal tables: owner-only read, no client writes ──
DROP POLICY IF EXISTS "owner can read own score log" ON behavior_score_log;
CREATE POLICY "owner can read own score log"
  ON behavior_score_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "owner can read own achievement progress" ON achievement_progress;
CREATE POLICY "owner can read own achievement progress"
  ON achievement_progress FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "owner can read own message rewards" ON event_message_rewards;
CREATE POLICY "owner can read own message rewards"
  ON event_message_rewards FOR SELECT TO authenticated
  USING (user_id = auth.uid());

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
