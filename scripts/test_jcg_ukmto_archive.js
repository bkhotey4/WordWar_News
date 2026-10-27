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
