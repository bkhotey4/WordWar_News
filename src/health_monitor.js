/**
 * INTELLIGENCE SOURCES HEALTH & QUALITY OVERWATCH (Health Monitor)
 * Tracks data source latency, sensor staleness, TTL compliance,
 * and maintains an audit trail of unverified leads vs confirmed telemetry.
 */

const fs = require('fs');
const path = require('path');
const { getResearchFeed } = require('./research_reports');
const { getStore } = require('./intel_store');

const LIVE_INTEL_FILE = path.join(__dirname, '../public/data/live_intel.json');
const ALERT_HISTORY_FILE = path.join(__dirname, 'alert_history.json');
const CATALOG_FILE = path.join(__dirname, '../public/data/imagery_catalog.json');

const SOURCE_TTLS = {
  airspace_adsb: 15 * 60 * 1000,       // 15 minutes max
  rss_news: 24 * 60 * 60 * 1000,        // 24 hours max
  satellite_stac: 60 * 60 * 1000 // Catalog check freshness, not satellite revisit time
};

const SYSTEM_LIMITATIONS = [
  '自動中文研究排程目前未啟用（依使用者指示取消常駐背景排程，採手動查核匯入）。',
  '目前原文自動採集主要是烏克蘭軍方與軍方媒體；來源數量不等於獨立佐證數。外部評估需另外查閱並匯入。',
  '衛星功能目前查詢產品目錄，尚無已核實的本機事件影像或自動變化判讀。',
  '預警目前是新聞關鍵字與公開航空訊號的待查通知，不能宣稱能預測戰爭或已確認威脅。',
  '本機檔案不提供跨程序交易鎖；避免多個程序同時發布同一資料庫。大量任務或多使用者時應遷移至支援交易的資料庫。',
  'Discord 已接受訊息後、成功紀錄落盤前若程序崩潰，仍可能重送；目前無法保證嚴格只送一次。',
  '對引用的格式與時效驗證不會自動證明段落語意真的受到來源支持，仍需研究者比對原文。',
  '舊專題與圖卡產生器尚保留歷史內容，但沒有接回有效報導流程。要恢復功能必須改為讀取有來源的資料。'
];

function getAlertHistory() {
  try {
    if (fs.existsSync(ALERT_HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(ALERT_HISTORY_FILE, 'utf8'));
    }
  } catch (e) {}
  return { history: [] };
}

function getImageryCatalog() {
  try {
    if (fs.existsSync(CATALOG_FILE)) {
      return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
    }
  } catch (e) {}
  return { images: [] };
}

/**
 * Audit all sources for staleness, latency, and operational health
 */
function evaluateSourceHealth(liveIntel = null) {
  const now = Date.now();
  let live = liveIntel;
  if (!live) {
    try {
      if (fs.existsSync(LIVE_INTEL_FILE)) {
        live = JSON.parse(fs.readFileSync(LIVE_INTEL_FILE, 'utf8'));
      }
    } catch (e) {}
  }
  live = live || {};

  const sources = {};

  // 1. OpenSky ADS-B Airspace Sensor
  const airspace = live.liveAirspace;
  const airspaceTime = airspace?.timestamp ? Date.parse(airspace.timestamp) : null;
  const airspaceAgeMs = airspaceTime ? Math.max(0, now - airspaceTime) : null;
  const airspaceHealthy = airspace?.success === true && airspaceAgeMs !== null && airspaceTime <= now + 60_000 && airspaceAgeMs <= SOURCE_TTLS.airspace_adsb;
  sources['OpenSky_ADSB'] = {
    name: 'OpenSky Network ADS-B 航跡接收網',
    type: 'SENSOR_TELEMETRY',
    status: airspaceHealthy ? 'HEALTHY' : (airspaceTime > now + 60_000 ? 'INVALID_TIME' : (airspaceTime ? 'STALE' : 'OFFLINE')),
    lastObserved: airspace?.timestamp || null,
    latencyMinutes: airspaceAgeMs !== null ? Math.round(airspaceAgeMs / 60000) : null,
    maxAllowedAgeMinutes: 15,
    metrics: {
      totalInStrait: airspaceHealthy ? airspace.totalAircraftInStrait ?? null : null,
      midStraitCount: airspaceHealthy ? airspace.midStraitCount ?? null : null,
      emergencySquawk: airspaceHealthy ? (airspace.foreignOrSpecial || []).filter(p => ['7700', '7600', '7500'].includes(String(p.squawk || ''))).length : null
    },
    note: airspaceHealthy ? '數據時效在 15 分鐘安全窗口內' : '數據已過期或離線，不參與即時模型評估'
  };

  // 2. RSS / Defense News Aggregator
  const mnd = live.mndOfficial;
  const mndTime = mnd?.fetchedAt ? Date.parse(mnd.fetchedAt) : null;
  const mndAgeMs = mndTime ? Math.max(0, now - mndTime) : null;
  const mndHealthy = mnd?.success === true && mndAgeMs !== null && mndTime <= now + 60_000 && mndAgeMs <= SOURCE_TTLS.rss_news;
  sources['News_Aggregation'] = {
    name: '國防新聞媒體與公開報導彙整網',
    type: 'OSINT_MEDIA',
    status: mndHealthy ? 'HEALTHY' : (mndTime > now + 60_000 ? 'INVALID_TIME' : (mndTime ? 'STALE' : 'OFFLINE')),
    lastObserved: mnd?.fetchedAt || null,
    latencyMinutes: mndAgeMs !== null ? Math.round(mndAgeMs / 60000) : null,
    maxAllowedAgeMinutes: 1440,
    metrics: {
      headlineCount: mndHealthy ? mnd.count ?? null : null,
      extractedAircraftLead: mndHealthy ? mnd.extractedMetrics?.raw?.aircraftTotal ?? null : null,
      extractedCrossMedianLead: mndHealthy ? mnd.extractedMetrics?.raw?.crossMedian ?? null : null
    },
    note: '新聞標題屬人工待查線索，非官方原始通報'
  };

  // 3. Copernicus Sentinel-2 STAC Orbit Catalog
  const catalog = getImageryCatalog();
  const catalogTime = catalog.lastCatalogCheckAt ? Date.parse(catalog.lastCatalogCheckAt) : null;
  const catalogAgeMs = catalogTime ? Math.max(0, now - catalogTime) : null;
  const sceneCount = (catalog.images || []).filter(i => i.sceneCheckStatus === 'ONLINE' && i.catalogScene?.productId && i.catalogScene?.acquiredAt).length;
  const publicDir = path.resolve(__dirname, '../public');
  const imageCount = (catalog.images || []).filter(i => {
    if (!i.verified || !i.imageSourceProductId || !i.acquiredAt || !i.sourceProductUrl || !i.file) return false;
    const imagePath = path.resolve(publicDir, i.file);
    return imagePath.startsWith(publicDir + path.sep) && fs.existsSync(imagePath);
  }).length;
  sources['Copernicus_STAC'] = {
    name: 'Element84 Earth Search Sentinel-2 產品目錄',
    type: 'ORBITAL_IMAGERY',
    status: sceneCount > 0 && catalogAgeMs !== null && catalogTime <= now + 60_000 && catalogAgeMs <= SOURCE_TTLS.satellite_stac ? 'HEALTHY' : 'DEGRADED',
    lastObserved: catalog.lastCatalogCheckAt || null,
    latencyMinutes: catalogAgeMs !== null ? Math.round(catalogAgeMs / 60000) : null,
    maxAllowedAgeMinutes: 60,
    metrics: {
      monitoredTargets: (catalog.images || []).length,
      catalogScenes: sceneCount,
      verifiedLocalImages: imageCount,
      latestAcquisition: (catalog.images || []).map(i => i.catalogScene?.acquiredAt).filter(Boolean).sort().reverse()[0] || null
    },
    note: 'STAC 產品紀錄尚未與本機圖檔建立來源對應；僅為目錄健康度'
  };

  const research = getResearchFeed(now);
  for (const [id, source] of Object.entries(research.sourceStatus || {})) {
    const successAt = Date.parse(source.lastSuccess);
    const age = now - successAt;
    const fresh = Number.isFinite(age) && age >= 0 && age <= 60 * 60_000;
    sources[`Research_${id}`] = {
      name: `原文研究：${id}`, type: 'ORIGINAL_DOCUMENTS',
      status: source.status === 'ONLINE' && fresh ? 'HEALTHY' : fresh ? 'DEGRADED' : 'STALE',
      lastObserved: source.lastSuccess || null,
      latencyMinutes: Number.isFinite(age) && age >= 0 ? Math.round(age / 60_000) : null,
      maxAllowedAgeMinutes: 60,
      metrics: { readableDocuments: source.count ?? null },
      note: source.error || '來源可讀不代表內容已獨立證實；交戰方來源須另外比對'
    };
  }

  for (const [id,name,ttl] of [['Taiwan_MND','國防部官方台海通報',60],['Satellite_Assets','Sentinel-2 實際產品縮圖',420]]) {
    const source=getStore().getHealth(id);
    const age=now-Date.parse(source?.lastSuccess);
    const fresh=Number.isFinite(age)&&age>=0&&age<=ttl*60_000;
    sources[id]={name,type:id==='Taiwan_MND'?'OFFICIAL_REPORTS':'SOURCE_IMAGE_ASSETS',status:source?.status==='ONLINE'&&fresh?'HEALTHY':source?'DEGRADED':'OFFLINE',lastObserved:source?.lastSuccess||null,
      latencyMinutes:Number.isFinite(age)&&age>=0?Math.round(age/60_000):null,maxAllowedAgeMinutes:ttl,
      metrics:id==='Taiwan_MND'?{readableReports:source?.readCount??null}:{verifiedPreviews:source?.verifiedPreviews??null},
      note:id==='Taiwan_MND'?'採集健康不等於即時部署；請核對官方統計期間。':'縮圖已與產品來源對應，尚未進行軍事活動或戰損判讀。'};
  }

  // Alert Quality & Disinformation Shield Audit
  const alerts = getAlertHistory();
  const recentAlerts = (Array.isArray(alerts.history) ? alerts.history : []).filter(h => {
    const age = now - Date.parse(h.timestamp);
    return Number.isFinite(age) && age >= 0 && age <= 48 * 60 * 60 * 1000;
  });
  const leadsCount = recentAlerts.filter(h => h.code === 'NEWS_HEADLINE_REVIEW').length;
  const telemetryCount = recentAlerts.filter(h => h.code === 'ADSB_SQUAWK_REVIEW').length;

  const overallSystemConfidence = airspaceHealthy
    ? 'PARTIAL // 公開空域資料可用，影像未判讀'
    : 'DEGRADED // 即時空域資料不可用';

  return {
    evaluatedAt: new Date().toISOString(),
    overallStatus: overallSystemConfidence,
    activeSources: Object.keys(sources).filter(k => sources[k].status === 'HEALTHY').length,
    totalSources: Object.keys(sources).length,
    sources,
    systemLimitations: SYSTEM_LIMITATIONS,
    qualityAudit: {
      past48hAlertsCount: recentAlerts.length,
      unverifiedHeadlineLeads: leadsCount,
      sensorTelemetryAlerts: telemetryCount,
      staleDataSuppressionActive: true,
      staticFieldInfiltrationBlocked: !['chinaMobilization', 'ww3DualTheater', 'financialIndicators'].some(key => key in live),
      systemLimitations: SYSTEM_LIMITATIONS
    }
  };
}

module.exports = {
  evaluateSourceHealth,
  SOURCE_TTLS,
  SYSTEM_LIMITATIONS
};
