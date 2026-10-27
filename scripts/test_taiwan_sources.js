const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pj = require('../src/collectors/pla_joint');
const wf = require('../src/win_fetch');

const rss = items => `<rss><channel>${items.map(i => `<item><title>${i.t} - ${i.p}</title><link>${i.u}</link><pubDate>${i.d}</pubDate><source url="https://x">${i.p}</source></item>`).join('')}</channel></rss>`;

test('classify: joint patrol, named exercise, Han Kuang excluded', () => {
  assert.equal(pj.classify('中共半天21架次軍機「聯合戰備警巡」騷擾').type, 'JOINT_PATROL');
  assert.deepEqual(pj.classify('東部戰區宣布「海峽雷霆-2026A」演習'), { type: 'NAMED_EXERCISE', name: '海峽雷霆' });
  assert.equal(pj.classify('東部戰區展開「新名稱」演習 圍台').name, '新名稱');
  assert.equal(pj.classify('漢光演習 聯合戰備警巡應處'), null);
  assert.equal(pj.classify('共機今日擾台'), null);
  assert.deepEqual(pj.numbers('共機21架次出海 15架次逾越中線'), { sorties: 21, crossing: 15 });
});

test('RSS parsing strips publisher suffix and events need two publishers', () => {
  const items = pj.parseRss(rss([
    { t: '中共半天21架次軍機「聯合戰備警巡」騷擾', p: '自由時報', u: 'https://a/1', d: 'Wed, 30 Sep 2026 06:36:00 GMT' },
    { t: '聯合戰備警巡 共機21架次', p: '自由時報', u: 'https://a/2', d: 'Wed, 30 Sep 2026 06:50:00 GMT' }
  ]));
  assert.equal(items[0].title, '中共半天21架次軍機「聯合戰備警巡」騷擾');
  const now = Date.parse('2026-09-30T08:00:00Z');
  assert.equal(pj.buildEvents(items, now)[0].confirmed, false);
  items.push({ title: '國慶前聯合戰備警巡', url: 'https://b/1', publisher: '中央社', publishedAt: '2026-09-30T07:00:00.000Z' });
  const ev = pj.buildEvents(items, now)[0];
  assert.equal(ev.confirmed, true); assert.equal(ev.sorties, 21);
  const a = pj.assessPlaJoint({ lastSuccess: '2026-09-30T07:59:00Z', events: [ev] }, 'JOINT_PATROL', now);
  assert.ok(a.hit);
  assert.equal(pj.assessPlaJoint({ lastSuccess: '2026-09-29T00:00:00Z', events: [ev] }, 'JOINT_PATROL', now), null, '來源過期不判定');
  assert.equal(pj.assessPlaJoint({ lastSuccess: '2026-10-05T07:59:00Z', events: [ev] }, 'JOINT_PATROL', Date.parse('2026-10-05T08:00:00Z')).hit, undefined, '72 小時後不再觸發');
});

test('collect merges feeds and alert pushes once, skipping the first run backlog', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pla-'));
  const now = Date.parse('2026-09-30T08:00:00Z');
  const body = rss([{ t: '聯合戰備警巡 共機21架次', p: '自由時報', u: 'https://a/1', d: 'Wed, 30 Sep 2026 06:36:00 GMT' },
    { t: '國慶前聯合戰備警巡', p: '中央社', u: 'https://b/1', d: 'Wed, 30 Sep 2026 07:00:00 GMT' }]);
  const cache = await pj.refreshPlaJoint({ force: true, file: path.join(dir, 'c.json'), now, fetchImpl: async () => ({ ok: true, text: async () => body }) });
  assert.equal(cache.status, 'ONLINE'); assert.equal(cache.events[0].confirmed, true);
  const sent = [];
  const client = { users: { fetch: async id => ({ send: async m => sent.push(m.content) }) } };
  const file = path.join(dir, 'alert.json');
  fs.writeFileSync(file, JSON.stringify({ sent: [] }));
  let r = await pj.dispatchPlaAlerts(client, [{ userId: 'u' }], { cache, file, now });
  assert.equal(r[0].status, 'SENT'); assert.match(sent[0], /聯合戰備警巡/); assert.match(sent[0], /21 架次/);
  r = await pj.dispatchPlaAlerts(client, [{ userId: 'u' }], { cache, file, now });
  assert.equal(r.length, 0);
  const fresh = path.join(dir, 'fresh.json');
  assert.equal((await pj.dispatchPlaAlerts(client, [{ userId: 'u' }], { cache, file: fresh, now })).length, 0);
});

test('win_fetch: host allowlist, browser headers, PowerShell fallback only on Windows block', async () => {
  await assert.rejects(wf.fetchText('https://evil.example/x', { hosts: ['www.mnd.gov.tw'] }), /Unexpected URL host/);
  let headers;
  const ok = await wf.fetchText('https://www.mnd.gov.tw/a', { hosts: ['www.mnd.gov.tw'], fetchImpl: async (u, o) => { headers = o.headers; return { ok: true, url: u, text: async () => 'hi' }; } });
  assert.equal(ok, 'hi'); assert.match(headers['User-Agent'], /Chrome/);
  const blocked = async () => ({ ok: false, status: 403 });
  await assert.rejects(wf.fetchText('https://www.msa.gov.cn/a', { hosts: ['www.msa.gov.cn'], fetchImpl: blocked, platform: 'linux' }), /HTTP 403/);
  const run = async (exe, args, opts) => { assert.equal(opts.env.WW_URL, 'https://www.msa.gov.cn/a'); return { stdout: Buffer.from('航行警告').toString('base64') }; };
  assert.equal(await wf.fetchText('https://www.msa.gov.cn/a', { hosts: ['www.msa.gov.cn'], fetchImpl: blocked, platform: 'win32', run }), '航行警告');
  const netFail = async () => { const e = new TypeError('fetch failed'); e.cause = { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }; throw e; };
  assert.equal(await wf.fetchText('https://www.mnd.gov.tw/a', { hosts: ['www.mnd.gov.tw'], fetchImpl: netFail, platform: 'win32', run: async () => ({ stdout: Buffer.from('ok').toString('base64') }) }), 'ok');
  await assert.rejects(wf.fetchText('https://www.mnd.gov.tw/a', { hosts: ['www.mnd.gov.tw'], fetchImpl: async () => ({ ok: false, status: 404 }), platform: 'win32', run: async () => { throw new Error('should not run'); } }), /HTTP 404/);
});

test('calendar: political window triggers, context dates only listed', () => {
  const w = require('../src/warning_board');
  const cal = { entries: [{ date: '2026-10-10', name: '國慶演說', kind: 'POLITICAL', windowDays: 14, source: { url: 'https://c/1', publisher: '中央社' } },
    { date: '2026-10-01', name: '中國國慶', kind: 'CONTEXT', source: { url: 'https://c/2', publisher: 'x' } }] };
  assert.equal(w.autoCalendar(cal, Date.parse('2026-10-05T00:00:00Z')).status, 'CLEAR');
  assert.equal(w.autoCalendar(cal, Date.parse('2026-10-12T00:00:00Z')).status, 'TRIGGERED');
  assert.equal(w.autoCalendar(cal, Date.parse('2026-10-30T00:00:00Z')).status, 'CLEAR');
  assert.deepEqual(w.upcomingDates(cal, Date.parse('2026-09-30T00:00:00Z')).map(d => d.date), ['2026-10-01', '2026-10-10']);
});

test('corrections only come from Taiwan MND documents', () => {
  const { checkMndCorrections } = require('../src/correction_dispatcher');
  const store = { changes: () => [
    { id: 1, documentId: 'd1', kind: 'CORRECTION', title: 'На Київщині ворожий дрон', originGroup: 'UKRAINE_AIR_FORCE', url: 'https://t.me/x' },
    { id: 2, documentId: 'd2', kind: 'CORRECTION', title: '中共解放軍臺海周邊海、空域動態', originGroup: 'TAIWAN_MND', url: 'https://www.mnd.gov.tw/news/plaact/1',
      previousObservation: { aircraft: { value: 9 } }, observation: { aircraft: { value: 11 } } },
    { id: 3, documentId: 'd3', kind: 'NEW_DOCUMENT', title: 'x', originGroup: 'TAIWAN_MND' }] };
  const out = checkMndCorrections(store);
  assert.equal(out.length, 1);
  assert.match(out[0].title, /臺海周邊/);
  assert.match(out[0].diffText, /9 → 修正為 11/);
});

test('next-day follow-up reports of the same patrol are not pushed again', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pla2-'));
  const file = path.join(dir, 's.json');
  fs.writeFileSync(file, JSON.stringify({ sent: ['JOINT_PATROL||2026-09-30'] }));
  const ev = { id: 'JOINT_PATROL||2026-10-01', type: 'JOINT_PATROL', name: '聯合戰備警巡', date: '2026-10-01', confirmed: true, firstSeen: '2026-10-01T01:00:00Z', publishers: ['a', 'b'], items: [] };
  const sent = [];
  const client = { users: { fetch: async () => ({ send: async m => sent.push(m) }) } };
  const r = await pj.dispatchPlaAlerts(client, [{ userId: 'u' }], { cache: { events: [ev] }, file, now: Date.parse('2026-10-01T02:00:00Z') });
  assert.equal(sent.length, 0); assert.equal(r[0].status, 'FOLLOW_UP_SKIPPED');
});

test('NATO flank: two publishers confirm, otherwise CLEAR instead of unknown', () => {
  const n = require('../src/collectors/nato_flank');
  assert.equal(n.classify('Poland scrambles fighter jets as Russia strikes western Ukraine'), 'RESPONSE');
  assert.equal(n.classify('Russian drone violated Polish airspace, military says'), 'AIRSPACE');
  assert.equal(n.classify('Poland election results'), null);
  const now = Date.parse('2026-10-08T12:00:00Z');
  const it = (t, p, u) => ({ title: t, publisher: p, url: u, publishedAt: '2026-10-08T05:00:00.000Z' });
  const ev = n.buildEvents([it('Poland scrambles jets', 'Reuters', 'a'), it('Polish military scrambles fighter jets', 'AP', 'b')], now);
  assert.equal(n.assessNato({ lastSuccess: '2026-10-08T11:00:00Z', events: ev }, 'RESPONSE', now).status, 'TRIGGERED');
  assert.equal(n.assessNato({ lastSuccess: '2026-10-08T11:00:00Z', events: ev }, 'AIRSPACE', now).status, 'CLEAR');
  assert.equal(n.assessNato({ lastSuccess: '2026-10-07T11:00:00Z', events: ev }, 'AIRSPACE', now), null);
});

test('market anomalies: z-score or fixed threshold, in the risk direction only', () => {
  const m = require('../src/collectors/markets');
  const mk = arr => arr.map((c, i) => ({ t: new Date(Date.UTC(2026, 7, 1 + i)).toISOString(), c }));
  const base = []; let v = 100; for (let i = 0; i < 80; i++) { v *= 1 + (i % 2 ? 1 : -1) * 0.01; base.push(v); }
  const brent = m.INSTRUMENTS.find(i => i.sym === 'BZ=F'), twii = m.INSTRUMENTS.find(i => i.sym === '^TWII');
  assert.equal(m.analyze(brent, mk([...base, v * 1.08])).status, 'ANOMALY');
  assert.equal(m.analyze(twii, mk([...base, v * 1.08])).status, 'NORMAL', '台股上漲不是風險訊號');
  const drop = { ...m.analyze(twii, mk([...base, v * 0.95])), date: new Date().toISOString() };
  assert.equal(drop.status, 'ANOMALY');
  assert.equal(m.assessMarket({ lastSuccess: new Date().toISOString(), quotes: [drop] }, 'taiwan_strait').status, 'TRIGGERED');
  assert.equal(m.assessMarket({ lastSuccess: '2020-01-01T00:00:00Z', quotes: [drop] }, 'taiwan_strait'), null);
});
