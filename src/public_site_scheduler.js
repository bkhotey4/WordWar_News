// 公開情報網頁排程：台北時間每 3 小時（02:40、05:40、08:40 … 23:40）推送一次整頁；其餘時間每小時只更新 live.json（燈號與官方數據，不重畫地圖）；燈號上升或有新報導時另外加開（間隔至少 30 分鐘）（早上接在研究排程 06:52／07:22 之後，晚上接在 18:52／19:22 之後）。
// 在子行程跑 scripts/build_public_site.js --push，失敗時 30 分鐘後重試；research/public_site.json 的 enabled 為 true 才執行。
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONFIG = path.join(ROOT, 'research', 'public_site.json');
const STATE = path.join(ROOT, 'research', 'site_publish_state.json');
const SLOTS = [2, 5, 8, 11, 14, 17, 20, 23].map(h => [h, 40]);
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
// 出事時加開：燈號上升、有新報導或既有報導改版（更正、撤稿、補充），距離上次更新超過 30 分鐘就馬上更新
const EVENT_GAP = 30 * 60_000;
function signature(now = Date.now()) {
  const levels = {};
  for (const t of require('./warning_board').getWarningBoard(now).theaters) levels[t.id] = t.level ?? null;
  let reports = [];
  // 報導記成「編號@內容雜湊」，同一篇改版也看得出來
  try { const { revision } = require('./research_dispatch'); reports = require('./research_reports').getResearchFeed(now).reports.map(r => `${r.id}@${revision(r).slice(0, 12)}`); } catch { /* 沒有報導 */ }
  return { levels, reports };
}
function eventReason(prev, sig) {
  if (!prev) return null;
  const up = Object.entries(sig.levels).filter(([id, lv]) => Number.isInteger(lv) && lv > (prev.levels?.[id] ?? 1));
  if (up.length) return `燈號上升：${up.map(([id, lv]) => `${id}→${lv}`).join('、')}`;
  const idOf = r => String(r).split('@')[0];
  const before = new Map((prev.reports || []).map(r => [idOf(r), r]));
  const fresh = sig.reports.filter(r => !before.has(idOf(r)));
  // 舊狀態沒有雜湊（升級前）時只比編號，避免升級後誤判全部改版
  const revised = sig.reports.filter(r => before.has(idOf(r)) && String(before.get(idOf(r))).includes('@') && before.get(idOf(r)) !== r);
  if (fresh.length || revised.length) return [fresh.length ? `新報導 ${fresh.length} 篇` : null, revised.length ? `報導改版 ${revised.length} 篇` : null].filter(Boolean).join('、');
  return null;
}
function eventDue(state, sig, now = Date.now()) {
  const last = Math.max(Date.parse(state.lastSuccessAt || 0) || 0, Date.parse(state.lastFailureAt || 0) || 0);
  if (now - last < EVENT_GAP) return null;
  return eventReason(state.lastSig, sig);
}
// 每小時數據：距離上次整頁或數據更新滿 60 分鐘，就只重算 live.json 並推送（幾 KB，不重畫地圖與海報）
const LIVE_GAP = 60 * 60_000;
function liveDue(state, now = Date.now()) {
  if (!fs.existsSync(path.join(ROOT, 'public_site', 'index.html'))) return false;
  const last = Math.max(Date.parse(state.lastSuccessAt || 0) || 0, Date.parse(state.lastLiveAt || 0) || 0, Date.parse(state.lastLiveFailureAt || 0) || 0);
  return now - last >= LIVE_GAP;
}
function publishLive(state, now, run) {
  running = true;
  run(process.execPath, [path.join(ROOT, 'scripts', 'build_live_data.js'), '--push'], { cwd: ROOT, timeout: 5 * 60_000, windowsHide: true, maxBuffer: 1_000_000 }, (err, stdout, stderr) => {
    running = false;
    const next = readJson(STATE, {});
    if (err) Object.assign(next, { lastLiveFailureAt: new Date().toISOString(), lastLiveError: String(stderr || err.message).slice(0, 300) });
    else Object.assign(next, { lastLiveAt: new Date().toISOString(), lastLiveError: null });
    fs.writeFileSync(STATE, JSON.stringify(next, null, 1));
    console.log(err ? `[PUBLIC SITE] 每小時數據推送失敗：${next.lastLiveError}` : '[PUBLIC SITE] 每小時數據已更新');
  });
  return 'live';
}
function maybePublish({ now = Date.now(), run = execFile } = {}) {
  const cfg = readJson(CONFIG, null);
  if (!cfg?.enabled || running) return false;
  const state = readJson(STATE, {});
  let slot = due(state, now), sig = null;
  try { sig = signature(now); } catch (e) { console.error('[PUBLIC SITE] 無法計算狀態：', e.message); }
  if (sig && !state.lastSig) { state.lastSig = sig; fs.writeFileSync(STATE, JSON.stringify(state, null, 1)); }
  let reason = null;
  if (!slot && sig) reason = eventDue(state, sig, now);
  if (!slot && !reason) return liveDue(state, now) ? publishLive(state, now, run) : false;
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
module.exports = { maybePublish, currentSlot, due, eventReason, eventDue, liveDue };
