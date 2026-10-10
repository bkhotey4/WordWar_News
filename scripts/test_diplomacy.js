// 外交與政治指標的單元測試：node --test scripts/test_diplomacy.js
const test = require('node:test');
const assert = require('node:assert');
const d = require('../src/collectors/diplomacy');

test('分類：撤僑、言論、驅逐外交官、制裁、停飛、降溫', () => {
  assert.deepStrictEqual(d.classify('US raises travel advisory for Taiwan to Level 4'), [{ type: 'EVAC', theater: 'taiwan_strait' }]);
  assert.deepStrictEqual(d.classify('國台辦嚴正警告賴清德 勿玩火自焚'), [{ type: 'RHETORIC', theater: 'taiwan_strait' }]);
  assert.deepStrictEqual(d.classify('Poland expels Russian diplomats after sabotage'), [{ type: 'DIPLO', theater: 'europe_security' }]);
  assert.deepStrictEqual(d.classify('US imposes new sanctions on Iran oil network'), [{ type: 'SANCTION', theater: 'iran_gulf' }]);
  assert.deepStrictEqual(d.classify('Airlines suspend flights to Tehran'), [{ type: 'FLIGHTS', theater: 'iran_gulf' }]);
  assert.deepStrictEqual(d.classify('Putin and Trump phone call on Ukraine ceasefire'), [{ type: 'DEESC', theater: 'ukraine_front' }]);
});

test('排除：問句、評論、疫情警示、預測市場、單方會談', () => {
  for (const t of ['Will the US evacuate its embassy from Kyiv?', 'Analysis: why Iran sanctions matter', 'US issues travel advisory for Russia over plague alert',
    'Traders put a Russia-Ukraine ceasefire before 2027 at 7%', 'NATO delegation visits Kyiv for talks with Ukraine General Staff']) assert.deepStrictEqual(d.classify(t), [], t);
});

test('確認需 2 家媒體；言論類需超過 30 日常態才觸發', () => {
  const now = Date.parse('2026-10-20T04:00:00Z');
  const item = (title, publisher, h) => ({ title, publisher, url: `https://x/${publisher}/${h}`, publishedAt: new Date(now - h * 3600_000).toISOString() });
  const events = d.buildEvents([item('US raises travel advisory for Taiwan to Level 4', 'A', 2), item('US raises travel advisory for Taiwan to Level 4', 'B', 3)], now);
  const cache = { lastSuccess: new Date(now).toISOString(), events, daily: {} };
  assert.strictEqual(d.assessDiplomacy(cache, 'taiwan_strait', 'EVAC', now).status, 'TRIGGERED');
  // 言論：基準不足 10 天 → 不觸發
  const r = d.buildEvents([item('國台辦嚴正警告 台獨', 'A', 2), item('國台辦嚴正警告 台獨 玩火', 'B', 2)], now);
  assert.strictEqual(d.assessDiplomacy({ ...cache, events: r }, 'taiwan_strait', 'RHETORIC', now).status, 'CLEAR');
  // 基準 30 天每天 1 篇，最近 3 天各 5 篇 → 觸發
  const daily = { 'RHETORIC|taiwan_strait': {} };
  for (let k = 0; k < 30; k++) daily['RHETORIC|taiwan_strait'][new Date(now + 8 * 3600_000 - k * 86400_000).toISOString().slice(0, 10)] = k < 3 ? 5 : 1;
  assert.strictEqual(d.assessDiplomacy({ ...cache, events: r, daily }, 'taiwan_strait', 'RHETORIC', now).status, 'TRIGGERED');
});
