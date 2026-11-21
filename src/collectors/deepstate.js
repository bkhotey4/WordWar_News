// DeepStateMap（deepstatemap.live）公開控制區資料與每日更新說明。
// 用途：烏俄戰場圖的控制區、7 日變化面積，以及更新說明中附座標的推進／收復地點。
// DeepState 為烏克蘭團隊依公開影像與戰報整理，圖上一律標示出處；它不是官方或第三方獨立證實。
const fs = require('fs');
const path = require('path');

const BASE = 'https://deepstatemap.live';
const DIR = path.join(__dirname, '../../research/source_cache/deepstate');
const DAY = 86400_000;
const OCCUPIED = /geoJSON\.status\.occupied|geoJSON\.territories\.(crimea|ordlo|tuzla)\b/;
const CONTESTED = /geoJSON\.status\.unknown/;

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

// FeatureCollection → 依類別分好的多邊形（[[ [lon,lat], ... ], ...] 環陣列）
function polygonsOf(fc, pattern) {
  const out = [];
  for (const f of fc?.features || []) {
    const name = f?.properties?.name || '', g = f?.geometry;
    if (!pattern.test(name) || !g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const p of polys) out.push(p.map(ring => ring.map(c => [Number(c[0]), Number(c[1])]).filter(c => c.every(Number.isFinite))));
  }
  return out;
}

// 更新說明（英文版）中的地點：「The enemy advanced near X」「liberated / regained control near Y」
function parseUpdates(list) {
  const events = [];
  for (const item of list || []) {
    const text = String(item.descriptionEn || '');
    const at = Date.parse(item.createdAt);
    if (!text || !Number.isFinite(at)) continue;
    for (const sentence of text.split(/(?<=\.)\s+/)) {
      const ru = /\b(enemy|russian)\b/i.test(sentence) && /\b(advanced|occupied|captured|seized)\b/i.test(sentence);
      const ua = /\b(liberated|regained|cleared|pushed back|restored)\b/i.test(sentence);
      if (ru === ua) continue; // 無法判斷或兩者皆有時不標
      const links = [...sentence.matchAll(/<a href="[^"]*#(\d+)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)"[^>]*>([^<]+)<\/a>/g)];
      const named = [...sentence.matchAll(/<a href="[^"]*"[^>]*>([^<]+)<\/a>/g)].map(m => m[1].trim());
      for (const m of links) events.push({ side: ru ? 'RU' : 'UA', name: m[4].trim(), lat: Number(m[2]), lon: Number(m[3]), at: new Date(at).toISOString(), updateId: item.id });
      for (const name of named) if (!links.some(l => l[4].trim() === name)) events.push({ side: ru ? 'RU' : 'UA', name, lat: null, lon: null, at: new Date(at).toISOString(), updateId: item.id });
    }
  }
  return events;
}

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'WordWarNews/2.0 (personal research bot)' } });
  if (!res.ok) throw new Error(`DeepState HTTP ${res.status}`);
  return res.json();
}

let inFlight = null;
function refreshDeepState(options = {}) { if (!inFlight) inFlight = collect(options).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, dir = DIR, fetchImpl = fetch, now = Date.now() } = {}) {
  const stateFile = path.join(dir, 'state.json');
  const state = readJson(stateFile, {});
  if (!force && state.lastAttempt && now - Date.parse(state.lastAttempt) < 3 * 3600_000) return state;
  state.lastAttempt = new Date(now).toISOString();
  try {
    const list = await getJson(`${BASE}/api/history/public`, fetchImpl);
    if (!Array.isArray(list) || !list.length) throw new Error('DeepState list format changed');
    const sorted = list.filter(x => Number.isFinite(Date.parse(x.createdAt))).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const latest = sorted.at(-1);
    const weekAgo = [...sorted].reverse().find(x => Date.parse(x.createdAt) <= Date.parse(latest.createdAt) - 7 * DAY) || sorted[0];
    for (const rec of [latest, weekAgo]) {
      const file = path.join(dir, `${rec.id}.json`);
      if (fs.existsSync(file)) continue;
      const fc = await getJson(`${BASE}/api/history/${rec.id}/geojson`, fetchImpl);
      if (!Array.isArray(fc?.features)) throw new Error('DeepState geojson format changed');
      writeJson(file, fc);
    }
    // 只保留目前用到的兩期，避免快取無限增長
    for (const f of fs.readdirSync(dir)) if (/^\d+\.json$/.test(f) && ![`${latest.id}.json`, `${weekAgo.id}.json`].includes(f)) fs.rmSync(path.join(dir, f), { force: true });
    const recent = sorted.filter(x => Date.parse(x.createdAt) > Date.parse(weekAgo.createdAt));
    Object.assign(state, { status: 'ONLINE', lastSuccess: new Date(now).toISOString(), error: null,
      latest: { id: latest.id, createdAt: latest.createdAt }, weekAgo: { id: weekAgo.id, createdAt: weekAgo.createdAt },
      updates: recent.map(({ id, createdAt, descriptionEn }) => ({ id, createdAt, descriptionEn })) });
  } catch (e) {
    Object.assign(state, { status: 'DEGRADED', error: e.message });
  }
  writeJson(stateFile, state);
  return state;
}

function loadDeepState(dir = DIR) {
  const state = readJson(path.join(dir, 'state.json'), null);
  if (!state?.latest) return null;
  const now = readJson(path.join(dir, `${state.latest.id}.json`), null), before = readJson(path.join(dir, `${state.weekAgo.id}.json`), null);
  if (!now) return null;
  return { state, occupied: polygonsOf(now, OCCUPIED), contested: polygonsOf(now, CONTESTED),
    occupiedBefore: before ? polygonsOf(before, OCCUPIED) : null, events: parseUpdates(state.updates) };
}

module.exports = { refreshDeepState, loadDeepState, polygonsOf, parseUpdates, OCCUPIED, CONTESTED, DIR };
