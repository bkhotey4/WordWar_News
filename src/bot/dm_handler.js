'use strict';
// 私訊關鍵字指令（訂閱、預警、戰場圖、海報、準備清單等）
const {
  ChannelType,
} = require('discord.js');

const { fetchLiveIntelligence } = require('../fetcher');
const { taiwanDiscordPayload, eventsDiscordPayload } = require('../taiwan_intel');
const { satelliteDiscordPayload } = require('../satellite_assets');
const { fetchFirmsData, firmsDiscordPayload } = require('../firms_monitor');
const { notamDiscordPayload } = require('../notam_monitor');
const { formatVerifiedSitrep, evaluateIntelligenceReliability } = require('../verification_engine');
// New modules (Open Teacher code review additions)
const { getRecentEvidenceEvents } = require('../evidence_ledger');
const { formatUserPrefs, parseSubscriptionCommand, setTheaterSubscriptions, setQuietHours } = require('../subscription_manager');
const { getQualitySummary } = require('../satellite_quality');
const { formatBacktestPayload } = require('../alert_backtester');
const { saveSubscriber, removeSubscriber } = require('./subscribers');
const { getLiveIntelData, refreshSummary, safeOutgoingPayload, createVerifiedBriefingPayload, createLimitationsPayload, createHelpPayload, createSentryStatusPayload, createImintPayload, createAutonomousAirspacePayload, createSkyScanPayload } = require('./payloads');

async function handleMessage(client, message) {
  if (message.author.bot) return;

  if (message.channel.type === ChannelType.DM) {
    const msgText = message.content.trim().toLowerCase();
    console.log(`[DISCORD BOT DM] 收到來自 ${message.author.tag} 的訊息: "${message.content}"`);

    // Explicit Subscription Management in DM
    if (msgText === '訂閱' || msgText === 'subscribe') {
      const added = saveSubscriber(message.author.id, message.author.tag);
      const replyText = added
        ? '✅ 已完成官方來源即時通知訂閱與摘要。可輸入 `/dm-briefing` 查看最新情報戳記與來源摘要；隨時輸入「取消訂閱」退訂。'
        : 'ℹ️ 您已在訂閱名單中，可輸入「空情」查詢最新官方來源摘要。';
      await message.reply(replyText);
      return;
    }

    if (msgText === '取消訂閱' || msgText === '退訂' || msgText === 'unsubscribe') {
      const removed = removeSubscriber(message.author.id);
      const replyText = removed
        ? '🛑 **已為您取消即時通知**。系統將停止主動向您推送警報與情報；\n若日後想重新訂閱，隨時輸入「訂閱」或使用 `/dm-subscribe` 指令即可。'
        : 'ℹ️ 您的帳號目前並未在訂閱名單中。';
      await message.reply(replyText);
      return;
    }

    // Sentry Test Alert Trigger (Strictly isolated to current sender - NO MASS BROADCAST)
    if (msgText.includes('測試警報') || msgText.includes('test alert') || msgText.includes('模擬警報')) {
      await message.reply('🧪【測試警報】通知管道運作正常。這是測試，不代表任何實體事件或警報級別。');
      return;
    }

    // Sentry Status Trigger
    if (msgText.includes('哨兵') || msgText.includes('sentry')) {
      const payload = createSentryStatusPayload();
      await message.reply({ content: payload.content, files: payload.files });
      return;
    }

    // On-demand Refresh Trigger
    if (msgText.includes('重新整理') || msgText.includes('更新') || msgText.includes('重整') || msgText === 'r' || msgText.includes('refresh')) {
      await message.reply('🔄 正在重新檢查已接通的資料來源...');
      await fetchLiveIntelligence();
      await message.reply(refreshSummary(getLiveIntelData()));
      return;
    }

    // Subscription command parsing (e.g., 訂閱戰區 台海, 靜默 23:00 07:00, 取消靜默, 訂閱設定)
    const subCmd = parseSubscriptionCommand(msgText);
    if (subCmd) {
      if (subCmd.action === 'SET_THEATER') {
        const subs = subCmd.theaters || [subCmd.theater];
        setTheaterSubscriptions(message.author.id, subs);
        const { THEATER_LABELS } = require('../subscription_manager');
        await message.reply(`✅ 已更新您的訂閱戰區為：${subs.map(t => THEATER_LABELS[t] || t).join('、')}\n輸入「訂閱設定」隨時查看。台海準備提醒與每日摘要不受戰區篩選影響。`);
        return;
      } else if (subCmd.action === 'SET_QUIET') {
        setQuietHours(message.author.id, subCmd.start, subCmd.end);
        await message.reply(`🌙 已設定靜默時段：\`${subCmd.start}\` 至 \`${subCmd.end}\`（期間暫停一般警報）`);
        return;
      } else if (subCmd.action === 'CLEAR_QUIET') {
        setQuietHours(message.author.id, null, null);
        await message.reply('🔔 已關閉靜默時段，恢復全天候接收通知。');
        return;
      } else if (subCmd.action === 'SHOW_PREFS') {
        await message.reply(formatUserPrefs(message.author.id));
        return;
      }
    }

    // Only these source-backed DM topics are reachable.
    const sourceData = getLiveIntelData();
    let sourcePayload;
    if (/(來源狀態|資料來源|source-health)/.test(msgText)) {
      await message.reply({ content: require('../source_health').sourceStatusText(), allowedMentions: { parse: [] } });
      return;
    }
    if (/(海報|poster)/.test(msgText)) {
      try {
        const bm = require('../battle_map');
        const theater = /(台海|臺海|台灣|美伊|伊朗|荷莫茲|波蘭|北約|以巴|加薩|黎巴嫩|紅海|蘇丹|緬甸|南海|烏|俄)/.test(msgText) ? bm.theaterFromText(msgText) : null;
        const p = await require('../poster').posterDiscordPayload(theater);
        await message.reply({ content: p.content, files: p.files, allowedMentions: { parse: [] } });
      } catch (posterErr) { await message.reply(`海報暫時無法產生：${posterErr.message}`); }
      return;
    }
    if (/(戰場圖|戰況圖|地圖|battle-map)/.test(msgText)) {
      try {
        const bm = require('../battle_map');
        const p = await bm.battleMapDiscordPayload(bm.theaterFromText(msgText));
        await message.reply({ content: p.content, files: p.files, allowedMentions: { parse: [] } });
      } catch (mapErr) { await message.reply(`戰場圖暫時無法產生：${mapErr.message}`); }
      return;
    }
    if (/(週報|weekly)/.test(msgText)) {
      try { const p = await require('../weekly').weeklyDiscordPayload(); await message.reply({ content: p.content, files: p.files, allowedMentions: { parse: [] } }); }
      catch (wkErr) { await message.reply(`週報暫時無法產生：${wkErr.message}`); }
      return;
    }
    if (/(準備清單|要買什麼|要買甚麼|買什麼|囤貨|儲備清單|避難包|^prepare)/.test(msgText)) {
      const p = require('../preparedness');
      const payload = p.prepareDiscordPayload(p.parsePrepareText(msgText));
      await message.reply({ content: payload.content, allowedMentions: { parse: [] } });
      for (const part of payload.extra) await message.channel.send({ content: part, allowedMentions: { parse: [] } });
      return;
    }
    if (/(^預警$|預警看板|警戒等級|^warning$)/.test(msgText)) {
      const p = require('../warning_board').warningDiscordPayload();
      await message.reply({ content: p.content, allowedMentions: { parse: [] } });
      return;
    }
    if (/(全球戰況|全球簡報|全球情勢|global-brief|global)/.test(msgText)) {
      const report = require('../research_reports').getResearchFeed().reports.find(r => r.coverage?.length);
      sourcePayload = report
        ? await require('../report_card').researchCardPayload(report.id)
        : { sourceBacked: true, content: '目前沒有通過來源查核的全球簡報。全球頁面可查看各區既有報導與來源影像；無資料不代表沒有衝突。', embeds: [], files: [], allowedMentions: { parse: [] } };
      if (report && sourcePayload.embeds && sourcePayload.embeds.length) {
        const claims = require('../news_context').getNewsContext().slice(0, 3);
        if (claims.length) {
          sourcePayload.embeds[0].fields = sourcePayload.embeds[0].fields || [];
          sourcePayload.embeds[0].fields.push({
            name: '國際報導提及的行動方（非影像識別）',
            value: claims.map(c => `${c.parties.join('／')}：${c.summary.slice(0, 85)} [來源](${c.references[0].url})`).join('\n').slice(0, 1024)
          });
        }
      }
    } else if (/(台海趨勢|taiwan-trend)/.test(msgText)) {
      sourcePayload = taiwanDiscordPayload('trend');
    } else if (/(台海動態|台海官方|taiwan-status|台海|敵情|共機|共艦|國防部|擾台)/.test(msgText)) {
      sourcePayload = taiwanDiscordPayload();
    } else if (/(更正紀錄|corrections)/.test(msgText)) {
      sourcePayload = eventsDiscordPayload(true);
    } else if (/(事件紀錄|events)/.test(msgText)) {
      sourcePayload = eventsDiscordPayload();
    } else if (/(預警依據|alert-explain)/.test(msgText)) {
      sourcePayload = taiwanDiscordPayload('alert');
    } else if (/(衛星照片|衛星比較|satellite-compare)/.test(msgText)) {
      sourcePayload = satelliteDiscordPayload('longtian',/(比較|compare)/.test(msgText));
    } else if (/(火點|熱異常|熱點|firms)/.test(msgText)) {
      sourcePayload = firmsDiscordPayload(await fetchFirmsData());
    } else if (/(禁航|禁航區|notam|演習通告|射擊通報)/.test(msgText)) {
      sourcePayload = notamDiscordPayload();
    } else if (/(戰況報導|war-report)/.test(msgText)) {
      sourcePayload = await require('../report_card').researchCardPayload();
    } else if (/(證據|證據頁|evidence)/.test(msgText)) {
      const events = getRecentEvidenceEvents('all', 5);
      if (!events.length) {
        sourcePayload = { sourceBacked: true, content: '📋 **【事件證據頁】**\n目前尚無記錄的事件。研究員可透過 `src/evidence_ledger.js` 建立已核實事件記錄。', files: [], embeds: [] };
      } else {
        const lines = ['# 📋 【近期事件證據頁清單】'];
        events.forEach((e, idx) => {
          lines.push(`**[${idx+1}]** \`${e.eventId}\` — ${e.title} (${e.theater}, 來源數: ${e.sources.length})`);
        });
        lines.push('\n可使用 `/evidence event_id:<編號>` 查看完整證據與矛盾比對。');
        sourcePayload = { sourceBacked: true, content: lines.join('\n'), files: [], embeds: [] };
      }
    } else if (/(回測|預警回測|backtest)/.test(msgText)) {
      sourcePayload = formatBacktestPayload();
    } else if (/(雲遮|衛星品質|cloud)/.test(msgText)) {
      const qs = getQualitySummary();
      sourcePayload = {
        sourceBacked: true,
        content: `🛰️ **【衛星影像可判讀品質報告】**\n• 總影像數: ${qs.total} 張\n• 🟢 可判讀: ${qs.readable} 張 (${qs.readablePercent}%)\n• 🔴 嚴重雲遮不可判讀: ${qs.unreadable} 張\n• ❓ 未標注: ${qs.unknown} 張\n\n可輸入「衛星照片」查看個別影像品質標示。`,
        files: [], embeds: []
      };
    } else if (/(驗證|查證|核實|verify|俄羅斯空襲|空襲|斷網|斷電|資料中心)/.test(msgText)) {
      const live = getLiveIntelData();
      const evalResult = evaluateIntelligenceReliability(
        { title: message.content, source: '指揮官指令指定查證', link: 'https://news.google.com/' },
        live,
        live.latestBreakingNews || []
      );
      sourcePayload = {
        sourceBacked: true,
        content: formatVerifiedSitrep(evalResult),
        files: [],
        embeds: []
      };
    } else if (/(help|目錄|功能|指令|選單)/.test(msgText) || msgText === '?') {
      sourcePayload = createHelpPayload();
    } else if (/(限制|須知|誠信|limitations)/.test(msgText)) {
      sourcePayload = createLimitationsPayload();
    } else if (/(在空機|sky-scan|opensky|空域掃描)/.test(msgText)) {
      sourcePayload = createSkyScanPayload(sourceData);
    } else if (/(衛星|偵照|imint|satellite|仙賓礁|龍田)/.test(msgText)) {
      sourcePayload = createImintPayload(sourceData);
    } else if (/(空情|空域|osint|自主情報|國防部|airspace)/.test(msgText)) {
      sourcePayload = createAutonomousAirspacePayload(sourceData);
    } else if (/(晨報|早報|晚報|夜報|morning|evening|戰報|briefing)/.test(msgText)) {
      sourcePayload = await createVerifiedBriefingPayload(sourceData);
    } else {
      sourcePayload = safeOutgoingPayload(null);
    }
    await message.reply({ content: sourcePayload.content, files: sourcePayload.files || [], embeds: sourcePayload.embeds || [], components: sourcePayload.components || [], allowedMentions: { parse: [] } });
    for (const part of sourcePayload.extra || []) await message.channel.send({ content: part, allowedMentions: { parse: [] } });
    return;
  }
}

module.exports = { handleMessage };
