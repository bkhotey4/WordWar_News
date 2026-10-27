// Cloudflare Radar API：對台灣的 DDoS 攻擊流量（第 3／4 層與第 7 層）每日序列，以及 Cloudflare 標註的網路中斷事件。
// 需要免費的 Cloudflare 帳號 API Token（權限 Account.Radar:Read），放在 .env 的 CLOUDFLARE_RADAR_TOKEN；沒有 token 時此來源標為未設定，指標顯示無法判定。
// 用途：台海次要指標——網路攻擊常先於或伴隨軍事施壓（2022 年 8 月裴洛西訪台前對台 DDoS 即先暴增）。
// Radar 的時間序列是正規化數值（區間內最大值 = 1），所以只比較「當日 ÷ 前 27 天中位數」的倍數，不看絕對量。
const fs = require('fs');
const path = require('path');

const BASE = 'https://api.cloudflare.com/client/v4/radar';
const PAGE = 'https://radar.cloudflare.com/security-and-attacks/tw';
const CACHE = path.join(__dirname, '../../research/source_cache/cloudflare_radar.json');
const HOUR = 3600_000, DAY = 24 * HOUR;
const RATIO_THRESHOLD = 3;
const LOCATIONS = { taiwan_strait: 'TW' };

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { series: {} }; } }
function writeCache(data, file = CACHE) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, file); }

// {"result":{"serie_0":{"timestamps":[...],"values":["0.5",...]}}} → { 'YYYY-MM-DD': number }
function parseSeries(json) {
  if (json?.success === false) throw new Error(json.errors?.map(e => e.message).join('；') || 'Radar API error');
  const serie = Object.values(json?.result || {}).find(v => v && Array.isArray(v.timestamps) && Array.isArray(v.values));
  if (!serie) throw new Error('Radar series format changed');
  const out = {};
  serie.timestamps.forEach((t, i) => { const d = String(t).slice(0, 10); const v = Number(serie.values[i]); if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(v)) out[d] = v; });
  return out;
}
function parseOutages(json) {
  if (json?.success === false) throw new Error(json.errors?.map(e => e.message).join('；') || 'Radar API error');
  return (json?.result?.annotations || []).map(a => ({ id: a.id, startDate: a.startDate, endDate: a.endDate || null, description: String(a.description || '').slice(0, 200), scope: a.scope || null, cause: a.outage?.outageCause || null, locations: a.locations || [] }));
}

let inFlight = null;
function refreshCloudflareRadar(options = {}) { if (!inFlight) inFlight = collect(options).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now(), token = process.env.CLOUDFLARE_RADAR_TOKEN || process.env.CLOUDFLARE_API_TOKEN } = {}) {
  const cache = readCache(file);
  cache.series = cache.series || {};
  if (!force && cache.lastAttempt && now - Date.parse(cache.lastAttempt) < 3 * HOUR) return cache;
  cache.lastAttempt = new Date(now).toISOString();
  if (!token) { Object.assign(cache, { status: 'NOT_CONFIGURED', error: '未設定 CLOUDFLARE_RADAR_TOKEN（Cloudflare 免費帳號 → My Profile → API Tokens → 建立 Token，權限 Account.Radar:Read）' }); writeCache(cache, file); return cache; }
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 WordWarNews/2.0 (personal research bot)' };
  const errors = []; let ok = 0;
  for (const [theater, loc] of Object.entries(LOCATIONS)) {
    for (const [kind, pathPart] of [['layer3', 'attacks/layer3/timeseries'], ['layer7', 'attacks/layer7/timeseries']]) {
      try {
        const res = await fetchImpl(`${BASE}/${pathPart}?location=${loc}&dateRange=28d&aggInterval=1d&format=json`, { signal: AbortSignal.timeout(30000), headers });
        const json = await res.json();
        if (!res.ok) throw new Error(`HTTP ${res.status} ${json?.errors?.[0]?.message || ''}`.trim());
        const days = parseSeries(json);
        cache.series[`${theater}:${kind}`] = days; ok++;
      } catch (e) { errors.push(`${theater} ${kind}: ${e.message}`); }
    }
    try {
      const res = await fetchImpl(`${BASE}/annotations/outages?location=${loc}&dateRange=28d&limit=20&format=json`, { signal: AbortSignal.timeout(30000), headers });
      const json = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cache.outages = parseOutages(json);
    } catch (e) { errors.push(`${theater} outages: ${e.message}`); }
  }
  Object.assign(cache, ok ? { status: errors.length ? 'PARTIAL' : 'ONLINE', lastSuccess: new Date(now).toISOString(), error: errors.join('；') || null } : { status: 'DEGRADED', error: errors.join('；') || '無資料' });
  writeCache(cache, file);
  return cache;
}

const median = values => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
// 第 3／4 層或第 7 層：最新一天 ÷ 前 27 天中位數 ≥ 3 且該日為區間內最高 → 觸發
function assessRadar(cache, theaterId, now = Date.now()) {
  if (!cache || cache.status === 'NOT_CONFIGURED' || !cache.lastSuccess || now - Date.parse(cache.lastSuccess) > 24 * HOUR) return null;
  const parts = [];
  let trig = false, worst = null;
  for (const kind of ['layer3', 'layer7']) {
    const series = cache.series?.[`${theaterId}:${kind}`]; if (!series) continue;
    const keys = Object.keys(series).sort(); if (keys.length < 10) continue;
    const latestKey = keys.at(-1), current = series[latestKey], hist = keys.slice(0, -1).map(k => series[k]);
    const med = median(hist), ratio = med > 0 ? current / med : (current > 0 ? Infinity : 0);
    const hit = ratio >= RATIO_THRESHOLD && current >= Math.max(...hist, current) * 0.999;
    parts.push(`${kind === 'layer3' ? '網路層' : '應用層'} ${latestKey} 為前 27 天中位數的 ${Number.isFinite(ratio) ? ratio.toFixed(1) : '∞'} 倍`);
    if (hit) { trig = true; if (!worst || ratio > worst.ratio) worst = { kind, latestKey, ratio }; }
  }
  if (!parts.length) return null;
  const outages = (cache.outages || []).filter(o => now - Date.parse(o.startDate) <= 7 * DAY);
  const observedAt = worst ? `${worst.latestKey}T12:00:00Z` : cache.lastSuccess;
  return { status: trig ? 'TRIGGERED' : 'CLEAR', observedAt, value: worst ? Math.round(worst.ratio * 10) / 10 : null, unit: '倍',
    summary: `Cloudflare Radar 對台灣 DDoS 攻擊流量：${parts.join('；')}${trig ? '，攻擊流量異常升高' : '，在常態範圍內'}${outages.length ? `；近 7 天 Cloudflare 標註網路中斷 ${outages.length} 起` : ''}。`.slice(0, 300),
    sources: [{ url: PAGE, publisher: 'Cloudflare Radar', sourceClass: 'INDEPENDENT_MEDIA', publishedAt: observedAt }] };
}

module.exports = { refreshCloudflareRadar, parseSeries, parseOutages, assessRadar, readCache, CACHE, RATIO_THRESHOLD };
