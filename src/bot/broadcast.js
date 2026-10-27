'use strict';
// 警報與每日簡報群發（逐人紀錄送達，避免重送）

const { saveAlertRecord } = require('../sentry');
const { formatVerifiedSitrep } = require('../verification_engine');
// New modules (Open Teacher code review additions)
const { shouldDeliverToUser, markEventDelivered } = require('../subscription_manager');
const state = require('./state');
const { getSubscribers } = require('./subscribers');
const { getLiveIntelData, createVerifiedBriefingPayload } = require('./payloads');

/**
 * 🚨 PROACTIVE BROADCAST: Sends Emergency Alert to all subscribers (CRITICAL or ELEVATED)
 */
function formatBroadcastContent(alertInfo, isSimulated = false) {
  if (isSimulated) {
    return [
      '# 🧪 哨兵雷達模擬測試警報',
      '> 🏷️ **情報評級**: `[A1 系統功能測試]`',
      alertInfo.title || '模擬突發空域威脅通報',
      alertInfo.summary || '此為通知管道功能性演練，不代表真實事件。',
      '模擬測試 ' + new Date().toISOString()
    ].join('\n');
  }

  if (alertInfo.code === 'VERIFIED_MILITARY_SITREP' && alertInfo.evaluation) {
    return formatVerifiedSitrep(alertInfo.evaluation);
  }

  if (alertInfo.code === 'TAIWAN_STRAIT_ANOMALY') {
    return [
      '# 📊 國防部台海動態統計異常通報',
      `> 🏷️ **情報評級**: \`[官方通報統計異常 / 尚未確認軍事意圖]\` ｜ 📍 **觀測範圍**: \`臺灣海峽及周邊海空域\``,
      `### ${alertInfo.title}`,
      `• **官方通報統計摘要**：${alertInfo.summary}`,
      alertInfo.sourceUrl ? `• **國防部原始公告**：${alertInfo.sourceUrl}` : null,
      alertInfo.observedAt ? `• **統計期間**：${alertInfo.observedAt}` : null,
      '',
      '> 🧭 **研判說明**: 共機／共艦活動量逾越歷史第 95 百分位 (P95)，已列入統計異常比對，但不等於事件或攻擊已證實。'
    ].filter(Boolean).join('\n');
  }

  if (alertInfo.code === 'NOTAM_EXERCISE_ADVANCE_WARNING') {
    return [
      '# ✈️ 飛航公告 NOTAM 軍事演訓管制區設置預警',
      `> 🏷️ **情報評級**: \`[已匯入公告 / 不代表戰備升級]\` ｜ 📍 **管制情報源**: \`飛航情報區／指定空域\``,
      `### ${alertInfo.title}`,
      `• **演訓管制詳情**：${alertInfo.summary}`,
      alertInfo.sourceUrl ? `• **公告來源**：${alertInfo.sourceUrl}` : null,
      alertInfo.observedAt ? `• **管制起訖**：${alertInfo.observedAt}` : null,
      '',
      '> 🧭 **研判說明**: 本通知係依已匯入的飛航公告 (NOTAM) 所列海空域演訓設置預警，不代表戰備等級變更。'
    ].filter(Boolean).join('\n');
  }

  if (alertInfo.code === 'FIRMS_THERMAL_ANOMALY') {
    return [
      '# 🔥 NASA FIRMS 衛星即時熱點異常特報',
      `> 🏷️ **情報評級**: \`[熱異常觀測 / 原因待查]\` ｜ 🛰️ **偵測衛星**: \`Suomi-NPP\``,
      `### ${alertInfo.title}`,
      `• **衛星熱異常摘要**：${alertInfo.summary}`,
      alertInfo.sourceUrl ? `• **NASA 系統**：${alertInfo.sourceUrl}` : null,
      alertInfo.observedAt ? `• **偵測時間**：${alertInfo.observedAt}` : null,
      '',
      '> 🧭 **研判說明**: 衛星偵測到熱輻射異常，可能是工業熱源、野火或農業燃燒，不能單獨判定是否為軍事攻擊。'
    ].filter(Boolean).join('\n');
  }

  return [
    '# 📢 公開來源資料更新通知',
    alertInfo.title,
    alertInfo.summary,
    alertInfo.sourceUrl ? `來源連結：${alertInfo.sourceUrl}` : null,
    alertInfo.observedAt ? `資料時間：${alertInfo.observedAt}` : null
  ].filter(Boolean).join('\n');
}

async function broadcastEmergencyAlert(client, alertInfo, isSimulated = false, singleTargetUser = null) {
  const content = formatBroadcastContent(alertInfo, isSimulated);
  if (!isSimulated) {
    const rawRecipients = singleTargetUser ? [singleTargetUser.id] : getSubscribers().map(sub => sub.userId);
    const recipients = rawRecipients.filter(userId => {
      const decision = shouldDeliverToUser(userId, alertInfo);
      if (!decision.deliver) {
        console.log(`[SENTRY SUPPRESS] ${userId}: ${decision.reason}`);
        return false;
      }
      return true;
    });
    if (!recipients.length) {
      console.log('[SENTRY ALERT] 所有訂閱者因戰區篩選或靜默時段暫緩推播');
      saveAlertRecord({ ...alertInfo, delivered: 0 });
      return;
    }
    const eventKey = alertInfo.eventId || `${alertInfo.title}:${Math.floor(Date.now() / (4 * 60 * 60_000))}`;
    const result = await state.scheduledDeliveries.send(`alert:${eventKey}`, recipients, async userId => {
      const user = singleTargetUser?.id === userId ? singleTargetUser : await client.users.fetch(userId);
      await user.send({ content: content.slice(0, 2000), allowedMentions: { parse: [] } });
      markEventDelivered(userId, eventKey);
    });
    if (result?.complete) saveAlertRecord({ ...alertInfo, delivered: result.delivered });
    return;
  }
  const recipients = singleTargetUser ? [singleTargetUser] : await Promise.all(getSubscribers().map(async sub => {
    try { return await client.users.fetch(sub.userId); } catch (err) { return null; }
  }));
  let delivered = 0;
  for (const user of recipients) {
    if (!user) continue;
    try { await user.send({ content: content.slice(0, 2000), allowedMentions: { parse: [] } }); delivered++; }
    catch (err) { console.error(`[SENTRY SEND ERROR] ${user.id}:`, err.message); }
  }
}

async function broadcastDailyBriefing(client, briefingType = 'MORNING') {
  const payload = await createVerifiedBriefingPayload(getLiveIntelData());
  for (const sub of getSubscribers()) {
    try {
      const user = await client.users.fetch(sub.userId);
      if (user) await user.send(payload);
    } catch (err) {
      console.error(`[DAILY BRIEFING ERROR] ${sub.userId}:`, err.message);
    }
  }
}

module.exports = { formatBroadcastContent, broadcastEmergencyAlert, broadcastDailyBriefing };
