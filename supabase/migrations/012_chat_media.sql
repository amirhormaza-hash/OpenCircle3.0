-- ============================================================
-- Chat media: photos, videos, and GIFs in event chats and DMs.
--
-- Photos/videos are uploaded to the 'chat-media' storage bucket and
-- referenced by media_url. GIFs come from Tenor and store the remote
-- URL directly (no upload). media_type is 'image' | 'video' | 'gif'.
-- Text (messages / content) becomes optional when media is present.
-- ============================================================

ALTER TABLE chat_messages   ADD COLUMN IF NOT EXISTS media_url  TEXT;
ALTER TABLE chat_messages   ADD COLUMN IF NOT EXISTS media_type TEXT
  CHECK (media_type IS NULL OR media_type IN ('image', 'video', 'gif'));

ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS media_url  TEXT;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS media_type TEXT
  CHECK (media_type IS NULL OR media_type IN ('image', 'video', 'gif'));

-- Text column on chat_messages is NOT NULL in some schemas; allow empty
-- string for media-only messages (the app sends '' when media is set).

-- ── Storage bucket for uploaded chat media ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone signed in can view chat media (bucket is public for reads).
DROP POLICY IF EXISTS "chat media readable" ON storage.objects;
CREATE POLICY "chat media readable"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-media');

-- Users upload into their own folder: chat-media/<uid>/...
DROP POLICY IF EXISTS "chat media upload own" ON storage.objects;
CREATE POLICY "chat media upload own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "chat media delete own" ON storage.objects;
CREATE POLICY "chat media delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
