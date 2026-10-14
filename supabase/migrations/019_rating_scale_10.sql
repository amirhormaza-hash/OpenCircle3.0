-- ============================================================
-- Rating scale: 1–5 → 1–10 (5 = neutral)
--
-- Numbered 019, not 017: the parked `moderation-v2` branch already holds
-- 017_ban_enforcement and 018_behavior_gating. Neither has been applied, but
-- reusing their numbers here would let a later merge skip one silently.
--
-- Three things have to change together, and the order matters:
--
--   1. WIDEN THE COLUMNS. event.rating is NUMERIC(3,2) — maximum 9.99 — and
--      user_ratings.score is NUMERIC(2,1) — maximum 9.9. Neither can store a
--      10. Postgres rejects the write rather than rounding, so leaving these
--      alone would mean every perfect rating fails at insert time.
--
--   2. RELAX THE CHECKS BEFORE DOUBLING. The existing CHECK (… <= 5) would
--      reject the doubled values mid-update.
--
--   3. DOUBLE THE STORED VALUES. ×2 maps the old scale onto the new one
--      exactly: 5★ → 10, 1★ → 2, and an aggregate of 4.47 → 8.93. Old and new
--      ratings stay directly comparable, so nothing needs re-reviewing.
--
-- The whole data half is guarded on event.rating still being NUMERIC(3,2), so
-- re-running this file cannot double anything twice.
-- ============================================================

DO $do$
DECLARE
  already_migrated BOOLEAN;
  con RECORD;
BEGIN
  SELECT COALESCE(numeric_precision, 0) >= 4
    INTO already_migrated
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'event' AND column_name = 'rating';

  IF already_migrated IS NULL THEN
    RAISE NOTICE 'event.rating missing — run 009_event_rating_column.sql first';
    RETURN;
  END IF;

  IF already_migrated THEN
    RAISE NOTICE 'rating scale already 1-10 — skipping widen and backfill';
    RETURN;
  END IF;

  -- 1. Widen so a 10 physically fits.
  ALTER TABLE event ALTER COLUMN rating TYPE NUMERIC(4,2);

  IF to_regclass('public.user_ratings') IS NOT NULL THEN
    ALTER TABLE user_ratings ALTER COLUMN score TYPE NUMERIC(3,1);
  END IF;

  -- 2. Drop the old 1–5 CHECKs. They were declared inline, so the names are
  -- whatever Postgres generated — look them up rather than guess.
  FOR con IN
    SELECT rel.relname AS table_name, c.conname
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
     WHERE n.nspname = 'public'
       AND c.contype = 'c'
       AND rel.relname IN ('event_ratings', 'user_ratings')
       AND (pg_get_constraintdef(c.oid) ILIKE '%stars%'
            OR pg_get_constraintdef(c.oid) ILIKE '%score%')
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', con.table_name, con.conname);
    RAISE NOTICE 'dropped % on %', con.conname, con.table_name;
  END LOOP;

  -- 3. Double every stored value.
  UPDATE event_ratings SET stars = stars * 2;
  UPDATE event SET rating = rating * 2 WHERE rating IS NOT NULL;

  IF to_regclass('public.user_ratings') IS NOT NULL THEN
    UPDATE user_ratings SET score = score * 2 WHERE score IS NOT NULL;
  END IF;

  -- 4. Re-apply the checks at the new range.
  ALTER TABLE event_ratings
    ADD CONSTRAINT event_ratings_stars_range CHECK (stars >= 1 AND stars <= 10);

  IF to_regclass('public.user_ratings') IS NOT NULL THEN
    ALTER TABLE user_ratings
      ADD CONSTRAINT user_ratings_score_range CHECK (score >= 1 AND score <= 10);
  END IF;
END
$do$;

-- ============================================================
-- Aggregate trigger, restated for the 1–10 scale.
--
-- The old formula divided by 5 and multiplied by 5 again, which cancelled out;
-- what it actually computed was the weighted mean. Stated plainly here:
--
--   score = (sum_stars + silent × MAX/2) / (reviewers + silent/2)
--
-- Silent attendees count as half-weight top-score reviews, unchanged from the
-- 1–5 version. Must stay in step with calculateEventRating() in
-- src/lib/ratingSystem.ts — the client computes this too, for events whose
-- aggregate has not been written back yet.
-- ============================================================
CREATE OR REPLACE FUNCTION recompute_event_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  max_rating CONSTANT NUMERIC := 10;
  eid        UUID;
  reviewers  INTEGER;
  sum_stars  NUMERIC;
  attendees  INTEGER;
  silent     NUMERIC;
  denom      NUMERIC;
BEGIN
  eid := COALESCE(NEW.event_id, OLD.event_id);

  SELECT COUNT(*), COALESCE(SUM(stars), 0)
    INTO reviewers, sum_stars
    FROM event_ratings WHERE event_id = eid;

  SELECT COUNT(*) INTO attendees
    FROM event_attendees WHERE event_id = eid;

  IF reviewers = 0 OR attendees = 0 THEN
    UPDATE event SET rating = NULL WHERE id = eid;
  ELSE
    silent := GREATEST(0, attendees - reviewers);
    denom  := reviewers + silent / 2.0;
    UPDATE event
       SET rating = ROUND((sum_stars + silent * (max_rating / 2)) / denom, 2)
     WHERE id = eid;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

-- Triggers themselves are unchanged; restated so this file stands alone.
DROP TRIGGER IF EXISTS trg_rating_recompute_on_ratings ON event_ratings;
CREATE TRIGGER trg_rating_recompute_on_ratings
  AFTER INSERT OR UPDATE OR DELETE ON event_ratings
  FOR EACH ROW EXECUTE FUNCTION recompute_event_rating();

DROP TRIGGER IF EXISTS trg_rating_recompute_on_attendees ON event_attendees;
CREATE TRIGGER trg_rating_recompute_on_attendees
  AFTER INSERT OR DELETE ON event_attendees
  FOR EACH ROW EXECUTE FUNCTION recompute_event_rating();

-- Recompute every aggregate from the doubled per-user rows, so events whose
-- rating was derived under the old formula land on the new scale too.
UPDATE event e
   SET rating = sub.score
  FROM (
    SELECT
      r.event_id,
      ROUND(
        (SUM(r.stars) + GREATEST(0, a.cnt - COUNT(*)) * 5.0)
          / (COUNT(*) + GREATEST(0, a.cnt - COUNT(*)) / 2.0),
        2
      ) AS score
    FROM event_ratings r
    JOIN (
      SELECT event_id, COUNT(*) AS cnt FROM event_attendees GROUP BY event_id
    ) a ON a.event_id = r.event_id
    GROUP BY r.event_id, a.cnt
  ) sub
 WHERE e.id = sub.event_id;
