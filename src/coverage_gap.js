/**
 * WordWar_News - 戰區覆蓋缺口（src/coverage_gap.js）
 *
 * 「沒有看到」不等於「沒有發生」：逐戰區列出目前能看到什麼、看不到什麼。
 *   1. 光學衛星：最新 Sentinel-2 軌次的拍攝時間與整片雲量。整片雲量只能初篩，目標區有沒有被雲遮要看實際像素。
 *   2. 官方通報：有接自動來源的戰區檢查最後擷取成功時間；沒接的標「未檢查」，不當成正常。
 * 不輸出「完整覆蓋」：一次軌次可用不等於整個戰區都看得到。
 * NASA FIRMS 熱點只偵測得到夠強的熱源，也會被厚雲擋住，不能當光學的替代。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getSatelliteFeed } = require('./satellite_assets');
const { getTaiwanFeed } = require('./taiwan_intel');

const CACHE_DIR = path.join(__dirname, '../research/source_cache');
const THEATER_METRICS = {
  taiwan_strait: { name: '台海與周邊西太平洋戰區', primarySatRegion: 'longtian', officialSource: '台灣國防部', expectedCadenceHours: 28 },
  europe_security: { name: '北約東翼與波羅的海走廊', primarySatRegion: 'suwalki', officialSource: null, expectedCadenceHours: 36 },
  ukraine_front: { name: '烏俄前線與邊境縱深戰區', primarySatRegion: 'toropets', officialSource: '烏克蘭空軍每日通報', officialCache: 'ukraine_air_attacks.json', expectedCadenceHours: 24 },
  iran_gulf: { name: '美伊戰爭、荷莫茲海峽與波斯灣', primarySatRegion: 'hormuz_bandar_abbas', officialSource: 'UKMTO', officialCache: 'ukmto_incidents.json', expectedCadenceHours: 36 },
  south_china_sea: { name: '南海島礁與第一島鏈水域', primarySatRegion: 'sabina', officialSource: null, expectedCadenceHours: 48 }
};

function officialCheck(key, conf, now) {
  if (!conf.officialSource) return { status: 'UNVERIFIED', note: '此戰區沒有接官方自動來源，未檢查' };
  try {
    let lastMs;
    if (key === 'taiwan_strait') lastMs = Date.parse(getTaiwanFeed(now)?.latest?.observation?.periodEnd || '');
    else lastMs = Date.parse(JSON.parse(fs.readFileSync(path.join(CACHE_DIR, conf.officialCache), 'utf8')).lastSuccess || '');
    if (!Number.isFinite(lastMs)) return { status: 'UNKNOWN', note: `${conf.officialSource}：沒有成功紀錄` };
    const hours = Math.round((now - lastMs) / 3600000);
    const what = key === 'taiwan_strait' ? '最新通報期間結束' : '最後擷取成功';
    return hours > conf.expectedCadenceHours
      ? { status: 'STALE', hours, note: `${conf.officialSource}：${what}距今 ${hours} 小時，超過正常週期 ${conf.expectedCadenceHours} 小時` }
      : { status: 'CURRENT', hours, note: `${conf.officialSource}：${what}距今 ${hours} 小時` };
  } catch (e) {
    return { status: 'UNKNOWN', note: `${conf.officialSource}：無法讀取（${e.message}）` };
  }
}

function analyzeCoverageGaps(now = Date.now()) {
  const gaps = [];

  for (const [key, conf] of Object.entries(THEATER_METRICS)) {
    const item = {
      theater: key,
      name: conf.name,
      opticalStatus: 'NO_DATA',
      satCloudPercent: null,
      satPassDate: null,
      hoursSinceSatPass: null,
      opticalBlindSpot: true,
      officialStatus: 'UNVERIFIED',
      officialStale: false,
      coverageGrade: 'GAPS',
      notes: []
    };

    try {
      const sat = getSatelliteFeed(conf.primarySatRegion);
      if (sat && sat.assets && sat.assets.length) {
        const latest = sat.assets[0];
        item.satCloudPercent = latest.cloudCoverPercent != null ? Math.round(latest.cloudCoverPercent * 10) / 10 : null;
        item.satPassDate = latest.acquiredAt ? latest.acquiredAt.slice(0, 10) : null;
        const passMs = Date.parse(latest.acquiredAt || '');
        if (Number.isFinite(passMs)) item.hoursSinceSatPass = Math.round((now - passMs) / 3600000);

        if (item.hoursSinceSatPass !== null && item.hoursSinceSatPass > 72) {
          item.opticalStatus = 'STALE_RECON';
          item.notes.push(`最新光學軌次已是 ${item.hoursSinceSatPass} 小時前`);
        } else if (item.satCloudPercent !== null && item.satCloudPercent > 20) {
          item.opticalStatus = 'CLOUDY_SCENE';
          item.notes.push(`最新軌次整片雲量 ${item.satCloudPercent}%，目標區可能被遮（需看實際影像確認）`);
        } else {
          item.opticalStatus = 'RECENT_PASS';
          item.opticalBlindSpot = false;
          item.notes.push(`最新軌次整片雲量 ${item.satCloudPercent ?? '未標注'}%（只代表整片，不保證目標區清楚）`);
        }
      } else item.notes.push('此觀測點尚無通過驗證的軌次');
    } catch (_) {
      item.opticalStatus = 'UNAVAILABLE';
      item.notes.push('衛星清單無法讀取');
    }

    const official = officialCheck(key, conf, now);
    item.officialStatus = official.status;
    item.officialStale = official.status === 'STALE';
    item.notes.push(official.note);

    // 只分「有缺口」與「已檢查的來源都正常」，不宣稱完整覆蓋
    const officialOk = official.status === 'CURRENT';
    item.coverageGrade = item.opticalBlindSpot && !officialOk ? 'GAPS' : item.opticalBlindSpot || !officialOk ? 'PARTIAL' : 'CHECKED_SOURCES_OK';
    gaps.push(item);
  }

  return {
    evaluatedAt: new Date(now).toISOString(),
    theaters: gaps,
    blindSpotCount: gaps.filter(g => g.coverageGrade !== 'CHECKED_SOURCES_OK').length,
    note: '只檢查光學軌次與官方來源更新時間；看得到的範圍、時間有限，不代表戰區完整覆蓋。'
  };
}

const GRADE_TEXT = { GAPS: '🔴 光學與官方來源都有缺口', PARTIAL: '🟡 部分來源有缺口或未檢查', CHECKED_SOURCES_OK: '🟢 已檢查的來源都有近期資料' };
function coverageGapDiscordPayload() {
  const data = analyzeCoverageGaps();
  const lines = [
    '# 戰區情報盲區與覆蓋缺口雷達',
    `> 評估時間：\`${data.evaluatedAt}\`（UTC）`,
    `> 有缺口或未檢查的戰區：\`${data.blindSpotCount} / ${data.theaters.length}\``,
    '> 缺乏公開跡象不等於沒有發生；下列「正常」只代表已檢查的來源有近期資料。',
    '',
    '### 各大關鍵戰區即時覆蓋狀態'
  ];
  for (const t of data.theaters) {
    lines.push(`• **${t.name}**｜${GRADE_TEXT[t.coverageGrade]}`);
    for (const n of t.notes) lines.push(`  └ ${n}`);
  }
  lines.push('', 'NASA FIRMS 熱點只偵測得到夠強的熱源，也會被厚雲擋住，不能補足光學缺口；需要陰天觀測要另看 Sentinel-1 雷達影像。');
  return { sourceBacked: true, content: lines.join('\n').slice(0, 2000), files: [], embeds: [] };
}

module.exports = {
  analyzeCoverageGaps,
  coverageGapDiscordPayload,
  THEATER_METRICS
};
