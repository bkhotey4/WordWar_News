// 日本統合幕僚監部報道發表（mod.go.jp/js/press）：中國海軍艦艇／軍機動向。
// 用途：台海前兆指標（tw_japan_fleet）。列表頁含 2007 年以來全部標題，可作歷史基準。
const fs = require('fs');
const path = require('path');

const LIST = 'https://www.mod.go.jp/js/press/index.html';
const CACHE = path.join(__dirname, '../../research/source_cache/japan_js.json');
const DAY = 86400_000;
// 常見通過水道的概略座標（只作圖上示意，非艦艇實際位置）
const PASSAGES = [
  [/与那国島[－ー―-]台湾/, '與那國島—台灣間', 122.5, 24.2], [/与那国島[－ー―-]西表島/, '與那國島—西表島間', 123.4, 24.35],
  [/沖縄本島[－ー―-]宮古島|沖宮間/, '沖繩本島—宮古島間', 126.3, 25.3], [/奄美大島[－ー―-]横当島/, '奄美大島—橫當島間', 129.3, 28.6],
  [/大隅海峡/, '大隅海峽', 130.8, 31.0], [/対馬海峡/, '對馬海峽', 129.5, 34.2], [/宗谷海峡/, '宗谷海峽', 141.9, 45.6], [/津軽海峡/, '津輕海峽', 140.7, 41.5]
];

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { items: [] }; } }
function writeCache(data, file = CACHE) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, file); }

function classify(title) {
  const kind = /海軍艦艇/.test(title) ? 'NAVY' : /無人機|TB-001|WZ-7|BZK/.test(title) ? 'DRONE' : /軍機|中国機/.test(title) ? 'AIRCRAFT' : 'OTHER';
  const carrier = /空母|遼寧|山東|福建/.test(title);
  const p = PASSAGES.find(([re]) => re.test(title));
  return { kind, carrier, passage: p ? { name: p[1], lon: p[2], lat: p[3] } : null, taiwanNear: /与那国|台湾|西表/.test(title) };
}
function parseList(html) {
  const out = [];
  for (const m of String(html).matchAll(/<a href="([^"]+)"[^>]*>\s*<time datetime="(\d{4}-\d{2}-\d{2})">[\s\S]*?<h5>([\s\S]*?)<\/h5>/g)) {
    const title = m[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!/中国/.test(title)) continue;
    out.push({ date: m[2], title, url: new URL(m[1], LIST).href, ...classify(title) });
  }
  return out;
}

let inFlight = null;
function refreshJapanJs(options = {}) { if (!inFlight) inFlight = collect(options).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now() } = {}) {
  const cache = readCache(file);
  if (!force && cache.lastAttempt && now - Date.parse(cache.lastAttempt) < 3 * 3600_000) return cache;
  cache.lastAttempt = new Date(now).toISOString();
  try {
    const res = await fetchImpl(LIST, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Mozilla/5.0 WordWarNews/2.0 (personal research bot)' } });
    if (!res.ok) throw new Error(`JS HTTP ${res.status}`);
    const items = parseList(await res.text());
    if (!items.length) throw new Error('JS list layout changed');
    Object.assign(cache, { items, status: 'ONLINE', lastSuccess: new Date(now).toISOString(), error: null });
  } catch (e) { Object.assign(cache, { status: 'DEGRADED', error: e.message }); }
  writeCache(cache, file);
  return cache;
}

function quantile(values, q) { const s = [...values].sort((a, b) => a - b); return s[Math.ceil(q * s.length) - 1]; }
// 近 7 天中國海軍艦艇／軍機公告數，對比過去 60 天每日滾動 7 天數的 P95；出現航艦或與那國／台灣附近通過即觸發
function assessJapanJs(cache, now = Date.now()) {
  const result = { status: 'UNAVAILABLE', ruleVersion: 'js-china-7d-p95-v1' };
  if (!cache?.lastSuccess) return result;
  if (now - Date.parse(cache.lastSuccess) > 72 * 3600_000) return { ...result, status: 'STALE' };
  const list = (cache.items || []).filter(i => i.kind !== 'OTHER').map(i => ({ ...i, t: Date.parse(`${i.date}T12:00:00+09:00`) })).filter(i => i.t <= now);
  const count = end => list.filter(i => i.t > end - 7 * DAY && i.t <= end).length;
  const recent = list.filter(i => i.t > now - 7 * DAY);
  const samples = [];
  for (let d = 1; d <= 60; d++) samples.push(count(now - 7 * DAY - (d - 1) * DAY));
  const p95 = quantile(samples, 0.95);
  const special = recent.filter(i => i.carrier || i.taiwanNear);
  const status = special.length ? 'CARRIER_OR_NEAR_TAIWAN' : recent.length > p95 ? 'ABOVE_HISTORICAL_P95' : 'WITHIN_HISTORICAL_RANGE';
  return { ...result, status, current: recent.length, historicalP95: p95, samples: samples.length, baselineWindowDays: 60, recent, special };
}

module.exports = { refreshJapanJs, parseList, classify, assessJapanJs, readCache, CACHE, LIST, PASSAGES };
