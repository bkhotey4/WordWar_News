'use strict';
// 登入後啟動的定時巡檢：資料更新、預警、草稿、快訊、週報、來源健康、更正與衛星到達通知
const {
  ActivityType
} = require('discord.js');

const { fetchLiveIntelligence } = require('../fetcher');
const { deliverResearchReports } = require('../research_dispatch');
const { getTaiwanFeed } = require('../taiwan_intel');
const { getNotamFeedAsync } = require('../notam_monitor');
const { evaluateThreats, saveAlertRecord } = require('../sentry');
// New modules (Open Teacher code review additions)
const { shouldDeliverToUser, markEventDelivered } = require('../subscription_manager');
const { dispatchPendingCorrections } = require('../correction_dispatcher');
const { checkNewArrivals } = require('../satellite_assets');
const state = require('./state');
const { COMMANDER_USER_ID } = require('./config');
const { getSubscribers } = require('./subscribers');
const { getLiveIntelData } = require('./payloads');
const { broadcastEmergencyAlert } = require('./broadcast');

function onReady(client, c) {
  console.log(`[DISCORD BOT] 成功登入！目前登入身分: ${c.user.tag}`);
  c.user.setStatus('online');
  c.user.setPresence({
    status: 'online',
    afk: false,
    activities: [{
      name: '公開來源資料巡檢',
      type: ActivityType.Watching
    }]
  });
  console.log('[DISCORD BOT] 狀態燈號已強制刷新為: 綠色在線 (online)');

  // 雲端主控（.env 的 CLOUD_PRIMARY=1）：巡檢、推播與網站更新都由 GitHub Actions 執行，本機只回應斜線指令，
  // 並定時從私人狀態倉庫同步最新資料（本機排程寫的研究稿也會順便上傳）
  if (process.env.CLOUD_PRIMARY === '1') { startCloudSync(); return; }

  // Only refresh collectors whose output has provenance checks.
  fetchLiveIntelligence()
    .catch(err => console.error('[INIT REFRESH ERROR]', err));

  // Automated High-Frequency Sentry Patrol Scheduler (Every 3 minutes)
  // 一輪巡檢可能超過 3 分鐘（多個來源依序抓取）；上一輪還沒結束就跳過，避免同一則推播送兩次
  let patrolBusy = false;
  setInterval(async () => {
    if (patrolBusy) { console.log('[SENTRY PATROL] 上一輪巡檢尚未結束，本輪略過'); return; }
    patrolBusy = true;
    try { await patrolOnce(client); } catch (e) { console.error('[SENTRY PATROL ERROR]', e.message); } finally { patrolBusy = false; }
  }, 3 * 60 * 1000);

  // Send newly reviewed reports; durable per-report receipts suppress repeats and empty updates.
  setInterval(() => deliverReportsOnce(client), 60 * 1000); // Check clock every minute
}

// 巡檢一輪：本機每 3 分鐘、雲端（scripts/cloud_patrol.js）每 15 分鐘各呼叫一次。
// publish 預設交給網站排程在子行程背景執行；雲端傳入會等待完成的版本
async function patrolOnce(client, { publish = () => require('../public_site_scheduler').maybePublish() } = {}) {
    try {
      state.lastPatrolTime = new Date().toISOString();
      console.log('[SENTRY PATROL] 執行 24/7 哨兵高頻情報巡邏與異常指標偵測 (3分鐘週期)...');
      await fetchLiveIntelligence();
      const liveData = getLiveIntelData();
      liveData.taiwanIntel = getTaiwanFeed();
      liveData.notamFeed = await getNotamFeedAsync();
      try { liveData.usgsSeismic = await require('../collectors/usgs_seismic').fetchUsgsSeismic(); } catch (_) {}
      const threat = evaluateThreats(liveData);
      if (threat) {
        if (threat.code === 'NEWS_HEADLINE_REVIEW' || threat.isVerified === false || threat.quarantined) {
          console.log(`[SENTRY QUARANTINE] 未核實或轉載來源已自動隔離，不推播雜訊通知: ${threat.title} (評級: ${threat.admiraltyGrade || 'E4'})`);
          const { additionalReviews = [], ...first } = threat;
          for (const r of [first, ...additionalReviews]) saveAlertRecord({ ...r, delivered: 0, quarantined: true });
        } else {
          console.log('[SENTRY THREAT TRIGGERED]', threat.title, `[${threat.level}]`);
          await broadcastEmergencyAlert(client, threat);
        }
      }

      // 戰區預警看板：等級變化即時推播、每日 08:00 後推一次摘要（試行中）
      try {
        const { dispatchWarningPushes } = require('../warning_board');
        // 推播只送短訊息＋網站連結（地圖與海報都在網站上，2026-10-27 起不再附圖）
        const warnResults = await dispatchWarningPushes(client, getSubscribers(), { shouldDeliver: shouldDeliverToUser, markDelivered: markEventDelivered });
        { const shown = warnResults.filter(r => r.status !== 'DEFERRED'); if (shown.length) console.log('[WARNING PUSH]', shown.map(r => `${r.eventId}:${r.status}`).join(', ')); }
      } catch (warnErr) {
        console.error('[WARNING PUSH ERROR]', warnErr.message);
      }

      // 排程研究任務寫好的報導稿：自動發布並以圖卡推播
      try {
        const drafts = await require('../draft_queue').processPendingDrafts(client, getSubscribers());
        if (drafts.length) console.log('[DRAFT QUEUE]', JSON.stringify(drafts.map(d => ({ id: d.id, status: d.status, error: d.error, delivery: d.delivery }))));
      } catch (draftErr) {
        console.error('[DRAFT QUEUE ERROR]', draftErr.message);
      }

      // 共軍聯合戰備警巡／具名演習快訊（媒體交叉比對確認後）
      try {
        const plaResults = await require('../collectors/pla_joint').dispatchPlaAlerts(client, getSubscribers(), { shouldDeliver: shouldDeliverToUser, markDelivered: markEventDelivered });
        if (plaResults.length) console.log('[PLA ALERT]', plaResults.map(r => `${r.eventId}:${r.status}`).join(', '));
      } catch (plaErr) {
        console.error('[PLA ALERT ERROR]', plaErr.message);
      }

      // 台灣生活面：海纜中斷、斷網、大規模停電
      try {
        const infraResults = await require('../collectors/taiwan_infra').dispatchInfraAlerts(client, getSubscribers(), { shouldDeliver: shouldDeliverToUser, markDelivered: markEventDelivered });
        if (infraResults.length) console.log('[INFRA ALERT]', infraResults.map(r => `${r.eventId}:${r.status}`).join(', '));
      } catch (infraErr) {
        console.error('[INFRA ALERT ERROR]', infraErr.message);
      }

      // 公開情報網頁（GitHub Pages）：每天台北 08:40、20:40 後各更新一次；在子行程執行，不卡住巡檢
      try { await publish(); } catch (siteErr) { console.error('[PUBLIC SITE ERROR]', siteErr.message); }

      // 每週戰況週報：週日 20:00 後送一次
      try {
        const wk = await require('../weekly').dispatchWeekly(client, getSubscribers(), { shouldDeliver: shouldDeliverToUser, markDelivered: markEventDelivered });
        if (wk.length) console.log('[WEEKLY]', wk.map(r => `${r.userId}:${r.status}`).join(', '));
      } catch (wkErr) {
        console.error('[WEEKLY ERROR]', wkErr.message);
      }

      // 每日一句話摘要：台北 08:00 後送一次
      try {
        const db = await require('../daily_brief').dispatchDailyBrief(client, getSubscribers(), { shouldDeliver: shouldDeliverToUser, markDelivered: markEventDelivered });
        if (db.length) console.log('[DAILY BRIEF]', db.map(r => `${r.userId}:${r.status}`).join(', '));
      } catch (dbErr) {
        console.error('[DAILY BRIEF ERROR]', dbErr.message);
      }

      // 每月戰況月報：每月 1 日台北 09:00 後送一次
      try {
        const mo = await require('../monthly').dispatchMonthly(client, getSubscribers(), { shouldDeliver: shouldDeliverToUser, markDelivered: markEventDelivered });
        if (mo.length) console.log('[MONTHLY]', mo.map(r => `${r.userId}:${r.status}`).join(', '));
      } catch (moErr) {
        console.error('[MONTHLY ERROR]', moErr.message);
      }

      // 準備提醒：台海預警升到第 2 級以上時提醒檢查／補齊物資；第 4 級不受靜默時段限制
      try {
        const prepResults = await require('../preparedness').dispatchPreparePushes(client, getSubscribers(), { shouldDeliver: shouldDeliverToUser, markDelivered: markEventDelivered });
        if (prepResults.length) console.log('[PREPARE PUSH]', prepResults.map(r => `${r.eventId}:${r.status}`).join(', '));
      } catch (prepErr) {
        console.error('[PREPARE PUSH ERROR]', prepErr.message);
      }

      // 資料來源故障通知：任一來源超過時限未更新就私訊管理者，恢復時再通知
      try {
        const srcAlert = await require('../source_health').dispatchSourceAlerts(client, COMMANDER_USER_ID);
        if (srcAlert.down.length || srcAlert.recovered.length || srcAlert.still?.length) console.log('[SOURCE ALERT]', JSON.stringify(srcAlert));
        const month = await require('../accuracy_review').dispatchMonthlyReview(client, COMMANDER_USER_ID);
        if (month) console.log('[ACCURACY REVIEW] 已發送', month);
      } catch (srcErr) {
        console.error('[SOURCE ALERT ERROR]', srcErr.message);
      }

      // Open Teacher Item 1: Dispatch any official notice corrections/withdrawals to subscribers
      try {
        await dispatchPendingCorrections(client, getSubscribers());
      } catch (corrErr) {
        console.error('[CORRECTION DISPATCH PATROL ERROR]', corrErr.message);
      }

      // 新衛星產品到達只記錄、在網站列出，不私訊：產品到達不等於看到變化（2026-10-27 起）
      try {
        const arrivals = checkNewArrivals();
        if (arrivals.length) console.log(`[SATELLITE ARRIVAL] 新影像產品 ${arrivals.length} 筆（只記錄，不推播）：${arrivals.map(a => a.asset.productId).join(', ')}`);
      } catch (satErr) {
        console.error('[SATELLITE ARRIVAL PATROL ERROR]', satErr.message);
      }
    } catch (patrolErr) {
      console.error('[SENTRY PATROL ERROR]', patrolErr.message);
    }
}

async function deliverReportsOnce(client) {
  try {
    await deliverResearchReports(client,{recipientIds:getSubscribers().map(sub=>sub.userId)});
  } catch (schedErr) {
    console.error('[DAILY SCHEDULER ERROR]', schedErr.message);
  }
}

// 雲端主控時的本機同步：每 10 分鐘在子行程執行 scripts/cloud_state.js sync --role local（不卡住指令回應）
function startCloudSync() {
  const { execFile } = require('child_process');
  const path = require('path');
  let busy = false;
  const syncOnce = () => {
    if (busy) return;
    busy = true;
    execFile(process.execPath, [path.join(__dirname, '../../scripts/cloud_state.js'), 'sync', '--role', 'local'], { cwd: path.join(__dirname, '../..'), timeout: 5 * 60_000, windowsHide: true, maxBuffer: 2_000_000 }, (err, stdout, stderr) => {
      busy = false;
      const last = t => String(t).trim().split(/\r?\n/).pop();
      console.log(err ? `[CLOUD SYNC] 失敗：${last(stderr || err.message)}` : `[CLOUD SYNC] ${last(stdout)}`);
    });
  };
  console.log('[CLOUD SYNC] 雲端主控模式：本機不巡檢、不推播，每 10 分鐘同步雲端資料');
  syncOnce();
  setInterval(syncOnce, 10 * 60_000);
}

module.exports = { onReady, patrolOnce, deliverReportsOnce };
