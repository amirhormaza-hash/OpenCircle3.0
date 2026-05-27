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
