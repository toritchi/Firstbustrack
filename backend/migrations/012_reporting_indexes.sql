CREATE INDEX IF NOT EXISTS trips_service_date_status_idx ON trips(service_date,status,created_at DESC);
CREATE INDEX IF NOT EXISTS trips_operator_date_idx ON trips(service_date,bus_id,driver_id);
CREATE INDEX IF NOT EXISTS telemetry_received_time_idx ON telemetry(received_at DESC);
CREATE INDEX IF NOT EXISTS occupancy_trip_time_idx ON occupancy_events(trip_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS payments_status_created_idx ON payments(status,created_at DESC);
CREATE INDEX IF NOT EXISTS ticket_validations_time_idx ON ticket_validations(validated_at DESC);
CREATE INDEX IF NOT EXISTS notifications_channel_status_idx ON notifications(channel,status,created_at DESC);
