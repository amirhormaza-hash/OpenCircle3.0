-- ============================================================
-- Silent attendees count as NEUTRAL, not as a perfect score
--
-- Migration 019 carried the 1–5 behaviour over literally: a silent attendee
-- (verified present, left no review) counted as a half-weight *top-score*
-- review. On the old scale that meant 5/5; doubled, it meant 10/10 — the
-- formula was asserting that everyone who said nothing loved the event.
--
-- On a scale where 5 is explicitly neutral that is a claim the data does not
-- support. Silence is absence of evidence, so it now pulls toward the middle:
--
--   score = (sum_stars + silent × NEUTRAL/2) / (reviewers + silent/2)
--
-- Half weight is unchanged — someone who turned up and said nothing is weaker
-- evidence than someone who bothered to rate, and should not drown them out.
--
-- This is a separate migration rather than an edit to 019 because 019 has
-- already run against production. Must stay in step with calculateEventRating
-- in src/lib/ratingSystem.ts, which computes the same thing client-side for
-- events whose aggregate has not been written back yet.
-- ============================================================

CREATE OR REPLACE FUNCTION recompute_event_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  neutral_rating CONSTANT NUMERIC := 5;
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
       SET rating = ROUND((sum_stars + silent * (neutral_rating / 2)) / denom, 2)
     WHERE id = eid;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

-- Triggers are unchanged, but restate them so this file stands alone.
DROP TRIGGER IF EXISTS trg_rating_recompute_on_ratings ON event_ratings;
CREATE TRIGGER trg_rating_recompute_on_ratings
  AFTER INSERT OR UPDATE OR DELETE ON event_ratings
  FOR EACH ROW EXECUTE FUNCTION recompute_event_rating();

DROP TRIGGER IF EXISTS trg_rating_recompute_on_attendees ON event_attendees;
CREATE TRIGGER trg_rating_recompute_on_attendees
  AFTER INSERT OR DELETE ON event_attendees
  FOR EACH ROW EXECUTE FUNCTION recompute_event_rating();

-- Recompute every stored aggregate under the new weighting. Unlike 019 this
-- is derived purely from the per-user rows, so it is safe to run repeatedly.
UPDATE event e
   SET rating = sub.score
  FROM (
    SELECT
      r.event_id,
      ROUND(
        (SUM(r.stars) + GREATEST(0, a.cnt - COUNT(*)) * 2.5)
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
