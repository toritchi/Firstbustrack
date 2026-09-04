import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import mqtt from 'mqtt';

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const dbReady = process.env.E2E_EXTERNAL_SERVER === '1';
const adminPassword = process.env.TEST_ADMIN_PASSWORD || 'TestAdminPassword-2026!';
const validatorKey = process.env.TEST_VALIDATOR_KEY || 'TestValidatorKey-2026-0123456789-abcdef';
const deviceId='TEST-DEVICE-01';
const busId='00000000-0000-4000-8000-000000000008';
const tripId='00000000-0000-4000-8000-000000000011';
const offerId='00000000-0000-4000-8000-000000000012';

async function wait(url, timeout=30000){const end=Date.now()+timeout; while(Date.now()<end){try{const r=await fetch(url);if(r.ok)return;}catch{} await new Promise(r=>setTimeout(r,500));} throw new Error(`Timeout waiting for ${url}`);}
async function api(path,{method='GET',headers={},body}={}){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data;try{data=JSON.parse(text)}catch{throw new Error(`${method} ${path}: non-JSON ${r.status} ${text}`)};assert.equal(r.ok,true,`${method} ${path}: ${r.status} ${JSON.stringify(data)}`);return data;}

let server;
if(!dbReady){ server=spawn(process.execPath,['src/server.js'],{stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'test',PORT:'3000',DEV_OTP_CODE:'123456',JWT_SECRET:process.env.JWT_SECRET||'test-secret-32-characters-minimum-1234',DATABASE_URL:process.env.DATABASE_URL||'postgresql://busapp:busapp@127.0.0.1:5432/bus_platform',REDIS_URL:process.env.REDIS_URL||'redis://127.0.0.1:6379',MQTT_URL:process.env.MQTT_URL||'mqtt://127.0.0.1:1883',ALLOWED_ORIGINS:'http://localhost:3000'}}); server.stderr.on('data',d=>process.stderr.write(d));}
try {
  await wait(base+'/health');
  const ready=await api('/ready'); assert.equal(ready.data.status,'ready');
  const login=await api('/api/v1/auth/admin/login',{method:'POST',body:{username:'e2e-admin',password:adminPassword}}); const admin=login.data.accessToken;
  const routes=await api('/api/v1/public/routes'); assert.ok(Array.isArray(routes.data));
  const otp=await api('/api/v1/auth/passenger/otp/request',{method:'POST',body:{phone:'+213555000001',purpose:'REGISTER'}}); const code=otp.data.devCode||process.env.TEST_OTP_CODE; assert.ok(code,'Development OTP code is required for local E2E');
  const passenger=await api('/api/v1/auth/passenger/otp/verify',{method:'POST',body:{phone:'+213555000001',code,purpose:'REGISTER'}}); const token=passenger.data.accessToken;
  await api('/api/v1/passenger/me',{headers:{authorization:`Bearer ${token}`}});
  const payment=await api('/api/v1/passenger/payments',{method:'POST',headers:{authorization:`Bearer ${token}`},body:{amountDzd:100,provider:'BANK_CARD',providerReference:'E2E-PAY-01'}}); const paymentId=payment.data.id;
  const payload={eventId:'E2E-WEBHOOK-01',paymentId,status:'PAID',providerReference:'E2E-PAY-01',amountDzd:100};
  const crypto=await import('node:crypto'); const sig=crypto.createHmac('sha256',process.env.PAYMENT_WEBHOOK_SECRET||'test-payment-secret-32-characters-1234').update(JSON.stringify(payload)).digest('hex');
  await api('/api/v1/payments/webhooks/BANK_CARD',{method:'POST',headers:{'x-payment-signature':sig},body:payload});
  const ticket=await api('/api/v1/passenger/tickets',{method:'POST',headers:{authorization:`Bearer ${token}`},body:{offerId,paymentId}}); const qr=ticket.data.qrToken; assert.ok(qr);
  const validation=await api('/api/v1/validator/tickets/validate',{method:'POST',headers:{'x-validator-key':validatorKey},body:{qrToken:qr,busId,tripId,validationType:'BOARD',offlineEventId:'E2E-OFFLINE-01'}}); assert.equal(validation.data.accepted,true);
  const occupancy=await api(`/api/v1/public/buses/${busId}/occupancy`); assert.equal(occupancy.data.currentPassengers,1);
  const alert=await api('/api/v1/admin/service-alerts',{method:'POST',headers:{authorization:`Bearer ${admin}`},body:{routeId:'00000000-0000-4000-8000-000000000004',title:'E2E Alert',message:'Integration test alert',startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()}}); assert.ok(alert.data.id);
  const alerts=await api('/api/v1/public/service-alerts?routeId=00000000-0000-4000-8000-000000000004'); assert.ok(alerts.data.some(x=>x.id===alert.data.id));
  const report=await api('/api/v1/admin/reports/ticketing',{headers:{authorization:`Bearer ${admin}`}}); assert.ok(report.data!==undefined);
  if(process.env.E2E_MQTT!=='0'){
    await new Promise((resolve,reject)=>{const c=mqtt.connect(process.env.MQTT_URL||'mqtt://127.0.0.1:1883'); const timer=setTimeout(()=>{c.end();reject(new Error('MQTT E2E timeout'))},10000); c.on('connect',()=>{c.publish(`fleet/${deviceId}/telemetry`,JSON.stringify({latitude:36.701,longitude:3.171,accuracyM:5,speedKph:28,heading:90,gpsTimestamp:new Date().toISOString(),deviceTimestamp:new Date().toISOString(),passengerCount:1,odometerKm:100}),e=>{clearTimeout(timer);c.end();e?reject(e):resolve();});}); c.on('error',reject);});
    await new Promise(r=>setTimeout(r,800)); const live=await api('/api/v1/tracking/live',{headers:{authorization:`Bearer ${admin}`}}); assert.ok(live.data.some(x=>x.busId===busId));
  }
  console.log('E2E PASS: health/readiness, auth, public routes, passenger OTP, payment webhook, ticket issuance, validator, occupancy, service alert, reporting'+(process.env.E2E_MQTT==='0'?'':' and MQTT tracking'));
} finally {if(server){server.kill('SIGTERM'); await new Promise(r=>server.once('exit',r));}}
