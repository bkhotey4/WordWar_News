const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sh = require('../src/source_health');
const H = 3600_000, now = Date.parse('2026-09-30T00:00:00Z');
const row = (name, hoursAgo, limitHours = 12) => ({ name, lastSuccess: hoursAgo === null ? null : new Date(now - hoursAgo * H).toISOString(), status: 'X', detail: null, limitHours });

test('sources alert once when they go stale and once when they recover', () => {
  const a = sh.planSourceAlerts([row('A', 1), row('B', 13), row('C', null)], {}, now);
  assert.deepEqual(a.down.map(d => d.name), ['B', 'C']);
  assert.equal(a.recovered.length, 0);
  const b = sh.planSourceAlerts([row('A', 1), row('B', 14), row('C', null)], a.next, now + H);
  assert.equal(b.down.length, 0, 'no repeated alert while still down');
  assert.equal(b.next.B.since, a.next.B.since);
  const c = sh.planSourceAlerts([row('A', 1), row('B', 0.5), row('C', null)], b.next, now + 2 * H);
  assert.deepEqual(c.recovered.map(r => r.name), ['B']);
  assert.equal(sh.planSourceAlerts([row('S', 20, 36)], {}, now).down.length, 0, 'per-source limits');
});

test('dispatch DMs the admin and keeps state unchanged when Discord fails', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sh-')), 's.json');
  const failing = { users: { fetch: async () => { throw new Error('offline'); } } };
  await assert.rejects(sh.dispatchSourceAlerts(failing, 'admin', { file, now, rows: [row('B', 13)] }));
  assert.equal(fs.existsSync(file), false);
  const sent = [];
  const ok = { users: { fetch: async id => ({ send: async m => sent.push([id, m.content]) }) } };
  const r = await sh.dispatchSourceAlerts(ok, 'admin', { file, now, rows: [row('B', 13)] });
  assert.deepEqual(r.down, ['B']); assert.equal(sent[0][0], 'admin'); assert.match(sent[0][1], /B：已 13 小時/);
  await sh.dispatchSourceAlerts(ok, 'admin', { file, now: now + H, rows: [row('B', 14)] });
  assert.equal(sent.length, 1);
});

test('status text marks healthy and stale sources', () => {
  const t = sh.sourceStatusText([row('A', 2), row('B', 20), row('C', null)], now);
  assert.match(t, /🟢 A：2 小時前更新/); assert.match(t, /🔴 B/); assert.match(t, /🔴 C：尚無成功紀錄/);
});
