ALTER TABLE payments ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES tickets(id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_ticket_uidx ON payments(ticket_id) WHERE ticket_id IS NOT NULL;
