/**
 * WordWar_News - Live OSINT & Military Intelligence Fetcher (Option A)
 * Crawls reliable defense RSS / open sources and refreshes live_intel.json
 */

const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { runAutonomousTacticalSweep } = require('./osint_crawler');
const { refreshImageryCatalog } = require('./satellite_stac');
const { plainText, httpUrl } = require('./news_reports');
const { refreshResearchSources } = require('./research_reports');
const { refreshMnd } = require('./collectors/taiwan_mnd');
const { refreshSatelliteAssets } = require('./satellite_assets');
const { refreshUkmto } = require('./collectors/ukmto');
const { refreshUkraineAir } = require('./collectors/ukraine_air');
const { refreshDeepState } = require('./collectors/deepstate');
const { refreshChinaMsa } = require('./collectors/china_msa');
const { refreshJapanJs } = require('./collectors/japan_js');
const { refreshPlaJoint } = require('./collectors/pla_joint');
const { refreshNatoFlank } = require('./collectors/nato_flank');
const { refreshMarkets } = require('./collectors/markets');
const { refreshDiplomacy } = require('./collectors/diplomacy');
const { refreshTaiwanCivil } = require('./collectors/taiwan_civil');
const { refreshUsniFleet } = require('./collectors/usni_fleet');
const { refreshRegional } = require('./collectors/regional');
const { refreshMobilization } = require('./collectors/mobilization');
const { refreshTaiwanInfra } = require('./collectors/taiwan_infra');

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WordWarNews/2.0 DefenseIntelBot'
  }
});

const DATA_FILE = path.join(__dirname, '../public/data/live_intel.json');

const RSS_SOURCES = [
  {
    name: 'Google News 巴士海峽與菲律賓海域標題',
    url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('(Batanes OR Itbayat OR "Luzon Strait" OR "Philippine Coast Guard") ("research vessel" OR "survey ship" OR AIS OR "maritime patrol") when:2d') + '&hl=en-US&gl=US&ceid=US:en',
    category: 'Regional Maritime Reporting'
  },
  {
    name: 'Google News 台海相關標題',
    url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('台海 (國防部 OR 俄羅斯 OR 共機 OR 中線 OR 國軍 OR 航跡)') + '&hl=zh-TW&gl=TW&ceid=TW:zh-Hant',
    category: 'Taiwan Strait Defense'
  },
  {
    name: 'Google News 歐洲相關標題（中文）',
    url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('(俄羅斯 OR 烏克蘭 OR 羅馬尼亞 OR 波蘭 OR 摩爾多瓦 OR 北約) (空襲 OR 無人機 OR 領空 OR 防空 OR 墜毀 OR 攔截 OR 升空 OR 導彈)') + '&hl=zh-TW&gl=TW&ceid=TW:zh-Hant',
    category: 'NATO Eastern Flank & Air Defense'
  },
  {
    name: 'Google News Europe related headlines (English)',
    url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('(Russia OR Ukraine OR Romania OR Poland OR Moldova OR NATO) (drone OR missile OR airspace OR incursion OR crash OR intercept OR scrambled)') + '&hl=en-US&gl=US&ceid=US:en',
    category: 'NATO & Europe Airspace Telemetry'
  },
  {
    name: 'Google News Iran and Hormuz headlines (English)',
    url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('(Iran OR Hormuz OR CENTCOM OR "Persian Gulf") (strike OR blockade OR missile OR tanker OR navy OR ceasefire OR talks) when:2d') + '&hl=en-US&gl=US&ceid=US:en',
    category: 'Iran War & Gulf Maritime'
  },
  {
    name: 'Google News 美伊與荷莫茲標題（中文）',
    url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('(伊朗 OR 荷莫茲 OR 霍爾木茲 OR 波斯灣) (美軍 OR 空襲 OR 封鎖 OR 飛彈 OR 油輪 OR 停火 OR 談判) when:2d') + '&hl=zh-TW&gl=TW&ceid=TW:zh-Hant',
    category: 'Iran War & Gulf Maritime'
  },
  {
    name: 'USNI News',
    url: 'https://news.usni.org/feed',
    category: 'Maritime & Fleet'
  },
  {
    name: 'Defense News',
    url: 'https://www.defensenews.com/arc/outboundfeeds/rss/',
    category: 'Global Defense'
  },
  {
    name: 'BBC World News',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    category: 'Global Geopolitics'
  },
  {
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    category: 'Conflict Zones'
  }
];

function getExistingData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[FETCHER ERROR] Reading existing data:', err.message);
  }
  return {};
}

function formatCSTDate(date) {
  const cst = new Date(date.getTime() + (8 * 60 * 60 * 1000));
  const Y = cst.getUTCFullYear();
  const M = String(cst.getUTCMonth() + 1).padStart(2, '0');
  const D = String(cst.getUTCDate()).padStart(2, '0');
  const h = String(cst.getUTCHours()).padStart(2, '0');
  const m = String(cst.getUTCMinutes()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m} CST`;
}

/**
 * Dynamic Global Crisis & Escalation Metrics Engine
 * Synthesizes cross-median sorties, in-air flights, Ro-Ro requisition, FININT, and theater signals.
 * Returns null metrics when input data is empty/insufficient.
 */
function calculateGlobalCrisisMetrics(liveData = {}, tacticalData = {}, nowMs = Date.now()) {
  const observedAt = Date.parse(tacticalData?.airspace?.timestamp || '');
  const hasFreshAdsb = tacticalData?.airspace?.success === true &&
    Number.isFinite(observedAt) && observedAt <= nowMs &&
    nowMs - observedAt <= 15 * 60_000;
  // Public ADS-B coverage is incomplete and news headlines are unverified leads.
  // Neither can calibrate a geopolitical crisis score or official readiness level.
  return {
    crisisIndex: null,
    defconNumeric: null,
    defconName: null,
    defconString: null,
    threatAssessment: '暫停總體風險評級：缺少多來源驗證與校準',
    factors: [hasFreshAdsb
      ? '公開 ADS-B 訊號可供來源專頁檢視，不用於全球危機計分'
      : '近期公開 ADS-B 訊號未取得'],
    isModelEstimate: true,
    dataConfidence: 'NONE',
    observedSources: hasFreshAdsb ? ['OpenSky ADS-B'] : []
  };
}

let refreshInFlight;
function fetchLiveIntelligence() {
  if (!refreshInFlight) refreshInFlight = collectLiveIntelligence().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}
async function collectLiveIntelligence() {
  const newCollectors = Promise.allSettled([refreshMnd(), refreshSatelliteAssets(), refreshUkmto(), refreshUkraineAir(), refreshDeepState(), refreshChinaMsa(), refreshJapanJs(), refreshPlaJoint(), refreshTaiwanInfra(), refreshNatoFlank(), refreshMarkets(), refreshDiplomacy(), refreshTaiwanCivil(), refreshUsniFleet(), refreshRegional(), refreshMobilization()]);
  console.log('[FETCHER] 開始執行全球即時國防情資排程抓取...');
  const currentData = getExistingData();
  // Legacy sections have no collector or acquisition timestamp. Never carry them
  // into a newly written live snapshot.
  for (const key of ['chinaMobilization', 'ww3DualTheater', 'easternEuropeFront', 'financialIndicators', 'communityOSINT']) {
    delete currentData[key];
  }
  const now = new Date();
  const allowedSources = new Set([...RSS_SOURCES.map(source => source.name), 'Element84 Earth Search STAC']);
  const sourceStatus = Object.fromEntries(Object.entries(currentData.sourceStatus || {}).filter(([name]) => allowedSources.has(name)));
  delete currentData.sources;
  let anySourceSucceeded = false;
  const newHeadlines = [];

  for (const source of RSS_SOURCES) {
    try {
      console.log(`[FETCHER] 正在連接情報源: ${source.name} (${source.url})...`);
      let feed = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          feed = await parser.parseURL(source.url);
          if (feed) break;
        } catch (retryErr) {
          lastErr = retryErr;
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 800));
          }
        }
      }
      if (!feed && lastErr) throw lastErr;

      if (feed && feed.items && feed.items.length > 0) {
        anySourceSucceeded = true;
        sourceStatus[source.name] = { lastSuccess: now.toISOString(), status: 'ONLINE', count: feed.items.length };

        // Google News RSS 依相關性排序；先按發布時間由新到舊，避免取到舊標題。
        const byNewest = [...feed.items].sort((a, b) => (Date.parse(b.pubDate || '') || 0) - (Date.parse(a.pubDate || '') || 0));
        for (const item of byNewest.slice(0, 5)) {
          const rawTitle = item.title ? item.title.trim() : '';
          if (!rawTitle) continue;
          const articleUrl = httpUrl(item.link);
          const summary = source.name.startsWith('Google News') ? '' : plainText(item.contentSnippet || item.summary);
          const rawIdSource = String(item.link || item.guid || rawTitle);
          const newsId = crypto.createHash('sha256').update(rawIdSource).digest('hex').substring(0, 16);
          const publishedAt = item.pubDate ? new Date(item.pubDate) : null;
          newHeadlines.push({
            id: newsId,
            title: rawTitle,
            source: source.name,
            link: articleUrl || '',
            summary,
            summarySourceUrl: summary ? articleUrl : null,
            publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt.toISOString() : null,
            time: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt.toLocaleDateString('zh-TW') : '發布時間未提供'
          });
        }
      }
    } catch (err) {
      sourceStatus[source.name] = { ...sourceStatus[source.name], lastError: err.message, status: 'DEGRADED', lastAttempt: now.toISOString() };
      console.warn(`[FETCHER WARNING] 來源 ${source.name} 抓取逾時或連線限制: ${err.message} (啟用安全基準線快取)`);
    }
  }

  currentData.sourceStatus = sourceStatus;
  currentData.lastScanAttempt = now.toISOString();

  // Run Autonomous Tactical Intelligence Sweep (OpenSky Live ADS-B + Taiwan MND Official + PTT)
  try {
    const tacticalData = await runAutonomousTacticalSweep();
    currentData.liveAirspace = tacticalData.airspace;
    currentData.mndOfficial = tacticalData.mnd;
    currentData.communitySignals = tacticalData.ptt;
    currentData.autonomousAssessment = tacticalData.autonomousAssessment;
    delete currentData.new27Dossier;

    if (tacticalData.airspace.success || tacticalData.mnd.success) {
      anySourceSucceeded = true;
    }
    console.log(`[FETCHER] 來源檢查完成：OpenSky ${tacticalData.airspace.success ? '成功' : '失敗'}，共機新聞標題（24小時內）${tacticalData.mnd.success ? tacticalData.mnd.count : '未取得'} 則`);
  } catch (osintErr) {
    console.warn('[FETCHER AUTONOMOUS WARNING]', osintErr.message);
  }

  // Refresh Satellite STAC Imagery Orbit Catalog
  try {
    const catalog = await refreshImageryCatalog();
    const sceneCount = (catalog?.images || []).filter(i => i.sceneCheckStatus === 'ONLINE' && i.catalogScene?.productId).length;
    if (sceneCount > 0) {
      sourceStatus['Element84 Earth Search STAC'] = {
        lastSuccess: catalog.checkSkipped ? catalog.lastCatalogCheckAt : now.toISOString(),
        status: 'ONLINE',
        count: sceneCount
      };
      if (!catalog.checkSkipped) anySourceSucceeded = true;
    } else {
      sourceStatus['Element84 Earth Search STAC'] = { ...sourceStatus['Element84 Earth Search STAC'], status: 'DEGRADED', lastAttempt: now.toISOString() };
    }
  } catch (stacErr) {
    console.warn('[FETCHER STAC WARNING]', stacErr.message);
  }

  // Only update lastUpdated if at least one data source succeeded
  if (anySourceSucceeded) {
    currentData.lastUpdated = now.toISOString();
    currentData.lastUpdatedDisplay = formatCSTDate(now);
  }
  currentData.sources = Object.entries(sourceStatus).filter(([, state]) => state.status === 'ONLINE' && state.lastSuccess === now.toISOString()).map(([name]) => name);

  // Dynamic Global Crisis & Escalation Metrics Engine Calculation
  const metrics = calculateGlobalCrisisMetrics(currentData, {
    airspace: currentData.liveAirspace,
    mnd: currentData.mndOfficial
  });

  if (metrics.crisisIndex !== null) {
    currentData.crisisIndex = metrics.crisisIndex;
    currentData.defconLevel = metrics.defconString;
    currentData.defconNumeric = metrics.defconNumeric;
    currentData.defconName = metrics.defconName;
    currentData.threatAssessment = metrics.threatAssessment;
    currentData.crisisFactors = metrics.factors;
    // Internal model fields remain nullable and are never official alert levels.
    currentData.crisisIsModelEstimate = metrics.isModelEstimate === true;
    currentData.crisisDataConfidence = metrics.dataConfidence || 'UNKNOWN';
    currentData.crisisObservedSources = metrics.observedSources;
    currentData.crisisEvaluatedAt = now.toISOString();
  } else {
    // A stale score must never be displayed with a new scan timestamp.
    currentData.crisisIndex = null;
    currentData.defconLevel = null;
    currentData.defconNumeric = null;
    currentData.defconName = null;
    currentData.threatAssessment = null;
    currentData.crisisFactors = metrics.factors;
    currentData.crisisIsModelEstimate = true;
    currentData.crisisDataConfidence = 'NONE';
    currentData.crisisObservedSources = metrics.observedSources;
    currentData.crisisEvaluatedAt = null;
  }

  // live_intel.json is the only store for observations and model availability.
  // /api/status and /api/conflicts project those fields on request.

  // Deduplicate and filter breaking news: only preserve fresh pinned events (strictly within 24H and must have publishedAt)
  const existingPinned = (currentData.latestBreakingNews || []).filter(item => {
    if (!item.pinned) return false;
    if (item.publishedAt) {
      const pubTime = new Date(item.publishedAt).getTime();
      if (!isNaN(pubTime)) {
        const ageHours = (now.getTime() - pubTime) / (3600 * 1000);
        return ageHours >= 0 && ageHours <= 24; // Automatically unpin after 24 hours
      }
    }
    return false;
  });

  // Preserve previous unexpired news (< 24H) to prevent momentary RSS drops from wiping valid headlines
  const existingFresh = (currentData.latestBreakingNews || []).filter(item => {
    if (!item.publishedAt) return false;
    const pubTime = new Date(item.publishedAt).getTime();
    if (isNaN(pubTime)) return false;
    const ageMs = now.getTime() - pubTime;
    return ageMs >= 0 && ageMs <= 24 * 60 * 60_000;
  });

  const seenIds = new Set();
  const seenTitles = new Set();
  const mergedPool = [];

  for (const item of [...newHeadlines, ...existingPinned, ...existingFresh]) {
    if (!item || !item.title) continue;
    const cleanTitle = item.title.trim().toLowerCase();
    if (item.id && seenIds.has(item.id)) continue;
    if (seenTitles.has(cleanTitle)) continue;
    if (item.id) seenIds.add(item.id);
    seenTitles.add(cleanTitle);
    mergedPool.push(item);
  }

  // Sort by publishedAt descending, keep top 15
  mergedPool.sort((a, b) => {
    const tA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return tB - tA;
  });

  currentData.latestBreakingNews = mergedPool.slice(0, 15);
  const capabilityResults = await newCollectors;
  const capabilityNames = ['Taiwan_MND', 'Satellite_Assets', 'UKMTO', 'Ukraine_Air_Force', 'DeepStateMap', 'China_MSA', 'Japan_Joint_Staff', 'PLA_Joint_News', 'Taiwan_Infra', 'NATO_Flank_News', 'Markets', 'Diplomacy_News', 'Taiwan_Civil', 'USNI_Fleet', 'Regional_News', 'Mobilization_News'];
  currentData.capabilityStatus = capabilityResults.map((result, index) => ({source: capabilityNames[index], status:result.status === 'fulfilled' ? result.value.status : 'DEGRADED'}));

  // 戰區預警看板：新資料到齊後記錄等級快照（只由此常駐程序寫入），供 48 小時不降級與週趨勢使用
  try {
    const { getWarningBoard, recordWarningSnapshot } = require('./warning_board');
    recordWarningSnapshot(getWarningBoard());
  } catch (warnErr) {
    console.warn('[WARNING BOARD]', warnErr.message);
  }

  try {
    const research = await refreshResearchSources();
    currentData.researchStatus = { lastCheckedAt: research.lastCheckedAt, sources: research.sources };
  } catch (error) {
    console.warn('[RESEARCH FETCH]', error.message);
  }

  const tempFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempFile, JSON.stringify(currentData, null, 2), 'utf8');
    fs.renameSync(tempFile, DATA_FILE);
    console.log(`[FETCHER SUCCESS] 即時戰資庫已成功更新！時間戳: ${currentData.lastUpdatedDisplay}`);
    return { success: true, data: currentData };
  } catch (err) {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    console.error('[FETCHER ERROR] 寫入 live_intel.json 失敗:', err.message);
    return { success: false, error: err.message, data: currentData };
  }
}

// Allow direct CLI execution
if (require.main === module) {
  fetchLiveIntelligence().then(res => {
    console.log('Fetcher finished:', res.success ? 'OK' : 'FAIL');
    process.exit(0);
  });
}

module.exports = {
  fetchLiveIntelligence,
  getExistingData,
  calculateGlobalCrisisMetrics
};
