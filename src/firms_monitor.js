/**
 * NASA FIRMS (Fire Information for Resource Management System) OSINT Module
 * Near Real-Time (NRT) Thermal Anomaly & Active Fire Telemetry from VIIRS/MODIS satellites
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_FILE = path.join(__dirname, '../public/data/firms_cache.json');
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache

// Target Theater Bounding Boxes [minLon, minLat, maxLon, maxLat]
const THEATER_BOUNDS = {
  ukraine_front: { name: '烏俄前線與邊境戰區', bbox: [32.0, 44.0, 41.0, 52.0] },
  taiwan_strait: { name: '台海與東南沿海演訓區', bbox: [117.0, 21.0, 124.0, 27.0] },
  middle_east: { name: '中東要地與紅海沿岸', bbox: [34.0, 12.0, 52.0, 36.0] }
};

/**
 * Parses raw NASA FIRMS CSV line
 * latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight
 */
function parseFirmsCsv(csvText, theaterKey = 'ukraine_front', now = Date.now()) {
  if (!csvText || typeof csvText !== 'string') return [];
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const latIdx = header.indexOf('latitude');
  const lonIdx = header.indexOf('longitude');
  const frpIdx = header.indexOf('frp');
  const dateIdx = header.indexOf('acq_date');
  const timeIdx = header.indexOf('acq_time');
  const confIdx = header.indexOf('confidence');
  const satIdx = header.indexOf('satellite');

  if ([latIdx,lonIdx,frpIdx,dateIdx,timeIdx].some(i=>i===-1) || !THEATER_BOUNDS[theaterKey]) return [];

  const targetKey = THEATER_BOUNDS[theaterKey] ? theaterKey : 'ukraine_front';
  const bounds = THEATER_BOUNDS[targetKey].bbox;
  const points = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    if (row.length <= Math.max(latIdx, lonIdx)) continue;

    const lat = parseFloat(row[latIdx]);
    const lon = parseFloat(row[lonIdx]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

    // Filter by bounding box
    if (lon < bounds[0] || lon > bounds[2] || lat < bounds[1] || lat > bounds[3]) continue;

    const frp = Number(row[frpIdx]);
    if (!row[frpIdx]?.trim() || !Number.isFinite(frp) || frp<0) continue;
    const acqDate = dateIdx !== -1 ? row[dateIdx] : '';
    const acqTime = timeIdx !== -1 ? (row[timeIdx] || '').padStart(4, '0') : '0000';
    const confidence = confIdx !== -1 ? row[confIdx] : 'nominal';
    const satellite = satIdx !== -1 ? row[satIdx] : 'VIIRS';

    // Build ISO timestamp
    let timestamp = null;
    if (acqDate && /^\d{4}-\d{2}-\d{2}$/.test(acqDate)) {
      const hh = acqTime.slice(0, 2);
      const mm = acqTime.slice(2, 4);
      timestamp = `${acqDate}T${hh}:${mm}:00.000Z`;
    }

    const observed=Date.parse(timestamp || '');
    if (!Number.isFinite(observed) || new Date(observed).toISOString()!==timestamp || observed>now || now-observed>86400000) continue;
    points.push({
      latitude: lat,
      longitude: lon,
      frp,
      confidence,
      satellite,
      timestamp,
      theater: targetKey
    });
  }

  return points;
}

/**
 * Clusters individual fire pixels into tactical thermal anomaly clusters (approx 15 km)
 */
function clusterHotspots(points, radiusKm = 15) {
  if (!Array.isArray(points) || !points.length) return [];

  // Protect event loop: cap points to highest FRP points to guarantee execution never stalls
  const safePoints = points.length > 1000
    ? [...points].sort((a, b) => (b.frp || 0) - (a.frp || 0)).slice(0, 1000)
    : points;

  const clusters = [];
  const visited = new Set();

  // Simple Euclidean lat/lon distance approximation (1 deg ~ 111 km)
  const degThreshold = radiusKm / 111;

  // FRP cross-satellite boundary fix: same cluster only if same satellite OR within same 60-min overpass window
  // Different satellite orbits (e.g., NOAA-20 vs Suomi-NPP) capture different swaths and should not
  // have their FRP summed together as one event — this inflates intensity scores.
  const sameOrbitWindow = (a, b) => {
    const tA = Date.parse(a.timestamp), tB = Date.parse(b.timestamp);
    if (!Number.isFinite(tA) || !Number.isFinite(tB)) return false;
    // Both conditions are required: the same satellite may revisit hours later.
    return a.satellite === b.satellite && Math.abs(tA - tB) <= 30 * 60 * 1000;
  };

  for (let i = 0; i < safePoints.length; i++) {
    if (visited.has(i)) continue;

    const currentCluster = [safePoints[i]];
    visited.add(i);

    for (let j = i + 1; j < safePoints.length; j++) {
      if (visited.has(j)) continue;

      const dLat = Math.abs(safePoints[i].latitude - safePoints[j].latitude);
      const dLon = Math.abs(safePoints[i].longitude - safePoints[j].longitude) * Math.cos((safePoints[i].latitude * Math.PI) / 180);
      const distDeg = Math.sqrt(dLat * dLat + dLon * dLon);

      if (distDeg <= degThreshold && sameOrbitWindow(safePoints[i], safePoints[j])) {
        currentCluster.push(safePoints[j]);
        visited.add(j);
      }
    }

    const count = currentCluster.length;
    const totalFrp = Math.round(currentCluster.reduce((sum, p) => sum + (p.frp || 0), 0) * 10) / 10;
    const avgLat = Math.round((currentCluster.reduce((sum, p) => sum + p.latitude, 0) / count) * 1000) / 1000;
    const avgLon = Math.round((currentCluster.reduce((sum, p) => sum + p.longitude, 0) / count) * 1000) / 1000;
    const timestamps = currentCluster.map(p => p.timestamp).filter(Boolean).sort();
    const latestTimestamp = timestamps.at(-1) || null;

    // List unique satellites contributing to this cluster (for transparency)
    const satellites = [...new Set(currentCluster.map(p => p.satellite).filter(Boolean))];

    let intensity = 'LOW';
    if (count >= 10 || totalFrp >= 150) intensity = 'HIGH';
    else if (count >= 4 || totalFrp >= 50) intensity = 'MEDIUM';

    clusters.push({
      centerLat: avgLat,
      centerLon: avgLon,
      pointCount: count,
      totalFrp,
      intensity,
      theater: safePoints[0].theater,
      latestObservedAt: latestTimestamp,
      satellites,  // Which satellites contributed (cross-satellite FRP isolation info)
      samples: currentCluster.slice(0, 3)
    });
  }

  // Sort by intensity and totalFrp descending
  return clusters.sort((a, b) => b.totalFrp - a.totalFrp);
}

// In-memory cache for raw global CSV to avoid redownloading 8MB for multiple theater queries
let inMemoryCsv = {
  text: null,
  fetchedAtMs: 0
};

const GLOBAL_FIRMS_URL = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv';

/**
 * Fetches NASA FIRMS 24h open country/regional CSV feed
 */
async function fetchFirmsData(theaterKey = 'ukraine_front', forceFresh = false) {
  if (!THEATER_BOUNDS[theaterKey]) return {success:false,status:'INVALID_REGION',error:'未知觀測區域'};
  const cachePath = CACHE_FILE;
  if (!forceFresh && fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (cached[theaterKey]?.parserVersion === 3 && cached[theaterKey].fetchedAtMs<=Date.now() && Date.now() - cached[theaterKey].fetchedAtMs < CACHE_TTL_MS) {
        return cached[theaterKey];
      }
    } catch (_) {}
  }

  try {
    let csv = null;
    const now = Date.now();
    if (!forceFresh && inMemoryCsv.text && now - inMemoryCsv.fetchedAtMs < CACHE_TTL_MS) {
      csv = inMemoryCsv.text;
    } else {
      const res = await fetch(GLOBAL_FIRMS_URL, {
        signal: AbortSignal.timeout(20000),
        headers: { 'User-Agent': 'WordWarNews/2.0 DefenseIntelBot (FIRMS Thermal Anomaly Monitor)' }
      });
      if (!res.ok) throw new Error(`NASA FIRMS HTTP ${res.status}`);
      csv = await res.text();
      inMemoryCsv.text = csv;
      inMemoryCsv.fetchedAtMs = now;
    }

    if (!csv.startsWith('latitude,longitude,')) throw new Error('FIRMS CSV schema mismatch');
    const rawPoints = parseFirmsCsv(csv, theaterKey);
    const clusters = clusterHotspots(rawPoints);

    const result = {
      success: true,
      parserVersion: 3,
      theater: theaterKey,
      theaterName: THEATER_BOUNDS[theaterKey]?.name || theaterKey,
      fetchedAt: new Date().toISOString(),
      fetchedAtMs: Date.now(),
      totalHotspots: rawPoints.length,
      clustersCount: clusters.length,
      highIntensityClusters: clusters.filter(c => c.intensity === 'HIGH'),
      clusters: clusters.slice(0, 10),
      source: 'NASA FIRMS VIIRS NRT Active Fire Telemetry'
    };

    // Update disk cache
    let allCache = {};
    if (fs.existsSync(cachePath)) {
      try { allCache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (_) {}
    }
    allCache[theaterKey] = result;
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(allCache, null, 2), 'utf8');

    return result;
  } catch (error) {
    console.warn(`[FIRMS FETCH WARNING] ${theaterKey}:`, error.message);
    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        if (cached[theaterKey]) return { ...cached[theaterKey], success:false, status:'STALE_CACHE', fromCache: true, error: error.message };
      } catch (_) {}
    }
    return {
      success: false,
      theater: theaterKey,
      theaterName: THEATER_BOUNDS[theaterKey]?.name || theaterKey,
      error: error.message,
      totalHotspots: 0,
      clustersCount: 0,
      clusters: []
    };
  }
}

/**
 * Formats FIRMS thermal telemetry for Discord
 */
function firmsDiscordPayload(feed) {
  if (!feed || !feed.success) {
    return {
      sourceBacked: true,
      content: `# 🔥 NASA FIRMS 衛星實體火點觀測\n目前未能取得即時衛星熱輻射資料：${feed?.error || '連線逾時'}。\n依誠信規範，不捏造熱點數據。`,
      files: [],
      embeds: []
    };
  }

  const lines = [
    `# 🔥 NASA FIRMS 衛星實體火點偵測 // THERMAL ANOMALIES`,
    `> 🛰️ **衛星來源**: NASA VIIRS (Suomi-NPP) 375m 近即時遙測`,
    `> 📍 **觀測戰區**: **${feed.theaterName}** ｜ 📡 **資料狀態**: \`ONLINE\``,
    `> 🕒 **最後更新**: \`${feed.fetchedAt}\``,
    '',
    `• **偵測熱異常點數**: 共 \`${feed.totalHotspots}\` 個高溫像素點`,
    `• **空間與過境時間分組 (Clusters)**: \`${feed.clustersCount}\` 處聚集熱區（高強度熱區: \`${feed.highIntensityClusters?.length || 0}\` 處）`,
    ''
  ];

  if (!feed.clusters.length) {
    lines.push('🟢 **目前所選戰區內未偵測到顯著群聚之高能量火點異常。**');
  } else {
    lines.push('### 🎯 【主要熱異常聚集區 (Top Clusters)】');
    feed.clusters.slice(0, 5).forEach((c, idx) => {
      const badge = c.intensity === 'HIGH' ? '🔴 HIGH' : c.intensity === 'MEDIUM' ? '🟡 MED' : '⚪ LOW';
      lines.push(
        `**[${idx + 1}]** \`${badge}\` **座標**: \`${c.centerLat}°N, ${c.centerLon}°E\`` +
        ` ｜ **像素點**: \`${c.pointCount}\` 點 ｜ **輻射能量 (FRP)**: \`${c.totalFrp} MW\`` +
        (c.latestObservedAt ? `\n   ↳ 衛星過境時間: \`${c.latestObservedAt}\`` : '')
      );
    });
  }

  lines.push('');
  lines.push('> ⚠️ **客觀分析限制**: 衛星火點為熱輻射感測物理數據，可能涵蓋砲火爆炸、彈藥庫火災、工業燃燒或農林野火；必須配合戰線位置與多源情報核對，不單獨直接視為擊毀證明。');

  return {
    sourceBacked: true,
    content: lines.join('\n').slice(0, 2000),
    files: [],
    embeds: []
  };
}

module.exports = {
  THEATER_BOUNDS,
  parseFirmsCsv,
  clusterHotspots,
  fetchFirmsData,
  firmsDiscordPayload
};
