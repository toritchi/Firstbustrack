ALTER TABLE service_alerts ADD COLUMN IF NOT EXISTS bus_id uuid REFERENCES buses(id);
ALTER TABLE service_alerts ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES admin_users(id);
ALTER TABLE service_alerts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT true,
  whatsapp_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  service_alerts_enabled boolean NOT NULL DEFAULT true,
  promotional_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  provider text,
  provider_reference text,
  attempt_no int NOT NULL DEFAULT 1 CHECK(attempt_no > 0),
  status text NOT NULL CHECK(status IN ('QUEUED','SENT','FAILED')) DEFAULT 'QUEUED',
  error_message text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_user_created_idx ON notifications(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS notification_status_created_idx ON notifications(status,created_at DESC);
CREATE INDEX IF NOT EXISTS service_alert_active_window_idx ON service_alerts(active,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS service_alert_route_idx ON service_alerts(route_id,starts_at DESC);
CREATE INDEX IF NOT EXISTS service_alert_bus_idx ON service_alerts(bus_id,starts_at DESC);
