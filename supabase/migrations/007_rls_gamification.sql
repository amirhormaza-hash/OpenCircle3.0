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

DROP POLICY IF EXISTS "attendees insert own event ratings" ON event_ratings;
CREATE POLICY "attendees insert own event ratings"
  ON event_ratings FOR INSERT TO authenticated
  WITH CHECK (
    rater_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM event_attendees ea
      WHERE ea.event_id = event_ratings.event_id AND ea.user_id = auth.uid()
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
