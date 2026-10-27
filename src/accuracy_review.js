// 燈號準確度每月檢查：每天記下各戰區觸發了哪些指標（research/indicator_daily.json），
// 每月 1 日台北 09:00 後私訊管理者一份報告：各級燈號天數比例、最常觸發（可能太敏感）的指標、從未觸發的指標，以及歷史事件回測的命中與漏報。
// 只是給人判斷的參考，不會自動改門檻。
const fs = require('fs');
const path = require('path');

const DAILY_FILE = path.join(__dirname, '../research/indicator_daily.json');
const HISTORY_FILE = path.join(__dirname, '../research/warning_history.json');
const STATE_FILE = path.join(__dirname, '../research/accuracy_review_state.json');
const HOUR = 3600_000, DAY = 24 * HOUR;
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const writeJson = (f, v) => { const tmp = `${f}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(v, null, 1)); fs.renameSync(tmp, f); };
const tpeDate = ms => new Date(ms + 8 * HOUR).toISOString().slice(0, 10);

// 每次重算看板時呼叫：當天（台北日期）每個戰區曾觸發過的指標取聯集
function recordIndicatorDay(board, { file = DAILY_FILE, now = Date.parse(board?.generatedAt) || Date.now() } = {}) {
  const data = readJson(file, { days: {} });
  const day = tpeDate(now), rec = (data.days[day] ||= {});
  let changed = false;
  for (const t of board.theaters || []) {
    const set = new Set(rec[t.id] || []);
    // 前兆組合成立的那天記成 precursor（回測用，和一般指標一起算命中率）
    for (const id of [...(t.triggered || []).map(i => i.id), ...(t.precursor?.fired ? ['precursor'] : [])]) if (!set.has(id)) { set.add(id); changed = true; }
    if (!rec[t.id]) { rec[t.id] = []; changed = true; }
    rec[t.id] = [...set];
  }
  for (const d of Object.keys(data.days)) if (now - Date.parse(`${d}T00:00:00+08:00`) > 400 * DAY) { delete data.days[d]; changed = true; }
  if (changed) writeJson(file, data);
  return data;
}

function review({ now = Date.now(), days = 30, daily = readJson(DAILY_FILE, { days: {} }), history = readJson(HISTORY_FILE, { snapshots: [] }), board = null, backtest = null } = {}) {
  const WB = require('./warning_board');
  board = board || WB.getWarningBoard(now);
  const from = now - days * DAY;
  const dayKeys = Object.keys(daily.days || {}).filter(d => Date.parse(`${d}T12:00:00+08:00`) >= from && Date.parse(`${d}T00:00:00+08:00`) <= now).sort();
  const theaters = board.theaters.map(t => {
    // 每天的最高等級（依看板紀錄）
    const perDay = {};
    for (const s of history.snapshots || []) {
      const at = Date.parse(s.at);
      if (s.theater !== t.id || at < from || at > now || !Number.isInteger(s.level)) continue;
      const d = tpeDate(at); perDay[d] = Math.max(perDay[d] || 0, s.level);
    }
    const lv = Object.values(perDay), n = lv.length;
    const share = k => n ? lv.filter(x => x >= k).length / n : null;
    const counts = {};
    for (const d of dayKeys) for (const id of daily.days[d][t.id] || []) counts[id] = (counts[id] || 0) + 1;
    const defs = WB.THEATERS[t.id]?.indicators || [];
    const freq = defs.filter(d => d.tier !== 'DEESCALATION').map(d => ({ id: d.id, name: d.name.split(/[（(，]/)[0], tier: d.tier, days: counts[d.id] || 0, share: dayKeys.length ? (counts[d.id] || 0) / dayKeys.length : 0 }));
    return { id: t.id, name: t.name, levelDays: n, atLeast2: share(2), atLeast3: share(3), noisy: freq.filter(f => f.share >= 0.5).sort((a, b) => b.share - a.share), silent: freq.filter(f => f.days === 0 && f.tier !== 'DECISIVE').length, totalIndicators: freq.length };
  });
  let bt = [];
  try { bt = (backtest || require('./warning_backtest').getWarningBacktest(now)).indicators || []; } catch { /* 沒有回測 */ }
  return { generatedAt: new Date(now).toISOString(), days, recordedDays: dayKeys.length, theaters, backtest: bt };
}

const pct = x => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
function reviewText(r) {
  const lines = [`# 📏 燈號準確度月檢（近 ${r.days} 天）`];
  if (r.recordedDays < 7) lines.push(`⚠️ 指標觸發紀錄只有 ${r.recordedDays} 天，下列「最常觸發」僅供參考。`);
  for (const t of r.theaters) {
    const flags = [];
    if (t.atLeast2 !== null && t.atLeast2 >= 0.8) flags.push('第 2 級幾乎天天亮，已失去區辨力：建議提高次要指標門檻，或檢查下方太敏感的指標');
    if (t.atLeast3 !== null && t.atLeast3 >= 0.4) flags.push('第 3 級超過四成天數，可能過度警戒');
    lines.push(`**${t.name}**：≥2 級 ${pct(t.atLeast2)}、≥3 級 ${pct(t.atLeast3)}（${t.levelDays} 天紀錄）`);
    if (t.noisy.length) lines.push(`　最常觸發：${t.noisy.slice(0, 4).map(f => `${f.name}（${pct(f.share)}）`).join('、')}`);
    lines.push(`　近 ${r.days} 天從未觸發：${t.silent}／${t.totalIndicators} 項`);
    for (const f of flags) lines.push(`　→ ${f}`);
  }
  const bt = r.backtest.filter(b => (b.eventsCovered || 0) > 0);
  if (bt.length) {
    lines.push('**歷史事件回測**');
    for (const b of bt.slice(0, 4)) lines.push(`　${b.name || b.id}：參考事件 ${b.eventsCovered} 件，命中 ${b.hits}、漏報 ${b.misses}、誤報每 30 天 ${b.falseAlarmsPer30Days ?? '—'} 次、提前中位數 ${b.medianLeadDays ?? '—'} 天`);
  }
  lines.push('這是給人判斷的參考，不會自動改門檻；要調整請在 Claude Code 說明要改哪一項。');
  return lines.join('\n').slice(0, 1950);
}

// 每月 1 日台北 09:00 後發一次
function monthlyDue(state, now = Date.now()) {
  const t = new Date(now + 8 * HOUR), month = t.toISOString().slice(0, 7);
  if (t.getUTCDate() !== 1 || t.getUTCHours() < 9) return null;
  return state.lastMonth === month ? null : month;
}
async function dispatchMonthlyReview(client, adminId, { file = STATE_FILE, now = Date.now() } = {}) {
  const state = readJson(file, {});
  const month = monthlyDue(state, now);
  if (!month) return null;
  const user = await client.users.fetch(adminId);
  await user.send({ content: reviewText(review({ now })), allowedMentions: { parse: [] } });
  writeJson(file, { ...state, lastMonth: month, sentAt: new Date(now).toISOString() });
  return month;
}

module.exports = { recordIndicatorDay, review, reviewText, monthlyDue, dispatchMonthlyReview, DAILY_FILE };

if (require.main === module) console.log(reviewText(review()));
