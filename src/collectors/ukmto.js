// UKMTO（英國海事貿易行動辦公室）事件通報：官方 JSON，供美伊戰區「船舶事件」指標使用。
const fs = require('fs');
const path = require('path');

const API = 'https://sccd.royalnavy.mod.uk/api/ukmto/all';
const PAGE = 'https://www.ukmto.org/recent-incidents';
const CACHE = path.join(__dirname, '../../research/source_cache/ukmto_incidents.json');
const DAY = 86400_000;
// 波斯灣、荷莫茲海峽、阿曼灣（不含紅海與亞丁灣，那些屬胡塞武裝事件）
const GULF_BOX = { south: 22, north: 30.5, west: 47.5, east: 62.5 };

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { incidents: [] }; } }
function writeCache(data, file = CACHE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
}

function normalize(raw) {
  const occurredAt = Date.parse(raw?.utcDateOfIncident);
  if (!raw || !Number.isInteger(raw.incidentNumber) || !Number.isFinite(occurredAt) || typeof raw.incidentTypeName !== 'string') return null;
  const lat = Number(raw.locationLatitude), lon = Number(raw.locationLongitude);
  return {
    id: `${String(raw.incidentIssuer || 'UKMTO').replace(/[^A-Za-z]/g, '')}-${new Date(occurredAt).getUTCFullYear()}-${raw.incidentNumber}`,
    issuer: raw.incidentIssuer || 'UKMTO', number: raw.incidentNumber,
    occurredAt: new Date(occurredAt).toISOString(),
    createdAt: Number.isFinite(Date.parse(raw.utcDateCreated)) ? new Date(raw.utcDateCreated).toISOString() : null,
    type: raw.incidentTypeName.trim(), place: String(raw.place || '').trim(),
    lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null,
    vesselType: String(raw.vesselType || '').trim(),
    details: String(raw.otherDetails || '').replace(/\r/g, '').trim().slice(0, 1500),
    url: PAGE
  };
}

function inGulf(i) {
  if (Number.isFinite(i.lat) && Number.isFinite(i.lon))
    return i.lat >= GULF_BOX.south && i.lat <= GULF_BOX.north && i.lon >= GULF_BOX.west && i.lon <= GULF_BOX.east;
  return /Hormuz|Gulf of Oman|Arabian Gulf|Persian Gulf/i.test(i.place);
}
// 攻擊、劫持，或「可疑活動」但內文描述船隻被擊中、起火、爆炸、被扣押
function hostile(i) {
  if (/^(Attack|Hijack)$/i.test(i.type)) return true;
  if (/Advisory/i.test(i.type)) return false;
  return /struck|projectile|explosion|fire|missile|drone|boarded|seized|hijack/i.test(i.details);
}

let inFlight = null;
function refreshUkmto(options = {}) { if (!inFlight) inFlight = collect(options).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now() } = {}) {
  const cache = readCache(file);
  if (!force && cache.lastAttempt && now - Date.parse(cache.lastAttempt) < 30 * 60_000) return cache;
  cache.lastAttempt = new Date(now).toISOString();
  try {
    const res = await fetchImpl(API, { signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`UKMTO HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('UKMTO format changed');
    const items = rows.map(normalize).filter(Boolean);
    if (rows.length && !items.length) throw new Error('UKMTO fields changed');
    const byId = new Map((cache.incidents || []).map(i => [i.id, i]));
    for (const i of items) {
      const prev = byId.get(i.id);
      byId.set(i.id, { ...i, firstSeenAt: prev?.firstSeenAt || new Date(now).toISOString() });
    }
    const oldestInFeed = items.reduce((m, i) => (!m || i.occurredAt < m ? i.occurredAt : m), null);
    cache.coverageStart = [cache.coverageStart, oldestInFeed].filter(Boolean).sort()[0] || null;
    cache.incidents = [...byId.values()].filter(i => now - Date.parse(i.occurredAt) <= 400 * DAY)
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
    Object.assign(cache, { status: 'ONLINE', lastSuccess: new Date(now).toISOString(), apiUrl: API, error: null, count: items.length });
  } catch (e) {
    Object.assign(cache, { status: 'DEGRADED', error: e.message });
  }
  writeCache(cache, file);
  return cache;
}

function quantile(values, q) { const s = [...values].sort((a, b) => a - b); return s[Math.ceil(q * s.length) - 1]; }
// 近 7 天灣區敵對事件數，對比過去 60 天每日滾動 7 天數量的 P95
function assessUkmto(cache, now = Date.now()) {
  const result = { status: 'UNAVAILABLE', ruleVersion: 'ukmto-gulf-7d-p95-v1' };
  if (!cache?.lastSuccess) return result;
  if (now - Date.parse(cache.lastSuccess) > 48 * 3600_000) return { ...result, status: 'STALE' };
  const events = (cache.incidents || []).filter(i => inGulf(i) && hostile(i)).map(i => ({ ...i, t: Date.parse(i.occurredAt) })).filter(i => i.t <= now);
  const count = end => events.filter(e => e.t > end - 7 * DAY && e.t <= end).length;
  const current = count(now);
  const coverage = Date.parse(cache.coverageStart);
  const samples = [];
  for (let d = 1; d <= 60; d++) { const end = now - 7 * DAY - (d - 1) * DAY; if (end - 7 * DAY >= coverage) samples.push(count(end)); }
  const recent = events.filter(e => e.t > now - 7 * DAY).sort((a, b) => b.t - a.t);
  const base = { ...result, current, samples: samples.length, latest: recent[0] || null, recentIds: recent.map(e => e.id) };
  if (!Number.isFinite(coverage) || samples.length < 30) return { ...base, status: 'INSUFFICIENT_HISTORY' };
  const p95 = quantile(samples, 0.95);
  return { ...base, status: current > p95 ? 'ABOVE_HISTORICAL_P95' : 'WITHIN_HISTORICAL_RANGE', historicalP95: p95, baselineWindowDays: 60 };
}

module.exports = { refreshUkmto, normalize, inGulf, hostile, assessUkmto, readCache, CACHE, API };
