const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sh = require('../src/source_health');
const H = 3600_000, now = Date.parse('2026-09-30T00:00:00Z');
const row = (name, hoursAgo, limitHours = 12) => ({ name, lastSuccess: hoursAgo === null ? null : new Date(now - hoursAgo * H).toISOString(), status: 'X', detail: null, limitHours });

test('sources alert once when they go stale and once when they recover', () => {
  const a = sh.planSourceAlerts([row('A', 1), row('B', 13), row('C', null)], {}, now);
  assert.deepEqual(a.down.map(d => d.name), ['B', 'C']);
  assert.equal(a.recovered.length, 0);
  const b = sh.planSourceAlerts([row('A', 1), row('B', 14), row('C', null)], a.next, now + H);
  assert.equal(b.down.length, 0, 'no repeated alert while still down');
  assert.equal(b.next.B.since, a.next.B.since);
  const c = sh.planSourceAlerts([row('A', 1), row('B', 0.5), row('C', null)], b.next, now + 2 * H);
  assert.deepEqual(c.recovered.map(r => r.name), ['B']);
  assert.equal(sh.planSourceAlerts([row('S', 20, 36)], {}, now).down.length, 0, 'per-source limits');
});

test('dispatch DMs the admin and keeps state unchanged when Discord fails', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sh-')), 's.json');
  const failing = { users: { fetch: async () => { throw new Error('offline'); } } };
  await assert.rejects(sh.dispatchSourceAlerts(failing, 'admin', { file, now, rows: [row('B', 13)] }));
  assert.equal(fs.existsSync(file), false);
  const sent = [];
  const ok = { users: { fetch: async id => ({ send: async m => sent.push([id, m.content]) }) } };
  const r = await sh.dispatchSourceAlerts(ok, 'admin', { file, now, rows: [row('B', 13)] });
  assert.deepEqual(r.down, ['B']); assert.equal(sent[0][0], 'admin'); assert.match(sent[0][1], /B：已 13 小時/);
  await sh.dispatchSourceAlerts(ok, 'admin', { file, now: now + H, rows: [row('B', 14)] });
  assert.equal(sent.length, 1);
});

test('status text marks healthy and stale sources', () => {
  const t = sh.sourceStatusText([row('A', 2), row('B', 20), row('C', null)], now);
  assert.match(t, /🟢 A：2 小時前更新/); assert.match(t, /🔴 B/); assert.match(t, /🔴 C：尚無成功紀錄/);
});

test('a source that stays down is reminded every 24 hours, not just once', () => {
  const sh = require('../src/source_health');
  const H = 3600_000, now = Date.parse('2026-10-14T00:00:00Z');
  const row = (age) => ({ name: '日本統合幕僚監部', lastSuccess: new Date(now - age * H).toISOString(), status: 'DEGRADED', limitHours: 24, detail: 'HTTP 403' });
  const a = sh.planSourceAlerts([row(30)], {}, now);
  assert.equal(a.down.length, 1); assert.equal(a.still.length, 0);
  const b = sh.planSourceAlerts([row(42)], a.next, now + 12 * H);
  assert.equal(b.down.length + b.still.length, 0, 'no repeat within 24h');
  const c = sh.planSourceAlerts([row(55)], b.next, now + 25 * H);
  assert.equal(c.still.length, 1, 'reminder after 24h');
  const d = sh.planSourceAlerts([row(60)], c.next, now + 30 * H);
  assert.equal(d.still.length, 0, 'next reminder only 24h after the previous one');
  assert.match(sh.alertMessage([], [], c.still), /仍未恢復/);
});

test('2026-11 稽核修正：每年固定的敏感日期、過期行事曆、跨月航行警告、機型數字、每週排程', () => {
  const W = require('../src/warning_board');
  const now = Date.parse('2027-03-01T00:00:00+08:00');
  const cal = { entries: [{ date: '2026-10-10', name: '國慶', kind: 'POLITICAL', windowDays: 14, yearly: true }] };
  assert.ok(W.calendarEntries(cal, now).some(e => e.date === '2027-10-10'));
  assert.equal(W.autoCalendar(cal, Date.parse('2027-10-12T00:00:00+08:00')).status, 'TRIGGERED');
  assert.equal(W.autoCalendar({ entries: [{ date: '2026-10-10', kind: 'POLITICAL' }] }, now).status, 'UNKNOWN', '行事曆過期是無法判定，不是不在觀察期');
  const J = require('../src/collectors/jcg_navwarn');
  assert.deepEqual(J.windowsIn('302300Z OCT TO 011500Z NOV', '2026-10-29T00:00:00Z'), [{ from: '2026-10-30T23:00:00.000Z', to: '2026-11-01T15:00:00.000Z' }]);
  const H = require('../src/research_health');
  const at = Date.parse('2026-11-05T12:00:00+08:00'); // 週四
  const w = H.scheduleWindow([{ h: 21, m: 15 }], at, { weekdays: [1] });
  assert.equal(new Date(w.previous + 8 * 3600_000).toISOString().slice(0, 16), '2026-11-02T21:15');
  assert.equal(new Date(w.next + 8 * 3600_000).toISOString().slice(0, 16), '2026-11-09T21:15');
});

test('燈號紀錄：舊快照沒有記錄指標時寫「未記錄」，不說「沒有指標觸發」', () => {
  const L = require('./site_level_history');
  const snaps = [{ at: '2026-10-20T00:00:00Z', theater: 'x', level: 2 }, { at: '2026-10-21T00:00:00Z', theater: 'x', level: 3 }, { at: '2026-10-22T00:00:00Z', theater: 'x', level: 3, ind: ['a'] }];
  const ev = L.levelTimeline(snaps, 'x', { now: Date.parse('2026-10-23T00:00:00Z') });
  assert.equal(ev.filter(e => e.type === 'ON').length, 0, '第一筆有記錄的快照不算新觸發');
  assert.match(L.historyHtml(ev, { esc: s => s }), /未記錄觸發指標/);
});

test('雲端寫死數據稽核：報告格式檢查、取最新合格報告、每 3 天排程', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const A = require('../src/audit_report');
  const good = { date: '2026-11-04', generatedAt: '2026-11-04T02:30:00Z', summary: '整體狀況說明'.repeat(12), checked: Array.from({ length: 8 }, (_, i) => ({ item: `點${i}`, siteValue: '網站', sourceValue: '來源', sourceUrl: 'https://www.mnd.gov.tw/', result: 'OK' })), findings: [{ id: 'usni-stale', severity: 'HIGH', category: 'STALE', title: 'USNI 過期', evidence: 'e', impact: 'i', suggestion: 's' }] };
  assert.deepEqual(A.checkAudit(good, '2026-11-04.json'), []);
  assert.ok(A.checkAudit({ ...good, checked: good.checked.slice(0, 3) }).length, '比對點太少不合格');
  assert.ok(A.checkAudit({ ...good, checked: [...good.checked.slice(1), { item: 'x', siteValue: 'y', result: 'MISMATCH' }] }).some(e => /sourceUrl/.test(e)), '非 UNVERIFIED 要有來源網址');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
  fs.writeFileSync(path.join(dir, '2026-11-04.json'), JSON.stringify(good));
  fs.writeFileSync(path.join(dir, '2026-11-07.json'), '{"date":"壞檔"}');
  assert.equal(A.latestAudit(dir).date, '2026-11-04', '不合格的新報告略過');
  const H = require('../src/research_health');
  const days = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31];
  const w = H.scheduleWindow([{ h: 10, m: 0 }], Date.parse('2026-11-05T12:00:00+08:00'), { monthDays: days });
  assert.equal(new Date(w.previous + 8 * 3600_000).toISOString().slice(0, 16), '2026-11-04T10:00');
  assert.equal(new Date(w.next + 8 * 3600_000).toISOString().slice(0, 16), '2026-11-07T10:00');
});

test('解析失效偵測：看資料日期不看抓取成功、原文有數字卻解析成空值要報', () => {
  const A = require('../src/self_audit');
  const now = Date.parse('2026-11-05T12:00:00Z');
  const files = { 'research/source_cache/gdelt.json': { lastSuccess: '2026-11-05T11:00:00Z', theaters: { taiwan_strait: { lastSuccess: '2026-10-27T00:00:00Z' }, ukraine_front: { lastSuccess: '2026-11-05T11:00:00Z' }, middle_east: {} } } };
  const checks = A.freshnessChecks(rel => files[rel] || null);
  const stale = checks.filter(c => now - c.at > c.hours * 3600_000).map(c => c.name);
  assert.ok(stale.some(n => /taiwan_strait/.test(n)), '整體 lastSuccess 新，但單一子來源已壞');
  assert.ok(stale.some(n => /middle_east/.test(n)), '從沒成功過也要報');
  assert.ok(!stale.some(n => /ukraine_front/.test(n)));
  const gaps = A.mndParseGaps([
    { body: '偵獲共機49架次（進入中部空域計31架次）、共艦6艘', observation: { periodEnd: '2026-11-03T00:00:00Z', aircraft: { value: 49 }, ships: { value: 6 }, crossingOrAirspace: { value: null } } },
    { body: '偵獲共機6架次、共艦7艘', observation: { periodEnd: '2026-11-02T00:00:00Z', aircraft: { value: 6 }, ships: { value: 7 }, crossingOrAirspace: { value: null } } }
  ]);
  assert.deepEqual(gaps, ['2026-11-03 越中線／進入空域'], '原文本來就沒寫的不算失效');
});

test('台股收盤用證交所補齊 Yahoo 缺的日子', () => {
  const { mergeCloses } = require('../src/collectors/markets');
  const y = [{ t: '2026-11-02T01:00:00.000Z', c: 44920 }, { t: '2026-11-03T01:00:00.000Z', c: null }, { t: '2026-11-04T01:00:00.000Z', c: 42948 }];
  const m = mergeCloses(y, [{ t: '2026-11-03T01:00:00.000Z', c: 43307.54 }]);
  assert.deepEqual(m.map(p => p.c), [44920, 43307.54, 42948]);
});

test('指標提案：只收人工指標、私訊一次、採納才寫入、駁回不寫入', async () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const P = require('../src/indicator_proposals');
  const now = Date.parse('2026-11-05T12:00:00Z');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'prop-')), ledgerFile = path.join(base, 'ledger.json');
  fs.writeFileSync(ledgerFile, JSON.stringify({ entries: [], watch: {} }));
  const pend = (id, o) => { fs.mkdirSync(path.join(base, 'pending'), { recursive: true }); fs.writeFileSync(path.join(base, 'pending', `${id}.json`), JSON.stringify(o)); };
  const good = { kind: 'INDICATOR', id: 'ir-us-strikes-20261105', theater: 'iran_gulf', indicator: 'ir_us_strikes', triggered: true, observedAt: '2026-11-02T00:00:00Z', summary: '美軍在荷莫茲海峽實施打擊。', sources: [{ url: 'https://example.com/a', publisher: '通訊社', sourceClass: 'INDEPENDENT_MEDIA', publishedAt: '2026-11-03T00:00:00Z' }] };
  assert.deepEqual(P.checkProposal(good, now), []);
  assert.ok(P.checkProposal({ ...good, indicator: 'tw_aircraft', theater: 'taiwan_strait' }, now).some(e => /人工指標/.test(e)), '有自動來源的指標不能提案');
  assert.ok(P.checkProposal({ ...good, sources: [] }, now).length, '沒有來源不合格');
  assert.ok(P.checkProposal({ ...good, observedAt: '2026-12-01T00:00:00Z' }, now).length, '未來時間不合格');
  pend(good.id, good);
  pend('bad-one', { kind: 'INDICATOR', id: 'bad-one', theater: 'iran_gulf', indicator: 'ir_us_strikes' });
  pend('no-one', { ...good, id: 'no-one' });
  pend('watch-iran-20261105', { kind: 'WATCH', id: 'watch-iran-20261105', theater: 'iran_gulf', text: '調停方下一輪會談是否舉行' });
  const sent = [];
  const client = { users: { fetch: async () => ({ send: async m => sent.push(m) }) } };
  const r = await P.dispatchProposals(client, 'admin', { base, now });
  assert.deepEqual(r, { sent: 3, invalid: 1 });
  assert.ok(sent.every(m => m.components[0].components.length === 2));
  await P.dispatchProposals(client, 'admin', { base, now });
  assert.equal(sent.length, 3, '不重複私訊');
  assert.match(P.resolveProposal(good.id, true, { base, ledgerFile, now }), /已採納/);
  const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].reviewed, true);
  assert.equal(ledger.entries[0].sentAt, undefined, '佇列欄位不進紀錄');
  assert.equal(require('../src/warning_board').buildWarningBoard({ now, ledger, history: { snapshots: [] } }).theaters.find(t => t.id === 'iran_gulf').indicators.find(i => i.id === 'ir_us_strikes').status, 'TRIGGERED', '採納後燈號規則讀得到');
  assert.match(P.resolveProposal(good.id, true, { base, ledgerFile, now }), /處理過/);
  assert.match(P.resolveProposal('no-one', false, { base, ledgerFile, now }), /已駁回/);
  assert.equal(JSON.parse(fs.readFileSync(ledgerFile, 'utf8')).entries.length, 1, '駁回不寫入');
  P.resolveProposal('watch-iran-20261105', true, { base, ledgerFile, now });
  assert.equal(JSON.parse(fs.readFileSync(ledgerFile, 'utf8')).watch.iran_gulf.text, '調停方下一輪會談是否舉行');
  assert.match(P.resolveProposal('nope', true, { base, ledgerFile, now }), /還沒同步/);
});

test('稽核中度修正：北韓巡弋飛彈不算彈道飛彈、GDELT 最久沒成功的先查', async () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const R = require('../src/collectors/regional');
  const missile = R.TYPES.find(t => t.type === 'DPRK_MISSILE').test;
  assert.equal(missile('North Korea fires cruise missiles off west coast'), false);
  assert.equal(missile('北韓試射巡弋飛彈'), false);
  assert.equal(missile('North Korea launches ballistic missile toward sea'), true);
  assert.equal(missile('北韓發射彈道飛彈'), true);
  const G = require('../src/collectors/gdelt');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gd-')), 'g.json');
  fs.writeFileSync(file, JSON.stringify({ series: {}, theaters: { taiwan_strait: { lastSuccess: '2026-11-05T00:00:00Z' } } }));
  const asked = [];
  await G.refreshGdelt({ force: true, file, spacingMs: 0, retryWaitMs: 0, theaters: ['taiwan_strait', 'south_china_sea'], fetchImpl: async u => { asked.push(u); return { ok: false, status: 500, text: async () => '' }; } });
  assert.match(decodeURIComponent(asked[0]), /South China Sea/i, '從沒成功過的戰區先查');
});

test('燈號升級評分：連續上升合併、規則改版不算、滿 14 天才待判定、短暫要標出', () => {
  const S = require('../src/level_scoring');
  const now = Date.parse('2026-11-05T00:00:00Z');
  const snap = (at, level, ruleVersion = 'v5') => ({ theater: 'x', at, level, ruleVersion });
  const history = { snapshots: [
    snap('2026-10-01T00:00:00Z', 1), snap('2026-10-02T00:00:00Z', 2), snap('2026-10-03T00:00:00Z', 3), snap('2026-10-03T12:00:00Z', 1),
    snap('2026-10-10T00:00:00Z', 1), snap('2026-10-11T00:00:00Z', 2, 'v6'),
    snap('2026-10-30T00:00:00Z', 2, 'v6'), snap('2026-11-01T00:00:00Z', 3, 'v6')
  ] };
  const list = S.episodes(history, now);
  assert.equal(list.length, 2, '72 小時內合併、規則改版不算');
  const [recent, old] = list;
  assert.equal(old.from, 1); assert.equal(old.to, 3);
  assert.equal(old.heldHours, 12, '從達到第 3 級算起');
  assert.equal(old.blip, true, '半天就降回');
  assert.equal(old.mature, true);
  assert.equal(recent.mature, false);
  assert.equal(recent.ended, false);
  assert.deepEqual(S.unlabeled(history, new Map(), now).map(e => e.id), [old.id]);
  const label = { episodeId: old.id, outcome: 'FALSE_ALARM', summary: '升級後兩週內沒有實質軍事升高，僅有例行報導。', labeledAt: '2026-11-04T00:00:00Z', sources: [{ url: 'https://example.com/a', publisher: '通訊社', sourceClass: 'INDEPENDENT_MEDIA' }] };
  assert.deepEqual(S.checkOutcome(label, new Set([old.id]), now), []);
  assert.ok(S.checkOutcome({ ...label, episodeId: 'nope' }, new Set([old.id]), now).length);
  assert.ok(S.checkOutcome({ ...label, sources: [] }, null, now).length, '沒有外部來源不合格');
  assert.ok(S.checkOutcome({ ...label, outcome: 'MAYBE' }, null, now).length);
  const card = S.scorecard(history, new Map([[old.id, label]]), now);
  assert.deepEqual(card.byTheater, [{ theater: 'x', total: 2, blips: 1, confirmed: 0, falseAlarm: 1, inconclusive: 0, waiting: 1 }]);
  const html = require('./site_accuracy').scoreSection(card, { esc: s => s, names: {}, tpe: () => 't', link: (u, t) => t });
  assert.match(html, /未經人工核可/);
  assert.doesNotMatch(html, /\d+%/, '樣本少不算比率');
});

test('稽核低嚴重度修正：台灣周邊範圍統一、USNI 7th Fleet、安理會討論烏克蘭不重複算歐洲、海事局清單修剪', () => {
  const { TAIWAN_AREA } = require('../src/collectors/taiwan_area');
  assert.ok(TAIWAN_AREA.north < 28, '不含溫州、台州外海');
  assert.ok(TAIWAN_AREA.south <= 20.4, '含巴丹群島');
  const { REGIONS } = require('../src/collectors/usni_fleet');
  assert.ok(REGIONS.WESTPAC.re.test('transiting the Pacific Ocean in U.S. 7th Fleet'));
  const W = require('../src/warning_board');
  assert.match(W.THEATERS.taiwan_strait.indicators.find(i => i.id === 'tw_carriers').name, new RegExp(`${REGIONS.WESTPAC.threshold} 艘以上`));
  const D = require('../src/collectors/diplomacy');
  const hits = D.classify('Latvia requests UN Security Council emergency meeting after Russian attack in Ukraine').map(c => c.theater);
  assert.ok(hits.includes('ukraine_front'));
  assert.ok(!hits.includes('europe_security'));
});

test('月報大事記涵蓋整個月，不只月底', () => {
  const { spreadEvents } = require('../src/monthly');
  const events = [];
  for (let d = 31; d >= 1; d--) for (let i = 0; i < 6; i++) events.push({ at: `2026-10-${String(d).padStart(2, '0')}T0${i}:00:00+08:00`, title: `${d}-${i}` });
  const picked = spreadEvents(events);
  assert.equal(picked.length, 40);
  assert.equal(new Set(picked.map(e => e.at.slice(0, 10))).size, 31, '每天都有');
  assert.equal(spreadEvents(events.slice(0, 5)).length, 5, '不足 40 筆就全收');
  assert.ok(Date.parse(picked[0].at) > Date.parse(picked.at(-1).at), '新到舊');
});

test('第二次稽核修正：否定句與非彈道武器不算事件、足球名單不算動員、燈號下降時主要指標缺資料不顯示下降', () => {
  const R = require('../src/collectors/regional');
  const type = t => R.classify(t)?.type;
  assert.equal(type('美官員密會葉門胡塞組織 承諾不攻擊美艦與商船'), undefined);
  assert.equal(type('討論牆 | 胡塞攻擊紅海商船'), undefined);
  assert.equal(type('Houthis agree to halt attacks on ships in Red Sea'), undefined);
  assert.equal(type('Houthis say they targeted two Saudi tankers'), 'HOUTHI');
  assert.equal(type('胡塞攻擊紅海商船'), 'HOUTHI');
  assert.equal(type('North Korea Tests Advanced Air-Defense Missile System'), undefined);
  assert.equal(type('朝鮮試射AI制導魚雷武器系統'), undefined);
  assert.equal(type('韓國試射自製高超音速武器 距北韓試射僅5天'), undefined);
  assert.equal(type('North Korea test-fired an intermediate-range missile'), 'DPRK_MISSILE');
  assert.equal(type('北韓試射彈道飛彈'), 'DPRK_MISSILE');
  assert.equal(type('North Korea fires ballistic missile and tests air-defense system'), 'DPRK_MISSILE');
  const M = require('../src/collectors/mobilization');
  assert.ok(!M.classify('Albania announce squad for Finland and Belarus, with first call-up for Ismaili')?.length);
});

test('GDELT：還沒結束的 UTC 日不存也不用，時間不會跑到未來', async () => {
  const gd = require('../src/collectors/gdelt');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gd-')), 'gdelt.json');
  const now = Date.parse('2026-11-07T02:00:00Z');
  const data = [{ date: '20261106T000000Z', value: 0.2 }, { date: '20261107T000000Z', value: 0.9 }];
  fs.writeFileSync(file, JSON.stringify({ series: { taiwan_strait: { '2026-11-07': 0.5 }, south_china_sea: { '2026-11-07': 0.5 } } }));
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ timeline: [{ data }] }) });
  const c = await gd.refreshGdelt({ force: true, file, fetchImpl, now, spacingMs: 0, retryWaitMs: 0, theaters: ['taiwan_strait'] });
  assert.deepEqual(c.series.taiwan_strait, { '2026-11-06': 0.2 });
  assert.deepEqual(c.series.south_china_sea, {}, '失敗或沒查到的戰區也清掉');
  const series = {}; for (let i = 1; i <= 20; i++) series[new Date(now - i * 86400_000).toISOString().slice(0, 10)] = 0.1;
  const r = gd.assessGdelt({ lastSuccess: new Date(now).toISOString(), series: { taiwan_strait: { ...series, '2026-11-07': 5 } } }, 'taiwan_strait', now);
  assert.equal(r.status, 'CLEAR', '當天半途的值不參與判定');
  assert.ok(Date.parse(r.observedAt) < now, '時間不在未來');
});

test('趨勢指標用通報實際時間', () => {
  const { assessTrend, mndSeries } = require('../src/trend');
  const history = Array.from({ length: 25 }, (_, i) => ({ url: 'u', observation: { periodEnd: new Date(Date.parse('2026-11-07T06:00:00+08:00') - i * 86400_000).toISOString(), aircraft: { value: 5 } } }));
  const r = assessTrend(mndSeries(history, 'aircraft'), { label: 'x', unit: '架', now: Date.parse('2026-11-07T02:00:00Z') });
  assert.equal(r.observedAt, new Date(Date.parse('2026-11-07T06:00:00+08:00')).toISOString());
});

test('USNI：分類 feed 停更時改用較新的 feed，全站 feed 夾雜的新聞不算週報', async () => {
  const U = require('../src/collectors/usni_fleet');
  const item = (title, date, slug, body) => `<item><title>${title}</title><link>https://news.usni.org/${slug}</link><pubDate>${date}</pubDate><content:encoded><![CDATA[${body}]]></content:encoded></item>`;
  const body = '<h2>In the Philippine Sea</h2><p>USS George Washington (CVN-73)</p>';
  const old = `<rss>${item('USNI News Fleet and Marine Tracker: Oct. 13, 2026', 'Tue, 13 Oct 2026 19:11:00 +0000', 'old', body)}</rss>`;
  const news = item('Theodore Roosevelt Carrier Strike Group Pulls Into Singapore', 'Fri, 06 Nov 2026 19:10:38 +0000', 'news', body);
  const fresh = `<rss>${news}${item('USNI News Fleet and Marine Tracker: Nov. 2, 2026', 'Mon, 02 Nov 2026 19:00:00 +0000', 'new', body)}</rss>`;
  assert.equal(U.parseFeed(fresh).url, 'https://news.usni.org/new', '不把一般新聞當週報');
  const now = Date.parse('2026-11-07T12:00:00Z');
  const run = async pick => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'usni-')), 'u.json');
    const asked = [];
    const c = await U.refreshUsniFleet({ force: true, file, now, fetchImpl: async u => { asked.push(u); return pick(u, asked.length); } });
    return { c, asked };
  };
  const ok = xml => ({ ok: true, status: 200, text: async () => xml });
  let r = await run(() => ok(fresh));
  assert.equal(r.asked.length, 1, '第一個 feed 夠新就停');
  assert.equal(r.c.latest.url, 'https://news.usni.org/new');
  r = await run((u, n) => (n === 1 ? { ok: false, status: 403, text: async () => '' } : n === 2 ? ok(old) : ok(fresh)));
  assert.equal(r.c.status, 'ONLINE');
  assert.equal(r.c.latest.url, 'https://news.usni.org/new', '取三個 feed 裡最新的');
  r = await run(() => ok(old));
  assert.equal(r.asked.length, 3, '都太舊才全部查完');
  assert.equal(r.c.latest.url, 'https://news.usni.org/old');
  r = await run(() => ({ ok: false, status: 403, text: async () => '' }));
  assert.equal(r.c.status, 'OFFLINE');
});

test('GDELT：當天已更新的戰區不重查，連續 3 個被限速才停止這一輪', async () => {
  const G = require('../src/collectors/gdelt');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gd-')), 'gdelt.json');
  const now = Date.parse('2026-11-07T12:00:00Z');
  fs.writeFileSync(file, JSON.stringify({ lastSuccess: '2026-11-07T04:00:00Z', series: { taiwan_strait: { '2026-11-06': 1 } }, theaters: { taiwan_strait: { status: 'ONLINE', lastSuccess: '2026-11-07T04:00:00Z' } } }));
  const asked = [];
  const fetchImpl = async u => { asked.push(u); return { ok: false, status: 429, text: async () => '' }; };
  const c = await G.refreshGdelt({ force: true, file, now, fetchImpl, spacingMs: 0, retryWaitMs: 0, theaters: ['taiwan_strait', 'korea_peninsula', 'south_china_sea', 'iran_gulf', 'ukraine_front'] });
  assert.equal(asked.length, 6, '台海略過；3 個戰區各試兩次後停止，第 4 個不查');
  assert.equal(c.status, 'PARTIAL');
  assert.equal(c.lastSuccess, '2026-11-07T04:00:00Z', '沒有真的抓到新資料就不更新成功時間');
  assert.match(c.error, /下一輪/);
});

