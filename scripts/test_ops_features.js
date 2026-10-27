// 研究排程健康、事件時間線、預警回測、衛星前後期對照、網站戰場圖／海報 API
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const rh = require('../src/research_health');
const tl = require('../src/event_timeline');
const bt = require('../src/warning_backtest');
const sc = require('../src/satellite_compare');
const DAY = 86400_000;
const tmp = name => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ww-ops-')), name);

test('research health: next/previous slot in Taipei time and rrule parsing', () => {
  const times = rh.rruleTimes('FREQ=DAILY;BYHOUR=7,19;BYMINUTE=30');
  assert.deepEqual(times, [{ h: 7, m: 30 }, { h: 19, m: 30 }]);
  const now = Date.parse('2026-10-07T03:00:00Z'); // 台北 11:00
  const w = rh.scheduleWindow(times, now);
  assert.equal(new Date(w.previous).toISOString(), '2026-10-06T23:30:00.000Z'); // 台北 07:30
  assert.equal(new Date(w.next).toISOString(), '2026-10-07T11:30:00.000Z');     // 台北 19:30
  assert.deepEqual(rh.rruleTimes('FREQ=WEEKLY;BYHOUR=7'), []);
});

test('research health: no record, OK, missed, failed and quota states', () => {
  const file = tmp('runs.json');
  const schedule = { runner: 'codex-test', name: '測試', app: 'Codex', active: true, rule: 'x', times: [{ h: 7, m: 30 }, { h: 19, m: 30 }] };
  const at = iso => Date.parse(iso);
  let h = rh.researchHealth({ now: at('2026-10-07T03:00:00Z'), runsFile: file, schedules: [schedule] });
  assert.equal(h.schedules[0].state, 'NO_RECORD');
  rh.recordRun({ runner: 'codex-test', result: 'NO_NEW_CONTENT', finishedAt: '2026-10-06T23:40:00Z' }, file);
  h = rh.researchHealth({ now: at('2026-10-07T03:00:00Z'), runsFile: file, schedules: [schedule] });
  assert.equal(h.schedules[0].state, 'OK');
  assert.equal(h.schedules[0].lastSuccessAt, '2026-10-06T23:40:00.000Z');
  // 19:30 那次沒有紀錄，21:31 以後算漏跑；21:00 還在寬限內
  assert.equal(rh.researchHealth({ now: at('2026-10-07T13:00:00Z'), runsFile: file, schedules: [schedule] }).schedules[0].state, 'OK');
  assert.equal(rh.researchHealth({ now: at('2026-10-07T13:31:00Z'), runsFile: file, schedules: [schedule] }).schedules[0].state, 'MISSED');
  rh.recordRun({ runner: 'codex-test', result: 'QUOTA_EXHAUSTED', note: '429', finishedAt: '2026-10-07T11:35:00Z' }, file);
  h = rh.researchHealth({ now: at('2026-10-07T13:31:00Z'), runsFile: file, schedules: [schedule] });
  assert.equal(h.schedules[0].state, 'QUOTA_EXHAUSTED');
  assert.equal(h.overall, 'QUOTA_EXHAUSTED');
  assert.equal(h.schedules[0].lastSuccessAt, '2026-10-06T23:40:00.000Z', 'a failed run is not a success');
  assert.throws(() => rh.recordRun({ runner: 'x y', result: 'PUBLISHED' }, file));
  assert.throws(() => rh.recordRun({ runner: 'ok-runner', result: 'MAYBE' }, file));
  const rows = rh.researchSourceRows(h);
  assert.equal(rows[0].name, '研究排程：測試'); assert.equal(rows[0].limitHours, 14);
});

test('event timeline: three separate times, explicit threads only, corrections and level changes', () => {
  const src = (d, p = 'A') => ({ url: `https://example.org/${p}`, publisher: p, sourceClass: 'INDEPENDENT_MEDIA', publishedAt: d });
  const ledger = { mapEvents: [
    { id: 'e1', theater: 'taiwan_strait', observedAt: '2026-10-01T00:00:00Z', title: '首報', summary: 's', reviewed: true, reviewedAt: '2026-10-01T06:00:00Z', thread: 'case-1', role: 'FIRST_REPORT', sources: [src('2026-10-01T03:00:00Z'), src('2026-10-01T01:00:00Z', 'B')] },
    { id: 'e2', theater: 'taiwan_strait', observedAt: '2026-10-01T00:00:00Z', title: '更正', summary: 's', reviewed: true, reviewedAt: '2026-10-02T06:00:00Z', thread: 'case-1', role: 'CORRECTION', corrects: 'e1', sources: [src('2026-10-02T01:00:00Z')] },
    { id: 'e3', theater: 'taiwan_strait', observedAt: '2026-10-01T00:00:00Z', title: '同地同日但未串接', summary: 's', reviewed: true, sources: [src('2026-10-01T02:00:00Z')] },
    { id: 'e4', theater: 'taiwan_strait', observedAt: '2026-10-01T00:00:00Z', title: '未覆核', reviewed: false, sources: [src('2026-10-01T02:00:00Z')] },
    { id: 'e5', theater: 'taiwan_strait', observedAt: '2026-10-01T00:00:00Z', title: '只有 http', reviewed: true, sources: [{ url: 'http://x', publisher: 'X' }] }] };
  const history = { snapshots: [
    { at: '2026-10-01T00:00:00Z', theater: 'taiwan_strait', level: 1, ruleVersion: 'v2' },
    { at: '2026-10-01T03:00:00Z', theater: 'taiwan_strait', level: 2, ruleVersion: 'v2' },
    { at: '2026-10-01T04:00:00Z', theater: 'taiwan_strait', level: 3, ruleVersion: 'v3' }] };
  const out = tl.buildEventTimeline({ ledger, history, reports: [], audit: [], changes: [] });
  const ids = out.items.map(i => i.id);
  assert.ok(ids.includes('event:e1') && ids.includes('event:e3'));
  assert.ok(!ids.includes('event:e4') && !ids.includes('event:e5'), 'unreviewed and non-https items are dropped');
  const e1 = out.items.find(i => i.id === 'event:e1');
  assert.equal(e1.eventTime, '2026-10-01T00:00:00.000Z'); assert.equal(e1.publishedAt, '2026-10-01T01:00:00.000Z'); assert.equal(e1.recordedAt, '2026-10-01T06:00:00.000Z');
  assert.deepEqual(out.threads['case-1'], ['event:e1', 'event:e2']);
  assert.equal(Object.keys(out.threads).length, 1, 'nearby events are not merged automatically');
  const levels = out.items.filter(i => i.kind === 'LEVEL_CHANGE');
  assert.equal(levels.length, 1, 'a rule-version change is not reported as a level change');
  assert.equal(levels[0].level, 2);
  const rev = tl.revisionItems([{ id: 9, kind: 'CORRECTION', documentId: 'd', recordedAt: '2026-10-02T00:00:00Z', title: 't', url: 'https://mnd.gov.tw/x', publishedAt: '2026-10-01T00:00:00Z', originGroup: 'TAIWAN_MND', observation: { aircraft: 20, periodEnd: '2026-10-01T22:00:00Z' }, previousObservation: { aircraft: 18 } }]);
  assert.deepEqual(rev[0].diff, [{ field: 'aircraft', before: 18, after: 20 }]);
  assert.equal(rev[0].theater, 'taiwan_strait');
});

test('warning backtest: hit with lead time, miss, during-only, no-data and false alarms', () => {
  const events = [
    { id: 'a', theater: 'tw', name: 'A', start: '2025-01-20', end: '2025-01-21' },
    { id: 'b', theater: 'tw', name: 'B', start: '2025-03-10', end: '2025-03-10' },
    { id: 'c', theater: 'tw', name: 'C', start: '2025-05-10', end: '2025-05-11' },
    { id: 'd', theater: 'tw', name: 'D', start: '2024-01-01', end: '2024-01-01' }];
  const on = new Set(['2025-01-16', '2025-01-17', '2025-05-11', '2025-04-01']);
  const dateOf = t => new Date(t + 8 * 3600_000).toISOString().slice(0, 10);
  const ind = { id: 'x', name: 'X', theater: 'tw', ruleVersion: 'v', coverageStart: Date.parse('2024-11-01T00:00:00+08:00'), coverageEnd: Date.parse('2025-06-01T00:00:00+08:00'), triggered: t => on.has(dateOf(t)) };
  const r = bt.backtestIndicator(ind, events, Date.parse('2025-06-01T00:00:00Z'));
  const by = Object.fromEntries(r.events.map(e => [e.eventId, e]));
  assert.equal(by.a.outcome, 'HIT'); assert.equal(by.a.leadDays, 4); assert.equal(by.a.firstTrigger, '2025-01-16');
  assert.equal(by.b.outcome, 'MISS');
  assert.equal(by.c.outcome, 'DURING_ONLY');
  assert.equal(by.d.outcome, 'NO_DATA', 'events before data coverage are not misses');
  assert.equal(r.eventsCovered, 3); assert.equal(r.hits, 1); assert.equal(r.misses, 1);
  assert.equal(r.episodes, 3); assert.equal(r.falseAlarms, 1); // 2025-04-01
  assert.deepEqual(r.recentFalseAlarms, [{ from: '2025-04-01', to: '2025-04-01' }]);
  const noRef = bt.backtestIndicator({ ...ind, theater: 'war' }, events, Date.parse('2025-06-01T00:00:00Z'));
  assert.equal(noRef.falseAlarms, null, 'no reference events means false alarms cannot be judged');
  assert.deepEqual(bt.episodesOf([0, DAY, 3 * DAY]).map(e => [e.start, e.end]), [[0, DAY], [3 * DAY, 3 * DAY]]);
});

test('warning backtest: reference events need https sources', () => {
  const file = tmp('ev.json');
  fs.writeFileSync(file, JSON.stringify({ events: [{ id: 'ok', theater: 't', start: '2025-01-01', end: '2025-01-02', sources: [{ url: 'https://a' }] }, { id: 'no', theater: 't', start: '2025-01-01', sources: [{ url: 'http://a' }] }, { id: 'bad', theater: 't', start: '2025-1-1', sources: [{ url: 'https://a' }] }] }));
  assert.deepEqual(bt.loadEvents(file).map(e => e.id), ['ok']);
});

test('satellite compare: pixel classes and same-frame rule', () => {
  assert.equal(sc.pixelClass(0, 0, 0), 0);
  assert.equal(sc.pixelClass(230, 232, 235), 1);
  assert.equal(sc.pixelClass(120, 100, 80), 2);
  assert.equal(sc.pixelClass(220, 180, 120), 2, 'bright but saturated sand is not cloud');
  const a = { tile: '35UQR', cropBbox: [1, 2, 3, 4], outputSize: [10, 10] };
  assert.ok(sc.sameFrame(a, { ...a }));
  assert.ok(!sc.sameFrame(a, { ...a, cropBbox: [1, 2, 3, 4.1] }));
  assert.ok(!sc.sameFrame(a, { ...a, tile: '35UQS' }));
  const img = { width: 2, height: 2, data: Buffer.from([0, 0, 0, 240, 240, 240, 100, 90, 80, 100, 90, 80]) };
  const c = sc.classify(img);
  assert.equal(c.nodata, 0.25); assert.equal(c.cloud, 0.25); assert.equal(c.clear, 0.5);
});

test('ops APIs and pages are served; unknown theaters and foreign diff ids are refused', async t => {
  const app = require('../src/server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(base + '/api/research-health').then(r => r.json());
  assert.ok(Array.isArray(health.schedules) && 'overall' in health);
  const timeline = await fetch(base + '/api/event-timeline?kinds=LEVEL_CHANGE').then(r => r.json());
  assert.ok(timeline.items.every(i => i.kind === 'LEVEL_CHANGE'));
  assert.equal((await fetch(base + '/api/battle-map/atlantis')).status, 404);
  assert.equal((await fetch(base + '/api/poster/atlantis.jpg')).status, 404);
  assert.equal((await fetch(base + '/api/satellite-compare/diff/abc/def.png')).status, 400);
  assert.equal((await fetch(base + `/api/satellite-compare/diff/${'a'.repeat(64)}/${'b'.repeat(64)}.png`)).status, 404);
  for (const page of ['/ops.html', '/events.html']) assert.equal((await fetch(base + page)).status, 200);
});

test('satellite storage: PNG→WebP keeps referenced images; cleanup keeps newest per region and referenced ones', async () => {
  const { IntelStore } = require('../src/intel_store');
  const st = require('../src/satellite_storage');
  const { createCanvas } = require('@napi-rs/canvas');
  const crypto = require('crypto');
  const pub = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-sat-')), dir = path.join(pub, 'images/sentinel');
  fs.mkdirSync(dir, { recursive: true });
  const store = new IntelStore(':memory:');
  const now = Date.parse('2026-10-07T00:00:00Z');
  const hash = b => crypto.createHash('sha256').update(b).digest('hex');
  const put = (id, region, daysAgo, i) => {
    const c = createCanvas(64, 64), ctx = c.getContext('2d');
    ctx.fillStyle = '#3a6'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#a63'; ctx.fillRect(4 + i * 8, 10, 12, 20); // 每張不同
    const png = c.toBuffer('image/png');
    const file = `images/sentinel/${id}_${region}_crop.png`;
    fs.writeFileSync(path.join(pub, file), png);
    const asset = { productId: id, region, kind: 'SOURCE_AOI_CROP', acquiredAt: new Date(now - daysAgo * DAY).toISOString(), file, imageUrl: `/${file}`, sha256: hash(png), processing: 'x。' };
    store.putImagery(asset); return asset;
  };
  const assets = ['a', 'b', 'c', 'd', 'e'].map((id, i) => put(id, 'r1', [1, 40, 50, 60, 70][i], i));
  // a 被稿件引用：不轉檔
  const referenced = new Set();
  let opt = await st.optimizeSatelliteImages({ store, publicDir: pub, referenced: new Set([assets[0].sha256]) });
  assert.equal(opt.converted, 4); assert.equal(opt.keptReferenced, 1, 'referenced hash blocks conversion');
  assert.ok(fs.existsSync(path.join(pub, assets[0].file)) && store.imagery('r1').find(a => a.productId === 'a').file.endsWith('.png'));
  opt = await st.optimizeSatelliteImages({ store, publicDir: pub, referenced, dryRun: true });
  assert.equal(opt.converted, 1); assert.ok(fs.existsSync(path.join(pub, assets[0].file)), 'dry run changes nothing');
  opt = await st.optimizeSatelliteImages({ store, publicDir: pub, referenced });
  assert.equal(opt.converted, 1);
  const after = store.imagery('r1');
  assert.ok(after.every(a => a.file.endsWith('.webp') && a.convertedFrom.sha256 === assets.find(x => x.productId === a.productId).sha256));
  assert.ok(after.every(a => hash(fs.readFileSync(path.join(pub, a.file))) === a.sha256), 'recorded hash matches the WebP on disk');
  assert.ok(assets.every(a => !fs.existsSync(path.join(pub, a.file))), 'old PNGs removed');
  // 清除：a(1天) 新；b,c 在每區保留 3 張內；d(60天) 被引用；e(70天) 刪除
  const dHash = after.find(a => a.productId === 'd').sha256;
  fs.writeFileSync(path.join(dir, 'stray.tmp'), 'x'); fs.utimesSync(path.join(dir, 'stray.tmp'), new Date(now - 3 * DAY), new Date(now - 3 * DAY));
  const dry = st.cleanupSatelliteImages({ store, publicDir: pub, now, referenced: new Set([dHash]), dryRun: true });
  assert.equal(dry.removedRecords, 1); assert.equal(store.imagery('r1').length, 5, 'dry run keeps records');
  const clean = st.cleanupSatelliteImages({ store, publicDir: pub, now, referenced: new Set([dHash]) });
  assert.equal(clean.removedRecords, 1); assert.equal(clean.keptReferenced, 1); assert.equal(clean.removedOrphans, 1);
  assert.deepEqual(store.imagery('r1').map(a => a.productId), ['a', 'b', 'c', 'd']);
  assert.ok(!fs.existsSync(path.join(dir, 'e_r1_crop.webp')) && !fs.existsSync(path.join(dir, 'stray.tmp')));
  store.close();
});

test('weekly PDF: weekly card, global poster and theater posters; a failing theater is skipped, not fatal', async () => {
  const weekly = require('../src/weekly');
  const { createCanvas } = require('@napi-rs/canvas');
  const poster = require('../src/poster');
  const now = Date.parse('2026-10-08T00:00:00Z');
  const parts = async id => {
    if (id === 'iran_gulf') throw new Error('tiles offline');
    const { data } = await poster.theaterPosterParts(id, { now, fetchImpl: async () => { throw new Error('offline'); } });
    const map = createCanvas(200, 100); map.getContext('2d').fillRect(0, 0, 200, 100);
    return { data, mapCanvas: map };
  };
  const pdf = await weekly.renderWeeklyPdf(now, { posterParts: parts });
  assert.equal(pdf.buffer.slice(0, 5).toString(), '%PDF-');
  assert.deepEqual(pdf.pages, ['週報', '全球海報', 'taiwan_strait', 'ukraine_front', 'europe_security']);
  assert.equal(pdf.skipped.length, 1); assert.match(pdf.skipped[0], /iran_gulf/);
  assert.equal((pdf.buffer.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 5);
  assert.ok(pdf.buffer.length < 3 * 1048576, `PDF should stay small (font subsetting), got ${pdf.buffer.length}`);
  assert.match(pdf.filename, /^weekly_report_\d{4}-\d{2}-\d{2}\.pdf$/);
});

test('push-dm: header-only key, constant-time compare, weak keys lock the endpoint', async t => {
  const app = require('../src/server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const saved = process.env.ADMIN_API_KEY;
  t.after(() => new Promise(resolve => { process.env.ADMIN_API_KEY = saved; server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/api/push-dm`;
  process.env.ADMIN_API_KEY = 'short';
  assert.equal((await fetch(url, { method: 'POST', headers: { 'x-admin-key': 'short' } })).status, 503, 'weak key locks the endpoint');
  process.env.ADMIN_API_KEY = 'k'.repeat(40);
  assert.equal((await fetch(`${url}?key=${'k'.repeat(40)}`, { method: 'POST' })).status, 400, 'key in the URL is refused');
  assert.equal((await fetch(url, { method: 'POST', headers: { 'x-admin-key': 'k'.repeat(39) } })).status, 401);
  assert.equal((await fetch(url, { method: 'POST' })).status, 401);
});
