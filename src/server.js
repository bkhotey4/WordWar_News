/**
 * GLOBAL TACTICAL OVERWATCH (WordWar_News) - EXPRESS SERVER
 * Hosts the Tactical Command HUD & REST API endpoints
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Read conflicts data
function getConflictsData() {
  const dataPath = path.join(__dirname, '../public/data/conflicts.json');
  try {
    if (fs.existsSync(dataPath)) {
      return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    }
  } catch (err) {
    console.error('[SERVER] Error reading conflicts.json:', err.message);
  }
  return { system_status: {}, theaters: [], hotspots: [] };
}

// Read live intelligence data
function getLiveIntelData() {
  const dataPath = path.join(__dirname, '../public/data/live_intel.json');
  try {
    if (fs.existsSync(dataPath)) {
      return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    }
  } catch (err) {
    console.error('[SERVER] Error reading live_intel.json:', err.message);
  }
  return {};
}

function currentModel(data) {
  const evaluatedAt = Date.parse(data.crisisEvaluatedAt || '');
  const fresh = Number.isFinite(evaluatedAt) && evaluatedAt <= Date.now() + 60_000 && Date.now() - evaluatedAt <= 15 * 60_000;
  return fresh && Number.isFinite(data.crisisIndex)
    ? { level: data.defconLevel || null, index: data.crisisIndex, updated: data.crisisEvaluatedAt, confidence: data.crisisDataConfidence || 'LOW' }
    : { level: null, index: null, updated: null, confidence: 'NONE' };
}

const { evaluateSourceHealth } = require('./health_monitor');
const { buildNewsReports } = require('./news_reports');
const { getResearchFeed } = require('./research_reports');
const { getTaiwanFeed } = require('./taiwan_intel');
const { getStore } = require('./intel_store');
const { getSatelliteFeed } = require('./satellite_assets');
const {buildGlobalBrief}=require('./strategic_outlook');
const {getNewsContext}=require('./news_context');
const {getWarningBoard}=require('./warning_board');
app.get('/api/warning',(req,res)=>{res.set('Cache-Control','no-store').json(getWarningBoard());});
app.get('/api/global-brief',(req,res)=>{res.set('Cache-Control','no-store').json(buildGlobalBrief(getResearchFeed().reports,getSatelliteFeed(),Date.now(),getNewsContext()));});
const { fetchFirmsData } = require('./firms_monitor');
const { getNotamFeed } = require('./notam_monitor');
app.get('/api/taiwan', (req,res) => { res.set('Cache-Control','no-store').json(getTaiwanFeed()); });
app.get('/api/events', (req,res) => { res.set('Cache-Control','no-store').json({events:getStore().changes(100)}); });
app.get('/api/analysis-health', (req,res) => { res.set('Cache-Control','no-store').json(getStore().analysisHealth()); });
app.get('/api/satellite-assets', (req,res) => { res.set('Cache-Control','no-store').json(getSatelliteFeed(typeof req.query.region==='string'?req.query.region:undefined)); });
app.get('/api/firms', async (req, res) => {
  const theater = typeof req.query.theater === 'string' ? req.query.theater : 'ukraine_front';
  const data = await fetchFirmsData(theater);
  res.set('Cache-Control', 'no-store').json(data);
});
app.get('/api/notam', (req, res) => { res.set('Cache-Control', 'no-store').json(getNotamFeed()); });

// 研究排程健康：排程、執行紀錄、上次成功、下次預定、漏跑
app.get('/api/research-health', (req, res) => {
  const { researchHealth } = require('./research_health');
  let pending = null; try { pending = getStore().analysisHealth().pendingOriginalDocuments; } catch {}
  res.set('Cache-Control', 'no-store').json({ ...researchHealth(), pendingOriginalDocuments: pending });
});
// 事件時間線與更正紀錄
app.get('/api/event-timeline', (req, res) => {
  const { buildEventTimeline, KINDS } = require('./event_timeline');
  const theater = typeof req.query.theater === 'string' && /^[a-z_]{2,30}$/.test(req.query.theater) ? req.query.theater : null;
  const kinds = typeof req.query.kinds === 'string' ? req.query.kinds.split(',').filter(k => Object.hasOwn(KINDS, k)) : null;
  res.set('Cache-Control', 'no-store').json(buildEventTimeline({ theater, kinds }));
});
// 預警回測（6 小時快取）
app.get('/api/warning-backtest', (req, res) => {
  try { res.set('Cache-Control', 'no-store').json(require('./warning_backtest').getWarningBacktest()); }
  catch (e) { res.status(500).json({ error: `回測無法執行：${e.message}` }); }
});
// 衛星前後期對照與像素差異圖
let comparePairs = null;
async function getComparePairs() {
  if (comparePairs && Date.now() - comparePairs.at < 10 * 60_000) return comparePairs.data;
  const data = await require('./satellite_compare').comparisonPairs();
  comparePairs = { at: Date.now(), data };
  return data;
}
app.get('/api/satellite-compare', async (req, res) => {
  try {
    const data = await getComparePairs();
    const { diffMeta } = require('./satellite_compare');
    const pairs = data.pairs.map(p => p.available ? { ...p, diff: diffMeta(p.before, p.after) } : p);
    res.set('Cache-Control', 'no-store').json({ ...data, pairs });
  } catch (e) { res.status(500).json({ error: `影像比較無法產生：${e.message}` }); }
});
app.get('/api/satellite-compare/diff/:before/:after.png', async (req, res) => {
  const { before, after } = req.params;
  if (!/^[0-9a-f]{64}$/.test(before) || !/^[0-9a-f]{64}$/.test(after)) return res.status(400).end();
  try {
    const pair = (await getComparePairs()).pairs.find(p => p.available && p.before.sha256 === before && p.after.sha256 === after);
    if (!pair) return res.status(404).json({ error: '不是目前提供的比較組合' });
    const { file } = await require('./satellite_compare').diffPng(pair.before, pair.after);
    res.set('Cache-Control', 'public, max-age=86400').type('png').sendFile(file);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 網站版戰場圖與海報：與 Discord 相同的繪圖程式；20 分鐘快取，一次只畫一張以免佔滿 CPU
const RENDER_TTL = 20 * 60_000;
const renders = new Map();
let renderQueue = Promise.resolve();
function cachedRender(key, fn) {
  const hit = renders.get(key);
  if (hit && Date.now() - hit.at < RENDER_TTL) return hit.promise;
  const promise = renderQueue.then(fn);
  renderQueue = promise.catch(() => {});
  renders.set(key, { at: Date.now(), promise });
  promise.catch(() => renders.delete(key));
  return promise;
}
const THEATER_IDS = () => Object.keys(require('./battle_map').NAMES);
app.get('/api/battle-map/:theater', async (req, res) => {
  const theater = req.params.theater.replace(/\.jpg$/, '');
  if (!THEATER_IDS().includes(theater)) return res.status(404).json({ error: '未知戰區' });
  try {
    const map = await cachedRender(`map:${theater}`, () => require('./battle_map').renderBattleMap(theater));
    if (req.params.theater.endsWith('.jpg')) return res.set('Cache-Control', 'no-cache').type('jpeg').send(map.buffer);
    res.set('Cache-Control', 'no-store').json({ theater, title: map.title, paragraph: map.paragraph, sourceLinks: map.sourceLinks, tilesLoaded: map.tilesLoaded, imageUrl: `/api/battle-map/${theater}.jpg`, renderedAt: new Date(renders.get(`map:${theater}`)?.at || Date.now()).toISOString() });
  } catch (e) { res.status(500).json({ error: `戰場圖暫時無法產生：${e.message}` }); }
});
// 每週週報 PDF：週報＋全球與四大戰區海報（約 5 MB，與海報共用 20 分鐘快取與繪圖排隊）
app.get('/api/weekly.pdf', async (req, res) => {
  try {
    const pdf = await cachedRender('weekly:pdf', () => require('./weekly').renderWeeklyPdf());
    res.set('Cache-Control', 'no-cache').set('Content-Disposition', `inline; filename="${pdf.filename}"`).type('pdf').send(pdf.buffer);
  } catch (e) { res.status(500).json({ error: `週報 PDF 暫時無法產生：${e.message}` }); }
});
app.get('/api/poster/:theater', async (req, res) => {
  const theater = req.params.theater.replace(/\.jpg$/, '');
  if (theater !== 'global' && !require('./poster').ORDER.includes(theater) && !THEATER_IDS().includes(theater)) return res.status(404).json({ error: '未知戰區' });
  try {
    const poster = await cachedRender(`poster:${theater}`, () => theater === 'global' ? require('./poster').renderGlobalPoster() : require('./poster').renderTheaterPoster(theater));
    if (req.params.theater.endsWith('.jpg')) return res.set('Cache-Control', 'no-cache').type('jpeg').send(poster.buffer);
    res.set('Cache-Control', 'no-store').json({ theater, title: poster.data.title, forces: poster.data.forces || [], imageUrl: `/api/poster/${theater}.jpg`, renderedAt: new Date(renders.get(`poster:${theater}`)?.at || Date.now()).toISOString() });
  } catch (e) { res.status(500).json({ error: `海報暫時無法產生：${e.message}` }); }
});

app.get('/api/reports', (req, res) => {
  const live = getLiveIntelData();
  res.set('Cache-Control', 'no-store');
  res.json({ updatedAt: live.lastUpdated || null, ...getResearchFeed(), leads: buildNewsReports(live) });
});

// REST API: System Status
app.get('/api/status', (req, res) => {
  const data = getConflictsData();
  const live = getLiveIntelData();
  const model = currentModel(live);
  const health = evaluateSourceHealth(live);
  res.json({
    status: 'ONLINE',
    system: {
      ...data.system_status,
      defcon_level: model.index !== null ? live.defconNumeric : null,
      defcon_name: model.index !== null ? live.defconName : null,
      escalation_index: model.index,
      threat_assessment: model.index !== null ? live.threatAssessment : '資料不足',
      last_updated: model.updated,
      live_defcon: model.level,
      live_crisis_index: model.index,
      live_updated: model.updated,
      is_model_estimate: model.index !== null,
      data_confidence: model.confidence,
      overall_health: health.overallStatus,
      active_sensors: health.activeSources,
      total_sensors: health.totalSources,
      source_health: health.sources,
      nato_alert_status: '未接入北約即時狀態來源'
    },
    discord_app_id: process.env.DISCORD_CLIENT_ID || '',
    server_time: new Date().toISOString()
  });
});

// REST API: Data Source Health & Quality Audit
app.get('/api/health', (req, res) => {
  const live = getLiveIntelData();
  const health = evaluateSourceHealth(live);
  res.json(health);
});

// REST API: All Conflicts & Hotspots
app.get('/api/conflicts', (req, res) => {
  const data = getConflictsData();
  const live = getLiveIntelData();
  const model = currentModel(live);
  data.system_status = {
    ...data.system_status,
    defcon_level: model.index !== null ? live.defconNumeric : null,
    defcon_name: model.index !== null ? live.defconName : null,
    escalation_index: model.index,
    threat_assessment: model.index !== null ? live.threatAssessment : '資料不足',
    last_updated: model.updated
  };
  data.system_status.nato_alert_status = '未接入北約即時狀態來源';
  data.theaters = (data.theaters || []).map(item => ({
    ...item,
    threat_level: 'UNKNOWN',
    summary: '此區域尚無可核對時間的近期來源，無法提供目前威脅評級。'
  }));
  data.hotspots = (data.hotspots || []).map(item => ({
    ...item,
    risk_level: 'UNKNOWN',
    status: '近期觀測資料不足',
    scenario: '歷史情境參考，不代表目前動態。',
    key_forces: [],
    intel_brief: '此熱點尚無附原始來源與觀測時間的近期資料。',
    evidence_status: 'UNVERIFIED'
  }));
  res.json(data);
});

// Local imagery evidence status. A file's mtime never substitutes for acquisition time.
app.get('/api/imagery', (req, res) => {
  try {
    const publicDir = path.join(__dirname, '../public');
    const catalog = JSON.parse(fs.readFileSync(path.join(publicDir, 'data/imagery_catalog.json'), 'utf8'));
    const images = catalog.images.map(item => {
      const fullPath = path.resolve(publicDir, item.file);
      const exists = fullPath.startsWith(publicDir + path.sep) && fs.existsSync(fullPath);
      return {
        ...item,
        available: exists,
        fileModifiedAt: exists ? fs.statSync(fullPath).mtime.toISOString() : null,
        evidenceStatus: exists && item.verified && item.imageSourceProductId && item.acquiredAt && item.sourceProductUrl
          ? '本機圖檔已與產品來源建立對應'
          : '本機圖檔未與 STAC 產品建立來源對應'
      };
    });
    res.json({
      lastCatalogCheckAt: catalog.lastCatalogCheckAt || null,
      stacProvider: catalog.stacProvider || null,
      images
    });
  } catch (error) {
    res.status(500).json({ error: '影像目錄無法讀取' });
  }
});

// REST API: Filtered by Theater
app.get('/api/theater/:theaterId', (req, res) => {
  const data = getConflictsData();
  const theaterId = req.params.theaterId.toLowerCase();
  const filtered = data.hotspots.filter(h => h.theater === theaterId).map(item => ({
    ...item,
    risk_level: 'UNKNOWN',
    status: '近期觀測資料不足',
    scenario: '歷史情境參考，不代表目前動態。',
    key_forces: [],
    intel_brief: '此熱點尚無附原始來源與觀測時間的近期資料。',
    evidence_status: 'UNVERIFIED'
  }));
  res.json({
    theater: theaterId,
    total: filtered.length,
    hotspots: filtered
  });
});

let lastApiPushTime = 0;
// 固定時間比對：先各自雜湊成等長，避免以回應時間逐字猜出金鑰
function safeEqual(given, expected) {
  if (typeof given !== 'string' || !given) return false;
  const crypto = require('crypto');
  const h = v => crypto.createHash('sha256').update(v).digest();
  return crypto.timingSafeEqual(h(given), h(expected));
}

// REST API: Push DM to all subscribers (Requires ADMIN_API_KEY & 10m cooldown)
app.post('/api/push-dm', async (req, res) => {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || adminKey.length < 24 || /your_|change_me|example/i.test(adminKey)) {
    return res.status(503).json({ success: false, message: '伺服器未配置足夠強度的 ADMIN_API_KEY（至少 24 字元），群發推播功能已鎖定。執行 npm run setup 可自動產生。' });
  }
  // 只接受 header：網址參數會留在瀏覽紀錄與伺服器日誌
  const reqKey = req.headers['x-admin-key'];
  if (req.query.key !== undefined) {
    return res.status(400).json({ success: false, message: '金鑰不可放在網址參數，請改用 x-admin-key header' });
  }

  if (!safeEqual(reqKey, adminKey)) {
    return res.status(401).json({ success: false, message: '權限不足：未提供或無效的管理者金鑰 (x-admin-key)' });
  }

  const now = Date.now();
  if (now - lastApiPushTime < 10 * 60 * 1000) {
    const remaining = Math.round((10 * 60 * 1000 - (now - lastApiPushTime)) / 1000);
    return res.status(429).json({ success: false, message: `群發推播冷卻保護中，請等待 ${remaining} 秒後再試` });
  }

  try {
    lastApiPushTime = now;
    const { Client, GatewayIntentBits, Events } = require('discord.js');
    const { researchDiscordPayload } = require('./research_reports');
    const subsPath = path.join(__dirname, 'subscribers.json');
    const subs = fs.existsSync(subsPath) ? JSON.parse(fs.readFileSync(subsPath, 'utf8')).subscribers || [] : [];
    if (!subs.length) return res.status(400).json({ success: false, message: '目前暫無已登記之私訊訂閱者' });
    const payload = researchDiscordPayload();
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages] });
    let readyTimer;
    try {
      const ready = new Promise((resolve, reject) => {
        client.once(Events.ClientReady, resolve);
        readyTimer = setTimeout(() => reject(new Error('Discord login timeout')), 20_000);
      });
      await Promise.all([ready, client.login(process.env.DISCORD_BOT_TOKEN)]);
      clearTimeout(readyTimer);
      let sent = 0;
      for (const userId of new Set(subs.map(sub => sub.userId))) {
        try {
          const user = await client.users.fetch(userId);
          await user.send(payload);
          sent++;
        } catch (error) { console.error('[PUSH SEND]', userId, error.message); }
      }
      res.json({ success: sent > 0, sent, total: new Set(subs.map(sub => sub.userId)).size });
    } finally {
      clearTimeout(readyTimer);
      client.destroy();
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start Express Server
// 預設只接受本機連線；要讓同網路的手機或其他電腦看網站，在 .env 設 HOST=0.0.0.0
const HOST = process.env.HOST || '127.0.0.1';
if(require.main===module)app.listen(PORT, HOST, () => {
  console.log('================================================================');
  console.log(`[TACTICAL COMMAND] Global War Briefing Server Started`);
  console.log(`[HUD ACCESS] Open browser at: http://localhost:${PORT}（監聽 ${HOST}）`);
  console.log(`[DISCORD APP ID] ${process.env.DISCORD_CLIENT_ID || ''}`);
  console.log('================================================================');
});
module.exports=app;
