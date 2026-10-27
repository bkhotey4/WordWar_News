'use strict';
// 回覆內容組裝：即時資料讀取、說明、限制、哨兵狀態、衛星、空域與簡報
const fs = require('fs');
const path = require('path');

const { SYSTEM_LIMITATIONS } = require('../health_monitor');
// New modules (Open Teacher code review additions)
const LIVE_INTEL_FILE = path.join(__dirname, '../../public/data/live_intel.json');

// Read dynamic live intelligence database
function getLiveIntelData() {
  try {
    if (fs.existsSync(LIVE_INTEL_FILE)) {
      return JSON.parse(fs.readFileSync(LIVE_INTEL_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading live_intel.json:', e.message);
  }
  try {
    const conflictsPath = path.join(__dirname, '../../public/data/conflicts.json');
    if (fs.existsSync(conflictsPath)) {
      const cData = JSON.parse(fs.readFileSync(conflictsPath, 'utf8'));
      if (cData.system_status) {
        return {
          lastUpdatedDisplay: cData.system_status.last_updated,
          defconLevel: cData.system_status.defcon_level != null ? `DEFCON ${cData.system_status.defcon_level}: ${cData.system_status.defcon_name}` : null,
          crisisIndex: cData.system_status.escalation_index,
          chinaMobilization: {
            overallStatus: '資料未取得',
            roRoRequisitionRate: null
          }
        };
      }
    }
  } catch (ce) {}

  // ⚠️ 所有來源均不可用 — 不給假數字 (OpenAI Review Defect 2)
  return {
    lastUpdatedDisplay: null,
    defconLevel: null,
    crisisIndex: null,
    crisisIsModelEstimate: true,
    crisisDataConfidence: 'NONE',
    chinaMobilization: {
            overallStatus: '資料未取得 (來源錯誤)',
      roRoRequisitionRate: null
    }
  };
}

function modelLevel(data) {
  const evaluatedAt = Date.parse(data?.crisisEvaluatedAt);
  const fresh = Number.isFinite(evaluatedAt) && Date.now() - evaluatedAt >= 0 && Date.now() - evaluatedAt <= 15 * 60 * 1000;
  return fresh && data?.defconLevel ? `${data.defconLevel}（系統估算，非官方級別）` : '資料不足';
}

function modelIndex(data) {
  const evaluatedAt = Date.parse(data?.crisisEvaluatedAt);
  const fresh = Number.isFinite(evaluatedAt) && Date.now() - evaluatedAt >= 0 && Date.now() - evaluatedAt <= 15 * 60 * 1000;
  return fresh && Number.isFinite(data?.crisisIndex) ? `${data.crisisIndex}（系統估算，非機率）` : '資料不足';
}

function refreshSummary(data) {
  const now = Date.now();
  const recent = value => Number.isFinite(Date.parse(value)) && now - Date.parse(value) >= 0 && now - Date.parse(value) <= 15 * 60 * 1000;
  const sources = Object.entries(data?.sourceStatus || {})
    .filter(([, state]) => state?.status === 'ONLINE' && recent(state.lastSuccess))
    .map(([name]) => name);
  if (data?.liveAirspace?.success && recent(data.liveAirspace.timestamp)) sources.push('OpenSky ADS-B');
  if (data?.mndOfficial?.success && recent(data.mndOfficial.fetchedAt)) sources.push('Google News 新聞彙整');
  return [
    '✅ **資料更新檢查完成**',
    `📡 最近取得: ${sources.length ? [...new Set(sources)].join('、') : '無可用的來源'}`,
    `• 模型觀測級別：${modelLevel(data)}`,
    `• 模型指數：${modelIndex(data)}`,
    (() => {
      try {
        const feed=require('../satellite_assets').getSatelliteFeed();
        return `• 實際衛星影像：${feed.assets?.length || 0} 張通過來源與檔案檢查；背景影像不代表已判讀戰果`;
      } catch (e) {
        return '• 衛星影像：本次來源檢查失敗，請稍後再試影像指令。';
      }
    })()
  ].join('\n');
}

function safeOutgoingPayload(payload) {
  if (payload?.sourceBacked === true) return payload;
  return {
    content: '此主題過去使用未附來源的寫死數據，已暫停當作即時情報。可使用 /airspace、/sky-scan、/imint、/dm-briefing 查詢有來源的最新資料。',
    files: []
  };
}

/**
 * ???? DAILY SCHEDULED INTELLIGENCE DISPATCH: 08:00 Morning / 20:00 Evening Briefing
 */
async function createVerifiedBriefingPayload(data) {
  return require('../report_card').researchCardPayload();
}

function createLimitationsPayload() {
  return {
    sourceBacked: true,
    content: [
      '# 系統已知限制與誠信須知',
      ...SYSTEM_LIMITATIONS.map((lim, idx) => `??**[${idx + 1}]** ${lim}`)
    ].join('\n'),
    files: []
  };
}

const SITE_URL = 'https://bkhotey4.github.io/wordwar-intel/';
// 查詢內容都在網站；機器人只負責主動推播與個人設定
function createHelpPayload() {
  return {
    sourceBacked: true,
    content: [
      '# WorldWar News 機器人',
      `📊 **查詢請看網站**：預警燈號、戰況地圖、研究報導、時間軸、週報與準確度回顧都在 ${SITE_URL}`,
      '',
      '🔔 **機器人負責主動推播**：燈號升級、⚠️ 前兆組合、具名大型演習、研究報導與定時簡報。',
      '',
      '**私訊指令**',
      '• `訂閱`／`取消訂閱`',
      '• `訂閱戰區 台海 美伊`（台海、烏俄、美伊、波蘭、中東、南海、朝鮮；`訂閱戰區 全部` 恢復）',
      '• `推播門檻 全部`／`重要`（略過一般警報）／`緊急`（只收第 3 級以上與前兆組合）',
      '• `靜默 23:00 07:00`／`取消靜默`',
      '• `訂閱設定`：查看目前設定',
      '• `準備清單 3人 14天`：依人數天數換算要買什麼',
      '',
      '**Slash 指令**：`/evidence`（事件原文證據）、`/prepare`（準備清單）、`/preferences`（訂閱設定）、`/dm-subscribe`、`/dm-unsubscribe`、`/help`'
    ].join('\n'),
    files: []
  };
}

// 衛星影像產品目錄狀態（只列 STAC 產品紀錄，不做判讀）
function createImintPayload(data, target = 'all') {
  let catalog = [];
  let catalogFresh = false;
  try {
    const record = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/data/imagery_catalog.json'), 'utf8'));
    const checkedAt = Date.parse(record.lastCatalogCheckAt || '');
    catalogFresh = Number.isFinite(checkedAt) && checkedAt <= Date.now() + 60_000 && Date.now() - checkedAt <= 60 * 60_000;
    catalog = record.images || [];
  } catch (err) {
    console.warn('[IMAGERY CATALOG]', err.message);
  }
  const names = {
            sabina: 'sabina_reference', '仙賓礁': 'sabina_reference', '南海': 'sabina_reference',
    longtian: 'longtian_reference', '龍田': 'longtian_reference',
    europe: 'europe_reference', '托羅佩茨': 'europe_reference',
    suwalki: 'suwalki_reference'
  };
  const selected = target === 'all' || target === 'new' ? catalog : catalog.filter(item => item.id === names[target]);
  const lines = selected.map(item => {
    const scene = item.catalogScene;
    const sceneLine = catalogFresh && item.sceneCheckStatus === 'ONLINE' && scene?.productId && scene?.acquiredAt && scene?.sourceProductUrl
      ? `已比對 STAC 產品 ${scene.productId}；拍攝時間 ${scene.acquiredAt}；產品連結 ${scene.sourceProductUrl}`
      : '目前沒有取得最近的 STAC 產品紀錄';
    return `• ${item.title}：${sceneLine}。本機舊檔與產品的對應尚未驗證。`;
  });
  return {
    sourceBacked: true,
    content: [
      '# 衛星產品目錄與本機舊檔狀態',
      ...(lines.length ? lines : ['• 此分類目前沒有產品紀錄']),
      '產品目錄只代表該區有影像產品；未下載並比對產品像素，不能判斷其中事件，本機舊圖也沒有來源。'
    ].join('\n'),
    embeds: [], components: [], files: []
  };
}

/**
 * 📰 3. Master Warfront Newspaper Dispatch
 */
function createNewspaperDispatchPayload(data) {
  return createVerifiedBriefingPayload(data);
}

/**
 * ✈️ 4.2 Autonomous Taiwan Strait Airspace & Tactical C4ISR Payload
 */
function createAutonomousAirspacePayload(data) {
  const airspace = data?.liveAirspace;
  const mnd = data?.mndOfficial;
  const recent = stamp => Number.isFinite(Date.parse(stamp)) && Date.now() - Date.parse(stamp) >= 0 && Date.now() - Date.parse(stamp) <= 15 * 60 * 1000;
  const airFresh = airspace?.success === true && recent(airspace.timestamp);
  const newsFresh = mnd?.success === true && recent(mnd.fetchedAt);
  const lines = [
    '# 台海來源資料檢查',
    `OpenSky ADS-B 狀態: ${airFresh ? `觀測時間: ${airspace.timestamp}；區域內回傳 ${airspace.totalAircraftInStrait} 筆航空器訊號` : '近期資料未取得'}`,
    'ADS-B 只涵蓋有廣播且被接收的航空器，不能據此推算共機總數。',
    `Google News 新聞彙整：${newsFresh ? `取得時間 ${mnd.fetchedAt}；符合主題的標題 ${mnd.count} 則` : '近期資料未取得'}`,
    '新聞彙整不是國防部原始通報；共機架次須以原始公告核對。',
    `模型觀測級別：${modelLevel(data)}；模型指數：${modelIndex(data)}`
  ];
  return { sourceBacked: true, content: lines.join('\n'), embeds: [], components: [], files: [] };
}

function createSkyScanPayload(data) {
  const airspace = data?.liveAirspace;
  const observedAt = Date.parse(airspace?.timestamp);
  const fresh = airspace?.success === true && Number.isFinite(observedAt) && Date.now() - observedAt >= 0 && Date.now() - observedAt <= 15 * 60 * 1000;
  if (!fresh) return { sourceBacked: true, content: 'OpenSky ADS-B 近 15 分鐘沒有成功取得的公開航空器訊號（可能是 API 限流或連線失敗）。未取得資料不代表空中沒有航空器。'};
  const planes = (airspace.midStraitPlanes || []).slice(0, 6);
  const lines = [
    '# 台海 OpenSky ADS-B 公開空域訊號',
    `觀測時間：${airspace.timestamp}`,
    `區域內回傳：${airspace.totalAircraftInStrait} 筆；中線鄰近：${airspace.midStraitCount} 筆`,
    ...planes.map(p => `• ${p.callsign || p.icao24 || '未知'}：${p.latitude}, ${p.longitude}`),
    ...(planes.length ? [] : ['• 目前沒有中線鄰近航空器訊號。']),
    '公開 ADS-B 訊號不包含所有在空航空器，也不能單獨證明任何軍事活動。'
  ];
  return { sourceBacked: true, content: lines.join('\n'), embeds: [], components: [], files: [] };
}

module.exports = { getLiveIntelData, modelLevel, modelIndex, refreshSummary, safeOutgoingPayload, createVerifiedBriefingPayload, createLimitationsPayload, createHelpPayload, createImintPayload, createNewspaperDispatchPayload, createAutonomousAirspacePayload, createSkyScanPayload };
