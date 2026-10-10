// 台灣生活面監測：網路中斷（IODA）、海纜中斷與大規模停電（媒體交叉比對）。
// 海纜與外島斷網是灰色地帶施壓的常見前兆，也直接影響生活；颱風、地震同樣會造成，所以推播會附一般準備建議。
const fs = require('fs');
const path = require('path');
const { parseRss } = require('./pla_joint');

const CACHE = path.join(__dirname, '../../research/source_cache/taiwan_infra.json');
const ALERT_STATE = path.join(__dirname, '../../research/infra_alert_state.json');
const HOUR = 3600_000;
const IODA = 'https://api.ioda.inetintel.cc.gatech.edu/v2/outages/alerts';
// IODA 區域代碼：全台與三個靠海纜連線的外島
const ENTITIES = [
  { type: 'country', code: 'TW', name: '全台' },
  { type: 'region', code: '4208', name: '澎湖' },
  { type: 'region', code: '4209', name: '金門' },
  { type: 'region', code: '4210', name: '馬祖（連江）' }
];
const NEWS = [
  { kind: 'CABLE', q: '海纜 (中斷 OR 斷裂 OR 受損 OR 斷線 OR 阻斷) when:3d' },
  { kind: 'POWER', q: '(大停電 OR 停電) 萬戶 when:1d' }
];
const gnews = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;

function classifyNews(kind, title) {
  const t = String(title || '');
  if (kind === 'CABLE') {
    if (!/海纜/.test(t) || !/(中斷|斷裂|受損|斷線|阻斷|故障)/.test(t)) return null;
    if (/(修復完成|恢復正常|已修復)/.test(t) && !/再度|又/.test(t)) return null;
    // 排除產業、評論類標題（例如「海纜中斷頻傳 某公司推服務」），只留具體地點的斷線事件
    if (/(服務|商機|推出|攜手|攜|合作|概念股|股價|市場|布局|論壇|研討|演練|計畫|預算|風險升高|頻傳|如何|為何|專家)/.test(t)) return null;
    const where = (t.match(/(馬祖|金門|澎湖|台澎|臺澎|台馬|臺馬|東沙|綠島|蘭嶼|小琉球)/) || [])[1];
    if (!where) return null;
    return { key: where.replace('臺', '台'), label: `${where.replace('臺', '台')}海纜中斷` };
  }
  const m = t.match(/(\d+(?:\.\d+)?)\s*萬戶/);
  if (!m || !/停電/.test(t)) return null;
  return { key: 'power', label: '大規模停電', households: Math.round(Number(m[1]) * 10000) };
}

const taipeiDate = iso => new Date(Date.parse(iso) + 8 * HOUR).toISOString().slice(0, 10);
function newsEvents(kind, items, now = Date.now()) {
  const groups = new Map();
  for (const it of items) {
    if (Date.parse(it.publishedAt) > now + 10 * 60_000) continue;
    const c = classifyNews(kind, it.title); if (!c) continue;
    const id = `${kind}|${c.key}|${taipeiDate(it.publishedAt)}`;
    const g = groups.get(id) || { id, kind, label: c.label, date: taipeiDate(it.publishedAt), households: 0, items: [] };
    g.households = Math.max(g.households, c.households || 0);
    if (!g.items.some(x => x.url === it.url)) g.items.push(it);
    groups.set(id, g);
  }
  return [...groups.values()].map(g => {
    g.items.sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
    const publishers = [...new Set(g.items.map(i => i.publisher))];
    // 停電要超過 5 萬戶才算「大規模」
    const confirmed = publishers.length >= 2 && (kind !== 'POWER' || g.households >= 50000);
    return { ...g, publishers, confirmed, firstSeen: g.items[0].publishedAt, items: g.items.slice(0, 6) };
  }).sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));
}

// IODA：同一地區 6 小時內，有 2 種以上資料來源（BGP、主動探測、Google 流量等）發出 critical 且尚未回到 normal，才判為斷網
function internetOutages(alertsByEntity, now = Date.now()) {
  const out = [];
  for (const { entity, alerts } of alertsByEntity) {
    const latest = new Map();
    for (const a of alerts || []) { const p = latest.get(a.datasource); if (!p || a.time > p.time) latest.set(a.datasource, a); }
    const down = [...latest.values()].filter(a => a.level === 'critical' && now / 1000 - a.time <= 6 * 3600);
    if (down.length >= 2) out.push({ id: `NET|${entity.code}|${taipeiDate(new Date(Math.min(...down.map(a => a.time)) * 1000).toISOString())}`, kind: 'INTERNET', label: `${entity.name}網路中斷`,
      entity: entity.name, since: new Date(Math.min(...down.map(a => a.time)) * 1000).toISOString(), datasources: down.map(a => a.datasource),
      drop: Math.round(100 * (1 - Math.min(...down.map(a => a.historyValue ? a.value / a.historyValue : 1)))) });
  }
  return out;
}

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
let inFlight = null;
function refreshTaiwanInfra(opts = {}) { if (!inFlight) inFlight = collect(opts).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now() } = {}) {
  const prev = readCache(file) || {};
  if (!force && prev.lastAttempt && now - Date.parse(prev.lastAttempt) < 20 * 60_000) return prev;
  const errors = [], alertsByEntity = [], news = { CABLE: [], POWER: [] };
  const until = Math.floor(now / 1000), from = until - 24 * 3600;
  for (const entity of ENTITIES) {
    try {
      const res = await fetchImpl(`${IODA}?entityType=${entity.type}&entityCode=${entity.code}&from=${from}&until=${until}`, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      alertsByEntity.push({ entity, alerts: (await res.json()).data || [] });
    } catch (e) { errors.push(`IODA ${entity.name}: ${e.message}`); }
  }
  for (const n of NEWS) {
    try {
      const res = await fetchImpl(gnews(n.q), { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 WordWarNews/2.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      news[n.kind] = parseRss(await res.text());
    } catch (e) { errors.push(`新聞 ${n.kind}: ${e.message}`); }
  }
  const keep = (k, h) => [...new Map([...(prev.news?.[k] || []), ...news[k]].filter(i => now - Date.parse(i.publishedAt) <= h * HOUR).map(i => [i.url, i])).values()];
  const merged = { CABLE: keep('CABLE', 7 * 24), POWER: keep('POWER', 48) };
  const total = ENTITIES.length + NEWS.length;
  const out = { lastAttempt: new Date(now).toISOString(), lastSuccess: errors.length < total ? new Date(now).toISOString() : prev.lastSuccess || null,
    status: errors.length ? (errors.length < total ? 'DEGRADED' : 'OFFLINE') : 'ONLINE', errors, news: merged,
    internet: alertsByEntity.length ? internetOutages(alertsByEntity, now) : (prev.internet || []),
    events: [...newsEvents('CABLE', merged.CABLE, now), ...newsEvents('POWER', merged.POWER, now)] };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(out, null, 1)); fs.renameSync(tmp, file);
  return out;
}

// 預警看板次要指標：海纜中斷（72 小時）或外島／全台斷網（進行中）；停電只做生活提醒，不列入戰情等級
function assessInfra(cache, now = Date.now()) {
  if (!cache?.lastSuccess || now - Date.parse(cache.lastSuccess) > 12 * HOUR) return null;
  const cable = (cache.events || []).find(e => e.kind === 'CABLE' && e.confirmed && now - Date.parse(e.firstSeen) <= 72 * HOUR);
  const net = (cache.internet || [])[0];
  return { cable, net };
}

function alertText(e) {
  const tips = {
    CABLE: '外島對外網路與電話可能變慢或中斷；政府通常會改用微波或衛星備援。家人在外島的話，先約好斷網時的聯絡方式。',
    INTERNET: '若你也受影響：改用收音機或電視接收官方訊息，手機訊號弱時改傳簡訊，盡量省電。',
    POWER: '停電時：拔掉大型電器插頭避免復電突波、少開冰箱門、用手電筒不要點蠟燭；可查台電停電查詢系統。'
  };
  const head = { CABLE: '🌐 海纜中斷', INTERNET: '📡 網路中斷', POWER: '⚡ 大規模停電' }[e.kind];
  const lines = [`# ${head}｜${e.label}`];
  if (e.kind === 'INTERNET') lines.push(`IODA 偵測：${e.datasources.join('、')} 同時出現異常，流量約比平常少 ${e.drop}%（自 ${new Date(Date.parse(e.since) + 8 * HOUR).toISOString().slice(5, 16).replace('T', ' ')} 起）`, '<https://ioda.inetintel.cc.gatech.edu/country/TW>');
  else {
    lines.push(`${e.date.slice(5).replace('-', '/')}｜${e.publishers.length} 家媒體報導${e.households ? `｜約 ${Math.round(e.households / 10000)} 萬戶` : ''}`);
    lines.push(...e.items.filter((it, i, arr) => arr.findIndex(x => x.publisher === it.publisher) === i).slice(0, 3).map(it => `• ${it.publisher}：${it.title} <${it.url}>`));
  }
  lines.push('', tips[e.kind], '輸入 `/prepare` 看家庭準備清單。（自動偵測，以官方公告為準；天災也會造成同樣狀況）');
  return lines.join('\n').slice(0, 1990);
}

async function dispatchInfraAlerts(client, subscribers, { cache = readCache(), file = ALERT_STATE, shouldDeliver = () => ({ deliver: true }), markDelivered = () => {}, now = Date.now() } = {}) {
  const state = (() => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } })();
  const events = [...(cache?.internet || []), ...(cache?.events || []).filter(e => e.confirmed && now - Date.parse(e.firstSeen) <= 24 * HOUR)];
  if (!state) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ sent: events.map(e => e.id) })); return []; }
  const sent = new Set(state.sent || []), results = [];
  for (const e of events.filter(x => !sent.has(x.id))) {
    const eventId = `INFRA_${e.id}`; let ok = 0, tried = 0;
    for (const sub of subscribers) {
      const d = shouldDeliver(sub.userId, { theater: 'taiwan_strait', level: 'WARNING', eventId, code: 'TAIWAN_INFRA' });
      if (!d.deliver) { results.push({ eventId, userId: sub.userId, status: 'DEFERRED' }); continue; }
      tried++;
      try { await (await client.users.fetch(sub.userId)).send({ content: alertText(e), components: require('../push_buttons').buttonsFor('taiwan_strait', { mute: false }), allowedMentions: { parse: [] } }); markDelivered(sub.userId, eventId); ok++; results.push({ eventId, userId: sub.userId, status: 'SENT' }); }
      catch (err) { results.push({ eventId, userId: sub.userId, status: 'FAILED', error: err.message }); }
    }
    if (ok || !tried) sent.add(e.id);
  }
  fs.writeFileSync(file, JSON.stringify({ sent: [...sent].slice(-200) }));
  return results;
}

module.exports = { refreshTaiwanInfra, classifyNews, newsEvents, internetOutages, assessInfra, alertText, dispatchInfraAlerts, readCache, ENTITIES, CACHE };
