/**
 * WordWar_News - USGS Realtime Seismic & Detonation Monitor (src/collectors/usgs_seismic.js)
 * 
 * Feature: 全球地表淺層震動與爆炸事件監測
 * Connects to USGS Earthquake API (GeoJSON feed)
 * Identifies shallow seismic anomalies (depth <= 5km) in military conflict zones
 * (e.g. ammunition depot detonations, bunker penetrations, surface blasts).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { fetchText } = require('../win_fetch');

const CACHE_FILE = path.join(__dirname, '../../public/data/usgs_seismic.json');
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 mins cache
const USGS_FEED_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
const USGS_HOSTS = ['earthquake.usgs.gov'];

// Key military/conflict monitoring regions [minLon, minLat, maxLon, maxLat]
const REGIONAL_BOUNDS = {
  ukraine_russia: {
    theater: 'ukraine_front',
    name: '烏俄前線與俄羅斯西部邊境軍事庫區',
    bbox: [30.0, 44.0, 42.0, 57.5]
  },
  taiwan_strait: {
    theater: 'taiwan_strait',
    name: '台海與東南沿海',
    bbox: [117.0, 21.0, 124.0, 27.0]
  },
  middle_east: {
    theater: 'middle_east',
    name: '中東要地、波斯灣與紅海',
    bbox: [34.0, 12.0, 56.0, 36.5]
  },
  korea_peninsula: {
    theater: 'korea_peninsula',
    name: '朝鮮半島及核子試驗場周邊',
    bbox: [124.0, 33.0, 131.0, 43.0]
  }
};

/**
 * Parses USGS GeoJSON features and filters for shallow events in conflict regions
 */
function parseUsgsFeatures(features, now = Date.now()) {
  if (!Array.isArray(features)) return [];
  const events = [];

  for (const item of features) {
    const props = item.properties || {};
    const geom = item.geometry || {};
    const coords = geom.coordinates || [];
    if (coords.length < 3) continue;

    const [lon, lat, depthKm] = coords;
    const mag = props.mag;
    const timeMs = props.time;

    if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(depthKm) || !Number.isFinite(mag)) continue;
    if (timeMs > now || now - timeMs > 86400000) continue; // Only last 24h

    // Check which theater bounding box it falls into
    let matchedTheater = null;
    for (const [key, reg] of Object.entries(REGIONAL_BOUNDS)) {
      if (lon >= reg.bbox[0] && lon <= reg.bbox[2] && lat >= reg.bbox[1] && lat <= reg.bbox[3]) {
        matchedTheater = { key, ...reg };
        break;
      }
    }

    if (!matchedTheater) continue;

    // 可疑：USGS 標註爆破或採石爆破，或深度 ≤ 3 km 且規模 ≥ 2.0（淺層也可能是天然地震或採礦）
    const isVeryShallow = depthKm <= 3.0;
    const isExplosionType = (props.type || '').toLowerCase().includes('explosion') || (props.type || '').toLowerCase().includes('quarry');
    const isSuspicious = isExplosionType || (isVeryShallow && mag >= 2.0);

    events.push({
      id: item.id || `usgs_${timeMs}`,
      title: props.title || `M ${mag} Seismic Event`,
      place: props.place || '未知地點',
      magnitude: Math.round(mag * 10) / 10,
      depthKm: Math.round(depthKm * 10) / 10,
      latitude: Math.round(lat * 1000) / 1000,
      longitude: Math.round(lon * 1000) / 1000,
      time: new Date(timeMs).toISOString(),
      timeMs,
      theater: matchedTheater.theater,
      theaterName: matchedTheater.name,
      type: props.type || 'earthquake',
      isVeryShallow,
      isExplosionType,
      isSuspicious,
      url: props.url || `https://earthquake.usgs.gov/earthquakes/eventpage/${item.id}`
    });
  }

  // Sort newest first
  return events.sort((a, b) => b.timeMs - a.timeMs);
}

/**
 * Fetches and filters USGS seismic telemetry
 */
async function fetchUsgsSeismic(forceFresh = false) {
  if (!forceFresh && fs.existsSync(CACHE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (Date.now() - cached.fetchedAtMs < CACHE_TTL_MS) {
        return cached;
      }
    } catch (_) {}
  }

  try {
    const text = await fetchText(USGS_FEED_URL, { hosts: USGS_HOSTS });
    const json = JSON.parse(text);
    const events = parseUsgsFeatures(json.features || []);

    const result = {
      success: true,
      fetchedAt: new Date().toISOString(),
      fetchedAtMs: Date.now(),
      totalEvents24h: events.length,
      suspiciousEvents: events.filter(e => e.isSuspicious),
      events,
      source: 'USGS Real-time Earthquake & Seismic Hazards Feed',
      status: 'ONLINE'
    };

    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(result, null, 2), 'utf8');
    return result;
  } catch (err) {
    return {
      success: false,
      fetchedAt: new Date().toISOString(),
      fetchedAtMs: Date.now(),
      totalEvents24h: 0,
      suspiciousEvents: [],
      events: [],
      error: err.message,
      source: 'USGS Real-time Earthquake & Seismic Hazards Feed',
      status: 'DEGRADED'
    };
  }
}

module.exports = {
  fetchUsgsSeismic,
  parseUsgsFeatures,
  REGIONAL_BOUNDS
};
