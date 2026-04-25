-- Tracks unique devices per user (browser + OS + partial IP fingerprint)
CREATE TABLE IF NOT EXISTS user_devices (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_hash  TEXT NOT NULL,
  browser      TEXT,
  os           TEXT,
  device_type  TEXT, -- 'mobile' | 'tablet' | 'desktop'
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, device_hash)
);
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);

-- Stores every login event (kept to last 50 per user via trigger)
CREATE TABLE IF NOT EXISTS login_history (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id    UUID REFERENCES user_devices(id) ON DELETE SET NULL,
  device_hash  TEXT,
  ip_address   TEXT,
  country      TEXT,
  city         TEXT,
  browser      TEXT,
  os           TEXT,
  device_type  TEXT,
  is_new_device BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_created ON login_history(user_id, created_at DESC);

-- Auto-prune: keep only the 50 most recent entries per user
CREATE OR REPLACE FUNCTION prune_login_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM login_history
  WHERE user_id = NEW.user_id
    AND id NOT IN (
      SELECT id FROM login_history
      WHERE user_id = NEW.user_id
      ORDER BY created_at DESC
      LIMIT 50
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prune_login_history ON login_history;
CREATE TRIGGER trg_prune_login_history
AFTER INSERT ON login_history
FOR EACH ROW EXECUTE FUNCTION prune_login_history();

-- RLS: users read their own data; backend uses service role to write
ALTER TABLE user_devices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_devices_select"
  ON user_devices FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "login_history_select"
  ON login_history FOR SELECT USING (user_id = auth.uid());
