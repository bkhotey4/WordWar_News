'use strict';
// 私訊指令：查詢類內容都在網站（https://bkhotey4.github.io/wordwar-intel/），機器人只處理推播相關的個人設定：
// 訂閱／取消訂閱、訂閱戰區、靜默時段、推播門檻、訂閱設定，以及依人數天數換算的準備清單。其他訊息回覆簡短說明與網站連結。
const { ChannelType } = require('discord.js');
const { formatUserPrefs, parseSubscriptionCommand, setTheaterSubscriptions, setQuietHours } = require('../subscription_manager');
const { saveSubscriber, removeSubscriber } = require('./subscribers');
const { createHelpPayload } = require('./payloads');

async function handleMessage(client, message) {
  if (message.author.bot) return;
  if (message.channel.type !== ChannelType.DM) return;

  const msgText = message.content.trim().toLowerCase();
  console.log(`[DISCORD BOT DM] 收到來自 ${message.author.tag} 的訊息: "${message.content}"`);

  if (msgText === '訂閱' || msgText === 'subscribe') {
    const added = saveSubscriber(message.author.id, message.author.tag);
    await message.reply(added
      ? '✅ 已訂閱私訊推播：燈號升級、前兆組合、研究報導等會主動通知您。輸入「訂閱設定」查看或調整；隨時輸入「取消訂閱」退訂。'
      : 'ℹ️ 您已在訂閱名單中。輸入「訂閱設定」查看目前設定。');
    return;
  }

  if (msgText === '取消訂閱' || msgText === '退訂' || msgText === 'unsubscribe') {
    const removed = removeSubscriber(message.author.id);
    await message.reply(removed
      ? '🛑 **已為您取消私訊推播**。日後想重新訂閱，輸入「訂閱」或使用 `/dm-subscribe` 即可。'
      : 'ℹ️ 您的帳號目前並未在訂閱名單中。');
    return;
  }

  // 訂閱戰區、靜默時段、推播門檻、訂閱設定
  const subCmd = parseSubscriptionCommand(msgText);
  if (subCmd) {
    if (subCmd.action === 'SET_THEATER') {
      const subs = subCmd.theaters || [subCmd.theater];
      setTheaterSubscriptions(message.author.id, subs);
      const { THEATER_LABELS } = require('../subscription_manager');
      await message.reply(`✅ 已更新您的訂閱戰區為：${subs.map(t => THEATER_LABELS[t] || t).join('、')}\n輸入「訂閱設定」隨時查看。台海準備提醒與每日摘要不受戰區篩選影響。`);
    } else if (subCmd.action === 'SET_QUIET') {
      setQuietHours(message.author.id, subCmd.start, subCmd.end);
      await message.reply(`🌙 已設定靜默時段：\`${subCmd.start}\` 至 \`${subCmd.end}\`（期間暫停一般警報）`);
    } else if (subCmd.action === 'CLEAR_QUIET') {
      setQuietHours(message.author.id, null, null);
      await message.reply('🔔 已關閉靜默時段，恢復全天候接收通知。');
    } else if (subCmd.action === 'SET_MODE') {
      const { setUserPrefs, ALERT_MODES } = require('../subscription_manager');
      setUserPrefs(message.author.id, { alertMode: subCmd.mode });
      await message.reply(`✅ 推播門檻已設為：${ALERT_MODES[subCmd.mode].label}\n輸入「訂閱設定」隨時查看；輸入「推播門檻 全部」可恢復。`);
    } else if (subCmd.action === 'SHOW_PREFS') {
      await message.reply(formatUserPrefs(message.author.id));
    }
    return;
  }

  // 準備清單：依人數天數換算（網站只有固定版本）
  if (/(準備清單|要買什麼|要買甚麼|買什麼|囤貨|儲備清單|避難包|^prepare)/.test(msgText)) {
    const p = require('../preparedness');
    const payload = p.prepareDiscordPayload(p.parsePrepareText(msgText));
    await message.reply({ content: payload.content, allowedMentions: { parse: [] } });
    for (const part of payload.extra) await message.channel.send({ content: part, allowedMentions: { parse: [] } });
    return;
  }

  // 其他（舊關鍵字、查詢）：查詢內容都在網站
  await message.reply({ content: createHelpPayload().content, allowedMentions: { parse: [] } });
}

module.exports = { handleMessage };
