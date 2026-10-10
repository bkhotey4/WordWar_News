'use strict';
// 回覆內容組裝：即時資料讀取、說明、限制、哨兵狀態、衛星、空域與簡報
const fs = require('fs');
const path = require('path');

const { SYSTEM_LIMITATIONS } = require('../health_monitor');
const { getQuarantineRecords } = require('../verification_engine');
// New modules (Open Teacher code review additions)
const state = require('./state');
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

function createHelpPayload() {
  return {
    sourceBacked: true,
    content: [
      '# WorldWar News 公開來源查詢',
      '• `/poster`：戰況海報（簡報風格重點大圖），不選戰區＝全球重點。',
      '• `/battle-map`：戰場圖（衛星底圖＋控制區／事件地點＋中文說明），全部戰區都有。',
      '• `/weekly`：每週戰況週報圖卡（週日晚上 8 點後也會自動推播）。',
      '• `/prepare`：準備清單，依家中人數與天數換算要買什麼；台海預警升級時也會主動提醒。',
      '• `/warning`：戰區預警看板（試行中），顯示四級警戒與觸發指標。',
      '• `/taiwan-status`、`/taiwan-trend`：官方台海通報與歷史觀測。',
      '• `/events`、`/corrections`：來源事件與更正紀錄。',
      '• `/satellite`、`/satellite-compare`：實際來源縮圖與不同日期比對。',
      '• `/alert-explain`：統計觀察的觸發依據與不足之處。',
      '• `/firms`：NASA FIRMS 衛星熱點與戰區熱異常偵測。',
      '• `/notam`：飛航公告 (NOTAM) 與海空演習設置預警。',
      '• `/war-report`：通過來源檢查的中文研究稿。',
      '• `/airspace`、`/sky-scan`：最近 15 分鐘的 OpenSky 公開 ADS-B 回傳。',
      '• `/osint`：公開空域與新聞彙整來源狀態。',
      '• `/imint`：衛星產品目錄；舊圖卡尚未驗證。',
      '• `/briefing`、`/dm-briefing`、`/daily-briefing`：繁體中文研究報導（最新消息、研判與待確認事項）。',
      '• `/verify`：公開報導查證與來源比對（不代表事件已證實）。',
      '• `/sentry`、`/refresh`：巡檢狀態與重新擷取。',
      '• `/limitations`：系統已知限制與誠信告知。',
      '• `/dm-subscribe`、`/dm-unsubscribe`：管理私訊訂閱。',
      '私訊可輸入「週報」、「準備清單」（可加人數天數，如「準備清單 3人 14天」）、「海報」「台海海報」、「戰場圖」（可加戰區，如「台海戰場圖」）、「來源狀態」、「預警」、「全球戰況」、「台海」、「台海趨勢」、「火點」、「禁航」、「衛星照片」、「戰況報導」、「查證」、「更新」、「哨兵」或「指令」。',
      '舊版圖卡、危機指數與未核實專題已暫停。'
    ].join('\n'),
    files: []
  };
}

/**
 * 🛡️ Sentry Status Payload
 */
function createSentryStatusPayload() {
  const data = getLiveIntelData();
  const lastPatrol = Number.isFinite(Date.parse(state.lastPatrolTime)) ? state.lastPatrolTime : '尚未巡檢';
  const allQuarantineRecords = getQuarantineRecords(100);
  const quarantineRecords=allQuarantineRecords.slice(0,5);
  const qList = quarantineRecords.length > 0
    ? quarantineRecords.map((q, idx) => `  ${idx + 1}. [${q.admiraltyGrade}] ${q.title.slice(0, 32)}... (來源: ${q.source})`).join('\n')
    : '  目前無新隔離紀錄（運作正常）';

  return {
    sourceBacked: true,
    content: [
      '# 🛡️ 哨兵情報巡檢與來源交叉驗證 // SENTRY HUD',
      `> 🕒 **最近巡檢時間**: \`${lastPatrol}\` ｜ 🔁 **巡查頻率**: \`每 3 分鐘自動巡檢\``,
      '',
      '### 🛰️ 一、多源偵測與基線監控',
      refreshSummary(data),
      '• **台海動態**: 官方每日通報 P95 統計僅供觀察，尚未啟用統計異常推播' ,
      '• **民航管制**: NOTAM 官方自動採集尚未設定；匯入通告須附來源與查核紀錄',
      '• **即時熱點**: NASA FIRMS 支援指令查詢；熱點不能單獨證實攻擊',
      '• **空中緊急**: OpenSky ADS-B 7700 緊急應答機代碼監控（待查）',
      '',
      '### 🧹 二、來源隔離與雜訊過濾',
      '• **未核實線索**: 未核實新聞只作為線索，須經研究稿比對原文並引用來源後才可作為證據',
      `• **待查佇列（最近）**: 共 \`${allQuarantineRecords.length}\` 筆（最多保存最近 100 筆，未經事件核實）：`,
      qList,
      '',
      '> 🧭 **系統說明**: 系統尚未建立事件自動核實模型，單一未核實來源或轉載（如 BigGo 財經）會自動進入雜訊隔離，只作待查線索，待研究稿完成人工覆核後才發布。'
    ].join('\n').slice(0, 2000),
    files: []
  };
}

/**
 * 🛰️ 2.9 Real Satellite Reconnaissance & Threat Fusion (OSINT / IMINT Dossier)
 * Covers:
 *  - 'sabina': South China Sea Sabina Shoal (CCG 5901 monster ship ramming MRRV-9701 & water cannons)
 *  - 'longtian': Fujian Longtian Forward Airbase (24 Hardened Shelters, 2800m runway, 7 min to Taipei)
 *  - 'asia': Xinjiang Ruoqiang desert targets (E-767, F-35, Patriot, Bo'ai, Carrier)
 *  - 'europe': Toropets 107 GRAU explosion & Suwalki Baltic defenses
 *  - 'all' / 'new': Dispatches newly synthesized top-tier hot-zone dossiers
 */
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

module.exports = { getLiveIntelData, modelLevel, modelIndex, refreshSummary, safeOutgoingPayload, createVerifiedBriefingPayload, createLimitationsPayload, createHelpPayload, createSentryStatusPayload, createImintPayload, createNewspaperDispatchPayload, createAutonomousAirspacePayload, createSkyScanPayload };
