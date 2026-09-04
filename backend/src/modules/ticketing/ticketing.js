import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, withTransaction } from '../../database/db.js';
import { ok, fail } from '../../utils/response.js';

const id=z.string().uuid();
const ticketType=z.enum(['SINGLE','RETURN','DAILY','WEEKLY','MONTHLY','STUDENT','EMPLOYEE']);
const rules=z.record(z.string(),z.any()).default({});
const offerCreate=z.object({name:z.string().trim().min(1).max(150),ticketType,priceDzd:z.number().nonnegative(),rules,validFrom:z.string().datetime({offset:true}),validUntil:z.string().datetime({offset:true}).optional(),active:z.boolean().default(true)}).strict();
const offerPatch=offerCreate.partial().refine(v=>Object.keys(v).length>0,{message:'At least one field is required'});
const purchase=z.object({offerId:id,paymentId:id}).strict();
const validate=z.object({qrToken:z.string().trim().min(16).max(512),busId:id.optional(),tripId:id.optional(),validationType:z.enum(['BOARD','EXIT']),offlineEventId:z.string().trim().min(1).max(150).optional(),validatedAt:z.string().datetime({offset:true}).optional()}).strict();

function rawQr(){return crypto.randomBytes(32).toString('base64url');}
function hashQr(token){return crypto.createHash('sha256').update(token).digest('hex');}
function priceRulesMatch(rules, ctx){
  if (!rules || typeof rules!=='object') return true;
  if (rules.cityId && rules.cityId!==ctx.cityId) return false;
  if (rules.routeId && rules.routeId!==ctx.routeId) return false;
  if (rules.passengerCategory && rules.passengerCategory!==ctx.passengerCategory) return false;
  if (rules.busType && rules.busType!==ctx.busType) return false;
  if (rules.maxDistanceKm!=null && (ctx.distanceKm==null || Number(ctx.distanceKm)>Number(rules.maxDistanceKm))) return false;
  if (rules.minDistanceKm!=null && (ctx.distanceKm==null || Number(ctx.distanceKm)<Number(rules.minDistanceKm))) return false;
  if (Array.isArray(rules.hours) && ctx.hour!=null && !rules.hours.includes(ctx.hour)) return false;
  return true;
}

export async function listOffers(req,res){
  const q=await query(`SELECT id,name,ticket_type AS "ticketType",price_dzd AS "priceDzd",rules,valid_from AS "validFrom",valid_until AS "validUntil",active,created_at AS "createdAt" FROM ticket_offers WHERE active=true AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) ORDER BY created_at DESC`); ok(res,q.rows);
}
export async function createOffer(req,res){
  const p=offerCreate.parse(req.body);
  if(p.validUntil && new Date(p.validUntil)<=new Date(p.validFrom)) return fail(res,400,'INVALID_VALIDITY','validUntil must be after validFrom');
  const q=await query(`INSERT INTO ticket_offers(name,ticket_type,price_dzd,rules,valid_from,valid_until,active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,ticket_type AS "ticketType",price_dzd AS "priceDzd",rules,valid_from AS "validFrom",valid_until AS "validUntil",active`,[p.name,p.ticketType,p.priceDzd,p.rules,p.validFrom,p.validUntil||null,p.active]); ok(res,q.rows[0],201);
}
export async function updateOffer(req,res){
  const p=offerPatch.parse(req.body); const offer=id.parse(req.params.id);
  const current=await query('SELECT * FROM ticket_offers WHERE id=$1',[offer]); if(!current.rowCount)return fail(res,404,'NOT_FOUND','Ticket offer not found');
  const c=current.rows[0]; const merged={name:p.name??c.name,ticketType:p.ticketType??c.ticket_type,priceDzd:p.priceDzd??Number(c.price_dzd),rules:p.rules??c.rules,validFrom:p.validFrom??c.valid_from.toISOString(),validUntil:p.validUntil??(c.valid_until?.toISOString()),active:p.active??c.active};
  if(merged.validUntil && new Date(merged.validUntil)<=new Date(merged.validFrom)) return fail(res,400,'INVALID_VALIDITY','validUntil must be after validFrom');
  const q=await query(`UPDATE ticket_offers SET name=$1,ticket_type=$2,price_dzd=$3,rules=$4,valid_from=$5,valid_until=$6,active=$7 WHERE id=$8 RETURNING id,name,ticket_type AS "ticketType",price_dzd AS "priceDzd",rules,valid_from AS "validFrom",valid_until AS "validUntil",active`,[merged.name,merged.ticketType,merged.priceDzd,merged.rules,merged.validFrom,merged.validUntil||null,merged.active,offer]); ok(res,q.rows[0]);
}
export async function deleteOffer(req,res){const offer=id.parse(req.params.id); try{await query('DELETE FROM ticket_offers WHERE id=$1',[offer]); ok(res,{deleted:true});}catch(e){throw e;}}

export async function price(req,res){
  const p=z.object({offerId:id,cityId:id.optional(),routeId:id.optional(),passengerCategory:z.string().trim().max(50).optional(),busType:z.string().trim().max(50).optional(),distanceKm:z.number().nonnegative().optional(),at:z.string().datetime({offset:true}).optional()}).strict().parse(req.query);
  const q=await query('SELECT id,name,ticket_type,price_dzd,rules,valid_from,valid_until,active FROM ticket_offers WHERE id=$1',[p.offerId]); if(!q.rowCount)return fail(res,404,'NOT_FOUND','Ticket offer not found');
  const o=q.rows[0]; const at=p.at?new Date(p.at):new Date(); if(!o.active || new Date(o.valid_from)>at || (o.valid_until&&new Date(o.valid_until)<=at)) return fail(res,409,'OFFER_NOT_ACTIVE','Ticket offer is not active at the requested time');
  const ctx={...p,hour:at.getHours()}; if(!priceRulesMatch(o.rules,ctx))return fail(res,409,'OFFER_NOT_APPLICABLE','Ticket offer rules do not match the request');
  ok(res,{offerId:o.id,name:o.name,ticketType:o.ticket_type,priceDzd:Number(o.price_dzd),currency:'DZD'});
}

export async function purchaseTicket(req,res){
  const p=purchase.parse(req.body);
  const result=await withTransaction(async client=>{
    const offer=(await client.query('SELECT * FROM ticket_offers WHERE id=$1 FOR SHARE',[p.offerId])).rows[0];
    if(!offer) throw Object.assign(new Error('Ticket offer not found'),{status:404,code:'NOT_FOUND'});
    const payment=(await client.query('SELECT id,user_id,amount_dzd,status,ticket_id FROM payments WHERE id=$1 FOR UPDATE',[p.paymentId])).rows[0];
    if(!payment || payment.user_id!==req.passenger.id) throw Object.assign(new Error('Payment not found for passenger'),{status:404,code:'PAYMENT_NOT_FOUND'});
    if(payment.status!=='PAID') throw Object.assign(new Error('Ticket can only be issued for a paid payment'),{status:409,code:'PAYMENT_NOT_PAID'});
    if(payment.ticket_id) throw Object.assign(new Error('Payment is already associated with a ticket'),{status:409,code:'PAYMENT_ALREADY_USED'});
    const now=new Date();
    if(!offer.active||new Date(offer.valid_from)>now||(offer.valid_until&&new Date(offer.valid_until)<=now)) throw Object.assign(new Error('Ticket offer is not active'),{status:409,code:'OFFER_NOT_ACTIVE'});
    if(Number(payment.amount_dzd)!==Number(offer.price_dzd)) throw Object.assign(new Error('Payment amount does not match ticket price'),{status:409,code:'AMOUNT_MISMATCH'});
    const raw=rawQr(), hash=hashQr(raw), validFrom=now, validUntil=new Date(now);
    if(offer.ticket_type==='SINGLE'||offer.ticket_type==='RETURN') validUntil.setHours(23,59,59,999);
    else if(offer.ticket_type==='DAILY') validUntil.setDate(validUntil.getDate()+1);
    else if(offer.ticket_type==='WEEKLY') validUntil.setDate(validUntil.getDate()+7);
    else validUntil.setMonth(validUntil.getMonth()+1);
    const t=(await client.query(`INSERT INTO tickets(user_id,offer_id,qr_token_hash,purchased_at,valid_from,valid_until,status) VALUES($1,$2,$3,now(),$4,$5,'ACTIVE') RETURNING id,offer_id,purchased_at,valid_from,valid_until,status`,[req.passenger.id,offer.id,hash,validFrom.toISOString(),validUntil.toISOString()])).rows[0];
    await client.query('UPDATE payments SET ticket_id=$1 WHERE id=$2',[t.id,p.paymentId]);
    return {...t,qrToken:raw,ticketType:offer.ticket_type,priceDzd:Number(offer.price_dzd)};
  });
  ok(res,result,201);
}

export async function myTickets(req,res){const q=await query(`SELECT t.id,t.offer_id AS "offerId",o.name,o.ticket_type AS "ticketType",o.price_dzd AS "priceDzd",t.purchased_at AS "purchasedAt",t.valid_from AS "validFrom",t.valid_until AS "validUntil",t.status FROM tickets t JOIN ticket_offers o ON o.id=t.offer_id WHERE t.user_id=$1 ORDER BY t.purchased_at DESC`,[req.passenger.id]); ok(res,q.rows);}

async function validatorFromKey(key){if(!key)return null; const r=await query('SELECT id,bus_id,active,validator_key_hash FROM devices WHERE active=true AND validator_key_hash IS NOT NULL'); for(const d of r.rows){if(await bcrypt.compare(key,d.validator_key_hash))return d;} return null;}
export async function validateTicket(req,res){
  const key=req.get('x-validator-key'); const device=await validatorFromKey(key); if(!device)return fail(res,401,'VALIDATOR_UNAUTHENTICATED','Invalid validator credentials');
  const p=validate.parse(req.body); const hash=hashQr(p.qrToken); const now=p.validatedAt?new Date(p.validatedAt):new Date();
  const q=await query(`SELECT t.id,t.user_id,t.status,t.valid_from,t.valid_until,o.ticket_type,o.price_dzd FROM tickets t JOIN ticket_offers o ON o.id=t.offer_id WHERE t.qr_token_hash=$1`,[hash]); if(!q.rowCount)return fail(res,404,'TICKET_NOT_FOUND','Ticket QR is not recognized'); const t=q.rows[0];
  if(t.status!=='ACTIVE')return fail(res,409,'TICKET_NOT_ACTIVE',`Ticket status is ${t.status}`); if(new Date(t.valid_from)>now||new Date(t.valid_until)<=now)return fail(res,409,'TICKET_EXPIRED','Ticket is outside its validity period');
  if(p.busId && p.busId!==device.bus_id)return fail(res,403,'BUS_MISMATCH','Validator is not assigned to the supplied bus');
  const busId=p.busId||device.bus_id;
  if(p.validationType==='EXIT' && t.ticket_type==='SINGLE') return fail(res,409,'TICKET_EXIT_NOT_ALLOWED','A single-journey ticket does not support an exit validation');
  const prior=await query(`SELECT count(*)::int AS count FROM ticket_validations WHERE ticket_id=$1 AND validation_type='BOARD'`,[t.id]);
  const boardCount=prior.rows[0].count;
  if(t.ticket_type==='SINGLE' && boardCount>=1) return fail(res,409,'TICKET_ALREADY_USED','Single-journey ticket has already been boarded');
  if(t.ticket_type==='RETURN' && boardCount>=2) return fail(res,409,'RETURN_TICKET_EXHAUSTED','Return ticket has no remaining journey');
  if(p.offlineEventId){const existing=await query('SELECT id FROM ticket_validations WHERE offline_event_id=$1',[p.offlineEventId]);if(existing.rowCount)return ok(res,{accepted:false,duplicate:true,validationId:existing.rows[0].id});}
  const v=await query(`INSERT INTO ticket_validations(ticket_id,bus_id,trip_id,validation_type,validated_at,offline_event_id,synced_at) VALUES($1,$2,$3,$4,$5,$6,now()) RETURNING id,ticket_id,bus_id,trip_id,validation_type,validated_at AS "validatedAt"`,[t.id,busId,p.tripId||null,p.validationType,now.toISOString(),p.offlineEventId||null]);
  if(p.validationType==='BOARD' && t.ticket_type==='SINGLE') await query("UPDATE tickets SET status='USED' WHERE id=$1",[t.id]);
  ok(res,{accepted:true,validation:v.rows[0],ticket:{id:t.id,ticketType:t.ticket_type,validUntil:t.valid_until}});
}

export async function syncValidator(req,res){
  const key=req.get('x-validator-key'); const device=await validatorFromKey(key); if(!device)return fail(res,401,'VALIDATOR_UNAUTHENTICATED','Invalid validator credentials');
  const q=await query(`SELECT id,qr_token_hash AS "qrTokenHash",valid_from AS "validFrom",valid_until AS "validUntil",status FROM tickets WHERE status='ACTIVE' AND valid_until>now() ORDER BY id`); ok(res,{deviceId:device.id,busId:device.bus_id,generatedAt:new Date().toISOString(),tickets:q.rows});
}

export async function setValidatorKey(req,res){
  const p=z.object({validatorKey:z.string().min(32).max(256)}).strict().parse(req.body); const device=id.parse(req.params.id); const hash=await bcrypt.hash(p.validatorKey,12); const q=await query('UPDATE devices SET validator_key_hash=$1 WHERE id=$2 RETURNING id,device_identifier,bus_id',[hash,device]); if(!q.rowCount)return fail(res,404,'NOT_FOUND','Device not found'); ok(res,{...q.rows[0],validatorKeyConfigured:true});}
