// 防空疏散避難設施：從內政部警政署資料（經 kiang/npa.gov.tw 整理成各縣市 GeoJSON）轉成網站用的小檔。
// 依 0.1 度方格切檔（約 11 公里），網頁只下載使用者附近的幾格；另產生縣市／鄉鎮市區索引。
// 每 30 天更新一次即可：node scripts/build_shelters.js [--force]
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'research', 'source_cache', 'shelters');
const SRC = 'https://kiang.github.io/npa.gov.tw/json/';
const COUNTIES = ['臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市', '基隆市', '新竹市', '嘉義市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'];
const tileKey = (lat, lon) => `${Math.floor(lat * 10)}_${Math.floor(lon * 10)}`;

// 一筆 GeoJSON feature → [緯度, 經度, 地址, 地下樓層, 可容納人數, 類別]
function compact(f) {
  const p = f?.properties || {}, c = f?.geometry?.coordinates || [];
  let [lon, lat] = c;
  if (!(Number.isFinite(lat) && Number.isFinite(lon)) && p['緯經度']) [lat, lon] = String(p['緯經度']).split(',').map(Number);
  if (!(lat > 21 && lat < 27 && lon > 118 && lon < 123)) return null; // 不在台澎金馬範圍內的座標視為錯誤
  const cap = Math.round(Number(p['可容納人數']) || 0);
  return [Number(lat.toFixed(5)), Number(lon.toFixed(5)), String(p['地址'] || '').trim().slice(0, 80), String(p['地下樓層數'] || '').trim().slice(0, 8), cap, String(p['類別'] || '').trim().slice(0, 12)];
}
const districtOf = addr => (String(addr).replace(/^台/, '臺').match(/^(.{2}[縣市])(.{1,4}?[區鄉鎮市])/) || []).slice(1).join('');

async function build({ force = false, fetchImpl = fetch, now = Date.now() } = {}) {
  const idxFile = path.join(OUT, 'index.json');
  try { const old = JSON.parse(fs.readFileSync(idxFile, 'utf8')); if (!force && now - Date.parse(old.updated) < 30 * 86400_000) return { skipped: true, total: old.total }; } catch { /* 第一次 */ }
  const tiles = new Map(), districts = new Map(), errors = [];
  let total = 0;
  for (const county of COUNTIES) {
    try {
      const res = await fetchImpl(SRC + encodeURIComponent(county) + '.json', { signal: AbortSignal.timeout(120000), headers: { 'User-Agent': 'Mozilla/5.0 WorldWarNews/2.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const gj = await res.json();
      for (const f of gj.features || []) {
        const row = compact(f); if (!row) continue;
        total++;
        const k = tileKey(row[0], row[1]);
        (tiles.get(k) || tiles.set(k, []).get(k)).push(row);
        const d = districtOf(row[2]) || county;
        const s = districts.get(d) || { lat: 0, lon: 0, n: 0, cap: 0 };
        s.lat += row[0]; s.lon += row[1]; s.n++; s.cap += row[4];
        districts.set(d, s);
      }
    } catch (e) { errors.push(`${county}：${e.message}`); }
  }
  if (!total) throw new Error(`沒有取得任何避難設施資料：${errors.join('；')}`);
  // 先寫到暫存資料夾，全部成功再替換，避免網頁讀到一半的資料
  const tmp = `${OUT}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  for (const [k, rows] of tiles) fs.writeFileSync(path.join(tmp, `t_${k}.json`), JSON.stringify(rows));
  const index = { updated: new Date(now).toISOString(), total, tiles: [...tiles.keys()], errors,
    source: '內政部警政署防空疏散避難設施（adr.npa.gov.tw），經 kiang/npa.gov.tw 整理',
    districts: Object.fromEntries([...districts].sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant')).map(([d, s]) => [d, [Number((s.lat / s.n).toFixed(4)), Number((s.lon / s.n).toFixed(4)), s.n, s.cap]])) };
  fs.writeFileSync(path.join(tmp, 'index.json'), JSON.stringify(index));
  fs.rmSync(OUT, { recursive: true, force: true }); fs.renameSync(tmp, OUT);
  return { total, tiles: tiles.size, districts: districts.size, errors };
}

if (require.main === module) build({ force: process.argv.includes('--force') }).then(r => console.log(JSON.stringify(r))).catch(e => { console.error(e.message); process.exit(1); });
module.exports = { build, compact, districtOf, tileKey, OUT };
