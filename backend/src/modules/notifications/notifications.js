import { z } from 'zod';
import { query, withTransaction } from '../../database/db.js';
import { ok, fail } from '../../utils/response.js';

const id=z.string().uuid();
const channel=z.enum(['PUSH','SMS','WHATSAPP','EMAIL']);
const alertSchema=z.object({routeId:id.optional().nullable(),busId:id.optional().nullable(),title:z.string().trim().min(1).max(200),message:z.string().trim().min(1).max(2000),startsAt:z.string().datetime(),endsAt:z.string().datetime().optional().nullable(),active:z.boolean().optional().default(true)}).strict();
const alertUpdate=alertSchema.partial().strict();
const prefSchema=z.object({pushEnabled:z.boolean().optional(),smsEnabled:z.boolean().optional(),whatsappEnabled:z.boolean().optional(),emailEnabled:z.boolean().optional(),serviceAlertsEnabled:z.boolean().optional(),promotionalEnabled:z.boolean().optional()}).strict();
const sendSchema=z.object({userId:id.optional(),channel,title:z.string().trim().min(1).max(200),body:z.string().trim().min(1).max(4000),promotional:z.boolean().optional().default(false)}).strict();
const broadcastSchema=z.object({routeId:id.optional().nullable(),busId:id.optional().nullable(),title:z.string().trim().min(1).max(200),message:z.string().trim().min(1).max(2000),startsAt:z.string().datetime(),endsAt:z.string().datetime().optional().nullable(),channels:z.array(channel).min(1).max(4),promotional:z.boolean().optional().default(false)}).strict();

function iso(v){return v instanceof Date?v.toISOString():v;}
function mapAlert(r){return {id:r.id,routeId:r.route_id,busId:r.bus_id,title:r.title,message:r.message,startsAt:iso(r.starts_at),endsAt:r.ends_at?iso(r.ends_at):null,active:r.active,createdBy:r.created_by,createdAt:iso(r.created_at),updatedAt:iso(r.updated_at)};}
function prefRow(r){return {pushEnabled:r.push_enabled,smsEnabled:r.sms_enabled,whatsappEnabled:r.whatsapp_enabled,emailEnabled:r.email_enabled,serviceAlertsEnabled:r.service_alerts_enabled,promotionalEnabled:r.promotional_enabled,updatedAt:iso(r.updated_at)};}

export async function listActiveAlerts(req,res){
  const routeId=req.query.routeId? id.parse(req.query.routeId):null;
  const busId=req.query.busId? id.parse(req.query.busId):null;
  const params=[]; const where=["sa.active=true","sa.starts_at<=now()","(sa.ends_at IS NULL OR sa.ends_at>=now())"];
  if(routeId){params.push(routeId);where.push(`sa.route_id=$${params.length}`)}
  if(busId){params.push(busId);where.push(`sa.bus_id=$${params.length}`)}
  const r=await query(`SELECT sa.* FROM service_alerts sa WHERE ${where.join(' AND ')} ORDER BY sa.starts_at DESC`,params);
  ok(res,r.rows.map(mapAlert));
}
export async function createAlert(req,res){
  const p=alertSchema.parse(req.body);
  if(!p.routeId&&!p.busId)return fail(res,400,'TARGET_REQUIRED','Alert must target a route or bus');
  if(p.endsAt && new Date(p.endsAt)<=new Date(p.startsAt))return fail(res,400,'INVALID_WINDOW','endsAt must be after startsAt');
  const r=await query(`INSERT INTO service_alerts(route_id,bus_id,title,message,starts_at,ends_at,active,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[p.routeId||null,p.busId||null,p.title,p.message,p.startsAt,p.endsAt||null,p.active,req.auth.id]);
  ok(res,mapAlert(r.rows[0]),201);
}
export async function updateAlert(req,res){
  const alertId=id.parse(req.params.id); const p=alertUpdate.parse(req.body);
  const old=await query('SELECT * FROM service_alerts WHERE id=$1',[alertId]); if(!old.rowCount)return fail(res,404,'NOT_FOUND','Service alert not found');
  const x=old.rows[0]; const v={routeId:p.routeId===undefined?x.route_id:p.routeId,busId:p.busId===undefined?x.bus_id:p.busId,startsAt:p.startsAt===undefined?x.starts_at:p.startsAt,endsAt:p.endsAt===undefined?x.ends_at:p.endsAt};
  if(!v.routeId&&!v.busId)return fail(res,400,'TARGET_REQUIRED','Alert must target a route or bus');
  if(v.endsAt && new Date(v.endsAt)<=new Date(v.startsAt))return fail(res,400,'INVALID_WINDOW','endsAt must be after startsAt');
  const r=await query(`UPDATE service_alerts SET route_id=$1,bus_id=$2,title=COALESCE($3,title),message=COALESCE($4,message),starts_at=$5,ends_at=$6,active=COALESCE($7,active),updated_at=now() WHERE id=$8 RETURNING *`,[v.routeId||null,v.busId||null,p.title??null,p.message??null,v.startsAt,v.endsAt||null,p.active??null,alertId]);
  ok(res,mapAlert(r.rows[0]));
}
export async function deleteAlert(req,res){const alertId=id.parse(req.params.id);const r=await query('DELETE FROM service_alerts WHERE id=$1 RETURNING id',[alertId]);if(!r.rowCount)return fail(res,404,'NOT_FOUND','Service alert not found');ok(res,{deleted:true,id:alertId});}

export async function getPreferences(req,res){
  const r=await query(`INSERT INTO notification_preferences(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET updated_at=notification_preferences.updated_at RETURNING *`,[req.passenger.id]);
  ok(res,prefRow(r.rows[0]));
}
export async function updatePreferences(req,res){
  const p=prefSchema.parse(req.body); const keys={pushEnabled:'push_enabled',smsEnabled:'sms_enabled',whatsappEnabled:'whatsapp_enabled',emailEnabled:'email_enabled',serviceAlertsEnabled:'service_alerts_enabled',promotionalEnabled:'promotional_enabled'};
  const fields=[]; const vals=[req.passenger.id]; for(const [k,col] of Object.entries(keys)){if(p[k]!==undefined){vals.push(p[k]);fields.push(`${col}=$${vals.length}`)}}
  if(!fields.length)return getPreferences(req,res);
  const insertCols=fields.map(x=>x.split('=')[0]);
  fields.push('updated_at=now()');
  const r=await query(`INSERT INTO notification_preferences(user_id,${insertCols.join(',')}) VALUES($1,${insertCols.map((_,i)=>`$${i+2}`).join(',')}) ON CONFLICT(user_id) DO UPDATE SET ${fields.join(',')} RETURNING *`,vals);
  ok(res,prefRow(r.rows[0]));
}
export async function myNotifications(req,res){const r=await query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.passenger.id]);ok(res,r.rows.map(n=>({id:n.id,channel:n.channel,title:n.title,body:n.body,status:n.status,sentAt:n.sent_at,createdAt:n.created_at})));}

function enabled(pref, ch, promotional){ if(promotional&&!pref.promotional_enabled)return false; if(!promotional&&!pref.service_alerts_enabled)return false; return ({PUSH:'push_enabled',SMS:'sms_enabled',WHATSAPP:'whatsapp_enabled',EMAIL:'email_enabled'})[ch] ? pref[({PUSH:'push_enabled',SMS:'sms_enabled',WHATSAPP:'whatsapp_enabled',EMAIL:'email_enabled'})[ch]] : false; }
export async function sendNotification(req,res){
  const p=sendSchema.parse(req.body); if(!p.userId)return fail(res,400,'USER_REQUIRED','userId is required for direct notification');
  const pref=(await query('SELECT * FROM notification_preferences WHERE user_id=$1',[p.userId])).rows[0] || {push_enabled:true,sms_enabled:true,whatsapp_enabled:true,email_enabled:true,service_alerts_enabled:true,promotional_enabled:true};
  if(!enabled(pref,p.channel,p.promotional))return fail(res,409,'CHANNEL_DISABLED','Notification channel/category is disabled for this user');
  const n=await query(`INSERT INTO notifications(user_id,channel,title,body,status) VALUES($1,$2,$3,$4,'PENDING') RETURNING *`,[p.userId,p.channel,p.title,p.body]);
  await query(`INSERT INTO notification_deliveries(notification_id,status) VALUES($1,'QUEUED')`,[n.rows[0].id]);
  ok(res,{id:n.rows[0].id,status:'QUEUED',provider:'ABSTRACT'},202);
}
export async function broadcastAlert(req,res){
  const p=broadcastSchema.parse(req.body); if(!p.routeId&&!p.busId)return fail(res,400,'TARGET_REQUIRED','Broadcast must target a route or bus');
  if(p.endsAt&&new Date(p.endsAt)<=new Date(p.startsAt))return fail(res,400,'INVALID_WINDOW','endsAt must be after startsAt');
  const users=await query(`SELECT u.id,COALESCE(np.push_enabled,true) push_enabled,COALESCE(np.sms_enabled,true) sms_enabled,COALESCE(np.whatsapp_enabled,true) whatsapp_enabled,COALESCE(np.email_enabled,true) email_enabled,COALESCE(np.service_alerts_enabled,true) service_alerts_enabled,COALESCE(np.promotional_enabled,true) promotional_enabled FROM users u LEFT JOIN notification_preferences np ON np.user_id=u.id`);
  const created=await withTransaction(async client=>{
    const a=await client.query(`INSERT INTO service_alerts(route_id,bus_id,title,message,starts_at,ends_at,active,created_by) VALUES($1,$2,$3,$4,$5,$6,true,$7) RETURNING id`,[p.routeId||null,p.busId||null,p.title,p.message,p.startsAt,p.endsAt||null,req.auth.id]);
    let count=0;
    for(const u of users.rows){for(const ch of p.channels){const col={PUSH:'push_enabled',SMS:'sms_enabled',WHATSAPP:'whatsapp_enabled',EMAIL:'email_enabled'}[ch];if(!u[col]||(!p.promotional&&!u.service_alerts_enabled)||(p.promotional&&!u.promotional_enabled))continue;const n=await client.query(`INSERT INTO notifications(user_id,channel,title,body,status) VALUES($1,$2,$3,$4,'PENDING') RETURNING id`,[u.id,ch,p.title,p.message]);await client.query(`INSERT INTO notification_deliveries(notification_id,status) VALUES($1,'QUEUED')`,[n.rows[0].id]);count++;}}
    return {alertId:a.rows[0].id,queuedNotifications:count};
  });
  ok(res,created,202);
}
