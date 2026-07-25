-- Direct 1-to-1 messaging between users.
-- user1_id is always the lexicographically smaller UUID to enforce a canonical
-- row order and prevent duplicate (A,B) / (B,A) pairs.

CREATE TABLE IF NOT EXISTS direct_chats (
  id       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT dm_user_order CHECK (user1_id < user2_id),
  UNIQUE(user1_id, user2_id)
);

CREATE TABLE IF NOT EXISTS direct_messages (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id    UUID NOT NULL REFERENCES direct_chats(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    TEXT NOT NULL CHECK (char_length(content) <= 2000),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_direct_chats_user1 ON direct_chats(user1_id);
CREATE INDEX IF NOT EXISTS idx_direct_chats_user2 ON direct_chats(user2_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_chat ON direct_messages(chat_id, created_at);

-- RLS
ALTER TABLE direct_chats    ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants can read their chats"
  ON direct_chats FOR SELECT
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "participants can create a chat they belong to"
  ON direct_chats FOR INSERT
  WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "participants can read messages in their chats"
  ON direct_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM direct_chats dc
      WHERE dc.id = chat_id
        AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
    )
  );

CREATE POLICY "sender can insert their own messages"
  ON direct_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM direct_chats dc
      WHERE dc.id = chat_id
        AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
    )
  );
