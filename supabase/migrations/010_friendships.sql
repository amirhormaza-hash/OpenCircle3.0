-- ============================================================
-- Friendships: friend requests and accepted friendships.
--
-- One row per relationship. The requester sends (status 'pending');
-- the addressee accepts (status 'accepted'). Either party can delete
-- the row to cancel a request or unfriend.
-- ============================================================

CREATE TABLE IF NOT EXISTS friendships (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT friendship_not_self CHECK (requester_id <> addressee_id),
  UNIQUE (requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Read rows you are part of (either side).
DROP POLICY IF EXISTS "read own friendships" ON friendships;
CREATE POLICY "read own friendships"
  ON friendships FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Send a request as yourself.
DROP POLICY IF EXISTS "send friend request" ON friendships;
CREATE POLICY "send friend request"
  ON friendships FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- The addressee accepts (or otherwise updates) a request sent to them.
DROP POLICY IF EXISTS "addressee updates request" ON friendships;
CREATE POLICY "addressee updates request"
  ON friendships FOR UPDATE TO authenticated
  USING (addressee_id = auth.uid())
  WITH CHECK (addressee_id = auth.uid());

-- Either party can delete: cancel a pending request, or unfriend.
DROP POLICY IF EXISTS "delete own friendship" ON friendships;
CREATE POLICY "delete own friendship"
  ON friendships FOR DELETE TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());
