import { z } from 'zod';
import { query } from '../../database/db.js';

const telemetrySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(10000).nullable().optional(),
  speedKph: z.number().min(0).max(300).nullable().optional(),
  heading: z.number().min(0).max(360).nullable().optional(),
  gpsTimestamp: z.string().datetime({ offset: true }),
  deviceTimestamp: z.string().datetime({ offset: true }),
  passengerCount: z.number().int().min(0).nullable().optional(),
  odometerKm: z.number().min(0).nullable().optional()
});

export function validateTelemetry(payload) {
  return telemetrySchema.parse(payload);
}

export async function resolveDevice(deviceIdentifier) {
  const r = await query(`SELECT d.id device_id,d.bus_id,b.operator_id,b.status,b.capacity
    FROM devices d JOIN buses b ON b.id=d.bus_id
    WHERE d.device_identifier=$1 AND d.active=true`, [deviceIdentifier]);
  if (!r.rowCount) { const e=new Error('Unknown or inactive device'); e.statusCode=401; e.code='DEVICE_NOT_AUTHORIZED'; throw e; }
  return r.rows[0];
}

export async function persistTelemetry(device, data) {
  const trip = await query(`SELECT t.id,t.driver_id,t.status
    FROM trips t WHERE t.bus_id=$1 AND t.ended_at IS NULL ORDER BY t.created_at DESC LIMIT 1`, [device.bus_id]);
  const tripRow=trip.rows[0] || null;
  const r=await query(`INSERT INTO telemetry
    (device_id,bus_id,trip_id,driver_id,latitude,longitude,accuracy_m,speed_kph,heading,gps_timestamp,device_timestamp,passenger_count,odometer_km)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,received_at`,
    [device.device_id,device.bus_id,tripRow?.id||null,tripRow?.driver_id||null,data.latitude,data.longitude,
      data.accuracyM??null,data.speedKph??null,data.heading??null,data.gpsTimestamp,data.deviceTimestamp,
      data.passengerCount??null,data.odometerKm??null]);
  return { ...data, telemetryId:r.rows[0].id, receivedAt:r.rows[0].received_at, busId:device.bus_id, tripId:tripRow?.id||null, driverId:tripRow?.driver_id||null };
}

export async function listLiveBuses(req,res) {
  const r=await query(`SELECT DISTINCT ON (t.bus_id) t.bus_id,t.trip_id,t.driver_id,t.latitude,t.longitude,
    t.accuracy_m,t.speed_kph,t.heading,t.gps_timestamp,t.device_timestamp,t.passenger_count,t.odometer_km,t.received_at,
    b.bus_number,b.capacity,b.status
    FROM telemetry t JOIN buses b ON b.id=t.bus_id
    ORDER BY t.bus_id,t.gps_timestamp DESC`);
  res.json({success:true,data:r.rows});
}

export async function getBusLive(req,res) {
  const r=await query(`SELECT t.bus_id,t.trip_id,t.driver_id,t.latitude,t.longitude,t.accuracy_m,t.speed_kph,t.heading,
    t.gps_timestamp,t.device_timestamp,t.passenger_count,t.odometer_km,t.received_at,b.bus_number,b.capacity,b.status
    FROM telemetry t JOIN buses b ON b.id=t.bus_id
    WHERE t.bus_id=$1 ORDER BY t.gps_timestamp DESC LIMIT 1`,[req.params.id]);
  if(!r.rowCount){ const e=new Error('No telemetry available for bus'); e.statusCode=404; e.code='NO_LIVE_POSITION'; throw e; }
  res.json({success:true,data:r.rows[0]});
}

export async function listBusTelemetry(req,res) {
  const limit=Math.min(Number(req.query.limit||100),1000);
  const r=await query(`SELECT id,latitude,longitude,accuracy_m,speed_kph,heading,gps_timestamp,device_timestamp,
    passenger_count,odometer_km,received_at,trip_id,driver_id FROM telemetry WHERE bus_id=$1
    ORDER BY gps_timestamp DESC LIMIT $2`,[req.params.id,limit]);
  res.json({success:true,data:r.rows});
}
