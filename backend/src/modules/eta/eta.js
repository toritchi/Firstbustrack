import { z } from 'zod';
import { query } from '../../database/db.js';
import { send } from '../../utils/response.js';

const uuid=z.string().uuid();
const trafficFactor=z.number().min(0.25).max(3).default(1);
const earthRadiusKm=6371.0088;
const toRad=d=>d*Math.PI/180;
function distanceKm(a,b){
  const dLat=toRad(b.lat-a.lat),dLon=toRad(b.lon-a.lon);
  const x=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;
  return 2*earthRadiusKm*Math.asin(Math.sqrt(x));
}
function speedMps(kph){return Math.max((Number(kph)||0)/3.6,2.78);}
function roundSeconds(v){return Math.max(0,Math.round(v));}

async function currentBus(busId){
  const r=await query(`SELECT DISTINCT ON (t.bus_id) t.bus_id,t.trip_id,t.latitude,t.longitude,t.speed_kph,t.gps_timestamp,t.received_at,
    t.accuracy_m,b.bus_number,b.capacity,b.status, t.trip_id
    FROM telemetry t JOIN buses b ON b.id=t.bus_id WHERE t.bus_id=$1 ORDER BY t.bus_id,t.gps_timestamp DESC`,[busId]);
  if(!r.rowCount){const e=new Error('No live telemetry available');e.status=404;e.code='NO_LIVE_POSITION';throw e;}
  return r.rows[0];
}
async function activeTrip(busId){
  const r=await query(`SELECT t.id,t.route_direction_id,rd.code,r.line_number,r.name AS route_name
    FROM trips t JOIN route_directions rd ON rd.id=t.route_direction_id JOIN routes r ON r.id=rd.route_id
    WHERE t.bus_id=$1 AND t.ended_at IS NULL AND t.status IN ('IN_TRIP','AT_STOP','AT_TERMINAL','RETURNING')
    ORDER BY t.started_at DESC NULLS LAST,t.created_at DESC LIMIT 1`,[busId]);
  return r.rows[0]||null;
}
async function stopsForDirection(directionId){
  const r=await query(`SELECT rs.id,rs.stop_sequence,s.id AS stop_id,s.name,s.latitude,s.longitude
    FROM route_stops rs JOIN stops s ON s.id=rs.stop_id WHERE rs.direction_id=$1 AND s.active=true ORDER BY rs.stop_sequence`,[directionId]);
  return r.rows.map(x=>({...x,lat:Number(x.latitude),lon:Number(x.longitude)}));
}
function nearestIndex(position,stops){
  let best=-1,bestD=Infinity;
  stops.forEach((s,i)=>{const d=distanceKm(position,s);if(d<bestD){bestD=d;best=i;}});
  return {index:best,distanceKm:bestD};
}
async function historicalSeconds(directionId,fromStop,toStop){
  const r=await query(`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY observed_seconds) AS median_seconds,
    AVG(observed_seconds) AS avg_seconds,COUNT(*) AS samples
    FROM eta_travel_observations WHERE route_direction_id=$1 AND from_stop_id=$2 AND to_stop_id=$3
    AND observed_at >= now()-interval '90 days'`,[directionId,fromStop,toStop]);
  const row=r.rows[0];
  return {seconds:row?.median_seconds?Number(row.median_seconds):null,samples:Number(row?.samples||0)};
}
async function buildEta(busId){
  const live=await currentBus(busId); const trip=await activeTrip(busId);
  if(!trip){const e=new Error('Bus has no active trip');e.status=404;e.code='NO_ACTIVE_TRIP';throw e;}
  const stops=await stopsForDirection(trip.route_direction_id);
  if(stops.length<2){const e=new Error('Route direction requires at least two active stops');e.status=409;e.code='INSUFFICIENT_ROUTE_STOPS';throw e;}
  const nearest=nearestIndex({lat:Number(live.latitude),lon:Number(live.longitude)},stops);
  const now=Date.now();
  const traffic=Number(process.env.ETA_TRAFFIC_FACTOR||1);
  const factor=Math.min(3,Math.max(.25,traffic));
  const results=[];
  let previous=nearest.index;
  let cumulativeSeconds=0;
  for(let i=nearest.index+1;i<stops.length;i++){
    const from=stops[previous],to=stops[i];
    const d=distanceKm(from,to);
    const hist=await historicalSeconds(trip.route_direction_id,from.stop_id,to.stop_id);
    const base=hist.seconds??(d/speedMps(live.speed_kph)*3600);
    cumulativeSeconds += base*factor;
    results.push({stopId:to.stop_id,stopSequence:to.stop_sequence,stopName:to.name,distanceFromBusKm:Number(distanceKm({lat:Number(live.latitude),lon:Number(live.longitude)},to).toFixed(3)),etaSeconds:roundSeconds(cumulativeSeconds),etaAt:new Date(now+cumulativeSeconds*1000).toISOString(),historicalSamples:hist.samples});
    previous=i;
  }
  return {busId,tripId:trip.id,lineNumber:trip.line_number,direction:trip.code,busNumber:live.bus_number,position:{latitude:Number(live.latitude),longitude:Number(live.longitude),speedKph:live.speed_kph==null?null:Number(live.speed_kph),gpsTimestamp:live.gps_timestamp},trafficFactor:factor,nearestStopId:stops[nearest.index].stop_id,nearestStopName:stops[nearest.index].name,etas:results,generatedAt:new Date().toISOString()};
}

export async function getBusEta(req,res){
  const id=uuid.safeParse(req.params.id); if(!id.success){const e=new Error('Invalid UUID');e.status=400;e.code='VALIDATION_ERROR';throw e;}
  send(res,await buildEta(id.data));
}
export async function getTripEta(req,res){
  const id=uuid.safeParse(req.params.id); if(!id.success){const e=new Error('Invalid UUID');e.status=400;e.code='VALIDATION_ERROR';throw e;}
  const r=await query(`SELECT bus_id FROM trips WHERE id=$1`,[id.data]);if(!r.rowCount){const e=new Error('Trip not found');e.status=404;throw e;}
  const data=await buildEta(r.rows[0].bus_id); data.tripId=id.data; send(res,data);
}
export async function listRouteEta(req,res){
  const id=uuid.safeParse(req.params.directionId); if(!id.success){const e=new Error('Invalid UUID');e.status=400;e.code='VALIDATION_ERROR';throw e;}
  const r=await query(`SELECT DISTINCT ON(t.bus_id) t.bus_id FROM trips t WHERE t.route_direction_id=$1 AND t.ended_at IS NULL AND t.status IN ('IN_TRIP','AT_STOP','AT_TERMINAL','RETURNING') ORDER BY t.bus_id,t.started_at DESC`,[id.data]);
  const data=[]; for(const row of r.rows){try{data.push(await buildEta(row.bus_id));}catch(e){if(e.code!=='NO_LIVE_POSITION')throw e;}}
  send(res,data);
}

export async function createTravelObservation(req,res){
  const schema=z.object({routeDirectionId:uuid,fromStopId:uuid,toStopId:uuid,observedSeconds:z.number().int().positive()}).strict();
  const p=schema.parse(req.body);
  if(p.fromStopId===p.toStopId){const e=new Error('fromStopId and toStopId must differ');e.status=400;e.code='VALIDATION_ERROR';throw e;}
  const r=await query(`INSERT INTO eta_travel_observations(route_direction_id,from_stop_id,to_stop_id,observed_seconds) VALUES($1,$2,$3,$4) RETURNING id,route_direction_id AS "routeDirectionId",from_stop_id AS "fromStopId",to_stop_id AS "toStopId",observed_seconds AS "observedSeconds",observed_at AS "observedAt"`,[p.routeDirectionId,p.fromStopId,p.toStopId,p.observedSeconds]);
  send(res,r.rows[0],201);
}
