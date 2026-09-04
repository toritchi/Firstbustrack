import assert from 'node:assert/strict';
import { overview, operations, tripsReport, occupancyReport, ticketingReport, notificationsReport } from '../src/modules/reporting/reporting.js';
assert.equal(typeof overview,'function');
assert.equal(typeof operations,'function');
assert.equal(typeof tripsReport,'function');
assert.equal(typeof occupancyReport,'function');
assert.equal(typeof ticketingReport,'function');
assert.equal(typeof notificationsReport,'function');
console.log('reporting module exports: OK');
