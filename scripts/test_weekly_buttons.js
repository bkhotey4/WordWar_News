const test = require('node:test');
const assert = require('node:assert');
const pb = require('../src/push_buttons');
const wk = require('../src/weekly');
const wc = require('../src/weekly_core');

test('buttons: layout, ids and parsing', () => {
  const rows = pb.buttonsFor('taiwan_strait');
  assert.equal(rows[0].type, 1);
  assert.deepEqual(rows[0].components.map(b => b.custom_id), ['ww:map:taiwan_strait', 'ww:warn:taiwan_strait', 'ww:prep', 'ww:mute:taiwan_strait']);
  assert.equal(pb.buttonsFor('global').length, 0);
  assert.deepEqual(pb.parse('ww:mute:iran_gulf'), { action: 'mute', theater: 'iran_gulf' });
  assert.equal(pb.parse('ww:rm -rf'), null);
});

test('mute button stores 24h mute and replies', async () => {
  let saved; const replies = [];
  const ok = await pb.handleButton({ customId: 'ww:mute:iran_gulf', user: { id: 'u' }, reply: async r => replies.push(r) },
    { subscriptions: { setTheaterMute: (u, t, until) => { saved = [u, t, until]; } } });
  assert.equal(ok, true); assert.equal(saved[1], 'iran_gulf');
  assert.ok(Date.parse(saved[2]) - Date.now() > 23 * 3600_000);
  assert.match(replies[0].content, /靜音 24 小時/);
  assert.equal(await pb.handleButton({ customId: 'other' }), false);
});

test('weekly: day strip uses the max level per Taipei day; week key is Sunday', () => {
  const now = Date.parse('2026-10-04T13:00:00Z'); // 台北 10/4（日）21:00
  const days = wk.dailyLevels({ snapshots: [
    { theater: 'taiwan_strait', at: '2026-10-03T01:00:00Z', level: 1 }, { theater: 'taiwan_strait', at: '2026-10-03T10:00:00Z', level: 2 }] }, 'taiwan_strait', now);
  assert.equal(days.length, 7); assert.equal(days[6].date, '2026-10-04'); assert.equal(days[5].level, 2); assert.equal(days[0].level, null);
  assert.equal(wk.weekKey(now), '2026-10-04');
  assert.equal(wk.weekKey(Date.parse('2026-10-01T04:00:00Z')), '2026-09-27');
});

test('weekly card draws every row inside the canvas', () => {
  const log = [];
  const make = (w, h) => { let font = '20px x'; const size = () => Number((font.match(/(\d+)px/) || [])[1] || 20);
    const ctx = new Proxy({ measureText: t => ({ width: [...String(t)].length * size() }), fillText: (t, x, y) => log.push({ t, x, y, r: x + [...String(t)].length * size() }), createLinearGradient: () => ({ addColorStop() {} }) },
      { get: (o, k) => k in o ? o[k] : () => {}, set: (o, k, v) => { if (k === 'font') font = v; return true; } });
    return { width: w, height: h, getContext: () => ctx }; };
  const rows = ['台海', '烏俄戰爭', '美伊與荷莫茲', '歐洲與北約東翼'].map((name, i) => ({ name, level: i % 4 + 1, levelName: '升溫',
    days: Array.from({ length: 7 }, (_, k) => ({ label: `9/${24 + k}(一)`, level: k % 2 ? 2 : null })), kpis: [{ label: '共機', value: 120, prev: 90 }, { label: '演習', value: 1, prev: 0 }], highlights: ['一則很長的重點'.repeat(4)] }));
  wc.drawWeekly(make, { title: '每週戰況週報｜9/24–9/30', subtitle: 's', rows, footer: 'f' });
  for (const n of ['台海', '烏俄戰爭', '美伊與荷莫茲', '歐洲與北約東翼']) assert.ok(log.some(e => e.t === n));
  assert.ok(log.some(e => /▲ 30（上週 90）/.test(e.t)));
  assert.ok(log.every(e => e.r <= wc.W + 2 && e.y <= wc.H), JSON.stringify(log.find(e => e.r > wc.W + 2 || e.y > wc.H)));
});

test('subscriptions accept several theaters including 美伊 and 波蘭', () => {
  const { parseSubscriptionCommand, VALID_THEATERS } = require('../src/subscription_manager');
  assert.deepEqual(parseSubscriptionCommand('訂閱戰區 台海 美伊 波蘭').theaters, ['taiwan_strait', 'iran_gulf', 'europe_security']);
  assert.deepEqual(parseSubscriptionCommand('訂閱戰區 全部').theaters, ['all']);
  assert.ok(VALID_THEATERS.includes('iran_gulf'));
});
