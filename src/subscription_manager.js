/**
 * WordWar_News - Theater Subscription & Silence Manager (src/subscription_manager.js)
 * 
 * Feature: 分戰區訂閱、靜默時段、同事件更新與更正通知（新功能 #3）
 * 
 * Extends the base subscribers.json system with:
 *   1. Per-theater subscription filters (only receive alerts from theaters of interest)
 *   2. Quiet hours (local time window where non-CRITICAL alerts are suppressed)
 *   3. Deduplication: same-event update tracking (send UPDATE badge, not duplicate alert)
 *   4. Correction notifications (if an event's assessment changes, send CORRECTION badge)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PREFS_FILE = process.env.WORDWAR_PREFS_FILE || path.join(__dirname, 'subscriber_prefs.json');

const VALID_THEATERS = ['ukraine_front', 'taiwan_strait', 'iran_gulf', 'europe_security', 'middle_east', 'sudan', 'myanmar', 'south_china_sea', 'korea_peninsula', 'global', 'all'];
const THEATER_LABELS = { ukraine_front: '烏俄戰爭', taiwan_strait: '台海', iran_gulf: '美伊與荷莫茲', europe_security: '歐洲與北約東翼', middle_east: '以巴、黎巴嫩與紅海', sudan: '蘇丹', myanmar: '緬甸', south_china_sea: '南海', korea_peninsula: '朝鮮半島', global: '全球其他', all: '全部戰區' };
const DEFAULT_PREFS = {
  theaters: ['all'],      // Subscribe to all theaters by default
  quietHoursStart: null,  // e.g., "23:00" (local time HH:MM)
  quietHoursEnd: null,    // e.g., "07:00"
  quietHoursTimezone: 'Asia/Taipei',
  suppressedEventIds: [], // Event IDs already sent; used for dedup (last 50)
  receiveUpdates: true,   // Get same-event update notifications
  receiveCorrections: true // Get correction/downgrade notifications
};

/**
 * Loads all subscriber preferences
 */
function loadPrefs() {
  try {
    if (fs.existsSync(PREFS_FILE)) {
      return JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
    }
  } catch (_) {}
  return { users: {} };
}

/**
 * Saves preferences atomically
 */
function savePrefs(data) {
  const tmp = `${PREFS_FILE}.${crypto.randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(PREFS_FILE), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, PREFS_FILE);
}

/**
 * Gets preferences for a user (returns defaults if not set)
 */
function getUserPrefs(userId) {
  const data = loadPrefs();
  return { ...DEFAULT_PREFS, ...(data.users[userId] || {}) };
}

/**
 * Updates preferences for a user
 */
function setUserPrefs(userId, updates) {
  const data = loadPrefs();
  data.users[userId] = { ...DEFAULT_PREFS, ...(data.users[userId] || {}), ...updates };
  savePrefs(data);
  return data.users[userId];
}

/**
 * Subscribes a user to specific theaters (replaces theater list)
 * @param {string} userId
 * @param {string[]} theaters - array from VALID_THEATERS
 */
function setTheaterSubscriptions(userId, theaters) {
  const valid = theaters.filter(t => VALID_THEATERS.includes(t));
  if (!valid.length) throw new Error(`Invalid theaters. Valid options: ${VALID_THEATERS.join(', ')}`);
  return setUserPrefs(userId, { theaters: valid });
}

/**
 * Sets quiet hours for a user
 * @param {string} userId
 * @param {string|null} start - "HH:MM" or null to disable
 * @param {string|null} end   - "HH:MM" or null to disable
 */
function setTheaterMute(userId, theater, until) {
  if (!/^[a-z_]{2,40}$/.test(theater || '')) throw Error('Invalid theater');
  const muted = { ...(getUserPrefs(userId).mutedTheaters || {}) };
  if (until) muted[theater] = until; else delete muted[theater];
  for (const [k, v] of Object.entries(muted)) if (Date.parse(v) <= Date.now()) delete muted[k];
  return setUserPrefs(userId, { mutedTheaters: muted });
}

function setQuietHours(userId, start, end) {
  const valid=value=>value===null||/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  if(!valid(start)||!valid(end)||(start===null)!==(end===null))throw Error('Quiet hours require two valid HH:MM values or two null values');
  return setUserPrefs(userId, { quietHoursStart: start, quietHoursEnd: end });
}

/**
 * Checks if current time is within a user's quiet hours (non-CRITICAL suppression)
 * @param {string} userId
 * @param {Date} now - current Date (defaults to now)
 * @returns {boolean} true if quiet hours active
 */
function isInQuietHours(userId, now = new Date()) {
  const prefs = getUserPrefs(userId);
  if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;
  
  try {
    // Get current hour:minute in user's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: prefs.quietHoursTimezone || 'Asia/Taipei',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    const parts = formatter.formatToParts(now);
    const hh = parts.find(p => p.type === 'hour')?.value || '00';
    const mm = parts.find(p => p.type === 'minute')?.value || '00';
    const currentMins = parseInt(hh) * 60 + parseInt(mm);
    
    const [startH, startM] = prefs.quietHoursStart.split(':').map(Number);
    const [endH, endM] = prefs.quietHoursEnd.split(':').map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;
    
    // Handle overnight quiet hours (e.g., 23:00 - 07:00)
    if (startMins > endMins) {
      return currentMins >= startMins || currentMins < endMins;
    }
    return currentMins >= startMins && currentMins < endMins;
  } catch (_) {
    return false;
  }
}

/**
 * Determines if an alert should be delivered to a user.
 * Applies theater filter, quiet hours, and deduplication.
 * 
 * @param {string} userId
 * @param {object} alert - { theater, level, code, eventId }
 * @returns {{ deliver: boolean, reason: string, badge: string|null }}
 */
function shouldDeliverToUser(userId, alert) {
  const prefs = getUserPrefs(userId);
  
  // 1. Theater filter: skip if user is not subscribed to this theater
  const subscribedTheaters = prefs.theaters || ['all'];
  if (!subscribedTheaters.includes('all') && alert.theater && !subscribedTheaters.includes(alert.theater)) {
    return { deliver: false, reason: `戰區 ${alert.theater} 不在訂閱範圍內`, badge: null };
  }
  
  // 1b. 按鈕靜音：該戰區 24 小時內只送危機級（CRITICAL）推播
  const muteUntil = alert.theater && prefs.mutedTheaters?.[alert.theater];
  if (muteUntil && Date.parse(muteUntil) > Date.now() && alert.level !== 'CRITICAL') {
    return { deliver: false, reason: `戰區 ${alert.theater} 靜音中`, badge: null };
  }

  // 2. Quiet hours: suppress non-CRITICAL alerts during quiet time
  if (alert.level !== 'CRITICAL' && isInQuietHours(userId)) {
    return { deliver: false, reason: '靜默時段中（非緊急警報已暫停）', badge: null };
  }
  
  // 3. Deduplication + UPDATE badge
  const suppressedIds = prefs.suppressedEventIds || [];
  const eventKey = alert.eventId || alert.code;
  
  if (eventKey && suppressedIds.includes(eventKey)) {
    // Already sent — send UPDATE if enabled
    if (prefs.receiveUpdates && alert.isUpdate) {
      return { deliver: true, reason: '同事件更新通知', badge: '🔄 【更新】' };
    }
    if (prefs.receiveCorrections && alert.isCorrection) {
      return { deliver: true, reason: '事件更正通知', badge: '📝 【更正】' };
    }
    return { deliver: false, reason: '事件已推播過，去重保護中', badge: null };
  }
  
  return { deliver: true, reason: 'OK', badge: null };
}

/**
 * Records that an event has been delivered to a user (for deduplication)
 */
function markEventDelivered(userId, eventId) {
  const prefs = getUserPrefs(userId);
  const ids = [...new Set([...(prefs.suppressedEventIds || []), eventId])];
  // Keep last 50 suppressed IDs
  setUserPrefs(userId, { suppressedEventIds: ids.slice(-50) });
}

/**
 * Formats subscription preferences as Discord-readable text
 */
function formatUserPrefs(userId) {
  const prefs = getUserPrefs(userId);
  const theaterList = (prefs.theaters || ['all']).map(t => THEATER_LABELS[t] || t).join('、');
  const muted = Object.entries(prefs.mutedTheaters || {}).filter(([, until]) => Date.parse(until) > Date.now())
    .map(([t, until]) => `${THEATER_LABELS[t] || t}（到 ${new Date(Date.parse(until) + 8 * 3600_000).toISOString().slice(5, 16).replace('T', ' ')}）`);
  const quietStatus = prefs.quietHoursStart && prefs.quietHoursEnd
    ? `🌙 靜默時段: ${prefs.quietHoursStart} — ${prefs.quietHoursEnd} (${prefs.quietHoursTimezone})`
    : '🔔 無靜默時段（24 小時全天推播）';
  
  return [
    '## ⚙️ 您的訂閱設定',
    `• **訂閱戰區**: ${theaterList}`,
    `• ${quietStatus}`,
    `• **同事件更新通知**: ${prefs.receiveUpdates ? '✅ 開啟' : '❌ 關閉'}`,
    `• **事件更正通知**: ${prefs.receiveCorrections ? '✅ 開啟' : '❌ 關閉'}`,
    ...(muted.length ? [`• 🔕 **暫時靜音**: ${muted.join('、')}`] : []),
    '',
    '可使用以下 DM 指令調整:',
    '• `訂閱戰區 台海 美伊`（可多個：台海、烏俄、美伊、波蘭、中東、南海）／`訂閱戰區 全部`',
    '• `靜默 23:00 07:00` — 設定靜默時段 (使用 24h 格式)',
    '• `取消靜默` — 關閉靜默時段'
  ].join('\n');
}

/**
 * Parses user DM text for subscription management commands
 * Returns { action, params } or null if not a subscription command
 */
function parseSubscriptionCommand(text) {
  const t = text.trim().toLowerCase();
  
  // 訂閱戰區 / theater subscription
  if (/^訂閱戰區/.test(t)) {
    // 可一次訂閱多個戰區，例如「訂閱戰區 台海 美伊 波蘭」
    const theaterMap = [
      [/台海|臺海|台灣|臺灣|taiwan/, 'taiwan_strait'], [/烏俄|烏克蘭|俄羅斯|ukraine/, 'ukraine_front'],
      [/美伊|伊朗|荷莫茲|波灣|iran/, 'iran_gulf'], [/波蘭|北約|歐洲|nato|poland/, 'europe_security'],
      [/中東|以巴|加薩|黎巴嫩|紅海|israel|gaza/, 'middle_east'], [/南海|south china sea/, 'south_china_sea'], [/朝鮮|北韓|南韓|韓國|korea/, 'korea_peninsula'],
      [/蘇丹|sudan/, 'sudan'], [/緬甸|myanmar/, 'myanmar'], [/全部|全球|all/, 'all']
    ];
    const theaters = theaterMap.filter(([re]) => re.test(t)).map(([, id]) => id);
    if (theaters.includes('all')) return { action: 'SET_THEATER', theater: 'all', theaters: ['all'] };
    if (theaters.length) return { action: 'SET_THEATER', theater: theaters[0], theaters };
  }
  
  // 靜默時段
  const quietMatch = t.match(/^靜默\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})/);
  if (quietMatch) return { action: 'SET_QUIET', start: quietMatch[1], end: quietMatch[2] };
  
  if (/^取消靜默|^關閉靜默/.test(t)) return { action: 'CLEAR_QUIET' };
  
  if (/^訂閱設定|^我的設定|^subscription settings/.test(t)) return { action: 'SHOW_PREFS' };
  
  return null;
}

module.exports = {
  getUserPrefs,
  setUserPrefs,
  setTheaterSubscriptions,
  setQuietHours,
  isInQuietHours,
  shouldDeliverToUser,
  setTheaterMute,
  markEventDelivered,
  formatUserPrefs,
  parseSubscriptionCommand,
  VALID_THEATERS,
  THEATER_LABELS
};
