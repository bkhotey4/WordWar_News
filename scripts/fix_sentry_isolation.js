const fs = require('fs');
const path = require('path');

// 1. Update src/sentry.js
const sentryPath = path.join(__dirname, '../src/sentry.js');
let sentryCode = fs.readFileSync(sentryPath, 'utf8');

// Update evaluateThreats to only check feeds when passed in liveData or parameters
sentryCode = sentryCode.replace(
  "const feed = taiwanFeed || (liveData && liveData.taiwanIntel) || getTaiwanFeed(now);",
  "const feed = taiwanFeed || (liveData && liveData.taiwanIntel);"
);

sentryCode = sentryCode.replace(
  "const notamFeed = getNotamFeed(now);",
  "const notamFeed = liveData?.notamFeed;"
);

fs.writeFileSync(sentryPath, sentryCode, 'utf8');
console.log('[OK] src/sentry.js updated with explicit liveData feed checks.');

// 2. Update src/bot.js sentry patrol
const botPath = path.join(__dirname, '../src/bot.js');
let botCode = fs.readFileSync(botPath, 'utf8');

if (botCode.includes("const alert = evaluateThreats(liveData);")) {
  botCode = botCode.replace(
    "const alert = evaluateThreats(liveData);",
    "const alert = evaluateThreats({ ...liveData, taiwanIntel: getTaiwanFeed(), notamFeed: getNotamFeed() });"
  );
  fs.writeFileSync(botPath, botCode, 'utf8');
  console.log('[OK] src/bot.js patrol updated to pass taiwanIntel and notamFeed.');
}

console.log('[COMPLETED] Sentry evaluation isolation applied.');
