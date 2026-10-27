// GDELT 2.0 DOC API（免費、免登入；限制每 5 秒 1 次請求）：全球新聞對各戰區關鍵詞的「報導量強度」每日序列。
// 用途：資訊環境次要指標——當日報導量超過前 30 天的第 90 百分位且達中位數 2 倍以上，表示全球媒體對該戰區的關注異常升高。
// 報導量是反應性訊號（事情發生後才升高），只作佐證，不單獨推高等級；報導多不等於事件已證實。
const fs = require('fs');
const path = require('path');

const API = 'https://api.gdeltproject.org/api/v2/doc/doc';
const CACHE = path.join(__dirname, '../../research/source_cache/gdelt.json');
const HOUR = 3600_000, DAY = 24 * HOUR;
const UA = { 'User-Agent': 'Mozilla/5.0 WordWarNews/2.0 (personal research bot)' };
const SPACING_MS = 10000; // 官方限制 5 秒一次；實測更嚴，留餘裕
const RETRY_WAIT_MS = 15000; // 連線失敗或 429 時等待後重試一次
// 查詢用 GDELT 語法：片語加引號、OR 需括號；盡量用專有名詞避免歧義
const QUERIES = {
  taiwan_strait: { q: '"Taiwan Strait"', label: '台海' },
  iran_gulf: { q: '"Strait of Hormuz"', label: '荷莫茲海峽' },
  europe_security: { q: '(Poland OR Lithuania OR Latvia OR Estonia OR Romania) (airspace OR NATO)', label: '北約東翼' },
  ukraine_front: { q: 'Ukraine (missile OR drone) attack', label: '烏克蘭空襲' },
  korea_peninsula: { q: '"North Korea" missile', label: '北韓飛彈' },
  south_china_sea: { q: '"South China Sea"', label: '南海' },
  middle_east: { q: '(Hezbollah OR Houthi OR "Gaza")', label: '以巴黎巴嫩紅海' }
};

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { series: {} }; } }
function writeCache(data, file = CACHE) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, file); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// {"timeline":[{"series":"Volume Intensity","data":[{"date":"20261010T000000Z","value":0.76},…]}]} → { 'YYYY-MM-DD': value }
function parseTimeline(json) {
  const data = json?.timeline?.[0]?.data;
  if (!Array.isArray(data)) throw new Error('GDELT timeline format changed');
  const out = {};
  for (const d of data) { const m = /^(\d{4})(\d{2})(\d{2})T/.exec(d?.date || ''); if (m && Number.isFinite(Number(d.value))) out[`${m[1]}-${m[2]}-${m[3]}`] = Number(d.value); }
  return out;
}

let inFlight = null;
function refreshGdelt(options = {}) { if (!inFlight) inFlight = collect(options).finally(() => { inFlight = null; }); return inFlight; }
async function fetchTimeline(url, fetchImpl, retryWaitMs) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(60000), headers: UA });
      const text = await res.text();
      if (!res.ok || /limit requests/i.test(text)) throw new Error(res.ok || res.status === 429 ? 'rate limited' : `HTTP ${res.status}`);
      return JSON.parse(text);
    } catch (e) { lastErr = e; if (attempt === 0) await sleep(retryWaitMs); }
  }
  throw lastErr;
}
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now(), spacingMs = SPACING_MS, retryWaitMs = RETRY_WAIT_MS, theaters = Object.keys(QUERIES) } = {}) {
  const cache = readCache(file);
  cache.series = cache.series || {}; cache.theaters = cache.theaters || {};
  if (!force && cache.lastAttempt && now - Date.parse(cache.lastAttempt) < 2 * HOUR) return cache;
  cache.lastAttempt = new Date(now).toISOString();
  let ok = 0; const errors = [];
  for (const id of theaters) {
    const q = QUERIES[id]; if (!q) continue;
    try {
      const url = `${API}?query=${encodeURIComponent(q.q)}&mode=timelinevol&timespan=45d&format=json`;
      const days = parseTimeline(await fetchTimeline(url, fetchImpl, retryWaitMs));
      if (!Object.keys(days).length) throw new Error('empty timeline');
      // 合併：今天的值會隨當天進行而變動，每次覆寫；舊日期保留 150 天
      cache.series[id] = { ...(cache.series[id] || {}), ...days };
      for (const k of Object.keys(cache.series[id])) if (now - Date.parse(`${k}T00:00:00Z`) > 150 * DAY) delete cache.series[id][k];
      cache.theaters[id] = { status: 'ONLINE', lastSuccess: new Date(now).toISOString(), query: q.q, error: null };
      ok++;
    } catch (e) { errors.push(`${id}: ${e.message}`); cache.theaters[id] = { ...(cache.theaters[id] || {}), status: 'DEGRADED', error: e.message }; }
    await sleep(spacingMs);
  }
  Object.assign(cache, ok ? { status: ok === theaters.length ? 'ONLINE' : 'PARTIAL', lastSuccess: new Date(now).toISOString(), error: errors.join('；') || null } : { status: 'DEGRADED', error: errors.join('；') || '無資料' });
  writeCache(cache, file);
  return cache;
}

const quantile = (values, q) => { const s = [...values].sort((a, b) => a - b); return s[Math.max(0, Math.ceil(q * s.length) - 1)]; };
// 當日（UTC）報導量對比前 30 天：> P90 且 ≥ 2 倍中位數 → 觸發；資料不足 15 天不判定
function assessGdelt(cache, theaterId, now = Date.now()) {
  if (!cache?.lastSuccess || now - Date.parse(cache.lastSuccess) > 24 * HOUR) return null;
  const series = cache.series?.[theaterId]; const label = QUERIES[theaterId]?.label || theaterId;
  if (!series) return null;
  const today = new Date(now).toISOString().slice(0, 10);
  const keys = Object.keys(series).filter(k => k <= today).sort();
  const latestKey = keys.at(-1);
  if (!latestKey || now - Date.parse(`${latestKey}T00:00:00Z`) > 3 * DAY) return { status: 'UNKNOWN', observedAt: cache.lastSuccess, summary: `GDELT 對「${label}」最近沒有可用的報導量資料（最新 ${latestKey || '無'}）。`, sources: [src(cache)] };
  const hist = keys.filter(k => k < latestKey && now - Date.parse(`${k}T00:00:00Z`) <= 31 * DAY).map(k => series[k]);
  if (hist.length < 15) return { status: 'UNKNOWN', observedAt: cache.lastSuccess, summary: `GDELT 報導量基線累積中（${hist.length} 天，需 15 天以上）。`, sources: [src(cache)] };
  const current = series[latestKey], p90 = quantile(hist, 0.9), median = quantile(hist, 0.5);
  const trig = current > p90 && current >= 2 * median && current > 0;
  return { status: trig ? 'TRIGGERED' : 'CLEAR', observedAt: `${latestKey}T12:00:00Z`, value: Math.round(current * 1000) / 1000, unit: '% 全球報導',
    baseline: { p90: Math.round(p90 * 1000) / 1000, median: Math.round(median * 1000) / 1000, windowDays: 30, samples: hist.length },
    summary: `${latestKey} 全球新聞對「${label}」的報導量強度 ${current.toFixed(3)}%（前 30 天 P90 ${p90.toFixed(3)}%、中位數 ${median.toFixed(3)}%）${trig ? '，關注度異常升高' : '，在常態範圍內'}。報導量是反應性訊號，不等於事件已證實。`,
    sources: [src(cache, latestKey)] };
}
const src = (cache, date) => ({ url: 'https://www.gdeltproject.org/', publisher: 'GDELT Project（全球新聞資料庫）', sourceClass: 'INDEPENDENT_MEDIA', publishedAt: date ? `${date}T12:00:00Z` : cache.lastSuccess });

module.exports = { refreshGdelt, parseTimeline, assessGdelt, readCache, CACHE, QUERIES, API };
