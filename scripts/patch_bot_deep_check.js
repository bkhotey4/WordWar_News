const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, '../src/bot.js');
let code = fs.readFileSync(botPath, 'utf8');

// 1. Fix hardcoded date in createRussianFlightPayload
const oldDateStr = "`> 📅 **監測時間**: \\`2026-09-23 今日\\` ｜ 🚨 **戰術威脅**: \\`HIGH / 混合空防試探\\``";
const newDateStr = "`> 📅 **監測時間**: \\`${data?.lastUpdatedDisplay || '即時更新'}\\` ｜ 🚨 **戰術威脅**: \\`HIGH / 混合空防試探\\``";

if (code.includes(oldDateStr)) {
  code = code.replace(oldDateStr, newDateStr);
  console.log('[PATCH] Replaced hardcoded date in createRussianFlightPayload');
} else {
  console.warn('[WARN] Could not find oldDateStr in bot.js');
}

// 2. Fix 3-minute Sentry Patrol loop
const oldPatrol = `        await fetchLiveIntelligence();
        const liveData = getLiveIntelData();
        const threat = evaluateThreats(liveData);`;

const newPatrol = `        await fetchLiveIntelligence();
        const liveData = getLiveIntelData();
        liveData.taiwanIntel = getTaiwanFeed();
        liveData.notamFeed = getNotamFeed();
        const threat = evaluateThreats(liveData);`;

// Handle CRLF vs LF
const normalizedCode = code.replace(/\r\n/g, '\n');
const normalizedOldPatrol = oldPatrol.replace(/\r\n/g, '\n');

if (normalizedCode.includes(normalizedOldPatrol)) {
  const isCrlf = code.includes('\r\n');
  const replacement = isCrlf ? newPatrol.replace(/\n/g, '\r\n') : newPatrol;
  const target = isCrlf ? oldPatrol.replace(/\n/g, '\r\n') : oldPatrol;
  code = code.replace(target, replacement);
  console.log('[PATCH] Connected liveData.taiwanIntel and liveData.notamFeed to Sentry patrol loop');
} else {
  console.warn('[WARN] Could not find oldPatrol block in bot.js');
}

// 3. Fix DM natural language theater detection for FIRMS
const oldDmFirms = `} else if (/(火點|熱異常|熱點|firms)/.test(msgText)) {
        sourcePayload = firmsDiscordPayload(await fetchFirmsData());`;

const newDmFirms = `} else if (/(火點|熱異常|熱點|firms)/.test(msgText)) {
        let theater = 'ukraine_front';
        if (/(台海|東南沿海|台灣)/.test(msgText)) theater = 'taiwan_strait';
        else if (/(中東|紅海)/.test(msgText)) theater = 'middle_east';
        sourcePayload = firmsDiscordPayload(await fetchFirmsData(theater));`;

const normalizedOldDmFirms = oldDmFirms.replace(/\r\n/g, '\n');
if (normalizedCode.includes(normalizedOldDmFirms)) {
  const isCrlf = code.includes('\r\n');
  const replacement = isCrlf ? newDmFirms.replace(/\n/g, '\r\n') : newDmFirms;
  const target = isCrlf ? oldDmFirms.replace(/\n/g, '\r\n') : oldDmFirms;
  code = code.replace(target, replacement);
  console.log('[PATCH] Enhanced DM natural language theater detection for FIRMS');
} else {
  console.warn('[WARN] Could not find oldDmFirms block in bot.js');
}

fs.writeFileSync(botPath, code, 'utf8');
console.log('[SUCCESS] bot.js updated successfully!');
