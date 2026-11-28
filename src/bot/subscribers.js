'use strict';
// 私訊訂閱名單讀寫（src/subscribers.json）
const fs = require('fs');
const path = require('path');

// New modules (Open Teacher code review additions)
const SUBSCRIBERS_FILE = path.join(__dirname, '../subscribers.json');

// Read and write subscribers
// strict：讀檔失敗就丟錯（寫入前用，避免把空名單寫回去蓋掉所有訂閱者）
function getSubscribers({ strict = false } = {}) {
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8'));
      return data.subscribers || [];
    }
  } catch (e) {
    console.error('Error reading subscribers:', e);
    if (strict) throw new Error('訂閱名單讀取失敗，為避免覆蓋已中止寫入');
  }
  return [];
}
function writeSubscribers(subs) {
  const tmp = `${SUBSCRIBERS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ subscribers: subs }, null, 2));
  fs.renameSync(tmp, SUBSCRIBERS_FILE);
}

function saveSubscriber(userId, tag) {
  const subs = getSubscribers({ strict: true });
  const existing = subs.find(s => s.userId === userId);
  if (!existing) {
    subs.push({ userId, tag, subscribedAt: new Date().toISOString() });
    writeSubscribers(subs);
    return true;
  }
  return false;
}

function removeSubscriber(userId) {
  const subs = getSubscribers({ strict: true });
  const filtered = subs.filter(s => s.userId !== userId);
  writeSubscribers(filtered);
  return filtered.length !== subs.length;
}

module.exports = { getSubscribers, saveSubscriber, removeSubscriber };
