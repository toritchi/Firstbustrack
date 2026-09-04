CREATE TABLE IF NOT EXISTS eta_travel_observations (
  id bigserial PRIMARY KEY,
  route_direction_id uuid NOT NULL REFERENCES route_directions(id) ON DELETE CASCADE,
  from_stop_id uuid NOT NULL REFERENCES stops(id),
  to_stop_id uuid NOT NULL REFERENCES stops(id),
  observed_seconds int NOT NULL CHECK(observed_seconds > 0),
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eta_obs_pair_time_idx ON eta_travel_observations(route_direction_id,from_stop_id,to_stop_id,observed_at DESC);
CREATE INDEX IF NOT EXISTS eta_obs_time_idx ON eta_travel_observations(observed_at DESC);
