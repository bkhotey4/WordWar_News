// 雲端巡檢停擺偵測：雲端每輪巡檢在上傳狀態前寫 research/cloud_heartbeat.json，本機機器人每次同步後檢查；
// 超過 60 分鐘沒有新的一輪就私訊管理者（之後每 6 小時提醒一次），恢復時再通知一次。
// 雲端停擺時雲端自己無法通知，所以這個檢查只在本機執行（雲端主控模式，見 src/bot/patrol.js 的 startCloudSync）。
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'research', 'cloud_heartbeat.json');
const STALE_MIN = 60; // 一輪 15 分鐘、慢的一輪約 35 分鐘，再加本機每 10 分鐘同步的延遲
const REMIND = 6 * 3600_000;
const tpe = ms => new Date(ms + 8 * 3600_000).toISOString().slice(5, 16).replace('T', ' ');

function writeHeartbeat(info = {}, file = FILE, now = Date.now()) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ at: new Date(now).toISOString(), ...info }, null, 1));
  fs.renameSync(tmp, file);
}

// 純函式：依心跳時間與上次通知狀態決定要送什麼（null＝不送）
function planWatchdog(beatAt, state = {}, now = Date.now()) {
  const age = beatAt ? (now - beatAt) / 60_000 : Infinity;
  if (age <= STALE_MIN) return state.downSince ? { kind: 'RECOVERED', state: {} } : { kind: null, state };
  if (state.downSince && now - Date.parse(state.lastAlertAt) < REMIND) return { kind: null, state };
  return { kind: state.downSince ? 'STILL_DOWN' : 'DOWN', state: { downSince: state.downSince || new Date(now).toISOString(), lastAlertAt: new Date(now).toISOString() } };
}

function watchdogMessage(kind, beatAt, downSince, now = Date.now()) {
  const last = beatAt ? `最後一輪在 ${tpe(beatAt)}（台北，${Math.round((now - beatAt) / 60_000)} 分鐘前）` : '找不到雲端巡檢紀錄';
  if (kind === 'RECOVERED') return `✅ 雲端巡檢已恢復（${last}；停擺自 ${tpe(Date.parse(downSince))} 起）。`;
  return `${kind === 'DOWN' ? '🛑' : '⏰ 仍未恢復：'} 雲端巡檢停擺：${last}。停擺期間不會抓資料、更新燈號、推播警報或更新網站。\n請到 https://github.com/bkhotey4/WordWar_News/actions/workflows/patrol.yml 查看，可按「Run workflow」手動重啟。`;
}

let mem = {}; // 通知狀態只放記憶體：這份檔會同步到雲端，不寫本機專屬狀態；機器人重啟後最多重發一次
async function checkCloudHeartbeat(client, adminId, { file = FILE, now = Date.now() } = {}) {
  let beatAt = null;
  try { beatAt = Date.parse(JSON.parse(fs.readFileSync(file, 'utf8')).at) || null; } catch { /* 還沒有心跳檔 */ }
  if (!beatAt && !fs.existsSync(file)) return null; // 雲端還沒部署心跳前不誤報
  const plan = planWatchdog(beatAt, mem, now);
  if (!plan.kind) { mem = plan.state; return null; }
  const text = watchdogMessage(plan.kind, beatAt, mem.downSince || plan.state.downSince, now);
  const user = await client.users.fetch(adminId); // 失敗時拋出錯誤、不更新狀態，下次同步再試
  await user.send(text);
  mem = plan.state;
  return plan.kind;
}

module.exports = { writeHeartbeat, planWatchdog, watchdogMessage, checkCloudHeartbeat, FILE, STALE_MIN };
