-- Phase 4 fleet integrity constraints and indexes.
CREATE INDEX IF NOT EXISTS buses_operator_idx ON buses(operator_id);
CREATE INDEX IF NOT EXISTS buses_status_idx ON buses(status);
CREATE INDEX IF NOT EXISTS devices_active_idx ON devices(active);
CREATE INDEX IF NOT EXISTS drivers_operator_idx ON drivers(operator_id);

-- A device may only be attached to an active bus when the device itself is active.
-- This is enforced at application level because PostgreSQL CHECK constraints cannot
-- safely inspect another table.
