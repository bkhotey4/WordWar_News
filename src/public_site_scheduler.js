// 公開情報網頁排程：台北時間 08:40、20:40 之後各推送一次；燈號上升或有新報導時另外加開（間隔至少 30 分鐘）（早上接在研究排程 06:52／07:22 之後，晚上接在 18:52／19:22 之後）。
// 在子行程跑 scripts/build_public_site.js --push，失敗時 30 分鐘後重試；research/public_site.json 的 enabled 為 true 才執行。
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONFIG = path.join(ROOT, 'research', 'public_site.json');
const STATE = path.join(ROOT, 'research', 'site_publish_state.json');
const SLOTS = [[8, 40], [20, 40]];
const HOUR = 3600_000;
let running = false;

const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
// 目前應完成的最近一個時段，例如 "2026-10-08T20:40"
function currentSlot(now = Date.now()) {
  const t = new Date(now + 8 * HOUR), date = t.toISOString().slice(0, 10), mins = t.getUTCHours() * 60 + t.getUTCMinutes();
  const passed = SLOTS.filter(([h, m]) => mins >= h * 60 + m);
  if (passed.length) { const [h, m] = passed[passed.length - 1]; return `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
  const y = new Date(now + 8 * HOUR - 24 * HOUR).toISOString().slice(0, 10);
  const [h, m] = SLOTS[SLOTS.length - 1];
  return `${y}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function due(state, now = Date.now()) {
  const slot = currentSlot(now);
  if (state.lastSlot === slot) return null;
  if (state.lastFailureAt && now - Date.parse(state.lastFailureAt) < 30 * 60_000 && state.failedSlot === slot) return null;
  return slot;
}
// 出事時加開：燈號上升或有新的查核報導，距離上次更新超過 30 分鐘就馬上更新
const EVENT_GAP = 30 * 60_000;
function signature(now = Date.now()) {
  const levels = {};
  for (const t of require('./warning_board').getWarningBoard(now).theaters) levels[t.id] = t.level ?? null;
  let reports = [];
  try { reports = require('./research_reports').getResearchFeed(now).reports.map(r => r.id); } catch { /* 沒有報導 */ }
  return { levels, reports };
}
function eventReason(prev, sig) {
  if (!prev) return null;
  const up = Object.entries(sig.levels).filter(([id, lv]) => Number.isInteger(lv) && lv > (prev.levels?.[id] ?? 1));
  if (up.length) return `燈號上升：${up.map(([id, lv]) => `${id}→${lv}`).join('、')}`;
  const fresh = sig.reports.filter(id => !(prev.reports || []).includes(id));
  if (fresh.length) return `新報導 ${fresh.length} 篇`;
  return null;
}
function eventDue(state, sig, now = Date.now()) {
  const last = Math.max(Date.parse(state.lastSuccessAt || 0) || 0, Date.parse(state.lastFailureAt || 0) || 0);
  if (now - last < EVENT_GAP) return null;
  return eventReason(state.lastSig, sig);
}
function maybePublish({ now = Date.now(), run = execFile } = {}) {
  const cfg = readJson(CONFIG, null);
  if (!cfg?.enabled || running) return false;
  const state = readJson(STATE, {});
  let slot = due(state, now), sig = null;
  try { sig = signature(now); } catch (e) { console.error('[PUBLIC SITE] 無法計算狀態：', e.message); }
  if (sig && !state.lastSig) { state.lastSig = sig; fs.writeFileSync(STATE, JSON.stringify(state, null, 1)); }
  let reason = null;
  if (!slot && sig) { reason = eventDue(state, sig, now); if (!reason) return false; }
  if (!slot && !reason) return false;
  running = true;
  run(process.execPath, [path.join(ROOT, 'scripts', 'build_public_site.js'), '--push'], { cwd: ROOT, timeout: 15 * 60_000, windowsHide: true, maxBuffer: 4_000_000 }, (err, stdout, stderr) => {
    running = false;
    const next = readJson(STATE, {});
    if (err) Object.assign(next, slot ? { failedSlot: slot } : {}, { lastFailureAt: new Date().toISOString(), lastError: String(stderr || err.message).slice(0, 500) });
    else Object.assign(next, slot ? { lastSlot: slot } : { lastEventAt: new Date().toISOString(), lastEventReason: reason }, { lastSuccessAt: new Date().toISOString(), lastOutput: String(stdout).slice(-500), lastError: null }, sig ? { lastSig: sig } : {});
    fs.writeFileSync(STATE, JSON.stringify(next, null, 1));
    console.log(err ? `[PUBLIC SITE] 推送失敗：${next.lastError}` : `[PUBLIC SITE] 已更新（${slot || `加開：${reason}`}）`);
  });
  return true;
}
module.exports = { maybePublish, currentSlot, due, eventReason, eventDue };
