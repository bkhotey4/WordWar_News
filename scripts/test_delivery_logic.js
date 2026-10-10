const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DeliveryLedger, briefingSlot } = require('../src/delivery_ledger');
const { freshStateVectors } = require('../src/osint_crawler');

test('scheduled deliveries survive restart and retry only failed recipients', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wordwar-delivery-'));
  const file = path.join(directory, 'ledger.json');
  const now = Date.now();
  const calls = [];
  try {
    await new DeliveryLedger(file).send('morning', ['a', 'a', 'b'], async id => {
      calls.push(id); if (id === 'b') throw new Error('Simulated failure');
    }, now);
    await new DeliveryLedger(file).send('morning', ['a', 'b'], async id => calls.push(id), now + 61_000);
    assert.deepEqual(calls, ['a', 'b', 'b']);
  } finally { if (fs.existsSync(file)) fs.unlinkSync(file); fs.rmdirSync(directory); }
});
test('daily slots use Taiwan time and permit recovery within the scheduled hour', () => {
  assert.equal(briefingSlot(Date.parse('2026-09-26T00:30:00Z')).key, '2026-09-26_MORNING');
  assert.equal(briefingSlot(Date.parse('2026-09-26T12:45:00Z')).type, 'EVENING');
  assert.equal(briefingSlot(Date.parse('2026-09-26T01:00:00Z')), null);
});
test('fresh batch timestamps cannot make stale or unlocated aircraft current', () => {
  const now = Date.now(); const seconds = Math.floor(now / 1000);
  const valid = ['abc', 'TEST', 'Country', seconds - 10, seconds - 10, 120, 24];
  const stale = [...valid]; stale[3] = seconds - 1800;
  const missing = [...valid]; missing[5] = null;
  const outside = [...valid]; outside[5] = 0;
  assert.deepEqual(freshStateVectors({ time: seconds, states: [valid, stale, missing, outside] }, now), [valid]);
  assert.throws(() => freshStateVectors({ states: [valid] }, now));
  assert.throws(() => freshStateVectors({ time: seconds + 3600, states: [valid] }, now));
});
