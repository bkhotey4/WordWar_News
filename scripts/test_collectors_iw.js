const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ukmto = require('../src/collectors/ukmto');
const air = require('../src/collectors/ukraine_air');
const { buildWarningBoard, planWarningPushes, dispatchWarningPushes } = require('../src/warning_board');

const DAY = 86400_000;
const NOW = Date.parse('2026-09-30T02:00:00Z');
const iso = t => new Date(t).toISOString();

// ── UKMTO ──
const raw = (n, daysAgo, type = 'Attack', lat = 26.4, lon = 56.4, details = 'Vessel reported an incident.') => ({ incidentIssuer: 'UKMTO', incidentNumber: n,
  utcDateCreated: iso(NOW - daysAgo * DAY), utcDateOfIncident: iso(NOW - daysAgo * DAY), incidentTypeName: type, locationLatitude: lat, locationLongitude: lon,
  place: 'Strait of Hormuz', vesselType: 'Tanker', otherDetails: details });

test('UKMTO rows normalise and only Gulf hostile incidents count', () => {
  const attack = ukmto.normalize(raw(1, 1));
  assert.equal(attack.id, 'UKMTO-2026-1');
  assert.equal(ukmto.inGulf(attack) && ukmto.hostile(attack), true);
  assert.equal(ukmto.inGulf(ukmto.normalize(raw(2, 1, 'Attack', 14.4, 42.7))), false); // 紅海
  assert.equal(ukmto.hostile(ukmto.normalize(raw(3, 1, 'Advisory'))), false);
  assert.equal(ukmto.hostile(ukmto.normalize(raw(4, 1, 'Suspicious Activity', 26.4, 56.4, 'vessel struck by a suspected unknown projectile'))), true);
  assert.equal(ukmto.hostile(ukmto.normalize(raw(5, 1, 'Suspicious Activity', 26.4, 56.4, 'small craft approached'))), false);
  assert.equal(ukmto.normalize({ incidentNumber: 'x' }), null);
});

test('UKMTO collector merges, records coverage and reports failures without inventing data', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ukmto-')), 'c.json');
  const ok = async () => ({ ok: true, json: async () => [raw(1, 2), raw(2, 80)] });
  const c = await ukmto.refreshUkmto({ force: true, file, fetchImpl: ok, now: NOW });
  assert.equal(c.status, 'ONLINE'); assert.equal(c.incidents.length, 2);
  assert.equal(c.coverageStart, iso(NOW - 80 * DAY));
  const bad = async () => ({ ok: false, status: 503 });
  const c2 = await ukmto.refreshUkmto({ force: true, file, fetchImpl: bad, now: NOW + 1000 });
  assert.equal(c2.status, 'DEGRADED'); assert.equal(c2.incidents.length, 2);
});

test('UKMTO assessment compares the last 7 days with the 60-day P95', () => {
  const quiet = [raw(1, 2), ...Array.from({ length: 12 }, (_, i) => raw(10 + i, 10 + i * 6))].map(ukmto.normalize);
  const cache = { lastSuccess: iso(NOW), coverageStart: iso(NOW - 90 * DAY), incidents: quiet };
  assert.equal(ukmto.assessUkmto(cache, NOW).status, 'WITHIN_HISTORICAL_RANGE');
  const busy = [...quiet, ...[1, 2, 3, 4, 5].map(d => ukmto.normalize(raw(100 + d, d - 0.5)))];
  const a = ukmto.assessUkmto({ ...cache, incidents: busy }, NOW);
  assert.equal(a.status, 'ABOVE_HISTORICAL_P95');
  assert.equal(ukmto.assessUkmto({ ...cache, coverageStart: iso(NOW - 20 * DAY) }, NOW).status, 'INSUFFICIENT_HISTORY');
  assert.equal(ukmto.assessUkmto({ ...cache, lastSuccess: iso(NOW - 3 * DAY) }, NOW).status, 'STALE');
});

// ── 烏克蘭空軍 ──
test('Air Force summaries parse launched counts, word numbers and interception fallback', () => {
  const p = air.parseAirForceSummary;
  const { weapons, ...core } = p('У ніч на 29 вересня (з 18:00 28 вересня) противник атакував протикорабельною ракетою Циркон/Онікс, двома балістичними ракетами Іскандер-М, 152 ударними БпЛА типу Shahed, з яких 82 — реактивні', '2026-09-29T05:17:35Z');
  assert.deepEqual(core, { kind: 'NIGHT', date: '2026-09-29', drones: 152, missiles: 3, missileBasis: 'LAUNCHED' });
  assert.deepEqual(weapons.missilesByType.map(w => [w.category, w.model, w.count]), [['反艦飛彈', '鋯石／縞瑪瑙', 1], ['彈道飛彈', '伊斯坎德爾', 2]]);
  assert.equal(weapons.jetDrones, 82);
  assert.deepEqual(weapons.droneTypes, ['Shahed 沙赫德']);
  assert.equal(p('У ніч на 23 вересня (з 18:00 22 вересня) противник атакував 161 ударним БпЛА типу Shahed', '2026-09-23T05:00Z').drones, 161);
  const fallback = p('У ніч на 24 вересня (з 18:00 23 вересня) противник атакував балістичними ракетами Іскандер-М, 282 ударними БпЛА.\n\nЗа попередніми даними збито/подавлено 227 цілей:\n- 4 протикорабельні ракети;\n- 3 балістичні ракети;\n- 219 БпЛА', '2026-09-24T05:00Z');
  assert.equal(fallback.missiles, 7); assert.equal(fallback.missileBasis, 'INTERCEPTED_MIN');
  assert.equal(p('Протягом дня 29 вересня (із 6.30 по 18.00) противник атакував Україну 112 ударними БпЛА', '2026-09-29T15:32Z').kind, 'DAY');
  assert.equal(p('У ніч на 1 січня (з 18:00 31 грудня) противник атакував 50 ударними БпЛА', '2027-01-01T05:00Z').date, '2027-01-01');
  assert.equal(p('У ніч на 31 грудня (з 18:00 30 грудня) противник атакував 50 ударними БпЛА', '2027-01-01T05:00Z').date, '2026-12-31');
  assert.equal(p('Повітряна тривога у Києві', '2026-09-29T05:00Z'), null);
});

test('Telegram page parsing keeps post ids, times and line breaks', () => {
  let cheerioAvailable = true; try { require.resolve('cheerio'); } catch { cheerioAvailable = false; }
  if (!cheerioAvailable) return;
  const html = '<div class="tgme_widget_message" data-post="kpszsu/100"><div class="tgme_widget_message_text">У ніч на 29 вересня (з 18:00 28 вересня)<br>противник атакував 10 ударними БпЛА</div><time datetime="2026-09-29T05:00:00+00:00"></time></div>';
  const [m] = air.parsePage(html);
  assert.equal(m.post, 'kpszsu/100'); assert.match(m.text, /\n/);
});

function airCache(days, spike = null) {
  const reports = [];
  for (let d = days; d >= 1; d--) {
    const date = new Date(NOW - d * DAY).toISOString().slice(0, 10);
    const drones = spike && d <= 7 ? spike : 100 + (d % 5) * 5;
    reports.push({ post: `kpszsu/${1000 - d}`, url: `https://t.me/kpszsu/${1000 - d}`, time: `${date}T05:00:00.000Z`, kind: 'NIGHT', date, drones, missiles: d === 1 && spike ? 60 : 2, missileBasis: 'LAUNCHED' });
  }
  return { reports };
}

test('Ukraine air assessment needs 30 baseline samples and flags spikes', () => {
  assert.equal(air.assessUkraineAir(airCache(20), NOW).status, 'INSUFFICIENT_HISTORY');
  assert.equal(air.assessUkraineAir(airCache(75), NOW).status, 'WITHIN_HISTORICAL_RANGE');
  const s = air.assessUkraineAir(airCache(75, 400), NOW);
  assert.equal(s.status, 'ABOVE_HISTORICAL_P95'); assert.equal(s.volumeHigh, true); assert.equal(s.missileHigh, true);
  const old = airCache(75); old.reports = old.reports.filter(r => Date.parse(r.time) < NOW - 5 * DAY);
  assert.equal(air.assessUkraineAir(old, NOW).status, 'STALE');
});

test('automatic UKMTO and Ukraine indicators feed the warning board with correct source classes', () => {
  const u = { status: 'ABOVE_HISTORICAL_P95', current: 6, historicalP95: 4, samples: 60, baselineWindowDays: 60, latest: { occurredAt: iso(NOW - DAY), createdAt: iso(NOW - DAY), place: 'Strait of Hormuz', number: 143 } };
  const a = air.assessUkraineAir(airCache(75, 400), NOW);
  const b = buildWarningBoard({ now: NOW, ledger: { entries: [] }, history: { snapshots: [] }, ukmto: u, uaAir: a });
  const ir = b.theaters.find(t => t.id === 'iran_gulf').indicators.find(i => i.id === 'ir_shipping');
  assert.equal(ir.status, 'TRIGGERED'); assert.equal(ir.sources[0].sourceClass, 'OFFICIAL');
  const ua = b.theaters.find(t => t.id === 'ukraine_front');
  assert.equal(ua.indicators.find(i => i.id === 'ua_strike_volume').sources[0].sourceClass, 'PARTY_CLAIM');
  assert.equal(ua.level, 2);
});

// ── Discord 推播 ──
test('push plan sends level changes once and one daily digest after 08:00 Taipei', () => {
  const board = (level, at) => ({ generatedAt: at, theaters: [{ id: 'europe_security', name: '歐洲與北約東翼', level, levelName: '', triggered: [], deescalation: [], unknown: [], trend: 'UNKNOWN', reason: '' }] });
  const first = planWarningPushes(board(2, '2026-09-29T23:30:00.000Z'), {}); // 台北 07:30
  assert.equal(first.pushes.length, 0);
  const change = planWarningPushes(board(3, '2026-09-30T00:10:00.000Z'), first.next); // 台北 08:10
  assert.deepEqual(change.pushes.map(p => p.kind).sort(), ['CHANGE', 'DIGEST']);
  const again = planWarningPushes(board(3, '2026-09-30T00:13:00.000Z'), change.next);
  assert.equal(again.pushes.length, 0);
  const unknown = planWarningPushes(board(null, '2026-09-30T00:16:00.000Z'), again.next);
  assert.equal(unknown.pushes.length, 0); assert.equal(unknown.next.theaters.europe_security.level, 3);
});

test('dispatch retries when every recipient failed and respects subscription filters', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'push-')), 's.json');
  fs.writeFileSync(file, JSON.stringify({ theaters: { europe_security: { level: 2 } }, lastDigestDate: '2026-09-30' }));
  const board = { generatedAt: '2026-09-30T01:00:00.000Z', note: '', theaters: [{ id: 'europe_security', name: '歐洲與北約東翼', level: 3, levelName: '高度警戒', reason: 'x', indicators: [], triggered: [], deescalation: [], unknown: [], trend: 'UP' }] };
  const failing = { users: { fetch: async () => { throw new Error('offline'); } } };
  // 每位收件人各自補送：寄送失敗的人留在待送清單
  const r1 = await dispatchWarningPushes(failing, [{ userId: 'u1' }, { userId: 'u2' }], { board, file });
  assert.deepEqual(r1.map(r => r.status), ['FAILED', 'FAILED']);
  let st = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(st.theaters.europe_security.level, 3);
  assert.deepEqual(st.pending[0].users, ['u1', 'u2']);
  const sent = [];
  const working = { users: { fetch: async id => ({ send: async m => sent.push([id, m.content]) }) } };
  // u1 可收；u2 在靜默時段 → 延後，之後補送
  const r2 = await dispatchWarningPushes(working, [{ userId: 'u1' }, { userId: 'u2' }], { board, file, shouldDeliver: id => (id === 'u1' ? { deliver: true } : { deliver: false, reason: '靜默時段中' }) });
  assert.deepEqual(r2.map(r => `${r.userId}:${r.status}`).sort(), ['u1:SENT', 'u2:DEFERRED']);
  assert.match(sent[0][1], /第 2 級 → 第 3 級/);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).pending[0].users, ['u2']);
  const r3 = await dispatchWarningPushes(working, [{ userId: 'u1' }, { userId: 'u2' }], { board, file });
  assert.deepEqual(r3.map(r => `${r.userId}:${r.status}`), ['u2:SENT']);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).pending.length, 0);
  assert.equal((await dispatchWarningPushes(working, [{ userId: 'u1' }], { board, file })).length, 0);
  // 不在訂閱範圍的人直接移出，不會一直重試
  fs.writeFileSync(file, JSON.stringify({ theaters: { europe_security: { level: 2 } }, lastDigestDate: '2026-09-30' }));
  await dispatchWarningPushes(working, [{ userId: 'u3' }], { board, file, shouldDeliver: () => ({ deliver: false, reason: '戰區不在訂閱範圍內' }) });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).pending.length, 0);
});
