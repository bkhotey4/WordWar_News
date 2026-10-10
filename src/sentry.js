/**
 * WordWar_News - Proactive Threat Sentry & Anomaly Detector (src/sentry.js)
 * Evaluates live metrics, tracks keyword escalation, and triggers alert broadcasts.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '../public/data/live_intel.json');
const ALERT_HISTORY_FILE = path.join(__dirname, 'alert_history.json');
const { getTaiwanFeed } = require('./taiwan_intel');
const { getNotamFeed } = require('./notam_monitor');
const { evaluateIntelligenceReliability, quarantineNoise } = require('./verification_engine');

// High-threat & Medium-threat trigger keywords (Bilingual Military & Geo-economic FININT)
const CRITICAL_KEYWORDS = [
  'blockade', '封鎖', 'quarantine', '隔離',
  'missile launch', '飛彈試射', 'joint sword', '聯合利劍',
  'emergency mobilization', '緊急動員', 'martial law', '戒嚴',
  'mdt article 4', '美菲共同防禦條約', 'typhon', '堤豐',
  'red sea attack', 'nuclear alert', '核武警戒',
  'war risk insurance', 'jwc', '戰險', '保費飆升',
  'dump treasuries', '拋售美債', '美債拋售',
  'gold repatriation', '運金回國', '搶運黃金',
  'capital control', '資本管制', '資產凍結',
  'scramble', '緊急升空', 'adiz intrusion', '防空識別區',
  'water cannon', '水砲', 'ramming', '衝撞',
  '侵犯領空', '領空侵犯', '越界', '墜毀', '緊急攔截', '升空攔截',
  'airspace incursion', 'airspace violation', 'drone crash', 'jets scrambled',
  '影子船隊', 'ghost fleet', 'gerbera', '熱爾貝拉', '貨櫃無人機', 'container drone',
  '彈道飛彈', 'ballistic missile', '全面動員', '全線突破', '飽和打擊', 'saturation strike'
];

const ELEVATED_KEYWORDS = [
  'greatest threat', '重大威脅', 'threat to security', '安全威脅',
  'combat patrol', '戰備警巡', 'fleet tracker', '航母動向',
  'air defense', '防空飛彈', 'missile defense', '飛彈防禦',
  'reconnaissance', '偵察', 'drill', '軍演', '演習',
  'carrier strike group', '航母打擊群', 'taiwan strait', '台灣海峽',
  'south china sea', '南海', 'bashi channel', '巴士海峽',
  'drone strike', 'drone attack', '無人機攻擊', '無人機襲擊', '無人機突襲',
  'missile strike', 'airstrike', '飛彈襲擊', '空襲', '猛轟', '防空攔截', 'hypersonic', '高超音速',
  'defense spending', '國防預算', 'ammunition shortage', '彈藥短缺',
  '摩爾多瓦', '羅馬尼亞', '波蘭邊境', '北約領空', '大規模空襲', '無人機越界',
  'nato airspace', 'romania', 'moldova', 'poland border',
  '地中海', '西班牙', '義大利', '法國', 'mediterranean', 'hybrid attack', '混合戰'
];

function getAlertHistory() {
  try {
    if (fs.existsSync(ALERT_HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(ALERT_HISTORY_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[SENTRY ERROR] Reading alert history:', e.message);
  }
  return { history: [] };
}

function saveAlertRecord(alertRecord) {
  const data = getAlertHistory();
  data.history.push({
    ...alertRecord,
    timestamp: new Date().toISOString()
  });
  // Keep last 50 alerts
  if (data.history.length > 50) {
    data.history = data.history.slice(-50);
  }
  const temporary = `${ALERT_HISTORY_FILE}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temporary, ALERT_HISTORY_FILE);
}

function hasEverAlertedNews(eventId, title) {
  if (!eventId && !title) return false;
  const data = getAlertHistory();
  const cleanTitle = (title || '').trim().toLowerCase();
  return data.history.some(h => {
    if (h.eventId && eventId && h.eventId === eventId) return true;
    if (h.newsTitle && cleanTitle && h.newsTitle.trim().toLowerCase() === cleanTitle) return true;
    if (h.title && cleanTitle && cleanTitle.length >= 10 && h.title.toLowerCase().includes(cleanTitle)) return true;
    return false;
  });
}

function isRecentlyAlerted(title, level = 'HIGH') {
  const data = getAlertHistory();
  const now = Date.now();
  // Medium alerts cooldown: 4 hours, Critical: 2 hours to allow escalated updates
  const cooldownHours = level === 'CRITICAL' ? 2 : 4;
  const cutoff = now - (cooldownHours * 60 * 60 * 1000);
  return data.history.some(h => h.title === title && new Date(h.timestamp).getTime() > cutoff);
}

/**
 * Evaluates live data and returns an alert object if any threshold is breached.
 * Supports both CRITICAL (Red) and ELEVATED/MEDIUM (Yellow) alerts.
 */
function evaluateThreats(liveData, taiwanFeed = null, options = {}) {
  if (!liveData) return null;
  const now = Date.now();
  const recent = (value, maxAge) => {
    const stamp = Date.parse(value);
    return Number.isFinite(stamp) && stamp <= now && now - stamp <= maxAge;
  };

  // Taiwan Strait MND Anomaly Review (P95 statistical baseline)
  try {
    const feed = taiwanFeed || (liveData && liveData.taiwanIntel);
    if (feed?.status === 'AVAILABLE' && feed?.assessment?.pushEnabled === true && feed?.assessment?.mode !== 'OBSERVATION_ONLY' && recent(feed.latest?.observation?.periodEnd, 48*60*60*1000) && feed?.assessment?.status === 'ANOMALY_REVIEW') {
      const anomalyIndicators = (feed.assessment.indicators || []).filter(i => i.status === 'ABOVE_HISTORICAL_P95');
      if (anomalyIndicators.length > 0) {
        const doc = feed.latest;
        const details = anomalyIndicators.map(i => (i.metric === 'aircraft' ? '共機' : i.metric === 'ships' ? '共艦' : i.metric === 'officialVessels' ? '公務船' : i.metric) + '目前 ' + i.current + i.unit + '（歷史P95為 ' + i.historicalP95 + i.unit + '）').join('、');
        const title = '台海官方軍事動態異常待查：共軍活動逾越歷史第95百分位（' + details + '）';
        if (!isRecentlyAlerted(title, 'ELEVATED')) {
          return {
            level: 'ELEVATED',
            code: 'TAIWAN_STRAIT_ANOMALY',
            title,
            category: '官方數據統計異常待查',
            summary: '國防部通報統計期間 ' + (doc?.observation?.periodStart || '') + ' 至 ' + (doc?.observation?.periodEnd || '') + '。統計指標逾越基準窗口 P95：' + details + '。請核對官方示意圖與其他公開情資，尚未確認戰備等級變更。',
            sourceUrl: doc?.url || 'https://www.mnd.gov.tw/',
            observedAt: doc?.observation?.periodEnd || new Date(now).toISOString()
          };
        }
      }
    }
  } catch (err) {
    // Fail closed on evaluation error
  }

  // 2. NOTAM Military Airspace Restriction Advance Warning
  try {
    const notamFeed = liveData?.notamFeed;
    const criticalNotam = [...(notamFeed?.advanceWarnings || []), ...(notamFeed?.activeNotams || [])].find(n => n.provenanceVerified === true && recent(n.fetchedAt, 60*60*1000) && Date.parse(n.validTo)>now && (n.threatLevel === 'HIGH_PRIORITY_ADVANCE' || n.status === 'ACTIVE_NOW')); 
    if (criticalNotam) {
      const title = `NOTAM 演訓禁航通告預警：${criticalNotam.title}（編號 ${criticalNotam.id}）`;
      if (!isRecentlyAlerted(title, 'ELEVATED')) {
        return {
          level: 'ELEVATED',
          code: 'NOTAM_EXERCISE_ADVANCE_WARNING',
          title,
          category: '海空管制前置預警',
          summary: `管轄情報區 ${criticalNotam.fir}。${criticalNotam.location}，高度 ${criticalNotam.lowerLimit}-${criticalNotam.upperLimit}。有效時間 ${criticalNotam.validFrom} 至 ${criticalNotam.validTo}（剩餘約 ${criticalNotam.leadTimeHours} 小時開始）。此為國際民航公告演訓預警。`,
          sourceUrl: criticalNotam.sourceUrl,
          observedAt: criticalNotam.validFrom
        };
      }
    }
  } catch (err) {
    // Fail closed on evaluation error
  }

  // 3. NASA FIRMS VIIRS Thermal Anomaly High Intensity Cluster
  // OBSERVATION-ONLY: Hotspots are physical thermal radiation (artillery fire, wildfire, industrial).
  // NASA explicitly states FIRMS data cannot determine cause. NEVER broadcast as attack evidence.
  // Log silently to quarantine for researcher review only.
  try {
    const firmsFeed = liveData?.firmsFeed;
    if (firmsFeed?.success && !firmsFeed.error && recent(firmsFeed.fetchedAt,30*60*1000) && (firmsFeed.highIntensityClusters || []).some(c => recent(c.latestObservedAt,24*60*60*1000))) {
      const topCluster = firmsFeed.highIntensityClusters.find(c => recent(c.latestObservedAt,24*60*60*1000));
      const title = `[觀察記錄-不推播] NASA FIRMS 熱異常觀測：${firmsFeed.theaterName} FRP ${topCluster.totalFrp} MW`;
      // Silently record to alert history for researcher reference, but DO NOT return (no broadcast)
      if (!isRecentlyAlerted(title, 'ELEVATED')) {
        saveAlertRecord({
          level: 'OBSERVATION_ONLY',
          code: 'FIRMS_THERMAL_OBSERVATION',
          title,
          category: '衛星熱異常觀察記錄（僅供研究，不推播）',
          isVerified: false,
          quarantined: true,
          delivered: 0,
          summary: `NASA VIIRS 遙測於 ${topCluster.centerLat}°N, ${topCluster.centerLon}°E 聚集 ${topCluster.pointCount} 個熱點，FRP ${topCluster.totalFrp} MW。熱源可能為砲火、工業燃燒或野火，NASA 聲明不能判定原因（https://firms.modaps.eosdis.nasa.gov/）。已自動隔離，待多源查證後再評估。`,
          sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/',
          observedAt: topCluster.latestObservedAt
        });
      }
      // Fall through: return null (no DM broadcast)
    }
  } catch (err) {
    // Fail closed on evaluation error
  }

  // ADS-B transponder emergency codes are observable signals, not proof of a military event.
  // Civil aircraft squawk 7700 represents general emergency (depressurization, medical, mechanical).
  // Record silently to quarantine/history; do NOT broadcast unverified civilian signals as defense alerts.
  const airspace = liveData.liveAirspace;
  if (airspace?.success === true && recent(airspace.timestamp, 15 * 60 * 1000)) {
    const aircraft = (airspace.foreignOrSpecial || []).find(item =>
      ['7700', '7600', '7500'].includes(String(item.squawk || ''))
    );
    if (aircraft) {
      const title = '[觀察記錄-不推播] OpenSky ADS-B 應答機代碼 ' + aircraft.squawk + '：' + (aircraft.callsign || aircraft.icao24 || '未標示航空器');
      if (!isRecentlyAlerted(title, 'ELEVATED')) {
        saveAlertRecord({
          level: 'OBSERVATION_ONLY',
          code: 'ADSB_SQUAWK_OBSERVATION',
          title,
          category: '公開航空訊號觀察（僅供研究，不推播）',
          isVerified: false,
          quarantined: true,
          delivered: 0,
          summary: 'OpenSky 觀測時間 ' + airspace.timestamp + '。應答機代碼 ' + aircraft.squawk + '（' + (aircraft.squawk === '7700' ? '民航一般緊急/機械或醫療情況' : aircraft.squawk === '7600' ? '通訊中斷' : '非法干擾') + '）。公開航空代碼常態為民航機械或程序問題，不能單獨作為軍事攻擊或威脅升級依據；已自主隔離，不推播未核實通知。',
          sourceUrl: 'https://opensky-network.org/',
          observedAt: airspace.timestamp
        });
      }
    }
  }

  // Autonomous Multi-Source Verification of Breaking News & OSINT Leads
  for (const item of liveData.latestBreakingNews || []) {
    if (!recent(item.publishedAt, 24 * 60 * 60 * 1000)) continue;
    if (!item.link || !item.title) continue;
    if (hasEverAlertedNews(item.id || item.link, item.title)) continue;
    const keyword = [...CRITICAL_KEYWORDS, ...ELEVATED_KEYWORDS].find(kw =>
      item.title.toLowerCase().includes(kw)
    );
    if (!keyword) continue;
    const verification = evaluateIntelligenceReliability(item, liveData, liveData.latestBreakingNews || []);
    if (verification.eligibleForBroadcast) {
      const title = `重大軍事動態自主交叉驗證特報：${verification.cleanTitle}`;
      if (!isRecentlyAlerted(title, verification.level)) {
        return {
          level: verification.level,
          code: 'VERIFIED_MILITARY_SITREP',
          isVerified: true,
          quarantined: false,
          eventId: item.id || item.link,
          newsTitle: item.title,
          title,
          category: '重大軍事動態自主驗證特報',
          admiraltyGrade: verification.admiraltyGrade,
          evaluation: verification,
          summary: verification.executiveSummary,
          sourceUrl: item.link,
          observedAt: item.publishedAt
        };
      }
    }
    if (options.persistQuarantine !== false) quarantineNoise(item, verification);
    return {
      level: 'ELEVATED', code: 'NEWS_HEADLINE_REVIEW', isVerified: false, quarantined: true, admiraltyGrade: verification.admiraltyGrade,
      eventId: item.id || item.link, newsTitle: item.title,
      title: `新聞標題待查：${item.title}`, category: '公開報導線索',
      summary: `標題含「${keyword}」；發布時間 ${item.publishedAt}；來源 ${item.source || '未標示'}。請查看原文與其他獨立來源，尚未確認事件。`,
      sourceUrl: item.link, observedAt: item.publishedAt
    };
  }
  return null;
}

// Standalone test
if (require.main === module) {
  const live = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const testRes = evaluateThreats(live);
  console.log('Sentry Evaluation Result:', testRes || 'All calm. No threshold breached.');
}

module.exports = {
  evaluateThreats,
  saveAlertRecord,
  getAlertHistory
};
