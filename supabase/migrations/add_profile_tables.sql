-- Reputation tags given by other users after shared events
CREATE TABLE IF NOT EXISTS user_ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rater_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  rated_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID REFERENCES event(id) ON DELETE CASCADE,
  tags TEXT[] NOT NULL,
  score NUMERIC(2,1) CHECK (score >= 1 AND score <= 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(rater_id, rated_id, event_id)
);

-- Badges earned by each user
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT now(),
  seen BOOLEAN DEFAULT false,
  UNIQUE(user_id, badge_key)
);

-- Weekly attendance streaks
CREATE TABLE IF NOT EXISTS user_streaks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_attended_week DATE,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Extended profile columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trust_score NUMERIC(2,1) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location TEXT;
