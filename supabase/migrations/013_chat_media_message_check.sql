-- ============================================================
-- Allow media-only chat messages.
--
-- The original chat_messages table has a CHECK constraint
-- (chat_messages_message_check) requiring a non-empty `messages`
-- text. Media messages send empty text with the image/video/gif in
-- media_url, which violated it (Postgres error 23514). Replace the
-- constraint so a message is valid when it has text OR media.
-- ============================================================

ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_message_check;

ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_message_check
  CHECK (
    char_length(coalesce(messages, '')) > 0
    OR media_url IS NOT NULL
  );
