-- ============================================================
-- Ban enforcement, auto-ban, and the 72-hour appeal window.
--
-- Migration 015 gave users blocking and reporting. This closes the loop on
-- the other half of App Store Guideline 1.2: "the developer must act on
-- objectionable content reports within 24 hours by removing the content and
-- ejecting the user who provided the offending content."
--
-- What changes here:
--   1. profiles.is_permanently_banned finally does something. It existed
--      since 002 but was only read by the points system — a banned user
--      could still sign in, post events, and message people.
--   2. An account blocked or reported by enough distinct users is banned
--      automatically, without waiting for a human.
--   3. Banning hides every event the account created and removes it from
--      every event it had joined.
--   4. The banned account gets 72 hours to appeal. If it does not, the
--      account and all its content are deleted permanently.
--   5. Blocking now hides profiles as well as content, in both directions.
--
-- Thresholds live in app_config so they can be tuned without a migration.
-- ============================================================

-- ── 1. Ban state ─────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS banned_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ban_reason           TEXT,
  ADD COLUMN IF NOT EXISTS appeal_deadline      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS appeal_status        TEXT NOT NULL DEFAULT 'none'
    CHECK (appeal_status IN ('none', 'pending', 'approved', 'denied')),
  ADD COLUMN IF NOT EXISTS appeal_text          TEXT,
  ADD COLUMN IF NOT EXISTS appeal_submitted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS appeal_reviewed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS appeal_reviewer_note TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_banned
  ON profiles(appeal_deadline) WHERE is_permanently_banned = TRUE;

-- Tunable thresholds. Defaults match the policy stated to users: an account
-- blocked or reported by 5 distinct people is banned.
ALTER TABLE app_config
  ADD COLUMN IF NOT EXISTS auto_ban_block_threshold  INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS auto_ban_report_threshold INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS appeal_window_hours       INT NOT NULL DEFAULT 72;

-- ── 2. Ban lookup ────────────────────────────────────────────────────────────
-- SECURITY DEFINER so the restrictive policies below can call it without
-- recursing through the very policies they are enforcing.

CREATE OR REPLACE FUNCTION is_banned(target UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_permanently_banned FROM profiles WHERE id = target),
    FALSE
  );
$$;

REVOKE ALL ON FUNCTION is_banned(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_banned(UUID) TO authenticated;

-- ── 3. Banning ───────────────────────────────────────────────────────────────
-- Ejecting an account means three things at once: it can no longer act, the
-- events it created stop being visible, and it stops occupying a place at
-- events other people are attending.

CREATE OR REPLACE FUNCTION ban_user(p_target UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  window_hours INT;
BEGIN
  -- Already banned: leave the original deadline alone so a second trigger
  -- cannot quietly extend someone's appeal window.
  IF is_banned(p_target) THEN
    RETURN;
  END IF;

  SELECT COALESCE(appeal_window_hours, 72) INTO window_hours
    FROM app_config WHERE id = 1;

  UPDATE profiles
     SET is_permanently_banned = TRUE,
         banned_at             = now(),
         ban_reason            = p_reason,
         appeal_deadline       = now() + make_interval(hours => COALESCE(window_hours, 72)),
         appeal_status         = 'none'
   WHERE id = p_target;

  -- Everything they created comes down.
  UPDATE event
     SET is_hidden = TRUE, hidden_at = now()
   WHERE profile_id = p_target AND is_hidden = FALSE;

  -- And they lose their seat at everything they had joined.
  DELETE FROM event_attendees WHERE user_id = p_target;

  -- Sever social ties so nothing lingers if the appeal succeeds later.
  DELETE FROM friendships
   WHERE requester_id = p_target OR addressee_id = p_target;
END;
$$;

REVOKE ALL ON FUNCTION ban_user(UUID, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION unban_user(p_target UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
     SET is_permanently_banned = FALSE,
         banned_at             = NULL,
         ban_reason            = NULL,
         appeal_deadline       = NULL,
         appeal_status         = 'approved',
         appeal_reviewed_at    = now()
   WHERE id = p_target;

  -- Restore their events, but only the ones the ban hid — anything pulled
  -- down by the report threshold in 015 stays down on its own merits.
  UPDATE event
     SET is_hidden = FALSE, hidden_at = NULL
   WHERE profile_id = p_target
     AND is_hidden = TRUE
     AND NOT EXISTS (
       SELECT 1 FROM event_reports r
        WHERE r.event_id = event.id AND r.review_status = 'pending'
       GROUP BY r.event_id
       HAVING COUNT(DISTINCT r.reporter_id) >= 3
     );
END;
$$;

REVOKE ALL ON FUNCTION unban_user(UUID) FROM PUBLIC;

-- ── 4. Auto-ban ──────────────────────────────────────────────────────────────
-- Counts are of DISTINCT people, not rows, so one determined user cannot ban
-- someone by reporting them five times.

CREATE OR REPLACE FUNCTION check_auto_ban(p_target UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  block_threshold  INT;
  report_threshold INT;
  block_count      INT;
  report_count     INT;
BEGIN
  IF p_target IS NULL OR is_banned(p_target) THEN
    RETURN;
  END IF;

  SELECT COALESCE(auto_ban_block_threshold, 5),
         COALESCE(auto_ban_report_threshold, 5)
    INTO block_threshold, report_threshold
    FROM app_config WHERE id = 1;

  SELECT COUNT(DISTINCT blocker_id) INTO block_count
    FROM blocked_users WHERE blocked_id = p_target;

  IF block_count >= COALESCE(block_threshold, 5) THEN
    PERFORM ban_user(
      p_target,
      format('Automatically banned after being blocked by %s different users.', block_count)
    );
    RETURN;
  END IF;

  SELECT COUNT(DISTINCT reporter_id) INTO report_count
    FROM user_reports WHERE reported_id = p_target;

  IF report_count >= COALESCE(report_threshold, 5) THEN
    PERFORM ban_user(
      p_target,
      format('Automatically banned after being reported by %s different users.', report_count)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION check_auto_ban(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION trg_auto_ban_from_block()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM check_auto_ban(NEW.blocked_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_auto_ban_from_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM check_auto_ban(NEW.reported_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_ban_on_block ON blocked_users;
CREATE TRIGGER auto_ban_on_block
  AFTER INSERT ON blocked_users
  FOR EACH ROW EXECUTE FUNCTION trg_auto_ban_from_block();

DROP TRIGGER IF EXISTS auto_ban_on_report ON user_reports;
CREATE TRIGGER auto_ban_on_report
  AFTER INSERT ON user_reports
  FOR EACH ROW EXECUTE FUNCTION trg_auto_ban_from_report();

-- ── 5. Appeals ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_appeal(p_text TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me       UUID := auth.uid();
  deadline TIMESTAMPTZ;
  status   TEXT;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_text IS NULL OR length(trim(p_text)) < 10 THEN
    RAISE EXCEPTION 'Please explain your appeal in a little more detail.';
  END IF;

  SELECT appeal_deadline, appeal_status INTO deadline, status
    FROM profiles WHERE id = me AND is_permanently_banned = TRUE;

  IF deadline IS NULL THEN
    RAISE EXCEPTION 'No active ban to appeal.';
  END IF;
  IF now() > deadline THEN
    RAISE EXCEPTION 'The 72-hour appeal window for this account has closed.';
  END IF;
  IF status = 'pending' THEN
    RAISE EXCEPTION 'Your appeal has already been submitted and is under review.';
  END IF;
  IF status = 'denied' THEN
    RAISE EXCEPTION 'This appeal has already been reviewed and denied.';
  END IF;

  UPDATE profiles
     SET appeal_text         = p_text,
         appeal_status       = 'pending',
         appeal_submitted_at = now()
   WHERE id = me;
END;
$$;

REVOKE ALL ON FUNCTION submit_appeal(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_appeal(TEXT) TO authenticated;

-- Developer-facing: run from the SQL editor when triaging an appeal.
CREATE OR REPLACE FUNCTION review_appeal(p_target UUID, p_approve BOOLEAN, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_approve THEN
    PERFORM unban_user(p_target);
    UPDATE profiles SET appeal_reviewer_note = p_note WHERE id = p_target;
  ELSE
    UPDATE profiles
       SET appeal_status        = 'denied',
           appeal_reviewed_at   = now(),
           appeal_reviewer_note = p_note
     WHERE id = p_target;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION review_appeal(UUID, BOOLEAN, TEXT) FROM PUBLIC;

-- ── 6. Permanent deletion after the appeal window ────────────────────────────
-- A pending appeal is never purged: the clock stops once the user has
-- actually appealed, so nobody is deleted while waiting on us.

CREATE OR REPLACE FUNCTION purge_expired_bans()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  victim  RECORD;
  deleted INT := 0;
BEGIN
  FOR victim IN
    SELECT id FROM profiles
     WHERE is_permanently_banned = TRUE
       AND appeal_deadline IS NOT NULL
       AND appeal_deadline < now()
       AND appeal_status IN ('none', 'denied')
  LOOP
    -- Deleting the auth user cascades to profiles and everything that
    -- references it, so the account and its content go together.
    DELETE FROM auth.users WHERE id = victim.id;
    deleted := deleted + 1;
  END LOOP;

  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION purge_expired_bans() FROM PUBLIC;

-- Run hourly if pg_cron is available. If it is not, enable it under
-- Database → Extensions in the Supabase dashboard and re-run this block —
-- without it, expired bans are never actually erased.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purge-expired-bans')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-expired-bans');
    PERFORM cron.schedule(
      'purge-expired-bans', '0 * * * *', 'SELECT purge_expired_bans();'
    );
    RAISE NOTICE 'Scheduled hourly purge of expired bans.';
  ELSE
    RAISE NOTICE 'pg_cron not installed — expired bans will NOT be deleted automatically. Enable the pg_cron extension and re-run this migration.';
  END IF;
END
$do$;

-- ── 7. Enforcement ───────────────────────────────────────────────────────────
-- RESTRICTIVE policies AND with the permissive ones, so these only narrow
-- access. Every one of them allows a user to see their own row, which is what
-- keeps the appeal screen working for a banned account.

-- Profiles: a blocked pair cannot see each other's details, and a banned
-- account is invisible to everyone but itself.
DROP POLICY IF EXISTS "hide blocked and banned profiles" ON profiles;
CREATE POLICY "hide blocked and banned profiles"
  ON profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (NOT is_banned(id) AND NOT is_blocked(auth.uid(), id))
  );

-- Events created by a banned account are already hidden by ban_user, but
-- enforce it directly too so nothing slips through if the flag is set by hand.
DROP POLICY IF EXISTS "hide events from banned users" ON event;
CREATE POLICY "hide events from banned users"
  ON event AS RESTRICTIVE FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR NOT is_banned(profile_id));

-- A banned account cannot create anything.
DROP POLICY IF EXISTS "banned users cannot create events" ON event;
CREATE POLICY "banned users cannot create events"
  ON event AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT is_banned(auth.uid()));

DROP POLICY IF EXISTS "banned users cannot join events" ON event_attendees;
CREATE POLICY "banned users cannot join events"
  ON event_attendees AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT is_banned(auth.uid()));

DO $do$
BEGIN
  IF to_regclass('public.chat_messages') IS NOT NULL THEN
    EXECUTE $p$ DROP POLICY IF EXISTS "banned users cannot post in event chat" ON chat_messages $p$;
    EXECUTE $p$ CREATE POLICY "banned users cannot post in event chat"
      ON chat_messages AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (NOT is_banned(auth.uid())) $p$;

    EXECUTE $p$ DROP POLICY IF EXISTS "hide event chat from banned users" ON chat_messages $p$;
    EXECUTE $p$ CREATE POLICY "hide event chat from banned users"
      ON chat_messages AS RESTRICTIVE FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR NOT is_banned(user_id)) $p$;
  END IF;

  IF to_regclass('public.direct_messages') IS NOT NULL THEN
    EXECUTE $p$ DROP POLICY IF EXISTS "banned users cannot send dms" ON direct_messages $p$;
    EXECUTE $p$ CREATE POLICY "banned users cannot send dms"
      ON direct_messages AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (NOT is_banned(auth.uid())) $p$;

    EXECUTE $p$ DROP POLICY IF EXISTS "hide dms from banned users" ON direct_messages $p$;
    EXECUTE $p$ CREATE POLICY "hide dms from banned users"
      ON direct_messages AS RESTRICTIVE FOR SELECT TO authenticated
      USING (sender_id = auth.uid() OR NOT is_banned(sender_id)) $p$;
  END IF;
END
$do$;
