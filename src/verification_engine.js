/**
 * WordWar_News - Autonomous Multi-Source Verification & Reliability Engine (src/verification_engine.js)
 * Publisher classification and unverified lead quarantine; not a certified NATO assessment.
 * 
 * Autonomously cross-references raw OSINT headlines and military leads across:
 * 1. Multi-source reputable defense wires (Reuters, AP, BBC, Defense News, ISW, Ukrenergo)
 * 2. Physical telemetry (NASA FIRMS VIIRS satellite thermal anomaly clusters)
 * 3. Airspace & NOTAM telemetry (Active/advance closures, emergency squawks)
 * 4. Official defense releases & state infrastructure status
 * 
 * Rules:
 * - Publisher classification never establishes event truth or triggers a verified broadcast.
 * - Unreviewed leads stay in quarantine; source-backed reports use research_reports.js.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const QUARANTINE_FILE = path.join(__dirname, '../research/noise_quarantine.json');
const FIRMS_CACHE_FILE = path.join(__dirname, '../public/data/firms_cache.json');
const RESEARCH_SOURCES_FILE = path.join(__dirname, '../research/sources.json');

// Source Credibility Classification & Tiering
const SOURCE_PROFILES = {
  // Tier 1: Primary Official / Leading Global Wires (Reliability A / B)
  TIER_1: [
    { pattern: /mnd\.gov\.tw|國防部|中華民國國防部/i, name: '台灣國防部 (MND)', reliability: 'A', tier: 1 },
    { pattern: /defense\.gov|pentagon|美國國防部/i, name: '美國國防部 (DoD)', reliability: 'A', tier: 1 },
    { pattern: /nato\.int|北約/i, name: '北大西洋公約組織 (NATO)', reliability: 'A', tier: 1 },
    { pattern: /ukrenergo|energoatom|烏克蘭國家電網/i, name: '烏克蘭國家能源公司 (Ukrenergo)', reliability: 'A', tier: 1 },
    { pattern: /reuters|路透/i, name: '路透社 (Reuters)', reliability: 'B', tier: 1 },
    { pattern: /associated press|\bap\b|美聯社/i, name: '美聯社 (AP)', reliability: 'B', tier: 1 },
    { pattern: /\bafp\b|法新社/i, name: '法新社 (AFP)', reliability: 'B', tier: 1 },
    { pattern: /\bbbc\b|英國廣播公司/i, name: 'BBC News', reliability: 'B', tier: 1 },
    { pattern: /bloomberg|彭博/i, name: '彭博新聞社 (Bloomberg)', reliability: 'B', tier: 1 },
    { pattern: /understandingwar\.org|isw|戰爭研究所/i, name: '戰爭研究所 (ISW)', reliability: 'B', tier: 1 }
  ],

  // Tier 2: Specialized Military & Defense Portals (Reliability B / C)
  TIER_2: [
    { pattern: /defensenews|國防新聞/i, name: 'Defense News', reliability: 'B', tier: 2 },
    { pattern: /usni|美國海軍學會/i, name: 'USNI News', reliability: 'B', tier: 2 },
    { pattern: /the war zone|twz|戰區/i, name: 'The War Zone (TWZ)', reliability: 'B', tier: 2 },
    { pattern: /janes|珍氏/i, name: 'Jane\'s Defense', reliability: 'B', tier: 2 },
    { pattern: /naval news|海軍新聞/i, name: 'Naval News', reliability: 'B', tier: 2 },
    { pattern: /cna\.com\.tw|中央社/i, name: '中央通訊社 (CNA)', reliability: 'B', tier: 2 },
    { pattern: /defense one/i, name: 'Defense One', reliability: 'B', tier: 2 }
  ],

  // Tier 3: Mainstream General Media (Reliability C / D)
  TIER_3: [
    { pattern: /al jazeera|半島電視台/i, name: '半島電視台 (Al Jazeera)', reliability: 'C', tier: 3 },
    { pattern: /ukrinform|烏克蘭國家通訊社/i, name: 'Ukrinform', reliability: 'C', tier: 3 },
    { pattern: /libertytimes|ltn|自由時報/i, name: '自由時報', reliability: 'C', tier: 3 },
    { pattern: /udn|聯合報/i, name: '聯合報', reliability: 'C', tier: 3 },
    { pattern: /tvbs/i, name: 'TVBS 新聞', reliability: 'C', tier: 3 },
    { pattern: /focus taiwan/i, name: 'Focus Taiwan', reliability: 'C', tier: 3 }
  ],

  // Tier 4: Aggregators, Content Farms, Shopping Portals, Unverified Secondary (Reliability E / F)
  TIER_4: [
    { pattern: /biggo|比價|財經/i, name: 'BigGo 商業聚合', reliability: 'E', tier: 4, isAggregator: true },
    { pattern: /yahoo|奇摩/i, name: 'Yahoo 聚合轉載', reliability: 'E', tier: 4, isAggregator: true },
    { pattern: /line today/i, name: 'LINE TODAY 聚合', reliability: 'E', tier: 4, isAggregator: true },
    { pattern: /新唐人/i, name: '新唐人電視台', reliability: 'E', tier: 4, isAggregator: true },
    { pattern: /美洲台灣日報/i, name: '美洲台灣日報', reliability: 'E', tier: 4, isAggregator: true }
  ]
};

/**
 * Classifies a news source into its credibility tier and Admiralty reliability code
 */
function classifySource(sourceName = '', url = '') {
  let hostname='';
  try { const u=new URL(url); if(u.protocol==='https:' && !u.username && !u.password) hostname=u.hostname.toLowerCase(); } catch (_) {}
  const trusted = {'www.mnd.gov.tw':'國防部','mnd.gov.tw':'國防部','www.reuters.com':'Reuters','reuters.com':'Reuters','www.bbc.com':'BBC','www.bbc.co.uk':'BBC','apnews.com':'Associated Press','www.defensenews.com':'defensenews','www.defense.gov':'defense.gov','www.nato.int':'nato.int','www.understandingwar.org':'understandingwar.org','www.cna.com.tw':'cna.com.tw'};
  // Display names, URL paths and query strings cannot impersonate an official publisher.
  const combined = trusted[hostname] || (/biggo|yahoo|line today/i.test(sourceName) ? sourceName : '');
  
  // Check Tier 1
  for (const p of SOURCE_PROFILES.TIER_1) {
    if (p.pattern.test(combined)) return { ...p, label: `Tier 1: 權威防務/國際通訊社 (${p.name})` };
  }
  // Check Tier 2
  for (const p of SOURCE_PROFILES.TIER_2) {
    if (p.pattern.test(combined)) return { ...p, label: `Tier 2: 專業軍事智庫/專題媒體 (${p.name})` };
  }
  // Check Tier 4 (Aggregators & Content Farms - match first before general)
  for (const p of SOURCE_PROFILES.TIER_4) {
    if (p.pattern.test(combined)) return { ...p, label: `Tier 4: 商業聚合/次級轉載 (${p.name})` };
  }
  // Check Tier 3
  for (const p of SOURCE_PROFILES.TIER_3) {
    if (p.pattern.test(combined)) return { ...p, label: `Tier 3: 一般主流綜合媒體 (${p.name})` };
  }

  // Fallback for unknown / general sources
  return {
    name: sourceName || '未標示來源',
    pattern: null,
    tier: 4,
    reliability: 'F',
    isAggregator: true,
    label: `Tier 4: 未經認證之次級來源或網路轉貼 (${sourceName || '未知'})`
  };
}

/**
 * Extracts tactical entities, theater, action type, and infrastructure claims from text
 */
function extractEventEntities(title = '', summary = '') {
  const text = `${title} ${summary}`.toLowerCase();

  // Theater extraction
  let theater = 'global';
  let theaterName = '全球其他戰區';
  if (/烏克蘭|ukraine|俄羅斯|russia|基輔|kyiv|哈爾科夫|kharkiv|頓巴斯|donbas|扎波羅熱|zaporizhzhia|敖德薩|odesa/i.test(text)) {
    theater = 'ukraine_front';
    theaterName = '烏俄前線與烏克蘭全境';
  } else if (/台海|taiwan|國防部|共機|共艦|中線|adiz|防空識別區|巴士海峽|金門|澎湖/i.test(text)) {
    theater = 'taiwan_strait';
    theaterName = '台海與周邊空海域';
  } else if (/中東|伊朗|iran|霍爾木茲|hormuz|紅海|red sea|以色列|israel|黎巴嫩|lebanon/i.test(text)) {
    theater = 'middle_east';
    theaterName = '中東與紅海走廊';
  }

  // Action type extraction
  let actionType = 'OTHER_OSINT';
  if (/空襲|airstrike|轟炸|猛轟|飽和打擊/i.test(text)) actionType = 'AIRSTRIKE';
  else if (/無人機|drone|shahed|見證者|熱爾貝拉/i.test(text)) actionType = 'DRONE_ATTACK';
  else if (/飛彈|導彈|missile|極音速|hypersonic|彈道/i.test(text)) actionType = 'MISSILE_STRIKE';
  else if (/封鎖|blockade|隔離|quarantine/i.test(text)) actionType = 'BLOCKADE';
  else if (/演習|軍演|drill|exercise|實彈/i.test(text)) actionType = 'EXERCISE';

  // Infrastructure & impact claims
  const impactClaims = [];
  if (/斷網|斷電|資料中心|data center|電網|power outage|blackout/i.test(text)) {
    impactClaims.push('關鍵基礎設施受損（電網/資料中心斷網斷電）');
  }
  if (/平民死亡|傷亡|casualt/i.test(text)) {
    impactClaims.push('有人員與平民傷亡回報');
  }
  if (/防空攔截|擊落|intercept/i.test(text)) {
    impactClaims.push('防空系統實施緊急攔截');
  }

  return { theater, theaterName, actionType, impactClaims };
}

/**
 * Autonomously checks NASA FIRMS VIIRS satellite thermal telemetry in the theater
 */
function verifyPhysicalTelemetry(theater, liveData = {}) {
  let feed = liveData.firmsFeed;
  if (!feed && fs.existsSync(FIRMS_CACHE_FILE)) {
    try { feed = JSON.parse(fs.readFileSync(FIRMS_CACHE_FILE,'utf8'))[theater]; } catch (_) {}
  }
  const stamp = Date.parse(feed?.fetchedAt || '');
  const fresh = Number.isFinite(stamp) && stamp <= Date.now() && Date.now()-stamp <= 30*60*1000;
  return { corroborated:false, status:feed?.success && feed.theater===theater && fresh ? 'CONTEXT_ONLY':'UNAVAILABLE',
    details:'熱異常可能來自野火、農業或工業；尚未建立事件地點、時間與原因的對應，不能證實軍事攻擊。' };
}

/**
 * Determines whether two items report the same specific military incident
 */
function areSameIncident(entitiesA, entitiesB, itemA, itemB) {
  // Keyword overlap only discovers related leads. A reviewed event identity is required for matching.
  const a=Date.parse(itemA.publishedAt || ''), b=Date.parse(itemB.publishedAt || '');
  return !!itemA.reviewedEventId && itemA.reviewedEventId===itemB.reviewedEventId &&
    Number.isFinite(a) && Number.isFinite(b) && a<=Date.now() && b<=Date.now() && Math.abs(a-b)<=86400000;
}

/**
 * Cross-references a candidate headline against all items in news pool & cached research documents
 */
function crossReferenceNewsPool(candidate, newsPool = []) {
  const cTitle = (candidate.title || '').toLowerCase();
  const cSource = (candidate.source || '').toLowerCase();
  const cId = candidate.id || candidate.link || '';

  const corroborating = [];
  const checkedEntities = extractEventEntities(candidate.title, candidate.summary || '');

  // 1. Cross-check against newsPool
  for (const item of newsPool) {
    if (!item || !item.title) continue;
    const itemId = item.id || item.link || '';
    if (itemId === cId) continue; // Skip itself
    if (item.title.trim().toLowerCase() === cTitle.trim().toLowerCase()) continue;

    const itemEntities = extractEventEntities(item.title, item.summary || '');
    if (areSameIncident(checkedEntities, itemEntities, candidate, item)) {
      const profile = classifySource(item.source, item.link);
      if (profile.name === classifySource(candidate.source,candidate.link).name ||
          (candidate.originGroup && candidate.originGroup === item.originGroup)) continue;
      corroborating.push({
        title: item.title,
        source: profile.name,
        tier: profile.tier,
        reliability: profile.reliability,
        link: item.link,
        publishedAt: item.publishedAt
      });
    }
  }

  // 2. Cross-check against research/sources.json
  try {
    if (fs.existsSync(RESEARCH_SOURCES_FILE)) {
      const research = JSON.parse(fs.readFileSync(RESEARCH_SOURCES_FILE, 'utf8'));
      for (const doc of research.documents || []) {
        if (!doc || !doc.body) continue;
        const docEntities = extractEventEntities(doc.title || '', doc.body);
        if (areSameIncident(checkedEntities, docEntities, candidate, doc)) {
          const profile=classifySource(doc.publisher,doc.url);
          if (doc.url === candidate.link || profile.name === classifySource(candidate.source,candidate.link).name ||
              (candidate.originGroup && candidate.originGroup === doc.originGroup)) continue;
          corroborating.push({
            title: doc.title,
            source: doc.publisher || '權威軍事研究庫',
            tier: profile.tier,
            reliability: profile.reliability,
            link: doc.url,
            publishedAt: doc.publishedAt
          });
        }
      }
    }
  } catch (_) {}

  // Filter unique sources
  const seenSources = new Set();
  const uniqueCorroborating = [];
  for (const c of corroborating) {
    if (!seenSources.has(c.source)) {
      seenSources.add(c.source);
      uniqueCorroborating.push(c);
    }
  }

  const hasTier1 = uniqueCorroborating.some(c => c.tier === 1);
  const hasTier2 = uniqueCorroborating.some(c => c.tier === 2);

  return {
    count: uniqueCorroborating.length,
    sources: uniqueCorroborating,
    hasTier1,
    hasTier2
  };
}

/**
 * Autonomously evaluates intelligence reliability and assigns NATO/Admiralty Rating
 */
function evaluateIntelligenceReliability(candidate, liveData = {}, newsPool = []) {
  const rawTitle=candidate.title || '', cleanTitle=rawTitle;
  const sourceProfile=classifySource(candidate.source || '',candidate.link || '');
  const entities=extractEventEntities(rawTitle,candidate.summary || '');
  const crossCheck=crossReferenceNewsPool(candidate,newsPool);
  const physicalTelemetry=verifyPhysicalTelemetry(entities.theater,liveData);
  // A publisher profile or heuristic match cannot establish the truth of this particular claim.
  const infoCredibility=sourceProfile.tier<=2 ? '3':'4';
  const sourceReliability=sourceProfile.reliability==='F'?'E':sourceProfile.reliability;
  const tacticalAssessment=generateTacticalAssessment(cleanTitle,entities,physicalTelemetry,crossCheck);
  return {candidateId:candidate.id || candidate.link || crypto.randomUUID(),rawTitle,cleanTitle,eventTitle:cleanTitle,
    sourceProfile,entities,crossCheck,physicalTelemetry,airspaceCorroboration:{active:false,details:'尚未查證事件與通告的對應'},
    sourceReliability,infoCredibility,admiraltyGrade:sourceReliability+infoCredibility,
    verdict:'QUARANTINED',eligibleForBroadcast:false,level:'ELEVATED',
    executiveSummary:tacticalAssessment.executiveSummary,tacticalAssessment,
    limitation:'來源分級僅供整理；事件獨立性、原文事實與影響尚未人工審核。正式報導由研究稿驗證流程發布。'};
}

/**
 * Synthesizes tactical assessment from verified data
 */
function generateTacticalAssessment(title, entities, physicalTelemetry, crossCheck) {
  return {
    executiveSummary: '公開報導線索：' + title + '。事件尚未查證，以下欄位均待人工覆核後填寫。',
    // NOTE: 作戰意圖、受損目標、已排除假消息等欄位不由標題自動推導，
    // 必須由研究人員查核原文、來源關係與事件時間後，手動錄入 research_reports.js。
    sensorProof: physicalTelemetry.details,
    corroboratingSourceCount: crossCheck.count,
    // 明確標示：此處沒有「已排除假消息」或「已確認真實」的自動結論
    verdictNote: '來源分級與關鍵字比對不能建立事件真實性。正式研究稿由人工核查後透過 research_reports.js 發布。',
    strategicImplication: '請查核原始報導、來源關係與事件時間；不由標題推導戰況。'
  };
}

/**
 * Quarantines unverified noise / content farm items to research/noise_quarantine.json
 */
function quarantineNoise(candidate, evaluation) {
  try {
    let records = [];
    if (fs.existsSync(QUARANTINE_FILE)) {
      try { records = JSON.parse(fs.readFileSync(QUARANTINE_FILE, 'utf8')); } catch (_) { records = []; }
    }
    
    // Prevent duplicate quarantine records
    const cid = candidate.id || candidate.link || candidate.title;
    if (records.some(r => r.id === cid)) return;

    const quarantineRecord = {
      id: cid,
      title: candidate.title,
      source: candidate.source || '未標示',
      sourceTier: evaluation.sourceProfile.tier,
      admiraltyGrade: evaluation.admiraltyGrade,
      quarantinedAt: new Date().toISOString(),
      reason: '事件尚未完成原文、來源獨立性與時空對應查證，保留為待查線索；不代表已判定是假消息。'
    };

    records.unshift(quarantineRecord);
    if (records.length > 100) records = records.slice(0, 100);

    fs.mkdirSync(path.dirname(QUARANTINE_FILE), { recursive: true });
    fs.writeFileSync(QUARANTINE_FILE, JSON.stringify(records, null, 2), 'utf8');
  } catch (err) {
    console.error('[QUARANTINE WRITE ERROR]', err.message);
  }
}

/**
 * Returns recent quarantined records
 */
function getQuarantineRecords(limit = 10) {
  try {
    if (fs.existsSync(QUARANTINE_FILE)) {
      const records = JSON.parse(fs.readFileSync(QUARANTINE_FILE, 'utf8'));
      return records.slice(0, limit);
    }
  } catch (_) {}
  return [];
}

/**
 * Formats an authoritative Verified Military Intelligence Special Report for Discord DM
 */
function formatVerifiedSitrep(evaluation) {
  const grade = evaluation.admiraltyGrade || 'E4';
  const tier = evaluation.sourceProfile?.tier || 4;
  const isAggregator = evaluation.sourceProfile?.isAggregator;
  const theaterName = evaluation.entities?.theaterName || '全區';
  
  let verdictTitle = '';
  let verdictExplanation = '';
  
  if (tier === 4 || isAggregator) {
    verdictTitle = '⚠️【低可靠度／疑似聚合農場噪音】';
    verdictExplanation = '情報來自商業聚合轉載或未認證次級管道，未獲一級官方通訊社證實，且無實體物理觀測佐證。系統已自主隔離，不予推播。';
  } else if (tier <= 2 && evaluation.crossCheck.count >= 1 && evaluation.physicalTelemetry.corroborated) {
    verdictTitle = '✅【高可靠度／多源佐證事件】';
    verdictExplanation = '獲得多個獨立一級防務來源共同報導，並與實體觀測訊號吻合。';
  } else {
    verdictTitle = 'ℹ️【待查線索／單一來源尚未證實】';
    verdictExplanation = '雖有媒體提及，但目前缺乏第二獨立來源交叉佐證，且無物理遙測或官方通告吻合，尚未達作戰預警門檻。';
  }

  const lines = [
    '# 🛡️ 公開情報自主驗證報告 // SITREP REVIEW',
    `**檢驗標題**：${evaluation.cleanTitle}`,
    `**綜合判定**：${verdictTitle}`,
    `> 💡 **分析結論**：${verdictExplanation}`,
    '',
    '### 📊 多維度交叉比對矩陣 (Multi-Vector Matrix)',
    `• **北約/海軍評級 (Admiralty Rating)**：\`${grade}\`（來源可靠度: \`${evaluation.sourceReliability}\`，內容可信度: \`${evaluation.infoCredibility}\`）`,
    `• **來源層級判定**：${evaluation.sourceProfile.label || evaluation.sourceProfile.name}`,
    `• **所屬戰區歸類**：${theaterName} (${evaluation.entities?.actionType || '一般觀察'})`,
    `• **物理遙測 (NASA VIIRS)**：${evaluation.physicalTelemetry.details}`,
    `• **空情管制 (Airspace/NOTAM)**：${evaluation.airspaceCorroboration.details}`,
    `• **獨立來源交叉比對**：檢索到 ${evaluation.crossCheck.count} 筆獨立來源${evaluation.crossCheck.count > 0 ? '' : '（無第二方獨立佐證）'}`,
    '',
    '### 🔒 系統自主處置',
    '• **狀態**：待查（已自動封存記錄，不發送騷擾或未證實警報，避免成為無效垃圾推播）',
    '• **約束原則**：不能證實軍事攻擊；來源分類與關鍵字比對不能建立事件真實性。正式研究稿由人工核查後透過 research_reports.js 發布。'
  ];

  if (evaluation.crossCheck.sources && evaluation.crossCheck.sources.length) {
    lines.push('');
    lines.push('### 🔗 關聯報導來源（獨立性待核）：');
    for (const source of evaluation.crossCheck.sources) {
      lines.push(`- ${source.source}：${source.title || ''} ${source.link ? `[連結](${source.link})` : ''}`);
    }
  }

  return lines.join('\n').slice(0, 2000);
}

module.exports = {
  SOURCE_PROFILES,
  classifySource,
  extractEventEntities,
  verifyPhysicalTelemetry,
  crossReferenceNewsPool,
  evaluateIntelligenceReliability,
  generateTacticalAssessment,
  quarantineNoise,
  getQuarantineRecords,
  formatVerifiedSitrep
};
