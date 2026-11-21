/**
 * WordWar_News Discord 機器人入口：建立連線、註冊 Slash 指令、掛上各處理程式。
 * 實際功能在 src/bot/：
 *   commands.js            指令定義與註冊名單
 *   patrol.js              登入後的定時巡檢與各種推播
 *   dm_handler.js          私訊關鍵字指令
 *   interaction_handler.js Slash 指令與推播按鈕
 *   payloads.js / broadcast.js / subscribers.js / state.js / config.js
 */
'use strict';
const fs = require('fs');
const { Client, Events, GatewayIntentBits, Partials, REST, Routes, ActivityType } = require('discord.js');
const { CLIENT_ID, BOT_TOKEN } = require('./bot/config');
const { commands, REGISTERED_COMMAND_NAMES } = require('./bot/commands');
const { onReady } = require('./bot/patrol');
const { handleMessage } = require('./bot/dm_handler');
const { handleInteraction } = require('./bot/interaction_handler');

if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_DISCORD_BOT_TOKEN_HERE') {
  console.log('================================================================');
  console.log('[DISCORD BOT NOTIFICATION]');
  console.log(`應用 ID: ${CLIENT_ID}`);
  console.log('尚未設定 DISCORD_BOT_TOKEN，機器人未連接至網關。');
  console.log('================================================================');
} else {
  // 單一事件處理漏接的錯誤只記錄，不讓整個機器人結束
  process.on('unhandledRejection', e => console.error('[UNHANDLED REJECTION]', e?.message || e));
  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [
      Partials.Channel,
      Partials.Message
    ],
    presence: {
      status: 'online',
      afk: false,
      activities: [{
        name: '公開來源資料巡檢',
        type: ActivityType.Watching
      }]
    }
  });

  (async () => {
    try {
      console.log('[DISCORD BOT] 正在向 Discord API 註冊全域 Slash 指令 (含主動哨兵與測試指令)...');
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands.filter(command => REGISTERED_COMMAND_NAMES.has(command.name)) }
      );
      console.log('[DISCORD BOT] Slash 指令已成功註冊！');
    } catch (error) {
      console.error('[DISCORD BOT] 註冊指令失敗:', error);
    }
  })();

  client.once(Events.ClientReady, c => onReady(client, c));
  client.on(Events.Error, (err) => console.error('[DISCORD ERROR]', err));
  client.on(Events.ShardDisconnect, (event, id) => console.warn(`[DISCORD] Shard ${id} 斷線:`, event));
  client.on(Events.ShardReconnecting, (id) => console.log(`[DISCORD] Shard ${id} 重新連線中...`));
  client.on(Events.ShardResume, (id) => console.log(`[DISCORD] Shard ${id} 連線已恢復`));
  // 私訊關鍵字指令
  client.on(Events.MessageCreate, message => handleMessage(client, message).catch(e => {
    console.error('[DM HANDLER ERROR]', e.message);
    message.reply('⚠️ 這個指令沒有處理成功，請檢查格式後再試（例如「靜默 23:00 07:00」）。').catch(() => {});
  }));
  // Slash 指令（deferReply 避免 3 秒逾時）
  client.on(Events.InteractionCreate, interaction => handleInteraction(client, interaction));

  // 心跳：連上 Discord 時每分鐘寫一次，看門狗發現太久沒更新（程式卡住或一直連不回去）就重啟
  const heartbeat = require('path').join(__dirname, '../logs/bot_heartbeat.json');
  setInterval(() => {
    if (!client.isReady()) return;
    try { fs.writeFileSync(heartbeat, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, ping: client.ws.ping })); } catch {}
  }, 60_000).unref();

  // 程式更新自動重啟：git 版本變了就正常結束（ExitCode 0），看門狗 5 秒後用新程式重開，不用站主手動重啟
  const repo = require('path').join(__dirname, '..');
  const head = () => { try { return require('child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 10_000 }).trim(); } catch { return null; } };
  const startHead = head();
  if (startHead) setInterval(() => {
    const now = head();
    if (now && now !== startHead) { console.log(`[DISCORD BOT] 程式已更新（${startHead.slice(0, 7)} → ${now.slice(0, 7)}），重新啟動載入新版`); Promise.resolve().then(() => client.destroy()).finally(() => process.exit(0)); }
  }, 5 * 60_000).unref();

  client.login(BOT_TOKEN).catch(err => {
    console.error('[DISCORD BOT] 登入失敗 (請確認 DISCORD_BOT_TOKEN 是否正確或等待網路連線):', err.message);
    process.exit(1);
  });
}
