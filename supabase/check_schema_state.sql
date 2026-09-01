-- ============================================================
-- Post-migration health check.
--
-- Run this in the Supabase SQL editor after 015 and 016. It reports one
-- row per thing that should exist, with MISSING rows sorted to the top.
--
-- Three groups:
--   tables   — which migrations have actually landed
--   columns  — the columns 015 adds to existing tables
--   policies — the blocking enforcement from 015 section 5. These are the
--              ones that skip with a NOTICE if their table is absent, so an
--              MISSING here means blocking is NOT enforced on that surface.
--
-- Everything should read 'ok'. It is a single query on purpose: the SQL
-- editor only shows the last result set when you run several statements.
-- ============================================================

WITH expected_tables (grp, migration, object_name) AS (VALUES
  ('table', 'base',                'profiles'),
  ('table', 'base',                'event'),
  ('table', 'base',                'event_attendees'),
  ('table', 'base',                'event_images'),
  ('table', 'base',                'event_chats'),
  ('table', 'base',                'chat_messages'),
  ('table', '002 rating/behavior', 'user_ratings'),
  ('table', '002 rating/behavior', 'user_badges'),
  ('table', '002 rating/behavior', 'user_streaks'),
  ('table', '005 direct messages', 'direct_chats'),
  ('table', '005 direct messages', 'direct_messages'),
  ('table', '006 moderation',      'message_reports'),
  ('table', '006 moderation',      'user_reports'),
  ('table', '009 event ratings',   'event_ratings'),
  ('table', '010 friendships',     'friendships'),
  ('table', '011 invitations',     'event_invitations'),
  ('table', '014 app config',      'app_config'),
  ('table', '015 blocking',        'blocked_users'),
  ('table', '015 blocking',        'event_reports')
),

expected_columns (grp, migration, tbl, col) AS (VALUES
  ('column', '015 blocking', 'event',           'is_hidden'),
  ('column', '015 blocking', 'event',           'hidden_at'),
  ('column', '015 blocking', 'profiles',        'terms_accepted_at'),
  ('column', '015 blocking', 'profiles',        'terms_accepted_version'),
  ('column', '015 blocking', 'user_reports',    'review_status'),
  ('column', '015 blocking', 'user_reports',    'source'),
  ('column', '015 blocking', 'message_reports', 'review_status'),
  ('column', '015 blocking', 'message_reports', 'content_text')
),

expected_policies (grp, migration, tbl, pol) AS (VALUES
  ('policy', '015 enforcement', 'event',           'hide blocked and removed events'),
  ('policy', '015 enforcement', 'direct_chats',    'no dm threads between blocked users'),
  ('policy', '015 enforcement', 'direct_chats',    'no new dm threads between blocked users'),
  ('policy', '015 enforcement', 'direct_messages', 'no dms between blocked users'),
  ('policy', '015 enforcement', 'direct_messages', 'hide dms from blocked users'),
  ('policy', '015 enforcement', 'chat_messages',   'hide chat messages from blocked users'),
  ('policy', '015 enforcement', 'friendships',     'no friendships between blocked users'),
  ('policy', '015 enforcement', 'friendships',     'no new friendships between blocked users')
),

results AS (
  SELECT grp, migration, object_name AS object,
         CASE WHEN to_regclass('public.' || object_name) IS NULL
              THEN 'MISSING' ELSE 'ok' END AS status
    FROM expected_tables

  UNION ALL

  SELECT grp, migration, tbl || '.' || col,
         CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.columns c
            WHERE c.table_schema = 'public'
              AND c.table_name   = tbl
              AND c.column_name  = col
         ) THEN 'ok' ELSE 'MISSING' END
    FROM expected_columns

  UNION ALL

  SELECT grp, migration, tbl || ': ' || pol,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_policies p
            WHERE p.schemaname = 'public'
              AND p.tablename  = tbl
              AND p.policyname = pol
         ) THEN 'ok' ELSE 'MISSING' END
    FROM expected_policies
)

SELECT status, grp, migration, object
  FROM results
 ORDER BY (status = 'MISSING') DESC, grp, migration, object;
