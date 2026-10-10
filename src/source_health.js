// 資料來源健康檢查：任何來源連續 12 小時沒有成功更新就私訊管理者，恢復時再通知一次。
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../research/source_alert_state.json');
const LIVE = path.join(__dirname, '../public/data/live_intel.json');
const HOUR = 3600_000;
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };

function collectSourceHealth() {
  const rows = [];
  const add = (name, lastSuccess, status, detail, limitHours = 12) => rows.push({ name, lastSuccess: lastSuccess || null, status: status || 'UNKNOWN', detail: detail || null, limitHours });
  const cache = (rel, name, limit) => { const c = readJson(path.join(__dirname, '..', rel), null); add(name, c?.lastSuccess, c?.status, c?.error || (c?.errors || []).slice(0, 2).join('；') || null, limit); };
  try { const h = require('./intel_store').getStore().getHealth('Taiwan_MND'); add('國防部台海動態', h?.lastSuccess, h?.status, h?.error); } catch (e) { add('國防部台海動態', null, 'UNKNOWN', `資料庫無法讀取：${e.message}`); }
  cache('research/source_cache/ukmto_incidents.json', 'UKMTO 船舶事件');
  cache('research/source_cache/ukraine_air_attacks.json', '烏克蘭空軍每日通報');
  cache('research/source_cache/deepstate/state.json', 'DeepState 控制區', 18);
  cache('research/source_cache/china_msa.json', '中國海事局航行警告');
  cache('research/source_cache/japan_js.json', '日本統合幕僚監部', 24);
  cache('research/source_cache/pla_joint.json', '共軍聯合戰備警巡／演習（媒體比對）', 6);
  cache('research/source_cache/taiwan_infra.json', '台灣斷網／海纜／停電監測', 6);
  cache('research/source_cache/nato_flank.json', '北約東翼領空／升空（媒體比對）', 6);
  cache('research/source_cache/markets.json', '金融市場報價（Yahoo Finance）', 24);
  cache('research/source_cache/diplomacy.json', '外交與政治新聞（媒體比對）', 6);
  cache('research/source_cache/taiwan_civil.json', '台灣民生、外島交通、半導體管制與事實查核', 6);
  cache('research/source_cache/usni_fleet.json', '美軍航艦動態（USNI 週報）', 24);
  cache('research/source_cache/mobilization.json', '各國動員前兆與歐洲備戰（媒體比對）', 6);
  cache('research/source_cache/regional.json', '朝鮮半島、南海、以巴與紅海、中國海警（媒體比對）', 6);
  const live = readJson(LIVE, {});
  for (const [name, s] of Object.entries(live.sourceStatus || {})) add(name, s.lastSuccess, s.status, s.lastError, /STAC/.test(name) ? 36 : 12);
  try { for (const r of require('./research_health').researchSourceRows()) add(r.name, r.lastSuccess, r.status, r.detail, r.limitHours); } catch (e) { add('研究排程', null, 'UNKNOWN', `無法讀取：${e.message}`); }
  return rows;
}

// 回傳要發的通知與新狀態；首次看到的來源不發「恢復」通知
function planSourceAlerts(rows, state = {}, now = Date.now()) {
  const next = { ...state }, down = [], recovered = [];
  for (const r of rows) {
    const age = r.lastSuccess ? now - Date.parse(r.lastSuccess) : Infinity;
    const failing = !(age <= r.limitHours * HOUR);
    const was = state[r.name]?.failing === true;
    if (failing && !was) down.push({ ...r, hours: Number.isFinite(age) ? Math.round(age / HOUR) : null });
    if (!failing && was) recovered.push(r);
    next[r.name] = { failing, checkedAt: new Date(now).toISOString(), since: failing ? (was ? state[r.name].since : new Date(now).toISOString()) : null };
  }
  return { down, recovered, next };
}

function alertMessage(down, recovered) {
  const lines = ['# 🛠️ 資料來源狀態通知'];
  if (down.length) {
    lines.push('**以下來源超過時限沒有成功更新：**');
    for (const d of down) lines.push(`• ${d.name}：${d.hours === null ? '從未成功' : `已 ${d.hours} 小時`}（狀態 ${d.status}）${d.detail ? `｜${String(d.detail).slice(0, 120)}` : ''}`);
    lines.push('這段期間相關的戰場圖與預警會沿用舊資料或顯示「無法判定」。');
  }
  if (recovered.length) lines.push(`**已恢復：**${recovered.map(r => r.name).join('、')}`);
  return lines.join('\n').slice(0, 1900);
}

async function dispatchSourceAlerts(client, adminId, { file = STATE_FILE, now = Date.now(), rows = collectSourceHealth() } = {}) {
  const state = readJson(file, {});
  const { down, recovered, next } = planSourceAlerts(rows, state, now);
  if (down.length || recovered.length) {
    const user = await client.users.fetch(adminId); // 失敗時拋出錯誤、不更新狀態，下一輪重試
    await user.send({ content: alertMessage(down, recovered), allowedMentions: { parse: [] } });
  }
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 1)); fs.renameSync(tmp, file);
  return { down: down.map(d => d.name), recovered: recovered.map(r => r.name) };
}

function sourceStatusText(rows = collectSourceHealth(), now = Date.now()) {
  const lines = ['# 資料來源狀態'];
  for (const r of rows) {
    const age = r.lastSuccess ? (now - Date.parse(r.lastSuccess)) / HOUR : null;
    const ok = age !== null && age <= r.limitHours;
    lines.push(`${ok ? '🟢' : '🔴'} ${r.name}：${age === null ? '尚無成功紀錄' : `${age < 1 ? '1 小時內' : `${Math.round(age)} 小時前`}更新`}`);
  }
  return lines.join('\n').slice(0, 1900);
}

module.exports = { collectSourceHealth, planSourceAlerts, alertMessage, dispatchSourceAlerts, sourceStatusText, STATE_FILE };
