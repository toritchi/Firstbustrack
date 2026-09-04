CREATE TABLE IF NOT EXISTS otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('REGISTER','LOGIN','ADD_PHONE')),
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_phone_created_idx ON otp_challenges(phone_e164,created_at DESC);
CREATE INDEX IF NOT EXISTS otp_expiry_idx ON otp_challenges(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS user_phone_verified_unique_idx ON user_phones(phone_e164) WHERE verified_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS occupancy_trip_time_idx ON occupancy_events(trip_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS occupancy_user_time_idx ON occupancy_events(user_id,occurred_at DESC);
