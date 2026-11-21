// 海上保安廳 NAVAREA XI 航行警報採集與判定；UKMTO 官方 API 被擋時經 Internet Archive 取得
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const jcg = require('../src/collectors/jcg_navwarn');
const ukmto = require('../src/collectors/ukmto');
const HOUR = 3600_000, DAY = 24 * HOUR;

const LIST_XML = `<opt><Member><categoly>そ の 他</categoly><number>0461</number><tana>260461</tana><title>ミサイル発射</title><visual>0</visual></Member>
<Member><categoly>訓練試験</categoly><number>0456</number><tana>260456</tana><title>父島北東、射撃</title><visual>1</visual></Member>
<Member><categoly>海底施設</categoly><number>0448</number><tana>260448</tana><title>台湾海峡、海底線修理作業</title><visual>1</visual></Member></opt>`;
const DETAIL_HTML = `<html><body><p>NAVAREA XI</p><p>NO.26-0461 発表日時：2026年10月12日 09時</p><p>JAPAN SEA, EAST CHINA SEA AND NORTH PACIFIC, JAPAN. OBJECT POTENTIALLY BALLISTIC MISSILE LAUNCHED FROM NORTH KOREA POSSIBLY LANDED. VESSELS ARE REQUESTED TO PAY ATTENTION.</p>
<p>NO.26-0456 発表日時：2026年10月11日 21時</p><p>NORTH PACIFIC, NANPO SHOTO. GUNNERY. 160400Z TO 161500Z OCT, ALTERNATE 200400Z TO 201500Z OCT. WITHIN 7 MILES OF 28-07N 143-08E. CANCEL THIS MSG 201600Z OCT.</p>
<p>NO.26-0448 発表日時：2026年10月05日 10時</p><p>TAIWAN STRAIT. CABLE REPAIR OPERATIONS BY M/V EXAMPLE IN AREA BOUNDED BY 24-30N 119-20E, 24-40N 119-40E. WIDE BERTH REQUESTED.</p></body></html>`;

test('JCG list XML and detail pages parse into dated, classified, geo-referenced warnings', () => {
  const list = jcg.parseListXml(LIST_XML);
  assert.deepEqual(list.map(i => i.number), ['26-0461', '26-0456', '26-0448']);
  assert.equal(list[1].category, '訓練試験');
  const d = jcg.parseDetails(DETAIL_HTML);
  assert.equal(d.length, 3);
  assert.equal(d[0].issuedAt, '2026-10-12T00:00:00.000Z', 'JST 09:00 → UTC 00:00');
  assert.deepEqual(d[0].kinds, ['MISSILE', 'DPRK']);
  assert.deepEqual(d[1].kinds, ['FIRING']);
  assert.deepEqual(d[1].points, [[143.1333, 28.1167]]);
  assert.equal(d[1].windows.length, 2); assert.equal(d[1].windows[0].from, '2026-10-16T04:00:00.000Z'); assert.equal(d[1].windows[0].to, '2026-10-16T15:00:00.000Z');
  assert.equal(d[1].cancelAt, '2026-10-20T16:00:00.000Z');
  assert.deepEqual(d[2].kinds, [], 'cable repair is not firing or exercise');
  assert.equal(d[2].points.length, 2);
  assert.deepEqual(jcg.coordsIn('24-30N 119-20E and 10-15.5S 170-00W'), [[119.3333, 24.5], [-170, -10.2583]]);
});

test('JCG collector: lists two years, fetches details only for unseen warnings, marks in-force', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jcg-')), 'c.json');
  const calls = [];
  const fake = async (url, opt = {}) => { calls.push(url); if (/warnings\.cgi$/.test(url)) return { ok: true, text: async () => /YEAR=2026/.test(opt.body) ? LIST_XML : '<opt></opt>' }; return { ok: true, text: async () => DETAIL_HTML }; };
  const now = Date.parse('2026-10-12T06:00:00Z');
  const c = await jcg.refreshJcgNavwarn({ force: true, file, fetchImpl: fake, now });
  assert.equal(c.status, 'ONLINE'); assert.equal(c.inForce, 3); assert.equal(Object.keys(c.items).length, 3);
  assert.ok(c.items['260456'].inForce && c.items['260456'].title === '父島北東、射撃');
  const detailCalls = calls.filter(u => /disp_warnings/.test(u)).length;
  await jcg.refreshJcgNavwarn({ force: true, file, fetchImpl: fake, now: now + HOUR });
  assert.equal(calls.filter(u => /disp_warnings/.test(u)).length, detailCalls, 'known warnings are not re-fetched');
  const bad = await jcg.refreshJcgNavwarn({ force: true, file, fetchImpl: async () => ({ ok: false, status: 503 }), now: now + 2 * HOUR });
  assert.equal(bad.status, 'DEGRADED'); assert.equal(Object.keys(bad.items).length, 3, 'failure keeps data');
});

test('JCG assessment: Taiwan-box firing windows trigger; far-away gunnery and cable work do not; DPRK missile within 48h', () => {
  const now = Date.parse('2026-10-12T06:00:00Z');
  const base = { lastSuccess: new Date(now).toISOString(), items: Object.fromEntries(jcg.parseDetails(DETAIL_HTML).map(d => [d.tana, { ...d, inForce: true }])) };
  assert.equal(jcg.assessJcg(base, 'TW_FIRING', now).status, 'CLEAR', 'Nanpo Shoto gunnery is outside the Taiwan box; cable repair is not firing');
  const dprk = jcg.assessJcg(base, 'DPRK_MISSILE', now);
  assert.equal(dprk.status, 'TRIGGERED'); assert.match(dprk.summary, /NORTH KOREA/); assert.equal(dprk.sources[0].sourceClass, 'OFFICIAL');
  assert.equal(jcg.assessJcg({ ...base, lastSuccess: new Date(now + 3 * DAY).toISOString() }, 'DPRK_MISSILE', now + 3 * DAY).status, 'CLEAR', 'older than 48h');
  const tw = jcg.parseDetails('<p>NO.26-0470 発表日時：2026年10月12日 08時</p><p>EAST OF TAIWAN. LIVE FIRING EXERCISE. 150000Z TO 151200Z OCT. WITHIN 10 MILES OF 23-30N 122-30E. CANCEL THIS MSG 151300Z OCT.</p>')[0];
  const withTw = { ...base, items: { ...base.items, [tw.tana]: { ...tw, inForce: true } } };
  const r = jcg.assessJcg(withTw, 'TW_FIRING', now);
  assert.equal(r.status, 'TRIGGERED'); assert.match(r.summary, /NO\.26-0470/); assert.match(r.summary, /未載明行動方/);
  assert.equal(jcg.assessJcg({ ...withTw, lastSuccess: new Date(now + 20 * DAY).toISOString() }, 'TW_FIRING', now + 20 * DAY).status, 'CLEAR', 'window long past');
  assert.equal(jcg.assessJcg({ ...withTw, items: { ...withTw.items, [tw.tana]: { ...tw, inForce: false } } }, 'TW_FIRING', now).status, 'CLEAR', 'cancelled warnings do not count');
  assert.equal(jcg.assessJcg({ ...base, lastSuccess: new Date(now - 2 * DAY).toISOString() }, 'TW_FIRING', now), null, 'stale cache → unknown');
});

const ROW = { incidentIssuer: 'UKMTO', incidentNumber: 165, utcDateCreated: '2026-10-12T05:00:00Z', utcDateOfIncident: '2026-10-12T04:30:00Z', incidentTypeName: 'Attack', locationLatitude: 24.5, locationLongitude: 56.6, place: 'Sohar anchorage, Oman', vesselType: 'Tanker', otherDetails: 'struck by UAV' };
function ukmtoFetch(script, calls) {
  return async (url, opt = {}) => {
    calls.push(url);
    for (const [re, reply] of script) if (re.test(url)) { const r = typeof reply === 'function' ? reply(url, opt) : reply; return { ok: (r.status || 200) < 400, status: r.status || 200, headers: new Map(Object.entries(r.headers || {})), text: async () => r.text || '', json: async () => JSON.parse(r.text) }; }
    throw new Error(`no route ${url}`);
  };
}
const ts = d => new Date(d).toISOString().replace(/\D/g, '').slice(0, 14);

test('UKMTO: blocked API falls back to a fresh archive snapshot, then to Save Page Now at most every 6 hours', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ukmto-'));
  const now = Date.parse('2026-10-12T06:00:00Z');
  const fresh = ts(now - 2 * HOUR);
  // 1. snapshot available
  let calls = [];
  let c = await ukmto.refreshUkmto({ force: true, file: path.join(dir, 'a.json'), now, fetchImpl: ukmtoFetch([
    [/^https:\/\/sccd\.royalnavy/, { status: 403, text: '<html><head><title>Attention Required! | Cloudflare</title></head></html>' }],
    [/cdx\/search/, { text: `${fresh} 200 9000\n` }],
    [new RegExp(`web/${fresh}id_/`), { text: JSON.stringify([ROW]) }]], calls) });
  assert.equal(c.status, 'ONLINE_VIA_ARCHIVE'); assert.equal(c.incidents.length, 1); assert.equal(c.dataAsOf, `2026-10-12T04:00:00.000Z`);
  assert.ok(!calls.some(u => /web\.archive\.org\/save/.test(u)), 'no Save Page Now when a fresh snapshot exists');
  // 2. no snapshot → Save Page Now returns the JSON and a content-location
  calls = [];
  const file = path.join(dir, 'b.json');
  c = await ukmto.refreshUkmto({ force: true, file, now, fetchImpl: ukmtoFetch([
    [/^https:\/\/sccd\.royalnavy/, { status: 403 }], [/cdx\/search/, { text: '' }], [/wayback\/available/, { text: '{"archived_snapshots":{}}' }],
    [/web\.archive\.org\/save\//, { text: JSON.stringify([ROW]), headers: { 'content-location': `/web/${ts(now)}/https://sccd.royalnavy.mod.uk/api/ukmto/all` } }]], calls) });
  assert.equal(c.status, 'ONLINE_VIA_ARCHIVE'); assert.equal(c.incidents.length, 1); assert.match(c.snapshotUrl, /web\.archive\.org\/web\/\d{14}\//);
  // 3. one hour later, still blocked and no snapshot: must not request another capture
  calls = [];
  c = await ukmto.refreshUkmto({ force: true, file, now: now + HOUR, fetchImpl: ukmtoFetch([
    [/^https:\/\/sccd\.royalnavy/, { status: 403 }], [/cdx\/search/, { text: '' }], [/wayback\/available/, { text: '{"archived_snapshots":{}}' }],
    [/web\.archive\.org\/save\//, { text: JSON.stringify([ROW]) }]], calls) });
  assert.equal(c.status, 'DEGRADED'); assert.match(c.error, /未滿 6 小時/);
  assert.ok(!calls.some(u => /\/save\//.test(u))); assert.equal(c.incidents.length, 1, 'old data kept');
  // 4. direct API works again → DIRECT
  c = await ukmto.refreshUkmto({ force: true, file, now: now + 2 * HOUR, fetchImpl: ukmtoFetch([[/^https:\/\/sccd\.royalnavy/, { text: JSON.stringify([ROW]) }]], []) });
  assert.equal(c.status, 'ONLINE'); assert.equal(c.via, 'DIRECT');
});

test('warning board wires the JCG source into Taiwan and Korea indicators', () => {
  const { buildWarningBoard } = require('../src/warning_board');
  const now = Date.parse('2026-10-12T06:00:00Z');
  const tw = jcg.parseDetails('<p>NO.26-0470 発表日時：2026年10月12日 08時</p><p>EAST OF TAIWAN. LIVE FIRING EXERCISE. 150000Z TO 151200Z OCT. WITHIN 10 MILES OF 23-30N 122-30E.</p>')[0];
  const cache = { lastSuccess: new Date(now).toISOString(), items: Object.fromEntries([...jcg.parseDetails(DETAIL_HTML), tw].map(d => [d.tana, { ...d, inForce: true }])) };
  const board = buildWarningBoard({ now, ledger: { entries: [] }, history: { snapshots: [] }, jcg: cache });
  const twInd = board.theaters.find(t => t.id === 'taiwan_strait').indicators.find(i => i.id === 'tw_jcg_firing');
  assert.equal(twInd.status, 'TRIGGERED'); assert.equal(twInd.tier, 'SECONDARY');
  const kr = board.theaters.find(t => t.id === 'korea_peninsula').indicators.find(i => i.id === 'kr_missile');
  assert.equal(kr.status, 'TRIGGERED'); assert.match(kr.sources[0].publisher, /海上保安廳/);
});

test('JCG launch zones: DD-MM-SS coordinates parse, areas split by letter, distance and direction from Taiwan, far areas dropped', () => {
  const jcg = require('../src/collectors/jcg_navwarn');
  assert.deepEqual(jcg.coordsIn('24-28-29N 132-46-04E'), [[132.7678, 24.4747]]);
  const text = 'NORTH PACIFIC, WESTERN PART. ROCKET LAUNCHING. 040500Z TO 040900Z NOV, ALTERNATE 0500Z TO 0900Z DAILY 05 TO 30 NOV. AREAS BOUNDED BY A. 24-28-29N 132-46-04E 25-02-30N 133-46-43E 22-11-33N 135-39-51E 21-37-52N 134-40-15E. B. 15-42-03N 138-55-05E 16-08-26N 139-44-02E 13-55-46N 140-59-49E 13-30-00N 140-10-00E.';
  assert.deepEqual(jcg.areasIn(text).map(a => [a.label, a.pts.length]), [['A', 4], ['B', 4]]);
  const now = Date.parse('2026-11-01T12:00:00Z');
  const cache = { items: { x: { number: '26-0486', issuedAt: '2026-10-28T12:00:00Z', inForce: true, text, kinds: jcg.classify(text), points: jcg.coordsIn(text), windows: [{ from: '2026-11-04T05:00:00.000Z', to: '2026-11-04T09:00:00.000Z' }] },
    gone: { number: '26-0400', issuedAt: '2026-09-01T00:00:00Z', inForce: false, text, kinds: ['MISSILE'], points: jcg.coordsIn(text), windows: [] } } };
  const zones = jcg.launchZones(cache, now);
  assert.equal(zones.length, 1, '已失效的公告不列');
  assert.equal(zones[0].type, '火箭發射危險區'); assert.equal(zones[0].alternate, true);
  assert.deepEqual(zones[0].areas.map(a => a.label), ['A'], 'B 區離台灣超過 2000 公里不列');
  assert.equal(zones[0].areas[0].direction, '東');
  assert.ok(zones[0].areas[0].kmFromTaiwan > 1000 && zones[0].areas[0].kmFromTaiwan < 1200, `${zones[0].areas[0].kmFromTaiwan}`);
  assert.equal(jcg.launchZones(cache, Date.parse('2026-12-01T00:00:00Z')).length, 0, '時間窗已過不列');
});

test('JCG zone push: near firing/missile zones first seen within 48h are pushed once; far, old or expired ones are not', () => {
  const jcg = require('../src/collectors/jcg_navwarn');
  const { evaluateThreats } = require('../src/sentry');
  const now = Date.parse('2026-11-03T04:00:00Z');
  const mk = (number, text, extra = {}) => ({ number, issuedAt: '2026-11-03T00:00:00Z', firstSeenAt: '2026-11-03T01:00:00Z', inForce: true, text, kinds: jcg.classify(text), points: jcg.coordsIn(text), windows: [{ from: '2026-11-04T00:00:00.000Z', to: '2026-11-04T08:00:00.000Z' }], ...extra });
  const near = mk('26-0901', 'TAIWAN STRAIT. LIVE FIRING. 040000Z TO 040800Z NOV. AREA BOUNDED BY 24-30N 119-40E 24-30N 120-00E 24-10N 120-00E 24-10N 119-40E.');
  const far = mk('26-0902', 'SOUTH CHINA SEA. GUNNERY EXERCISES. AREA BOUNDED BY 12-00N 112-00E 12-00N 113-00E 11-00N 113-00E.');
  const old = mk('26-0903', 'TAIWAN STRAIT. LIVE FIRING. AREA BOUNDED BY 24-30N 119-40E 24-30N 120-00E 24-10N 120-00E.', { firstSeenAt: '2026-10-25T00:00:00Z' });
  const cache = { lastSuccess: '2026-11-03T03:30:00Z', items: { a: near, b: far, c: old } };
  const zones = jcg.pushableZones(cache, now);
  assert.deepEqual(zones.map(z => z.number), ['26-0901']);
  assert.equal(zones[0].kind, 'FIRING'); assert.ok(zones[0].near[0].km < 150);
  const alert = evaluateThreats({}, null, { jcgCache: cache, now });
  assert.equal(alert.code, 'JCG_NAVWARN_ZONE'); assert.equal(alert.eventId, 'jcg:26-0901'); assert.equal(alert.theater, 'taiwan_strait');
  assert.match(alert.summary, /台灣西方|台灣西北方/); assert.match(alert.summary, /不推測行動方/);
  assert.equal(evaluateThreats({}, null, { jcgCache: { ...cache, lastSuccess: '2026-11-02T00:00:00Z' }, now })?.code === 'JCG_NAVWARN_ZONE', false, '資料逾時不推');
});
