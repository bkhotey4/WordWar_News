const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ti = require('../src/collectors/taiwan_infra');

test('news classification for cables and power', () => {
  assert.equal(ti.classifyNews('CABLE', '馬祖海纜又斷了 台馬二號中斷').key, '馬祖');
  assert.equal(ti.classifyNews('CABLE', '台澎海纜已修復完成恢復正常'), null);
  assert.equal(ti.classifyNews('CABLE', '海纜產業商機'), null);
  assert.equal(ti.classifyNews('CABLE', '海底電纜中斷頻傳　是方攜Google Cloud推多元跨國海纜服務'), null);
  assert.equal(ti.classifyNews('CABLE', '海纜斷線 770衛星節點即刻救援'), null, '沒有具體地點不算');
  assert.equal(ti.classifyNews('POWER', '高雄大停電 逾12.5萬戶受影響').households, 125000);
  assert.equal(ti.classifyNews('POWER', '明天計畫性停電'), null);
});

test('events need two publishers; power needs ≥5萬戶', () => {
  const now = Date.parse('2026-09-30T08:00:00Z');
  const it = (t, p, u) => ({ title: t, publisher: p, url: u, publishedAt: '2026-09-30T05:00:00.000Z' });
  let ev = ti.newsEvents('CABLE', [it('馬祖海纜中斷', '中央社', 'a'), it('馬祖海纜斷裂 網路變慢', '自由時報', 'b')], now);
  assert.equal(ev[0].confirmed, true);
  ev = ti.newsEvents('POWER', [it('停電 3萬戶', '中央社', 'a'), it('停電3萬戶', '聯合報', 'b')], now);
  assert.equal(ev[0].confirmed, false);
});

test('internet outage needs two critical datasources within 6 hours', () => {
  const now = Date.parse('2026-09-30T08:00:00Z') / 1000;
  const ent = { entity: { code: '4210', name: '馬祖（連江）' }, alerts: [
    { datasource: 'bgp', level: 'critical', time: now - 3600, value: 10, historyValue: 100 },
    { datasource: 'ping-slash24', level: 'critical', time: now - 1800, value: 30, historyValue: 100 },
    { datasource: 'gtr', level: 'normal', time: now - 600, value: 90, historyValue: 100 }] };
  const out = ti.internetOutages([ent], now * 1000);
  assert.equal(out.length, 1); assert.equal(out[0].drop, 90);
  const one = { entity: ent.entity, alerts: [ent.alerts[0], { ...ent.alerts[1], level: 'normal', time: now - 60 }] };
  assert.equal(ti.internetOutages([one], now * 1000).length, 0);
});

test('collect + board indicator + alert once', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'infra-'));
  const now = Date.parse('2026-09-30T08:00:00Z');
  const rss = `<rss><item><title>馬祖海纜中斷 - 中央社</title><link>https://a/1</link><pubDate>Wed, 30 Sep 2026 05:00:00 GMT</pubDate><source url="x">中央社</source></item><item><title>馬祖海纜斷裂 - 自由時報</title><link>https://a/2</link><pubDate>Wed, 30 Sep 2026 06:00:00 GMT</pubDate><source url="x">自由時報</source></item></rss>`;
  const fetchImpl = async u => u.includes('ioda') ? { ok: true, json: async () => ({ data: [] }) } : { ok: true, text: async () => rss };
  const cache = await ti.refreshTaiwanInfra({ force: true, file: path.join(dir, 'c.json'), fetchImpl, now });
  assert.equal(cache.status, 'ONLINE');
  const w = require('../src/warning_board');
  const b = w.buildWarningBoard({ now, infra: cache, ledger: { entries: [] }, history: { snapshots: [] } });
  const ind = b.theaters[0].indicators.find(i => i.id === 'tw_infra');
  assert.equal(ind.status, 'TRIGGERED'); assert.match(ind.summary, /馬祖海纜中斷/);
  const sent = []; const client = { users: { fetch: async () => ({ send: async m => sent.push(m.content) }) } };
  const file = path.join(dir, 's.json'); fs.writeFileSync(file, '{"sent":[]}');
  await ti.dispatchInfraAlerts(client, [{ userId: 'u' }], { cache, file, now });
  await ti.dispatchInfraAlerts(client, [{ userId: 'u' }], { cache, file, now });
  assert.equal(sent.length, 1); assert.match(sent[0], /海纜中斷/);
});
