const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, '../src/bot.js');
let content = fs.readFileSync(botPath, 'utf8');
const isCrlf = content.includes('\r\n');
const eol = isCrlf ? '\r\n' : '\n';

// 1. Fix lines 1904 to 1945
const oldDmTarget = content.substring(
  content.indexOf('if (message.channel.type === ChannelType.DM) {'),
  content.indexOf('// Subscription command parsing')
);

const newDmTarget = [
  'if (message.channel.type === ChannelType.DM) {',
  '      const msgText = message.content.trim().toLowerCase();',
  '      console.log(`[DISCORD BOT DM] 收到來自 ${message.author.tag} 的訊息: "${message.content}"`);',
  '',
  '      // Explicit Subscription Management in DM',
  '      if (msgText === \'訂閱\' || msgText === \'subscribe\') {',
  '        const added = saveSubscriber(message.author.id, message.author.tag);',
  '        const replyText = added',
  '          ? \'✅ 已完成官方來源即時通知訂閱與摘要。可輸入 `/dm-briefing` 查看最新情報戳記與來源摘要；隨時輸入「取消訂閱」退訂。\'',
  '          : \'ℹ️ 您已在訂閱名單中，可輸入「空情」查詢最新官方來源摘要。\';',
  '        await message.reply(replyText);',
  '        return;',
  '      }',
  '',
  '      if (msgText === \'取消訂閱\' || msgText === \'退訂\' || msgText === \'unsubscribe\') {',
  '        const removed = removeSubscriber(message.author.id);',
  '        const replyText = removed',
  '          ? \'🛑 **已為您取消即時通知**。系統將停止主動向您推送警報與情報；\\n若日後想重新訂閱，隨時輸入「訂閱」或使用 `/dm-subscribe` 指令即可。\'',
  '          : \'ℹ️ 您的帳號目前並未在訂閱名單中。\';',
  '        await message.reply(replyText);',
  '        return;',
  '      }',
  '',
  '      // Sentry Test Alert Trigger (Strictly isolated to current sender - NO MASS BROADCAST)',
  '      if (msgText.includes(\'測試警報\') || msgText.includes(\'test alert\') || msgText.includes(\'模擬警報\')) {',
  '        await message.reply(\'🧪【測試警報】通知管道運作正常。這是測試，不代表任何實體事件或警報級別。\');',
  '        return;',
  '      }',
  '',
  '      // Sentry Status Trigger',
  '      if (msgText.includes(\'哨兵\') || msgText.includes(\'sentry\')) {',
  '        const payload = createSentryStatusPayload();',
  '        await message.reply({ content: payload.content, files: payload.files });',
  '        return;',
  '      }',
  '',
  '      // On-demand Refresh Trigger',
  '      if (msgText.includes(\'重新整理\') || msgText.includes(\'更新\') || msgText.includes(\'重整\') || msgText === \'r\' || msgText.includes(\'refresh\')) {',
  '        await message.reply(\'🔄 正在重新檢查已接通的資料來源...\');',
  '        await fetchLiveIntelligence();',
  '        await message.reply(refreshSummary(getLiveIntelData()));',
  '        return;',
  '      }',
  '',
  '      '
].join(eol);

content = content.replace(oldDmTarget, newDmTarget);

// 2. Add global-brief to DM routes if not present
const oldTrend = 'if (/(台海趨勢|taiwan-trend)/.test(msgText)) {';
if (!content.includes('global-brief|global')) {
  const newGlobal = [
    'if (/(全球戰況|全球簡報|全球情勢|global-brief|global)/.test(msgText)) {',
    '        const report = require(\'./research_reports\').getResearchFeed().reports.find(r => r.coverage?.length);',
    '        sourcePayload = report',
    '          ? researchDiscordPayload(report.id)',
    '          : { sourceBacked: true, content: \'目前沒有通過來源查核的全球簡報。全球頁面可查看各區既有報導與來源影像；無資料不代表沒有衝突。\', embeds: [], files: [], allowedMentions: { parse: [] } };',
    '        if (report && sourcePayload.embeds && sourcePayload.embeds.length) {',
    '          const claims = require(\'./news_context\').getNewsContext().slice(0, 3);',
    '          if (claims.length) {',
    '            sourcePayload.embeds[0].fields = sourcePayload.embeds[0].fields || [];',
    '            sourcePayload.embeds[0].fields.push({',
    '              name: \'國際報導提及的行動方（非影像識別）\',',
    '              value: claims.map(c => `${c.parties.join(\'／\')}：${c.summary.slice(0, 85)} [來源](${c.references[0].url})`).join(\'\\n\').slice(0, 1024)',
    '            });',
    '          }',
    '        }',
    '      } else if (/(台海趨勢|taiwan-trend)/.test(msgText)) {'
  ].join(eol);
  content = content.replace(oldTrend, newGlobal);
}

// 3. Fix dm-subscribe and dm-unsubscribe interaction replies
const oldSubTarget = content.substring(
  content.indexOf('if (commandName === \'dm-subscribe\') {'),
  content.indexOf('// Defer all data commands to prevent 3-second Discord timeouts')
);

const newSubTarget = [
  'if (commandName === \'dm-subscribe\') {',
  '        const added = saveSubscriber(interaction.user.id, interaction.user.tag);',
  '        const msg = added',
  '          ? \'✅ 已完成官方來源即時通知訂閱與摘要。可使用 `/dm-briefing` 查看最新情報戳記與來源摘要。\'',
  '          : \'ℹ️ 您已經在訂閱名單中了！可輸入 `/dm-briefing` 查看最新情報。\';',
  '        await interaction.reply({ content: msg, ephemeral: true });',
  '        return;',
  '      }',
  '',
  '      if (commandName === \'dm-unsubscribe\') {',
  '        const removed = removeSubscriber(interaction.user.id);',
  '        const msg = removed',
  '          ? \'🛑 已為您取消即時通知訂閱。\'',
  '          : \'ℹ️ 您的帳號目前尚未訂閱私訊推播。\';',
  '        await interaction.reply({ content: msg, ephemeral: true });',
  '        return;',
  '      }',
  '',
  '      '
].join(eol);

content = content.replace(oldSubTarget, newSubTarget);

// 4. Fix lines 2278-2305
content = content.replace(
  /\? \*\*[\s\S]*?自\?接\?\?/g,
  '📑 **每日戰報已單獨發送至您的私訊！**\\n（非管理員訂閱者請輸入「訂閱」在定時推播時自動接收）'
);

content = content.replace(
  /\?\? \*\*\?\?\?\?制保護?\*：[\s\S]*?秒\?\?試\?/g,
  '⏳ **廣播頻率限制保護**：手動對全體廣播冷卻中，請等待 ${waitSec} 秒後再試。'
);

content = content.replace(
  /\'\?\?來\?\?\?已送至訂閱\?\?\?容\?\?\?可檢查\?\?\?\?題\?來\?\?\?\?\'/g,
  '\'✅ 官方來源簡報已送至訂閱者，內容來源均可檢查各專題與來源清單。\''
);

fs.writeFileSync(botPath, content, 'utf8');
console.log('Successfully applied all bot.js fixes with UTF-8 encoding!');
