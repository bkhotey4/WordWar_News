const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const msa = require('../src/collectors/china_msa');
const js = require('../src/collectors/japan_js');
const DAY = 86400_000;

const ARTICLE = `<div class="msg clearfix"><div class="pull-left"><span>来源：漳州海事局</span><span>文号：闽航警126/26</span><span>发布时间：2026-07-22 10:46</span><span class="fontSize">[字体：<a>大</a>]</span><div class="dayin">分享到</div></div></div>
<div class="text" id="ch_p"><p>闽航警126/26，台湾海峡，东海，</br>2026年7月23日0600时至1800时，在以下五点连线范围内进行实弹射击：</br>1）23-41.31N、117-31.49E</br>2）23-36.23N、117-28.73E</br>3）23-35.10N、117-30.10E</br>4）23-38.60N、117-36.21E</br>5）23-41.30N、117-34.58E</br>7月24日0600时至1800时，在以下四点连线范围内进行实弹射击：</br>1）23-37.00N、117-26.50E</br>2）23-37.00N、117-29.50E</br>3）23-33.00N、117-29.50E</br>4）23-33.00N、117-26.50E</br></br>禁止进入。</p>
<div class="foot_but"><a>收藏</a></div></div>`;

test('MSA list keeps Chinese notices and skips English duplicates', () => {
  const html = '<li><a href="/html/cnmsa/hxaq/article/2026/abc.html?x=1">军事演习—闽航警126/26 2026-07-22</a></li><li><a href="/html/cnmsa/hxaq/article/2026/def.html">TOWING OPERATION—FJ178/26 2026-09-29</a></li><li><a href="/html/cnmsa/hxaq/article/2026/ghi.html">舟山衢山西水域军事活动—浙航警890/26 2026-09-28</a></li>';
  const items = msa.parseList(html);
  assert.deepEqual(items.map(i => i.code), ['闽航警126/26', '浙航警890/26']);
  assert.equal(items[0].type, '军事演习');
  assert.equal(items[0].url, 'https://www.msa.gov.cn/html/cnmsa/hxaq/article/2026/abc.html');
});

test('MSA article parses publish time, one area per date, and validity', () => {
  const n = msa.parseArticle(ARTICLE, { code: '闽航警126/26', type: '军事演习', url: 'https://x', date: '2026-07-22' });
  assert.equal(n.source, '漳州海事局');
  assert.equal(n.publishedAt, '2026-07-22T02:46:00.000Z');
  assert.equal(n.areas.length, 2);
  assert.equal(n.areas[0].length, 5);
  assert.ok(Math.abs(n.areas[0][0][0] - (117 + 31.49 / 60)) < 1e-9 && Math.abs(n.areas[0][0][1] - (23 + 41.31 / 60)) < 1e-9);
  assert.equal(n.validFrom, '2026-07-22T16:00:00.000Z');
  assert.equal(n.validTo, '2026-07-24T15:59:59.999Z');
  assert.doesNotMatch(n.text, /收藏/);
});

test('MSA coordinate formats: degree-minute, whole minutes, DMS and circles', () => {
  assert.deepEqual(msa.coordsIn('30-30N 122-0E'), [[122, 30.5]]);
  const [[lon, lat]] = msa.coordsIn('25-15-30N 119-55-00E');
  assert.ok(Math.abs(lat - 25.2583333) < 1e-6 && Math.abs(lon - 119.9166667) < 1e-6);
  const areas = msa.parseAreas('9月1日以24-30N、119-00E为中心、半径5海里圆形区域内实弹射击');
  assert.equal(areas.length, 1); assert.equal(areas[0].length, 25);
  assert.equal(msa.parseAreas('无座标公告').length, 0);
});

test('MSA assessment: zones east of the median line trigger immediately; others use the 60-day baseline', () => {
  const now = Date.parse('2026-09-30T00:00:00Z');
  const mk = (code, daysAgo, lon, lat) => ({ code, type: '实弹射击', url: 'https://x', bureauName: '福建海事局', publishedAt: new Date(now - daysAgo * DAY).toISOString(), areas: [[[lon, lat], [lon + 0.05, lat], [lon, lat + 0.05]]] });
  const old = Array.from({ length: 10 }, (_, i) => mk(`c${i}`, 10 + i * 7, 118.0, 24.3));
  const cache = { lastSuccess: new Date(now).toISOString(), notices: [...old, mk('w1', 2, 118.0, 24.3)] };
  assert.equal(msa.assessChinaMsa(cache, now).status, 'WITHIN_HISTORICAL_RANGE');
  const near = msa.assessChinaMsa({ ...cache, notices: [...cache.notices, mk('e1', 1, 121.0, 24.0)] }, now);
  assert.equal(near.status, 'NEAR_TAIWAN'); assert.equal(near.near[0].code, 'e1');
  assert.equal(msa.assessChinaMsa({ ...cache, notices: [...cache.notices, mk('z1', 1, 122.1, 30.5)] }, now).current, 1, 'Zhoushan drills are outside the Taiwan box');
  assert.equal(msa.assessChinaMsa({ ...cache, lastSuccess: new Date(now - 3 * DAY).toISOString() }, now).status, 'STALE');
});

test('MSA collector backfills once, then only reads new notices; failures keep old data', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'msa-')), 'c.json');
  let articleCalls = 0;
  const fake = async url => {
    if (/index/.test(url)) return { ok: true, text: async () => /index_/.test(url) ? '' : '<a href="/html/cnmsa/hxaq/article/2026/abc.html">军事演习—闽航警126/26 2026-07-22</a><a href="/html/cnmsa/hxaq/article/2026/x.html">拖带作业—闽航警127/26 2026-07-22</a>' };
    articleCalls++; return { ok: true, text: async () => ARTICLE };
  };
  // 503 會觸發 PowerShell 備援；注入失敗的 run，測試不真的連到海事局
  const run = async () => { throw new Error('offline test'); };
  const c = await msa.refreshChinaMsa({ force: true, file, fetchImpl: fake, run, now: Date.parse('2026-07-23T00:00:00Z') });
  assert.equal(c.notices.length, 1); assert.equal(articleCalls, 1); assert.equal(c.status, 'ONLINE');
  await msa.refreshChinaMsa({ force: true, file, fetchImpl: fake, run, now: Date.parse('2026-07-23T02:00:00Z') });
  assert.equal(articleCalls, 1, 'known notices are not fetched again');
  const bad = await msa.refreshChinaMsa({ force: true, file, fetchImpl: async () => ({ ok: false, status: 503 }), run, now: Date.parse('2026-07-23T05:00:00Z') });
  assert.equal(bad.notices.length, 1); assert.equal(bad.status, 'DEGRADED');
});

const JS_HTML = `<li><a href="/js/pdf/2026/p20260916_02.pdf" target="_blank"><time datetime="2026-09-16">2026年09月16日</time><span>公表</span><h5>中国海軍艦艇の動向について（ルーヤンⅢ、ジャンカイⅡ／奄美大島－横当島間南西進）</h5></a></li>
<li><a href="/js/pdf/2026/p20260918_01.pdf"><time datetime="2026-09-18">2026年09月18日</time><h5>日米共同訓練の実施について</h5></a></li>
<li><a href="/js/pdf/2026/p20260622_01.pdf"><time datetime="2026-06-22">2026年06月22日</time><h5>中国海軍艦艇の動向について（空母「遼寧」ほか２隻／与那国島－台湾間北進）</h5></a></li>
<li><a href="/js/pdf/2026/p20260909_02.pdf"><time datetime="2026-09-09">2026年09月09日</time><h5>中国軍機の動向について（Y-9）</h5></a></li>`;

test('Japan Joint Staff list keeps Chinese navy/aircraft items and classifies carriers and passages', () => {
  const items = js.parseList(JS_HTML);
  assert.equal(items.length, 3);
  assert.equal(items[0].kind, 'NAVY'); assert.equal(items[0].passage.name, '奄美大島—橫當島間');
  assert.equal(items[1].carrier, true); assert.equal(items[1].taiwanNear, true); assert.equal(items[1].passage.name, '與那國島—台灣間');
  assert.equal(items[2].kind, 'AIRCRAFT');
  assert.equal(items[0].url, 'https://www.mod.go.jp/js/pdf/2026/p20260916_02.pdf');
});

test('Japan Joint Staff assessment: carriers trigger; otherwise compare to the 60-day P95', () => {
  const now = Date.parse('2026-09-30T00:00:00Z');
  const day = d => new Date(now - d * DAY).toISOString().slice(0, 10);
  const routine = Array.from({ length: 30 }, (_, i) => ({ date: day(8 + i * 2), title: '中国軍機の動向について（Y-9）', kind: 'AIRCRAFT', carrier: false, taiwanNear: false }));
  const base = { lastSuccess: new Date(now).toISOString(), items: [...routine, { date: day(1), title: 'x', kind: 'NAVY', carrier: false, taiwanNear: false }] };
  assert.equal(js.assessJapanJs(base, now).status, 'WITHIN_HISTORICAL_RANGE');
  const carrier = js.assessJapanJs({ ...base, items: [...base.items, { date: day(2), title: '空母「遼寧」', kind: 'NAVY', carrier: true, taiwanNear: false }] }, now);
  assert.equal(carrier.status, 'CARRIER_OR_NEAR_TAIWAN');
  const busy = js.assessJapanJs({ ...base, items: [...base.items, ...Array.from({ length: 8 }, (_, i) => ({ date: day(i % 6), title: 'y', kind: 'AIRCRAFT', carrier: false, taiwanNear: false }))] }, now);
  assert.equal(busy.status, 'ABOVE_HISTORICAL_P95');
});

test('precursor indicators feed the Taiwan warning board as official sources', () => {
  const { buildWarningBoard } = require('../src/warning_board');
  const now = Date.parse('2026-09-30T00:00:00Z');
  const msaA = { status: 'NEAR_TAIWAN', current: 1, historicalP95: 2, samples: 60, near: [{ code: '闽航警200/26', type: '实弹射击', url: 'https://www.msa.gov.cn/a', bureauName: '福建海事局', publishedAt: '2026-09-29T00:00:00Z' }], recent: [] };
  const jsA = { status: 'CARRIER_OR_NEAR_TAIWAN', current: 2, historicalP95: 3, samples: 60, special: [{ date: '2026-09-28', title: '中国海軍艦艇の動向について（空母「山東」）', url: 'https://www.mod.go.jp/x.pdf' }], recent: [] };
  const b = buildWarningBoard({ now, ledger: { entries: [] }, history: { snapshots: [] }, msa: msaA, jsjp: jsA });
  const tw = b.theaters.find(t => t.id === 'taiwan_strait');
  for (const id of ['tw_nav_warning', 'tw_japan_fleet']) {
    const i = tw.indicators.find(x => x.id === id);
    assert.equal(i.status, 'TRIGGERED', id); assert.equal(i.sources[0].sourceClass, 'OFFICIAL');
  }
  assert.equal(tw.level, 2, 'two secondary indicators raise Taiwan to level 2');
});
