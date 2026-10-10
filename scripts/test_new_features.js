// 台灣民生指標、每週導讀、月報、每日摘要、時間軸、離線頁的單元測試
const test = require('node:test');
const assert = require('node:assert');

test('台灣民生指標：停電要有規模、排除天候與演習；外島停駛排除天候', () => {
  const c = require('../src/collectors/taiwan_civil');
  assert.strictEqual(c.classify('興達電廠跳機 南部3.5萬戶停電'), 'POWER');
  assert.strictEqual(c.classify('全台大停電／新竹地區輪停表曝光'), 'POWER');
  for (const t of ['颱風來襲 全台停電戶數破10萬', '快訊／新北淡水區4088戶大停電', '國軍演習 模擬變電所遭攻擊', '西班牙南部大規模停電 100萬戶', '討論牆 | 0303大停電賠償方案出爐']) assert.strictEqual(c.classify(t), null, t);
  assert.strictEqual(c.classify('金門機場航班全數取消 小三通停駛'), 'ISLANDS');
  assert.strictEqual(c.classify('大霧影響 金門航班取消'), null);
  assert.strictEqual(c.classify('中國宣布鎵鍺出口管制 半導體供應鏈受衝擊'), 'CHIPS');
  assert.strictEqual(c.classify('美國考慮擴大晶片出口管制'), null);
});

test('來源多數查詢失敗超過 2 小時 → 無法判定（不是未觸發）', () => {
  const c = require('../src/collectors/taiwan_civil');
  const now = Date.parse('2026-10-09T04:00:00Z');
  const cache = { lastSuccess: new Date(now - 3 * 3600_000).toISOString(), lastAttempt: new Date(now - 60_000).toISOString(), events: [], daily: {} };
  assert.strictEqual(c.assessCivil(cache, 'POWER', now), null);
  assert.strictEqual(c.assessCivil({ ...cache, lastSuccess: cache.lastAttempt }, 'POWER', now).status, 'CLEAR');
});

test('每週導讀：ISO 週以台北時間計', () => {
  const { weekOf } = require('./site_digest_weekly');
  assert.strictEqual(weekOf('2026-10-11T15:59:00Z').key, '2026-W41'); // 台北 10/11 23:59（週日）
  assert.strictEqual(weekOf('2026-10-11T16:00:00Z').key, '2026-W42'); // 台北 10/12 00:00（週一）
  assert.strictEqual(weekOf('2026-01-01T00:00:00Z').key, '2026-W01');
});

test('月報：上個月份與只在月初建立快照', () => {
  const m = require('../src/monthly');
  assert.strictEqual(m.previousMonth(Date.parse('2026-09-30T17:00:00Z')), '2026-09'); // 台北 10/1 01:00
  assert.strictEqual(m.previousMonth(Date.parse('2026-01-01T01:00:00Z')), '2025-12');
  const fs = require('fs'), os = require('os'), path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-'));
  assert.strictEqual(m.ensureSnapshot(Date.parse('2026-10-09T04:00:00Z'), { dir }), null); // 10/9 不建立
});

test('每日摘要與時間軸燈號變化', () => {
  const { briefText } = require('../src/daily_brief');
  const board = { theaters: [{ id: 'taiwan_strait', name: '台海', level: 2, levelName: '升溫', triggered: [{ name: '聯合戰備警巡（國防部原文或 2 家以上媒體）' }], deescalation: [] }, { id: 'iran_gulf', name: '美伊', level: null }] };
  const t = briefText(board, { now: Date.parse('2026-10-09T01:00:00Z'), markets: null });
  assert.match(t, /^10\/9（五）每日摘要｜台海 2 級升溫：聯合戰備警巡｜美伊 無法判定。市場資料暫缺。$/);
  const { levelChanges } = require('./site_timeline');
  const snaps = [['2026-10-01T02:00:00Z', 1], ['2026-10-02T02:00:00Z', 2], ['2026-10-03T02:00:00Z', 2], ['2026-10-04T02:00:00Z', 1]].map(([at, level]) => ({ at, theater: 'taiwan_strait', level }));
  assert.deepStrictEqual(levelChanges({ snapshots: snaps }, 'taiwan_strait', Date.parse('2026-10-05T00:00:00Z')).map(e => e.kind), ['LEVEL_UP', 'LEVEL_DOWN']);
});

test('離線頁：service worker 語法正確、避難處所快取名稱帶資料日期', () => {
  const sp = require('./site_prepare');
  const sw = sp.serviceWorker('123', { shelters: true, sheltersVersion: '2026-10-09T00:00:00Z' });
  assert.doesNotThrow(() => new Function(sw.replace(/self\./g, 'globalThis.')));
  assert.match(sw, /ww-shelters-20261009T000000Z/);
  assert.match(sw, /shelters\/index\.json/);
  assert.doesNotMatch(sp.serviceWorker('1', { shelters: false }), /shelters\/index\.json/);
  const { compact, districtOf } = require('./build_shelters');
  assert.deepStrictEqual(compact({ properties: { 地址: '臺北市中正區臨沂街75巷6號', 地下樓層數: 'B01', 可容納人數: '33.0', 類別: '一般住宅' }, geometry: { coordinates: [121.528668, 25.034645] } }), [25.03465, 121.52867, '臺北市中正區臨沂街75巷6號', 'B01', 33, '一般住宅']);
  assert.strictEqual(compact({ properties: {}, geometry: { coordinates: [0, 0] } }), null);
  assert.strictEqual(districtOf('台北市大安區復興南路'), '臺北市大安區');
});

test('中國民船與動員、搶購、航運戰爭險', () => {
  const c = require('../src/collectors/taiwan_civil');
  assert.strictEqual(c.classify('解放軍演習 大型滾裝船集結福建港口運兵'), 'MOBIL');
  assert.strictEqual(c.classify('China mobilizes ro-ro ferries for PLA landing drill'), 'MOBIL');
  assert.strictEqual(c.classify('全民防衛動員署 萬安演習 動員民船演練'), null);
  assert.strictEqual(c.classify('台海局勢緊張 全聯泡麵遭搶購一空'), 'PANIC');
  assert.strictEqual(c.classify('颱風逼近 超市泡麵搶購一空'), null);
  const d = require('../src/collectors/diplomacy');
  assert.deepStrictEqual(d.classify('Shipping lines reroute vessels to avoid Taiwan Strait transits'), [{ type: 'SHIP', theater: 'taiwan_strait' }]);
  assert.deepStrictEqual(d.classify('Hormuz war risk premiums double as insurers pull back'), [{ type: 'SHIP', theater: 'iran_gulf' }]);
});

test('USNI 航艦週報：依段落統計海域', () => {
  const u = require('../src/collectors/usni_fleet');
  const html = '<h2>In Japan</h2><p>USS George Washington (CVN-73) is in port.</p><h2>In the Philippine Sea</h2><p>USS Nimitz (CVN-68)</p><h3>CSG 11</h3><p>(CVN-68)</p><h2>In the South China Sea</h2><p>USS Abraham Lincoln (CVN-72)</p><h2>In the Arabian Sea</h2><p>USS Ford (CVN-78)</p>';
  const list = u.parseTracker(html);
  assert.deepStrictEqual(list.map(x => `${x.hull}:${x.region}`), ['68:WESTPAC', '72:WESTPAC', '73:WESTPAC', '78:MIDEAST']);
  const now = Date.parse('2026-10-09T00:00:00Z');
  const cache = { latest: { publishedAt: '2026-10-06T00:00:00Z', url: 'https://news.usni.org/x', carriers: list } };
  assert.strictEqual(u.assessCarriers(cache, 'taiwan_strait', now).status, 'TRIGGERED');
  assert.strictEqual(u.assessCarriers(cache, 'iran_gulf', now).status, 'CLEAR');
  assert.strictEqual(u.assessCarriers(cache, 'taiwan_strait', now + 12 * 86400_000), null); // 週報太舊
});

test('新戰區：朝鮮半島、南海、以巴紅海、中國海警', () => {
  const r = require('../src/collectors/regional');
  const c = t => r.classify(t)?.type || null;
  assert.strictEqual(c('North Korea fires ballistic missile into East Sea, Seoul says'), 'DPRK_MISSILE');
  assert.strictEqual(c('Chinese coast guard fires water cannon at Philippine vessel near Second Thomas Shoal'), 'SCS_CLASH');
  assert.strictEqual(c('China blocks Philippine resupply mission to Ayungin'), 'SCS_BLOCK');
  assert.strictEqual(c('Houthis attack tanker in Red Sea'), 'HOUTHI');
  assert.strictEqual(c('Israel strikes Hezbollah targets in southern Lebanon'), 'IL_STRIKE');
  assert.strictEqual(c('中國海警船闖入金門限制水域 執法巡查'), 'TW_COASTGUARD');
  assert.strictEqual(c('Analysis: why North Korea keeps testing missiles'), null);
});

test('外交：對台軍售、中國對台措施、國際組織', () => {
  const d = require('../src/collectors/diplomacy');
  assert.deepStrictEqual(d.classify('US approves $2 billion arms sale to Taiwan'), [{ type: 'ARMS', theater: 'taiwan_strait' }]);
  assert.deepStrictEqual(d.classify('國台辦宣布將台獨頑固分子列入懲戒名單'), [{ type: 'CNTW', theater: 'taiwan_strait' }]);
  assert.deepStrictEqual(d.classify('中國商務部對台灣化工產品加徵關稅'), [{ type: 'CNTW', theater: 'taiwan_strait' }]);
  assert.deepStrictEqual(d.classify('UN Security Council votes on Gaza resolution'), [{ type: 'UN', theater: 'middle_east' }]);
  assert.deepStrictEqual(d.classify('IAEA report says Iran expanded enrichment'), [{ type: 'UN', theater: 'iran_gulf' }]);
});

test('每日戰況重點格式檢查', () => {
  const dp = require('./site_daily_points');
  const ok = { id: 'isw-ukraine-20261010', date: '2026-10-10', theater: 'ukraine_front', title: '俄軍持續在波克羅夫斯克方向推進', points: ['俄軍在波克羅夫斯克東南方小幅推進，ISW 依地理定位影像確認。', '烏方稱夜間擊落多數無人機（交戰方說法）。', 'ISW 研判俄方仍以消耗戰為主。'], sources: [{ publisher: 'ISW', url: 'https://understandingwar.org/x' }] };
  assert.deepStrictEqual(dp.checkItem(ok), []);
  assert.ok(dp.checkItem({ ...ok, points: ['太短'] }).length);
  assert.ok(dp.checkItem({ ...ok, title: '俄军推进' }).length); // 簡體字
});

test('動員前兆：以標題中第一個國家當行動方，台灣自己的整備不算', () => {
  const m = require('../src/collectors/mobilization');
  const c = t => { const r = m.classify(t); return r ? `${r.type}|${r.theater}` : null; };
  assert.strictEqual(c('Russia announces new call-up of reservists'), 'RESERVE|ukraine_front');
  assert.strictEqual(c('Israel calls up 60,000 reservists ahead of Gaza operation'), 'RESERVE|middle_east');
  assert.strictEqual(c('中國國防動員法修正 擴大徵召範圍'), 'RESERVE|taiwan_strait');
  assert.strictEqual(c('China stockpiling grain and oil at record pace'), 'STOCKPILE|taiwan_strait');
  assert.strictEqual(c('Iran blocks internet amid unrest'), 'EMERGENCY|iran_gulf');
  assert.strictEqual(c('Poland calls up reservists amid Russian drone threat'), 'EUPREP|europe_security');
  assert.strictEqual(c('Sweden sends civil defence booklet to every household'), 'EUPREP|europe_security');
  assert.strictEqual(c('國軍後備召集 教召改革'), null);
  assert.strictEqual(c('台灣全社會防衛韌性 民防演練'), null);
  assert.strictEqual(c('Analysis: why Russia mobilizes'), null);
});
