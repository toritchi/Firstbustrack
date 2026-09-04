import { z } from 'zod';
import { query } from '../database/db.js';
import { ok } from '../utils/response.js';

const uuid=z.string().uuid();
const STATUS=z.enum(['OPEN','ACKNOWLEDGED','RESOLVED']);
const TYPE=z.enum(['GPS_LOSS','OVER_CAPACITY','EMERGENCY','OUT_OF_SERVICE','STOPPED_TOO_LONG','STALE_TELEMETRY']);

export async function evaluateOperationalAlerts(){
  const r=await query(`SELECT b.id bus_id,b.bus_number,b.capacity,b.status,
    t.id trip_id,t.status trip_status,
    l.latitude,l.longitude,l.speed_kph,l.gps_timestamp,l.received_at,l.passenger_count
    FROM buses b
    LEFT JOIN LATERAL (SELECT t.* FROM trips t WHERE t.bus_id=b.id AND t.ended_at IS NULL ORDER BY t.created_at DESC LIMIT 1) t ON true
    LEFT JOIN LATERAL (SELECT te.* FROM telemetry te WHERE te.bus_id=b.id ORDER BY te.gps_timestamp DESC LIMIT 1) l ON true
    WHERE b.active=true`);
  let created=0;
  for(const b of r.rows){
    const age=b.gps_timestamp?Math.max(0,(Date.now()-new Date(b.gps_timestamp).getTime())/1000):Infinity;
    const candidates=[];
    if(b.status==='EMERGENCY') candidates.push(['EMERGENCY','CRITICAL','Emergency bus',`Bus ${b.bus_number} is marked EMERGENCY.`,{status:b.status}]);
    if(b.status==='OUT_OF_SERVICE') candidates.push(['OUT_OF_SERVICE','WARNING','Bus out of service',`Bus ${b.bus_number} is marked OUT_OF_SERVICE.`,{status:b.status}]);
    if(age>180) candidates.push(['GPS_LOSS','CRITICAL','GPS connection lost',`No recent GPS position from bus ${b.bus_number} for ${Math.round(age)} seconds.`,{ageSeconds:Math.round(age)}]);
    else if(age>90) candidates.push(['STALE_TELEMETRY','WARNING','Stale GPS telemetry',`GPS telemetry from bus ${b.bus_number} is ${Math.round(age)} seconds old.`,{ageSeconds:Math.round(age)}]);
    if(Number.isFinite(Number(b.passenger_count))&&Number(b.passenger_count)>Number(b.capacity)) candidates.push(['OVER_CAPACITY','CRITICAL','Bus over capacity',`Bus ${b.bus_number} reports ${b.passenger_count} passengers against capacity ${b.capacity}.`,{passengerCount:Number(b.passenger_count),capacity:Number(b.capacity)}]);
    if(b.trip_id&&['IN_TRIP','RETURNING'].includes(b.trip_status)&&age<90&&Number(b.speed_kph||0)<1&&b.gps_timestamp&&Date.now()-new Date(b.gps_timestamp).getTime()>10*60*1000) candidates.push(['STOPPED_TOO_LONG','WARNING','Bus stopped too long',`Bus ${b.bus_number} has reported near-zero speed during an active trip for more than 10 minutes.`,{speedKph:Number(b.speed_kph||0)}]);
    for(const [type,severity,title,message,details] of candidates){
      const x=await query(`INSERT INTO operational_alerts(bus_id,trip_id,type,severity,title,message,details)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (bus_id,type) WHERE status <> 'RESOLVED' DO NOTHING RETURNING id`,[b.bus_id,b.trip_id,type,severity,title,message,details]);
      if(x.rowCount) created++;
    }
  }
  return {created,checked:r.rowCount};
}

export async function listOperationalAlerts(req,res){
  const status=req.query.status?STATUS.parse(req.query.status):'OPEN';
  const limit=Math.min(Math.max(Number(req.query.limit||100),1),500);
  const r=await query(`SELECT a.*,b.bus_number FROM operational_alerts a LEFT JOIN buses b ON b.id=a.bus_id
    WHERE a.status=$1 ORDER BY CASE a.severity WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,a.detected_at DESC LIMIT $2`,[status,limit]);
  ok(res,r.rows.map(a=>({...a,busId:a.bus_id,busNumber:a.bus_number,tripId:a.trip_id,detectedAt:a.detected_at,acknowledgedAt:a.acknowledged_at,resolvedAt:a.resolved_at}))); 
}

export async function acknowledgeOperationalAlert(req,res){
  const id=uuid.parse(req.params.id);
  const r=await query(`UPDATE operational_alerts SET status='ACKNOWLEDGED',acknowledged_at=now(),acknowledged_by=$2
    WHERE id=$1 AND status='OPEN' RETURNING *`,[id,req.auth.sub]);
  if(!r.rowCount){const e=new Error('Alert not found or already acknowledged');e.status=404;e.code='ALERT_NOT_OPEN';throw e;}
  ok(res,r.rows[0]);
}
export async function resolveOperationalAlert(req,res){
  const id=uuid.parse(req.params.id);
  const r=await query(`UPDATE operational_alerts SET status='RESOLVED',resolved_at=now(),resolved_by=$2
    WHERE id=$1 AND status<>'RESOLVED' RETURNING *`,[id,req.auth.sub]);
  if(!r.rowCount){const e=new Error('Alert not found');e.status=404;e.code='ALERT_NOT_FOUND';throw e;}
  ok(res,r.rows[0]);
}
