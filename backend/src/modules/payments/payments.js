import crypto from 'node:crypto';
import { z } from 'zod';
import { query, withTransaction } from '../../database/db.js';
import { ok, fail } from '../../utils/response.js';
import { env } from '../../config/env.js';

const id=z.string().uuid();
const providers=z.enum(['CIB','EDAHABIA','MOBILE_PAYMENT','BANK_CARD','INTERNATIONAL_CARD','CASH']);
const paymentStatus=z.enum(['PENDING','PAID','FAILED','REFUNDED','PARTIALLY_REFUNDED']);
const createPaymentSchema=z.object({ticketId:id.optional(),amountDzd:z.number().positive(),provider:providers,providerReference:z.string().trim().max(200).optional()}).strict();
const webhook=z.object({eventId:z.string().trim().min(1).max(200),paymentId:id,status:z.enum(['PENDING','PAID','FAILED','REFUNDED','PARTIALLY_REFUNDED']),providerReference:z.string().trim().max(200).optional(),amountDzd:z.number().nonnegative().optional()}).strict();
const refundCreate=z.object({paymentId:id,requestedAmountDzd:z.number().positive(),reason:z.string().trim().min(1).max(500)}).strict();
const refundReview=z.object({status:z.enum(['APPROVED','REJECTED']),approvedAmountDzd:z.number().positive().optional(),reason:z.string().trim().max(500).optional()}).strict();
const refundProcess=z.object({providerReference:z.string().trim().max(200).optional()}).strict();

function sign(payload){
  const secret=env.PAYMENT_WEBHOOK_SECRET;
  if(!secret)return null;
  return crypto.createHmac('sha256',secret).update(payload).digest('hex');
}
function safePayment(r){return {id:r.id,ticketId:r.ticket_id,userId:r.user_id,provider:r.provider,providerReference:r.provider_reference,amountDzd:Number(r.amount_dzd),status:r.status,createdAt:r.created_at};}

export async function createPayment(req,res){
  const p=createPaymentSchema.parse(req.body);
  if(p.provider==='CASH' && !p.providerReference)return fail(res,400,'REFERENCE_REQUIRED','Cash payments require a reference');
  const r=await withTransaction(async client=>{
    if(p.ticketId){
      const t=(await client.query('SELECT id,user_id FROM tickets WHERE id=$1 FOR SHARE',[p.ticketId])).rows[0];
      if(!t || t.user_id!==req.passenger.id) throw Object.assign(new Error('Ticket not found for passenger'),{status:404,code:'TICKET_NOT_FOUND'});
      const existing=(await client.query("SELECT id FROM payments WHERE ticket_id=$1 AND status IN ('PENDING','PAID') FOR SHARE LIMIT 1",[p.ticketId])).rows[0];
      if(existing) throw Object.assign(new Error('An active payment already exists for this ticket'),{status:409,code:'PAYMENT_EXISTS'});
    }
    return (await client.query(`INSERT INTO payments(ticket_id,user_id,provider,provider_reference,amount_dzd,status) VALUES($1,$2,$3,$4,$5,'PENDING') RETURNING *`,[p.ticketId||null,req.passenger.id,p.provider,p.providerReference||null,p.amountDzd])).rows[0];
  });
  ok(res,safePayment(r),201);
}
export async function myPayments(req,res){const r=await query('SELECT * FROM payments WHERE user_id=$1 ORDER BY created_at DESC',[req.passenger.id]);ok(res,r.rows.map(safePayment));}

export async function providerWebhook(req,res){
  const raw=Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(JSON.stringify(req.body));
  const expected=sign(raw); const supplied=req.get('x-payment-signature');
  if(expected && (!supplied || Buffer.byteLength(supplied)!==Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(supplied))))return fail(res,401,'INVALID_SIGNATURE','Invalid payment webhook signature');
  const provider=providers.parse(req.params.provider);
  const p=webhook.parse(req.body);
  const result=await withTransaction(async client=>{
    const inserted=await client.query(`INSERT INTO payment_webhook_events(provider,provider_event_id,payload) VALUES($1,$2,$3) ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING id`,[provider,p.eventId,p]);
    if(!inserted.rowCount)return {duplicate:true};
    const pay=(await client.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE',[p.paymentId]));
    if(!pay.rowCount)throw Object.assign(new Error('Payment not found'),{code:'PAYMENT_NOT_FOUND'});
    const current=pay.rows[0];
    if(p.amountDzd!=null && Number(p.amountDzd)!==Number(current.amount_dzd))throw Object.assign(new Error('Webhook amount mismatch'),{code:'AMOUNT_MISMATCH'});
    await client.query('UPDATE payments SET status=$1,provider_reference=COALESCE($2,provider_reference) WHERE id=$3',[p.status,p.providerReference||null,p.paymentId]);
    await client.query('UPDATE payment_webhook_events SET processed_at=now() WHERE id=$1',[inserted.rows[0].id]);
    return {duplicate:false};
  });
  ok(res,{received:true,...result});
}

export async function createRefund(req,res){
  const p=refundCreate.parse(req.body);
  const pay=await query('SELECT id,user_id,amount_dzd,status FROM payments WHERE id=$1',[p.paymentId]);
  if(!pay.rowCount || pay.rows[0].user_id!==req.passenger.id)return fail(res,404,'PAYMENT_NOT_FOUND','Payment not found');
  const payment=pay.rows[0];
  if(!['PAID','PARTIALLY_REFUNDED'].includes(payment.status))return fail(res,409,'PAYMENT_NOT_REFUNDABLE','Payment is not refundable in its current state');
  const already=await query("SELECT COALESCE(SUM(CASE WHEN status IN ('PENDING','APPROVED','PROCESSED') THEN COALESCE(approved_amount_dzd,requested_amount_dzd) ELSE 0 END),0) AS reserved FROM refund_requests WHERE payment_id=$1",[p.paymentId]);
  const remaining=Number(payment.amount_dzd)-Number(already.rows[0].reserved);
  if(p.requestedAmountDzd>remaining)return fail(res,409,'REFUND_EXCEEDS_REMAINING','Requested refund exceeds the remaining refundable amount');
  const r=await query(`INSERT INTO refund_requests(payment_id,user_id,requested_amount_dzd,reason) VALUES($1,$2,$3,$4) RETURNING *`,[p.paymentId,req.passenger.id,p.requestedAmountDzd,p.reason]);
  ok(res,{...r.rows[0],requestedAmountDzd:Number(r.rows[0].requested_amount_dzd)},201);
}
export async function myRefunds(req,res){const r=await query(`SELECT rr.*,p.provider,p.amount_dzd AS payment_amount_dzd FROM refund_requests rr JOIN payments p ON p.id=rr.payment_id WHERE rr.user_id=$1 ORDER BY rr.created_at DESC`,[req.passenger.id]);ok(res,r.rows.map(x=>({...x,requestedAmountDzd:Number(x.requested_amount_dzd),approvedAmountDzd:x.approved_amount_dzd==null?null:Number(x.approved_amount_dzd),paymentAmountDzd:Number(x.payment_amount_dzd)})));}
export async function listRefunds(req,res){const status=req.query.status?z.enum(['PENDING','APPROVED','REJECTED','PROCESSED']).parse(req.query.status):null;const r=await query(`SELECT rr.*,p.provider,p.amount_dzd AS payment_amount_dzd,u.first_name,u.last_name FROM refund_requests rr JOIN payments p ON p.id=rr.payment_id JOIN users u ON u.id=rr.user_id ${status?'WHERE rr.status=$1':''} ORDER BY rr.created_at DESC`,status?[status]:[]);ok(res,r.rows);}
export async function reviewRefund(req,res){const p=refundReview.parse(req.body);const refund=id.parse(req.params.id);const r=await withTransaction(async client=>{const q=await client.query('SELECT rr.*,p.amount_dzd,p.status AS payment_status FROM refund_requests rr JOIN payments p ON p.id=rr.payment_id WHERE rr.id=$1 FOR UPDATE',[refund]);if(!q.rowCount)return null;const x=q.rows[0];if(x.status!=='PENDING')throw Object.assign(new Error('Refund is not pending'),{code:'REFUND_NOT_PENDING'});if(p.status==='APPROVED'){const amount=p.approvedAmountDzd??Number(x.requested_amount_dzd);if(amount<=0||amount>Number(x.requested_amount_dzd))throw Object.assign(new Error('Approved amount is invalid'),{code:'INVALID_REFUND_AMOUNT'});await client.query(`UPDATE refund_requests SET status='APPROVED',approved_amount_dzd=$1,reason=COALESCE($2,reason),reviewed_by=$3,reviewed_at=now() WHERE id=$4`,[amount,p.reason||null,req.auth.id,refund]);}else await client.query(`UPDATE refund_requests SET status='REJECTED',reason=COALESCE($1,reason),reviewed_by=$2,reviewed_at=now() WHERE id=$3`,[p.reason||null,req.auth.id,refund]);return (await client.query('SELECT * FROM refund_requests WHERE id=$1',[refund])).rows[0];});if(!r)return fail(res,404,'NOT_FOUND','Refund request not found');ok(res,r);}
export async function processRefund(req,res){const p=refundProcess.parse(req.body);const refund=id.parse(req.params.id);const r=await withTransaction(async client=>{const q=await client.query('SELECT rr.*,p.id AS payment_id,p.amount_dzd,p.status AS payment_status FROM refund_requests rr JOIN payments p ON p.id=rr.payment_id WHERE rr.id=$1 FOR UPDATE',[refund]);if(!q.rowCount)return null;const x=q.rows[0];if(x.status!=='APPROVED')throw Object.assign(new Error('Refund must be approved before processing'),{code:'REFUND_NOT_APPROVED'});const approved=Number(x.approved_amount_dzd);const prior=(await client.query("SELECT COALESCE(SUM(approved_amount_dzd),0) AS total FROM refund_requests WHERE payment_id=$1 AND status='PROCESSED' AND id<>$2",[x.payment_id,refund])).rows[0];const total=Number(prior.total)+approved;const newStatus=total>=Number(x.amount_dzd)?'REFUNDED':'PARTIALLY_REFUNDED';await client.query("UPDATE refund_requests SET status='PROCESSED',provider_reference=COALESCE($2,provider_reference),reviewed_at=COALESCE(reviewed_at,now()) WHERE id=$1",[refund,p.providerReference||null]);await client.query('UPDATE payments SET status=$1 WHERE id=$2',[newStatus,x.payment_id]);return (await client.query('SELECT rr.*,p.status AS payment_status FROM refund_requests rr JOIN payments p ON p.id=rr.payment_id WHERE rr.id=$1',[refund])).rows[0];});if(!r)return fail(res,404,'NOT_FOUND','Refund request not found');ok(res,r);}
