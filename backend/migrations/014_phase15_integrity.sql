-- Phase 15: integration integrity and operational correctness.
-- Prevent more than one active payment for the same ticket, including concurrent requests.
CREATE UNIQUE INDEX IF NOT EXISTS payments_ticket_active_uidx
  ON payments(ticket_id) WHERE ticket_id IS NOT NULL AND status IN ('PENDING','PAID');

-- Fast lookup for the current trip used by public occupancy.
CREATE INDEX IF NOT EXISTS trips_bus_open_status_created_idx
  ON trips(bus_id,ended_at,status,created_at DESC);
