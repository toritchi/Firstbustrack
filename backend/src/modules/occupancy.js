import { z } from 'zod';
import { query, withTransaction } from '../database/db.js';
import { ok, fail } from '../utils/response.js';
const uuid=z.string().uuid();
async function current(busId,tripId){const r=await query("SELECT COALESCE(SUM(CASE WHEN event_type='BOARD' THEN 1 ELSE -1 END),0)::int AS passengers FROM occupancy_events WHERE bus_id=$1 AND ($2::uuid IS NULL OR trip_id=$2)",[busId,tripId||null]); return r.rows[0].passengers;}
export async function event(req,res){
  const p=z.object({busId:uuid,tripId:uuid.optional(),eventType:z.enum(['BOARD','EXIT'])}).parse(req.body);
  const result=await withTransaction(async client=>{
    const b=(await client.query('SELECT id,capacity,active FROM buses WHERE id=$1 FOR UPDATE',[p.busId])).rows[0];
    if(!b||!b.active) throw Object.assign(new Error('Bus not found'),{status:404,code:'BUS_NOT_FOUND'});
    let trip=p.tripId;
    if(trip){
      const t=(await client.query("SELECT id,bus_id,status FROM trips WHERE id=$1 AND bus_id=$2 AND ended_at IS NULL AND status IN ('IN_TRIP','AT_STOP','AT_TERMINAL','RETURNING')",[trip,p.busId])).rows[0];
      if(!t) throw Object.assign(new Error('Trip is not active or does not belong to bus'),{status:400,code:'INVALID_TRIP'});
    } else {
      const t=(await client.query("SELECT id FROM trips WHERE bus_id=$1 AND ended_at IS NULL AND status IN ('IN_TRIP','AT_STOP','AT_TERMINAL','RETURNING') ORDER BY created_at DESC LIMIT 1",[p.busId])).rows[0];
      if(!t) throw Object.assign(new Error('Bus has no active trip'),{status:409,code:'NO_ACTIVE_TRIP'});
      trip=t.id;
    }
    const last=(await client.query("SELECT event_type FROM occupancy_events WHERE user_id=$1 AND trip_id=$2 ORDER BY occurred_at DESC LIMIT 1 FOR UPDATE",[req.passenger.id,trip])).rows[0];
    if(p.eventType==='BOARD' && last?.event_type==='BOARD') throw Object.assign(new Error('Passenger is already boarded on this trip'),{status:409,code:'ALREADY_BOARDED'});
    if(p.eventType==='EXIT' && last?.event_type!=='BOARD') throw Object.assign(new Error('Passenger is not currently boarded on this trip'),{status:409,code:'NOT_BOARDED'});
    const cur=Number((await client.query("SELECT COALESCE(SUM(CASE WHEN event_type='BOARD' THEN 1 ELSE -1 END),0)::int AS passengers FROM occupancy_events WHERE bus_id=$1 AND trip_id=$2",[p.busId,trip])).rows[0].passengers);
    const next=cur+(p.eventType==='BOARD'?1:-1);
    if(next<0) throw Object.assign(new Error('Cannot record EXIT when occupancy is zero'),{status:409,code:'OCCUPANCY_UNDERFLOW'});
    if(next>b.capacity) throw Object.assign(new Error('Bus capacity has been reached'),{status:409,code:'BUS_CAPACITY_REACHED'});
    const e=(await client.query('INSERT INTO occupancy_events(user_id,bus_id,trip_id,event_type) VALUES($1,$2,$3,$4) RETURNING id,occurred_at',[req.passenger.id,p.busId,trip,p.eventType])).rows[0];
    return {event:e,currentPassengers:next,capacity:b.capacity,full:next>=b.capacity};
  });
  return ok(res,result,201);
}

export async function getBusOccupancy(req,res){
  const p=uuid.safeParse(req.params.busId); if(!p.success)return fail(res,400,'VALIDATION_ERROR','Invalid bus ID');
  const r=await query(`SELECT b.id,b.bus_number AS "busNumber",b.capacity,
    t.id AS "tripId",
    COALESCE((SELECT SUM(CASE WHEN e.event_type='BOARD' THEN 1 ELSE -1 END) FROM occupancy_events e WHERE e.bus_id=b.id AND e.trip_id=t.id),0)::int AS "currentPassengers"
    FROM buses b LEFT JOIN LATERAL (
      SELECT id FROM trips WHERE bus_id=b.id AND ended_at IS NULL AND status IN ('IN_TRIP','AT_STOP','AT_TERMINAL','RETURNING') ORDER BY created_at DESC LIMIT 1
    ) t ON true WHERE b.id=$1`,[p.data]);
  if(!r.rowCount)return fail(res,404,'BUS_NOT_FOUND','Bus not found');
  const x=r.rows[0]; x.full=Number(x.currentPassengers)>=Number(x.capacity); ok(res,x);
}
