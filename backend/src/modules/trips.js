import { z } from 'zod';
import { query, withTransaction } from '../database/db.js';
import { send } from '../utils/response.js';

const uuid = z.string().uuid();
const directionCodes = ['A_TO_B','B_TO_A'];
const statuses = ['OFFLINE','AVAILABLE','READY','IN_TRIP','AT_STOP','AT_TERMINAL','RETURNING','OUT_OF_SERVICE','EMERGENCY','GPS_ERROR'];

const createSchema = z.object({
  routeDirectionId: uuid,
  busId: uuid,
  driverId: uuid.nullable().optional(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

const updateSchema = z.object({
  routeDirectionId: uuid.optional(),
  busId: uuid.optional(),
  driverId: uuid.nullable().optional(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict().refine(v => Object.keys(v).length > 0, { message: 'At least one field is required' });

function body(req, schema) {
  const r = schema.safeParse(req.body);
  if (!r.success) { const e = new Error('Validation failed'); e.status=400; e.code='VALIDATION_ERROR'; e.details=r.error.flatten(); throw e; }
  return r.data;
}
function paramId(req, name='id') {
  const r=uuid.safeParse(req.params[name]);
  if(!r.success){const e=new Error('Invalid UUID');e.status=400;e.code='VALIDATION_ERROR';throw e;}
  return r.data;
}
function dateValid(value) {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10) === value;
}
async function audit(c, req, action, entityId, before, after) {
  await c.query(`INSERT INTO audit_log(actor_admin_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,$2,'TRIP',$3,$4,$5)`, [req.auth.id,action,entityId,before?JSON.stringify(before):null,after?JSON.stringify(after):null]);
}

async function loadRefs(c, {routeDirectionId,busId,driverId}) {
  const direction=(await c.query(`SELECT rd.id,rd.code,r.id route_id,r.city_id,r.operator_id FROM route_directions rd JOIN routes r ON r.id=rd.route_id WHERE rd.id=$1`,[routeDirectionId])).rows[0];
  if(!direction){const e=new Error('Route direction not found');e.status=404;throw e;}
  const bus=(await c.query(`SELECT id,operator_id,active,status FROM buses WHERE id=$1`,[busId])).rows[0];
  if(!bus){const e=new Error('Bus not found');e.status=404;throw e;}
  if(!bus.active){const e=new Error('Bus is inactive');e.status=400;e.code='BUS_INACTIVE';throw e;}
  if(['OUT_OF_SERVICE','EMERGENCY'].includes(bus.status)){const e=new Error('Bus cannot be assigned in its current status');e.status=409;e.code='BUS_STATUS_BLOCKED';throw e;}
  if(driverId){
    const driver=(await c.query(`SELECT id,operator_id,active FROM drivers WHERE id=$1`,[driverId])).rows[0];
    if(!driver){const e=new Error('Driver not found');e.status=404;throw e;}
    if(!driver.active){const e=new Error('Driver is inactive');e.status=400;e.code='DRIVER_INACTIVE';throw e;}
    if(driver.operator_id && bus.operator_id && String(driver.operator_id)!==String(bus.operator_id)){const e=new Error('Driver and bus must belong to the same operator');e.status=409;e.code='OPERATOR_MISMATCH';throw e;}
    if(direction.operator_id && bus.operator_id && String(direction.operator_id)!==String(bus.operator_id)){const e=new Error('Bus and route must belong to the same operator');e.status=409;e.code='OPERATOR_MISMATCH';throw e;}
    if(direction.operator_id && driver.operator_id && String(direction.operator_id)!==String(driver.operator_id)){const e=new Error('Driver and route must belong to the same operator');e.status=409;e.code='OPERATOR_MISMATCH';throw e;}
  } else if(direction.operator_id && bus.operator_id && String(direction.operator_id)!==String(bus.operator_id)) {
    const e=new Error('Bus and route must belong to the same operator');e.status=409;e.code='OPERATOR_MISMATCH';throw e;
  }
  return {direction,bus};
}

const select = `SELECT t.id,t.route_direction_id AS "routeDirectionId",r.line_number AS "lineNumber",rd.code AS direction,
 t.bus_id AS "busId",b.bus_number AS "busNumber",t.driver_id AS "driverId",d.driver_number AS "driverNumber",
 t.service_date AS "serviceDate",t.started_at AS "startedAt",t.ended_at AS "endedAt",t.status,t.created_at AS "createdAt"
 FROM trips t JOIN route_directions rd ON rd.id=t.route_direction_id JOIN routes r ON r.id=rd.route_id
 JOIN buses b ON b.id=t.bus_id LEFT JOIN drivers d ON d.id=t.driver_id`;

export async function listTrips(req,res){
  const r=await query(`${select} ORDER BY t.service_date DESC,t.created_at DESC`); send(res,r.rows);
}

export async function createTrip(req,res){
  const b=body(req,createSchema); if(!dateValid(b.serviceDate)){const e=new Error('Invalid serviceDate');e.status=400;e.code='VALIDATION_ERROR';throw e;}
  const result=await withTransaction(async c=>{
    const {direction,bus}=await loadRefs(c,b);
    const openBus=(await c.query(`SELECT id FROM trips WHERE bus_id=$1 AND ended_at IS NULL FOR UPDATE`,[b.busId])).rows[0];
    if(openBus){const e=new Error('Bus already has an open trip');e.status=409;e.code='BUS_DOUBLE_BOOKED';throw e;}
    if(b.driverId){const openDriver=(await c.query(`SELECT id FROM trips WHERE driver_id=$1 AND ended_at IS NULL FOR UPDATE`,[b.driverId])).rows[0];if(openDriver){const e=new Error('Driver already has an open trip');e.status=409;e.code='DRIVER_DOUBLE_BOOKED';throw e;}}
    const n=(await c.query(`INSERT INTO trips(route_direction_id,bus_id,driver_id,service_date,status) VALUES($1,$2,$3,$4,'READY') RETURNING id`,[b.routeDirectionId,b.busId,b.driverId??null,b.serviceDate])).rows[0];
    const after=(await c.query(`${select} WHERE t.id=$1`,[n.id])).rows[0];
    await c.query(`UPDATE buses SET status='READY' WHERE id=$1`,[bus.id]); await audit(c,req,'CREATE',n.id,null,after); return after;
  }); send(res,result,201);
}

export async function updateTrip(req,res){
  const b=body(req,updateSchema), tripId=paramId(req);
  const result=await withTransaction(async c=>{
    const old=(await c.query(`${select} WHERE t.id=$1 FOR UPDATE`,[tripId])).rows[0];
    if(!old){const e=new Error('Trip not found');e.status=404;throw e;}
    if(old.startedAt || old.endedAt){const e=new Error('Started or completed trips cannot be reassigned');e.status=409;e.code='TRIP_LOCKED';throw e;}
    const next={routeDirectionId:b.routeDirectionId??old.routeDirectionId,busId:b.busId??old.busId,driverId:Object.hasOwn(b,'driverId')?b.driverId:old.driverId,serviceDate:b.serviceDate??old.serviceDate};
    if(!dateValid(next.serviceDate)){const e=new Error('Invalid serviceDate');e.status=400;e.code='VALIDATION_ERROR';throw e;}
    await loadRefs(c,next);
    const busOpen=(await c.query(`SELECT id FROM trips WHERE bus_id=$1 AND ended_at IS NULL AND id<>$2`,[next.busId,tripId])).rows[0];if(busOpen){const e=new Error('Bus already has another open trip');e.status=409;e.code='BUS_DOUBLE_BOOKED';throw e;}
    if(next.driverId){const driverOpen=(await c.query(`SELECT id FROM trips WHERE driver_id=$1 AND ended_at IS NULL AND id<>$2`,[next.driverId,tripId])).rows[0];if(driverOpen){const e=new Error('Driver already has another open trip');e.status=409;e.code='DRIVER_DOUBLE_BOOKED';throw e;}}
    const n=(await c.query(`UPDATE trips SET route_direction_id=$1,bus_id=$2,driver_id=$3,service_date=$4 WHERE id=$5 RETURNING id`,[next.routeDirectionId,next.busId,next.driverId,next.serviceDate,tripId])).rows[0];
    const after=(await c.query(`${select} WHERE t.id=$1`,[n.id])).rows[0]; await audit(c,req,'UPDATE',tripId,old,after); return after;
  }); send(res,result);
}

export async function deleteTrip(req,res){
  const tripId=paramId(req); const result=await withTransaction(async c=>{
    const old=(await c.query(`${select} WHERE t.id=$1 FOR UPDATE`,[tripId])).rows[0];if(!old){const e=new Error('Trip not found');e.status=404;throw e;}
    if(old.startedAt){const e=new Error('Started trips cannot be deleted');e.status=409;e.code='TRIP_STARTED';throw e;}
    await c.query('DELETE FROM trips WHERE id=$1',[tripId]); await audit(c,req,'DELETE',tripId,old,null); return {id:tripId};
  }); send(res,result);
}

async function transition(req,res,target,allowed,terminal=false){
  const tripId=paramId(req); const result=await withTransaction(async c=>{
    const trip=(await c.query(`SELECT t.*,rd.code FROM trips t JOIN route_directions rd ON rd.id=t.route_direction_id WHERE t.id=$1 FOR UPDATE`,[tripId])).rows[0];
    if(!trip){const e=new Error('Trip not found');e.status=404;throw e;}
    if(!allowed.includes(trip.status)){const e=new Error(`Invalid transition from ${trip.status} to ${target}`);e.status=409;e.code='INVALID_TRIP_TRANSITION';throw e;}
    const now=new Date();
    let started=trip.started_at, ended=trip.ended_at;
    if(target==='IN_TRIP' || target==='RETURNING') started=started||now;
    if(target==='AVAILABLE') ended=now;
    const n=(await c.query(`UPDATE trips SET status=$1,started_at=$2,ended_at=$3 WHERE id=$4 RETURNING id`,[target,started,ended,tripId])).rows[0];
    await c.query(`UPDATE buses SET status=$1 WHERE id=$2`,[target,trip.bus_id]);
    const after=(await c.query(`${select} WHERE t.id=$1`,[n.id])).rows[0]; await audit(c,req,'STATE_CHANGE',tripId,trip,after); return after;
  }); send(res,result);
}

// Physical bus button: first press starts the planned direction; terminal press confirms return.
export const startTrip=(req,res)=>transition(req,res,'IN_TRIP',['READY','AVAILABLE']);
export const confirmReturn=(req,res)=>transition(req,res,'RETURNING',['AT_TERMINAL']);
export const markAtStop=(req,res)=>transition(req,res,'AT_STOP',['IN_TRIP','RETURNING']);
export const markAtTerminal=(req,res)=>transition(req,res,'AT_TERMINAL',['IN_TRIP','AT_STOP','RETURNING']);
export const endTrip=(req,res)=>transition(req,res,'AVAILABLE',['RETURNING','AT_TERMINAL','IN_TRIP'],true);
