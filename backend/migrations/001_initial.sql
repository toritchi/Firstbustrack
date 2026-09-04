CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE admin_role AS ENUM ('SUPER_ADMIN','OPERATIONS_ADMIN','TICKETING_ADMIN','CUSTOMER_SERVICE_ADMIN','DATA_REPORTING_ADMIN','NOTIFICATION_ADMIN','MARKETING_ADMIN');
CREATE TYPE bus_status AS ENUM ('OFFLINE','AVAILABLE','READY','IN_TRIP','AT_STOP','AT_TERMINAL','RETURNING','OUT_OF_SERVICE','EMERGENCY','GPS_ERROR');
CREATE TYPE direction_code AS ENUM ('A_TO_B','B_TO_A');

CREATE TABLE wilayas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, code text UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), wilaya_id uuid NOT NULL REFERENCES wilayas(id), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(wilaya_id,name)
);
CREATE TABLE operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), city_id uuid REFERENCES cities(id), name text NOT NULL, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operator_id uuid REFERENCES operators(id), city_id uuid NOT NULL REFERENCES cities(id), line_number text NOT NULL, name text, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(city_id,line_number)
);
CREATE TABLE route_directions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), route_id uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE, code direction_code NOT NULL, origin_name text NOT NULL, destination_name text NOT NULL, UNIQUE(route_id,code)
);
CREATE TABLE stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), city_id uuid NOT NULL REFERENCES cities(id), name text NOT NULL, latitude numeric(9,6) NOT NULL CHECK(latitude BETWEEN -90 AND 90), longitude numeric(9,6) NOT NULL CHECK(longitude BETWEEN -180 AND 180), geom geography(Point,4326), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stops_geom_gix ON stops USING gist(geom);
CREATE TABLE route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), direction_id uuid NOT NULL REFERENCES route_directions(id) ON DELETE CASCADE, stop_id uuid NOT NULL REFERENCES stops(id), stop_sequence int NOT NULL CHECK(stop_sequence>0), UNIQUE(direction_id,stop_sequence), UNIQUE(direction_id,stop_id)
);
CREATE TABLE buses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operator_id uuid REFERENCES operators(id), bus_number text NOT NULL, capacity int NOT NULL CHECK(capacity>0), status bus_status NOT NULL DEFAULT 'OFFLINE', active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(operator_id,bus_number)
);
CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bus_id uuid UNIQUE REFERENCES buses(id), device_identifier text NOT NULL UNIQUE, sim_operator text NOT NULL CHECK(sim_operator IN ('DJEZZY','MOBILIS')), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operator_id uuid REFERENCES operators(id), driver_number text NOT NULL, first_name text NOT NULL, last_name text NOT NULL, active boolean NOT NULL DEFAULT true, UNIQUE(operator_id,driver_number)
);
CREATE TABLE trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), route_direction_id uuid NOT NULL REFERENCES route_directions(id), bus_id uuid NOT NULL REFERENCES buses(id), driver_id uuid REFERENCES drivers(id), service_date date NOT NULL, started_at timestamptz, ended_at timestamptz, status bus_status NOT NULL DEFAULT 'AVAILABLE', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(bus_id,service_date,started_at)
);
CREATE TABLE telemetry (
  id bigserial PRIMARY KEY, device_id uuid NOT NULL REFERENCES devices(id), bus_id uuid NOT NULL REFERENCES buses(id), trip_id uuid REFERENCES trips(id), driver_id uuid REFERENCES drivers(id), latitude numeric(9,6) NOT NULL CHECK(latitude BETWEEN -90 AND 90), longitude numeric(9,6) NOT NULL CHECK(longitude BETWEEN -180 AND 180), accuracy_m numeric(8,2), speed_kph numeric(7,2), heading numeric(6,2), gps_timestamp timestamptz NOT NULL, device_timestamp timestamptz NOT NULL, passenger_count int CHECK(passenger_count>=0), odometer_km numeric(12,2), received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telemetry_bus_time_idx ON telemetry(bus_id,gps_timestamp DESC);
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), first_name text NOT NULL, last_name text NOT NULL, email text, date_of_birth date, national_id text, student_info jsonb, company_info jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE user_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, phone_e164 text NOT NULL UNIQUE, verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text NOT NULL UNIQUE, password_hash text NOT NULL, role admin_role NOT NULL, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_log (
  id bigserial PRIMARY KEY, actor_admin_id uuid REFERENCES admin_users(id), action text NOT NULL, entity_type text NOT NULL, entity_id uuid, before_data jsonb, after_data jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log(created_at DESC);

CREATE TABLE ticket_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, ticket_type text NOT NULL CHECK(ticket_type IN ('SINGLE','RETURN','DAILY','WEEKLY','MONTHLY','STUDENT','EMPLOYEE')), price_dzd numeric(12,2) NOT NULL CHECK(price_dzd>=0), rules jsonb NOT NULL DEFAULT '{}'::jsonb, valid_from timestamptz NOT NULL, valid_until timestamptz, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), offer_id uuid NOT NULL REFERENCES ticket_offers(id), qr_token_hash text NOT NULL UNIQUE, purchased_at timestamptz NOT NULL DEFAULT now(), valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL, status text NOT NULL CHECK(status IN ('ACTIVE','USED','EXPIRED','REFUNDED','CANCELLED')) DEFAULT 'ACTIVE'
);
CREATE TABLE ticket_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid NOT NULL REFERENCES tickets(id), bus_id uuid REFERENCES buses(id), trip_id uuid REFERENCES trips(id), validation_type text NOT NULL CHECK(validation_type IN ('BOARD','EXIT')), validated_at timestamptz NOT NULL DEFAULT now(), offline_event_id text UNIQUE, synced_at timestamptz
);
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid REFERENCES tickets(id), user_id uuid NOT NULL REFERENCES users(id), provider text NOT NULL, provider_reference text, amount_dzd numeric(12,2) NOT NULL CHECK(amount_dzd>=0), status text NOT NULL CHECK(status IN ('PENDING','PAID','FAILED','REFUNDED','PARTIALLY_REFUNDED')) DEFAULT 'PENDING', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL REFERENCES payments(id), user_id uuid NOT NULL REFERENCES users(id), requested_amount_dzd numeric(12,2) NOT NULL CHECK(requested_amount_dzd>0), approved_amount_dzd numeric(12,2), status text NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED','PROCESSED')) DEFAULT 'PENDING', reason text, reviewed_by uuid REFERENCES admin_users(id), created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
);
CREATE TABLE occupancy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), bus_id uuid NOT NULL REFERENCES buses(id), trip_id uuid REFERENCES trips(id), event_type text NOT NULL CHECK(event_type IN ('BOARD','EXIT')), occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX occupancy_bus_time_idx ON occupancy_events(bus_id,occurred_at DESC);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id), channel text NOT NULL CHECK(channel IN ('PUSH','SMS','WHATSAPP','EMAIL')), title text NOT NULL, body text NOT NULL, sent_at timestamptz, status text NOT NULL DEFAULT 'PENDING', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE service_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), route_id uuid REFERENCES routes(id), title text NOT NULL, message text NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE passenger_journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id) ON DELETE SET NULL, origin_stop_id uuid REFERENCES stops(id), destination_stop_id uuid REFERENCES stops(id), started_at timestamptz NOT NULL, ended_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX passenger_journeys_created_idx ON passenger_journeys(created_at);
