// 台電「各機組發電量」開放資料（每 10 分鐘更新）：統計備註為「故障」的機組裝置容量。
// 用途：台海次要指標——多座電廠同時非計畫故障停機，可能是設施遭破壞或攻擊的早期跡象；
// 歲修、計劃停機、環保停機、降載都是例行，不計入。基準：過去 60 天每小時故障容量的 P95。
const fs = require('fs');
const path = require('path');

const API = 'https://service.taipower.com.tw/data/opendata/apply/file/d006001/001.json';
const PAGE = 'https://www.taipower.com.tw/d006/loadGraph/loadGraph/genshx_.html';
const CACHE = path.join(__dirname, '../../research/source_cache/taipower_grid.json');
const HOUR = 3600_000, DAY = 24 * HOUR;
const MIN_SAMPLES = 24 * 14; // 至少 14 天的每小時紀錄才判定
const MIN_FAULT_MW = 1500;   // 故障容量至少 1,500 MW 才可能觸發（避免基準過低時小故障就觸發）

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { hourly: {} }; } }
function writeCache(data, file = CACHE) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, file); }
const mw = s => { const n = Number(String(s || '').replace(/\(.*$/, '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };

function parseUnits(json) {
  const rows = (json?.aaData || []).filter(r => r['機組名稱'] && !/小計|合計/.test(r['機組名稱']));
  if (!rows.length) return null;
  const isFault = r => /^故障$|^故障[（(]|^故障停機/.test(String(r['備註'] || '').trim());
  const faults = rows.filter(isFault).map(r => ({ name: r['機組名稱'], type: r['機組類型'], capacityMW: mw(r['裝置容量(MW)']) }));
  const thermal = rows.filter(r => /燃氣|燃煤|燃料油|核能/.test(r['機組類型']));
  return {
    at: json.DateTime ? new Date(`${json.DateTime}+08:00`).toISOString() : null,
    netMW: Math.round(rows.filter(r => !/儲能負載/.test(r['機組類型'])).reduce((s, r) => s + mw(r['淨發電量(MW)']), 0)),
    faultMW: Math.round(faults.reduce((s, f) => s + f.capacityMW, 0)), faults,
    thermalUnits: thermal.length
  };
}

let inFlight = null;
function refreshTaipowerGrid(options = {}) { if (!inFlight) inFlight = collect(options).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now() } = {}) {
  const cache = readCache(file);
  if (!force && cache.lastAttempt && now - Date.parse(cache.lastAttempt) < 0.5 * HOUR) return cache;
  cache.lastAttempt = new Date(now).toISOString();
  try {
    const res = await fetchImpl(API, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'WordWarNews/2.0 (personal research bot)' } });
    if (!res.ok) throw new Error(`台電 HTTP ${res.status}`);
    const snap = parseUnits(JSON.parse((await res.text()).replace(/^﻿/, '')));
    if (!snap || !snap.at) throw new Error('台電資料格式改變');
    const hourKey = snap.at.slice(0, 13);
    const hourly = cache.hourly || {};
    hourly[hourKey] = Math.max(hourly[hourKey] || 0, snap.faultMW);
    for (const k of Object.keys(hourly)) if (now - Date.parse(`${k}:00:00Z`) > 70 * DAY) delete hourly[k];
    Object.assign(cache, { hourly, latest: snap, status: 'ONLINE', lastSuccess: new Date(now).toISOString(), error: null });
  } catch (e) { Object.assign(cache, { status: 'DEGRADED', error: e.message }); }
  writeCache(cache, file);
  return cache;
}

function quantile(values, q) { const s = [...values].sort((a, b) => a - b); return s[Math.max(0, Math.ceil(q * s.length) - 1)]; }
function assessTaipowerGrid(cache, now = Date.now()) {
  // 擷取成功但台電資料本身的時間太舊，也算無法判定
  if (!cache?.latest || !cache.lastSuccess || now - Date.parse(cache.lastSuccess) > 3 * HOUR || !(now - Date.parse(cache.latest.at) <= 3 * HOUR)) return null;
  const L = cache.latest;
  const src = [{ url: PAGE, publisher: '台灣電力公司（各機組發電量開放資料）', sourceClass: 'OFFICIAL', publishedAt: L.at }];
  const past = Object.entries(cache.hourly || {}).filter(([k]) => { const t = Date.parse(`${k}:00:00Z`); return now - t > 6 * HOUR && now - t <= 60 * DAY; }).map(([, v]) => v);
  const list = L.faults.slice(0, 4).map(f => f.name).join('、');
  const base = `目前故障停機機組 ${L.faults.length} 部、裝置容量 ${L.faultMW.toLocaleString('en-US')} MW${list ? `（${list}${L.faults.length > 4 ? '等' : ''}）` : ''}；全系統淨發電 ${L.netMW.toLocaleString('en-US')} MW。歲修與計劃停機不計入。`;
  if (past.length < MIN_SAMPLES) return { status: 'UNKNOWN', observedAt: L.at, summary: `${base}基準累積中（${Math.floor(past.length / 24)}/14 天）。`, sources: src };
  const p95 = quantile(past, 0.95);
  const hit = L.faultMW > p95 && L.faultMW >= MIN_FAULT_MW;
  return { status: hit ? 'TRIGGERED' : 'CLEAR', observedAt: L.at, value: L.faultMW, unit: 'MW', baseline: { p95, windowDays: 60, samples: past.length },
    summary: `${base}60 日每小時 P95 為 ${Math.round(p95).toLocaleString('en-US')} MW${hit ? '｜故障容量異常偏高' : ''}。`, sources: src };
}

module.exports = { refreshTaipowerGrid, assessTaipowerGrid, parseUnits, readCache, CACHE, API, PAGE };
