const fs = require('fs');
const path = require('path');

// 1. Update src/sentry.js
const sentryPath = path.join(__dirname, '../src/sentry.js');
let sentryCode = fs.readFileSync(sentryPath, 'utf8');

if (!sentryCode.includes('getTaiwanFeed')) {
  sentryCode = sentryCode.replace(
    "const ALERT_HISTORY_FILE = path.join(__dirname, 'alert_history.json');",
    "const ALERT_HISTORY_FILE = path.join(__dirname, 'alert_history.json');\nconst { getTaiwanFeed } = require('./taiwan_intel');"
  );
}

if (!sentryCode.includes('TAIWAN_STRAIT_ANOMALY')) {
  const target = "function evaluateThreats(liveData) {";
  const replacement = `function evaluateThreats(liveData, taiwanFeed = null) {
  if (!liveData) return null;
  const now = Date.now();
  const recent = (value, maxAge) => {
    const stamp = Date.parse(value);
    return Number.isFinite(stamp) && stamp <= now && now - stamp <= maxAge;
  };

  // Taiwan Strait MND Anomaly Review (P95 statistical baseline)
  try {
    const feed = taiwanFeed || (liveData && liveData.taiwanIntel) || getTaiwanFeed(now);
    if (feed?.status === 'AVAILABLE' && feed?.assessment?.status === 'ANOMALY_REVIEW') {
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
  }`;

  // Find evaluateThreats function body start
  const evalIdx = sentryCode.indexOf('function evaluateThreats(liveData) {');
  const nextCheckIdx = sentryCode.indexOf('  // ADS-B transponder emergency codes');
  if (evalIdx !== -1 && nextCheckIdx !== -1) {
    sentryCode = sentryCode.slice(0, evalIdx) + replacement + '\n\n' + sentryCode.slice(nextCheckIdx);
    console.log('[OK] src/sentry.js updated with TAIWAN_STRAIT_ANOMALY check.');
  }
}
fs.writeFileSync(sentryPath, sentryCode, 'utf8');

// 2. Update src/bot.js DM triggers
const botPath = path.join(__dirname, '../src/bot.js');
let botCode = fs.readFileSync(botPath, 'utf8');

if (botCode.includes("} else if (/(台海動態|台海官方|taiwan-status)/.test(msgText)) {")) {
  botCode = botCode.replace(
    "} else if (/(台海動態|台海官方|taiwan-status)/.test(msgText)) {",
    "} else if (/(台海動態|台海官方|taiwan-status|台海|敵情|共機|共艦|國防部|擾台)/.test(msgText)) {"
  );
  console.log('[OK] src/bot.js updated with natural Taiwan Strait DM keywords.');
}

if (botCode.includes("} else if (/(台海趨勢|taiwan-trend)/.test(msgText)) {")) {
  botCode = botCode.replace(
    "} else if (/(台海趨勢|taiwan-trend)/.test(msgText)) {",
    "} else if (/(台海趨勢|taiwan-trend|歷史基線|異常統計)/.test(msgText)) {"
  );
  console.log('[OK] src/bot.js updated with Taiwan trend DM keywords.');
}

// Update help payload to mention '台海'
if (botCode.includes("私訊可輸入「空情」、「在空機」、「衛星」")) {
  botCode = botCode.replace(
    "私訊可輸入「空情」、「在空機」、「衛星」",
    "私訊可輸入「台海」、「空情」、「在空機」、「衛星」"
  );
  console.log('[OK] src/bot.js createHelpPayload updated with 台海 keyword.');
}

fs.writeFileSync(botPath, botCode, 'utf8');
console.log('[COMPLETED] Phase 1 integration patches applied.');
