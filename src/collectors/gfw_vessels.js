// Global Fishing Watch（GFW）4Wings 報表 API：Sentinel-1 雷達衛星（SAR）船舶偵測。
// 用途：台海周邊（金門、馬祖、澎湖、東沙、海峽中段）每次衛星過境偵測到的船數，以及「未對應到 AIS 訊號」的船數
// （沒開 AIS 的船：可能是海警、海上民兵、漁船或其他未廣播船隻；GFW 不判斷身分）。
// 雷達衛星每隔數天才過境一次，資料延遲約 3–5 天；基準以「過去各次過境」比較，不是逐日。
// 需要 .env 的 GFW_TOKEN（非商業用途免費）；公開呈現須註明 Global Fishing Watch。
const fs = require('fs');
const path = require('path');

const API = 'https://gateway.api.globalfishingwatch.org/v3/4wings/report';
const PAGE = 'https://globalfishingwatch.org/map';
const DATASET = 'public-global-sar-presence:latest';
const CACHE = path.join(__dirname, '../../research/source_cache/gfw_vessels.json');
const HOUR = 3600_000, DAY = 24 * HOUR;
const REGIONS = {
  kinmen: { name: '金門周邊', bbox: [118.0, 24.2, 118.7, 24.7] },
  matsu: { name: '馬祖周邊', bbox: [119.7, 25.9, 120.6, 26.4] },
  penghu: { name: '澎湖周邊', bbox: [119.2, 23.1, 119.9, 23.9] },
  pratas: { name: '東沙周邊', bbox: [116.3, 20.4, 117.1, 21.0] },
  strait_mid: { name: '海峽中段（新竹—平潭間）', bbox: [119.6, 24.6, 120.6, 25.4] }
};
const MIN_PASSES = 8;     // 至少 8 次過境紀錄才判定
const MIN_DARK = 20;      // 單次過境未開 AIS 船至少 20 艘才可能觸發

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { regions: {} }; } }
function writeCache(data, file = CACHE) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, file); }
const polygon = ([w, s, e, n]) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
const ymd = ms => new Date(ms).toISOString().slice(0, 10);

// 回傳 { 'YYYY-MM-DD': { total, chn } }（依日期加總各船旗）
function sumByDate(json) {
  if (!Array.isArray(json?.entries)) throw new Error('GFW 回應格式改變');
  const rows = json.entries.length ? Object.values(json.entries[0] || {})[0] || [] : []; // 區域內沒有任何偵測時為空
  if (!Array.isArray(rows)) throw new Error('GFW 回應格式改變');
  const out = {};
  for (const r of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) continue;
    const d = (out[r.date] ||= { total: 0, chn: 0 });
    const n = Number(r.detections) || 0;
    d.total += n; if (r.flag === 'CHN') d.chn += n;
  }
  return out;
}

async function report(bbox, start, end, { token, fetchImpl, dark }) {
  const qs = new URLSearchParams({ 'spatial-resolution': 'LOW', 'temporal-resolution': 'DAILY', 'datasets[0]': DATASET, 'date-range': `${start},${end}`, format: 'JSON', 'spatial-aggregation': 'true', 'group-by': 'FLAG' });
  if (dark) qs.set('filters[0]', "matched='false'");
  const res = await fetchImpl(`${API}?${qs}`, { method: 'POST', signal: AbortSignal.timeout(90000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'WordWarNews/2.0 (personal research bot)' }, body: JSON.stringify({ geojson: polygon(bbox) }) });
  if (res.status === 401 || res.status === 403) throw new Error(`GFW 金鑰無效或權限不足（HTTP ${res.status}）`);
  if (!res.ok) throw new Error(`GFW HTTP ${res.status}`);
  return sumByDate(await res.json());
}

let inFlight = null;
function refreshGfwVessels(options = {}) { if (!inFlight) inFlight = collect(options).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now(), token = process.env.GFW_TOKEN, days = 90 } = {}) {
  const cache = readCache(file);
  if (!token) { Object.assign(cache, { status: 'NOT_CONFIGURED', error: '未設定 GFW_TOKEN' }); return cache; }
  if (!force && cache.lastAttempt && now - Date.parse(cache.lastAttempt) < 12 * HOUR) return cache;
  cache.lastAttempt = new Date(now).toISOString();
  try {
    // 第一次抓 90 天建立基準，之後只補最近 21 天（GFW 會補登延遲的過境資料）
    const start = ymd(now - (cache.lastSuccess ? 21 : days) * DAY), end = ymd(now);
    const regions = cache.regions || {};
    const failed = [];
    for (const [id, r] of Object.entries(REGIONS)) {
      let all, dark;
      try { all = await report(r.bbox, start, end, { token, fetchImpl, dark: false }); dark = await report(r.bbox, start, end, { token, fetchImpl, dark: true }); }
      catch (e) { if (/金鑰/.test(e.message)) throw e; failed.push(`${r.name}：${e.message}`); continue; }
      const passes = regions[id]?.passes || {};
      for (const [date, v] of Object.entries(all)) passes[date] = { total: v.total, chn: v.chn, dark: dark[date]?.total || 0 };
      for (const d of Object.keys(passes)) if (now - Date.parse(`${d}T00:00:00Z`) > 120 * DAY) delete passes[d];
      regions[id] = { name: r.name, passes };
    }
    if (failed.length === Object.keys(REGIONS).length) throw new Error(failed.join('；'));
    Object.assign(cache, { regions, status: failed.length ? 'PARTIAL' : 'ONLINE', lastSuccess: new Date(now).toISOString(), error: failed.length ? failed.join('；').slice(0, 200) : null });
  } catch (e) { Object.assign(cache, { status: 'DEGRADED', error: String(e.message || e).slice(0, 200) }); }
  writeCache(cache, file);
  return cache;
}

// 偵測 10 艘以上卻「全部」未對應到 AIS、也沒有任何船旗：GFW 尚未對這次過境做 AIS 比對（實測會週期性出現），不能當成全部關閉 AIS
const matched = p => !(p.total >= 10 && p.dark >= 0.98 * p.total);
function quantile(values, q) { const s = [...values].sort((a, b) => a - b); return s[Math.max(0, Math.ceil(q * s.length) - 1)]; }
// 每個區域最近一次過境（10 天內）的狀態：地圖與指標共用。只有「完成 AIS 比對」的過境才比較未開 AIS 船數
function regionStatus(cache, now = Date.now()) {
  const out = [];
  for (const [id, r] of Object.entries(cache?.regions || {})) {
    const dates = Object.keys(r.passes || {}).sort();
    const latest = dates.filter(d => now - Date.parse(`${d}T00:00:00Z`) <= 10 * DAY).pop();
    if (!latest) continue;
    const L = r.passes[latest], ok = matched(L);
    const past = dates.filter(d => d < latest && matched(r.passes[d])).map(d => r.passes[d].dark);
    const p95 = past.length >= MIN_PASSES ? quantile(past, 0.95) : null;
    out.push({ id, name: r.name, bbox: REGIONS[id]?.bbox || null, date: latest, total: L.total, dark: ok ? L.dark : null, chn: L.chn, matched: ok, p95,
      hot: ok && p95 !== null && L.dark > p95 && L.dark >= MIN_DARK });
  }
  return out;
}
// 指標：任一區最近一次過境的未開 AIS 船數高於該區過去過境 P95（且 ≥20 艘）
function assessGfwVessels(cache, now = Date.now()) {
  if (!cache?.lastSuccess || now - Date.parse(cache.lastSuccess) > 48 * HOUR) return null;
  const src = [{ url: PAGE, publisher: 'Global Fishing Watch（Sentinel-1 雷達衛星船舶偵測）', sourceClass: 'INDEPENDENT_MEDIA', publishedAt: cache.lastSuccess }];
  const rows = [];
  let hit = null;
  for (const s of regionStatus(cache, now)) {
    const d = s.date.slice(5).replace('-', '/');
    if (!s.matched) { rows.push(`${s.name} ${d} 偵測 ${s.total} 艘（這次過境尚未完成 AIS 比對）`); continue; }
    rows.push(`${s.name} ${d} 偵測 ${s.total} 艘（未開 AIS ${s.dark}${s.chn ? `、中國船旗 ${s.chn}` : ''}${s.p95 !== null ? `；過去 P95 ${s.p95}` : ''}）`);
    if (s.hot && (!hit || s.dark - s.p95 > hit.excess)) hit = { name: s.name, date: s.date, dark: s.dark, p95: s.p95, excess: s.dark - s.p95 };
  }
  if (!rows.length) return { status: 'UNKNOWN', observedAt: cache.lastSuccess, summary: '近 10 天台海周邊各區沒有雷達衛星過境資料（資料延遲約 3–5 天）。', sources: src };
  const accumulating = Object.values(cache.regions || {}).every(r => Object.keys(r.passes || {}).length <= MIN_PASSES) ? '基準累積中。' : '';
  // 沒有任何一區完成 AIS 比對時，不能說未開 AIS 船在常態內
  const matched = regionStatus(cache, now).some(s => s.matched);
  return { status: hit ? 'TRIGGERED' : matched ? 'CLEAR' : 'UNKNOWN', observedAt: cache.lastSuccess,
    summary: `${hit ? `${hit.name} ${hit.date.slice(5).replace('-', '/')} 未開 AIS 船 ${hit.dark} 艘，高於過去過境 P95（${hit.p95}）｜` : ''}${rows.join('；')}。${accumulating}未開 AIS 不代表軍事船隻。`, sources: src };
}

module.exports = { regionStatus, refreshGfwVessels, assessGfwVessels, sumByDate, readCache, CACHE, REGIONS, PAGE };
