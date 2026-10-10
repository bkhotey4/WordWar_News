'use strict';
function el(tag, text, parent, cls) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; if (parent) parent.append(n); return n; }
function link(text, url, parent) { try { const u = new URL(url); if (u.protocol !== 'https:') return; const a = el('a', text, parent); a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; } catch {} }
const tpe = v => v ? new Date(Date.parse(v) + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') : '—';
const THEATERS = { ukraine_front: '烏俄', taiwan_strait: '台海', iran_gulf: '美伊／荷莫茲', europe_security: '波蘭與北約東翼', middle_east: '以巴、黎巴嫩與紅海', sudan: '蘇丹', myanmar: '緬甸', south_china_sea: '南海', global: '全球／未分區' };
const CORRECTION_KINDS = 'SOURCE_REVISION,REPORT_SUPERSEDED,REPORT_WITHDRAWN';
const CONF_CLASS = { CONFIRMED_MULTI: 'ok', SINGLE_SOURCE: 'warn', DISPUTED: 'bad' };

const theaterSelect = document.getElementById('theater');
for (const [id, name] of Object.entries(THEATERS)) { const o = el('option', name, theaterSelect); o.value = id; }

function render(data) {
  const { kinds, roles, confidence } = data.labels;
  const byId = new Map(data.items.map(i => [i.id, i]));
  const root = document.getElementById('timeline'); root.replaceChildren();
  if (!data.items.length) el('p', '沒有符合條件的紀錄。', root, 'empty');
  for (const i of data.items) {
    const li = el('li', undefined, root, `k-${i.kind}`);
    const top = el('div', undefined, li, 'row-top');
    el('strong', i.title, top);
    const tags = el('span', undefined, top);
    el('span', kinds[i.kind] || i.kind, tags, 'state idle');
    if (i.role) { tags.append(' '); el('span', roles[i.role], tags, `state ${i.role === 'CORRECTION' || i.role === 'DENIAL' ? 'warn' : 'idle'}`); }
    if (i.confidence) { tags.append(' '); el('span', confidence[i.confidence] || i.confidence, tags, `state ${CONF_CLASS[i.confidence] || 'idle'}`); }
    if (i.kind === 'INDICATOR' && i.triggered === false) { tags.append(' '); el('span', '未觸發', tags, 'state idle'); }
    const times = el('div', undefined, li, 'times');
    el('span', `${THEATERS[i.theater] || i.theater}`, times);
    el('span', `事件 ${tpe(i.eventTime)}`, times); el('span', `發布 ${tpe(i.publishedAt)}`, times); el('span', `記錄 ${tpe(i.recordedAt)}`, times);
    if (i.place) el('p', `地點：${i.place}`, li, 'row-note');
    if (i.summary) el('p', i.summary, li, 'row-note');
    if (i.comparison) el('p', `比對：${i.comparison}`, li, 'row-note');
    if (i.diff?.length) { const t = el('table', undefined, el('div', undefined, li, 'table-wrap'), 'data-table'); const hr = el('tr', undefined, el('thead', undefined, t)); for (const c of ['欄位', '修訂前', '修訂後']) el('th', c, hr); const tb = el('tbody', undefined, t); for (const d of i.diff) { const tr = el('tr', undefined, tb); el('td', d.field, tr); el('td', String(d.before ?? '無'), tr); el('td', String(d.after ?? '無'), tr); } }
    const corrected = i.corrects ? byId.get(`event:${i.corrects}`) || byId.get(`indicator:${i.corrects}`) : null;
    if (corrected) el('p', `更正對象：${corrected.title}`, li, 'row-note');
    if (i.sources.length) { const p = el('p', '來源：', li, 'row-note'); for (const s of i.sources) { link(`${s.publisher}${s.sourceClass === 'PARTY_CLAIM' ? '（交戰方聲稱）' : ''}`, s.url, p); p.append('　'); } }
    const thread = i.thread && data.threads[i.thread];
    if (thread) {
      const box = el('div', undefined, li, 'thread'); el('strong', `同一事件串（${thread.length} 筆，由舊到新）`, box);
      const ol = el('ol', undefined, box);
      for (const id of thread) { const x = byId.get(id); if (!x) continue; el('li', `${tpe(x.publishedAt || x.recordedAt)}｜${x.role ? roles[x.role] : kinds[x.kind]}｜${x.title}${x.id === i.id ? '（本筆）' : ''}`, ol); }
    }
  }
  document.getElementById('note').textContent = `${data.note} 共 ${data.total} 筆，顯示前 ${data.items.length} 筆；時間為台北時間。`;
}

async function load() {
  const status = document.getElementById('status'); status.textContent = '讀取中…';
  const q = new URLSearchParams();
  if (theaterSelect.value) q.set('theater', theaterSelect.value);
  if (document.getElementById('kind').value === 'corrections') q.set('kinds', CORRECTION_KINDS);
  try { const r = await fetch(`/api/event-timeline?${q}`, { cache: 'no-store' }); if (!r.ok) throw Error(`HTTP ${r.status}`); render(await r.json()); status.textContent = `查閱 ${new Date().toLocaleString('zh-TW')}`; }
  catch (e) { status.textContent = `讀取失敗：${e.message}`; document.getElementById('timeline').replaceChildren(); }
}
theaterSelect.addEventListener('change', load);
document.getElementById('kind').addEventListener('change', load);
document.getElementById('refresh').addEventListener('click', load);
load();
