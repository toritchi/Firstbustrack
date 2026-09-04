ALTER TABLE devices ADD COLUMN IF NOT EXISTS validator_key_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS devices_validator_key_hash_uidx ON devices(validator_key_hash) WHERE validator_key_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS tickets_user_status_idx ON tickets(user_id,status,valid_until DESC);
CREATE INDEX IF NOT EXISTS tickets_validity_idx ON tickets(status,valid_from,valid_until);
CREATE INDEX IF NOT EXISTS ticket_validations_ticket_time_idx ON ticket_validations(ticket_id,validated_at DESC);
