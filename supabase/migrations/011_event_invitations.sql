-- ============================================================
-- Friends-only (invite) events.
--
-- event.visibility: 'public' (anyone, shown in the feed) or
-- 'friends' (invite-only, hidden from the feed). For a friends-only
-- event the host invites specific friends, each of whom accepts or
-- rejects. Accepting also makes them an attendee (chat access, etc.).
-- ============================================================

ALTER TABLE event ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'friends'));

CREATE TABLE IF NOT EXISTS event_invitations (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id   UUID NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS idx_event_invitations_event   ON event_invitations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_invitations_invitee ON event_invitations(invitee_id);

ALTER TABLE event_invitations ENABLE ROW LEVEL SECURITY;

-- Host sees invitations for their events; invitee sees their own.
DROP POLICY IF EXISTS "read relevant invitations" ON event_invitations;
CREATE POLICY "read relevant invitations"
  ON event_invitations FOR SELECT TO authenticated
  USING (inviter_id = auth.uid() OR invitee_id = auth.uid());

-- Host invites people to their own events.
DROP POLICY IF EXISTS "host creates invitations" ON event_invitations;
CREATE POLICY "host creates invitations"
  ON event_invitations FOR INSERT TO authenticated
  WITH CHECK (
    inviter_id = auth.uid()
    AND EXISTS (SELECT 1 FROM event e WHERE e.id = event_invitations.event_id AND e.profile_id = auth.uid())
  );

-- Invitee responds (accept / reject) to their own invitation.
DROP POLICY IF EXISTS "invitee responds" ON event_invitations;
CREATE POLICY "invitee responds"
  ON event_invitations FOR UPDATE TO authenticated
  USING (invitee_id = auth.uid())
  WITH CHECK (invitee_id = auth.uid());

-- Host can withdraw an invitation.
DROP POLICY IF EXISTS "host deletes invitations" ON event_invitations;
CREATE POLICY "host deletes invitations"
  ON event_invitations FOR DELETE TO authenticated
  USING (inviter_id = auth.uid());

-- ── Tighten event visibility ──
-- Public events are visible to all signed-in users; friends-only events
-- only to the host and the people invited.
DROP POLICY IF EXISTS "authenticated can read events" ON event;
CREATE POLICY "authenticated can read events"
  ON event FOR SELECT TO authenticated
  USING (
    visibility = 'public'
    OR profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM event_invitations ei
      WHERE ei.event_id = event.id AND ei.invitee_id = auth.uid()
    )
  );
