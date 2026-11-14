// 官方第一手 feed：美英日台旅遊警示、證交所外資買賣超、中國國防部／東部戰區／國台辦發布
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ta = require('../src/collectors/travel_advisories');
const tw = require('../src/collectors/twse_flows');
const cn = require('../src/collectors/cn_official');
const HOUR = 3600_000, DAY = 24 * HOUR;
const tmp = name => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ww-off-')), name);

const US = lvl => `<rss><channel><item><title>Taiwan - Level ${lvl}: Exercise Normal Precautions</title><link>https://travel.state.gov/x/taiwan.html</link><pubDate>Sat, 10 Oct 2026</pubDate><description><![CDATA[Exercise normal precautions in Taiwan.]]></description></item>
<item><title>Yemen - Level 4: Do Not Travel</title><link>https://travel.state.gov/x/yemen.html</link><pubDate>Sat, 10 Oct 2026</pubDate><description><![CDATA[Do not travel to Yemen. The U.S. Embassy suspended operations.]]></description></item></channel></rss>`;
const UK = `<feed><entry><id>x</id><updated>2026-10-12T12:48:05+01:00</updated><link rel="alternate" type="text/html" href="https://www.gov.uk/foreign-travel-advice/poland"/><title>Poland</title><summary type="xhtml"><div>Addition of information about the temporary withdrawal of dependants of British Embassy staff.</div></summary></entry></feed>`;
const JP = `<rss><channel><item><title><![CDATA[台湾：危険情報の発出（レベル2）]]></title><link><![CDATA[https://www.anzen.mofa.go.jp/info/x.html]]></link><description><![CDATA[不要不急の渡航は止めてください]]></description><category><![CDATA[危険情報]]></category><pubDate>Fri, 9 Oct 2026 19:13:10 +0900</pubDate></item></channel></rss>`;
const TW = lvl => `<rss><channel><item><title><![CDATA[第${lvl}級：紅色儘速離境 - 以色列 - 全境 - Israel - whole]]></title><link>https://www.boca.gov.tw/sp-trwa-content-1-1.html</link><description><![CDATA[<p>外交部籲請國人儘速離境。</p>]]></description><pubDate>Sun, 11 Oct 2026 10:00:00 +0800</pubDate></item></channel></rss>`;

test('travel advisories: four feed formats parse; countries map to theaters', () => {
  const us = ta.parseFeed('US', US(1)); assert.equal(us.length, 2); assert.equal(us[0].country, 'Taiwan'); assert.equal(us[0].level, 1); assert.equal(us[0].publishedAt.slice(0, 10), '2026-10-10');
  const uk = ta.parseFeed('UK', UK); assert.equal(uk[0].country, 'Poland'); assert.equal(uk[0].level, null); assert.match(uk[0].text, /withdrawal of dependants/);
  const jp = ta.parseFeed('JP', JP); assert.equal(jp[0].country, '台湾'); assert.equal(jp[0].level, 2); assert.match(jp[0].title, /危険情報/);
  const tww = ta.parseFeed('TW', TW('四')); assert.equal(tww[0].country, '以色列'); assert.equal(tww[0].level, 4);
  assert.equal(ta.theaterOf('Taiwan'), 'taiwan_strait'); assert.equal(ta.theaterOf('台湾'), 'taiwan_strait'); assert.equal(ta.theaterOf('Poland'), 'europe_security'); assert.equal(ta.theaterOf('以色列'), 'middle_east'); assert.equal(ta.theaterOf('Peru'), null);
  assert.equal(ta.theaterOf('沙烏地阿拉伯', '第四級：紅色儘速離境 - 沙烏地阿拉伯 - 沙國與葉門邊界地區納季蘭'), 'middle_east', 'Yemen-border advisories are Houthi-related, not Iran/Hormuz');
  assert.equal(ta.theaterOf('Saudi Arabia', 'Reconsider travel due to missile and drone attacks'), 'iran_gulf');
});

test('travel advisories: level raises and evacuation wording become events; first sighting is not an event', async () => {
  const file = tmp('ta.json');
  const now = Date.parse('2026-10-12T06:00:00Z');
  const feeds = { US: US(1), UK: UK, JP: JP, TW: TW('四') };
  const fake = async url => { const k = Object.keys(ta.FEEDS).find(k => ta.FEEDS[k].url === url); return { ok: true, text: async () => feeds[k] }; };
  let c = await ta.refreshTravelAdvisories({ force: true, file, fetchImpl: fake, now });
  assert.equal(c.status, 'ONLINE'); assert.equal(c.current['US:Taiwan'].level, 1);
  const kinds = c.events.map(e => `${e.source}:${e.country}:${e.kind}`);
  assert.ok(kinds.includes('UK:Poland:EVACUATION_TEXT') && kinds.includes('TW:以色列:EVACUATION_TEXT') && kinds.includes('US:Yemen:EVACUATION_TEXT'));
  assert.ok(!kinds.some(k => /LEVEL_RAISED/.test(k)), 'no raises on first sighting');
  assert.equal(ta.assessAdvisories(c, 'taiwan_strait', now).status, 'CLEAR');
  assert.equal(ta.assessAdvisories(c, 'europe_security', now).status, 'TRIGGERED');
  // Taiwan raised to Level 3 on a later run → event + trigger
  feeds.US = US(3).replace('Exercise Normal Precautions', 'Reconsider Travel');
  c = await ta.refreshTravelAdvisories({ force: true, file, fetchImpl: fake, now: now + HOUR });
  const ev = c.events.find(e => e.source === 'US' && e.country === 'Taiwan');
  assert.equal(ev.kind, 'LEVEL_RAISED'); assert.equal(ev.from, 1); assert.equal(ev.to, 3);
  const r = ta.assessAdvisories(c, 'taiwan_strait', now + HOUR);
  assert.equal(r.status, 'TRIGGERED'); assert.match(r.summary, /升為 3/); assert.equal(r.sources[0].sourceClass, 'OFFICIAL');
  assert.equal(ta.assessAdvisories(c, 'taiwan_strait', now + 20 * DAY), null, 'stale cache → unknown');
  // one feed failing keeps the others
  c = await ta.refreshTravelAdvisories({ force: true, file, now: now + 2 * HOUR, fetchImpl: async url => url === ta.FEEDS.JP.url ? { ok: false, status: 500 } : fake(url) });
  assert.equal(c.status, 'PARTIAL'); assert.match(c.error, /JP/);
});

test('TWSE flows: parse official JSON, skip non-trading days, z-score and absolute thresholds', async () => {
  const day = (date, net) => ({ stat: 'OK', date, fields: [], data: [['自營商(自行買賣)', '1', '1', '0'], ['外資及陸資(不含外資自營商)', '1', '1', String(net)], ['外資自營商', '0', '0', '0'], ['合計', '1', '1', String(net)]] });
  assert.equal(tw.parseDay({ stat: '很抱歉，沒有符合條件的資料!' }), null);
  assert.equal(tw.parseDay(day('20261012', '-52,198,146,456')).foreignNet, -52198146456);
  const file = tmp('twse.json');
  const now = Date.parse('2026-10-12T10:00:00Z');
  const nets = {}; // 70 個日曆日，週末為非交易日；平日淨額在 ±5e9 之間，最後一天 -70e9
  for (let d = 0; d <= 70; d++) { const t = now - d * DAY; const wd = new Date(t + 8 * HOUR).getUTCDay(); if (wd === 0 || wd === 6) continue; const key = new Date(t + 8 * HOUR).toISOString().slice(0, 10).replace(/-/g, ''); nets[key] = d === 0 ? -70e9 : ((d * 7919) % 100 - 50) * 1e8; }
  const fake = async url => { const key = /dayDate=(\d{8})/.exec(url)[1]; return { ok: true, json: async () => nets[key] !== undefined ? day(key, String(nets[key])) : { stat: '很抱歉，沒有符合條件的資料!' } }; };
  let c = await tw.refreshTwseFlows({ force: true, file, fetchImpl: fake, now, backfillDays: 70 });
  for (let i = 0; i < 3; i++) c = await tw.refreshTwseFlows({ force: true, file, fetchImpl: fake, now, backfillDays: 70 }); // 每次最多 25 個請求
  assert.equal(c.status, 'ONLINE'); assert.ok(c.tradingDays >= 45, `got ${c.tradingDays}`); assert.ok(c.nonTrading.length >= 15);
  const r = tw.assessTwseFlows(c, now);
  assert.equal(r.status, 'TRIGGERED'); assert.ok(r.baseline.z < -2.5); assert.match(r.summary, /−700\.0 億/); assert.match(r.summary, /不構成投資建議/);
  c.days[c.latestDate].foreignNet = -3e9;
  assert.equal(tw.assessTwseFlows(c, now).status, 'CLEAR');
  assert.equal(tw.assessTwseFlows({ ...c, lastSuccess: new Date(now + 6 * DAY).toISOString() }, now + 6 * DAY).status, 'UNKNOWN', 'data older than 5 days is not judged');
  assert.equal(tw.assessTwseFlows(c, now + 6 * DAY), null, 'stale cache → unknown');
});

const MOD_LIST = `<ul><li><a href="http://www.mod.gov.cn/gfbw/xwfyr/fyrthhdjzw/16492077.html"><img src="/x.jpg"/><h3><p class="title">国防部新闻发言人陈曦就赖清德发表所谓“双十”讲话答记者问</p><small class="time hidden-xs">2026-10-11 11:19</small></h3></a></li>
<li><a href="http://www.mod.gov.cn/gfbw/wzll/dbzq/16490000.html"><h3><p class="title">东部战区组织联合战备警巡</p><small class="time">2026-10-10 09:00</small></h3></a></li>
<li><a href="http://www.mod.gov.cn/gfbw/wzll/dbzq/16480000.html"><h3><p class="title">东部战区位台岛周边开展“正义使命”演习</p><small class="time">2026-09-20 08:00</small></h3></a></li></ul>`;
// 與國防部網相同的結構：標頭（含來源、責任編輯、時間）在 article-header，正文段落在 article-content
const ARTICLE = `<html><div class="content"><div class="article-header"><h1>国防部新闻发言人陈曦答记者问</h1><p>来源：国防部网 责任编辑：杨菁 2026-10-11 11:19:50</p></div>
<div class="article-content"><p class="ueditor-text-p_display">民进党当局玩火必自焚。我们严正警告，任何“台独”分裂行径都将遭到迎头痛击。</p></div><div class="footer">相关稿件 打印本页</div></div></html>`;

test('China official: list and article parse; keyword scoring; patrol/exercise/rhetoric assessment', async () => {
  const list = cn.parseModList(MOD_LIST);
  assert.equal(list.length, 3); assert.equal(list[0].publishedAt, '2026-10-11T03:19:00.000Z', 'CST → UTC');
  const text = cn.parseArticle(ARTICLE); assert.match(text, /^民进党当局玩火必自焚/);
  const s = cn.score('国防部发言人就“双十”讲话答记者问', text);
  assert.ok(s.hits.includes('玩火') && s.hits.includes('严正警告') && s.hits.includes('迎头痛击') && s.hits.includes('台独')); assert.ok(s.score >= 10);
  const file = tmp('cn.json');
  const now = Date.parse('2026-10-12T06:00:00Z');
  const calls = [];
  const fake = async url => { calls.push(url); if (/gwytb/.test(url)) throw new Error('ECONNRESET'); if (/index\.html$/.test(url)) return { ok: true, text: async () => MOD_LIST }; if (/cdx|wayback|archive\.org/.test(url)) return { ok: false, status: 503, headers: new Map(), text: async () => '' }; return { ok: true, text: async () => ARTICLE }; };
  const c = await cn.refreshCnOfficial({ force: true, file, fetchImpl: fake, now, maxArticles: 2 });
  assert.equal(c.status, 'PARTIAL'); assert.equal(c.sources.gwytb.status, 'DEGRADED'); assert.equal(Object.keys(c.items).length, 3);
  assert.equal(c.articlesFetched, 2); assert.ok(Object.values(c.items).filter(i => i.text).length === 2);
  assert.equal(cn.assessCnOfficial(c, 'PATROL', now).status, 'TRIGGERED', 'patrol announced 2 days ago');
  const allOk = t => Object.fromEntries(Object.keys(c.sources).map(k => [k, { ...c.sources[k], lastSuccess: new Date(t).toISOString() }]));
  assert.equal(cn.assessCnOfficial({ ...c, lastSuccess: new Date(now + 3 * DAY).toISOString() }, 'PATROL', now + 3 * DAY).status, 'UNKNOWN', 'individual sources 3 days old → no hit is not a clear');
  assert.equal(cn.assessCnOfficial({ ...c, lastSuccess: new Date(now + 3 * DAY).toISOString(), sources: allOk(now + 3 * DAY) }, 'PATROL', now + 3 * DAY).status, 'CLEAR');
  assert.equal(cn.assessCnOfficial(c, 'PATROL', now + 3 * DAY), null, 'stale cache → unknown');
  const ex = cn.assessCnOfficial(c, 'EXERCISE', Date.parse('2026-09-24T00:00:00Z')); assert.equal(ex.status, 'TRIGGERED'); assert.match(ex.summary, /正义使命/);
  assert.equal(cn.assessCnOfficial({ ...c, lastSuccess: new Date(now).toISOString() }, 'EXERCISE', now).status, 'UNKNOWN', 'gwytb never fetched → cannot clear');
  assert.equal(cn.assessCnOfficial({ ...c, lastSuccess: new Date(now).toISOString(), sources: allOk(now) }, 'EXERCISE', now).status, 'CLEAR', 'exercise older than 7 days');
  assert.equal(cn.assessCnOfficial(c, 'RHETORIC', now).status, 'UNKNOWN', 'fewer than 30 days of data → not judged');
  // 90 天資料：平常每天 2 分，最近 3 天 60 分 → 超過 P90
  const items = {};
  for (let d = 1; d <= 92; d++) items[`http://www.mod.gov.cn/a/${d}.html`] = { source: 'mnd_spokesman', publisher: 'x', url: `http://www.mod.gov.cn/a/${d}.html`, title: '国防部就台海局势答问', publishedAt: new Date(now - d * DAY).toISOString(), score: d <= 3 ? 20 : 2, hits: ['台独'] };
  const r = cn.assessCnOfficial({ lastSuccess: new Date(now).toISOString(), items }, 'RHETORIC', now);
  assert.equal(r.status, 'TRIGGERED'); assert.equal(r.value, 40, 'items 1 and 2 days ago fall in the 3-day window'); assert.ok(r.baseline.p90 <= 6); assert.match(r.summary, /不解讀意圖/);
});

test('warning board wires advisories, TWSE and China-official sources into indicators', () => {
  const { buildWarningBoard } = require('../src/warning_board');
  const now = Date.parse('2026-10-12T06:00:00Z');
  const advisories = { lastSuccess: new Date(now).toISOString(), current: {}, events: [{ source: 'US', publisher: '美國國務院', country: 'Taiwan', theater: 'taiwan_strait', kind: 'LEVEL_RAISED', from: 1, to: 4, title: 'Taiwan - Level 4', url: 'https://travel.state.gov/x', publishedAt: new Date(now - DAY).toISOString() }] };
  const cnoff = { lastSuccess: new Date(now).toISOString(), items: { 'http://www.mod.gov.cn/p.html': { source: 'eastern_theater', publisher: '中國國防部網（東部戰區）', url: 'http://www.mod.gov.cn/p.html', title: '东部战区组织联合战备警巡', publishedAt: new Date(now - HOUR).toISOString(), score: 6 } } };
  const board = buildWarningBoard({ now, ledger: { entries: [] }, history: { snapshots: [] }, advisories, cnoff });
  const t = board.theaters.find(x => x.id === 'taiwan_strait');
  assert.equal(t.indicators.find(i => i.id === 'tw_evac').status, 'TRIGGERED');
  assert.equal(t.indicators.find(i => i.id === 'tw_joint_patrol').status, 'TRIGGERED');
  assert.match(t.indicators.find(i => i.id === 'tw_joint_patrol').sources[0].publisher, /東部戰區/);
  assert.equal(board.theaters.find(x => x.id === 'iran_gulf').indicators.find(i => i.id === 'ir_evac').status, 'CLEAR');
});
