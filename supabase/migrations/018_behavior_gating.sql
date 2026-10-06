-- ============================================================
-- Enforce the behavior score.
--
-- The scoring system has existed since 002 and works: add-points and
-- deduct-points maintain profiles.behavior_score, trust_tier and
-- is_restricted, and src/lib/behaviorScore.ts defines the tiers.
--
-- Nothing ever read them. getTrustTier() has returned canHost:false and
-- canJoin:false for low-scoring users since day one, and no code path
-- consulted it — a user on 400 points could still host and join freely.
--
-- This migration makes the tiers real, in the database, so the rule holds
-- even against a modified client:
--
--     >= 900   Casual and above    can host, can join
--     800-899  Flagged             can join, cannot host
--     500-799  Restricted          cannot host, cannot join
--     < 500                        banned automatically, 72h to appeal
--
-- The first three thresholds mirror getTrustTier() exactly. Keep them in
-- step: if you change one, change the other.
-- ============================================================

-- ── 1. Thresholds ────────────────────────────────────────────────────────────
-- In app_config so they can be tuned without a migration or an app release.

ALTER TABLE app_config
  ADD COLUMN IF NOT EXISTS min_score_to_host   INT NOT NULL DEFAULT 900,
  ADD COLUMN IF NOT EXISTS min_score_to_join   INT NOT NULL DEFAULT 800,
  ADD COLUMN IF NOT EXISTS ban_score_threshold INT NOT NULL DEFAULT 500;

-- ── 2. Lookups ───────────────────────────────────────────────────────────────
-- SECURITY DEFINER so the policies below can read profiles without tripping
-- the profile-visibility rules from 017. STABLE so the planner caches them.

CREATE OR REPLACE FUNCTION behavior_score_of(target UUID)
RETURNS INT
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  -- A missing profile row (mid-signup) is treated as the 1000 starting score
  -- rather than 0, so onboarding is never blocked by its own timing.
  SELECT COALESCE((SELECT behavior_score FROM profiles WHERE id = target), 1000);
$$;

CREATE OR REPLACE FUNCTION can_host(target UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT behavior_score_of(target)
       >= COALESCE((SELECT min_score_to_host FROM app_config WHERE id = 1), 900);
$$;

CREATE OR REPLACE FUNCTION can_join(target UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT behavior_score_of(target)
       >= COALESCE((SELECT min_score_to_join FROM app_config WHERE id = 1), 800);
$$;

REVOKE ALL ON FUNCTION behavior_score_of(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION can_host(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION can_join(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION behavior_score_of(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_host(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_join(UUID) TO authenticated;

-- ── 3. Gating ────────────────────────────────────────────────────────────────
-- RESTRICTIVE, so these AND with the existing permissive policies and can
-- only narrow what a user may do.

DROP POLICY IF EXISTS "only hosts in good standing create events" ON event;
CREATE POLICY "only hosts in good standing create events"
  ON event AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (can_host(auth.uid()));

-- Joining covers both attending someone else's event and being added as the
-- owner of your own, so a user who may host may always join.
DROP POLICY IF EXISTS "only users in good standing join events" ON event_attendees;
CREATE POLICY "only users in good standing join events"
  ON event_attendees AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    can_join(auth.uid())
    -- The host is inserted as an attendee the moment they create an event;
    -- clearing the host bar is enough to clear this one.
    OR can_host(auth.uid())
  );

-- ── 4. Auto-ban at the floor ─────────────────────────────────────────────────
-- Restriction is recoverable — a user can earn their way back above 800.
-- Below the ban threshold it stops being recoverable and becomes a ban,
-- which routes through ban_user() from 017: events hidden, removed from
-- every event joined, 72 hours to appeal, then permanent deletion.

CREATE OR REPLACE FUNCTION trg_ban_on_score_floor()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  floor_score INT;
BEGIN
  -- Only react when the score actually moved downward.
  IF NEW.behavior_score IS NULL
     OR NEW.behavior_score IS NOT DISTINCT FROM OLD.behavior_score THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(ban_score_threshold, 500) INTO floor_score
    FROM app_config WHERE id = 1;

  IF NEW.behavior_score < COALESCE(floor_score, 500)
     AND NOT COALESCE(NEW.is_permanently_banned, FALSE) THEN
    PERFORM ban_user(
      NEW.id,
      format(
        'Automatically banned: behavior score fell to %s, below the minimum of %s.',
        NEW.behavior_score, COALESCE(floor_score, 500)
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- AFTER, not BEFORE: ban_user() updates this same row, and doing that from a
-- BEFORE trigger would fight with the update already in flight.
DROP TRIGGER IF EXISTS ban_on_score_floor ON profiles;
CREATE TRIGGER ban_on_score_floor
  AFTER UPDATE OF behavior_score ON profiles
  FOR EACH ROW EXECUTE FUNCTION trg_ban_on_score_floor();

-- ── 5. Backfill ──────────────────────────────────────────────────────────────
-- Nothing has enforced these rules until now, so an account may already be
-- sitting below the floor. Apply the ban once, on the way in.

DO $do$
DECLARE
  floor_score INT;
  offender    RECORD;
  banned      INT := 0;
BEGIN
  SELECT COALESCE(ban_score_threshold, 500) INTO floor_score
    FROM app_config WHERE id = 1;

  FOR offender IN
    SELECT id, behavior_score FROM profiles
     WHERE behavior_score IS NOT NULL
       AND behavior_score < COALESCE(floor_score, 500)
       AND NOT COALESCE(is_permanently_banned, FALSE)
  LOOP
    PERFORM ban_user(
      offender.id,
      format('Automatically banned: behavior score of %s is below the minimum of %s.',
             offender.behavior_score, COALESCE(floor_score, 500))
    );
    banned := banned + 1;
  END LOOP;

  RAISE NOTICE 'Behavior gating enabled. Accounts banned by backfill: %', banned;
END
$do$;
