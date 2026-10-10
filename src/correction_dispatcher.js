/**
 * WordWar_News - Official Notice Correction & Withdrawal Dispatcher
 * 
 * Implements Open Teacher Requirement:
 * "把官方公告的原文更正與撤回串成同一事件，對已推播內容發更正稿。"
 * 
 * Monitors:
 *   1. Taiwan MND official updates / corrections recorded in intel_store changes (kind === 'CORRECTION')
 *   2. NOTAM cancellations (NOTAMC) and replacements (NOTAMR) recorded in notam_revisions.json
 * 
 * Features:
 *   - Avoids duplicate dispatches via research/correction_deliveries.json
 *   - Formats clear, factual correction notices (old vs. new values, official URLs)
 *   - Broadcasts to subscribers with isCorrection: true badge
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getStore } = require('./intel_store');
const { getNotamRevisions } = require('./notam_monitor');
const { shouldDeliverToUser, markEventDelivered } = require('./subscription_manager');

const DISPATCH_LEDGER_FILE = path.join(__dirname, '../research/correction_deliveries.json');

/**
 * Loads delivery records of already-dispatched corrections
 */
function loadDispatchLedger() {
  try {
    if (fs.existsSync(DISPATCH_LEDGER_FILE)) {
      return JSON.parse(fs.readFileSync(DISPATCH_LEDGER_FILE, 'utf8'));
    }
  } catch (_) {}
  return { dispatchedIds: [] };
}

/**
 * Saves delivery records atomically
 */
function saveDispatchLedger(data) {
  const tmp = `${DISPATCH_LEDGER_FILE}.${crypto.randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(DISPATCH_LEDGER_FILE), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DISPATCH_LEDGER_FILE);
}

/**
 * Checks for any pending official MND document corrections
 * @param {object} store - IntelStore instance
 * @returns {Array} array of correction items
 */
function checkMndCorrections(store = getStore()) {
  const corrections = [];
  // 只處理國防部原文的修訂；其他來源（例如烏克蘭通報、新聞）重新抓取造成的內容變動不是「國防部通報修訂」
  const changes = store.changes(200).filter(c => c.kind === 'CORRECTION' && c.originGroup === 'TAIWAN_MND');

  for (const c of changes) {
    corrections.push({
      id: `MND_CORR_${c.id}_${c.documentId}`,
      sourceType: 'TAIWAN_MND',
      title: `國防部官方通報修訂：${c.title}`,
      url: c.url,
      recordedAt: c.recordedAt,
      previousObservation: c.previousObservation,
      currentObservation: c.observation,
      summary: `國防部已更新發布「${c.title}」之官方觀測數據。系統即時追蹤此修訂並記錄為同一事件之更正稿。`,
      diffText: formatObservationDiff(c.previousObservation, c.observation)
    });
  }

  return corrections;
}

/**
 * Formats difference between prior and new observation metrics
 */
function formatObservationDiff(prior, current) {
  if (!prior && !current) return '官方公布內文微調，主要計數指標無變更。';
  const lines = [];
  const keys = { aircraft: '共機架次', ships: '共艦艘次', officialVessels: '公務船', crossingOrAirspace: '越中線／空域' };
  for (const [k, name] of Object.entries(keys)) {
    const vOld = prior?.[k]?.value;
    const vNew = current?.[k]?.value;
    if (vOld !== undefined || vNew !== undefined) {
      if (vOld !== vNew) {
        lines.push(`• ${name}: 原報 ${vOld ?? '無'} → 修正為 ${vNew ?? '無'}`);
      }
    }
  }
  return lines.length ? lines.join('\n') : '官方通報內文或附圖進行了修訂更新。';
}

/**
 * Checks for pending NOTAM cancellations and replacements
 * @returns {Array} array of NOTAM revision notices
 */
function checkNotamRevisions() {
  const notices = [];
  const revisions = getNotamRevisions();

  // Cancellations (NOTAMC)
  for (const c of (revisions.cancellations || [])) {
    notices.push({
      id: `NOTAM_CANCEL_${c.notamId}`,
      sourceType: 'NOTAM_CANCELLATION',
      title: `NOTAM 航空管制通告撤銷：${c.notamId}`,
      notamId: c.notamId,
      originalTitle: c.title,
      fir: c.fir,
      recordedAt: c.recordedAt,
      summary: `原發布之海空管制通告「${c.title}」（編號 ${c.notamId}）已被官方發布 NOTAMC 撤銷，該空域活動窗口已失效。`
    });
  }

  // Replacements (NOTAMR)
  for (const r of (revisions.revisions || [])) {
    notices.push({
      id: `NOTAM_REPLACE_${r.notamId}_${r.replacedById}`,
      sourceType: 'NOTAM_REPLACEMENT',
      title: `NOTAM 航空管制通告修訂取代：${r.notamId} → ${r.replacedById}`,
      notamId: r.notamId,
      replacedById: r.replacedById,
      originalTitle: r.title,
      fir: r.fir,
      recordedAt: r.recordedAt,
      summary: `原通告「${r.title}」（編號 ${r.notamId}）已被新通告 ${r.replacedById} 取代，操演範圍或時間已更新。`
    });
  }

  return notices;
}

/**
 * Gathers all pending corrections that have not yet been dispatched
 * @returns {Array} array of unnotified correction objects
 */
function getPendingCorrections(store = getStore()) {
  const ledger = loadDispatchLedger();
  const dispatchedSet = new Set(ledger.dispatchedIds || []);

  const allCorrections = [
    ...checkMndCorrections(store),
    ...checkNotamRevisions()
  ];

  return allCorrections.filter(item => !dispatchedSet.has(item.id));
}

/**
 * Formats a correction notice for Discord
 * @param {object} item - correction item
 * @returns {string} formatted markdown
 */
function formatCorrectionDiscordPayload(item) {
  const lines = [
    '# 📝 【官方通報更正與撤回公告 // OFFICIAL CORRECTION】',
    `> 🔔 **修訂類型**: \`${item.sourceType}\` ｜ **記錄時間**: \`${item.recordedAt}\``,
    `> 🎯 **更正主旨**: ${item.title}`,
    '',
    `### 📋 【更正與撤回說明】`,
    item.summary
  ];

  if (item.diffText) {
    lines.push('', '### 🔍 【指標數值比對】', item.diffText);
  }

  if (item.url) {
    lines.push('', `🔗 **官方來源**: ${item.url}`);
  }

  lines.push('', '> ⚠️ **原則**: 系統主動追蹤官方通報之撤銷與修正，以維持情報真實性，不由舊聞推論後續戰況。');

  return lines.join('\n').slice(0, 2000);
}

/**
 * Dispatches pending corrections to subscribers who opted into corrections
 * @param {object} client - Discord.js client
 * @param {Array} subscribers - list of subscriber objects [{ userId }]
 * @param {object} store - IntelStore instance
 * @returns {Promise<number>} count of dispatched corrections
 */
async function dispatchPendingCorrections(client, subscribers = [], store = getStore()) {
  const pending = getPendingCorrections(store);
  if (!pending.length) return 0;

  const ledger = loadDispatchLedger();
  let dispatchedCount = 0;

  for (const item of pending) {
    const content = formatCorrectionDiscordPayload(item);
    const alertInfo = {
      level: 'ROUTINE',
      code: 'OFFICIAL_CORRECTION',
      title: item.title,
      isCorrection: true,
      eventId: item.id
    };

    let deliveredToAny = false;

    for (const sub of subscribers) {
      const decision = shouldDeliverToUser(sub.userId, alertInfo);
      if (!decision.deliver) continue;

      try {
        const user = await client.users.fetch(sub.userId);
        if (user) {
          await user.send({ content, allowedMentions: { parse: [] } });
          markEventDelivered(sub.userId, item.id);
          deliveredToAny = true;
        }
      } catch (err) {
        console.error(`[CORRECTION DISPATCH ERROR] Failed to send to ${sub.userId}:`, err.message);
      }
    }

    // Mark as dispatched regardless of whether subscribers received it to avoid loops
    ledger.dispatchedIds.push(item.id);
    // Keep last 200 dispatched IDs
    ledger.dispatchedIds = ledger.dispatchedIds.slice(-200);
    saveDispatchLedger(ledger);
    dispatchedCount++;
    console.log(`[CORRECTION DISPATCHED] ${item.title} (delivered: ${deliveredToAny})`);
  }

  return dispatchedCount;
}

module.exports = {
  checkMndCorrections,
  checkNotamRevisions,
  getPendingCorrections,
  formatCorrectionDiscordPayload,
  dispatchPendingCorrections,
  formatObservationDiff
};
