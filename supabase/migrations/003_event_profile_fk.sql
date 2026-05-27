-- Add foreign key from event.profile_id → profiles.id
-- This enables PostgREST relationship joins (profiles!profile_id) in future queries.
ALTER TABLE event
  ADD CONSTRAINT event_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;
