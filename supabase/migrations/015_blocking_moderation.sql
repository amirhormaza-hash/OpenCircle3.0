-- ============================================================
-- User blocking + moderation workflow.
--
-- Added for App Store Guideline 1.2 (Safety - User-Generated Content),
-- which requires apps with UGC to provide:
--   1. a way to filter objectionable material          -> src/lib/moderation.ts
--   2. a way to report offensive content               -> *_reports tables
--   3. a way to block abusive users                    -> blocked_users (this file)
--   4. developer action on reports within 24 hours     -> review_status workflow
--
-- Blocking is enforced server-side with RESTRICTIVE policies so a blocked
-- pair genuinely cannot see or reach each other, even if the client is
-- patched. RESTRICTIVE policies AND with the existing permissive ones,
-- so nothing here loosens the rules already in 007/008.
--
-- Self-contained, in the same spirit as 009: safe to run even if 006 was
-- never applied. Section 0 recreates the report tables if they are missing,
-- and the enforcement policies in section 5 skip any table that does not
-- exist rather than aborting the whole migration.
-- ============================================================

-- ── 0. Prerequisites from 006 ────────────────────────────────────────────────
-- These were introduced in 006_moderation.sql. Recreated here because the
-- ALTERs in section 2 depend on them, and 006 may never have been applied.

-- message_reports: flags raised against individual chat messages.
-- message_id is text (not an FK) because it can reference either
-- chat_messages or direct_messages depending on context.
CREATE TABLE IF NOT EXISTS message_reports (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_id  TEXT NOT NULL,
  context     TEXT NOT NULL CHECK (context IN ('event_chat', 'dm')),
  reason      TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- user_reports: flags raised against users (from group chat, DMs, or a block).
-- event_id is nullable — set when the report originates from an event.
CREATE TABLE IF NOT EXISTS user_reports (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id    UUID REFERENCES event(id) ON DELETE SET NULL,
  reason      TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE message_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reports    ENABLE ROW LEVEL SECURITY;

-- Reporters can only file their own reports. No SELECT policy: reports are
-- triaged out of band, and a reporter has no reason to read them back.
DROP POLICY IF EXISTS "insert own message reports" ON message_reports;
CREATE POLICY "insert own message reports"
  ON message_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "insert own user reports" ON user_reports;
CREATE POLICY "insert own user reports"
  ON user_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- ── 1. Blocks ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS blocked_users (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason     TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT block_not_self CHECK (blocker_id <> blocked_id),
  UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_id);

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- You can only ever see, create, or lift your own blocks. Deliberately no
-- SELECT policy for the blocked side: a user must not be able to detect
-- that they have been blocked.
DROP POLICY IF EXISTS "read own blocks" ON blocked_users;
CREATE POLICY "read own blocks"
  ON blocked_users FOR SELECT TO authenticated
  USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "create own blocks" ON blocked_users;
CREATE POLICY "create own blocks"
  ON blocked_users FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "lift own blocks" ON blocked_users;
CREATE POLICY "lift own blocks"
  ON blocked_users FOR DELETE TO authenticated
  USING (blocker_id = auth.uid());

-- Blocking is mutual for visibility purposes: if either side blocked the
-- other, neither sees the other's content.
--
-- SECURITY DEFINER so the lookup bypasses the RLS above (which only exposes
-- rows where blocker_id = auth.uid()) and can therefore also see blocks
-- filed *against* the caller. STABLE so the planner caches it per statement.
CREATE OR REPLACE FUNCTION is_blocked(a UUID, b UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM blocked_users
     WHERE (blocker_id = a AND blocked_id = b)
        OR (blocker_id = b AND blocked_id = a)
  );
$$;

REVOKE ALL ON FUNCTION is_blocked(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_blocked(UUID, UUID) TO authenticated;

-- ── 2. Moderation workflow on the existing report tables ─────────────────────
-- Guideline 1.2 requires acting on reports within 24 hours. These columns
-- are what the moderation queue is triaged against.

ALTER TABLE message_reports
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'actioned', 'dismissed')),
  ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewer_note TEXT,
  ADD COLUMN IF NOT EXISTS content_text  TEXT;

ALTER TABLE user_reports
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'actioned', 'dismissed')),
  ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewer_note TEXT,
  ADD COLUMN IF NOT EXISTS source        TEXT;

CREATE INDEX IF NOT EXISTS idx_message_reports_pending
  ON message_reports(created_at) WHERE review_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_user_reports_pending
  ON user_reports(created_at) WHERE review_status = 'pending';

-- ── 3. Event reports ─────────────────────────────────────────────────────────
-- Event names and descriptions are user-generated too, so they need their
-- own report path — not just chat messages.

CREATE TABLE IF NOT EXISTS event_reports (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  reason        TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'actioned', 'dismissed')),
  reviewed_at   TIMESTAMPTZ,
  reviewer_note TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (reporter_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_reports_event ON event_reports(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reports_pending
  ON event_reports(created_at) WHERE review_status = 'pending';

ALTER TABLE event_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert own event reports" ON event_reports;
CREATE POLICY "insert own event reports"
  ON event_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "read own event reports" ON event_reports;
CREATE POLICY "read own event reports"
  ON event_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

-- ── 4. Auto-hide as a safety net ─────────────────────────────────────────────
-- Reports are reviewed by hand within 24h, but content that several distinct
-- users independently flag comes down immediately rather than waiting.

ALTER TABLE event ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE event ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION auto_hide_reported_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  report_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT reporter_id) INTO report_count
    FROM event_reports
   WHERE event_id = NEW.event_id AND review_status = 'pending';

  IF report_count >= 3 THEN
    UPDATE event
       SET is_hidden = TRUE, hidden_at = now()
     WHERE id = NEW.event_id AND is_hidden = FALSE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_hide_event ON event_reports;
CREATE TRIGGER trg_auto_hide_event
  AFTER INSERT ON event_reports
  FOR EACH ROW EXECUTE FUNCTION auto_hide_reported_event();

-- ── 5. Enforce blocking (and hiding) server-side ─────────────────────────────
-- RESTRICTIVE policies AND with the existing permissive policies. They can
-- only ever narrow access, so the rules from 007/008 stay intact.

-- Blocked users' events disappear from the feed instantly, as do events
-- pulled down by moderation.
DROP POLICY IF EXISTS "hide blocked and removed events" ON event;
CREATE POLICY "hide blocked and removed events"
  ON event AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    is_hidden = FALSE
    AND (profile_id = auth.uid() OR NOT is_blocked(auth.uid(), profile_id))
  );

-- The tables below come from 005 (DMs), 008 (chat_messages) and 010
-- (friendships). Each block is skipped if its table is absent, so a project
-- missing an earlier migration still gets everything else in this file.

-- A blocked pair cannot open a DM thread with each other, nor send each
-- other messages in one that already exists.
DO $do$
BEGIN
  IF to_regclass('public.direct_chats') IS NULL THEN
    RAISE NOTICE 'direct_chats missing — skipping DM thread block policies';
  ELSE
    EXECUTE $p$ DROP POLICY IF EXISTS "no dm threads between blocked users" ON direct_chats $p$;
    EXECUTE $p$ CREATE POLICY "no dm threads between blocked users"
      ON direct_chats AS RESTRICTIVE FOR SELECT TO authenticated
      USING (NOT is_blocked(user1_id, user2_id)) $p$;

    EXECUTE $p$ DROP POLICY IF EXISTS "no new dm threads between blocked users" ON direct_chats $p$;
    EXECUTE $p$ CREATE POLICY "no new dm threads between blocked users"
      ON direct_chats AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (NOT is_blocked(user1_id, user2_id)) $p$;
  END IF;

  IF to_regclass('public.direct_messages') IS NULL THEN
    RAISE NOTICE 'direct_messages missing — skipping DM message block policies';
  ELSE
    EXECUTE $p$ DROP POLICY IF EXISTS "no dms between blocked users" ON direct_messages $p$;
    EXECUTE $p$ CREATE POLICY "no dms between blocked users"
      ON direct_messages AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (
        NOT EXISTS (
          SELECT 1 FROM direct_chats c
           WHERE c.id = direct_messages.chat_id
             AND is_blocked(c.user1_id, c.user2_id)
        )
      ) $p$;

    EXECUTE $p$ DROP POLICY IF EXISTS "hide dms from blocked users" ON direct_messages $p$;
    EXECUTE $p$ CREATE POLICY "hide dms from blocked users"
      ON direct_messages AS RESTRICTIVE FOR SELECT TO authenticated
      USING (sender_id = auth.uid() OR NOT is_blocked(auth.uid(), sender_id)) $p$;
  END IF;

  -- Event chat: messages from someone you blocked stop rendering for you.
  IF to_regclass('public.chat_messages') IS NULL THEN
    RAISE NOTICE 'chat_messages missing — skipping event chat block policy';
  ELSE
    EXECUTE $p$ DROP POLICY IF EXISTS "hide chat messages from blocked users" ON chat_messages $p$;
    EXECUTE $p$ CREATE POLICY "hide chat messages from blocked users"
      ON chat_messages AS RESTRICTIVE FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR NOT is_blocked(auth.uid(), user_id)) $p$;
  END IF;

  -- Friend requests from someone you blocked never arrive.
  IF to_regclass('public.friendships') IS NULL THEN
    RAISE NOTICE 'friendships missing — skipping friendship block policies';
  ELSE
    EXECUTE $p$ DROP POLICY IF EXISTS "no friendships between blocked users" ON friendships $p$;
    EXECUTE $p$ CREATE POLICY "no friendships between blocked users"
      ON friendships AS RESTRICTIVE FOR SELECT TO authenticated
      USING (NOT is_blocked(requester_id, addressee_id)) $p$;

    EXECUTE $p$ DROP POLICY IF EXISTS "no new friendships between blocked users" ON friendships $p$;
    EXECUTE $p$ CREATE POLICY "no new friendships between blocked users"
      ON friendships AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (NOT is_blocked(requester_id, addressee_id)) $p$;
  END IF;
END
$do$;

-- ── 6. Block RPC ─────────────────────────────────────────────────────────────
-- One call so the client can't half-apply a block. Blocking optionally files
-- a report at the same time, which is what puts the offending content in
-- front of the developer (Guideline 1.2: "blocking should also notify the
-- developer of the inappropriate content").

CREATE OR REPLACE FUNCTION block_user(p_blocked_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF me = p_blocked_id THEN
    RAISE EXCEPTION 'You cannot block yourself';
  END IF;

  INSERT INTO blocked_users (blocker_id, blocked_id, reason)
  VALUES (me, p_blocked_id, p_reason)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;

  -- Blocking with a stated reason also files a moderation report.
  IF p_reason IS NOT NULL AND length(trim(p_reason)) > 0 THEN
    INSERT INTO user_reports (reporter_id, reported_id, reason, source)
    VALUES (me, p_blocked_id, p_reason, 'block');
  END IF;

  -- Sever any existing relationship in both directions. Guarded to match the
  -- skip in section 5; PL/pgSQL only prepares the statement if it runs.
  IF to_regclass('public.friendships') IS NOT NULL THEN
    DELETE FROM friendships
     WHERE (requester_id = me AND addressee_id = p_blocked_id)
        OR (requester_id = p_blocked_id AND addressee_id = me);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION block_user(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION block_user(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION unblock_user(p_blocked_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM blocked_users
   WHERE blocker_id = auth.uid() AND blocked_id = p_blocked_id;
END;
$$;

REVOKE ALL ON FUNCTION unblock_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unblock_user(UUID) TO authenticated;

-- ── 7. EULA acceptance ───────────────────────────────────────────────────────
-- Guideline 1.2 requires users to agree to terms that state there is no
-- tolerance for objectionable content or abusive users. Recording the
-- acceptance is what lets us show App Review it happened.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_accepted_version TEXT;
