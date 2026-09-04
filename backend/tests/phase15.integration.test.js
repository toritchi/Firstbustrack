import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const migrations=fs.readdirSync(path.join(root,'migrations')).filter(x=>x.endsWith('.sql')).sort();

test('production start uses server entrypoint with MQTT/WebSocket lifecycle',()=>{
  assert.equal(pkg.scripts.start,'node src/server.js');
  assert.equal(pkg.scripts.dev,'node --watch src/server.js');
});

test('all required public/admin/passenger route families are registered',()=>{
  const required=[
    '/api/v1/auth/admin/login','/api/v1/auth/passenger/otp/request','/api/v1/auth/passenger/otp/verify',
    '/api/v1/public/routes','/api/v1/public/stops','/api/v1/public/buses','/api/v1/public/journey-plan',
    '/api/v1/public/service-alerts','/api/v1/public/buses/:busId/occupancy',
    '/api/v1/passenger/me','/api/v1/passenger/tickets','/api/v1/passenger/payments','/api/v1/passenger/refunds',
    '/api/v1/admin/dashboard/overview','/api/v1/admin/reports/trips','/api/v1/admin/reports/ticketing',
    '/api/v1/admin/service-alerts','/api/v1/admin/notifications','/api/v1/admin/refunds',
    '/api/v1/validator/tickets/validate','/api/v1/validator/sync','/api/v1/tracking/live'
  ];
  for(const route of required) assert.ok(app.includes(route),`missing route ${route}`);
});

test('security boundary remains last after all routes',()=>{
  assert.ok(app.lastIndexOf('app.use(notFound)')>app.lastIndexOf('/api/v1/admin/reports/notifications'));
});

test('critical phase 15 fixes are present',()=>{
  const occ=fs.readFileSync(path.join(root,'src/modules/occupancy.js'),'utf8');
  const ticket=fs.readFileSync(path.join(root,'src/modules/ticketing/ticketing.js'),'utf8');
  const pay=fs.readFileSync(path.join(root,'src/modules/payments/payments.js'),'utf8');
  assert.match(occ,/ended_at IS NULL/);
  assert.match(ticket,/FOR UPDATE/);
  assert.match(pay,/withTransaction/);
  assert.ok(migrations.includes('014_phase15_integrity.sql'));
});
