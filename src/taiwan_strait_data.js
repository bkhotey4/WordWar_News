/**
 * TAIWAN STRAIT TACTICAL C4ISR DATA ENGINE (Dynamic & Responsive Edition)
 * Condensed, high-impact bullet points for clear 1920x1080 slide readability
 * Dynamically binds with live_intel.json (MND reports & OpenSky ADS-B)
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../public/data/live_intel.json');

const BASE_SECTORS = [
  {
    id: 'northern-strait',
    name: '北部空域 (距大台北 42 浬)',
    threatLevel: 'HIGH // 壓縮防空',
    plaAction: '殲-16 / 空警-500 彭佳嶼以東盤旋，逼近北部中樞',
    rocDefense: '愛國者三型雷達常態鎖定 ｜ 新竹幻象 5分鐘起飛'
  },
  {
    id: 'central-median',
    name: '海峽中線正面作戰軸線 (含特殊航跡防空試探)',
    threatLevel: 'SEVERE // 中線抹除與混合試探',
    plaAction: '特殊飛行器泉州外海盤旋折返 ｜ 蘇-30/殲-16 雙向跨中線',
    rocDefense: '天弓三型全程追監 ｜ 戰備巡弋機伴隨監控防誤導'
  },
  {
    id: 'southwest-adiz',
    name: '西南防空識別區 (空潛通道)',
    threatLevel: 'CRITICAL // 立體進逼',
    plaAction: '運-8反潛機 / 無偵-7 密集巡弋，掩護核潛艦前出',
    rocDefense: 'P-8A反潛情報共享 ｜ 雄風三型機動車進駐恆春'
  },
  {
    id: 'bashi-southeast',
    name: '巴士海峽與東南外海 (能源線)',
    threatLevel: 'SEVERE // 反介入演練',
    plaAction: '轟-6K 掛載鷹擊-12 演練 ｜ 054A護衛艦外海卡位',
    rocDefense: '海鋒大隊雄三進駐太麻里 ｜ 美日神盾保持協防'
  }
];

const GREY_ZONE_TACTICS = [
  {
    tactic: '1. 聯合戰備警巡常態化',
    desc: '每月 3-4 次夜間或拂曉突然進逼，以演練掩飾戰備突襲。'
  },
  {
    tactic: '2. 海警水上執法與登檢隔離',
    desc: '出動 12,000噸 CCG 5901，對 LNG 船模擬臨檢試探封鎖。'
  },
  {
    tactic: '3. 抽砂破壞海纜與民兵蜂群',
    desc: '割斷離島海纜 ｜ 動員數百艘鋼殼漁船阻絕外海航道。'
  },
  {
    tactic: '4. 高空氣球與長程無人機繞島',
    desc: '氣球測繪中央山脈氣象 ｜ 無偵-7 逆時針環島刺探雷達。'
  }
];

function getTaiwanStraitData() {
  let liveIntel = {};
  try {
    if (fs.existsSync(DATA_FILE)) {
      liveIntel = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {}

  const recent = (value, maxAge = 15 * 60_000) => {
    const time = Date.parse(value || '');
    return Number.isFinite(time) && time <= Date.now() + 60_000 && Date.now() - time <= maxAge;
  };
  const mnd = liveIntel.mndOfficial?.success && recent(liveIntel.mndOfficial.fetchedAt, 24 * 60 * 60_000) ? liveIntel.mndOfficial : {};
  const extracted = mnd.extractedMetrics || {};
  const airspace = liveIntel.liveAirspace?.success && recent(liveIntel.liveAirspace.timestamp, 15 * 60_000) ? liveIntel.liveAirspace : {};

  // 最後成功取得的時間（用於資料缺失時正確標示）
  const lastSuccessTime = [mnd.fetchedAt, airspace.timestamp]
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
  const mndLastTime = liveIntel.mndOfficial?.fetchedAt || null;
  const mndNoDataLabel = mndLastTime
    ? `未取得近期資料（新聞彙整最後擷取: ${mndLastTime}）`
    : '未取得（尚無成功抓取紀錄）';

  // Dynamically resolve metrics — 缺資料時明確標示「未取得」，不說「未見異常」(OpenAI Review Defect 2)
  let aircraftTotalStr = extracted.aircraftTotal || null;
  if (!aircraftTotalStr) {
    aircraftTotalStr = `共機出海架次 ${mndNoDataLabel}`;
  }

  let crossMedianStr = extracted.crossMedian || null;
  if (!crossMedianStr) {
    crossMedianStr = `中線逾越資料 ${mndNoDataLabel}`;
  }

  let vesselsTotalStr = extracted.vesselsTotal || null;
  if (!vesselsTotalStr) {
    // ⚠️ 不說「常態海疆巡防 (未見異常艦艇集結)」，直接如實顯示資料未取得
    vesselsTotalStr = `共艦動態 ${mndNoDataLabel}`;
  }

  const currentMetrics = {
    plaAircraftTotal: aircraftTotalStr,
    plaCrossMedianLine: crossMedianStr,
    plaVesselsTotal: vesselsTotalStr,
    carrierStrikeGroup: '未取得可核對的近期資料',
    rocResponse: '未取得可核對的近期資料'
  };

  // 使用資料庫內的威脅等級；若 DEFCON 無法取得，不假設預設值
  let threatLevel;
  if (liveIntel.defconLevel && recent(liveIntel.crisisEvaluatedAt)) {
    threatLevel = `${liveIntel.defconLevel} / ${liveIntel.threatAssessment || '資料不足'}（系統估算，非官方）`;
  } else {
    threatLevel = '模型觀測資料不足';
  }

  // 使用資料庫真實時間戳，不要用 new Date() 假裝是最新資料 (OpenAI Review Defect 2)
  const lastUpdated = lastSuccessTime || '觀測時間未取得';

  return {
    lastUpdated,
    threatLevel,
    readinessCode: 'STERN_VIGILANCE_ALPHA',
    airSeaPatrolMetrics: currentMetrics,
    sectors: BASE_SECTORS,
    greyZoneTactics: GREY_ZONE_TACTICS
  };
}

module.exports = {
  get taiwanStraitIntel() {
    return getTaiwanStraitData();
  },
  getTaiwanStraitData
};
