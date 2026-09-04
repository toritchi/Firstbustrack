CREATE TABLE IF NOT EXISTS operational_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id UUID REFERENCES buses(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  type VARCHAR(40) NOT NULL,
  severity VARCHAR(12) NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES admin_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS operational_alerts_open_idx ON operational_alerts(status,severity,detected_at DESC);
CREATE INDEX IF NOT EXISTS operational_alerts_bus_idx ON operational_alerts(bus_id,status,detected_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS operational_alerts_bus_type_open_idx ON operational_alerts(bus_id,type) WHERE status <> 'RESOLVED';
