-- message_reports: stores flags raised against individual chat messages.
-- message_id is stored as text (not FK) because it can reference
-- either chat_messages or direct_messages depending on context.
CREATE TABLE IF NOT EXISTS message_reports (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_id  text NOT NULL,
  context     text NOT NULL CHECK (context IN ('event_chat', 'dm')),
  reason      text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- user_reports: stores flags raised against users (from group chat or DMs).
-- event_id is nullable — set when the report originates from an event.
CREATE TABLE IF NOT EXISTS user_reports (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id    uuid REFERENCES event(id) ON DELETE SET NULL,
  reason      text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- RLS: reporters can only insert their own reports; no SELECT needed by the app
ALTER TABLE message_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reports    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insert own message reports" ON message_reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "insert own user reports" ON user_reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());
