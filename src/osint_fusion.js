/**
 * WordWar_News - 公開資訊多源彙整（src/osint_fusion.js）
 *
 * 把幾個自動來源並排列出：官方台海動態（國防部）、NASA FIRMS 熱點、USGS 淺層震動、NOTAM（台北飛航情報區）、Sentinel-2 軌次。
 * 每個來源分成「正常／異常／無法判定／不適用」四種狀態：取不到資料或尚未接通時是「無法判定」，不當成 0。
 * 指數是未經回測校準的實驗指標，不代表戰備程度，也不是情報可靠度評級；
 * 各來源觸發沒有做同地、同時對齊，火點、淺層震動與禁航都可能有非軍事原因。
 */

'use strict';

const { fetchFirmsData } = require('./firms_monitor');
const { fetchUsgsSeismic } = require('./collectors/usgs_seismic');
const { getNotamFeedAsync } = require('./notam_monitor');
const { getTaiwanFeed } = require('./taiwan_intel');
const { getSatelliteFeed } = require('./satellite_assets');

const THEATER_NAMES = {
  all: '全球關鍵戰區綜合研判',
  taiwan_strait: '台海與周邊西太平洋戰區',
  ukraine_front: '烏俄前線與邊界縱深戰區',
  iran_gulf: '美伊戰爭、荷莫茲海峽與波斯灣',
  middle_east: '以巴、黎巴嫩與紅海航道',
  europe_security: '北約東翼與波羅的海防禦走廊',
  south_china_sea: '南海島礁與第一島鏈水域'
};
// 各來源實際涵蓋的範圍：FIRMS 只抓三個區域、USGS 依框選區分戰區、NOTAM 只有台北飛航情報區、國防部只有台海
const FIRMS_REGION = { taiwan_strait: 'taiwan_strait', ukraine_front: 'ukraine_front', middle_east: 'middle_east', iran_gulf: 'middle_east' };
const USGS_THEATER = { taiwan_strait: 'taiwan_strait', ukraine_front: 'ukraine_front', middle_east: 'middle_east', iran_gulf: 'middle_east' };
const SAT_REGION = { taiwan_strait: 'longtian', europe_security: 'suwalki', ukraine_front: 'toropets', iran_gulf: 'hormuz_bandar_abbas', south_china_sea: 'sabina' };
const STATE_LABEL = { NORMAL: '未觸發', ANOMALY: '觸發', UNKNOWN: '無法判定', NOT_APPLICABLE: '不適用' };

/**
 * 實驗指數（0-100）：只累加「已取得且觸發」的項目；值為 null 的項目視為無法判定，列入 unknownFactors。
 * 門檻與加分是固定值、尚未回測校準。
 */
function evaluateTension(metrics) {
  let score = 20;
  const resonantFactors = [], unknownFactors = [];
  const known = v => v !== null && v !== undefined;

  if (!known(metrics.thermalHotspots)) unknownFactors.push('NASA FIRMS 熱點');
  else if (metrics.thermalHotspots > 50 || metrics.thermalHighIntensity > 0) {
    score += 25;
    resonantFactors.push('NASA FIRMS 熱點密集或有高強度聚落（可能是野火、農業燃燒或工業熱源）');
  } else if (metrics.thermalHotspots > 10) {
    score += 12;
    resonantFactors.push('NASA FIRMS 中等數量熱點');
  }

  if (!known(metrics.notamActiveCount)) unknownFactors.push('NOTAM');
  else if (metrics.notamActiveCount > 0) {
    score += 20;
    resonantFactors.push(`生效中或即將生效的軍事相關 NOTAM ${metrics.notamActiveCount} 則`);
  }

  if (!known(metrics.officialActivitySurge)) unknownFactors.push('官方兵力通報');
  else if (metrics.officialActivitySurge) {
    score += 25;
    resonantFactors.push(`官方通報數量高於近 60 日第 95 百分位（${metrics.officialNote || ''}）`);
  }

  if (!known(metrics.suspiciousSeismicCount)) unknownFactors.push('USGS 淺層震動');
  else if (metrics.suspiciousSeismicCount > 0) {
    score += 15;
    resonantFactors.push(`USGS 淺層或標註爆破的震動 ${metrics.suspiciousSeismicCount} 起（也可能是採礦爆破或天然地震）`);
  }

  if (known(metrics.infrastructureAnomalies) && metrics.infrastructureAnomalies > 0) {
    score += 15;
    resonantFactors.push('關鍵基礎設施或網路異常');
  }

  score = Math.min(100, Math.max(10, score));
  let levelText = '低';
  if (score >= 75) levelText = '高';
  else if (score >= 55) levelText = '偏高';
  else if (score >= 35) levelText = '中';

  return {
    score,
    levelText: `${levelText}（實驗指數，未校準）`,
    isResonant: resonantFactors.length >= 2, // 兩項以上同時觸發；未做同地同時對齊，不代表互相印證
    resonantFactors,
    unknownFactors,
    calibrated: false
  };
}

const unknown = (why) => ({ state: 'UNKNOWN', note: why });

async function generateOsintFusionReport(theaterKey = 'all') {
  const targetTheater = THEATER_NAMES[theaterKey] ? theaterKey : 'all';
  const theaterTitle = THEATER_NAMES[targetTheater];

  // 1. NASA FIRMS 熱點
  let firmsSummary = { state: 'NOT_APPLICABLE', totalHotspots: null, highIntensity: null, sampleNotes: [], note: targetTheater === 'all' ? '全球摘要不合計 FIRMS，請選台海、烏俄或中東戰區' : '此戰區沒有設定 FIRMS 觀測框' };
  const firmsKey = FIRMS_REGION[targetTheater];
  if (firmsKey) {
    try {
      const firms = await fetchFirmsData(firmsKey);
      if (firms && firms.success) {
        const high = (firms.highIntensityClusters || []).length;
        firmsSummary = {
          state: (firms.totalHotspots > 50 || high > 0) ? 'ANOMALY' : 'NORMAL',
          totalHotspots: firms.totalHotspots || 0, highIntensity: high,
          sampleNotes: (firms.clusters || []).slice(0, 2).map(c => `(${c.centerLat}, ${c.centerLon}) FRP ${c.totalFrp}MW [${c.intensity}]`),
          note: `觀測框 ${firmsKey}，熱點 ${firms.totalHotspots || 0} 處、高強度聚落 ${high} 處`
        };
      } else firmsSummary = { ...unknown(`FIRMS 未取得：${firms?.error || firms?.status || '未知原因'}`), totalHotspots: null, highIntensity: null, sampleNotes: [] };
    } catch (e) { firmsSummary = { ...unknown(`FIRMS 讀取失敗：${e.message}`), totalHotspots: null, highIntensity: null, sampleNotes: [] }; }
  }

  // 2. USGS 淺層震動
  let usgsSummary = { state: 'NOT_APPLICABLE', totalEvents: null, suspicious: [], note: '此戰區沒有設定 USGS 觀測框' };
  if (targetTheater === 'all' || USGS_THEATER[targetTheater]) {
    try {
      const usgs = await fetchUsgsSeismic();
      if (usgs && usgs.success) {
        const filtered = targetTheater === 'all' ? usgs.events : usgs.events.filter(e => e.theater === USGS_THEATER[targetTheater]);
        const suspicious = filtered.filter(e => e.isSuspicious);
        usgsSummary = { state: suspicious.length ? 'ANOMALY' : 'NORMAL', totalEvents: filtered.length, suspicious, note: `監測區內地震 ${filtered.length} 起，其中可疑（爆破標註或極淺層）${suspicious.length} 起` };
      } else usgsSummary = { ...unknown(`USGS 未取得：${usgs?.error || '未知原因'}`), totalEvents: null, suspicious: [] };
    } catch (e) { usgsSummary = { ...unknown(`USGS 讀取失敗：${e.message}`), totalEvents: null, suspicious: [] }; }
  }

  // 3. NOTAM：目前只有台北飛航情報區，而且是人工匯入；未接通時是「無法判定」，不是「沒有禁航」
  let notamSummary = { state: 'NOT_APPLICABLE', activeCount: null, warnings: [], note: '目前只接台北飛航情報區的 NOTAM' };
  if (targetTheater === 'all' || targetTheater === 'taiwan_strait') {
    try {
      const feed = await getNotamFeedAsync();
      if (!feed || feed.status === 'NOT_CONFIGURED') {
        notamSummary = { ...unknown(`NOTAM 尚未接通（${feed?.autoFetchNote || '沒有通過來源驗證的匯入資料'}）`), activeCount: null, warnings: [] };
      } else {
        const military = (feed.notams || []).filter(n => n.isMilitary);
        notamSummary = {
          state: military.length ? 'ANOMALY' : 'NORMAL', activeCount: military.length,
          warnings: military.slice(0, 3).map(n => n.title || n.id || '軍事相關管制'),
          note: `已驗證的匯入通告 ${feed.totalCount} 則，生效中或即將生效的軍事相關 ${military.length} 則（資料檢查於 ${feed.checkedAt}）`
        };
      }
    } catch (e) { notamSummary = { ...unknown(`NOTAM 讀取失敗：${e.message}`), activeCount: null, warnings: [] }; }
  }

  // 4. 國防部台海動態（只適用台海）
  let twSummary = { state: 'NOT_APPLICABLE', aircraft: null, ships: null, p95Surge: null, note: '官方兵力通報目前只接台灣國防部' };
  if (targetTheater === 'all' || targetTheater === 'taiwan_strait') {
    try {
      const feed = getTaiwanFeed();
      const obs = feed?.latest?.observation;
      if (!obs || feed.status !== 'AVAILABLE') twSummary = { ...unknown(`國防部資料${feed?.status === 'STALE' ? '超過 48 小時未更新' : '未取得'}`), aircraft: null, ships: null, p95Surge: null };
      else {
        const status = feed.assessment?.status;
        const surge = status === 'ANOMALY_REVIEW' ? true : status === 'OBSERVATION_AVAILABLE' ? false : null;
        const aircraft = obs.aircraft?.value ?? null, ships = obs.ships?.value ?? null;
        twSummary = {
          state: surge === null ? 'UNKNOWN' : surge ? 'ANOMALY' : 'NORMAL', aircraft, ships, p95Surge: surge,
          note: `國防部 ${String(obs.periodEnd || '').slice(0, 10)} 通報共機 ${aircraft ?? '未提供'} 架次、共艦 ${ships ?? '未提供'} 艘次` +
            (surge === null ? '（歷史資料不足，無法比對基準）' : surge ? '（高於近 60 日第 95 百分位）' : '（在近 60 日範圍內）')
        };
      }
    } catch (e) { twSummary = { ...unknown(`國防部資料讀取失敗：${e.message}`), aircraft: null, ships: null, p95Surge: null }; }
  }

  // 5. Sentinel-2 軌次：只列出，不計分。整片雲量僅供初篩，目標區是否被雲遮要看實際像素
  let satSummary = { state: 'NOT_APPLICABLE', targetCount: 0, latestRegion: null, cloudGrade: '不適用', note: '此戰區沒有設定衛星觀測點' };
  const satRegion = SAT_REGION[targetTheater] || (targetTheater === 'all' ? 'longtian' : null);
  if (satRegion) {
    try {
      const sat = getSatelliteFeed(satRegion);
      if (sat && sat.assets && sat.assets.length) {
        const latest = sat.assets[0];
        const pct = latest.cloudCoverPercent == null ? null : Math.round(latest.cloudCoverPercent * 10) / 10;
        satSummary = {
          state: 'NORMAL', targetCount: sat.assets.length, latestRegion: latest.region,
          cloudGrade: pct == null ? '雲量未標注' : pct <= 10 ? '整片雲量低' : pct <= 20 ? '整片雲量中等' : '整片雲量高',
          note: `最新軌次 ${latest.region}（${latest.acquiredAt ? latest.acquiredAt.slice(0, 10) : '日期不明'}），整片雲量 ${pct ?? '未標注'}%；目標區是否被雲遮需看實際影像`
        };
      } else satSummary = { ...unknown('此觀測點尚無通過驗證的軌次'), targetCount: 0, latestRegion: satRegion, cloudGrade: '無資料' };
    } catch (e) { satSummary = { ...unknown(`衛星清單讀取失敗：${e.message}`), targetCount: 0, latestRegion: satRegion, cloudGrade: '無資料' }; }
  }

  const val = (s, v) => (s.state === 'NORMAL' || s.state === 'ANOMALY') ? v : null;
  const tension = evaluateTension({
    thermalHotspots: val(firmsSummary, firmsSummary.totalHotspots),
    thermalHighIntensity: val(firmsSummary, firmsSummary.highIntensity),
    notamActiveCount: val(notamSummary, notamSummary.activeCount),
    officialActivitySurge: val(twSummary, twSummary.p95Surge),
    officialNote: twSummary.note,
    suspiciousSeismicCount: val(usgsSummary, usgsSummary.suspicious.length),
    infrastructureAnomalies: null
  });
  // 不適用的項目不算「無法判定」
  const applicable = { FIRMS: firmsSummary, USGS: usgsSummary, NOTAM: notamSummary, MND: twSummary };
  tension.unknownFactors = Object.entries(applicable).filter(([, s]) => s.state === 'UNKNOWN').map(([, s]) => s.note);

  return {
    theater: targetTheater,
    theaterTitle,
    generatedAt: new Date().toISOString(),
    admiraltyRating: null, // 不自動給來源可靠度評級：這需要逐項評定來源與訊息，不是由觸發數量推得
    experimental: true,
    tension,
    firmsSummary,
    usgsSummary,
    notamSummary,
    twSummary,
    satSummary
  };
}

async function osintFusionDiscordPayload(theaterKey = 'all') {
  const report = await generateOsintFusionReport(theaterKey);
  const { tension, firmsSummary, usgsSummary, notamSummary, twSummary, satSummary } = report;
  const row = (label, s, labels = STATE_LABEL) => `• **${label}**：\`${labels[s.state]}\` ${s.note || ''}`;

  const lines = [
    '# 公開情報多源交叉彙整研判（實驗功能）',
    `> 觀測戰區：\`${report.theaterTitle}\``,
    `> 戰區張力指數：\`${tension.score}/100\`｜${tension.levelText}`,
    '> 指數門檻沒有經過回測，不代表戰備程度，也不是情報可靠度評級。',
    `> 產生時間：\`${report.generatedAt}\`（UTC）`,
    '',
    '### 各來源狀態',
    row('官方兵力通報（國防部）', twSummary),
    row('熱點（NASA FIRMS）', firmsSummary),
    row('淺層震動（USGS）', usgsSummary),
    row('禁航通告（NOTAM）', notamSummary),
    row('光學衛星（Sentinel-2，不計分）', satSummary, { ...STATE_LABEL, NORMAL: '有軌次' }),
    ''
  ];

  if (tension.isResonant) {
    lines.push('### 同時觸發的項目');
    lines.push('> 以下項目在同一次檢查中都有觸發，但沒有核對是否同地、同時，也可能各有非軍事原因：');
    for (const factor of tension.resonantFactors) lines.push(`> • ${factor}`);
    lines.push('');
  }

  lines.push('### 綜合說明');
  if (tension.unknownFactors.length) {
    lines.push(`• 無法判定的來源：${tension.unknownFactors.join('；')}`);
    lines.push('• 這些來源缺資料，不能據此說「沒有異常」。');
  }
  if (tension.resonantFactors.length) lines.push('• 有項目觸發，需要回到原始來源核對時間、地點與其他解釋。');
  else if (!tension.unknownFactors.length) lines.push('• 已取得的來源都沒有觸發本工具的門檻（門檻未經校準，只代表沒有明顯偏高）。');

  lines.push('');
  lines.push('資料來源：台灣國防部、NASA FIRMS、USGS、Copernicus Sentinel-2、台北飛航情報區 NOTAM');

  return { sourceBacked: true, content: lines.join('\n').slice(0, 2000), files: [], embeds: [] };
}

module.exports = {
  THEATER_NAMES,
  generateOsintFusionReport,
  osintFusionDiscordPayload,
  evaluateTension
};
