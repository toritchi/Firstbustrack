import { z } from 'zod';
import { query } from '../../database/db.js';
import { ok } from '../../utils/response.js';

const dateSchema=z.object({
  from:z.string().date().optional(),
  to:z.string().date().optional()
}).strict();

function range(req){
  const p=dateSchema.parse({from:req.query.from,to:req.query.to});
  const from=p.from || new Date(Date.now()-7*86400000).toISOString().slice(0,10);
  const to=p.to || new Date().toISOString().slice(0,10);
  if(from>to){const e=new Error('from must be on or before to');e.status=400;e.code='INVALID_DATE_RANGE';throw e;}
  return {from,to};
}

export async function overview(req,res){
  const r=await query(`SELECT
    (SELECT count(*) FROM buses WHERE active=true) active_buses,
    (SELECT count(*) FROM buses WHERE active=true AND status='IN_TRIP') buses_in_trip,
    (SELECT count(*) FROM buses WHERE active=true AND status='OUT_OF_SERVICE') buses_out_of_service,
    (SELECT count(*) FROM devices WHERE active=true) active_devices,
    (SELECT count(*) FROM drivers WHERE active=true) active_drivers,
    (SELECT count(*) FROM routes WHERE active=true) active_routes,
    (SELECT count(*) FROM stops WHERE active=true) active_stops,
    (SELECT count(*) FROM users) registered_users,
    (SELECT count(*) FROM trips WHERE service_date=CURRENT_DATE) today_trips,
    (SELECT count(*) FROM trips WHERE service_date=CURRENT_DATE AND ended_at IS NULL) open_trips,
    (SELECT count(*) FROM service_alerts WHERE active=true AND starts_at<=now() AND (ends_at IS NULL OR ends_at>=now())) active_alerts,
    (SELECT count(*) FROM operational_alerts WHERE status IN ('OPEN','ACKNOWLEDGED')) operational_alerts,
    (SELECT count(*) FROM operational_alerts WHERE status IN ('OPEN','ACKNOWLEDGED') AND severity='CRITICAL') critical_operational_alerts,
    (SELECT count(*) FROM tickets WHERE status='ACTIVE' AND valid_until>=now()) active_tickets`);
  const x=r.rows[0];
  ok(res,{activeBuses:Number(x.active_buses),busesInTrip:Number(x.buses_in_trip),busesOutOfService:Number(x.buses_out_of_service),activeDevices:Number(x.active_devices),activeDrivers:Number(x.active_drivers),activeRoutes:Number(x.active_routes),activeStops:Number(x.active_stops),registeredUsers:Number(x.registered_users),todayTrips:Number(x.today_trips),openTrips:Number(x.open_trips),activeAlerts:Number(x.active_alerts),operationalAlerts:Number(x.operational_alerts),criticalOperationalAlerts:Number(x.critical_operational_alerts),activeTickets:Number(x.active_tickets)});
}

export async function operations(req,res){
  const r=await query(`SELECT b.id,b.bus_number,b.capacity,b.status,b.operator_id,
    t.id trip_id,t.service_date,t.driver_id,t.route_direction_id,t.started_at,
    l.latitude,l.longitude,l.speed_kph,l.heading,l.gps_timestamp,l.received_at,
    COALESCE((SELECT count(*) FROM occupancy_events oe WHERE oe.trip_id=t.id AND oe.event_type='BOARD'),0) boardings,
    COALESCE((SELECT count(*) FROM occupancy_events oe WHERE oe.trip_id=t.id AND oe.event_type='EXIT'),0) exits
    FROM buses b
    LEFT JOIN LATERAL (SELECT t.* FROM trips t WHERE t.bus_id=b.id AND t.ended_at IS NULL ORDER BY t.created_at DESC LIMIT 1) t ON true
    LEFT JOIN LATERAL (SELECT te.* FROM telemetry te WHERE te.bus_id=b.id ORDER BY te.gps_timestamp DESC LIMIT 1) l ON true
    WHERE b.active=true ORDER BY b.bus_number`);
  ok(res,r.rows.map(x=>({...x,busNumber:x.bus_number,capacity:Number(x.capacity),boardings:Number(x.boardings),exits:Number(x.exits),operatorId:x.operator_id,tripId:x.trip_id,driverId:x.driver_id,routeDirectionId:x.route_direction_id,startedAt:x.started_at,latitude:x.latitude?Number(x.latitude):null,longitude:x.longitude?Number(x.longitude):null,speedKph:x.speed_kph?Number(x.speed_kph):null,heading:x.heading?Number(x.heading):null,gpsTimestamp:x.gps_timestamp,receivedAt:x.received_at})));
}

export async function tripsReport(req,res){
  const {from,to}=range(req);
  const r=await query(`SELECT service_date,status,count(*)::int trip_count,
    count(*) FILTER (WHERE started_at IS NOT NULL)::int started_count,
    count(*) FILTER (WHERE ended_at IS NOT NULL)::int completed_count,
    round(avg(EXTRACT(EPOCH FROM (ended_at-started_at))/60) FILTER (WHERE started_at IS NOT NULL AND ended_at IS NOT NULL),2) avg_duration_minutes
    FROM trips WHERE service_date BETWEEN $1 AND $2 GROUP BY service_date,status ORDER BY service_date,status`,[from,to]);
  ok(res,{from,to,rows:r.rows.map(x=>({serviceDate:x.service_date,status:x.status,tripCount:x.trip_count,startedCount:x.started_count,completedCount:x.completed_count,avgDurationMinutes:x.avg_duration_minutes?Number(x.avg_duration_minutes):null}))});
}

export async function occupancyReport(req,res){
  const {from,to}=range(req);
  const r=await query(`SELECT DATE(occurred_at) service_date,event_type,count(*)::int event_count,
    count(DISTINCT user_id)::int unique_users,count(DISTINCT bus_id)::int buses
    FROM occupancy_events WHERE occurred_at >= $1::date AND occurred_at < ($2::date + INTERVAL '1 day')
    GROUP BY DATE(occurred_at),event_type ORDER BY service_date,event_type`,[from,to]);
  ok(res,{from,to,rows:r.rows.map(x=>({serviceDate:x.service_date,eventType:x.event_type,eventCount:x.event_count,uniqueUsers:x.unique_users,buses:x.buses}))});
}

export async function ticketingReport(req,res){
  const {from,to}=range(req);
  const r=await query(`SELECT DATE(p.created_at) report_date,p.status,count(*)::int payment_count,COALESCE(sum(p.amount_dzd),0)::numeric(14,2) amount_dzd
    FROM payments p WHERE p.created_at >= $1::date AND p.created_at < ($2::date + INTERVAL '1 day') GROUP BY DATE(p.created_at),p.status ORDER BY report_date,p.status`,[from,to]);
  const v=await query(`SELECT DATE(validated_at) report_date,validation_type,count(*)::int validation_count FROM ticket_validations WHERE validated_at >= $1::date AND validated_at < ($2::date + INTERVAL '1 day') GROUP BY DATE(validated_at),validation_type ORDER BY report_date,validation_type`,[from,to]);
  ok(res,{from,to,payments:r.rows.map(x=>({date:x.report_date,status:x.status,count:x.payment_count,amountDzd:Number(x.amount_dzd)})),validations:v.rows.map(x=>({date:x.report_date,type:x.validation_type,count:x.validation_count}))});
}

export async function notificationsReport(req,res){
  const {from,to}=range(req);
  const r=await query(`SELECT DATE(n.created_at) report_date,n.channel,n.status,count(*)::int count FROM notifications n WHERE n.created_at >= $1::date AND n.created_at < ($2::date + INTERVAL '1 day') GROUP BY DATE(n.created_at),n.channel,n.status ORDER BY report_date,n.channel,n.status`,[from,to]);
  ok(res,{from,to,rows:r.rows.map(x=>({date:x.report_date,channel:x.channel,status:x.status,count:x.count}))});
}
