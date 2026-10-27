// 資料來源健康檢查：任何來源超過時限沒有成功更新就私訊管理者；仍未恢復時每 24 小時再提醒一次，恢復時再通知。
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../research/source_alert_state.json');
const LIVE = path.join(__dirname, '../public/data/live_intel.json');
const HOUR = 3600_000;
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };

function collectSourceHealth() {
  const rows = [];
  const add = (name, lastSuccess, status, detail, limitHours = 12) => rows.push({ name, lastSuccess: lastSuccess || null, status: status || 'UNKNOWN', detail: detail || null, limitHours });
  const cache = (rel, name, limit) => {
    const c = readJson(path.join(__dirname, '..', rel), null);
    // 官方網站被擋、改讀 Internet Archive 快照時，註明快照時間（資料時間以此為準）
    const archived = c?.via === 'ARCHIVE' ? `官方網站擋下程式連線（${c.directError || 'HTTP 403'}），改讀 Internet Archive 快照，資料時間 ${String(c.dataAsOf || '').slice(0, 16).replace('T', ' ')} UTC` : null;
    add(name, c?.lastSuccess, c?.status, c?.error || (c?.errors || []).slice(0, 2).join('；') || archived || null, limit);
  };
  try { const h = require('./intel_store').getStore().getHealth('Taiwan_MND'); add('國防部台海動態', h?.lastSuccess, h?.status, h?.error); } catch (e) { add('國防部台海動態', null, 'UNKNOWN', `資料庫無法讀取：${e.message}`); }
  cache('research/source_cache/ukmto_incidents.json', 'UKMTO 船舶事件');
  cache('research/source_cache/ukraine_air_attacks.json', '烏克蘭空軍每日通報');
  cache('research/source_cache/deepstate/state.json', 'DeepState 控制區', 18);
  cache('research/source_cache/china_msa.json', '中國海事局航行警告');
  cache('research/source_cache/japan_js.json', '日本統合幕僚監部', 24);
  cache('research/source_cache/jcg_navwarn.json', '日本海上保安廳航行警報（NAVAREA XI）', 12);
  cache('research/source_cache/travel_advisories.json', '美英日台官方旅遊警示', 12);
  cache('research/source_cache/twse_flows.json', '證交所外資買賣超', 72);
  cache('research/source_cache/ncdr_alerts.json', '國家災害防救科技中心 民生示警（CAP）', 2);
  cache('research/source_cache/taipower_grid.json', '台電各機組發電量（故障停機）', 3);
  cache('research/source_cache/gfw_vessels.json', 'Global Fishing Watch 雷達衛星船舶偵測', 48);
  cache('research/source_cache/ally_statements.json', '美日官方聲明（日本防衛省、美國國防部、國務院）', 12);
  cache('research/source_cache/cn_official.json', '中國國防部／東部戰區／國台辦官方發布', 12);
  cache('research/source_cache/gdelt.json', 'GDELT 全球新聞報導量', 12);
  cache('research/source_cache/cn_politics.json', '中國台灣網／新華台灣／中國軍網（內政背景）', 12);
  // Cloudflare Radar 未設定 token 時不算故障，只列出狀態
  { const c = readJson(path.join(__dirname, '../research/source_cache/cloudflare_radar.json'), null); if (c && c.status !== 'NOT_CONFIGURED') add('Cloudflare Radar 對台攻擊流量', c.lastSuccess, c.status, c.error, 12); }
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

// 回傳要發的通知與新狀態；首次看到的來源不發「恢復」通知；持續故障每 24 小時提醒（避免第一次通知被訊息淹沒）
const REMIND_HOURS = 24;
function planSourceAlerts(rows, state = {}, now = Date.now()) {
  const next = { ...state }, down = [], recovered = [], still = [];
  for (const r of rows) {
    const age = r.lastSuccess ? now - Date.parse(r.lastSuccess) : Infinity;
    // 最近一輪完全抓不到（OFFLINE）時，過了時限的一半就先通知，不必等滿時限；部分失敗仍等時限，避免小故障一直通知
    const failing = !(age <= r.limitHours * HOUR) || (r.status === 'OFFLINE' && !(age <= r.limitHours * HOUR / 2));
    const was = state[r.name]?.failing === true;
    const hours = Number.isFinite(age) ? Math.round(age / HOUR) : null;
    if (failing && !was) down.push({ ...r, hours });
    if (!failing && was) recovered.push(r);
    const lastNotice = was ? Date.parse(state[r.name].remindedAt || state[r.name].since || 0) : now;
    const remind = failing && was && now - lastNotice >= REMIND_HOURS * HOUR;
    if (remind) still.push({ ...r, hours });
    next[r.name] = { failing, checkedAt: new Date(now).toISOString(), since: failing ? (was ? state[r.name].since : new Date(now).toISOString()) : null,
      remindedAt: failing ? (remind || !was ? new Date(now).toISOString() : state[r.name].remindedAt || state[r.name].since) : null };
  }
  return { down, recovered, still, next };
}

function alertMessage(down, recovered, still = []) {
  const lines = ['# 🛠️ 資料來源狀態通知'];
  if (down.length) {
    lines.push('**以下來源超過時限沒有成功更新：**');
    for (const d of down) lines.push(`• ${d.name}：${d.hours === null ? '從未成功' : `已 ${d.hours} 小時`}（狀態 ${d.status}）${d.detail ? `｜${String(d.detail).slice(0, 120)}` : ''}`);
    lines.push('這段期間相關的戰場圖與預警會沿用舊資料或顯示「無法判定」。');
  }
  if (still.length) {
    lines.push('**⏰ 仍未恢復（每 24 小時提醒一次）：**');
    for (const d of still) lines.push(`• ${d.name}：${d.hours === null ? '從未成功' : `已 ${d.hours} 小時`}${d.detail ? `｜${String(d.detail).slice(0, 100)}` : ''}`);
    lines.push('需要人工處理：可以在 Claude Code 說「檢查某某來源為什麼沒更新」。');
  }
  if (recovered.length) lines.push(`**已恢復：**${recovered.map(r => r.name).join('、')}`);
  return lines.join('\n').slice(0, 1900);
}

async function dispatchSourceAlerts(client, adminId, { file = STATE_FILE, now = Date.now(), rows = collectSourceHealth() } = {}) {
  const state = readJson(file, {});
  const { down, recovered, still, next } = planSourceAlerts(rows, state, now);
  if (down.length || recovered.length || still.length) {
    const user = await client.users.fetch(adminId); // 失敗時拋出錯誤、不更新狀態，下一輪重試
    await user.send({ content: alertMessage(down, recovered, still), allowedMentions: { parse: [] } });
  }
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 1)); fs.renameSync(tmp, file);
  return { down: down.map(d => d.name), recovered: recovered.map(r => r.name), still: still.map(d => d.name) };
}

function sourceStatusText(rows = collectSourceHealth(), now = Date.now()) {
  const lines = ['# 資料來源狀態'];
  for (const r of rows) {
    const age = r.lastSuccess ? (now - Date.parse(r.lastSuccess)) / HOUR : null;
    const ok = age !== null && age <= r.limitHours;
    // 時限內但最近一輪有失敗：黃燈，讓剛發生的故障看得到
    const warn = ok && ['OFFLINE', 'DEGRADED', 'PARTIAL'].includes(r.status);
    lines.push(`${!ok ? '🔴' : warn ? '🟡' : '🟢'} ${r.name}：${age === null ? '尚無成功紀錄' : `${age < 1 ? '1 小時內' : `${Math.round(age)} 小時前`}更新`}${warn ? `（最近一輪${r.status === 'OFFLINE' ? '全部' : '部分'}失敗）` : ''}`);
  }
  return lines.join('\n').slice(0, 1900);
}

module.exports = { collectSourceHealth, planSourceAlerts, alertMessage, dispatchSourceAlerts, sourceStatusText, STATE_FILE };
