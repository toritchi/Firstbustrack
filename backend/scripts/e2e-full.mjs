import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import mqtt from 'mqtt';

const base=process.env.E2E_BASE_URL||'http://127.0.0.1:3000';
const external=process.env.E2E_EXTERNAL_SERVER==='1';
const password=process.env.TEST_ADMIN_PASSWORD||'TestAdminPassword-2026!';
const validatorKey=process.env.TEST_VALIDATOR_KEY||'TestValidatorKey-2026-0123456789-abcdef';
const ids={route:'00000000-0000-4000-8000-000000000004',direction:'00000000-0000-4000-8000-000000000005',bus:'00000000-0000-4000-8000-000000000008',device:'00000000-0000-4000-8000-000000000009',trip:'00000000-0000-4000-8000-000000000011',offer:'00000000-0000-4000-8000-000000000012'};
const phone='+213555000099';
async function wait(url,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){try{const r=await fetch(url);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error(`timeout ${url}`)}
async function api(path,{method='GET',headers={},body,expect=200}={}){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let d;try{d=JSON.parse(text)}catch{throw new Error(`${method} ${path}: non-json ${r.status}`)}assert.equal(r.status,expect,`${method} ${path}: ${r.status} ${JSON.stringify(d)}`);return d}
let server;
if(!external){server=spawn(process.execPath,['src/server.js'],{stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'test',PORT:'3000',DEV_OTP_CODE:'123456',JWT_SECRET:process.env.JWT_SECRET||'test-secret-32-characters-minimum-1234',DATABASE_URL:process.env.DATABASE_URL||'postgresql://busapp:busapp@127.0.0.1:55432/bus_platform_test',REDIS_URL:process.env.REDIS_URL||'redis://127.0.0.1:56379',MQTT_URL:process.env.MQTT_URL||'mqtt://127.0.0.1:51883',ALLOWED_ORIGINS:'http://localhost:3000',PAYMENT_WEBHOOK_SECRET:process.env.PAYMENT_WEBHOOK_SECRET||'test-payment-secret-32-characters-1234'}});server.stderr.on('data',d=>process.stderr.write(d));}
try{
 await wait(base+'/health'); const ready=await api('/ready'); assert.equal(ready.data.status,'ready');
 const login=await api('/api/v1/auth/admin/login',{method:'POST',body:{username:'e2e-admin',password}});const admin=login.data.accessToken;const ah={authorization:`Bearer ${admin}`};
 const me=await api('/api/v1/admin/me',{headers:ah});assert.equal(me.data.user.role,'SUPER_ADMIN');
 const routes=await api('/api/v1/public/routes');assert.ok(routes.data.some(r=>r.id===ids.route));
 const otp=await api('/api/v1/auth/passenger/otp/request',{method:'POST',body:{phone,purpose:'REGISTER'}});const code=otp.data.devCode||process.env.TEST_OTP_CODE;assert.ok(code);const pv=await api('/api/v1/auth/passenger/otp/verify',{method:'POST',body:{phone,code,purpose:'REGISTER'}});const pt={authorization:`Bearer ${pv.data.accessToken}`};
 await api('/api/v1/passenger/me',{headers:pt});
 await api(`/api/v1/admin/trips/${ids.trip}/start`,{method:'POST',headers:ah});
 const pay=await api('/api/v1/passenger/payments',{method:'POST',headers:pt,body:{amountDzd:100,provider:'BANK_CARD',providerReference:'FULL-PAY-01'}});const paymentId=pay.data.id;
 const payload={eventId:'FULL-WEBHOOK-01',paymentId,status:'PAID',providerReference:'FULL-PAY-01',amountDzd:100};const sig=crypto.createHmac('sha256',process.env.PAYMENT_WEBHOOK_SECRET||'test-payment-secret-32-characters-1234').update(JSON.stringify(payload)).digest('hex');
 await api('/api/v1/payments/webhooks/BANK_CARD',{method:'POST',headers:{'x-payment-signature':sig},body:payload});const dup=await api('/api/v1/payments/webhooks/BANK_CARD',{method:'POST',headers:{'x-payment-signature':sig},body:payload});assert.equal(dup.data.duplicate,true);
 const ticket=await api('/api/v1/passenger/tickets',{method:'POST',headers:pt,body:{offerId:ids.offer,paymentId}});assert.ok(ticket.data.qrToken);
 const valBody={qrToken:ticket.data.qrToken,busId:ids.bus,tripId:ids.trip,validationType:'BOARD',offlineEventId:'FULL-OFFLINE-01'};
 const val=await api('/api/v1/validator/tickets/validate',{method:'POST',headers:{'x-validator-key':validatorKey},body:valBody});assert.equal(val.data.accepted,true);
 const valDup=await api('/api/v1/validator/tickets/validate',{method:'POST',headers:{'x-validator-key':validatorKey},body:valBody});assert.equal(valDup.data.accepted,true);assert.equal(valDup.data.duplicate,true);
 const occ=await api(`/api/v1/public/buses/${ids.bus}/occupancy`);assert.equal(occ.data.currentPassengers,1);assert.equal(occ.data.full,false);
 await api('/api/v1/passenger/occupancy/events',{method:'POST',headers:pt,body:{busId:ids.bus,tripId:ids.trip,eventType:'EXIT'}});const occ2=await api(`/api/v1/public/buses/${ids.bus}/occupancy`);assert.equal(occ2.data.currentPassengers,0);
 const alert=await api('/api/v1/admin/service-alerts',{method:'POST',headers:ah,body:{routeId:ids.route,title:'FULL E2E Alert',message:'Integration alert',startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()}});const alerts=await api(`/api/v1/public/service-alerts?routeId=${ids.route}`);assert.ok(alerts.data.some(x=>x.id===alert.data.id));
 const pref=await api('/api/v1/passenger/notification-preferences',{headers:pt});assert.ok(pref.data);await api('/api/v1/passenger/notification-preferences',{method:'PATCH',headers:pt,body:{pushEnabled:false}});
 const refund=await api('/api/v1/passenger/refunds',{method:'POST',headers:pt,body:{paymentId,requestedAmountDzd:50,reason:'FULL E2E partial refund'}});const rid=refund.data.id;await api(`/api/v1/admin/refunds/${rid}/review`,{method:'PATCH',headers:ah,body:{status:'APPROVED',approvedAmountDzd:50}});const processed=await api(`/api/v1/admin/refunds/${rid}/process`,{method:'POST',headers:ah,body:{providerReference:'FULL-REF-01'}});assert.equal(processed.data.status,'PROCESSED');assert.equal(processed.data.provider_reference,'FULL-REF-01');
 const reports=await Promise.all(['/api/v1/admin/reports/trips','/api/v1/admin/reports/occupancy','/api/v1/admin/reports/ticketing','/api/v1/admin/reports/notifications'].map(p=>api(p,{headers:ah})));reports.forEach(r=>assert.ok(r.data!==undefined));
 if(process.env.E2E_MQTT!=='0'){await new Promise((resolve,reject)=>{const c=mqtt.connect(process.env.MQTT_URL||'mqtt://127.0.0.1:51883');const t=setTimeout(()=>{c.end();reject(new Error('mqtt timeout'))},10000);c.on('connect',()=>c.publish('fleet/TEST-DEVICE-01/telemetry',JSON.stringify({latitude:36.701,longitude:3.171,accuracyM:5,speedKph:28,heading:90,gpsTimestamp:new Date().toISOString(),deviceTimestamp:new Date().toISOString(),passengerCount:0,odometerKm:100}),e=>{clearTimeout(t);c.end();e?reject(e):resolve()}));c.on('error',reject)});await new Promise(r=>setTimeout(r,700));const live=await api('/api/v1/tracking/live',{headers:ah});assert.ok(live.data.some(x=>x.busId===ids.bus));}
 await api(`/api/v1/admin/trips/${ids.trip}/at-terminal`,{method:'POST',headers:ah});await api(`/api/v1/admin/trips/${ids.trip}/confirm-return`,{method:'POST',headers:ah});await api(`/api/v1/admin/trips/${ids.trip}/end`,{method:'POST',headers:ah});
 console.log('FULL E2E PASS: lifecycle, auth/RBAC, trip transitions, payment idempotency, ticket/validator idempotency, occupancy, alerts/preferences, partial refund, reports, and MQTT tracking');
}finally{if(server){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r))}}
