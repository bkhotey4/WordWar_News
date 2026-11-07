// 前兆組合：72 小時內多項領先型指標接連觸發才成立，同一組合不重複推播
const test = require('node:test');
const assert = require('node:assert');
const { assessPrecursor, planPrecursor, precursorText } = require('../src/precursors');
const { planWarningPushes } = require('../src/warning_board');

const NOW = Date.parse('2026-10-26T06:00:00Z');
const H = 3600_000;
const ind = (id, triggered = true, group) => ({ id, name: `${id}（說明）`, group: group || id, status: triggered ? 'TRIGGERED' : 'CLEAR' });
const snap = (hoursAgo, ids, theater = 'taiwan_strait') => ({ at: new Date(NOW - hoursAgo * H).toISOString(), theater, ind: ids });

test('前兆組合：72 小時內 3 項（含實體軍事訊號）才成立，同 group 只算 1 項', () => {
  // 現在只有 1 項，但前兩天另有 2 項 → 成立
  const now1 = [ind('tw_nav_warning'), ind('tw_ships', false)];
  const p = assessPrecursor('taiwan_strait', now1, [snap(30, ['tw_ships']), snap(50, ['tw_party_tone']), snap(80, ['tw_coast_guard'])], NOW);
  assert.strictEqual(p.fired, true);
  assert.deepStrictEqual(p.ids, ['tw_nav_warning', 'tw_party_tone', 'tw_ships']); // 80 小時前的不算
  // 共機架次與越線屬同一行動，只算 1 項
  const air = [ind('tw_aircraft', true, 'tw_air'), ind('tw_crossing', true, 'tw_air'), ind('tw_party_tone')];
  assert.strictEqual(assessPrecursor('taiwan_strait', air, [], NOW).fired, false);
  // 只有言論與外交、沒有實體軍事訊號 → 不成立
  assert.strictEqual(assessPrecursor('taiwan_strait', [ind('tw_party_tone'), ind('tw_cn_measures'), ind('tw_diplomatic')], [], NOW).fired, false);
  // 反應性指標不在名單內
  assert.strictEqual(assessPrecursor('taiwan_strait', [ind('tw_ships'), ind('tw_market'), ind('tw_media_surge')], [], NOW).fired, false);
});

test('前兆推播：同一組合 72 小時內只推一次，有新指標加入才再推', () => {
  const p = { fired: true, ids: ['a', 'b', 'c'] };
  const first = planPrecursor('taiwan_strait', p, undefined, NOW);
  assert.deepStrictEqual(first.added, ['a', 'b', 'c']);
  const prev = { ids: first.ids, at: new Date(NOW).toISOString() };
  assert.strictEqual(planPrecursor('taiwan_strait', p, prev, NOW + 3 * H), null);
  assert.deepStrictEqual(planPrecursor('taiwan_strait', { fired: true, ids: ['a', 'b', 'c', 'd'] }, prev, NOW + 3 * H).added, ['d']);
  assert.ok(planPrecursor('taiwan_strait', p, prev, NOW + 73 * H)); // 超過 72 小時重新計算
  assert.strictEqual(planPrecursor('taiwan_strait', { fired: false, ids: [] }, undefined, NOW), null);
});

test('前兆推播接上看板推播流程，訊息標明不是開戰預測', () => {
  const precursor = assessPrecursor('taiwan_strait', [ind('tw_nav_warning'), ind('tw_ships'), ind('tw_party_tone')], [], NOW);
  const t = { id: 'taiwan_strait', name: '台海', level: 1, levelName: '常態', triggered: [], deescalation: [], unknown: [], trend: 'FLAT', reason: '', precursor };
  const board = { generatedAt: new Date(NOW).toISOString(), theaters: [t] };
  const { pushes, next } = planWarningPushes(board, { theaters: { taiwan_strait: { level: 1 } }, lastDigestDate: '2026-10-26' });
  const pp = pushes.find(p => p.kind === 'PRECURSOR');
  assert.ok(pp);
  assert.deepStrictEqual(next.precursors.taiwan_strait.ids, precursor.ids);
  assert.strictEqual(planWarningPushes(board, next).pushes.filter(p => p.kind === 'PRECURSOR').length, 0);
  const text = precursorText(t, pp);
  assert.match(text, /前兆組合｜台海/);
  assert.match(text, /不是開戰預測/);
});

// ── 趨勢預警 ──
const { assessTrend, mndSeries } = require('../src/trend');
const TNOW = Date.parse('2026-10-26T12:00:00Z');
const series = vals => vals.map((value, i) => ({ date: new Date(TNOW - (vals.length - 1 - i) * 86_400_000).toISOString().slice(0, 10), value }));

test('趨勢預警：近 3 天明顯爬升才觸發，超過 P95 也不退讓', () => {
  const base = Array.from({ length: 40 }, (_, i) => [5, 8, 12, 6, 10, 20, 7, 9][i % 8]);
  assert.strictEqual(assessTrend(series([...base, 6, 7, 6, 7, 6, 7, 6, 13, 14, 15]), { label: '共機', unit: '架次', now: TNOW }).status, 'TRIGGERED');
  // 其中一天掉回去 → 不算連日爬升
  assert.strictEqual(assessTrend(series([...base, 6, 7, 6, 7, 6, 7, 6, 13, 5, 15]), { label: '共機', unit: '架次', now: TNOW }).status, 'CLEAR');
  // 已超過 P95 → 不退讓（trend-v2）：P95 指標只看單日，退讓會兩邊都不觸發
  assert.strictEqual(assessTrend(series([...base, 6, 7, 6, 7, 6, 7, 6, 40, 45, 50]), { label: '共機', unit: '架次', now: TNOW }).status, 'TRIGGERED');
  // 歷史不足 20 天、或資料過舊 → 不判定
  assert.strictEqual(assessTrend(series([1, 2, 3, 9, 10, 11]), { label: '共機', unit: '架次', now: TNOW }), null);
  assert.strictEqual(assessTrend(series([...base, 13, 14, 15]), { label: '共機', unit: '架次', now: TNOW + 5 * 86_400_000 }), null);
});

test('國防部通報轉成台北日期的每日序列', () => {
  const s = mndSeries([{ url: 'u', observation: { periodEnd: '2026-10-25T22:00:00.000Z', aircraft: { value: 9 } } }, { observation: {} }], 'aircraft');
  assert.deepStrictEqual(s, [{ date: '2026-10-26', value: 9, url: 'u', at: '2026-10-25T22:00:00.000Z' }]);
});

test('週報預警回顧：只算現行規則的等級，列出前兆天數與天天亮的指標', () => {
  const { warningReview } = require('../src/weekly');
  const { RULE_VERSION } = require('../src/warning_board');
  const now = Date.parse('2026-11-01T12:00:00Z');
  const day = k => new Date(now - k * 86_400_000).toISOString();
  const tpe = k => new Date(now - k * 86_400_000 + 8 * 3600_000).toISOString().slice(0, 10);
  const history = { snapshots: [
    ...[0, 1, 2].map(k => ({ at: day(k), theater: 'taiwan_strait', level: k === 0 ? 2 : 1, ruleVersion: RULE_VERSION })),
    { at: day(3), theater: 'taiwan_strait', level: 3, ruleVersion: 'iw-v3-trial' } // 舊規則不算
  ] };
  const daily = { days: Object.fromEntries([0, 1, 2, 3, 4, 5].map(k => [tpe(k), { taiwan_strait: ['tw_market', ...(k === 0 ? ['precursor'] : [])] }])) };
  const text = warningReview(now, { history, daily });
  assert.match(text, /台海：1\/3 天｜前兆 1 天｜天天亮：台股、台積電或新台幣單日異常下跌/);
  assert.match(text, /南海：尚無紀錄｜前兆 0 天/);
});

test('推播門檻：重要略過一般警報、緊急只收第 3 級以上與前兆組合', () => {
  const os = require('os'), fs = require('fs'), path = require('path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ww-prefs-')), 'prefs.json');
  process.env.WORDWAR_PREFS_FILE = file;
  delete require.cache[require.resolve('../src/subscription_manager')];
  const M = require('../src/subscription_manager');
  assert.deepStrictEqual(M.parseSubscriptionCommand('推播門檻 緊急'), { action: 'SET_MODE', mode: 'critical' });
  const ok = (mode, alert) => { M.setUserPrefs('u1', { alertMode: mode, suppressedEventIds: [] }); return M.shouldDeliverToUser('u1', { theater: 'taiwan_strait', eventId: `e${Math.random()}`, ...alert }).deliver; };
  const warn = { level: 'WARNING', code: 'WARNING_BOARD' }, pre = { level: 'WARNING', code: 'PRECURSOR' }, crit = { level: 'CRITICAL', code: 'WARNING_BOARD' }, report = { level: 'REPORT' };
  assert.deepStrictEqual([warn, pre, crit, report].map(a => ok('all', a)), [true, true, true, true]);
  assert.deepStrictEqual([warn, pre, crit, report].map(a => ok('important', a)), [false, true, true, true]);
  assert.deepStrictEqual([warn, pre, crit, report].map(a => ok('critical', a)), [false, true, true, false]);
  assert.match(M.formatUserPrefs('u1'), /推播門檻\*\*: 緊急/);
  delete process.env.WORDWAR_PREFS_FILE;
  delete require.cache[require.resolve('../src/subscription_manager')];
});

test('預警推播只送重點與網站連結，不附圖', () => {
  const { pushPayload } = require('../src/warning_board');
  const t = { id: 'taiwan_strait', name: '台海', level: 3, levelName: '高度警戒', reason: '2 項獨立主要指標觸發', triggered: [{ name: '共艦數超過 60 日 P95' }, { name: '聯合戰備警巡（國防部原文）' }],
    precursor: { fired: true, count: 3, windowHours: 72, items: [{ id: 'tw_ships', name: '共艦數', firstAt: '2026-10-26T00:00:00Z' }] } };
  const board = { generatedAt: '2026-10-26T06:00:00Z', theaters: [t] };
  for (const push of [{ kind: 'CHANGE', theater: 'taiwan_strait', from: 1, to: 3 }, { kind: 'DIGEST' }, { kind: 'PRECURSOR', theater: 'taiwan_strait', added: ['tw_ships'] }]) {
    const p = pushPayload(push, board);
    assert.match(p.content, /bkhotey4\.github\.io\/wordwar-intel/, push.kind);
    assert.deepStrictEqual(p.files, []);
    assert.ok(p.content.length < 700, `${push.kind} ${p.content.length}`);
  }
  assert.match(pushPayload({ kind: 'CHANGE', theater: 'taiwan_strait', from: 1, to: 3 }, board).content, /第 1 級 → 第 3 級 高度警戒\n判定：2 項獨立主要指標觸發\n• 共艦數超過 60 日 P95\n• 聯合戰備警巡/);
});

// ── 2026-10-27 審查修正 ──
test('已收過原訊息的更正不受推播門檻與戰區篩選擋下，安靜時段才延後', () => {
  const os = require('os'), fs = require('fs'), path = require('path');
  process.env.WORDWAR_PREFS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ww-prefs-')), 'prefs.json');
  delete require.cache[require.resolve('../src/subscription_manager')];
  const M = require('../src/subscription_manager');
  M.setUserPrefs('u2', { alertMode: 'critical', theaters: ['ukraine_front'], suppressedEventIds: [] });
  const corr = { theater: 'taiwan_strait', level: 'REPORT', eventId: 'report:x', isCorrection: true };
  assert.strictEqual(M.shouldDeliverToUser('u2', corr).deliver, false, '沒收過原稿：照一般規則');
  const d = M.shouldDeliverToUser('u2', { ...corr, priorDelivered: true });
  assert.strictEqual(d.deliver, true); assert.match(d.badge, /更正/);
  M.setUserPrefs('u2', { quietHoursStart: '00:00', quietHoursEnd: '23:59' });
  if (M.isInQuietHours('u2')) assert.match(M.shouldDeliverToUser('u2', { ...corr, priorDelivered: true }).reason, /靜默/);
  M.setUserPrefs('u2', { receiveCorrections: false, quietHoursStart: null, quietHoursEnd: null });
  assert.strictEqual(M.shouldDeliverToUser('u2', { ...corr, priorDelivered: true }).deliver, false, '關閉更正通知就不送');
  delete process.env.WORDWAR_PREFS_FILE;
  delete require.cache[require.resolve('../src/subscription_manager')];
});

test('延後送出的預警用判定當下的內容，並註明判定時間與目前等級', () => {
  const { deferredContent } = require('../src/warning_board');
  const board = { generatedAt: '2026-10-26T10:00:00Z', theaters: [{ id: 'taiwan_strait', name: '台海', level: 1, triggered: [], reason: '新原因' }] };
  const p = { kind: 'CHANGE', theater: 'taiwan_strait', from: 1, to: 2, content: '判定：舊原因', createdAt: '2026-10-26T06:00:00Z' };
  assert.strictEqual(deferredContent(p, board, Date.parse('2026-10-26T06:10:00Z')), '判定：舊原因');
  const late = deferredContent(p, board, Date.parse('2026-10-26T10:00:00Z'));
  assert.match(late, /台北時間 10-26 14:00 判定，延後送出（此戰區目前是第 1 級）/);
  assert.match(late, /舊原因/); assert.doesNotMatch(late, /新原因/);
});

test('網站加開：同一篇報導改版也算，升級前沒有雜湊的舊狀態不誤判', () => {
  const { eventReason } = require('../src/public_site_scheduler');
  const levels = { taiwan_strait: 1 };
  assert.strictEqual(eventReason({ levels, reports: ['a@111', 'b@222'] }, { levels, reports: ['a@111', 'b@222'] }), null);
  assert.strictEqual(eventReason({ levels, reports: ['a@111', 'b@222'] }, { levels, reports: ['a@111', 'b@333'] }), '報導改版 1 篇');
  assert.strictEqual(eventReason({ levels, reports: ['a@111'] }, { levels, reports: ['a@111', 'c@444'] }), '新報導 1 篇');
  assert.strictEqual(eventReason({ levels, reports: ['a', 'b'] }, { levels, reports: ['a@111', 'b@222'] }), null);
});

// ── 2026-10-27 第二次檢查修正 ──
test('第 4 級（第 3 級持續 72 小時）也適用 48 小時不降級；主要指標要過半有資料才給等級', () => {
  const { buildWarningBoard } = require('../src/warning_board');
  const W = require('../src/warning_board');
  const now = Date.parse('2026-10-26T12:00:00Z');
  const snaps = [];
  for (let h = 80; h >= 1; h--) snaps.push({ at: new Date(now - h * H).toISOString(), theater: 'europe_security', rawLevel: 3, level: h <= 8 ? 4 : 3, ruleVersion: W.RULE_VERSION });
  const src = [{ url: 'https://example.gov/a', publisher: '官方', sourceClass: 'OFFICIAL', publishedAt: '2026-10-26T00:00:00Z' }];
  const e = (id, ind, triggered) => ({ id, theater: 'europe_security', indicator: ind, triggered, observedAt: '2026-10-26T06:00:00Z', summary: 't', sources: src, reviewed: true });
  // 原始等級降到 2（一項主要＋官方來源），48 小時內曾顯示第 4 級 → 仍是第 4 級
  const t = buildWarningBoard({ now, ledger: { entries: [e('a', 'eu_airspace', true), e('b', 'eu_response', false), e('c', 'eu_evac', false)] }, history: { snapshots: snaps } }).theaters.find(x => x.id === 'europe_security');
  assert.strictEqual(t.rawLevel, 2); assert.strictEqual(t.level, 4);
  // 只有 1/3 項主要指標有資料、沒有觸發 → 無法判定
  const thin = buildWarningBoard({ now, ledger: { entries: [e('d', 'eu_response', false)] }, history: { snapshots: [] } }).theaters.find(x => x.id === 'europe_security');
  assert.strictEqual(thin.level, null); assert.match(thin.reason, /1\/3 項有資料/);
});

test('訂閱設定合併：雲端送出的去重清單是最新的，截斷時保留雲端', () => {
  const { mergePrefs } = require('./cloud_state');
  const ids = (a, b) => Array.from({ length: b - a }, (_, i) => `e${a + i}`);
  const local = JSON.stringify({ users: { u: { alertMode: 'critical', suppressedEventIds: ids(0, 50) } } });
  const cloud = JSON.stringify({ users: { u: { alertMode: 'all', suppressedEventIds: ids(20, 70) } } });
  const m = JSON.parse(mergePrefs(local, cloud)).users.u;
  assert.strictEqual(m.alertMode, 'critical');
  assert.deepStrictEqual(m.suppressedEventIds, ids(20, 70));
});

test('「重要」門檻略過一般哨兵警示（ELEVATED）與觀察，保留報導與定時簡報', () => {
  const { ALERT_MODES } = require('../src/subscription_manager');
  const ok = level => ALERT_MODES.important.allows({ level });
  assert.deepStrictEqual(['CRITICAL', 'REPORT', 'ROUTINE', 'WARNING', 'ELEVATED', 'OBSERVATION_ONLY'].map(ok), [true, true, true, false, false, false]);
});

test('IODA 斷網資料過期時無法判定，不沿用舊的斷網，也不說沒有斷網', () => {
  const { assessInfra } = require('../src/collectors/taiwan_infra');
  const now = Date.parse('2026-10-26T12:00:00Z');
  const base = { lastSuccess: new Date(now).toISOString(), events: [], internet: [{ label: '金門斷網', since: '2026-10-20T00:00:00Z' }] };
  assert.strictEqual(assessInfra({ ...base, iodaSuccess: new Date(now - 5 * H).toISOString() }, now).net, null);
  assert.strictEqual(assessInfra({ ...base, iodaSuccess: new Date(now - 5 * H).toISOString() }, now).iodaFresh, false);
  assert.strictEqual(assessInfra({ ...base, iodaSuccess: new Date(now).toISOString() }, now).net.label, '金門斷網');
});

test('回測：沒有紀錄的日子不計分，事件前一週全無紀錄算無資料而非漏報', () => {
  const { backtestIndicator } = require('../src/warning_backtest');
  const d = s => Date.parse(`${s}T15:59:59Z`);
  const recorded = new Set(['2026-10-01', '2026-10-02', '2026-10-20', '2026-10-21']);
  const ind = { id: 'x', name: 'x', theater: 'taiwan_strait', coverageStart: d('2026-10-01'), coverageEnd: d('2026-10-21'), triggered: () => false, hasData: t => recorded.has(new Date(t + 8 * 3600_000).toISOString().slice(0, 10)) };
  const r = backtestIndicator(ind, [{ id: 'e', name: 'e', theater: 'taiwan_strait', start: '2026-10-15' }], d('2026-10-22'));
  assert.strictEqual(r.coverage.days, 4);
  assert.strictEqual(r.events[0].outcome, 'NO_DATA');
});

test('多查詢來源：某個查詢超過 12 小時沒成功時，沒有命中改為無法判定', async () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const nato = require('../src/collectors/nato_flank');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qh-')), 'nato.json');
  const rss = '<rss><channel></channel></rss>';
  const fake = bad => async url => (bad && /%E6%B3%A2|波蘭/.test(decodeURIComponent(url)) ? { ok: false, status: 503, text: async () => '' } : { ok: true, text: async () => rss });
  const t0 = Date.parse('2026-10-26T00:00:00Z');
  await nato.refreshNatoFlank({ force: true, file, fetchImpl: fake(false), now: t0 });
  let c = await nato.refreshNatoFlank({ force: true, file, fetchImpl: fake(true), now: t0 + 6 * H });
  assert.strictEqual(nato.assessNato(c, 'AIRSPACE', t0 + 6 * H).status, 'CLEAR', '中文查詢 6 小時前還成功過');
  c = await nato.refreshNatoFlank({ force: true, file, fetchImpl: fake(true), now: t0 + 13 * H });
  assert.ok(c.lastSuccess, '過半查詢成功，整體仍算成功');
  const r = nato.assessNato(c, 'AIRSPACE', t0 + 13 * H);
  assert.strictEqual(r.status, 'UNKNOWN');
  assert.match(r.summary, /1\/3 個查詢超過 12 小時/);
  // 舊快取沒有 queryOk：最近一輪沒有失敗就照常
  const { guardClear } = require('../src/collectors/query_health');
  assert.strictEqual(guardClear({ status: 'CLEAR', summary: 'x' }, { errors: [] }, ['a'], t0).status, 'CLEAR');
  assert.strictEqual(guardClear({ status: 'TRIGGERED' }, { queryOk: {} }, ['a'], t0).status, 'TRIGGERED', '有命中不受影響');
});

test('哨兵：新聞標題整批處理，待查標題全部帶回，不再每輪只看第一則', () => {
  const { evaluateThreats } = require('../src/sentry');
  const now = new Date().toISOString();
  const tag = Date.now().toString(36);
  const news = [1, 2, 3].map(i => ({ id: `t-${tag}-${i}`, link: `https://example.com/${tag}/${i}`, title: `Test ${tag} drone incursion romania item ${i}`, source: '測試', publishedAt: now }));
  const r = evaluateThreats({ latestBreakingNews: news }, null, { persistQuarantine: false });
  assert.strictEqual(r.code, 'NEWS_HEADLINE_REVIEW');
  assert.strictEqual(1 + r.additionalReviews.length, 3);
});

test('影像判讀標明是誰判讀：沒標 HUMAN 的一律寫排程 AI、未經人工覆核', () => {
  const { panelHtml, checkReview } = require('./site_imint');
  const esc = s => String(s);
  const review = { region: 'longtian', beforeProductId: 'S2A_MSIL2A_20261001_0_L2A', afterProductId: 'S2B_MSIL2A_20261010_0_L2A', visible: '跑道與停機坪清楚可見，無雲遮', change: '停機坪新增鋪面', assessment: '可能為設施擴建，無法判定用途', limitations: '解析度 10 公尺，無法辨識機型', confidence: '低', reviewedAt: '2026-10-26T00:00:00Z' };
  const p = { available: true, region: 'longtian', name: '龍田', focus: 'x', gapDays: 9, before: { img: 'a', acquiredAt: '2026-10-01' }, after: { img: 'b', acquiredAt: '2026-10-10' }, review };
  assert.match(panelHtml(p, { esc }), /排程 AI 判讀，未經人工覆核｜10\/26 08:00/);
  assert.match(panelHtml({ ...p, review: { ...review, reviewer: 'HUMAN' } }, { esc }), /人工判讀/);
  assert.ok(checkReview({ ...review, reviewer: 'robot' }).some(e => /reviewer/.test(e)));
});

test('來源健康：最近一輪全部失敗時，時限過半就通知；時限內部分失敗顯示黃燈', () => {
  const { planSourceAlerts, sourceStatusText } = require('../src/source_health');
  const now = Date.parse('2026-10-26T12:00:00Z');
  const row = (status, hoursAgo) => ({ name: 'A', status, lastSuccess: new Date(now - hoursAgo * H).toISOString(), limitHours: 6 });
  assert.strictEqual(planSourceAlerts([row('OFFLINE', 4)], {}, now).down.length, 1);
  assert.strictEqual(planSourceAlerts([row('DEGRADED', 4)], {}, now).down.length, 0);
  assert.match(sourceStatusText([row('DEGRADED', 1)], now), /🟡.*最近一輪部分失敗/);
});

test('event history keeps the first time this site saw an event; clocks list each time separately', async () => {
  const { refreshRegional: collect } = require('../src/collectors/regional');
  const fs = require('fs'), os = require('os'), path = require('path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'seen-')), 'r.json');
  const item = (pub, link) => `<item><title>North Korea fires ballistic missile into sea - ${pub}</title><link>${link}</link><pubDate>Fri, 30 Oct 2026 01:00:00 GMT</pubDate><source>${pub}</source></item>`;
  const rss = `<rss><channel>${item('Yonhap', 'https://a.example/1')}${item('Reuters', 'https://b.example/2')}</channel></rss>`;
  const fetchImpl = async () => ({ ok: true, text: async () => rss });
  const t1 = Date.parse('2026-10-30T02:00:00Z'), t2 = Date.parse('2026-10-30T05:00:00Z');
  await collect({ force: true, file, fetchImpl, now: t1 });
  const out = await collect({ force: true, file, fetchImpl, now: t2 });
  const h = out.history.find(e => e.type === 'DPRK_MISSILE');
  assert.equal(h.seenAt, new Date(t1).toISOString(), '第二輪不能覆蓋第一次收錄時間');
  const TL = require('./site_timeline');
  const tpe = ms => new Date(ms + 8 * 3600_000).toISOString().replace('T', ' ').slice(0, 16);
  const c = TL.clocks({ kind: 'MIL', at: h.firstSeen, seenAt: h.seenAt }, { tpe, siteAt: t2 }).map(([k, v]) => `${k} ${v}`);
  assert.deepEqual(c, ['首則報導 10-30 09:00', '本站收錄 10-30 10:00', '網站更新 10-30 13:00']);
  assert.match(TL.clocks({ kind: 'MIL', at: h.firstSeen }, { tpe }).map(x => x.join(' ')).join(), /本站收錄 未記錄/, '舊紀錄不拿其他時間代替');
});

test('since-last-visit data keeps only recent events with safe links, newest first', () => {
  const { sinceItems, sinceSection } = require('./site_since');
  const now = Date.parse('2026-10-31T00:00:00Z');
  const kinds = { MIL: { icon: '🛩️', label: '軍事行動' } };
  const tpe = ms => new Date(ms + 8 * 3600_000).toISOString().replace('T', ' ').slice(0, 16);
  const clocks = () => [];
  const ev = [
    { kind: 'MIL', theater: 'taiwan_strait', title: '舊', at: '2026-10-20T00:00:00Z' },
    { kind: 'MIL', theater: 'taiwan_strait', title: '新', at: '2026-10-30T00:00:00Z', seenAt: '2026-10-30T03:00:00Z', href: 'javascript:alert(1)' },
    { kind: 'MIL', theater: 'taiwan_strait', title: '更新', at: '2026-10-30T06:00:00Z', href: 'https://example.org/x' }];
  const items = sinceItems(ev, { names: { taiwan_strait: '台海' }, kinds, tpe, now, clocks });
  assert.deepEqual(items.map(i => i.t), ['更新', '新']);
  assert.equal(items[1].h, null, '不安全的連結不放');
  assert.equal(items[1].s, Date.parse('2026-10-30T03:00:00Z'), '以本站收錄時間判斷是否為新事件');
  const html = sinceSection([{ ...ev[2], title: '</script><b>x' }], { esc: s => s, names: {}, kinds, tpe, now, clocks });
  assert.ok(!html.includes('</script><b>'), '標題不能提早結束 script');
});

test('human verification: batches go out weekly in daytime, only the admin\'s single reaction counts, results hidden until enough samples', async () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const HV = require('../src/human_verification');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hv-')), 'h.json');
  const now = Date.parse('2026-11-01T03:00:00Z'); // 台北 11:00
  const ev = (i, theater, kind = 'MIL') => ({ kind, theater, title: `事件${i}`, href: `https://example.org/${i}`, at: new Date(now - i * 3600_000).toISOString(), pubs: 2 + (i % 3) });
  const events = [ev(1, 'taiwan_strait'), ev(2, 'taiwan_strait'), ev(3, 'iran_gulf'), ev(4, 'ukraine_front', 'REPORT'), ev(5, 'iran_gulf', 'DEESC'), { ...ev(6, 'taiwan_strait'), href: 'archive.html#x' }];
  const picked = HV.pickCandidates(events, { items: [] }, { now });
  assert.deepEqual(picked.map(e => e.title).sort(), ['事件1', '事件2', '事件3'], '報導、降溫、非原文連結不挑');
  assert.equal(picked[1].theater !== picked[0].theater, true, '輪流挑各戰區');
  const digest = HV.pickCandidates([{ ...ev(7, 'middle_east'), title: 'Today’s Headlines: Gaza | Election Day | Jordan Strikes Syria' }, { ...ev(8, 'iran_gulf'), title: 'World News in Brief: IAEA calls for inspections' }], { items: [] }, { now });
  assert.equal(digest.length, 0, '新聞摘要標題不挑');
  assert.equal(HV.batchDue({ batches: [] }, Date.parse('2026-11-01T15:00:00Z')), false, '台北 23:00 不發');
  // 假 Discord：管理者在第 1 則按 ✅，第 2 則同時按 ✅❌（不算），第 3 則別人按 ❌
  const ADMIN = '42', sentMsgs = [];
  const reactions = { m1: { '✅': [ADMIN] }, m2: { '✅': [ADMIN], '❌': [ADMIN] }, m3: { '❌': ['7'] } };
  const client = {
    users: { fetch: async () => ({ send: async () => { const id = `m${sentMsgs.length}`; sentMsgs.push(id); return { id, channelId: 'c', react: async () => {} }; } }) },
    rest: { get: async route => { const [, , , , msg, , emo] = route.split('/'); return (reactions[msg]?.[decodeURIComponent(emo)] || []).map(id => ({ id })); } }
  };
  const r = await HV.dispatchVerification(client, ADMIN, { events, names: {}, file, now });
  assert.equal(r.sent, 3);
  const st = HV.load(file);
  assert.deepEqual(st.items.map(i => i.status), ['YES', 'PENDING', 'PENDING']);
  assert.equal(st.items[0].reviewer, 'HUMAN');
  const again = await HV.dispatchVerification(client, ADMIN, { events, names: {}, file, now: now + 600_000 });
  assert.equal(again.sent, 0, '一週內不再發新批次');
  const hb = HV.humanBacktest({ now, state: HV.load(file), indicators: [] });
  assert.equal(hb.enough, false);
  assert.equal(hb.progress.yes, 1);
  assert.deepEqual(hb.indicators, [], '樣本不足不給命中率');
});

test('review fixes: stale PLA queries, "program" ≠ ram, temp files never synced, empty fusion is not "low", sync temp names', () => {
  const HOUR = 3600_000, now = Date.parse('2026-10-31T00:00:00Z');
  // 聯合戰備警巡：有查詢超過 12 小時沒成功，「沒有命中」改為無法判定
  const pla = require('../src/collectors/pla_joint');
  const old = new Date(now - 20 * HOUR).toISOString(), fresh = new Date(now).toISOString();
  const cache = { events: [], lastSuccess: fresh, lastAttempt: fresh, queryOk: Object.fromEntries(pla.QUERIES.map((q, i) => [q, i ? fresh : old])) };
  assert.strictEqual(require('../src/warning_board').autoPla('JOINT_PATROL', cache, now).status, 'UNKNOWN');
  assert.strictEqual(require('../src/warning_board').autoPla('JOINT_PATROL', { ...cache, queryOk: Object.fromEntries(pla.QUERIES.map(q => [q, fresh])) }, now).status, 'CLEAR');
  // "program" 不能被當成 ram（衝撞）
  assert.deepStrictEqual(require('../src/collectors/ally_statements').classify('U.S., Philippines Expand Training Program in South China Sea Amid China Tensions'), ['SCS_MENTION']);
  assert.notStrictEqual(require('../src/collectors/regional').classify('China, Philippines code of conduct program in South China Sea')?.type, 'SCS_CLASH');
  assert.strictEqual(require('../src/collectors/regional').classify('Chinese coast guard rams Philippine ship near Second Thomas Shoal')?.type, 'SCS_CLASH');
  // 同步暫存檔與比對圖不上傳
  const cs = require('./cloud_state');
  assert.strictEqual(cs.isState('research/intelligence.sqlite.12345.sync'), false);
  assert.strictEqual(cs.isState('research/compare_cache/x.png'), false);
  assert.strictEqual(cs.isState('research/reports.json'), true);
});

test('燈號變化紀錄：升降級附當時觸發的指標，指標中斷不到 6 小時不算解除，改版另列', () => {
  const H = require('./site_level_history');
  const at = h => new Date(Date.parse('2026-11-01T00:00:00Z') + h * 3600_000).toISOString();
  const snaps = [
    { at: at(0), theater: 'x', level: 1, ruleVersion: 'v1', ind: [] },
    { at: at(1), theater: 'x', level: 2, ruleVersion: 'v1', ind: ['a'] },
    { at: at(3), theater: 'x', level: 2, ruleVersion: 'v1', ind: [] },        // a 中斷 2 小時
    { at: at(4), theater: 'x', level: 2, ruleVersion: 'v1', ind: ['a'] },
    { at: at(20), theater: 'x', level: 1, ruleVersion: 'v2', ind: [] },       // a 超過 6 小時沒出現 → 解除；改版
    { at: at(21), theater: 'y', level: 4, ruleVersion: 'v2', ind: ['z'] }
  ];
  const ev = H.levelTimeline(snaps, 'x', { now: Date.parse(at(22)) });
  assert.deepEqual(ev.map(e => e.type), ['LEVEL', 'RULE', 'OFF', 'LEVEL', 'ON']);
  assert.deepEqual([ev[3].from, ev[3].to, ev[3].ids], [1, 2, ['a']]);
  assert.equal(ev[2].at, at(4), '解除時間取最後一次出現');
  assert.equal(ev.filter(e => e.type === 'ON').length, 1, '中斷 2 小時不重複記觸發');
  const html = H.historyHtml(ev, { esc: s => s, names: { a: '指標甲' } });
  assert.match(html, /▲ 升到 2 級/); assert.match(html, /當時觸發：指標甲/); assert.match(html, /判定規則改版/);
  assert.equal(H.levelTimeline(snaps, 'x', { now: Date.parse(at(22)) + 40 * 86400_000 }).length, 0, '超過 30 天不列');
});
