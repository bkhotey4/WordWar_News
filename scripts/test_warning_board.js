const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildWarningBoard, recordWarningSnapshot, warningDiscordPayload, validEntry } = require('../src/warning_board');

const NOW = Date.parse('2026-09-30T00:00:00Z');
const src = (cls = 'INDEPENDENT_MEDIA') => [{ url: 'https://example.org/a', publisher: 'Example', sourceClass: cls, publishedAt: '2026-09-29T00:00:00Z' }];
const entry = (id, theater, indicator, triggered = true, extra = {}) => ({ id, theater, indicator, triggered, observedAt: '2026-09-29T00:00:00Z', summary: '測試', sources: src(), reviewed: true, ...extra });
// 主要指標過半有資料才會給等級：補上未觸發的主要指標
const known = (th, ids) => ids.map((id, k) => entry(`k${th}${k}`, th, id, false));
const board = (entries, opts = {}) => buildWarningBoard({ now: NOW, ledger: { entries }, history: { snapshots: opts.snapshots || [] }, taiwanFeed: opts.taiwanFeed || null, mndDocs: opts.mndDocs || [] });
const theater = (b, id) => b.theaters.find(t => t.id === id);

test('entries without review, https source, known indicator or past date are rejected', () => {
  const ok = entry('a', 'iran_gulf', 'ir_us_strikes');
  assert.equal(validEntry(ok, NOW), true);
  for (const bad of [{ reviewed: false }, { indicator: 'nope' }, { theater: 'mars' }, { observedAt: '2026-10-05T00:00:00Z' },
    { sources: [{ ...src()[0], url: 'http://example.org' }] }, { sources: [{ ...src()[0], sourceClass: 'RUMOR' }] }, { sources: [] }])
    assert.equal(validEntry({ ...ok, ...bad }, NOW), false);
});

test('missing data is UNKNOWN and never shown as calm', () => {
  const t = theater(board([]), 'iran_gulf');
  assert.equal(t.level, null);
  assert.equal(t.levelName, '無法判定');
  assert.ok(t.unknown.length > 0);
});

test('checked indicators with no trigger give level 1', () => {
  const t = theater(board([entry('a', 'iran_gulf', 'ir_us_strikes', false), entry('b', 'iran_gulf', 'ir_shipping', false), ...known('iran_gulf', ['ir_reserve'])]), 'iran_gulf');
  assert.equal(t.level, 1);
});

test('two primary triggers need an official or independent source for level 3', () => {
  const e = [entry('a', 'europe_security', 'eu_airspace'), entry('b', 'europe_security', 'eu_evac')];
  assert.equal(theater(board(e), 'europe_security').level, 3);
  // v5：領空遭侵犯與戰機升空同屬一起事件，合併只算 1 項主要指標
  const same = theater(board([entry('a', 'europe_security', 'eu_airspace'), entry('b', 'europe_security', 'eu_response')]), 'europe_security');
  assert.equal(same.level, 2);
  assert.match(same.reason, /合併計為 1 項/);
  const claims = e.map(x => ({ ...x, sources: src('PARTY_CLAIM') }));
  assert.equal(theater(board(claims), 'europe_security').level, 2);
});

test('three secondary triggers raise to level 2 (two are not enough); decisive gives level 4; de-escalation does not count', () => {
  assert.equal(theater(board([entry('a', 'iran_gulf', 'ir_blockade'), entry('b', 'iran_gulf', 'ir_ship_insurance'), entry('c', 'iran_gulf', 'ir_us_strikes', false), ...known('iran_gulf', ['ir_shipping', 'ir_reserve'])]), 'iran_gulf').level, 1, 'two secondary triggers stay at level 1');
  assert.equal(theater(board([entry('a', 'iran_gulf', 'ir_blockade'), entry('b', 'iran_gulf', 'ir_ship_insurance'), entry('d', 'iran_gulf', 'ir_gulf_retaliation'), entry('c', 'iran_gulf', 'ir_us_strikes', false)]), 'iran_gulf').level, 2);
  assert.equal(theater(board([entry('a', 'iran_gulf', 'ir_decisive')]), 'iran_gulf').level, 4);
  const t = theater(board([entry('a', 'iran_gulf', 'ir_talks'), entry('b', 'iran_gulf', 'ir_us_strikes', false), ...known('iran_gulf', ['ir_shipping', 'ir_reserve'])]), 'iran_gulf');
  assert.equal(t.level, 1);
  assert.equal(t.deescalation.length, 1);
});

test('v4: reactive indicators do not raise the level; a lone party-claim primary needs corroboration', () => {
  const reactive = [entry('a', 'taiwan_strait', 'tw_market'), entry('b', 'taiwan_strait', 'tw_media_surge'), entry('c', 'taiwan_strait', 'tw_power'), entry('d', 'taiwan_strait', 'tw_islands'), entry('z', 'taiwan_strait', 'tw_ships', false), ...known('taiwan_strait', ['tw_aircraft', 'tw_joint_patrol', 'tw_named_exercise', 'tw_cn_reserve'])];
  const t = theater(board(reactive), 'taiwan_strait');
  assert.equal(t.rawLevel, 1);
  assert.match(t.reason, /2 項反應性背景訊號/);
  // v5：停電與外島停駛同屬 tw_civil，只算 1 項次要；再加 1 項不同組還是只有 2 項
  assert.equal(theater(board([...reactive, entry('e', 'taiwan_strait', 'tw_chips')]), 'taiwan_strait').rawLevel, 1);
  assert.equal(theater(board([...reactive, entry('e', 'taiwan_strait', 'tw_chips'), entry('e2', 'taiwan_strait', 'tw_cyber')]), 'taiwan_strait').rawLevel, 2);
  const claim = entry('f', 'ukraine_front', 'ua_energy', true, { sources: src('PARTY_CLAIM') });
  assert.equal(theater(board([claim]), 'ukraine_front').rawLevel, 1);
  assert.equal(theater(board([claim, entry('g', 'ukraine_front', 'ua_front')]), 'ukraine_front').rawLevel, 2);
  assert.equal(theater(board([entry('h', 'ukraine_front', 'ua_energy')]), 'ukraine_front').rawLevel, 2, '官方或獨立來源的主要指標單獨即可');
});

test('entries expire after their validity window', () => {
  const old = entry('a', 'europe_security', 'eu_airspace', true, { observedAt: '2026-09-20T00:00:00Z' });
  assert.equal(theater(board([old]), 'europe_security').indicators.find(i => i.id === 'eu_airspace').status, 'UNKNOWN');
});

test('no downgrade within 48 hours; level 3 sustained 72 hours becomes 4', () => {
  const at = h => new Date(NOW - h * 3600_000).toISOString();
  const lower = [entry('a', 'europe_security', 'eu_airspace'), entry('b', 'europe_security', 'eu_response', false)];
  const held = theater(board(lower, { snapshots: [{ at: at(12), theater: 'europe_security', rawLevel: 3, level: 3, ruleVersion: 'iw-v5-trial' }] }), 'europe_security');
  assert.equal(held.rawLevel, 2);
  assert.equal(held.level, 3);
  const three = [entry('a', 'europe_security', 'eu_airspace'), entry('b', 'europe_security', 'eu_evac')];
  // 每小時一筆、連續 76 小時都是第 3 級 → 第 4 級
  const snaps = Array.from({ length: 76 }, (_, k) => ({ at: at(76 - k), theater: 'europe_security', rawLevel: 3, level: 3, ruleVersion: 'iw-v5-trial' }));
  assert.equal(theater(board(three, { snapshots: snaps }), 'europe_security').level, 4);
  // 機器人離線：75 小時前是第 1 級、之後沒有紀錄，剛恢復就是第 3 級 → 不能直接升到第 4 級
  const restart = [{ at: at(75), theater: 'europe_security', rawLevel: 1, level: 1, ruleVersion: 'iw-v5-trial' }, { at: at(0.5), theater: 'europe_security', rawLevel: 3, level: 3, ruleVersion: 'iw-v5-trial' }];
  assert.equal(theater(board(three, { snapshots: restart }), 'europe_security').level, 3);
  // 中間有超過 6 小時的空白不算持續；雲端排程延遲造成的 4 小時空白、或中間一筆「無法判定」則不中斷
  const gap = snaps.filter((s, k) => k < 30 || k > 40);
  assert.equal(theater(board(three, { snapshots: gap }), 'europe_security').level, 3);
  const shortGap = snaps.filter((s, k) => k < 30 || k > 33);
  assert.equal(theater(board(three, { snapshots: shortGap }), 'europe_security').level, 4);
  const withUnknown = snaps.map((s, k) => k === 50 ? { ...s, rawLevel: null, level: null } : s);
  assert.equal(theater(board(three, { snapshots: withUnknown }), 'europe_security').level, 4);
  // 「仍在上升」：起點時就已觸發同樣的指標、之後沒有新的主要指標 → 維持第 3 級
  const flat = snaps.map(s => ({ ...s, ind: ['eu_airspace', 'eu_evac'] }));
  const stuck = theater(board(three, { snapshots: flat }), 'europe_security');
  assert.equal(stuck.level, 3);
  assert.match(stuck.reason, /沒有新的主要指標/);
  // 規則改版：舊版本（v1）的第 3 級紀錄不再延續
  const old = theater(board(lower, { snapshots: [{ at: at(12), theater: 'europe_security', rawLevel: 3, level: 3, ruleVersion: 'iw-v1-trial' }] }), 'europe_security');
  assert.equal(old.level, 2);
});

test('Taiwan official P95 anomalies and MND joint-patrol wording become official triggers', () => {
  const taiwanFeed = { assessment: { status: 'ANOMALY_REVIEW', indicators: [
    { metric: 'aircraft', current: 45, unit: '架次', samples: 40, baselineWindowDays: 60, historicalP95: 30, status: 'ABOVE_HISTORICAL_P95', sourceUrl: 'https://www.mnd.gov.tw/news/plaact/1', periodEnd: '2026-09-29T22:00:00Z' },
    { metric: 'ships', current: 6, unit: '艘', samples: 40, baselineWindowDays: 60, historicalP95: 11, status: 'WITHIN_HISTORICAL_RANGE', sourceUrl: 'https://www.mnd.gov.tw/news/plaact/1', periodEnd: '2026-09-29T22:00:00Z' }] } };
  const mndDocs = [{ url: 'https://www.mnd.gov.tw/news/plaact/1', publishedAt: '2026-09-29T16:00:00Z', body: '共機配合共艦實施聯合戰備警巡', observation: { periodEnd: '2026-09-29T22:00:00Z' } }];
  const t = theater(board([], { taiwanFeed: { ...taiwanFeed, assessment: { ...taiwanFeed.assessment } }, mndDocs }), 'taiwan_strait');
  assert.equal(t.indicators.find(i => i.id === 'tw_aircraft').status, 'TRIGGERED');
  assert.equal(t.indicators.find(i => i.id === 'tw_ships').status, 'CLEAR');
  assert.equal(t.indicators.find(i => i.id === 'tw_joint_patrol').status, 'TRIGGERED');
  // 架次超標與聯合戰備警巡屬同一行動，合併計為 1 項主要指標 → 第 2 級
  assert.equal(t.level, 2);
  assert.match(t.reason, /合併計為 1 項/);
  const withShips = { assessment: { ...taiwanFeed.assessment, indicators: [taiwanFeed.assessment.indicators[0], { ...taiwanFeed.assessment.indicators[1], current: 14, status: 'ABOVE_HISTORICAL_P95' }] } };
  assert.equal(theater(board([], { taiwanFeed: withShips, mndDocs }), 'taiwan_strait').level, 3, '共艦也超標＝第 2 項獨立指標');
  const stale = theater(board([], { taiwanFeed: { assessment: { status: 'STALE_OBSERVATION', indicators: [] } } }), 'taiwan_strait');
  assert.equal(stale.level, null);
});

test('snapshots are recorded at most hourly unless the level changes', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'warn-')), 'h.json');
  const b = board([entry('a', 'europe_security', 'eu_airspace')]);
  assert.equal(recordWarningSnapshot(b, file), true);
  assert.equal(recordWarningSnapshot(b, file), false);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).snapshots.length, b.theaters.length);
});

test('Discord payload is marked as trial and fits the message limit', () => {
  const p = warningDiscordPayload(undefined, board([entry('a', 'europe_security', 'eu_airspace')]));
  assert.match(p.content, /試行中/);
  assert.ok(p.content.length <= 2000);
  assert.equal(board([]).pushEnabled, true); // 使用者要求 Discord 主動推播（試行標示保留）
});

test('the committed indicator ledger is fully valid', () => {
  const ledger = JSON.parse(fs.readFileSync(path.join(__dirname, '../research/warning_indicators.json'), 'utf8'));
  for (const e of ledger.entries) assert.equal(validEntry(e, Date.now()), true, e.id); // 研究任務會持續新增紀錄，用實際時間檢查
});

test('距離下一級：照規則說明差什麼', () => {
  const W = require('../src/warning_board');
  const i = (id, tier, status, extra = {}) => ({ id, name: `${id}（說明）`, tier, status, ...extra });
  const inds = [i('a', 'PRIMARY', 'TRIGGERED', { group: 'g' }), i('b', 'PRIMARY', 'TRIGGERED', { group: 'g' }), i('c', 'PRIMARY', 'CLEAR'), i('d', 'SECONDARY', 'TRIGGERED', { reactive: true })];
  assert.match(W.nextStep(2, inds), /目前 1 項/, '同一 group 只算一項');
  assert.match(W.nextStep(2, inds), /尚未觸發或缺資料的主要指標：c/);
  assert.doesNotMatch(W.nextStep(2, inds), /缺資料的主要指標：[^。]*a/);
  assert.match(W.nextStep(1, inds), /次要 0 項/, '反應性訊號不計入');
  assert.match(W.nextStep(3, inds, 40), /目前約 40 小時/);
  assert.equal(W.nextStep(4, inds), null);
  assert.match(W.nextStep(null, inds), /缺資料/);
});

test('下一個觀察點超過 14 天或舊格式不顯示；主要指標缺資料時原因要講明', () => {
  const W = require('../src/warning_board');
  const now = Date.parse('2026-11-05T00:00:00Z');
  const board = watch => W.buildWarningBoard({ now, ledger: { entries: [], watch }, history: { snapshots: [] } }).theaters.find(t => t.id === 'iran_gulf');
  assert.equal(board({ iran_gulf: '舊格式純文字' }).nextWatch, null);
  assert.equal(board({ iran_gulf: { text: '已過期', updatedAt: '2026-10-01T00:00:00Z' } }).nextWatch, null);
  assert.equal(board({ iran_gulf: { text: '調停會談', updatedAt: '2026-11-01T00:00:00Z' } }).nextWatch, '調停會談');
});

test('趨勢 v2：三日平均超過 P95 不再退讓；同 group 的主要與次要只算一次', () => {
  const { assessTrend, mndSeries } = require('../src/trend');
  const now = Date.parse('2026-11-05T00:00:00Z');
  const series = [];
  for (let i = 30; i >= 0; i--) series.push({ date: new Date(now - i * 864e5).toISOString().slice(0, 10), value: i < 3 ? 34 - i * 2 : 8 });
  const r = assessTrend(series, { label: '共機', unit: '架次', now });
  assert.equal(r.status, 'TRIGGERED');
  assert.match(r.summary, /已超過 P95/);
  const newestFirst = [{ url: 'new', observation: { periodEnd: '2026-11-04T00:00:00Z', aircraft: { value: 2 } } }, { url: 'old', observation: { periodEnd: '2026-08-13T00:00:00Z', aircraft: { value: 1 } } }];
  assert.equal(mndSeries(newestFirst, 'aircraft').at(-1).url, 'new', '最後一筆是最新通報');
  const W = require('../src/warning_board');
  const i = (id, tier, group) => ({ id, name: id, tier, status: 'TRIGGERED', group, sources: [{ sourceClass: 'OFFICIAL' }] });
  assert.match(W.nextStep(1, [i('a', 'PRIMARY', 'g'), i('b', 'SECONDARY', 'g')]), /次要 0 項/);
});
