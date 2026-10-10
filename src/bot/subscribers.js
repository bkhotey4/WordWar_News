'use strict';
// 私訊訂閱名單讀寫（src/subscribers.json）
const fs = require('fs');
const path = require('path');

// New modules (Open Teacher code review additions)
const SUBSCRIBERS_FILE = path.join(__dirname, '../subscribers.json');

// Read and write subscribers
function getSubscribers() {
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8'));
      return data.subscribers || [];
    }
  } catch (e) {
    console.error('Error reading subscribers:', e);
  }
  return [];
}

function saveSubscriber(userId, tag) {
  const subs = getSubscribers();
  const existing = subs.find(s => s.userId === userId);
  if (!existing) {
    subs.push({ userId, tag, subscribedAt: new Date().toISOString() });
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify({ subscribers: subs }, null, 2));
    return true;
  }
  return false;
}

function removeSubscriber(userId) {
  const subs = getSubscribers();
  const filtered = subs.filter(s => s.userId !== userId);
  fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify({ subscribers: filtered }, null, 2));
  return filtered.length !== subs.length;
}

module.exports = { getSubscribers, saveSubscriber, removeSubscriber };
