// 國界多邊形：Natural Earth 1:10m（公有領域），經 world-atlas@2.0.2 的 TopoJSON 取得並快取。
// 用途：戰場圖「烏軍控制」底色＝烏克蘭國界內扣除俄軍控制區。精度約 250 m，僅供示意。
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '../research/source_cache/natural_earth');
const TOPO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-10m.json';
const CREDIT = '國界：Natural Earth（公有領域）';

// TopoJSON → [[ring, ...], ...]（每個 ring 為 [lon,lat] 陣列）
function decodeCountry(topo, id) {
  const geom = topo.objects.countries.geometries.find(g => String(g.id) === String(id));
  if (!geom) return null;
  const { scale = [1, 1], translate = [0, 0] } = topo.transform || {};
  const arcs = topo.arcs.map(arc => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
  });
  const ringOf = idxs => {
    const ring = [];
    for (const i of idxs) {
      const a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
      ring.push(...(ring.length ? a.slice(1) : a));
    }
    return ring;
  };
  const polys = geom.type === 'Polygon' ? [geom.arcs] : geom.type === 'MultiPolygon' ? geom.arcs : [];
  return polys.map(p => p.map(ringOf));
}

let memo = null;
// 只讀本機快取；沒有快取時回傳 null（由 ensureBorders 下載）
function ukraineBorder() {
  if (memo) return memo;
  const file = path.join(DIR, 'ukraine.json');
  try { memo = JSON.parse(fs.readFileSync(file, 'utf8')); return memo; } catch { /* 尚未產生 */ }
  try {
    const topo = JSON.parse(fs.readFileSync(path.join(DIR, 'countries-10m.json'), 'utf8'));
    memo = decodeCountry(topo, 804);
    if (memo) fs.writeFileSync(file, JSON.stringify(memo));
    return memo;
  } catch { return null; }
}

async function ensureBorders({ fetchImpl = fetch } = {}) {
  if (ukraineBorder()) return true;
  const res = await fetchImpl(TOPO_URL, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Natural Earth HTTP ${res.status}`);
  const text = await res.text();
  JSON.parse(text);
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, 'countries-10m.json'), tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text); fs.renameSync(tmp, file);
  return !!ukraineBorder();
}

module.exports = { decodeCountry, ukraineBorder, ensureBorders, CREDIT };
