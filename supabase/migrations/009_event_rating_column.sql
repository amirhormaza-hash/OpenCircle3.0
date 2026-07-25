-- ============================================================
-- Event rating, stored on the event table.
--
-- Self-contained: safe to run even if 002/007 were never applied.
--   1. Creates the per-user event_ratings table if missing
--   2. Locks it down with RLS (attendees only, 24h window)
--   3. Adds event.rating (aggregate score, 0.00–5.00)
--   4. Triggers keep event.rating in sync automatically whenever
--      a rating is added or attendance changes
--
-- The aggregate formula matches src/lib/ratingSystem.ts:
--   silent attendees (no review) count as half-weight 5★ reviews
--   score = (sum_stars + silent × 2.5) / (5 × (reviewers + silent/2)) × 5
-- ============================================================

-- 0. event.date_time is TEXT in the live DB — convert it to a real
-- timestamp so time comparisons (rating window, feed cutoff) work.
-- The app has always written ISO-8601 strings, so the cast is clean.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event'
      AND column_name = 'date_time'
      AND data_type <> 'timestamp with time zone'
  ) THEN
    -- The old TEXT column had a default that can't be auto-cast; the app
    -- always supplies date_time explicitly, so no default is needed.
    ALTER TABLE event ALTER COLUMN date_time DROP DEFAULT;
    ALTER TABLE event
      ALTER COLUMN date_time TYPE TIMESTAMPTZ
      USING date_time::timestamptz;
  END IF;
END $$;

-- 1. Per-user ratings table (same definition as migration 002)
CREATE TABLE IF NOT EXISTS event_ratings (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id   UUID REFERENCES event(id) ON DELETE CASCADE,
  rater_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  stars      SMALLINT NOT NULL CHECK (stars >= 1 AND stars <= 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, rater_id)
);

CREATE INDEX IF NOT EXISTS idx_event_ratings_event_id ON event_ratings(event_id);
CREATE INDEX IF NOT EXISTS idx_event_ratings_rater_id ON event_ratings(rater_id);

-- 2. RLS (same rules as migration 007: attendees only, 24h window)
ALTER TABLE event_ratings ENABLE ROW LEVEL SECURITY;

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
      SELECT 1
      FROM event_attendees ea
      JOIN event e ON e.id = ea.event_id
      WHERE ea.event_id = event_ratings.event_id
        AND ea.user_id = auth.uid()
        AND now() >= e.date_time::timestamptz
        AND now() <  e.date_time::timestamptz + INTERVAL '24 hours'
    )
  );

-- 3. Aggregate rating column on event
ALTER TABLE event ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2);

-- 4. Keep event.rating in sync.
-- SECURITY DEFINER: attendees can't UPDATE event rows themselves (RLS),
-- so the trigger updates the aggregate with the function owner's rights.
CREATE OR REPLACE FUNCTION recompute_event_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
    denom  := 5 * (reviewers + silent / 2.0);
    UPDATE event
       SET rating = ROUND(((sum_stars + silent * 2.5) / denom) * 5, 2)
     WHERE id = eid;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_rating_recompute_on_ratings ON event_ratings;
CREATE TRIGGER trg_rating_recompute_on_ratings
  AFTER INSERT OR UPDATE OR DELETE ON event_ratings
  FOR EACH ROW EXECUTE FUNCTION recompute_event_rating();

-- Attendance changes also shift the silent-attendee weighting
DROP TRIGGER IF EXISTS trg_rating_recompute_on_attendees ON event_attendees;
CREATE TRIGGER trg_rating_recompute_on_attendees
  AFTER INSERT OR DELETE ON event_attendees
  FOR EACH ROW EXECUTE FUNCTION recompute_event_rating();

-- 5. Backfill any existing ratings into the new column
UPDATE event e
   SET rating = sub.score
  FROM (
    SELECT
      r.event_id,
      ROUND(
        ((SUM(r.stars) + GREATEST(0, a.cnt - COUNT(*)) * 2.5)
          / (5 * (COUNT(*) + GREATEST(0, a.cnt - COUNT(*)) / 2.0))) * 5,
        2
      ) AS score
    FROM event_ratings r
    JOIN (
      SELECT event_id, COUNT(*) AS cnt FROM event_attendees GROUP BY event_id
    ) a ON a.event_id = r.event_id
    GROUP BY r.event_id, a.cnt
  ) sub
 WHERE e.id = sub.event_id;
