import test from 'node:test';
import assert from 'node:assert/strict';

test('notification module is syntactically loadable', async()=>{
  const m=await import('../src/modules/notifications/notifications.js');
  assert.equal(typeof m.createAlert,'function');
  assert.equal(typeof m.updatePreferences,'function');
  assert.equal(typeof m.broadcastAlert,'function');
});
