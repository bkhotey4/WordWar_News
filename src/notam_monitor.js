/**
 * NOTAM (Notice to Air Missions) Airspace Restriction & Military Exercise Monitor
 * Tracks Danger Areas, Military Firing Notices, and Advance Exercise Warnings
 * 
 * Data Sources (in priority order):
 *   1. Auto-fetch: AIS Taiwan / ANWS official NOTAM feed (https://ais.anws.gov.tw)
 *   2. Manual import: research/notam_active.json (requires provenance fields)
 * 
 * NOTAM Revision & Cancellation Tracking:
 *   - NOTAMR (Replace): replaces previous NOTAM with same base ID
 *   - NOTAMC (Cancel): cancels a previously issued NOTAM
 *   Both are tracked in research/notam_revisions.json
 */

const fs = require('fs');
const path = require('path');

const NOTAM_FILE = path.join(__dirname, '../research/notam_active.json');
const NOTAM_REVISIONS_FILE = process.env.WORDWAR_NOTAM_REVISIONS_FILE || path.join(__dirname, '../research/notam_revisions.json');
const NOTAM_AUTO_CACHE_FILE = path.join(__dirname, '../public/data/notam_auto_cache.json');
const NOTAM_AUTO_CACHE_TTL_MS = 60 * 60 * 1000; // 1-hour cache for auto-fetch

const MILITARY_KEYWORDS = [
  'LIVE FIRING', 'MILITARY EXERCISE', 'FIRING EXERCISE', 'GUNNERY',
  'ROCKET', 'DANGER AREA', 'RESTRICTED AREA', 'AIRSPACE RESERVATION',
  'TEMPORARY FLIGHT RESTRICTION', 'TFR', '實彈射擊', '演習', '操演', '危險空域', '管制區'
];

/**
 * Loads revision/cancellation tracking records
 */
function getNotamRevisions() {
  try {
    if (fs.existsSync(NOTAM_REVISIONS_FILE)) {
      return JSON.parse(fs.readFileSync(NOTAM_REVISIONS_FILE, 'utf8'));
    }
  } catch (_) {}
  return { revisions: [], cancellations: [] };
}

/**
 * Records a NOTAM revision or cancellation event
 * @param {string} type - 'REPLACED' | 'CANCELLED'
 * @param {object} notam - the NOTAM record
 * @param {string} replacedById - for NOTAMR, the new NOTAM ID
 */
function recordNotamRevision(type, notam, replacedById = null) {
  try {
    const revisions = getNotamRevisions();
    const key = type === 'CANCELLED' ? 'cancellations' : 'revisions';
    revisions[key] = revisions[key] || [];
    const existing = revisions[key].find(r => r.notamId === notam.id);
    if (!existing) {
      revisions[key].unshift({
        notamId: notam.id,
        title: notam.title,
        fir: notam.fir,
        type,
        replacedById: replacedById || null,
        recordedAt: new Date().toISOString(),
        originalValidFrom: notam.validFrom,
        originalValidTo: notam.validTo
      });
      // Keep last 50 revision records
      revisions[key] = revisions[key].slice(0, 50);
      fs.mkdirSync(path.dirname(NOTAM_REVISIONS_FILE), { recursive: true });
      fs.writeFileSync(NOTAM_REVISIONS_FILE, JSON.stringify(revisions, null, 2), 'utf8');
    }
  } catch (_) {}
}

/**
 * Attempts to auto-fetch NOTAM data from public official sources.
 * Returns parsed NOTAM array or null if unavailable.
 */
async function autoFetchNotams(now = Date.now()) {
  // Check auto-cache first
  try {
    if (fs.existsSync(NOTAM_AUTO_CACHE_FILE)) {
      const cached = JSON.parse(fs.readFileSync(NOTAM_AUTO_CACHE_FILE, 'utf8'));
      const stamp = Date.parse(cached?.fetchedAt || '');
      if (cached.status === 'AVAILABLE' && Number.isFinite(stamp) && stamp <= now && now - stamp < NOTAM_AUTO_CACHE_TTL_MS && Array.isArray(cached.notams)) {
        return { source: 'AUTO_CACHE', notams: cached.notams, fetchedAt: cached.fetchedAt };
      }
    }
  } catch (_) {}

  // Try FAA NOTAM API (public, no auth required for Taiwan FIR via international feed)
  // Taiwan AIS official NOTAM feed — note: ANWS requires registration for full access,
  // but the public PIB (Pre-flight Information Bulletin) endpoint may return summarized data.
  // We attempt gracefully and record status without throwing.
  const endpoints = [
    {
      url: 'https://notams.aim.faa.gov/notamSearch/api',
      label: 'FAA NOTAM API (Public)',
      parse: null // FAA requires POST + auth; placeholder for future implementation
    }
  ];

  // For now, record auto-fetch attempt but return null to indicate manual import still needed
  try {
    fs.mkdirSync(path.dirname(NOTAM_AUTO_CACHE_FILE), { recursive: true });
    fs.writeFileSync(NOTAM_AUTO_CACHE_FILE, JSON.stringify({
      fetchedAt: new Date(now).toISOString(),
      status: 'AUTO_FETCH_NOT_YET_CONFIGURED',
      notams: [],
      note: 'AIS Taiwan (ANWS) 官方 NOTAM 全自動採集尚未接通（需登記取用 API 金鑰）。目前使用手動匯入資料。'
    }, null, 2), 'utf8');
  } catch (_) {}

  return null;
}

/**
 * Evaluates NOTAMs for military firing / exercise advance warnings
 */
function evaluateMilitaryNotams(notams = [], now = Date.now()) {
  if (!Array.isArray(notams)) return [];

  const assessed = [];
  const withdrawn=new Set(notams.filter(n=>n?.notamType==='NOTAMC'||n?.notamType==='NOTAMR').map(n=>n.cancelsId||n.replacesId).filter(Boolean));

  for (const n of notams) {
    if (n?.notamType === 'NOTAMC' || withdrawn.has(n?.id)) {
      assessed.push({...n,status:'WITHDRAWN',isMilitary:false,threatLevel:'ROUTINE',leadTimeHours:0});
      continue;
    }
    if (!n || !n.validFrom || !n.validTo) continue;

    const startMs = Date.parse(n.validFrom);
    const endMs = Date.parse(n.validTo);

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;

    // Check if expired
    if (endMs <= now) {
      assessed.push({ ...n, status: 'EXPIRED', leadTimeHours: 0 });
      // Record expired NOTAMs for revision tracking
      if (n.notamType === 'NOTAMC') recordNotamRevision('CANCELLED', n);
      continue;
    }

    const leadTimeHours = Math.round(((startMs - now) / (3600 * 1000)) * 10) / 10;
    const isMilitary = MILITARY_KEYWORDS.some(kw =>
      (n.type && n.type.toUpperCase().includes(kw)) ||
      (n.title && n.title.toUpperCase().includes(kw)) ||
      (n.rawText && n.rawText.toUpperCase().includes(kw))
    );

    let status = 'INACTIVE';
    if (now >= startMs && now <= endMs) {
      status = 'ACTIVE_NOW'; // Currently underway
    } else if (leadTimeHours > 0) {
      status = 'ADVANCE_WARNING'; // In the future, providing advance warning
    }

    let threatLevel = 'ROUTINE';
    if (isMilitary) {
      if (status === 'ACTIVE_NOW') threatLevel = 'ELEVATED';
      else if (leadTimeHours <= 24 && leadTimeHours > 0) threatLevel = 'HIGH_PRIORITY_ADVANCE';
      else if (leadTimeHours > 24) threatLevel = 'EARLY_ADVISORY';
    }

    // Track NOTAMR (replacement) records
    if (n.notamType === 'NOTAMR' && n.replacesId) {
      recordNotamRevision('REPLACED', { ...n, id: n.replacesId }, n.id);
    }

    assessed.push({
      ...n,
      status,
      isMilitary,
      threatLevel,
      leadTimeHours: status === 'ADVANCE_WARNING' ? Math.max(0, leadTimeHours) : 0,
      durationHours: Math.round(((endMs - startMs) / (3600 * 1000)) * 10) / 10
    });
  }

  return assessed.sort((a, b) => Date.parse(a.validFrom) - Date.parse(b.validFrom));
}

/**
 * Retrieves the current NOTAM feed (manual import + auto-fetch status)
 */
function getNotamFeed(now = Date.now()) {
  let list = [];
  if (fs.existsSync(NOTAM_FILE)) {
    try {
      list = JSON.parse(fs.readFileSync(NOTAM_FILE, 'utf8'));
    } catch (_) {}
  }

  const suppliedCount = Array.isArray(list) ? list.length : 0;
  list = (Array.isArray(list) ? list : []).filter(n => {
    let url; try { url = new URL(n.sourceUrl); } catch (_) { return false; }
    const stamp = Date.parse(n.fetchedAt || '');
    return n.provenanceVerified === true && n.sourceHash && url.protocol === 'https:' &&
      !url.username && !url.password && ['aiss.anws.gov.tw','ais.anws.gov.tw','www.anws.gov.tw','www.caa.gov.tw'].includes(url.hostname) &&
      Number.isFinite(stamp) && stamp <= now && now - stamp <= 3600000;
  });
  const evaluated = evaluateMilitaryNotams(list, now);
  const activeOrUpcoming = evaluated.filter(n => ['ACTIVE_NOW','ADVANCE_WARNING'].includes(n.status));
  const advanceWarnings = evaluated.filter(n => n.status === 'ADVANCE_WARNING' && n.isMilitary);

  // Load auto-fetch status
  let autoFetchStatus = 'NOT_CONFIGURED';
  let autoFetchNote = 'AIS Taiwan (ANWS) 官方自動採集尚未接通';
  try {
    if (fs.existsSync(NOTAM_AUTO_CACHE_FILE)) {
      const autoCache = JSON.parse(fs.readFileSync(NOTAM_AUTO_CACHE_FILE, 'utf8'));
      autoFetchStatus = autoCache.status || 'NOT_CONFIGURED';
      autoFetchNote = autoCache.note || autoFetchNote;
    }
  } catch (_) {}

  // Load revision records
  const revisions = getNotamRevisions();

  return {
    status: list.length ? (activeOrUpcoming.length ? 'AVAILABLE' : 'NO_ACTIVE_IMPORTED_NOTAMS') : 'NOT_CONFIGURED',
    collectionMode: 'MANUAL_IMPORT_ONLY',
    autoFetchStatus,
    autoFetchNote,
    suppliedCount, rejectedCount: suppliedCount - list.length,
    activeNotams: evaluated.filter(n => n.status === 'ACTIVE_NOW' && n.isMilitary),
    checkedAt: new Date(now).toISOString(),
    totalCount: list.length,
    activeOrUpcomingCount: activeOrUpcoming.length,
    advanceWarningsCount: advanceWarnings.length,
    notams: activeOrUpcoming,
    advanceWarnings,
    recentRevisions: (revisions.revisions || []).slice(0, 5),
    recentCancellations: (revisions.cancellations || []).slice(0, 5)
  };
}

/**
 * Async version: attempts auto-fetch then falls back to manual import
 * Use in scheduled refresh; getNotamFeed() remains sync for DM triggers
 */
async function getNotamFeedAsync(now = Date.now()) {
  // Try auto-fetch (non-blocking, logs status to cache file)
  try { await autoFetchNotams(now); } catch (_) {}
  return getNotamFeed(now);
}

/**
 * Formats NOTAM telemetry for Discord
 */
function notamDiscordPayload() {
  const feed = getNotamFeed();
  const lines = [
    '# ✈️ NOTAM 航空禁航通告與軍事演訓預警 // AIRSPACE RESTRICTIONS',
    `> 📡 **監測情報區**: 台北飛航情報區 (Taipei FIR RCAA) 與周邊管轄空域`,
    `> 🕒 **查核時間**: \`${feed.checkedAt}\` ｜ 🚨 **前置預警通告數**: \`${feed.advanceWarningsCount}\` 則`,
    `> 🔌 **官方自動採集**: \`${feed.autoFetchStatus}\` — ${feed.autoFetchNote}`,
    ''
  ];

  if (!feed.notams.length) {
    lines.push('目前沒有可核實的匯入通告。');
    lines.push('⚠️ **重要說明**：AIS Taiwan (ANWS) 官方 NOTAM 自動採集**尚未接通**，系統僅能讀取手動匯入的通告。不能以「無通告顯示」判定空域無管制。');
  } else {
    lines.push('### ⚠️ 【海空管制與演訓通告列表】');
    feed.notams.forEach((n, idx) => {
      const statusBadge = n.status === 'ACTIVE_NOW'
        ? '🔴 【演練進行中 / ACTIVE】'
        : `🟠 【提前預警 / 剩餘 ${n.leadTimeHours} 小時開始】`;
      const revBadge = n.notamType === 'NOTAMR' ? ` *(取代 ${n.replacesId})*` : '';
      const cancelBadge = n.notamType === 'NOTAMC' ? ' *(撤銷通告)*' : '';

      lines.push(
        `**[${idx + 1}]** ${statusBadge} **${n.title}**${revBadge}${cancelBadge} (編號: \`${n.id}\`)\n` +
        `   • 範圍地點: ${n.location}\n` +
        `   • 高度層級: \`${n.lowerLimit}\` 至 \`${n.upperLimit}\` ｜ 操演時長: \`${n.durationHours} 小時\`\n` +
        `   • 生效時間: \`${n.validFrom}\` 至 \`${n.validTo}\`\n` +
        `   • 來源機關: ${n.source}`
      );
    });
  }

  // Show recent revisions/cancellations
  if (feed.recentRevisions.length || feed.recentCancellations.length) {
    lines.push('');
    lines.push('### 📝 【近期通告修訂與撤銷記錄】');
    for (const r of feed.recentRevisions) {
      lines.push(`• NOTAMR 取代: \`${r.notamId}\` → 新通告 \`${r.replacedById}\` (記錄時間: ${r.recordedAt})`);
    }
    for (const c of feed.recentCancellations) {
      lines.push(`• NOTAMC 撤銷: \`${c.notamId}\` — ${c.title} (記錄時間: ${c.recordedAt})`);
    }
  }

  lines.push('');
  lines.push('> 通告生效时間只能說明公告的活動窗口；不代表戰爭將發生，也無法保證提前多少小時預警。');

  return {
    sourceBacked: feed.status !== 'NOT_CONFIGURED',
    content: lines.join('\n').slice(0, 2000),
    files: [],
    embeds: []
  };
}

module.exports = {
  evaluateMilitaryNotams,
  getNotamFeed,
  getNotamFeedAsync,
  notamDiscordPayload,
  recordNotamRevision,
  getNotamRevisions
};

