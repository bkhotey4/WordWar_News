// 中國海事局航行警告（msa.gov.cn）：只收軍事演習、實彈射擊、軍事活動類，解析禁航區座標與時間。
// 用途：台海前兆指標（tw_nav_warning）與台海圖上的禁航區。這些是中國官方公告，但公告本身不說明演習目的。
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.msa.gov.cn';
const BUREAUS = {
  fujian: { name: '福建海事局', listId: '7b08405760384570a0fb44e9204c4b1d' },
  zhejiang: { name: '浙江海事局', listId: '8e10ea74eb9e4c9690f8f891968add80' },
  guangdong: { name: '廣東海事局', listId: '1e478d409e854918bf12478b8a19f4a8' },
  shanghai: { name: '上海海事局', listId: '94df14ce1110415da44e67593e76619f' }
};
const CACHE = path.join(__dirname, '../../research/source_cache/china_msa.json');
// 共軍公告標題常見「禁止驶入」「实际使用武器」等，也算軍事類；火箭殘骸落區（民用航太）不算
const MILITARY = /军事|實彈|实弹|射击|演习|演練|演练|训练|实际使用武器|禁止驶入|禁航/;
const DAY = 86400_000;

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { notices: [], seen: {} }; } }
function writeCache(data, file = CACHE) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, file); }
const strip = html => String(html).replace(/<\/?br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// 列表頁：「類型—閩航警179/26 2026-09-29」
function parseList(html) {
  const out = [];
  for (const m of String(html).matchAll(/<a[^>]+href="([^"]*\/hxaq\/article\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const text = strip(m[2]).replace(/\s+/g, ' ').trim();
    const t = text.match(/^(.+?)[—-]+([一-龥]{1,3}航警\d+\/\d{2})\s*(\d{4}-\d{2}-\d{2})?/);
    if (!t) continue; // 英文版（FJ178/26 等）略過，避免重複
    out.push({ type: t[1].trim(), code: t[2], date: t[3] || null, url: new URL(m[1].replace(/\?.*$/, ''), BASE).href });
  }
  return out;
}

// 座標：23-41.31N、117-31.49E ／ 30-30N 122-0E ／ 25-15-30N 119-55-00E
const COORD = /(\d{1,2})-(\d{1,2}(?:\.\d+)?)(?:-(\d{1,2}(?:\.\d+)?))?\s*N[\s,，、;；]*(\d{1,3})-(\d{1,2}(?:\.\d+)?)(?:-(\d{1,2}(?:\.\d+)?))?\s*E/g;
const dms = (d, m, s) => Number(d) + Number(m) / 60 + (s ? Number(s) / 3600 : 0);
function coordsIn(text) { return [...text.matchAll(COORD)].map(m => [dms(m[4], m[5], m[6]), dms(m[1], m[2], m[3])]); }
function circle([lon, lat], nm, n = 24) {
  const r = nm * 1.852 / 111.32;
  return Array.from({ length: n + 1 }, (_, i) => { const a = i / n * 2 * Math.PI; return [lon + r * Math.cos(a) / Math.cos(lat * Math.PI / 180), lat + r * Math.sin(a)]; });
}
// 每個日期段落一個區域；單點＋半徑則畫圓
function parseAreas(text) {
  const segments = String(text).split(/(?=\d{1,2}月\d{1,2}日)/);
  const areas = [];
  for (const seg of segments) {
    const pts = coordsIn(seg);
    const radius = seg.match(/半径\s*(\d+(?:\.\d+)?)\s*(海里|浬)/);
    if (pts.length >= 3) areas.push(pts);
    else if (pts.length === 1 && radius) areas.push(circle(pts[0], Number(radius[1])));
  }
  // 去除重複（同一區域在多個日期段落重複出現）
  return areas.filter((a, i) => areas.findIndex(b => JSON.stringify(b) === JSON.stringify(a)) === i);
}
// 有效期間：取文中出現的所有「M月D日」（含「至D日」），最早為開始、最晚為結束（台北＝北京時間）
function parseValidity(text, publishedAt) {
  const pub = new Date(publishedAt);
  const year = pub.getUTCFullYear();
  const dates = [];
  let lastMonth = null;
  for (const m of String(text).matchAll(/(?:(\d{1,2})月)?(\d{1,2})日/g)) {
    const month = m[1] ? Number(m[1]) : lastMonth;
    if (!month) continue;
    lastMonth = month;
    let y = year; if (month < pub.getUTCMonth() + 1 - 6) y++; // 跨年公告
    const d = Date.parse(`${y}-${String(month).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}T00:00:00+08:00`);
    if (Number.isFinite(d)) dates.push(d);
  }
  if (!dates.length) return { validFrom: null, validTo: null };
  return { validFrom: new Date(Math.min(...dates)).toISOString(), validTo: new Date(Math.max(...dates) + DAY - 1).toISOString() };
}
function parseArticle(html, item) {
  const body = (String(html).match(/id="ch_p"[^>]*>([\s\S]*?)(?:<div class="foot_but"|<\/div>)/) || [])[1];
  const text = strip(body || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  const msg = strip((String(html).match(/class="msg[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '');
  const pub = msg.match(/发布时间[：:]\s*(\d{4}-\d{2}-\d{2})\s*(\d{2}:\d{2})?/);
  const source = (msg.match(/来源[：:]\s*([^\s文发<]+)/) || [])[1] || null;
  if (!text) throw new Error('MSA article layout changed');
  const publishedAt = pub ? new Date(`${pub[1]}T${pub[2] || '00:00'}:00+08:00`).toISOString() : (item.date ? new Date(`${item.date}T00:00:00+08:00`).toISOString() : null);
  return { ...item, source, publishedAt, text: text.slice(0, 1200), areas: parseAreas(text), ...parseValidity(text, publishedAt || Date.now()) };
}

// 海事局網站會擋非瀏覽器連線（HTTP 403），改用瀏覽器標頭，Windows 上再以 PowerShell 備援
// run：PowerShell 備援的執行函式，測試時注入以免真的連網
async function getText(url, fetchImpl, run) {
  try { return await require('../win_fetch').fetchText(url, { hosts: ['www.msa.gov.cn'], fetchImpl, run }); }
  catch (e) { throw new Error(`MSA ${e.message}`); }
}

let inFlight = null;
function refreshChinaMsa(options = {}) { if (!inFlight) inFlight = collect(options).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now(), backfillPages = 12, run } = {}) {
  const cache = readCache(file);
  if (!force && cache.lastAttempt && now - Date.parse(cache.lastAttempt) < 60 * 60_000) return cache;
  cache.lastAttempt = new Date(now).toISOString();
  cache.seen = cache.seen || {};
  const errors = [];
  let listed = 0;
  for (const [key, b] of Object.entries(BUREAUS)) {
    const first = !cache.bureaus?.[key]?.lastSuccess;
    try {
      for (let page = 1; page <= (first ? backfillPages : 2); page++) {
        const items = parseList(await getText(`${BASE}/${b.listId}/${page === 1 ? 'index' : `index_${page}`}.jhtml`, fetchImpl, run));
        if (!items.length) { if (page === 1) throw new Error('MSA list layout changed'); break; }
        listed += items.length;
        let known = 0;
        for (const item of items) {
          if (cache.seen[item.code]) { known++; continue; }
          cache.seen[item.code] = item.date || true;
          if (!MILITARY.test(item.type) || /火箭|残骸|卫星/.test(item.type)) continue;
          try { cache.notices.push({ bureau: key, bureauName: b.name, ...parseArticle(await getText(item.url, fetchImpl, run), item) }); }
          catch (e) { delete cache.seen[item.code]; errors.push(`${item.code}: ${e.message}`); }
        }
        if (!first && known === items.length) break;
      }
      cache.bureaus = { ...(cache.bureaus || {}), [key]: { lastSuccess: new Date(now).toISOString() } };
    } catch (e) { errors.push(`${b.name}: ${e.message}`); }
  }
  // 公告保留 400 天；已看過編號清單只保留近 2 年格式（/25、/26…）
  cache.notices = cache.notices.filter(n => now - Date.parse(n.publishedAt || 0) <= 400 * DAY).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const okBureaus = Object.values(cache.bureaus || {}).filter(x => now - Date.parse(x.lastSuccess) < 2 * 3600_000).length;
  Object.assign(cache, { status: okBureaus === Object.keys(BUREAUS).length ? 'ONLINE' : okBureaus ? 'DEGRADED' : 'DEGRADED', errors: errors.slice(0, 20), listed });
  if (okBureaus) cache.lastSuccess = new Date(now).toISOString();
  writeCache(cache, file);
  return cache;
}

// 台海相關範圍；區域中心在海峽中線以東（中線示意：118E,23N 到 122E,27N）或台灣周邊時視為「逼近台灣」
const TAIWAN_BOX = [116.5, 20.5, 124.5, 28.0];
const centroid = a => [a.reduce((s, p) => s + p[0], 0) / a.length, a.reduce((s, p) => s + p[1], 0) / a.length];
const eastOfMedian = ([lon, lat]) => lon > 118 + (lat - 23);
const inBox = ([lon, lat], b) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
function taiwanNotices(cache) {
  return (cache?.notices || []).filter(n => n.areas?.some(a => inBox(centroid(a), TAIWAN_BOX)))
    .map(n => ({ ...n, nearTaiwan: n.areas.some(a => eastOfMedian(centroid(a))) }));
}
function quantile(values, q) { const s = [...values].sort((a, b) => a - b); return s[Math.ceil(q * s.length) - 1]; }
function assessChinaMsa(cache, now = Date.now()) {
  const result = { status: 'UNAVAILABLE', ruleVersion: 'msa-taiwan-7d-p95-v1' };
  if (!cache?.lastSuccess) return result;
  if (now - Date.parse(cache.lastSuccess) > 48 * 3600_000) return { ...result, status: 'STALE' };
  const list = taiwanNotices(cache).map(n => ({ ...n, t: Date.parse(n.publishedAt) })).filter(n => n.t <= now);
  const count = end => list.filter(n => n.t > end - 7 * DAY && n.t <= end).length;
  const current = count(now);
  const recent = list.filter(n => n.t > now - 7 * DAY);
  const near = recent.filter(n => n.nearTaiwan);
  const oldest = Math.min(...(cache.notices || []).map(n => Date.parse(n.publishedAt)).filter(Number.isFinite), now);
  const samples = [];
  for (let d = 1; d <= 60; d++) { const end = now - 7 * DAY - (d - 1) * DAY; if (end - 7 * DAY >= oldest) samples.push(count(end)); }
  const base = { ...result, current, recent, near, samples: samples.length };
  if (near.length) return { ...base, status: 'NEAR_TAIWAN', historicalP95: samples.length >= 30 ? quantile(samples, 0.95) : null };
  if (samples.length < 30) return { ...base, status: current ? 'INSUFFICIENT_HISTORY' : 'INSUFFICIENT_HISTORY' };
  const p95 = quantile(samples, 0.95);
  return { ...base, historicalP95: p95, baselineWindowDays: 60, status: current > p95 ? 'ABOVE_HISTORICAL_P95' : 'WITHIN_HISTORICAL_RANGE' };
}
// 地圖用：已生效或即將生效（結束時間在 1 天內之後、公告 10 天內）的區域
function activeZones(cache, now = Date.now()) {
  return taiwanNotices(cache).filter(n => now - Date.parse(n.publishedAt) <= 10 * DAY && (!n.validTo || Date.parse(n.validTo) >= now - DAY));
}

module.exports = { refreshChinaMsa, parseList, parseArticle, parseAreas, parseValidity, coordsIn, assessChinaMsa, activeZones, taiwanNotices, readCache, CACHE, BUREAUS, TAIWAN_BOX };
