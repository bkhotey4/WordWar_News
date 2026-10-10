'use strict';
// Slash 指令與推播按鈕處理

const { fetchLiveIntelligence } = require('../fetcher');
const { taiwanDiscordPayload } = require('../taiwan_intel');
const { satelliteDiscordPayload } = require('../satellite_assets');
const { fetchFirmsData, firmsDiscordPayload } = require('../firms_monitor');
const { notamDiscordPayload } = require('../notam_monitor');
const { formatVerifiedSitrep, evaluateIntelligenceReliability } = require('../verification_engine');
// New modules (Open Teacher code review additions)
const { formatEvidencePayload, getRecentEvidenceEvents } = require('../evidence_ledger');
const { formatUserPrefs } = require('../subscription_manager');
const state = require('./state');
const { COMMANDER_USER_ID } = require('./config');
const { saveSubscriber, removeSubscriber } = require('./subscribers');
const { getLiveIntelData, refreshSummary, safeOutgoingPayload, createLimitationsPayload, createHelpPayload, createSentryStatusPayload, createImintPayload, createNewspaperDispatchPayload, createAutonomousAirspacePayload, createSkyScanPayload } = require('./payloads');
const { broadcastDailyBriefing } = require('./broadcast');
const { INTEL_COMMAND_NAMES } = require('./commands');

async function handleInteraction(client, interaction) {
  // 推播下方快捷按鈕（看戰場圖、預警看板、準備清單、靜音）
  if (interaction.isButton()) {
    try { await require('../push_buttons').handleButton(interaction); } catch (btnErr) { console.error('[BUTTON ERROR]', btnErr.message); }
    return;
  }
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    if (commandName === 'dm-subscribe') {
      const added = saveSubscriber(interaction.user.id, interaction.user.tag);
      const msg = added
        ? '✅ 已完成官方來源即時通知訂閱與摘要。可使用 `/dm-briefing` 查看最新情報戳記與來源摘要。'
        : 'ℹ️ 您已經在訂閱名單中了！可輸入 `/dm-briefing` 查看最新情報。';
      await interaction.reply({ content: msg, ephemeral: true });
      return;
    }

    if (commandName === 'dm-unsubscribe') {
      const removed = removeSubscriber(interaction.user.id);
      const msg = removed
        ? '🛑 已為您取消即時通知訂閱。'
        : 'ℹ️ 您的帳號目前尚未訂閱私訊推播。';
      await interaction.reply({ content: msg, ephemeral: true });
      return;
    }

    // Defer all data commands to prevent 3-second Discord timeouts
    await interaction.deferReply();
    if (INTEL_COMMAND_NAMES.includes(commandName)) {
      let payload;
      if(commandName==='analysis-health') {
        const health=require('../intel_store').getStore().analysisHealth();
        payload={content:require('../research_health').researchHealthText(undefined,health.pendingOriginalDocuments),files:[],embeds:[],allowedMentions:{parse:[]}};
      }
      else if(commandName==='poster'){try{payload=await require('../poster').posterDiscordPayload(interaction.options.getString('theater')||null);}catch(posterErr){payload={content:`海報暫時無法產生：${posterErr.message}`,files:[],embeds:[]};}}
      else if(commandName==='battle-map'){try{payload=await require('../battle_map').battleMapDiscordPayload(interaction.options.getString('theater'),{sector:interaction.options.getString('sector')||undefined});}catch(mapErr){payload={content:`戰場圖暫時無法產生：${mapErr.message}`,files:[],embeds:[]};}}
      else if(commandName==='weekly'){try{payload=await require('../weekly').weeklyDiscordPayload(undefined,{pdf:true});}catch(wkErr){payload={content:`週報暫時無法產生：${wkErr.message}`,files:[],embeds:[]};}}
      else if(commandName==='prepare')payload=require('../preparedness').prepareDiscordPayload({people:interaction.options.getInteger('people')||1,days:interaction.options.getInteger('days')||7});
      else if(commandName==='warning')payload=require('../warning_board').warningDiscordPayload(interaction.options.getString('theater')||undefined);
      else if(commandName==='taiwan-status')payload=taiwanDiscordPayload();
      else if(commandName==='taiwan-trend'||commandName==='alert-explain')payload=taiwanDiscordPayload(commandName==='taiwan-trend'?'trend':'alert');
      else if(commandName==='events'||commandName==='corrections')payload=require('../event_timeline').timelineDiscordPayload({correctionsOnly:commandName==='corrections'});
      else if(commandName==='war-report')payload=await require('../report_card').researchCardPayload();
      else if(commandName==='global-brief') {
        const report=require('../research_reports').getResearchFeed().reports.find(r=>r.coverage?.length);
        payload=report?await require('../report_card').researchCardPayload(report.id):{content:'目前沒有通過來源查核的全球簡報。全球頁面可查看各區既有報導與來源影像；無資料不代表沒有衝突。',embeds:[],files:[],allowedMentions:{parse:[]}};
        if(report){const claims=require('../news_context').getNewsContext().slice(0,3);
          if(claims.length)payload.embeds[0].fields.push({name:'國際報導提及的行動方（非影像識別）',value:claims.map(c=>`${c.parties.join('／')}：${c.summary.slice(0,85)} [來源](${c.references[0].url})`).join('\n').slice(0,1024)});
        }
      }
      else if(commandName==='firms') {
        const theater = interaction.options.getString('theater') || 'ukraine_front';
        const feed = await fetchFirmsData(theater);
        payload = firmsDiscordPayload(feed);
      }
      else if(commandName==='evidence') {
        const eventId = interaction.options.getString('event_id');
        if (eventId) {
          payload = formatEvidencePayload(eventId);
        } else {
          const events = getRecentEvidenceEvents('all', 5);
          if (!events.length) {
            payload = { content: '📋 **【事件證據頁】**\n目前尚無記錄的事件。研究員可透過 `src/evidence_ledger.js` 建立已核實事件記錄。', files: [], embeds: [] };
          } else {
            const lines = ['# 📋 【近期事件證據頁清單】'];
            events.forEach((e, idx) => {
              lines.push(`**[${idx+1}]** \`${e.eventId}\` — ${e.title} (${e.theater}, 來源數: ${e.sources.length})`);
            });
            lines.push('\n可使用 `/evidence event_id:<編號>` 查看完整證據與矛盾比對。');
            payload = { content: lines.join('\n'), files: [], embeds: [] };
          }
        }
      }
      else if(commandName==='backtest') {
        payload = { content: require('../warning_backtest').warningBacktestText(), files: [], embeds: [], allowedMentions: { parse: [] } };
      }
      else if(commandName==='preferences') {
        payload = { content: formatUserPrefs(interaction.user.id), files: [], embeds: [] };
      }
      else if(commandName==='notam') {
        payload = notamDiscordPayload();
      }
      else payload=satelliteDiscordPayload(interaction.options.getString('region'),commandName==='satellite-compare');
      await interaction.editReply({content:payload.content,embeds:payload.embeds||[],files:payload.files||[],components:payload.components||[],allowedMentions:{parse:[]}});
      for (const part of payload.extra || []) await interaction.followUp({ content: part, allowedMentions: { parse: [] } });
      return;
    }

    // Sentry Test Alert Slash Command (Strictly isolated to user - NO MASS BROADCAST)
    if (commandName === 'test-alert') {
      await interaction.editReply({ content: '測試警報指令已停用。'});
      return;
    }

    // Sentry Status Slash Command
    if (commandName === 'sentry') {
      const payload = createSentryStatusPayload();
      await interaction.editReply({ content: payload.content, files: payload.files });
      return;
    }

    // Multi-Source Intelligence Verification Slash Command
    if (commandName === 'verify') {
      const text = interaction.options.getString('text');
      const live = getLiveIntelData();
      const evalResult = evaluateIntelligenceReliability(
        { title: text, source: '未知', link: 'https://news.google.com/' },
        live,
        live.latestBreakingNews || []
      );
      await interaction.editReply({
        content: formatVerifiedSitrep(evalResult),
        allowedMentions: { parse: [] }
      });
      return;
    }

    // On-demand refresh via slash command
    if (commandName === 'refresh') {
      await fetchLiveIntelligence();
      const freshData = getLiveIntelData();
      await interaction.editReply({
        content: refreshSummary(freshData)
      });
      return;
    }

    const data = getLiveIntelData();

    const supportedCommands = new Set(['dm-briefing', 'imint', 'airspace', 'osint', 'sky-scan', 'help', 'briefing', 'daily-briefing', 'limitations']);
    if (!supportedCommands.has(commandName)) {
      const paused = safeOutgoingPayload(null);
      await interaction.editReply({ content: paused.content });
      return;
    }

    if (commandName === 'dm-briefing') {
      const payload = await createNewspaperDispatchPayload(data);
      try {
        await interaction.user.send({ content: payload.content, files: payload.files, embeds: payload.embeds || [], allowedMentions: { parse: [] } });
        await interaction.editReply({ content: '📬 已把最新簡報私訊給你。'});
      } catch (dmErr) {
        console.error('[DM ERROR]', dmErr);
        await interaction.editReply({ content: '⚠️ 無法私訊給你：請在伺服器的「隱私設定」開啟「允許來自伺服器成員的私人訊息」後再試一次。'});
      }
      return;
    }

    let payload;

    switch (commandName) {
      case 'imint': {
        const theaterOption = interaction.options.getString('theater') || 'all';
        payload = createImintPayload(data, theaterOption);
        break;
      }
      case 'airspace':
      case 'osint':
        payload = createAutonomousAirspacePayload(data);
        break;
      case 'sky-scan':
        payload = createSkyScanPayload(data);
        break;
      case 'daily-briefing': {
        const briefingTime = interaction.options.getString('time') || 'EVENING';
        const isAdmin = interaction.user.id === COMMANDER_USER_ID || (interaction.memberPermissions && interaction.memberPermissions.has('Administrator'));

        if (!isAdmin) {
          // Non-admin: send only to this user's DM to avoid spamming all subscribers
          const payload = await createNewspaperDispatchPayload(data);
          try {
            await interaction.user.send({ content: payload.content, files: payload.files, embeds: payload.embeds || [], allowedMentions: { parse: [] } });
            await interaction.editReply({
              content: `📬 **【戰報已單獨發送至您的私訊】**\n（向全體訂閱者廣播之權限僅限指揮官/管理員，您可輸入「訂閱」在定時推播時自動接收）`
            });
          } catch (dmErr) {
            await interaction.editReply({ content: '⚠️ 無法私訊給你：請在伺服器的「隱私設定」開啟「允許來自伺服器成員的私人訊息」後再試一次。'});
          }
          return;
        }

        // Admin rate-limit check (cooldown: 5 minutes)
        const now = Date.now();
        if (now - state.lastManualBroadcastTimestamp < 5 * 60 * 1000) {
          const waitSec = Math.round((5 * 60 * 1000 - (now - state.lastManualBroadcastTimestamp)) / 1000);
          await interaction.editReply({
            content: `⚠️ **廣播頻率限制保護中**：距離上次手動全體廣播尚在冷卻期，請等待 ${waitSec} 秒後再試。`
          });
          return;
        }

        state.lastManualBroadcastTimestamp = now;
        await broadcastDailyBriefing(client, briefingTime);
        await interaction.editReply({
          content: '公開來源摘要已送至訂閱者；可用各主題指令檢查來源狀態。'
        });
        return;
      }
      case 'limitations':
        payload = createLimitationsPayload();
        break;
      case 'help':
        payload = createHelpPayload();
        break;
      case 'briefing':
      default:
        payload = await createNewspaperDispatchPayload(data);
        break;
    }

    payload = safeOutgoingPayload(payload);
    await interaction.editReply({ content: payload.content, files: payload.files, embeds: payload.embeds || [], allowedMentions: { parse: [] } });
  } catch (err) {
    console.error('[DISCORD BOT] 處理指令出錯:', err);
    // 回覆本身失敗（例如互動已逾時）時不再拋出，避免成為未處理的錯誤
    const reply = { content: '⚠️ 指令處理時發生錯誤，已記錄在日誌；請稍後再試。', ephemeral: true };
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
      else await interaction.reply(reply);
    } catch (replyErr) { console.error('[DISCORD BOT] 錯誤回覆失敗:', replyErr.message); }
  }
}

module.exports = { handleInteraction };
