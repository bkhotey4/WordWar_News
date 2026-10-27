'use strict';
function el(tag, text, parent, cls) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; if (parent) parent.append(n); return n; }
function link(text, url, parent) { try { const u = new URL(url); if (u.protocol !== 'https:') return; const a = el('a', text, parent); a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; } catch {} }
const tpe = v => v ? new Date(Date.parse(v) + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') : '—';
const STATE = { OK: ['正常', 'ok'], NO_RECORD: ['無執行紀錄', 'idle'], MISSED: ['漏跑', 'warn'], FAILED: ['失敗', 'bad'], QUOTA_EXHAUSTED: ['額度不足', 'bad'], PAUSED: ['已停用', 'idle'], NOT_CONFIGURED: ['未設定', 'idle'] };
const RESULT = { PUBLISHED: '已發布', NO_NEW_CONTENT: '無新內容', FAILED: '失敗', QUOTA_EXHAUSTED: '額度不足' };
const OUTCOME = { HIT: ['命中', 'ok'], MISS: ['漏報', 'bad'], DURING_ONLY: ['僅事件期間', 'warn'], NO_DATA: ['無資料', 'idle'] };
const THEATER = { taiwan_strait: '台海', iran_gulf: '美伊／荷莫茲', europe_security: '波蘭與北約東翼', ukraine_front: '烏俄' };
function badge(state, map, parent) { const [t, c] = map[state] || [state, 'idle']; return el('span', t, parent, `state ${c}`); }

function renderHealth(h) {
  const root = document.getElementById('health'); root.replaceChildren();
  const overall = document.getElementById('overall'); overall.replaceChildren(); badge(h.overall, STATE, overall);
  if (!h.schedules.length) el('p', '尚未偵測到研究排程（Codex automations 或 research/research_schedules.json）。', root, 'empty');
  for (const s of h.schedules) {
    const box = el('div', undefined, root, 'source-row'); box.style.marginBottom = '12px';
    const top = el('div', undefined, box, 'row-top'); el('strong', `${s.name}`, top); badge(s.state, STATE, top);
    const dl = el('dl', undefined, box, 'kv');
    for (const [k, v] of [['排程', `${s.app || '未標示'}｜${s.rule || '無固定時刻'}`], ['上次成功', tpe(s.lastSuccessAt)], ['上次預定', tpe(s.previousScheduledAt)], ['下次預定', tpe(s.nextScheduledAt)], ['說明', s.note]]) { el('dt', k, dl); el('dd', v, dl); }
    if (s.recentRuns.length) {
      const d = el('details', undefined, box); el('summary', `最近 ${s.recentRuns.length} 次執行`, d);
      const wrap = el('div', undefined, d, 'table-wrap'); const t = el('table', undefined, wrap, 'data-table');
      const hr = el('tr', undefined, el('thead', undefined, t)); for (const c of ['完成（台北）', '結果', '發布稿件', '說明']) el('th', c, hr);
      const tb = el('tbody', undefined, t);
      for (const r of s.recentRuns) { const tr = el('tr', undefined, tb); el('td', tpe(r.finishedAt), tr); el('td', RESULT[r.result] || r.result, tr); el('td', r.published.join('、') || '—', tr); el('td', r.note || '—', tr); }
    }
  }
  const dl = el('dl', undefined, root, 'kv');
  for (const [k, v] of [['最新研究稿', tpe(h.lastReportAt)], ['最近 Discord 送達', tpe(h.lastDeliveryAt)], ['待分析原文', h.pendingOriginalDocuments ?? '—']]) { el('dt', k, dl); el('dd', String(v), dl); }
  el('p', h.note, root, 'section-note');
}

function renderBacktest(b) {
  const root = document.getElementById('backtest'); root.replaceChildren();
  el('p', b.method, root, 'section-note');
  const wrap = el('div', undefined, root, 'table-wrap'); const t = el('table', undefined, wrap, 'data-table');
  const hr = el('tr', undefined, el('thead', undefined, t));
  for (const c of ['指標', '戰區', '計分期間', '參考事件', '命中', '漏報', '僅期間', '誤報（每 30 天）', '提前中位數', '觸發日佔比']) el('th', c, hr);
  const tb = el('tbody', undefined, t);
  for (const r of b.indicators) {
    const tr = el('tr', undefined, tb);
    for (const v of [r.name, THEATER[r.theater] || r.theater, `${r.coverage.from}～${r.coverage.to}`, r.eventsCovered, r.hits, r.misses, r.duringOnly,
      r.falseAlarms === null ? '—（無參考事件）' : `${r.falseAlarms}（${r.falseAlarmsPer30Days}）`, r.medianLeadDays === null ? '—' : `${r.medianLeadDays} 天`, r.triggeredShare === null ? '—' : `${r.triggeredShare}%`]) el('td', String(v), tr);
  }
  for (const r of b.indicators.filter(r => r.events.length)) {
    const sec = el('div', undefined, root, 'source-row'); sec.style.marginTop = '14px';
    el('strong', `${r.name}｜逐事件結果`, sec);
    el('p', r.note, sec, 'row-note');
    const list = el('ul', undefined, sec);
    for (const e of r.events) { const li = el('li', `${e.start} ${e.name}：`, list); badge(e.outcome, OUTCOME, li); if (e.leadDays) el('span', ` 提前 ${e.leadDays} 天（首次觸發 ${e.firstTrigger}）`, li); }
    if (r.recentFalseAlarms.length) el('p', `最近的誤報期間：${r.recentFalseAlarms.map(f => f.from === f.to ? f.from : `${f.from}～${f.to}`).join('、')}`, sec, 'row-note');
  }
  const refs = el('details', undefined, root); el('summary', `參考事件與來源（${b.referenceEvents.length}）`, refs);
  for (const e of b.referenceEvents) { const p = el('p', `${e.start}～${e.end}｜${e.name}　`, refs); for (const s of e.sources) { link(s.publisher, s.url, p); p.append(' '); } }
  el('p', b.limitations, root, 'section-note');
}

async function getJson(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw Error(`${url} HTTP ${r.status}`); return r.json(); }
async function load() {
  const status = document.getElementById('status'); status.textContent = '讀取中…';
  try { renderHealth(await getJson('/api/research-health')); status.textContent = `查閱時間 ${new Date().toLocaleString('zh-TW')}（時間均為台北時間）`; }
  catch (e) { status.textContent = `研究排程資料讀取失敗：${e.message}`; }
  try { renderBacktest(await getJson('/api/warning-backtest')); }
  catch (e) { document.getElementById('backtest').replaceChildren(el('p', `回測讀取失敗：${e.message}`, undefined, 'empty')); }
}
document.getElementById('refresh').addEventListener('click', load); load();
