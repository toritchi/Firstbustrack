CREATE INDEX IF NOT EXISTS routes_active_city_idx ON routes(city_id,active,line_number);
CREATE INDEX IF NOT EXISTS route_stops_direction_sequence_idx ON route_stops(direction_id,stop_sequence);
CREATE INDEX IF NOT EXISTS telemetry_live_bus_time_idx ON telemetry(bus_id,gps_timestamp DESC);
CREATE INDEX IF NOT EXISTS trips_active_bus_idx ON trips(bus_id,ended_at,status);
