CREATE OR REPLACE FUNCTION set_stop_geom() RETURNS trigger AS $$
BEGIN
  NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude::double precision, NEW.latitude::double precision), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stops_set_geom ON stops;
CREATE TRIGGER stops_set_geom BEFORE INSERT OR UPDATE OF latitude, longitude ON stops
FOR EACH ROW EXECUTE FUNCTION set_stop_geom();

CREATE INDEX IF NOT EXISTS operators_city_idx ON operators(city_id);
CREATE INDEX IF NOT EXISTS routes_operator_idx ON routes(operator_id);
CREATE INDEX IF NOT EXISTS routes_city_idx ON routes(city_id);
CREATE INDEX IF NOT EXISTS route_directions_route_idx ON route_directions(route_id);
CREATE INDEX IF NOT EXISTS route_stops_stop_idx ON route_stops(stop_id);
