// 地名轉座標：OpenStreetMap Nominatim（公開服務，依其使用政策：每秒最多 1 次、附識別 User-Agent、結果快取）。
// 只接受落在該戰區地圖範圍內的結果，找不到就回傳 null，不猜位置。
const fs = require('fs');
const path = require('path');

const CACHE = path.join(__dirname, '../research/geocode_cache.json');
const COUNTRIES = {
  ukraine_front: 'ua,ru', taiwan_strait: 'tw,cn,ph', iran_gulf: 'ir,om,ae', europe_security: 'pl,lt,lv,ee,by,ru,ro,md',
  middle_east: 'il,ps,lb,sy,eg', sudan: 'sd,ss', myanmar: 'mm', south_china_sea: 'ph,cn,vn,my', korea_peninsula: 'kp,kr,jp'
};
let last = 0;
function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } }
function writeCache(data, file = CACHE) { const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, file); }

async function geocode(query, theaterId, bbox, { fetchImpl = fetch, file = CACHE } = {}) {
  const key = `${theaterId}|${bbox.map(v => v.toFixed(2)).join(',')}|${query}`.toLowerCase();
  const cache = readCache(file);
  if (Object.hasOwn(cache, key)) return cache[key];
  const wait = 1100 - (Date.now() - last); if (wait > 0) await new Promise(r => setTimeout(r, wait));
  last = Date.now();
  const [w, s, e, n] = bbox;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&accept-language=en&countrycodes=${COUNTRIES[theaterId] || ''}&viewbox=${w},${n},${e},${s}&bounded=1&q=${encodeURIComponent(query)}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'WordWarNews/2.0 (personal research Discord bot)' } });
  if (!res.ok) throw new Error(`geocode HTTP ${res.status}`);
  const rows = await res.json();
  const hit = (Array.isArray(rows) ? rows : []).map(r => ({ lat: Number(r.lat), lon: Number(r.lon), name: r.display_name }))
    .find(r => Number.isFinite(r.lat) && Number.isFinite(r.lon) && r.lon >= w && r.lon <= e && r.lat >= s && r.lat <= n) || null;
  const out = hit ? { ...hit, basis: 'GAZETTEER_OSM' } : null;
  cache[key] = out; writeCache(cache, file);
  return out;
}
module.exports = { geocode, CACHE };
