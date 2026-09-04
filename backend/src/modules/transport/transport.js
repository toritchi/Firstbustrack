import { z } from 'zod';
import { query, withTransaction } from '../../database/db.js';

const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(160);
const code = z.string().trim().min(1).max(32);
const bool = z.boolean();

const schemas = {
  wilaya: z.object({ name, code: code.optional() }).strict(),
  city: z.object({ wilayaId: uuid, name }).strict(),
  operator: z.object({ cityId: uuid.nullable().optional(), name, active: bool.optional() }).strict(),
  route: z.object({ operatorId: uuid.nullable().optional(), cityId: uuid, lineNumber: code, name: z.string().trim().max(160).nullable().optional(), active: bool.optional() }).strict(),
  direction: z.object({ routeId: uuid, code: z.enum(['A_TO_B','B_TO_A']), originName: name, destinationName: name }).strict(),
  stop: z.object({ cityId: uuid, name, latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), active: bool.optional() }).strict(),
  routeStop: z.object({ directionId: uuid, stopId: uuid, stopSequence: z.number().int().positive() }).strict()
};

function parsed(req, schema) { return schema.parse(req.body); }
function audit(client, actor, action, entityType, entityId, beforeData, afterData) {
  return client.query(`INSERT INTO audit_log(actor_admin_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6)`, [actor.id, action, entityType, entityId, beforeData ?? null, afterData ?? null]);
}
function send(res, data, status=200) { return res.status(status).json({success:true,data}); }

export async function listWilayas(_req,res){ send(res,(await query('SELECT id,name,code,created_at AS "createdAt" FROM wilayas ORDER BY code NULLS LAST,name')).rows); }
export async function createWilaya(req,res){
  const b=parsed(req,schemas.wilaya); const r=await query('INSERT INTO wilayas(name,code) VALUES($1,$2) RETURNING id,name,code,created_at AS "createdAt"',[b.name,b.code??null]); send(res,r.rows[0],201);
}
export async function updateWilaya(req,res){
  const b=parsed(req,schemas.wilaya); const r=await withTransaction(async c=>{const old=(await c.query('SELECT * FROM wilayas WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0]; if(!old){const e=new Error('Wilaya not found');e.status=404;throw e;} const n=(await c.query('UPDATE wilayas SET name=$1,code=$2 WHERE id=$3 RETURNING id,name,code,created_at AS "createdAt"',[b.name,b.code??null,req.params.id])).rows[0]; await audit(c,req.auth,'UPDATE','WILAYA',n.id,old,n); return n;}); send(res,r); }
export async function deleteWilaya(req,res){ return deleteEntity(req,res,'wilayas','WILAYA','wilaya'); }

export async function listCities(req,res){ const p=uuid.parse(req.params.wilayaId); send(res,(await query('SELECT id,wilaya_id AS "wilayaId",name,created_at AS "createdAt" FROM cities WHERE wilaya_id=$1 ORDER BY name',[p])).rows); }
export async function createCity(req,res){ const b=parsed(req,schemas.city); const r=await query('INSERT INTO cities(wilaya_id,name) VALUES($1,$2) RETURNING id,wilaya_id AS "wilayaId",name,created_at AS "createdAt"',[b.wilayaId,b.name]); send(res,r.rows[0],201); }
export async function updateCity(req,res){ const b=parsed(req,schemas.city); const r=await withTransaction(async c=>{const old=(await c.query('SELECT * FROM cities WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!old){const e=new Error('City not found');e.status=404;throw e;}const n=(await c.query('UPDATE cities SET wilaya_id=$1,name=$2 WHERE id=$3 RETURNING id,wilaya_id AS "wilayaId",name,created_at AS "createdAt"',[b.wilayaId,b.name,req.params.id])).rows[0];await audit(c,req.auth,'UPDATE','CITY',n.id,old,n);return n;});send(res,r); }
export async function deleteCity(req,res){return deleteEntity(req,res,'cities','CITY','city');}

export async function listOperators(_req,res){send(res,(await query('SELECT id,city_id AS "cityId",name,active,created_at AS "createdAt" FROM operators ORDER BY name')).rows);}
export async function createOperator(req,res){const b=parsed(req,schemas.operator);const r=await query('INSERT INTO operators(city_id,name,active) VALUES($1,$2,$3) RETURNING id,city_id AS "cityId",name,active,created_at AS "createdAt"',[b.cityId??null,b.name,b.active??true]);send(res,r.rows[0],201);}
export async function updateOperator(req,res){const b=parsed(req,schemas.operator);const r=await withTransaction(async c=>{const old=(await c.query('SELECT * FROM operators WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!old){const e=new Error('Operator not found');e.status=404;throw e;}const n=(await c.query('UPDATE operators SET city_id=$1,name=$2,active=$3 WHERE id=$4 RETURNING id,city_id AS "cityId",name,active,created_at AS "createdAt"',[b.cityId??null,b.name,b.active??true,req.params.id])).rows[0];await audit(c,req.auth,'UPDATE','OPERATOR',n.id,old,n);return n;});send(res,r);}
export async function deleteOperator(req,res){return deleteEntity(req,res,'operators','OPERATOR','operator');}

export async function listRoutes(_req,res){send(res,(await query('SELECT id,operator_id AS "operatorId",city_id AS "cityId",line_number AS "lineNumber",name,active,created_at AS "createdAt" FROM routes ORDER BY city_id,line_number')).rows);}
export async function createRoute(req,res){const b=parsed(req,schemas.route);const r=await query('INSERT INTO routes(operator_id,city_id,line_number,name,active) VALUES($1,$2,$3,$4,$5) RETURNING id,operator_id AS "operatorId",city_id AS "cityId",line_number AS "lineNumber",name,active,created_at AS "createdAt"',[b.operatorId??null,b.cityId,b.lineNumber,b.name??null,b.active??true]);send(res,r.rows[0],201);}
export async function updateRoute(req,res){const b=parsed(req,schemas.route);const r=await withTransaction(async c=>{const old=(await c.query('SELECT * FROM routes WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!old){const e=new Error('Route not found');e.status=404;throw e;}const n=(await c.query('UPDATE routes SET operator_id=$1,city_id=$2,line_number=$3,name=$4,active=$5 WHERE id=$6 RETURNING id,operator_id AS "operatorId",city_id AS "cityId",line_number AS "lineNumber",name,active,created_at AS "createdAt"',[b.operatorId??null,b.cityId,b.lineNumber,b.name??null,b.active??true,req.params.id])).rows[0];await audit(c,req.auth,'UPDATE','ROUTE',n.id,old,n);return n;});send(res,r);}
export async function deleteRoute(req,res){return deleteEntity(req,res,'routes','ROUTE','route');}

export async function listDirections(req,res){uuid.parse(req.params.routeId);send(res,(await query('SELECT id,route_id AS "routeId",code,origin_name AS "originName",destination_name AS "destinationName" FROM route_directions WHERE route_id=$1 ORDER BY code',[req.params.routeId])).rows);}
export async function createDirection(req,res){const b=parsed(req,schemas.direction);const r=await query('INSERT INTO route_directions(route_id,code,origin_name,destination_name) VALUES($1,$2,$3,$4) RETURNING id,route_id AS "routeId",code,origin_name AS "originName",destination_name AS "destinationName"',[b.routeId,b.code,b.originName,b.destinationName]);send(res,r.rows[0],201);}
export async function updateDirection(req,res){const b=parsed(req,schemas.direction);const r=await withTransaction(async c=>{const old=(await c.query('SELECT * FROM route_directions WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!old){const e=new Error('Direction not found');e.status=404;throw e;}const n=(await c.query('UPDATE route_directions SET route_id=$1,code=$2,origin_name=$3,destination_name=$4 WHERE id=$5 RETURNING id,route_id AS "routeId",code,origin_name AS "originName",destination_name AS "destinationName"',[b.routeId,b.code,b.originName,b.destinationName,req.params.id])).rows[0];await audit(c,req.auth,'UPDATE','ROUTE_DIRECTION',n.id,old,n);return n;});send(res,r);}
export async function deleteDirection(req,res){return deleteEntity(req,res,'route_directions','ROUTE_DIRECTION','direction');}

export async function listStops(req,res){const q=req.query.cityId?uuid.parse(req.query.cityId):null;const sql=q?'SELECT id,city_id AS "cityId",name,latitude,longitude,active,created_at AS "createdAt" FROM stops WHERE city_id=$1 ORDER BY name':'SELECT id,city_id AS "cityId",name,latitude,longitude,active,created_at AS "createdAt" FROM stops ORDER BY city_id,name';send(res,(await query(sql,q?[q]:[])).rows);}
export async function createStop(req,res){const b=parsed(req,schemas.stop);const r=await query('INSERT INTO stops(city_id,name,latitude,longitude,geom,active) VALUES($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($4,$3),4326)::geography,$5) RETURNING id,city_id AS "cityId",name,latitude,longitude,active,created_at AS "createdAt"',[b.cityId,b.name,b.latitude,b.longitude,b.active??true]);send(res,r.rows[0],201);}
export async function updateStop(req,res){const b=parsed(req,schemas.stop);const r=await withTransaction(async c=>{const old=(await c.query('SELECT * FROM stops WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!old){const e=new Error('Stop not found');e.status=404;throw e;}const n=(await c.query('UPDATE stops SET city_id=$1,name=$2,latitude=$3,longitude=$4,active=$5 WHERE id=$6 RETURNING id,city_id AS "cityId",name,latitude,longitude,active,created_at AS "createdAt"',[b.cityId,b.name,b.latitude,b.longitude,b.active??true,req.params.id])).rows[0];await audit(c,req.auth,'UPDATE','STOP',n.id,old,n);return n;});send(res,r);}
export async function deleteStop(req,res){return deleteEntity(req,res,'stops','STOP','stop');}

export async function listRouteStops(req,res){uuid.parse(req.params.directionId);send(res,(await query(`SELECT rs.id,rs.direction_id AS "directionId",rs.stop_id AS "stopId",rs.stop_sequence AS "stopSequence",s.name AS "stopName",s.latitude,s.longitude FROM route_stops rs JOIN stops s ON s.id=rs.stop_id WHERE rs.direction_id=$1 ORDER BY rs.stop_sequence`,[req.params.directionId])).rows);}
export async function createRouteStop(req,res){const b=parsed(req,schemas.routeStop);const r=await withTransaction(async c=>{const d=(await c.query('SELECT rd.id,r.city_id FROM route_directions rd JOIN routes r ON r.id=rd.route_id WHERE rd.id=$1',[b.directionId])).rows[0];const s=(await c.query('SELECT id,city_id FROM stops WHERE id=$1',[b.stopId])).rows[0];if(!d||!s){const e=new Error('Direction or stop not found');e.status=404;throw e;}if(String(d.city_id)!==String(s.city_id)){const e=new Error('Stop must belong to the route city');e.status=400;throw e;}const n=(await c.query(`INSERT INTO route_stops(direction_id,stop_id,stop_sequence) VALUES($1,$2,$3) RETURNING id,direction_id AS "directionId",stop_id AS "stopId",stop_sequence AS "stopSequence"`,[b.directionId,b.stopId,b.stopSequence])).rows[0];await audit(c,req.auth,'CREATE','ROUTE_STOP',n.id,null,n);return n;});send(res,r,201);}
export async function updateRouteStop(req,res){const b=parsed(req,schemas.routeStop);const r=await withTransaction(async c=>{const old=(await c.query('SELECT * FROM route_stops WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!old){const e=new Error('Route stop not found');e.status=404;throw e;}const d=(await c.query('SELECT rd.id,r.city_id FROM route_directions rd JOIN routes r ON r.id=rd.route_id WHERE rd.id=$1',[b.directionId])).rows[0];const s=(await c.query('SELECT id,city_id FROM stops WHERE id=$1',[b.stopId])).rows[0];if(!d||!s){const e=new Error('Direction or stop not found');e.status=404;throw e;}if(String(d.city_id)!==String(s.city_id)){const e=new Error('Stop must belong to the route city');e.status=400;throw e;}const n=(await c.query('UPDATE route_stops SET direction_id=$1,stop_id=$2,stop_sequence=$3 WHERE id=$4 RETURNING id,direction_id AS "directionId",stop_id AS "stopId",stop_sequence AS "stopSequence"',[b.directionId,b.stopId,b.stopSequence,req.params.id])).rows[0];await audit(c,req.auth,'UPDATE','ROUTE_STOP',n.id,old,n);return n;});send(res,r);}
export async function deleteRouteStop(req,res){return deleteEntity(req,res,'route_stops','ROUTE_STOP','route stop');}

async function deleteEntity(req,res,table,entityType,label){const id=uuid.parse(req.params.id);const r=await withTransaction(async c=>{const old=(await c.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[id])).rows[0];if(!old){const e=new Error(`${label[0].toUpperCase()+label.slice(1)} not found`);e.status=404;throw e;}await c.query(`DELETE FROM ${table} WHERE id=$1`,[id]);await audit(c,req.auth,'DELETE',entityType,id,old,null);return {id};});send(res,r);}
