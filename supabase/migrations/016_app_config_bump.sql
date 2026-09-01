-- ============================================================
-- Version gate bump for the 1.0.1 resubmission.
--
-- 1.0.1 is the App Store Guideline 1.2 compliance release: blocking,
-- reporting, content filtering, and the EULA gate (migration 015).
--
-- min_build is deliberately left alone. Raising it would lock existing
-- users out until they update; the moderation rules are enforced by RLS
-- and the block_user RPC, so older builds are already covered server-side.
--
-- Set ios_url once the App Store listing is live, so the update prompt
-- sends iOS users to the right place instead of falling back to Play.
-- ============================================================

UPDATE app_config
   SET latest_build = 3,
       message = 'OpenCircle 1.0.1 adds user blocking, in-app reporting, and stronger content moderation.'
 WHERE id = 1;
