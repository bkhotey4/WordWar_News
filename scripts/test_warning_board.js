const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildWarningBoard, recordWarningSnapshot, warningDiscordPayload, validEntry } = require('../src/warning_board');

const NOW = Date.parse('2026-09-30T00:00:00Z');
const src = (cls = 'INDEPENDENT_MEDIA') => [{ url: 'https://example.org/a', publisher: 'Example', sourceClass: cls, publishedAt: '2026-09-29T00:00:00Z' }];
const entry = (id, theater, indicator, triggered = true, extra = {}) => ({ id, theater, indicator, triggered, observedAt: '2026-09-29T00:00:00Z', summary: '測試', sources: src(), reviewed: true, ...extra });
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
  const t = theater(board([entry('a', 'iran_gulf', 'ir_us_strikes', false), entry('b', 'iran_gulf', 'ir_shipping', false)]), 'iran_gulf');
  assert.equal(t.level, 1);
});

test('two primary triggers need an official or independent source for level 3', () => {
  const e = [entry('a', 'europe_security', 'eu_airspace'), entry('b', 'europe_security', 'eu_response')];
  assert.equal(theater(board(e), 'europe_security').level, 3);
  const claims = e.map(x => ({ ...x, sources: src('PARTY_CLAIM') }));
  assert.equal(theater(board(claims), 'europe_security').level, 2);
});

test('two secondary triggers raise to level 2; decisive gives level 4; de-escalation does not count', () => {
  assert.equal(theater(board([entry('a', 'iran_gulf', 'ir_blockade'), entry('b', 'iran_gulf', 'ir_oil'), entry('c', 'iran_gulf', 'ir_us_strikes', false)]), 'iran_gulf').level, 2);
  assert.equal(theater(board([entry('a', 'iran_gulf', 'ir_decisive')]), 'iran_gulf').level, 4);
  const t = theater(board([entry('a', 'iran_gulf', 'ir_talks'), entry('b', 'iran_gulf', 'ir_us_strikes', false)]), 'iran_gulf');
  assert.equal(t.level, 1);
  assert.equal(t.deescalation.length, 1);
});

test('entries expire after their validity window', () => {
  const old = entry('a', 'europe_security', 'eu_airspace', true, { observedAt: '2026-09-20T00:00:00Z' });
  assert.equal(theater(board([old]), 'europe_security').indicators.find(i => i.id === 'eu_airspace').status, 'UNKNOWN');
});

test('no downgrade within 48 hours; level 3 sustained 72 hours becomes 4', () => {
  const at = h => new Date(NOW - h * 3600_000).toISOString();
  const lower = [entry('a', 'europe_security', 'eu_airspace'), entry('b', 'europe_security', 'eu_response', false)];
  const held = theater(board(lower, { snapshots: [{ at: at(12), theater: 'europe_security', rawLevel: 3, level: 3, ruleVersion: 'iw-v2-trial' }] }), 'europe_security');
  assert.equal(held.rawLevel, 2);
  assert.equal(held.level, 3);
  const three = [entry('a', 'europe_security', 'eu_airspace'), entry('b', 'europe_security', 'eu_response')];
  // 每小時一筆、連續 76 小時都是第 3 級 → 第 4 級
  const snaps = Array.from({ length: 76 }, (_, k) => ({ at: at(76 - k), theater: 'europe_security', rawLevel: 3, level: 3, ruleVersion: 'iw-v2-trial' }));
  assert.equal(theater(board(three, { snapshots: snaps }), 'europe_security').level, 4);
  // 機器人離線：75 小時前是第 1 級、之後沒有紀錄，剛恢復就是第 3 級 → 不能直接升到第 4 級
  const restart = [{ at: at(75), theater: 'europe_security', rawLevel: 1, level: 1, ruleVersion: 'iw-v2-trial' }, { at: at(0.5), theater: 'europe_security', rawLevel: 3, level: 3, ruleVersion: 'iw-v2-trial' }];
  assert.equal(theater(board(three, { snapshots: restart }), 'europe_security').level, 3);
  // 中間有超過 2 小時的空白也不算持續
  const gap = snaps.filter((s, k) => k < 30 || k > 40);
  assert.equal(theater(board(three, { snapshots: gap }), 'europe_security').level, 3);
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
