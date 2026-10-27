// 官方與量測數據：NCDR 告警、台電故障容量、指標資料性質、日本統合幕僚監部 curl 備援、首頁數據區塊
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = name => path.join(os.tmpdir(), `ww-${name}-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

const FEED = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:cap="urn:oasis:names:tc:emergency:cap:1.1">
<entry><id>A1</id><title>高溫</title><updated>2026-10-19T17:12:23+08:00</updated><author><name>中央氣象署</name></author><link rel="alternate" href="https://alerts.ncdr.nat.gov.tw/x.cap" /><summary type="html">天氣高溫炎熱</summary><category term="高溫" /><cap:status>Actual</cap:status><cap:effective>2026/10/19 下午 05:11:00</cap:effective><cap:expires>2026/10/20 下午 05:00:00</cap:expires></entry>
<entry><id>B2</id><title>防空警報</title><updated>2026-10-19T18:00:00+08:00</updated><author><name>內政部警政署</name></author><summary type="html">萬安演習防空警報試放</summary><category term="防空" /><cap:status>Exercise</cap:status></entry>
</feed>`;

test('NCDR CAP feed parses Taipei times and marks war-related drills', () => {
  const N = require('../src/collectors/ncdr_alerts');
  assert.strictEqual(N.capTime('2026/10/19 下午 05:11:00'), '2026-10-19T09:11:00.000Z');
  assert.strictEqual(N.capTime('2026/10/19 上午 12:05:00'), '2026-10-18T16:05:00.000Z');
  const e = N.parseFeed(FEED);
  assert.strictEqual(e.length, 2);
  assert.strictEqual(e[0].war, false);
  assert.strictEqual(e[1].war, true); assert.ok(e[1].drill, 'Exercise status / 演習 is a drill');
});

test('NCDR indicator triggers only on actual (non-drill) war alerts within 24h', async () => {
  const N = require('../src/collectors/ncdr_alerts');
  const now = Date.parse('2026-10-19T12:00:00Z'), file = tmp('ncdr');
  const fetchImpl = async () => ({ ok: true, text: async () => FEED });
  const c = await N.refreshNcdrAlerts({ force: true, file, fetchImpl, now });
  assert.strictEqual(N.assessNcdrAlerts(c, now).status, 'CLEAR', 'drill must not trigger');
  const actual = FEED.replace('萬安演習防空警報試放', '中共飛彈來襲，請立即避難').replace('<cap:status>Exercise</cap:status>', '<cap:status>Actual</cap:status>');
  const c2 = await N.refreshNcdrAlerts({ force: true, file, fetchImpl: async () => ({ ok: true, text: async () => actual }), now });
  const r = N.assessNcdrAlerts(c2, now);
  assert.strictEqual(r.status, 'TRIGGERED'); assert.strictEqual(r.sources[0].sourceClass, 'OFFICIAL');
  fs.rmSync(file, { force: true });
});

test('Taipower: only 故障 units count; baseline must accumulate before triggering', () => {
  const T = require('../src/collectors/taipower_grid');
  const snap = T.parseUnits({ DateTime: '2026-10-19T20:20:00', aaData: [
    { '機組類型': '燃氣', '機組名稱': '大潭CC#1', '裝置容量(MW)': '742.7', '淨發電量(MW)': '580.7', '備註': ' ' },
    { '機組類型': '燃煤', '機組名稱': '台中#1', '裝置容量(MW)': '550.0', '淨發電量(MW)': '0.0', '備註': '故障' },
    { '機組類型': '燃煤', '機組名稱': '台中#2', '裝置容量(MW)': '550.0', '淨發電量(MW)': '0.0', '備註': '歲修' },
    { '機組類型': '燃氣', '機組名稱': '小計', '裝置容量(MW)': '15918.1(26.5%)', '淨發電量(MW)': '16196.1(47%)', '備註': '' }] });
  assert.strictEqual(snap.faultMW, 550); assert.deepStrictEqual(snap.faults.map(f => f.name), ['台中#1']);
  const now = Date.parse('2026-10-19T12:30:00Z');
  const young = T.assessTaipowerGrid({ latest: { ...snap, faultMW: 5000 }, lastSuccess: new Date(now).toISOString(), hourly: {} }, now);
  assert.strictEqual(young.status, 'UNKNOWN'); assert.match(young.summary, /基準累積中/);
  assert.strictEqual(T.assessTaipowerGrid({ latest: { ...snap, at: new Date(now - 5 * 3600_000).toISOString() }, lastSuccess: new Date(now).toISOString(), hourly: {} }, now), null, 'stale Taipower data time → unknown');
  const hourly = {}; for (let h = 7; h < 24 * 30; h++) hourly[new Date(now - h * 3600_000).toISOString().slice(0, 13)] = 600;
  assert.strictEqual(T.assessTaipowerGrid({ latest: { ...snap, faultMW: 5000 }, lastSuccess: new Date(now).toISOString(), hourly }, now).status, 'TRIGGERED');
  assert.strictEqual(T.assessTaipowerGrid({ latest: { ...snap, faultMW: 1000 }, lastSuccess: new Date(now).toISOString(), hourly }, now).status, 'CLEAR', 'below 1,500 MW floor');
});

test('indicator kind follows the source that actually triggered it', () => {
  const WB = require('../src/warning_board');
  assert.strictEqual(WB.kindOfAuto('mnd:aircraft'), 'OFFICIAL');
  assert.strictEqual(WB.kindOfAuto('gdelt'), 'MEASURED');
  assert.strictEqual(WB.kindOfAuto('diplo:ARMS'), 'MEDIA');
  assert.strictEqual(WB.resultKind({ id: 'tw_diplomatic', sources: [{ sourceClass: 'INDEPENDENT_MEDIA' }] }), 'MEDIA', 'cnoff-capable indicator triggered by media is media');
  assert.strictEqual(WB.resultKind({ id: 'ua_strike_volume', sources: [{ sourceClass: 'PARTY_CLAIM' }] }), 'PARTY');
  assert.strictEqual(WB.resultKind({ id: 'tw_aircraft', sources: [] }), 'OFFICIAL');
  assert.ok(WB.THEATERS.taiwan_strait.indicators.some(d => d.id === 'tw_gov_alert' && d.tier === 'PRIMARY'));
});

test('Japan Joint Staff: Windows curl result is used before the archive fallback', async () => {
  const J = require('../src/collectors/japan_js');
  const html = '<a href="/js/pdf/2026/p20261019_01.pdf"><time datetime="2026-10-19">10/19</time><h5>中国海軍艦艇の動向について（大隅海峡）</h5></a>';
  const file = tmp('jsjp');
  let archiveCalled = false;
  const fetchImpl = async () => { archiveCalled = true; return { ok: false, status: 403, text: async () => '' }; };
  const c = await J.refreshJapanJs({ force: true, file, fetchImpl, now: Date.parse('2026-10-19T12:00:00Z'), curlImpl: async () => html });
  assert.strictEqual(c.via, 'DIRECT_CURL'); assert.strictEqual(c.items.length, 1); assert.strictEqual(archiveCalled, false);
  fs.rmSync(file, { force: true });
});

test('curl fallback keeps an honest User-Agent and only allows listed hosts', async () => {
  const W = require('../src/win_fetch');
  let args = null;
  const run = async (exe, a) => { args = a; return { stdout: Buffer.from('<html>ok</html>') }; };
  assert.strictEqual(await W.curlText('https://www.mod.go.jp/js/press/index.html', { hosts: ['www.mod.go.jp'], run, platform: 'win32' }), '<html>ok</html>');
  assert.ok(args.includes(W.HONEST_UA) && !args.join(' ').includes('Mozilla'));
  await assert.rejects(W.curlText('https://evil.example/x', { hosts: ['www.mod.go.jp'], run, platform: 'win32' }));
});

test('homepage data box lists official/measured indicators and hides media ones', () => {
  const CMD = require('./site_command');
  const board = { theaters: [{ id: 'taiwan_strait', name: '台海', level: 2, levelName: '升溫', triggered: [], indicators: [
    { id: 'tw_aircraft', name: '共機架次超過 60 日 P95', status: 'CLEAR', summary: '最新 5架次', sources: [{ url: 'https://www.mnd.gov.tw/', publisher: '中華民國國防部', sourceClass: 'OFFICIAL' }], observedAt: '2026-10-18T22:00:00Z' },
    { id: 'tw_arms', name: '美國對台軍售', status: 'TRIGGERED', summary: '媒體報導', sources: [{ sourceClass: 'INDEPENDENT_MEDIA' }] }] }] };
  const parts = CMD.theaterParts({ board, order: ['taiwan_strait'], level: { 2: ['#eab308', '升溫'] }, img: () => null, beats: {}, imint: {}, helpers: { esc: s => String(s), tpe: ms => new Date(ms).toISOString() }, shortName: n => n, BR: { eventCards: () => '' }, events: [], now: Date.now() });
  assert.match(parts[0].data, /官方與量測數據/); assert.match(parts[0].data, /共機架次/);
  assert.doesNotMatch(parts[0].data, /美國對台軍售/);
});

test('GFW: empty region is zero, and passes without AIS matching are not counted as dark vessels', () => {
  const G = require('../src/collectors/gfw_vessels');
  assert.deepStrictEqual(G.sumByDate({ entries: [] }), {});
  assert.deepStrictEqual(G.sumByDate({ entries: [{ 'public-global-sar-presence:v4.0': [{ date: '2026-10-12', detections: 5, flag: 'CHN' }, { date: '2026-10-12', detections: 3, flag: '' }] }] }), { '2026-10-12': { total: 8, chn: 5 } });
  assert.throws(() => G.sumByDate({}));
  const now = Date.parse('2026-10-19T00:00:00Z');
  const passes = {}; for (let i = 0; i < 10; i++) passes[new Date(now - (30 + i * 5) * 864e5).toISOString().slice(0, 10)] = { total: 60, dark: 10, chn: 40 };
  passes['2026-10-16'] = { total: 320, dark: 320, chn: 0 };
  const cache = { lastSuccess: new Date(now).toISOString(), regions: { strait_mid: { name: '海峽中段', passes } } };
  const r = G.assessGfwVessels(cache, now);
  assert.strictEqual(r.status, 'UNKNOWN', 'no matched pass → cannot say dark vessels are normal'); assert.match(r.summary, /尚未完成 AIS 比對/);
  passes['2026-10-16'] = { total: 120, dark: 60, chn: 30 };
  assert.strictEqual(G.assessGfwVessels(cache, now).status, 'TRIGGERED');
  const WB = require('../src/warning_board');
  assert.strictEqual(WB.kindOfAuto('gfw'), 'MEASURED');
});

test('GFW collector does nothing without a token', async () => {
  const G = require('../src/collectors/gfw_vessels');
  let called = false;
  const c = await G.refreshGfwVessels({ force: true, token: '', file: tmp('gfw'), fetchImpl: async () => { called = true; } });
  assert.strictEqual(c.status, 'NOT_CONFIGURED'); assert.strictEqual(called, false);
});

test('Taiwan map frames GFW zones, marks hot zones orange and credits Global Fishing Watch', async () => {
  const bm = require('../src/battle_map');
  const now = Date.parse('2026-10-19T00:00:00Z');
  const passes = d => { const p = {}; for (let i = 0; i < 10; i++) p[new Date(now - (30 + i * 5) * 864e5).toISOString().slice(0, 10)] = { total: 60, dark: 10, chn: 40 }; p['2026-10-16'] = d; return p; };
  const gfwCache = { lastSuccess: new Date(now).toISOString(), regions: { kinmen: { name: '金門周邊', passes: passes({ total: 120, dark: 60, chn: 30 }) }, matsu: { name: '馬祖周邊', passes: passes({ total: 50, dark: 8, chn: 30 }) } } };
  const spec = await bm.buildSpec('taiwan_strait', { now, board: { theaters: [] }, taiwanFeed: {}, gfwCache, geocodeImpl: async () => null, beatMap: {} });
  const hot = spec.layers.find(l => l.type === 'polygons' && l.fill === '#ff9100'), calm = spec.layers.find(l => l.type === 'polygons' && l.fill === '#00e5ff');
  assert.strictEqual(hot.polygons.length, 1); assert.strictEqual(calm.polygons.length, 1);
  assert.match(spec.paragraph, /金門周邊 120 艘（未開 AIS 60，高於常態）/);
  assert.match(spec.footer, /Global Fishing Watch/);
});

test('print_official_data lists only official / measured / party indicators', () => {
  const out = require('./print_official_data').lines('taiwan_strait');
  assert.match(out[0], /^【台海】/);
  assert.ok(out.slice(1).every(l => /^- \[(官方|量測|交戰方公布)｜/.test(l)), out.join('\n'));
});

test('hourly live data: one entry per main theater with rendered data box and level color', () => {
  const { liveData } = require('./build_live_data');
  const d = liveData({ now: Date.now() });
  assert.strictEqual(d.theaters.length, 7);
  const tw = d.theaters.find(t => t.id === 'taiwan_strait');
  assert.match(tw.color, /^#[0-9a-f]{6}$/i); assert.match(tw.dataHtml, /官方與量測數據/);
  assert.ok(!/<script/i.test(JSON.stringify(d)), 'no script tags in live data');
});

test('scheduler pushes live data only after 60 minutes since any update', () => {
  const S = require('../src/public_site_scheduler');
  const now = Date.parse('2026-10-19T15:00:00Z');
  assert.strictEqual(S.liveDue({ lastSuccessAt: new Date(now - 30 * 60_000).toISOString() }, now), false);
  assert.strictEqual(S.liveDue({ lastSuccessAt: new Date(now - 3 * 3600_000).toISOString(), lastLiveAt: new Date(now - 61 * 60_000).toISOString() }, now), true);
  assert.strictEqual(S.liveDue({ lastSuccessAt: new Date(now - 3 * 3600_000).toISOString(), lastLiveFailureAt: new Date(now - 10 * 60_000).toISOString() }, now), false, 'back off after a failure');
});

test('draft check reminds when a Taiwan draft cites no official or measured data', () => {
  const { officialReminder } = require('./check_pending_draft');
  const base = { theater: 'taiwan_strait', title: '共軍演訓', sections: [{ label: '報導', text: '多家媒體報導共軍在東部海域演訓。' }] };
  assert.match(officialReminder(base), /print_official_data\.js taiwan_strait/);
  assert.strictEqual(officialReminder({ ...base, sections: [{ label: '報導', text: '國防部通報共艦 12 艘，雷達衛星同期在馬祖偵測船數增加。' }] }), null);
  assert.strictEqual(officialReminder({ draft: { ...base, theater: 'global' } }), null, 'no rule for global');
});

test('ally statements: only official domains, relative MOD links resolved, callouts classified', () => {
  const A = require('../src/collectors/ally_statements');
  const mod = { id: 'mod_jp', publisher: '日本防衛省', url: 'https://www.mod.go.jp/j/rss/news.xml' };
  const xml = '<rss><channel><item><title>北朝鮮のミサイル等関連情報（速報）</title><link>/j/press/news/2026/10/13a.html</link><pubDate>Tue, 13 Oct 2026 18:04:13 +0900</pubDate></item><item><title>防衛大臣感謝状</title><link>/j/x.html</link><pubDate>Tue, 13 Oct 2026 18:04:13 +0900</pubDate></item></channel></rss>';
  const items = A.parseRss(xml, mod);
  assert.strictEqual(items.length, 1); assert.strictEqual(items[0].url, 'https://www.mod.go.jp/j/press/news/2026/10/13a.html'); assert.deepStrictEqual(items[0].tags, ['DPRK_MISSILE']);
  const g = { id: 'us_gov_search', publisher: 'US', url: 'https://news.google.com/rss/search', gnews: true };
  const gx = '<rss><channel>'
    + '<item><title>Statement on PRC unsafe and coercive actions near Second Thomas Shoal - U.S. Department of State (.gov)</title><link>https://news.google.com/a</link><pubDate>Mon, 19 Oct 2026 10:00:00 GMT</pubDate><source url="https://www.state.gov">U.S. Department of State (.gov)</source></item>'
    + '<item><title>China harasses Taiwan, says blog - Some Blog</title><link>https://news.google.com/b</link><pubDate>Mon, 19 Oct 2026 10:00:00 GMT</pubDate><source url="https://blog.example.com">Some Blog</source></item></channel></rss>';
  const gi = A.parseRss(gx, g);
  assert.strictEqual(gi.length, 1, 'non-official domain dropped'); assert.ok(gi[0].tags.includes('SCS_CALLOUT'));
  assert.deepStrictEqual(A.classify('Readout of call with PRC counterpart on Taiwan'), ['TW_MENTION'], 'mention without callout words is not a callout');
  const now = Date.parse('2026-10-20T00:00:00Z');
  const r = A.assessAlly({ lastSuccess: new Date(now).toISOString(), items: gi }, 'SCS_CALLOUT', now);
  assert.strictEqual(r.status, 'TRIGGERED'); assert.strictEqual(r.sources[0].sourceClass, 'OFFICIAL');
  assert.strictEqual(A.assessAlly({ lastSuccess: new Date(now).toISOString(), items: gi }, 'TW_CALLOUT', now).status, 'CLEAR');
});

test('accuracy review: records daily triggers, flags always-on level 2 and noisy indicators, sends on the 1st only', () => {
  const R = require('../src/accuracy_review');
  const file = tmp('daily');
  const now = Date.parse('2026-10-20T04:00:00Z');
  const board = { generatedAt: new Date(now).toISOString(), theaters: [{ id: 'taiwan_strait', name: '台海', triggered: [{ id: 'tw_market' }] }] };
  R.recordIndicatorDay(board, { file, now });
  R.recordIndicatorDay({ ...board, theaters: [{ id: 'taiwan_strait', triggered: [{ id: 'tw_coast_guard' }] }] }, { file, now });
  const daily = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepStrictEqual(daily.days['2026-10-20'].taiwan_strait.sort(), ['tw_coast_guard', 'tw_market']);
  const history = { snapshots: Array.from({ length: 20 }, (_, i) => ({ at: new Date(now - i * 864e5).toISOString(), theater: 'taiwan_strait', level: 2 })) };
  const r = R.review({ now, daily, history, board: { theaters: [{ id: 'taiwan_strait', name: '台海' }] }, backtest: { indicators: [] } });
  assert.strictEqual(r.theaters[0].atLeast2, 1);
  assert.ok(r.theaters[0].noisy.some(f => f.id === 'tw_market'));
  assert.match(R.reviewText(r), /失去區辨力/);
  assert.strictEqual(R.monthlyDue({}, Date.parse('2026-11-01T02:00:00Z')), '2026-11', '1st of month after 09:00 Taipei');
  assert.strictEqual(R.monthlyDue({}, Date.parse('2026-10-31T23:00:00Z')), null, 'before 09:00 Taipei on the 1st');
  assert.strictEqual(R.monthlyDue({ lastMonth: '2026-11' }, Date.parse('2026-11-01T05:00:00Z')), null, 'only once');
  fs.rmSync(file, { force: true });
});

test('evacuation / travel advisory counts only for the destination theater', () => {
  const D = require('../src/collectors/diplomacy');
  const th = t => D.classify(t).map(x => x.theater);
  assert.deepStrictEqual(th('Iran issues travel advisory for riot-hit France, Belgium and Italy amid spreading unrest'), [], 'Iran is the issuer, not the destination');
  assert.deepStrictEqual(th('US raises travel advisory for Israel to level 4 amid Iran strikes'), ['middle_east']);
  assert.deepStrictEqual(th('UK urges citizens to leave Iran immediately'), ['iran_gulf']);
  assert.deepStrictEqual(th('State Department orders departure of non-emergency staff from Taiwan'), ['taiwan_strait']);
});
