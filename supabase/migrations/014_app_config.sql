-- ============================================================
-- App version gate.
--
-- A single-row config the app reads on launch to decide whether to
-- prompt the user to update. Compare against the device's native
-- build number (Android versionCode / iOS buildNumber):
--   * build < min_build     → forced update (blocking)
--   * build < latest_build  → optional update (dismissible)
-- Bump latest_build (and min_build for forced updates) each release.
-- ============================================================

CREATE TABLE IF NOT EXISTS app_config (
  id            INT PRIMARY KEY DEFAULT 1,
  latest_build  INT  NOT NULL DEFAULT 1,
  min_build     INT  NOT NULL DEFAULT 1,
  android_url   TEXT NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=com.amirhormazahash.opencircle',
  ios_url       TEXT NOT NULL DEFAULT '',
  message       TEXT NOT NULL DEFAULT 'A new version of OpenCircle is available with the latest features and fixes.',
  CONSTRAINT app_config_single_row CHECK (id = 1)
);

INSERT INTO app_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Anyone (even signed out) can read the version gate.
DROP POLICY IF EXISTS "anyone reads app config" ON app_config;
CREATE POLICY "anyone reads app config"
  ON app_config FOR SELECT TO anon, authenticated
  USING (true);
