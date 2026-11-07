// 自我稽核：檢查「設定檔與人工資料本身是否過期」，交給 source_health 一起通知管理者（每輪巡檢都會跑，故障／恢復／每 24 小時提醒沿用同一套）。
// 每一列的 lastSuccess 是「最後一次確認沒問題的時間」：沒問題就填現在，有問題填 null（或資料本身的時間），超過 limitHours 就通知。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DAY = 24 * 3600_000;
const readJson = (rel, fb) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fb; } };

// 資料時效：看「解析出來的最新資料日期」，不看抓取成功時間。部分成功或頁面改版時，來源層的 lastSuccess 仍會更新，
// 單一子來源壞掉好幾天也看不出來（2026-11 GDELT、中國官方來源實例）
const newest = list => Math.max(0, ...list.map(v => Date.parse(v) || 0));
function freshnessChecks(read) {
  const checks = [];
  const add = (name, at, hours) => checks.push({ name: `資料時效：${name}`, at: at || 0, hours });
  const subs = (label, map, hours) => { for (const [id, v] of Object.entries(map || {})) add(`${label} ${id}`, Date.parse(v.lastSuccess), hours); };
  const c = n => read(`research/source_cache/${n}.json`);
  if (c('china_msa')) add('中國海事局最新公告', newest((c('china_msa').notices || []).map(n => n.publishedAt || n.date)), 4 * 24);
  if (c('jcg_navwarn')) add('海保廳最新航行警報', newest(Object.values(c('jcg_navwarn').items || {}).map(i => i.issuedAt)), 4 * 24);
  if (c('japan_js')) add('統合幕僚監部最新發布', newest((c('japan_js').items || []).map(i => i.date)), 6 * 24);
  if (c('ukraine_air_attacks')) add('烏克蘭空軍最新通報', newest((c('ukraine_air_attacks').reports || []).map(r => r.time)), 36);
  if (c('taipower_grid')?.latest) add('台電機組最新時間', Date.parse(c('taipower_grid').latest.at), 6);
  subs('中國官方來源', c('cn_official')?.sources, 72);
  subs('中國內政來源', c('cn_politics')?.sources, 72);
  subs('GDELT', c('gdelt')?.theaters, 72);
  subs('旅遊警示', c('travel_advisories')?.feeds, 72);
  return checks;
}
// 國防部通報：原文明明有數字卻解析成空值，表示用語改了（2026-11 只寫「進入」不寫「逾越」，整個主要指標失效才被發現）
function mndParseGaps(docs) {
  const gaps = [];
  for (const d of docs.slice(0, 7)) {
    const o = d.observation || {}, body = d.body || '', day = String(o.periodEnd || d.publishedAt).slice(0, 10);
    if (/共機\s*\d/.test(body) && o.aircraft?.value == null) gaps.push(`${day} 共機架次`);
    if (/共艦\s*\d/.test(body) && o.ships?.value == null) gaps.push(`${day} 共艦艘次`);
    if (/(進入|逾越)[^。]{0,90}\d+\s*架/.test(body) && o.crossingOrAirspace?.value == null) gaps.push(`${day} 越中線／進入空域`);
  }
  return gaps;
}

function auditRows(now = Date.now()) {
  const rows = [];
  const ok = (name, detail = null) => rows.push({ name, lastSuccess: new Date(now).toISOString(), status: 'OK', detail, limitHours: 1 });
  const bad = (name, detail, lastSuccess = null, limitHours = 1) => rows.push({ name, lastSuccess, status: 'STALE', detail, limitHours });

  // 1. 敏感日期行事曆：沒有今天以後的日期，台海「政治時間點」指標就只能回報無法判定
  {
    const name = '自我稽核：敏感日期行事曆';
    const { calendarEntries } = require('./warning_board');
    const future = calendarEntries(readJson('research/sensitive_dates.json', { entries: [] }), now).filter(e => Date.parse(`${e.date}T00:00:00+08:00`) >= now - DAY);
    if (future.length) ok(name); else bad(name, 'research/sensitive_dates.json 沒有今天以後的日期，請補上（每年固定的日期可設 yearly:true）。');
  }

  // 2. 人工覆核紀錄：多數戰區的人工指標（美軍打擊、北約第 4 條、白俄演習等）靠這份紀錄，太久沒新增會整批變「無法判定」
  {
    const name = '自我稽核：人工覆核的預警紀錄';
    const ledger = readJson('research/warning_indicators.json', { entries: [] });
    const latest = Math.max(0, ...(ledger.entries || []).map(e => Date.parse(e.observedAt) || 0));
    const days = latest ? Math.floor((now - latest) / DAY) : null;
    if (latest && days <= 10) ok(name);
    else bad(name, `research/warning_indicators.json 最新一筆是 ${days === null ? '無' : `${days} 天前`}；超過有效期的人工指標在燈號上會顯示無法判定，「下一個觀察點」文字也可能過時。`, latest ? new Date(latest).toISOString() : null, 10 * 24);
  }

  // 3. USNI 艦隊週報：網站抓得到不代表有新週報（2026-10 曾連續 3 週沒發），看週報本身的日期
  {
    const usni = readJson('research/source_cache/usni_fleet.json', null);
    if (usni?.latest?.publishedAt) {
      const days = Math.floor((now - Date.parse(usni.latest.publishedAt)) / DAY);
      rows.push({ name: '自我稽核：USNI 艦隊週報日期', lastSuccess: usni.latest.publishedAt, status: days <= 10 ? 'OK' : 'STALE', detail: days <= 10 ? null : `最新一期是 ${usni.latest.publishedAt.slice(0, 10)}（${days} 天前），航艦位置已標示為舊資料、不列入燈號。`, limitHours: 10 * 24 });
    }
  }

  // 4. 研究稿退件：草稿被退回時只在主控台留紀錄，這裡列出最近 24 小時的退件數
  {
    const name = '自我稽核：研究草稿退件';
    const dir = path.join(ROOT, 'research/drafts/rejected');
    let recent = [];
    try { recent = fs.readdirSync(dir).filter(f => f.endsWith('.json') && now - fs.statSync(path.join(dir, f)).mtimeMs <= DAY); } catch { /* 沒有退件資料夾 */ }
    if (!recent.length) ok(name); else bad(name, `最近 24 小時有 ${recent.length} 份草稿被退回（research/drafts/rejected）：${recent.slice(0, 3).join('、')}`);
  }

  // 5. 雲端寫死數據稽核（每 3 天）：最新一份報告有「高」嚴重度問題就通知；漏跑由研究排程健康檢查負責
  {
    const audit = require('./audit_report').latestAudit();
    if (audit) {
      const high = audit.findings.filter(f => f.severity === 'HIGH');
      rows.push({ name: '自我稽核：雲端寫死數據稽核', lastSuccess: high.length ? null : audit.generatedAt, status: high.length ? 'STALE' : 'OK', detail: high.length ? `${audit.date} 稽核發現 ${high.length} 個高嚴重度問題：${high.slice(0, 3).map(f => f.title).join('；')}（research/audits/${audit.date}.json）` : null, limitHours: 1 });
    }
  }

  // 5b. 指標提案等太久：提案要本機機器人按鈕核可，放著不處理等於人工紀錄繼續過期
  {
    const name = '自我稽核：待核可的指標提案';
    const old = require('./indicator_proposals').pendingProposals().filter(p => p.sentAt && now - Date.parse(p.sentAt) > 2 * DAY);
    if (old.length) bad(name, `有 ${old.length} 筆提案超過 2 天沒有處理，請到 Discord 私訊按採納或駁回（需要本機機器人開著）。`); else ok(name);
  }

  // 6. 資料時效與解析失效
  for (const c of freshnessChecks(rel => readJson(rel, null))) {
    const fresh = now - c.at <= c.hours * 3600_000;
    rows.push({ name: c.name, lastSuccess: c.at ? new Date(c.at).toISOString() : null, status: fresh ? 'OK' : 'STALE', detail: fresh ? null : `解析出的最新資料已超過 ${c.hours} 小時（來源可能部分失敗或改版）。`, limitHours: c.hours });
  }
  try {
    const gaps = mndParseGaps(require('./intel_store').getStore().documents('TAIWAN_MND'));
    if (gaps.length) bad('自我稽核：國防部通報解析', `原文有數字但解析成空值，可能改了用語：${gaps.slice(0, 4).join('、')}（src/collectors/taiwan_mnd.js）`); else ok('自我稽核：國防部通報解析');
  } catch (e) { bad('自我稽核：國防部通報解析', `無法檢查：${e.message}`); }
  return rows;
}

module.exports = { auditRows, freshnessChecks, mndParseGaps };
