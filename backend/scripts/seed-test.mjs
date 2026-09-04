import bcrypt from 'bcryptjs';
import { query, pool } from '../src/database/db.js';

const adminPassword = process.env.TEST_ADMIN_PASSWORD || 'TestAdminPassword-2026!';
const validatorKey = process.env.TEST_VALIDATOR_KEY || 'TestValidatorKey-2026-0123456789-abcdef';
const ids = {
  wilaya:'00000000-0000-4000-8000-000000000001', city:'00000000-0000-4000-8000-000000000002', operator:'00000000-0000-4000-8000-000000000003',
  route:'00000000-0000-4000-8000-000000000004', direction:'00000000-0000-4000-8000-000000000005', stop1:'00000000-0000-4000-8000-000000000006', stop2:'00000000-0000-4000-8000-000000000007',
  bus:'00000000-0000-4000-8000-000000000008', device:'00000000-0000-4000-8000-000000000009', driver:'00000000-0000-4000-8000-000000000010', trip:'00000000-0000-4000-8000-000000000011',
  offer:'00000000-0000-4000-8000-000000000012', admin:'00000000-0000-4000-8000-000000000013'
};
const hash = await bcrypt.hash(adminPassword, 12);
const validatorHash = await bcrypt.hash(validatorKey, 12);
await query(`INSERT INTO wilayas(id,name,code) VALUES($1,'Test Wilaya','99') ON CONFLICT(id) DO NOTHING`,[ids.wilaya]);
await query(`INSERT INTO cities(id,wilaya_id,name) VALUES($1,$2,'Test City') ON CONFLICT(id) DO NOTHING`,[ids.city,ids.wilaya]);
await query(`INSERT INTO operators(id,city_id,name) VALUES($1,$2,'Test Operator') ON CONFLICT(id) DO NOTHING`,[ids.operator,ids.city]);
await query(`INSERT INTO routes(id,operator_id,city_id,line_number,name) VALUES($1,$2,$3,'T01','Test Route') ON CONFLICT(id) DO NOTHING`,[ids.route,ids.operator,ids.city]);
await query(`INSERT INTO route_directions(id,route_id,code,origin_name,destination_name) VALUES($1,$2,'A_TO_B','Stop A','Stop B') ON CONFLICT(id) DO NOTHING`,[ids.direction,ids.route]);
await query(`INSERT INTO stops(id,city_id,name,latitude,longitude) VALUES($1,$2,'Stop A',36.700000,3.170000),($3,$2,'Stop B',36.705000,3.180000) ON CONFLICT(id) DO NOTHING`,[ids.stop1,ids.city,ids.stop2]);
await query(`INSERT INTO route_stops(direction_id,stop_id,stop_sequence) VALUES($1,$2,1),($1,$3,2) ON CONFLICT(direction_id,stop_sequence) DO NOTHING`,[ids.direction,ids.stop1,ids.stop2]);
await query(`INSERT INTO buses(id,operator_id,bus_number,capacity,status,active) VALUES($1,$2,'TEST-01',50,'READY',true) ON CONFLICT(id) DO NOTHING`,[ids.bus,ids.operator]);
await query(`INSERT INTO devices(id,bus_id,device_identifier,sim_operator,active,validator_key_hash) VALUES($1,$2,'TEST-DEVICE-01','DJEZZY',true,$3) ON CONFLICT(id) DO UPDATE SET validator_key_hash=EXCLUDED.validator_key_hash,active=true`,[ids.device,ids.bus,validatorHash]);
await query(`INSERT INTO drivers(id,operator_id,driver_number,first_name,last_name,active) VALUES($1,$2,'TEST-DRV-01','Test','Driver',true) ON CONFLICT(id) DO NOTHING`,[ids.driver,ids.operator]);
await query(`INSERT INTO trips(id,route_direction_id,bus_id,driver_id,service_date,status) VALUES($1,$2,$3,$4,current_date,'READY') ON CONFLICT(id) DO NOTHING`,[ids.trip,ids.direction,ids.bus,ids.driver]);
await query(`INSERT INTO ticket_offers(id,name,ticket_type,price_dzd,rules,valid_from,valid_until,active) VALUES($1,'E2E Single','SINGLE',100,'{}',now()-interval '1 day',now()+interval '30 days',true) ON CONFLICT(id) DO UPDATE SET price_dzd=100,active=true,valid_from=now()-interval '1 day',valid_until=now()+interval '30 days'`,[ids.offer]);
await query(`INSERT INTO admin_users(id,username,password_hash,role,active) VALUES($1,'e2e-admin',$2,'SUPER_ADMIN',true) ON CONFLICT(id) DO UPDATE SET password_hash=EXCLUDED.password_hash,active=true`,[ids.admin,hash]);
console.log(JSON.stringify({ids,adminUsername:'e2e-admin',adminPassword,validatorKey},null,2));
await pool.end();
