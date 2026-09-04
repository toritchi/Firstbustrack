import { pool, query } from '../src/database/db.js';
const tables=['occupancy_events','ticket_validations','tickets','refund_requests','payment_webhook_events','payments','notifications','notification_delivery_attempts','service_alerts','eta_travel_observations'];
for(const t of tables) await query(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE`);
console.log('Test transactional data reset. Master/reference data was preserved.');
await pool.end();
