// 證交所三大法人買賣金額（官方開放資料，每個交易日收盤後公布）：外資及陸資的買賣差額。
// 用途：台海次要指標的補充——外資單日大額淨賣超常先於股價反映風險；只看「當日淨額 ÷ 過去 60 個交易日的日波動」的 z 值。
// 市場會因各種原因波動，所以只是次要指標，須搭配軍事指標；不構成投資建議。
const fs = require('fs');
const path = require('path');

const API = 'https://www.twse.com.tw/rwd/zh/fund/BFI82U';
const PAGE = 'https://www.twse.com.tw/zh/trading/foreign/bfi82u.html';
const CACHE = path.join(__dirname, '../../research/source_cache/twse_flows.json');
const HOUR = 3600_000, DAY = 24 * HOUR;
const BASELINE_DAYS = 60, Z_THRESHOLD = -2.5, ABS_THRESHOLD = -60e9; // 淨賣超 600 億元以上也算異常
const UA = { 'User-Agent': 'Mozilla/5.0 WordWarNews/2.0 (personal research bot)' };

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { days: {} }; } }
function writeCache(data, file = CACHE) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, file); }
const ymd = ms => new Date(ms + 8 * HOUR).toISOString().slice(0, 10).replace(/-/g, '');
const num = s => Number(String(s).replace(/,/g, ''));

// 回傳 { date, foreignNet, totalNet } 或 null（非交易日）
function parseDay(json) {
  if (json?.stat !== 'OK' || !Array.isArray(json.data)) return null;
  const row = json.data.find(r => /^外資及陸資/.test(String(r[0]).trim())); // 「外資及陸資(不含外資自營商)」
  const total = json.data.find(r => /^合計/.test(r[0]));
  if (!row || !Number.isFinite(num(row[3]))) return null;
  return { date: json.date, foreignNet: num(row[3]), foreignBuy: num(row[1]), foreignSell: num(row[2]), totalNet: total ? num(total[3]) : null };
}

let inFlight = null;
function refreshTwseFlows(options = {}) { if (!inFlight) inFlight = collect(options).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now(), backfillDays = 100 } = {}) {
  const cache = readCache(file);
  cache.days = cache.days || {};
  if (!force && cache.lastAttempt && now - Date.parse(cache.lastAttempt) < 2 * HOUR) return cache;
  cache.lastAttempt = new Date(now).toISOString();
  const errors = [];
  // 要查的日期：今天往回 backfillDays 個日曆日中，還沒有紀錄也沒標為非交易日的；每次最多 25 個請求
  const todo = [];
  for (let d = 0; d <= backfillDays; d++) { const key = ymd(now - d * DAY); if (!cache.days[key] && !(cache.nonTrading || []).includes(key)) todo.push(key); }
  cache.nonTrading = (cache.nonTrading || []).filter(k => now - Date.parse(`${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6)}T00:00:00+08:00`) <= 200 * DAY);
  let fetched = 0;
  for (const key of todo.slice(0, 25)) {
    try {
      const res = await fetchImpl(`${API}?response=json&dayDate=${key}&type=day`, { signal: AbortSignal.timeout(20000), headers: UA });
      if (!res.ok) throw new Error(`TWSE HTTP ${res.status}`);
      const day = parseDay(await res.json());
      if (day) { cache.days[key] = { ...day, fetchedAt: new Date(now).toISOString() }; fetched++; }
      else if (key !== ymd(now)) cache.nonTrading.push(key); // 今天可能還沒收盤，不標為非交易日
    } catch (e) { errors.push(`${key}: ${e.message}`); if (errors.length >= 3) break; }
    await new Promise(r => setTimeout(r, 400)); // 官方網站禮貌間隔
  }
  for (const key of Object.keys(cache.days)) if (now - Date.parse(`${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6)}T00:00:00+08:00`) > 400 * DAY) delete cache.days[key];
  const keys = Object.keys(cache.days).sort();
  Object.assign(cache, keys.length && errors.length < 3 ? { status: 'ONLINE', lastSuccess: new Date(now).toISOString(), error: errors.join('；') || null, latestDate: keys.at(-1), tradingDays: keys.length, fetched }
    : { status: 'DEGRADED', error: errors.join('；') || '無資料' });
  writeCache(cache, file);
  return cache;
}

// 最新交易日外資淨額的 z 值（對比前 60 個交易日）；z ≤ −2.5 或淨賣超 ≥ 600 億 → 觸發
function assessTwseFlows(cache, now = Date.now()) {
  if (!cache?.lastSuccess || now - Date.parse(cache.lastSuccess) > 72 * HOUR) return null;
  const keys = Object.keys(cache.days || {}).sort();
  if (keys.length < 20) return { status: 'UNKNOWN', observedAt: cache.lastSuccess, summary: `外資買賣超資料累積中（${keys.length} 個交易日，需 20 日以上才判定）。`, sources: [source(cache)] };
  const latestKey = keys.at(-1), latest = cache.days[latestKey];
  const latestDate = `${latestKey.slice(0, 4)}-${latestKey.slice(4, 6)}-${latestKey.slice(6)}`;
  if (now - Date.parse(`${latestDate}T14:00:00+08:00`) > 5 * DAY) return { status: 'UNKNOWN', observedAt: cache.lastSuccess, summary: `最新外資資料為 ${latestDate}，超過 5 天未更新，暫不判定。`, sources: [source(cache)] };
  const hist = keys.slice(-BASELINE_DAYS - 1, -1).map(k => cache.days[k].foreignNet);
  const mean = hist.reduce((s, v) => s + v, 0) / hist.length, sd = Math.sqrt(hist.reduce((s, v) => s + (v - mean) ** 2, 0) / hist.length) || 1;
  const z = (latest.foreignNet - mean) / sd;
  const trig = z <= Z_THRESHOLD || latest.foreignNet <= ABS_THRESHOLD;
  const fmt = v => `${v < 0 ? '−' : '+'}${(Math.abs(v) / 1e8).toFixed(1)} 億`;
  return { status: trig ? 'TRIGGERED' : 'CLEAR', observedAt: `${latestDate}T14:00:00+08:00`, value: Math.round(latest.foreignNet / 1e8) / 10, unit: '十億元',
    baseline: { mean: Math.round(mean / 1e8) / 10, sd: Math.round(sd / 1e8) / 10, samples: hist.length, z: Math.round(z * 100) / 100 },
    summary: `${latestDate} 外資及陸資淨買賣超 ${fmt(latest.foreignNet)}（前 ${hist.length} 個交易日平均 ${fmt(mean)}，z＝${z.toFixed(2)}）${trig ? '，單日淨賣超異常' : '，在常態範圍內'}；市場因素多元，不構成投資建議。`,
    sources: [source(cache, latestDate)] };
}
const source = (cache, date) => ({ url: PAGE, publisher: '臺灣證券交易所（三大法人買賣金額統計）', sourceClass: 'OFFICIAL', publishedAt: date ? `${date}T14:00:00+08:00` : cache.lastSuccess });

module.exports = { refreshTwseFlows, parseDay, assessTwseFlows, readCache, CACHE, API, Z_THRESHOLD, ABS_THRESHOLD };
