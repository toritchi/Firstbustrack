import { z } from 'zod';
import { query } from '../../database/db.js';
import { send } from '../../utils/response.js';

const uuid=z.string().uuid();
const coords=z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).strict();
const modeSchema=z.enum(['FASTEST','FEWEST_TRANSFERS','SHORTEST_WALKING','CHEAPEST']).default('FASTEST');
const routeQuery=z.object({cityId:uuid.optional(),operatorId:uuid.optional(),active:z.coerce.boolean().default(true)});

export async function listPublicRoutes(req,res){
  const p=routeQuery.parse(req.query); const where=[]; const vals=[];
  if(p.cityId){vals.push(p.cityId);where.push(`r.city_id=$${vals.length}`)}
  if(p.operatorId){vals.push(p.operatorId);where.push(`r.operator_id=$${vals.length}`)}
  if(p.active){where.push('r.active=true')}
  const r=await query(`SELECT r.id,r.line_number AS "lineNumber",r.name,r.city_id AS "cityId",r.operator_id AS "operatorId",
    json_agg(json_build_object('id',rd.id,'code',rd.code,'origin',rd.origin_name,'destination',rd.destination_name) ORDER BY rd.code) AS directions
    FROM routes r LEFT JOIN route_directions rd ON rd.route_id=r.id ${where.length?'WHERE '+where.join(' AND '):''}
    GROUP BY r.id ORDER BY r.line_number`,vals); send(res,r.rows);
}
export async function getPublicRoute(req,res){
  const p=uuid.safeParse(req.params.id); if(!p.success){const e=new Error('Invalid UUID');e.status=400;e.code='VALIDATION_ERROR';throw e;}
  const r=await query(`SELECT r.id,r.line_number AS "lineNumber",r.name,r.city_id AS "cityId",r.operator_id AS "operatorId" FROM routes r WHERE r.id=$1 AND r.active=true`,[p.data]);
  if(!r.rowCount){const e=new Error('Route not found');e.status=404;throw e;}
  const d=await query(`SELECT rd.id,rd.code,rd.origin_name AS origin,rd.destination_name AS destination,
    json_agg(json_build_object('id',s.id,'name',s.name,'latitude',s.latitude,'longitude',s.longitude,'sequence',rs.stop_sequence) ORDER BY rs.stop_sequence) AS stops
    FROM route_directions rd JOIN route_stops rs ON rs.direction_id=rd.id JOIN stops s ON s.id=rs.stop_id
    WHERE rd.route_id=$1 AND s.active=true GROUP BY rd.id ORDER BY rd.code`,[p.data]);
  send(res,{...r.rows[0],directions:d.rows});
}
export async function listPublicStops(req,res){
  const q=z.object({cityId:uuid.optional(),nearLat:z.coerce.number().min(-90).max(90).optional(),nearLon:z.coerce.number().min(-180).max(180).optional(),radiusKm:z.coerce.number().positive().max(50).default(5)}).refine(x=>(x.nearLat===undefined)===(x.nearLon===undefined),{message:'nearLat and nearLon must be provided together'}).parse(req.query);
  const vals=[]; const where=['s.active=true'];
  if(q.cityId){vals.push(q.cityId);where.push(`s.city_id=$${vals.length}`)}
  let distance='NULL';
  if(q.nearLat!==undefined){vals.push(q.nearLon,q.nearLat,q.radiusKm);const a=vals.length-2,b=vals.length-1,c=vals.length;where.push(`ST_DWithin(s.geom,ST_SetSRID(ST_MakePoint($${a}::double precision,$${b}::double precision),4326)::geography,$${c}*1000)`);distance=`ST_Distance(s.geom,ST_SetSRID(ST_MakePoint($${a}::double precision,$${b}::double precision),4326)::geography)/1000`}
  const r=await query(`SELECT s.id,s.city_id AS "cityId",s.name,s.latitude,s.longitude,${distance} AS "distanceKm" FROM stops s WHERE ${where.join(' AND ')} ORDER BY ${q.nearLat!==undefined?'s.geom <-> ST_SetSRID(ST_MakePoint($'+(vals.length-2)+'::double precision,$'+(vals.length-1)+'::double precision),4326)::geography,':'s.name'} s.name`,vals); send(res,r.rows);
}
export async function getPublicBuses(req,res){
  const p=z.object({routeId:uuid.optional(),directionId:uuid.optional()}).parse(req.query); const vals=[]; const where=[`b.active=true`];
  if(p.routeId){vals.push(p.routeId);where.push(`r.id=$${vals.length}`)} if(p.directionId){vals.push(p.directionId);where.push(`rd.id=$${vals.length}`)}
  const r=await query(`SELECT DISTINCT ON(b.id) b.id,b.bus_number AS "busNumber",b.capacity,b.status,r.id AS "routeId",r.line_number AS "lineNumber",rd.id AS "directionId",rd.code AS direction,
    t.latitude,t.longitude,t.speed_kph AS "speedKph",t.gps_timestamp AS "gpsTimestamp",t.passenger_count AS "passengerCount",
    CASE WHEN t.passenger_count IS NULL THEN NULL ELSE t.passenger_count>=b.capacity END AS "full"
    FROM buses b LEFT JOIN trips tr ON tr.bus_id=b.id AND tr.ended_at IS NULL AND tr.status IN ('IN_TRIP','AT_STOP','AT_TERMINAL','RETURNING')
    LEFT JOIN route_directions rd ON rd.id=tr.route_direction_id LEFT JOIN routes r ON r.id=rd.route_id
    LEFT JOIN LATERAL (SELECT * FROM telemetry x WHERE x.bus_id=b.id ORDER BY x.gps_timestamp DESC LIMIT 1) t ON true
    WHERE ${where.join(' AND ')} ORDER BY b.id,t.gps_timestamp DESC NULLS LAST`,vals); send(res,r.rows);
}

async function stopInfo(id){const r=await query(`SELECT id,name,latitude,longitude FROM stops WHERE id=$1 AND active=true`,[id]);return r.rows[0]||null;}
function hav(a,b){const R=6371.0088,rad=x=>x*Math.PI/180;const dLat=rad(Number(b.latitude)-Number(a.latitude)),dLon=rad(Number(b.longitude)-Number(a.longitude));const x=Math.sin(dLat/2)**2+Math.cos(rad(Number(a.latitude)))*Math.cos(rad(Number(b.latitude)))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
async function walkEstimateKm(from,to){return hav(from,to);}
async function directRoutes(originId,destinationId){
  return (await query(`SELECT r.id AS "routeId",r.line_number AS "lineNumber",r.name,rd.id AS "directionId",rd.code AS direction,
    a.stop_sequence AS "originSequence",b.stop_sequence AS "destinationSequence",
    o.name AS "originName",d.name AS "destinationName",
    (SELECT COUNT(*) FROM route_stops x WHERE x.direction_id=rd.id AND x.stop_sequence>=a.stop_sequence AND x.stop_sequence<=b.stop_sequence) - 1 AS stops
    FROM route_stops a JOIN route_stops b ON b.direction_id=a.direction_id AND b.stop_sequence>a.stop_sequence
    JOIN route_directions rd ON rd.id=a.direction_id JOIN routes r ON r.id=rd.route_id
    JOIN stops o ON o.id=a.stop_id JOIN stops d ON d.id=b.stop_id
    WHERE a.stop_id=$1 AND b.stop_id=$2 AND r.active=true`,[originId,destinationId])).rows;
}
async function transferRoutes(originId,destinationId){
  const origins=(await query(`SELECT direction_id,stop_sequence FROM route_stops WHERE stop_id=$1`,[originId])).rows;
  const dests=(await query(`SELECT direction_id,stop_sequence FROM route_stops WHERE stop_id=$1`,[destinationId])).rows;
  const out=[];
  for(const o of origins){const first=(await query(`SELECT rd.id AS "directionId",r.id AS "routeId",r.line_number AS "lineNumber",rd.code AS direction,s.id AS "transferStopId",s.name AS "transferStopName",rs.stop_sequence AS seq
      FROM route_stops rs JOIN route_directions rd ON rd.id=rs.direction_id JOIN routes r ON r.id=rd.route_id JOIN stops s ON s.id=rs.stop_id
      WHERE rs.direction_id=$1 AND rs.stop_sequence>$2 AND r.active=true ORDER BY rs.stop_sequence`,[o.direction_id,o.stop_sequence])).rows;
    for(const f of first.slice(0,40)){for(const d of dests){const same=(await query(`SELECT rs.stop_sequence FROM route_stops rs WHERE rs.direction_id=$1 AND rs.stop_id=$2 AND rs.stop_sequence>(SELECT stop_sequence FROM route_stops WHERE direction_id=$1 AND stop_id=$3) LIMIT 1`,[d.direction_id,f.transferStopId,destinationId])).rows[0];if(same){out.push({firstDirection:o.direction_id,firstRouteId:f.routeId,firstLineNumber:f.lineNumber,firstDirectionCode:f.direction,transferStopId:f.transferStopId,transferStopName:f.transferStopName,secondDirection:d.direction_id});break;}}if(out.length>=10)break;} if(out.length>=10)break;}
  return out;
}
export async function planJourney(req,res){
  const p=z.object({originStopId:uuid,destinationStopId:uuid,mode:modeSchema,originLat:z.coerce.number().optional(),originLon:z.coerce.number().optional(),destinationLat:z.coerce.number().optional(),destinationLon:z.coerce.number().optional()}).parse(req.query);
  if(p.originStopId===p.destinationStopId){const e=new Error('Origin and destination stops must differ');e.status=400;e.code='VALIDATION_ERROR';throw e;}
  const [o,d]=await Promise.all([stopInfo(p.originStopId),stopInfo(p.destinationStopId)]); if(!o||!d){const e=new Error('Origin or destination stop not found');e.status=404;throw e;}
  const direct=await directRoutes(p.originStopId,p.destinationStopId);
  const options=direct.map(x=>({...x,transfers:0,walkingKm:0,estimatedMinutes:Math.max(1,Math.round(x.stops*3.5)),priceDzd:null,optimizationBasis:'stops'}));
  if(!options.length){const transfers=await transferRoutes(p.originStopId,p.destinationStopId);for(const x of transfers){options.push({...x,transfers:1,walkingKm:0,estimatedMinutes:Math.max(5,Math.round(3.5*6)),priceDzd:null,optimizationBasis:'transfer_count'});}}
  if(p.originLat!==undefined&&p.originLon!==undefined){const from={latitude:p.originLat,longitude:p.originLon};options.forEach(x=>x.walkingToOriginKm=Number(walkEstimateKm(from,o).toFixed(2)))} else options.forEach(x=>x.walkingToOriginKm=0);
  if(p.destinationLat!==undefined&&p.destinationLon!==undefined){const to={latitude:p.destinationLat,longitude:p.destinationLon};options.forEach(x=>x.walkingFromDestinationKm=Number(walkEstimateKm(d,to).toFixed(2)))} else options.forEach(x=>x.walkingFromDestinationKm=0);
  options.forEach(x=>x.walkingKm=Number((x.walkingToOriginKm+x.walkingFromDestinationKm).toFixed(2)));
  const sort={FASTEST:(a,b)=>a.estimatedMinutes-b.estimatedMinutes,FEWEST_TRANSFERS:(a,b)=>a.transfers-b.transfers||a.estimatedMinutes-b.estimatedMinutes,SHORTEST_WALKING:(a,b)=>a.walkingKm-b.walkingKm||a.estimatedMinutes-b.estimatedMinutes,CHEAPEST:(a,b)=>(a.priceDzd??Infinity)-(b.priceDzd??Infinity)||a.estimatedMinutes-b.estimatedMinutes}; options.sort(sort[p.mode]);
  send(res,{origin:o,destination:d,mode:p.mode,options:options.slice(0,10),routing:{walkingProvider:'OSM-compatible; use OSRM/GraphHopper for production walking geometry',transitRouting:'database route topology'}});
}
