CREATE INDEX IF NOT EXISTS trips_service_date_idx ON trips(service_date);
CREATE INDEX IF NOT EXISTS trips_bus_open_idx ON trips(bus_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS trips_driver_open_idx ON trips(driver_id) WHERE ended_at IS NULL;

-- At most one open trip per bus and driver. Historical trips remain untouched.
CREATE UNIQUE INDEX IF NOT EXISTS trips_one_open_per_bus_idx
  ON trips(bus_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS trips_one_open_per_driver_idx
  ON trips(driver_id) WHERE driver_id IS NOT NULL AND ended_at IS NULL;
