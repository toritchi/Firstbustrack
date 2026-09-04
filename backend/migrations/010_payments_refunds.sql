CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(provider, provider_event_id)
);
CREATE INDEX IF NOT EXISTS payments_user_created_idx ON payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS refund_requests_user_created_idx ON refund_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS refund_requests_status_idx ON refund_requests(status, created_at DESC);
