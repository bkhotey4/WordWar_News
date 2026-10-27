/**
 * WordWar_News - Autonomous Tactical Intelligence Engine (自主海空情資採集核心)
 * Direct First-Party Data Sources:
 * 1. OpenSky Network Live ADS-B Stream (Taiwan Strait & Median Line Bounding Box)
 * 2. Taiwan MND (中華民國國防部) Official Real-Time Military Activity & Sorties
 * 3. Taiwan Defense Community Discussions (PTT Military Board)
 * 4. Autonomous Airspace & Naval Anomaly Detection Engine
 */

const Parser = require('rss-parser');
const rssParser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WordWarNews/2.0 TacticalDefenseBot'
  }
});

// Taiwan Strait Bounding Box (Lat: 21.0 to 26.5 N, Lon: 118.0 to 123.0 E)
const OPENSKY_BOX = 'lamin=21.0&lomin=118.0&lamax=26.5&lomax=123.0';

let airspaceCache = { data: null, timestamp: 0 };
let mndCache = { data: null, timestamp: 0 };
let pttCache = { data: null, timestamp: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache to stay well within 400 requests/day anonymous quota

let openSkyCooldownUntil = 0;
let openSkyConsecutiveErrors = 0;

function freshStateVectors(data, now = Date.now()) {
  const scanMs = data?.time * 1000;
  if (!Number.isFinite(scanMs) || scanMs > now || now - scanMs > 15 * 60_000 || !Array.isArray(data.states)) throw new Error('OpenSky observation timestamp or state vectors unavailable');
  return data.states.filter(s => Array.isArray(s) &&
    Number.isFinite(s[3]) && Number.isFinite(s[4]) &&
    s[3] * 1000 <= scanMs && s[4] * 1000 <= scanMs &&
    scanMs - s[3] * 1000 <= 15 * 60_000 && scanMs - s[4] * 1000 <= 15 * 60_000 &&
    Number.isFinite(s[5]) && Number.isFinite(s[6]) &&
    s[5] >= 118 && s[5] <= 123 && s[6] >= 21 && s[6] <= 26.5);
}

/**
 * 1. Autonomous Live ADS-B Airspace Scanner (OpenSky Network)
 */
async function fetchTaiwanStraitLiveAirspace(forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && airspaceCache.data && (now - airspaceCache.timestamp < CACHE_TTL_MS)) {
    return airspaceCache.data;
  }

  // If currently under OpenSky rate-limit cooldown, avoid sending HTTP requests
  if (now < openSkyCooldownUntil) {
    if (airspaceCache.data) {
      return {
        ...airspaceCache.data,
        isRateLimited: true,
        fromCache: true,
        cooldownRemainingSeconds: Math.ceil((openSkyCooldownUntil - now) / 1000)
      };
    }
    return {
      success: false,
      rateLimited: true,
      error: `OpenSky API 處於頻率保護冷卻中 (剩餘 ${Math.ceil((openSkyCooldownUntil - now) / 60000)} 分鐘)`,
      totalAircraftInStrait: 0,
      midStraitCount: 0,
      midStraitPlanes: [],
      foreignOrSpecial: []
    };
  }

  const url = `https://opensky-network.org/api/states/all?${OPENSKY_BOX}`;
  try {
    const headers = {
      'User-Agent': 'WordWarNews/2.0 (Defense Intel Bot; Taiwan Strait Autonomous Monitor)'
    };
    if (process.env.OPENSKY_USERNAME && process.env.OPENSKY_PASSWORD) {
      const auth = Buffer.from(`${process.env.OPENSKY_USERNAME}:${process.env.OPENSKY_PASSWORD}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers
    });

    if (!res.ok) {
      throw new Error(`OpenSky API HTTP ${res.status}`);
    }

    const data = await res.json();
    const rawStates = freshStateVectors(data);
    const scanTime = new Date(data.time * 1000);

    const planes = rawStates.map(s => ({
      icao24: s[0],
      callsign: (s[1] || '').trim(),
      country: s[2] || 'Unknown',
      timePosition: s[3],
      lastContact: s[4],
      longitude: s[5],
      latitude: s[6],
      baroAltitudeMeters: s[7],
      altitudeFeet: s[7] != null ? Math.round(s[7] * 3.28084) : null,
      onGround: s[8],
      velocityMs: s[9],
      speedKnots: s[9] != null ? Math.round(s[9] * 1.94384) : null,
      trueTrack: s[10],
      verticalRate: s[11],
      squawk: s[14]
    }));

    // Filter notable / abnormal flights:
    // a) Mid-Strait flights (Lon 119.0 to 120.2, Lat 23.5 to 25.8)
    // b) Russian Federation, North Korea, Iran, or anomalous non-commercial flights
    // c) Emergency squawks (7700, 7600, 7500)
    const midStrait = planes.filter(p => 
      !p.onGround &&
      p.longitude >= 119.0 && p.longitude <= 120.2 &&
      p.latitude >= 23.5 && p.latitude <= 25.8
    );

    // Regular commercial airline prefixes to prevent false alarms on civilian transit flights
    const COMMERCIAL_PREFIXES = ['KAL', 'AAR', 'JNA', 'TWB', 'ESR', 'JJA', 'ABL', 'EVA', 'CAL', 'CPA', 'CRK', 'CSN', 'CES', 'CCA', 'CXA', 'SIA', 'MAS', 'THA', 'VJC', 'HVN', 'ANA', 'JAL', 'SFJ', 'APJ', 'FDA', 'TTW', 'SJX', 'MDA', 'UIA', 'FEA', 'BKP', 'SCO', 'SLK', 'DLH', 'AFR', 'KLM', 'BAW', 'QFA', 'UAE', 'QTR', 'ETD'];

    const foreignOrSpecial = planes.filter(p => {
      const c = (p.country || '').toLowerCase();
      const cs = (p.callsign || '').trim().toUpperCase();
      const isCommercial = COMMERCIAL_PREFIXES.some(prefix => cs.startsWith(prefix));

      const isHostileOrigin = c.includes('russia') || c.includes('north korea') || c.includes('democratic people') || c.includes('iran');
      const isEmergencySquawk = p.squawk === '7700' || p.squawk === '7600' || p.squawk === '7500';
      const isAnomalousNoCallsign = !cs && !p.onGround && p.baroAltitudeMeters && p.baroAltitudeMeters > 8000;

      // Only flag if hostile origin, emergency, or unknown high-altitude non-commercial
      return isHostileOrigin || isEmergencySquawk || (isAnomalousNoCallsign && !isCommercial);
    });

    const result = {
      success: true,
      timestamp: scanTime.toISOString(),
      totalAircraftInStrait: planes.length,
      airborneCount: planes.filter(p => !p.onGround).length,
      midStraitCount: midStrait.length,
      midStraitPlanes: midStrait.slice(0, 10),
      foreignOrSpecial: foreignOrSpecial,
      planesSample: planes.slice(0, 8)
    };

    // Reset backoff on success
    openSkyConsecutiveErrors = 0;
    openSkyCooldownUntil = 0;
    airspaceCache = { data: result, timestamp: Date.now() };
    return result;
  } catch (err) {
    if (err.message.includes('429')) {
      openSkyConsecutiveErrors++;
      const backoffMinutes = Math.min(30, Math.max(5, Math.pow(2, openSkyConsecutiveErrors)));
      openSkyCooldownUntil = Date.now() + backoffMinutes * 60 * 1000;
      console.warn(`[AUTONOMOUS AIRSPACE] OpenSky API HTTP 429 頻率限制保護啟動，進入冷卻 (${backoffMinutes} 分鐘)...`);
    } else {
      console.warn('[AUTONOMOUS AIRSPACE WARNING]', err.message);
    }

    if (airspaceCache.data) {
      return {
        ...airspaceCache.data,
        isRateLimited: err.message.includes('429'),
        fromCache: true
      };
    }
    return {
      success: false,
      error: err.message,
      rateLimited: err.message.includes('429'),
      totalAircraftInStrait: 0,
      midStraitCount: 0,
      midStraitPlanes: [],
      foreignOrSpecial: []
    };
  }
}

/**
 * Helper: Extract structured quantifiable metrics from MND reports
 */
function extractMNDMetrics(reports) {
  let aircraftTotal = null;
  let crossMedian = null;
  let vesselsTotal = null;

  for (const r of reports || []) {
    const text = r.title || '';
    const mPlanes = text.match(/共機\s*(\d+)\s*架次/);
    if (mPlanes && !aircraftTotal) aircraftTotal = parseInt(mPlanes[1], 10);

    const mCross = text.match(/(\d+)\s*架次.*?(?:越中線|逾越中線|逾越海峽中線)/);
    if (mCross && !crossMedian) crossMedian = parseInt(mCross[1], 10);

    const mVessels = text.match(/(?:共艦|軍艦|公務船).*?(?:共|各|出沒|活動)?\s*(\d+)\s*艘/);
    if (mVessels && !vesselsTotal) vesselsTotal = parseInt(mVessels[1], 10);
  }

  return {
    aircraftTotal: aircraftTotal ? `${aircraftTotal} 架次（新聞標題提及，待核對）` : null,
    crossMedian: crossMedian ? `${crossMedian} 架次（新聞標題提及，待核對）` : null,
    vesselsTotal: vesselsTotal ? `${vesselsTotal} 艘次（新聞標題提及，待核對）` : null,
    raw: { aircraftTotal, crossMedian, vesselsTotal }
  };
}

/**
 * 2. Autonomous Taiwan MND (國防部) Official Real-Time Military Updates
 */
async function fetchMNDMilitaryActivity(forceFresh = false) {
  if (!forceFresh && mndCache.data && (Date.now() - mndCache.timestamp < CACHE_TTL_MS)) {
    return mndCache.data;
  }
  // when:1d 讓 Google News 只回傳近 24 小時；RSS 預設依相關性排序，須先按時間排序再取前幾筆。
  // 巢狀括號與頓號會讓 Google News 回傳 0 則，改用單層 OR（同「Google News 台海相關標題」的寫法）
  const query = encodeURIComponent('(共機 OR 共艦 OR 擾台 OR 臺海周邊 OR 台海周邊) when:1d');
  const url = `https://news.google.com/rss/search?q=${query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;

  try {
    const feed = await rssParser.parseURL(url);
    const reports = [];

    if (feed && feed.items) {
      const byNewest = [...feed.items].sort((a, b) => (Date.parse(b.pubDate || '') || 0) - (Date.parse(a.pubDate || '') || 0));
      for (const item of byNewest) {
        if (reports.length >= 6) break;
        const publishedAt = Date.parse(item.pubDate || '');
        if (!Number.isFinite(publishedAt) || publishedAt > Date.now() + 60_000 || Date.now() - publishedAt > 24 * 60 * 60_000) continue;
        reports.push({
          title: item.title ? item.title.trim() : '國防部戰情通報',
          link: item.link || '',
          pubDate: new Date(publishedAt).toLocaleDateString('zh-TW'),
          publishedAt: new Date(publishedAt).toISOString()
        });
      }
    }

    const result = {
      success: true,
      source: 'Google News 新聞彙整（非國防部原始通報）',
      sourceType: 'news_aggregation',
      fetchedAt: new Date().toISOString(),
      count: reports.length,
      reports: reports,
      extractedMetrics: extractMNDMetrics(reports)
    };
    mndCache = { data: result, timestamp: Date.now() };
    return result;
  } catch (err) {
    console.warn('[MND CRAWLER WARNING]', err.message);
    if (mndCache.data) return mndCache.data;
    return {
      success: false,
      error: err.message,
      sourceType: 'news_aggregation',
      count: 0,
      reports: []
    };
  }
}

/**
 * 3. Autonomous Defense Community Signals (PTT Military Board)
 */
async function fetchPTTMilitaryIntel(forceFresh = false) {
  if (!forceFresh && pttCache.data && (Date.now() - pttCache.timestamp < CACHE_TTL_MS)) {
    return pttCache.data;
  }
  const url = 'https://www.ptt.cc/bbs/Military/index.html';
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': 'over18=1'
      }
    });

    if (!res.ok) throw new Error(`PTT HTTP ${res.status}`);
    const html = await res.text();

    const regex = /<div class="title">\s*<a href="([^"]+)">([\s\S]*?)<\/a>/g;
    let match;
    const posts = [];

    while ((match = regex.exec(html)) !== null) {
      const link = 'https://www.ptt.cc' + match[1];
      const title = match[2].trim();
      
      const isDefenseRelevant = /情報|新聞|軍事|共機|中線|台海|飛安|俄|烏|演習|無人機|導彈/i.test(title);
      if (isDefenseRelevant) {
        posts.push({ title, link });
      }
    }

    const pttResult = {
      success: true,
      source: 'PTT 軍事板第一手國防通報',
      count: posts.length,
      posts: posts.slice(0, 8)
    };
    pttCache = { data: pttResult, timestamp: Date.now() };
    return pttResult;
  } catch (err) {
    console.warn('[OSINT PTT WARNING]', err.message);
    if (pttCache.data) return pttCache.data;
    return {
      success: false,
      error: err.message,
      count: 0,
      posts: []
    };
  }
}

/**
 * 4. Run Full Autonomous Tactical Intelligence Sweep
 */
async function runAutonomousTacticalSweep() {
  console.log('[SOURCE COLLECTOR] 正在取得 OpenSky ADS-B、Google News 彙整與社群貼文...');
  
  const [airspace, mnd, ptt] = await Promise.all([
    fetchTaiwanStraitLiveAirspace(),
    fetchMNDMilitaryActivity(),
    fetchPTTMilitaryIntel()
  ]);

  const autonomousAssessment = {
    evaluatedAt: new Date().toISOString(),
    threatLevel: null,
    airspaceSummary: airspace.success
      ? `OpenSky 公開訊號：區域內 ${airspace.totalAircraftInStrait} 筆，中線鄰近 ${airspace.midStraitCount} 筆；不代表全部航空器`
      : 'OpenSky 近期資料未取得',
    anomalies: [],
    note: '尚無多來源驗證，不對公開航訊或新聞標題作戰備評級'
  };

  return {
    timestamp: new Date().toISOString(),
    airspace,
    mnd,
    ptt,
    autonomousAssessment
  };
}

module.exports = {
  freshStateVectors,
  fetchTaiwanStraitLiveAirspace,
  fetchMNDMilitaryActivity,
  fetchPTTMilitaryIntel,
  runAutonomousTacticalSweep,
  // Alias for backward compatibility
  runFullOSINTSweep: runAutonomousTacticalSweep
};
