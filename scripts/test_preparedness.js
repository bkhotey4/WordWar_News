const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const p = require('../src/preparedness');

const board = (level, decisive = false) => ({ theaters: [{ id: 'taiwan_strait', level, reason: 'r',
  triggered: decisive ? [{ id: 'tw_decisive', name: '封鎖／檢疫宣告', tier: 'DECISIVE', summary: 's' }] : [{ id: 'x', name: '共機架次偏高', tier: 'PRIMARY', summary: '近 7 天高於 P95' }] }] });

test('stage follows Taiwan level; decisive forces 4; unknown gives null', () => {
  assert.equal(p.stageFromBoard(board(2)).stage, 2);
  assert.equal(p.stageFromBoard(board(2, true)).stage, 4);
  assert.equal(p.stageFromBoard(board(null)), null);
  assert.equal(p.stageFromBoard({ theaters: [] }), null);
});

test('shopping list scales water 3 L × people × days and cites sources', () => {
  const parts = p.shoppingList({ people: 3, days: 7 });
  const all = parts.join('\n');
  assert.match(all, /飲用水 63 公升/);
  assert.match(all, /prepare\.mnd\.gov\.tw/);
  assert.ok(parts.every(x => x.length <= 2000));
  assert.match(p.shoppingList({ people: 999, days: -5 }).join('\n'), /20 人 × 1 天/);
});

test('pushes only on upgrade to ≥2, once per user, and a single all-clear', () => {
  const subs = [{ userId: 'a' }, { userId: 'b' }];
  let r = p.planPreparePushes(p.stageFromBoard(board(1)), subs, {});
  assert.equal(r.pushes.length, 0);
  r = p.planPreparePushes(p.stageFromBoard(board(3)), subs, { users: r.users });
  assert.deepEqual(r.pushes.map(x => [x.userId, x.stage, x.kind]), [['a', 3, 'UP'], ['b', 3, 'UP']]);
  const delivered = { a: { stage: 3 }, b: { stage: 3 } };
  assert.equal(p.planPreparePushes(p.stageFromBoard(board(3)), subs, { users: delivered }).pushes.length, 0);
  const down = p.planPreparePushes(p.stageFromBoard(board(2)), subs, { users: delivered });
  assert.equal(down.pushes.length, 0); assert.equal(down.users.a.stage, 2);
  assert.deepEqual(p.planPreparePushes(p.stageFromBoard(board(1)), subs, { users: delivered }).pushes.map(x => x.kind), ['DOWN', 'DOWN']);
});

test('dispatch: stage 4 is CRITICAL, deferred users are retried next round', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prep-')), 'state.json');
  const sent = [], levels = [];
  const client = { users: { fetch: async id => ({ send: async m => sent.push([id, m.content]) }) } };
  let quiet = true;
  const shouldDeliver = (id, a) => { levels.push(a.level); return quiet && a.level !== 'CRITICAL' ? { deliver: false } : { deliver: true }; };
  let res = await p.dispatchPreparePushes(client, [{ userId: 'a' }], { board: board(3), file, shouldDeliver });
  assert.equal(res[0].status, 'DEFERRED');
  quiet = false;
  res = await p.dispatchPreparePushes(client, [{ userId: 'a' }], { board: board(3), file, shouldDeliver });
  assert.equal(res[0].status, 'SENT');
  assert.match(sent[0][1], /趁現在補齊/);
  res = await p.dispatchPreparePushes(client, [{ userId: 'a' }], { board: board(3), file, shouldDeliver });
  assert.equal(res.length, 0);
  quiet = true;
  res = await p.dispatchPreparePushes(client, [{ userId: 'a' }], { board: board(4, true), file, shouldDeliver });
  assert.equal(res[0].status, 'SENT'); assert.equal(levels.at(-1), 'CRITICAL');
  assert.match(sent[1][1], /第 4 級「危機」/); assert.match(sent[1][1], /封鎖／檢疫宣告/);
});

test('DM text parsing and payload', () => {
  assert.deepEqual(p.parsePrepareText('準備清單 3人 14天'), { people: 3, days: 14 });
  assert.deepEqual(p.parsePrepareText('要買什麼'), { people: 1, days: 7 });
  const pay = p.prepareDiscordPayload({ people: 2, days: 7, board: board(2) });
  assert.match(pay.content, /第 2 級「升溫」/);
  assert.ok(pay.content.length <= 2000);
});
