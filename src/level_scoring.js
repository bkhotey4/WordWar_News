// 預警自動評分：每次燈號升級算一筆，滿 14 天後由研究排程判定有沒有應驗（research/level_outcomes/<升級編號>.json）。
// 判定由 AI 查公開來源產生、未經人工核可，只公開在準確度頁，不影響燈號、也不會自動改門檻。
// 「持續多久」是程式直接算的客觀數字：升級後不到 48 小時就降回，多半是雜訊。
const fs = require('fs');
const path = require('path');

const HOUR = 3600_000, DAY = 24 * HOUR;
const DIR = path.join(__dirname, '../research/level_outcomes');
const HISTORY_FILE = path.join(__dirname, '../research/warning_history.json');
const MATURE_DAYS = 14, MERGE_HOURS = 72, BLIP_HOURS = 48;
const OUTCOMES = { CONFIRMED: '應驗', FALSE_ALARM: '誤報', INCONCLUSIVE: '無法判定' };
const SOURCE_CLASSES = new Set(['OFFICIAL', 'INDEPENDENT_MEDIA', 'EXTERNAL_ASSESSMENT', 'PARTY_CLAIM']);
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };

// 升級事件：72 小時內連續升級算同一次（只更新最高等級）；規則改版造成的等級變動不算
function episodes(history = readJson(HISTORY_FILE, { snapshots: [] }), now = Date.now()) {
  const byTheater = new Map();
  for (const s of history.snapshots || []) if (Number.isInteger(s.level) && Number.isFinite(Date.parse(s.at)) && Date.parse(s.at) <= now) byTheater.set(s.theater, [...(byTheater.get(s.theater) || []), s]);
  const out = [];
  for (const [theater, list] of byTheater) {
    const snaps = list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    let last = null;
    snaps.forEach((s, i) => {
      const prev = snaps[i - 1], at = Date.parse(s.at);
      if (!prev || s.level <= prev.level || (s.ruleVersion || null) !== (prev.ruleVersion || null)) return;
      if (last && at - Date.parse(last.at) < MERGE_HOURS * HOUR) { if (s.level > last.to) { last.to = s.level; last.reachedAt = s.at; } return; }
      last = { id: `${theater}-${s.at.slice(0, 16).replace(/\D/g, '')}`, theater, at: s.at, from: prev.level, to: s.level, ind: s.ind || null, ruleVersion: s.ruleVersion || null };
      out.push(last);
    });
    for (const e of out.filter(x => x.theater === theater)) {
      const start = Date.parse(e.at), reached = Date.parse(e.reachedAt || e.at), after = snaps.filter(s => Date.parse(s.at) > start);
      const fall = after.find(s => Date.parse(s.at) > reached && s.level < e.to); // 維持時間從達到最高級那刻算
      e.heldHours = Math.floor(((fall ? Date.parse(fall.at) : now) - reached) / HOUR);
      e.ended = Boolean(fall);
      e.peak = Math.max(e.to, ...after.filter(s => Date.parse(s.at) - start <= MATURE_DAYS * DAY).map(s => s.level));
      e.mature = now - start >= MATURE_DAYS * DAY;
      e.blip = e.ended && e.heldHours < BLIP_HOURS;
    }
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

function checkOutcome(o, knownIds, now = Date.now()) {
  if (!o || typeof o !== 'object') return ['不是 JSON 物件'];
  const errors = [];
  if (knownIds && !knownIds.has(o.episodeId)) errors.push(`episodeId 不存在：${o.episodeId}`);
  if (!OUTCOMES[o.outcome]) errors.push(`outcome 要是 ${Object.keys(OUTCOMES).join('/')}`);
  if (typeof o.summary !== 'string' || o.summary.length < 20 || o.summary.length > 300) errors.push('summary 要 20～300 字');
  if (!Date.parse(o.labeledAt) || Date.parse(o.labeledAt) > now) errors.push('labeledAt 要是過去的 ISO 時間');
  const sources = Array.isArray(o.sources) ? o.sources : [];
  if (!sources.length || sources.length > 5) errors.push('sources 要 1～5 筆');
  sources.forEach((s, i) => { if (!/^https:\/\/\S+$/.test(s?.url || '') || !s?.publisher || !SOURCE_CLASSES.has(s?.sourceClass)) errors.push(`sources[${i}] 要有 https 網址、publisher 與 sourceClass`); });
  return errors;
}

function readOutcomes(dir = DIR) {
  const map = new Map();
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch { return map; }
  for (const f of files) { const o = readJson(path.join(dir, f), null); if (o && !checkOutcome(o).length) map.set(o.episodeId, o); }
  return map;
}

// 滿 14 天、還沒判定的升級（給研究排程）
function unlabeled(history, outcomes = readOutcomes(), now = Date.now()) {
  return episodes(history, now).filter(e => e.mature && !outcomes.has(e.id));
}

function scorecard(history, outcomes = readOutcomes(), now = Date.now()) {
  const list = episodes(history, now).map(e => ({ ...e, outcome: outcomes.get(e.id) || null }));
  const count = (rows, o) => rows.filter(e => e.outcome?.outcome === o).length;
  const byTheater = [...new Set(list.map(e => e.theater))].map(theater => {
    const rows = list.filter(e => e.theater === theater);
    return { theater, total: rows.length, blips: rows.filter(e => e.blip).length, confirmed: count(rows, 'CONFIRMED'), falseAlarm: count(rows, 'FALSE_ALARM'), inconclusive: count(rows, 'INCONCLUSIVE'), waiting: rows.filter(e => !e.outcome).length };
  });
  return { list, byTheater, labeled: list.filter(e => e.outcome).length };
}

module.exports = { episodes, checkOutcome, readOutcomes, unlabeled, scorecard, OUTCOMES, DIR, MATURE_DAYS, BLIP_HOURS };
