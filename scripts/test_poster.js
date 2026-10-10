const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const P = require('../src/poster');
const pc = require('../src/poster_core');
const { buildWarningBoard } = require('../src/warning_board');

// 與 Canvas 相容的假物件：記錄畫出的文字，用來檢查版面內容
function fakeCanvas() {
  const texts = [];
  const ctx = new Proxy({}, { get: (t, k) => k === 'fillText' ? (s => texts.push(String(s))) : k === 'measureText' ? (s => ({ width: String(s).length * 20 })) : k === 'createLinearGradient' || k === 'createRadialGradient' ? (() => ({ addColorStop() {} })) : (t[k] ?? (() => {})), set: (t, k, v) => { t[k] = v; return true; } });
  return { mk: (w, h) => ({ width: w, height: h, getContext: () => ctx }), texts };
}
const now = Date.parse('2026-09-30T03:00:00Z');
const board = buildWarningBoard({ now, ledger: JSON.parse(fs.readFileSync(path.join(__dirname, '../research/warning_indicators.json'), 'utf8')), history: { snapshots: [] } });

test('theater facts only use sourced numbers and never invent force estimates', () => {
  for (const id of P.ORDER) {
    const f = P.theaterFacts(id, { now, board });
    assert.ok(f.kpis.length >= 1 && f.kpis.length <= 5, id);
    assert.ok(f.points.length >= 3, id);
    for (const k of f.kpis) assert.ok(k.label && k.value !== undefined, `${id} ${k.label}`);
    for (const x of f.forces) assert.ok(x.url.startsWith('https://') && x.asOf && x.source, id);
  }
});

test('force estimates older than 90 days are marked as old', () => {
  const ua = P.forcesFor('ukraine_front', now);
  assert.ok(ua.every(f => f.old === (now - Date.parse(f.asOf) > 90 * 86400_000)));
});

test('global poster lists every theater, three key points and the trial disclaimer', () => {
  const d = P.globalPosterData({ now, board });
  assert.equal(d.theaters.length, 8);
  assert.equal(d.points.length, 3);
  assert.match(d.footer, /試行中/);
  const { mk, texts } = fakeCanvas();
  pc.drawGlobalPoster(mk, d);
  assert.ok(texts.includes('全球戰況重點'));
  assert.ok(texts.some(t => /歐洲與北約東翼/.test(t)));
});

test('theater poster renders KPIs, chart, forces and points without a map', () => {
  const f = P.theaterFacts('iran_gulf', { now, board });
  const { mk, texts } = fakeCanvas();
  pc.drawTheaterPoster(mk, { title: '美伊｜戰況重點', subtitle: 's', level: f.t.level, levelName: f.t.levelName, trendText: 't', kpis: f.kpis, chart: f.chart, trend: f.trend, forces: f.forces, points: f.points, footer: 'f' }, null);
  assert.ok(texts.includes('地圖資料暫時無法取得'));
  assert.ok(texts.some(t => /兵力/.test(t)));
  assert.ok(texts.some(t => /船舶遇襲/.test(t)));
  assert.deepEqual(pc.MAP_BOX, { w: 1020, h: 416 });
});
