// 資訊環境指標：GDELT 報導量、Cloudflare Radar 對台攻擊流量
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const gd = require('../src/collectors/gdelt');
const cf = require('../src/collectors/cloudflare_radar');
const HOUR = 3600_000, DAY = 24 * HOUR;
const tmp = name => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ww-info-')), name);
const now = Date.parse('2026-10-12T10:00:00Z');
const dkey = d => new Date(now - d * DAY).toISOString().slice(0, 10);

test('GDELT: timeline parses; rate-limit text is an error; series merge keeps history', async () => {
  const json = { timeline: [{ series: 'Volume Intensity', data: [{ date: '20261010T000000Z', value: 0.7625 }, { date: '20261011T000000Z', value: 0.05 }] }] };
  assert.deepEqual(gd.parseTimeline(json), { '2026-10-10': 0.7625, '2026-10-11': 0.05 });
  assert.throws(() => gd.parseTimeline({}), /format changed/);
  const file = tmp('g.json');
  const calls = [];
  const fake = async url => { calls.push(url); return { ok: true, text: async () => /Hormuz/.test(url) ? 'Please limit requests to one every 5 seconds' : JSON.stringify(json) }; };
  const c = await gd.refreshGdelt({ force: true, file, fetchImpl: fake, now, spacingMs: 1, retryWaitMs: 1, theaters: ['taiwan_strait', 'iran_gulf'] });
  assert.equal(c.status, 'PARTIAL'); assert.equal(c.theaters.taiwan_strait.status, 'ONLINE'); assert.match(c.theaters.iran_gulf.error, /rate limited/);
  assert.equal(c.series.taiwan_strait['2026-10-10'], 0.7625);
  assert.ok(calls.every(u => /timelinevol/.test(u) && /format=json/.test(u)));
});

test('GDELT assessment: surge above P90 and twice the median triggers; sparse data does not', () => {
  const series = {}; for (let d = 1; d <= 30; d++) series[dkey(d)] = 0.03 + (d % 5) * 0.004;
  const base = { lastSuccess: new Date(now).toISOString(), series: { taiwan_strait: { ...series, [dkey(0)]: 0.76 } } };
  const r = gd.assessGdelt(base, 'taiwan_strait', now);
  assert.equal(r.status, 'TRIGGERED'); assert.match(r.summary, /關注度異常升高/); assert.ok(r.baseline.samples >= 29);
  assert.equal(gd.assessGdelt({ ...base, series: { taiwan_strait: { ...series, [dkey(0)]: 0.04 } } }, 'taiwan_strait', now).status, 'CLEAR');
  const sparse = {}; for (let d = 1; d <= 5; d++) sparse[dkey(d)] = 0.03;
  assert.match(gd.assessGdelt({ ...base, series: { taiwan_strait: { ...sparse, [dkey(0)]: 0.9 } } }, 'taiwan_strait', now).summary, /累積中/);
  assert.equal(gd.assessGdelt(base, 'sudan', now), null, 'no series → unknown');
  assert.equal(gd.assessGdelt({ ...base, lastSuccess: new Date(now - 2 * DAY).toISOString() }, 'taiwan_strait', now), null, 'stale → unknown');
});

test('Cloudflare Radar: not configured without token; series parse; ratio-based trigger', async () => {
  const file = tmp('cf.json');
  let c = await cf.refreshCloudflareRadar({ force: true, file, now, token: '' });
  assert.equal(c.status, 'NOT_CONFIGURED'); assert.match(c.error, /CLOUDFLARE_RADAR_TOKEN/);
  assert.equal(cf.assessRadar(c, 'taiwan_strait', now), null);
  const ts = [], vals3 = [], vals7 = [];
  for (let d = 27; d >= 0; d--) { ts.push(`${dkey(d)}T00:00:00Z`); vals3.push(d === 0 ? '1' : String(0.1 + (d % 3) * 0.05)); vals7.push(String(0.3 + (d % 4) * 0.1)); }
  const payload = kind => ({ success: true, result: { serie_0: { timestamps: ts, values: kind === 'layer3' ? vals3 : vals7 } } });
  const fake = async (url, opt) => { assert.match(opt.headers.Authorization, /^Bearer t0k/); if (/outages/.test(url)) return { ok: true, json: async () => ({ success: true, result: { annotations: [{ id: 'a1', startDate: `${dkey(2)}T03:00:00Z`, description: 'Outage in Taiwan', scope: 'Taiwan', outage: { outageCause: 'CABLE_CUT' } }] } }) }; return { ok: true, json: async () => payload(/layer3/.test(url) ? 'layer3' : 'layer7') }; };
  c = await cf.refreshCloudflareRadar({ force: true, file, now, token: 't0ken', fetchImpl: fake });
  assert.equal(c.status, 'ONLINE'); assert.equal(Object.keys(c.series['taiwan_strait:layer3']).length, 28); assert.equal(c.outages[0].cause, 'CABLE_CUT');
  const r = cf.assessRadar(c, 'taiwan_strait', now);
  assert.equal(r.status, 'TRIGGERED'); assert.match(r.summary, /網路層/); assert.match(r.summary, /網路中斷 1 起/); assert.ok(r.value >= 3);
  c.series['taiwan_strait:layer3'][dkey(0)] = 0.15;
  assert.equal(cf.assessRadar(c, 'taiwan_strait', now).status, 'CLEAR');
  assert.throws(() => cf.parseSeries({ success: false, errors: [{ message: 'Invalid token' }] }), /Invalid token/);
});

test('warning board exposes media-surge and cyber indicators; unconfigured Radar is UNKNOWN not CLEAR', () => {
  const { buildWarningBoard } = require('../src/warning_board');
  const series = {}; for (let d = 1; d <= 30; d++) series[dkey(d)] = 0.03;
  const gdelt = { lastSuccess: new Date(now).toISOString(), series: { korea_peninsula: { ...series, [dkey(0)]: 0.5 } } };
  const board = buildWarningBoard({ now, ledger: { entries: [] }, history: { snapshots: [] }, gdelt, cfr: { status: 'NOT_CONFIGURED' } });
  assert.equal(board.theaters.find(t => t.id === 'korea_peninsula').indicators.find(i => i.id === 'kr_media_surge').status, 'TRIGGERED');
  const tw = board.theaters.find(t => t.id === 'taiwan_strait');
  assert.equal(tw.indicators.find(i => i.id === 'tw_cyber').status, 'UNKNOWN');
  assert.equal(tw.indicators.find(i => i.id === 'tw_media_surge').status, 'UNKNOWN', 'no Taiwan series → unknown');
});
