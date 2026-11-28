'use strict';
// 人工核實（審查文件第 4 階段）：每週從事件時間軸挑出多家媒體確認的事件，逐件私訊管理者，
// 由管理者按表情回應 ✅ 是／❌ 否／❓ 不確定。只有管理者本人按的才算；雲端巡檢沒有常駐連線，所以讀表情回應而不用按鈕。
// 核實為「是」的事件拿來回測預警燈號；樣本不足 MIN_SAMPLE 件前只顯示進度，不顯示命中率。
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../research/human_verification.json');
const HOUR = 3600_000, DAY = 24 * HOUR, TZ = 8 * HOUR;
const BATCH_SIZE = 12;
const MIN_SAMPLE = 30;          // 核實為「是」且燈號資料涵蓋的事件達此數，才公布命中率
const BATCH_EVERY = 7 * DAY;
const POLL_EVERY = HOUR;
const EXPIRE_AFTER = 30 * DAY;  // 超過 30 天沒回應就不再查
const EMOJI = { '✅': 'YES', '❌': 'NO', '❓': 'UNSURE' };
// 不拿來核實的類型：報導本身、燈號變化（是被檢驗的對象）、降溫訊號
const SKIP_KINDS = new Set(['REPORT', 'LEVEL_UP', 'LEVEL_DOWN', 'DEESC']);
// 新聞摘要、每日頭條這類一篇講好幾件事的標題，無法判斷是哪一件，不拿來核實
const DIGEST_RE = /in brief|headlines|news roundup|live updates|morning briefing|evening briefing|s[|｜]s.*s[|｜]s|新聞懶人包|重點新聞|早安世界|晚間新聞/i;

const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
function writeJson(f, data) { const tmp = `${f}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, f); }
const load = (file = FILE) => { const s = readJson(file, {}); return { batches: s.batches || [], items: s.items || [], lastPoll: s.lastPoll || null }; };
const keyOf = e => `${e.kind}|${e.theater}|${e.title}`;
const taipeiDate = ms => new Date(ms + TZ).toISOString().slice(0, 10);
const taipeiHour = ms => new Date(ms + TZ).getUTCHours();

// 近 7 天的候選事件：輪流從各戰區挑，報導家數多的優先，已核實過的不重複
function pickCandidates(events, state, { now = Date.now(), n = BATCH_SIZE } = {}) {
  const done = new Set(state.items.map(i => i.key));
  const pool = events.filter(e => !SKIP_KINDS.has(e.kind) && !DIGEST_RE.test(e.title || '') && e.href && /^https:\/\//.test(e.href)
    && now - Date.parse(e.at) <= 7 * DAY && Date.parse(e.at) <= now && !done.has(keyOf(e)));
  const byTheater = new Map();
  for (const e of pool.sort((a, b) => (b.pubs || 0) - (a.pubs || 0) || Date.parse(b.at) - Date.parse(a.at)))
    (byTheater.get(e.theater) || byTheater.set(e.theater, []).get(e.theater)).push(e);
  const out = [], queues = [...byTheater.values()];
  while (out.length < n && queues.some(q => q.length)) for (const q of queues) if (q.length && out.length < n) out.push(q.shift());
  return out;
}

const batchDue = (state, now) => {
  const last = Math.max(0, ...state.batches.map(b => Date.parse(b.createdAt) || 0));
  const h = taipeiHour(now);
  return now - last >= BATCH_EVERY && h >= 10 && h < 21; // 只在台北 10:00–21:00 發
};

function itemText(e, names, idx, total) {
  return [`**人工核實 ${idx}/${total}**｜${names[e.theater] || e.theater}`,
    `${e.title}`,
    `首則報導 ${taipeiDate(Date.parse(e.at))}${e.pubs ? `｜${e.pubs} 家媒體` : ''}`,
    `<${e.href}>`,
    '這件事是否確實發生，且屬於這個戰區值得預警的升溫事件？請按表情：✅ 是　❌ 否　❓ 不確定'].join('\n').slice(0, 1900);
}

// 每輪巡檢呼叫：到期就發一批，平時每小時讀一次回應
async function dispatchVerification(client, adminId, { events, names = {}, file = FILE, now = Date.now() } = {}) {
  if (!adminId) return { sent: 0, recorded: 0 };
  let state = load(file);
  let sent = 0, recorded = 0;
  if (batchDue(state, now)) {
    const list = pickCandidates(events || [], state, { now });
    if (list.length) {
      const user = await client.users.fetch(adminId);
      const batchId = `b${taipeiDate(now)}`;
      await user.send({ content: `🧾 本週人工核實：${list.length} 件。每件按 ✅ 是／❌ 否／❓ 不確定；30 天內有效。累積 ${MIN_SAMPLE} 件「是」之後，準確度頁才會公布燈號命中率。`, allowedMentions: { parse: [] } });
      for (const [i, e] of list.entries()) {
        try {
          const msg = await user.send({ content: itemText(e, names, i + 1, list.length), allowedMentions: { parse: [] } });
          for (const em of Object.keys(EMOJI)) await msg.react(em).catch(() => {});
          // 送出成功才記錄；送失敗的下一批還會再挑到
          state.items.push({ key: keyOf(e), batch: batchId, theater: e.theater, kind: e.kind, title: e.title, url: e.href, at: e.at, pubs: e.pubs || null,
            channelId: msg.channelId, messageId: msg.id, sentAt: new Date(now).toISOString(), status: 'PENDING' });
          sent++;
        } catch (err) { console.error('[VERIFY SEND]', err.message); }
      }
      if (sent) { state.batches.push({ id: batchId, createdAt: new Date(now).toISOString(), size: sent }); writeJson(file, state); }
    }
  }
  if (!state.lastPoll || now - Date.parse(state.lastPoll) >= POLL_EVERY) {
    state = load(file);
    recorded = await pollReactions(client, adminId, state, now);
    state.lastPoll = new Date(now).toISOString();
    writeJson(file, state);
  }
  return { sent, recorded };
}

async function pollReactions(client, adminId, state, now) {
  const { Routes } = require('discord.js');
  let n = 0;
  for (const it of state.items) {
    if (it.status !== 'PENDING') continue;
    if (now - Date.parse(it.sentAt) > EXPIRE_AFTER) { it.status = 'EXPIRED'; continue; }
    const picked = [];
    for (const [em, val] of Object.entries(EMOJI)) {
      try {
        const users = await client.rest.get(Routes.channelMessageReaction(it.channelId, it.messageId, encodeURIComponent(em)), { query: new URLSearchParams({ limit: '100' }) });
        if ((users || []).some(u => u.id === String(adminId))) picked.push(val);
      } catch (err) { if (!/Unknown (Message|Emoji)/.test(err.message)) throw err; }
    }
    // 只按一個才算；按了兩個以上視為還沒決定
    if (picked.length === 1) { it.status = picked[0]; it.reviewedAt = new Date(now).toISOString(); it.reviewer = 'HUMAN'; n++; }
  }
  return n;
}

// 核實為「是」的事件，轉成回測用的參考事件格式
function verifiedEvents(state = load()) {
  return state.items.filter(i => i.status === 'YES').map(i => {
    const d = taipeiDate(Date.parse(i.at));
    return { id: `hv-${i.messageId}`, theater: i.theater, name: i.title, start: d, end: d, sources: [{ url: i.url, publisher: '人工核實樣本' }] };
  });
}

function humanBacktest({ now = Date.now(), state = load(), indicators = null } = {}) {
  const BT = require('./warning_backtest');
  const events = verifiedEvents(state);
  const count = s => state.items.filter(i => i.status === s).length;
  const progress = { yes: count('YES'), no: count('NO'), unsure: count('UNSURE'), pending: count('PENDING'), expired: count('EXPIRED'), minSample: MIN_SAMPLE };
  const results = (indicators || BT.boardIndicators()).map(ind => BT.backtestIndicator(ind, events, now));
  const covered = results.reduce((a, r) => a + r.eventsCovered, 0);
  return { generatedAt: new Date(now).toISOString(), progress, coveredEvents: covered, enough: covered >= MIN_SAMPLE,
    indicators: covered >= MIN_SAMPLE ? results : [],
    limitations: '樣本來自 2 家以上媒體報導的事件，由管理者一人判斷是否屬於值得預警的升溫事件；只能看出燈號有沒有跟上這些事件，未經報導的事件無從檢驗。' };
}

module.exports = {
  DIGEST_RE, FILE, MIN_SAMPLE, EMOJI, pickCandidates, batchDue, dispatchVerification, pollReactions, verifiedEvents, humanBacktest, load };
