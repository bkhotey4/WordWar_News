'use strict';
function el(tag, text, parent, cls) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; if (parent) parent.append(n); return n; }
function link(text, url, parent) { try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) return; const a = el('a', text, parent); a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; } catch {} }
const tpe = v => v ? new Date(Date.parse(v) + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') : '—';
const day = v => v ? new Date(Date.parse(v) + 8 * 3600_000).toISOString().slice(0, 10) : '—';
const STATE = { TRIGGERED: ['觸發', 'warn'], CLEAR: ['常態', 'ok'], UNKNOWN: ['無法判定', 'idle'] };
const ACCESS = { FULL: '全文', PARTIAL: '部分', ABSTRACT: '摘要' };

function statCard(label, r, parent) {
  const box = el('article', undefined, parent, 'summary-card');
  el('p', label, box, 'label');
  const [t, c] = STATE[r?.status] || STATE.UNKNOWN; el('strong', t, box).className = `state ${c}`;
  el('p', r?.summary || '資料不足，無法判定。', box);
  if (r?.sources?.[0]) { const p = el('p', undefined, box); link(`${r.sources[0].publisher} ↗`, r.sources[0].url, p); }
}
// 90 天：每日脅迫（紅）／和統（綠）標題數長條，加上 14 天脅迫占比折線
function toneChart(series, parent) {
  const W = 900, H = 240, L = 36, R = 36, T = 16, B = 28, n = series.length;
  const maxN = Math.max(2, ...series.map(d => d.coerce + d.peace));
  const x = i => L + (i + 0.5) * (W - L - R) / n, bw = Math.max(2, (W - L - R) / n - 1.5);
  const yN = v => T + (H - T - B) * (1 - v / maxN), yS = s => T + (H - T - B) * (1 - s);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'chart'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', '近 90 天官方涉台標題的脅迫與和統用語數量，以及 14 天脅迫占比');
  const add = (tag, attrs, text) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text !== undefined) e.textContent = text; svg.append(e); return e; };
  for (const s of [0, 0.5, 1]) { add('line', { x1: L, x2: W - R, y1: yS(s), y2: yS(s), stroke: '#22344a', 'stroke-width': 1 }); add('text', { x: W - R + 4, y: yS(s) + 4 }, `${s * 100}%`); }
  add('text', { x: 2, y: yN(maxN) + 4 }, String(maxN)); add('text', { x: 2, y: yN(0) }, '0');
  series.forEach((d, i) => { const cx = x(i) - bw / 2; if (d.peace) add('rect', { x: cx, y: yN(d.peace), width: bw, height: yN(0) - yN(d.peace), fill: '#91d5ab' }); if (d.coerce) add('rect', { x: cx, y: yN(d.peace + d.coerce), width: bw, height: yN(d.peace) - yN(d.peace + d.coerce), fill: '#f4a6a0' }); });
  const pts = series.map((d, i) => d.share14 === null ? null : `${x(i).toFixed(1)},${yS(d.share14).toFixed(1)}`).filter(Boolean);
  if (pts.length > 1) add('polyline', { points: pts.join(' '), fill: 'none', stroke: '#72d6e8', 'stroke-width': 2 });
  [0, Math.floor(n / 2), n - 1].forEach(i => { if (series[i]) add('text', { x: x(i), y: H - 8, 'text-anchor': 'middle' }, series[i].date.slice(5)); });
  parent.append(svg);
  const lg = el('div', undefined, parent, 'legend');
  for (const [c, t] of [['#f4a6a0', '脅迫類用語標題（每日）'], ['#91d5ab', '和統類用語標題（每日）'], ['#72d6e8', '14 天脅迫占比（右軸）']]) { const s = el('span', undefined, lg); const i = el('i', undefined, s); i.style.background = c; s.append(t); }
}
function headlines(list, parent, empty) {
  if (!list?.length) { el('p', empty, parent, 'empty'); return; }
  for (const i of list) { const row = el('div', undefined, parent, 'headline'); const p = el('p', undefined, row); link(i.title, i.url, p); el('p', `${i.publisher}｜${day(i.publishedAt)}${i.dateBasis === 'FIRST_SEEN' ? '（本站首次看到）' : ''}`, row, 'micro'); }
}
function renderBrief(b, labels, parent, open) {
  const d = el('details', undefined, parent, 'brief'); d.open = open;
  el('summary', `${b.week}｜${b.title}（寫於 ${tpe(b.writtenAt)}）`, d);
  el('p', b.summary, d);
  for (const [k, label] of Object.entries(labels || {})) { const s = b.sections[k]; if (!s) continue; el('h4', label, d); el('p', s.text, d); const p = el('p', undefined, d, 'srcs'); for (const id of s.sources) { const src = b.sources.find(x => x.id === id); if (src) link(`${src.publisher}：${src.title.slice(0, 40)}（${ACCESS[src.access] || src.access}） ↗`, src.url, p); } }
  for (const c of b.caveats || []) el('p', `注意：${c}`, d, 'row-note');
}
function srcLinks(b, ids, parent) { const p = el('p', undefined, parent, 'srcs'); for (const id of ids || []) { const src = b.sources.find(x => x.id === id); if (src) link(`${src.publisher}：${src.title.slice(0, 40)}（${ACCESS[src.access] || src.access}） ↗`, src.url, p); } }
function renderAnalysis(pe, parent) {
  parent.replaceChildren();
  if (pe && !pe.newestValid) el('p', `最新稿 ${pe.newestFile} 未通過格式檢查，暫不展示：${(pe.newestErrors || []).slice(0, 3).join('；')}`, parent, 'section-note');
  const a = pe?.analysis;
  if (!a) { el('p', '尚無通過檢查的長期分析（排程每季初產出）。', parent, 'empty'); return; }
  el('h3', `${a.quarter}｜${a.title}`, parent);
  el('p', `寫於 ${tpe(a.writtenAt)}（台北）`, parent, 'micro');
  el('p', a.summary, parent);
  if (a.indicators?.length) { const g = el('div', undefined, parent, 'ind'); for (const i of a.indicators) { const d = el('div', undefined, g); el('span', i.label, d); el('b', i.value, d); const src = a.sources.find(s => s.id === i.source); const s = el('span', `${i.asOf}｜`, d); if (src) link(src.publisher, src.url, s); } }
  for (const [k, label] of Object.entries(pe.sectionLabels || {})) {
    const s = a.sections[k]; if (!s) continue;
    el('h3', label, parent);
    const f = el('div', undefined, parent, 'facts'); el('p', '已知事實', f, 'tag'); el('p', s.facts, f);
    const as = el('div', undefined, parent, 'assess'); el('p', '研判', as, 'tag'); el('p', s.assessment, as);
    srcLinks(a, s.sources, parent);
  }
  for (const c of a.caveats || []) el('p', `注意：${c}`, parent, 'row-note');
}
function renderMarkets(quotes, parent) {
  parent.replaceChildren();
  if (!quotes?.length) { el('p', '報價尚未取得。', parent, 'empty'); return; }
  const t = el('table', undefined, parent, 'mkt');
  for (const q of quotes) {
    if (!Number.isFinite(q.last)) continue;
    const tr = el('tr', undefined, t);
    const name = el('td', undefined, tr); link(q.name, q.url, name);
    el('td', q.last.toLocaleString('en-US', { minimumFractionDigits: q.dp, maximumFractionDigits: q.dp }), tr, 'num');
    el('td', `${q.pct >= 0 ? '+' : ''}${q.pct.toFixed(2)}%`, tr, `num ${q.dir * q.pct > 0 ? 'risk' : ''}`);
    el('td', q.pct5 == null ? '' : `5 日 ${q.pct5 >= 0 ? '+' : ''}${q.pct5.toFixed(1)}%`, tr, 'num');
    el('td', day(q.date), tr, 'num');
  }
  el('p', '橘色＝人民幣貶值或陸股、港股下跌。只作背景，不列入預警燈號。資料：Yahoo Finance，可能延遲。不構成投資建議。', parent, 'row-note');
}
function render(data) {
  renderAnalysis(data.politicalEconomy, document.getElementById('analysis'));
  renderMarkets(data.chinaQuotes, document.getElementById('markets'));
  const stats = document.getElementById('stats'); stats.replaceChildren();
  statCard('對台論調（近 14 天脅迫用語占比）', data.tone, stats); statCard('軍方高層人事（近 30 天）', data.personnel, stats);
  const tone = document.getElementById('tone'); tone.replaceChildren();
  toneChart(data.toneSeries || [], tone);
  el('h3', '近期脅迫類用語標題', tone); headlines(data.recentCoercive, tone, '近期沒有脅迫類用語的涉台標題。');
  el('h3', '近期和統類用語標題', tone); headlines(data.recentPeace, tone, '近期沒有和統類用語的涉台標題。');
  const src = el('details', undefined, tone); el('summary', '來源狀態', src); for (const [k, s] of Object.entries(data.sources || {})) { const p = el('p', `${s.status}｜`, src); link(s.publisher, s.url, p); p.append(` ${s.lastSuccess ? tpe(s.lastSuccess) : ''}${s.error ? `｜${s.error}` : ''}`); }
  const per = document.getElementById('personnel'); per.replaceChildren();
  el('p', '來源：中國軍網「軍委」「戰區」專欄的任免、審查調查標題。專欄沒有逐篇日期，以本站首次看到的時間為準。全國人大常委會的罷免公告由每週研究稿人工查核。', per, 'section-note');
  headlines(data.recentPersonnel, per, '近期沒有軍方高層人事或審查公告。');
  const brief = document.getElementById('brief'); brief.replaceChildren();
  const wb = data.weeklyBrief;
  if (wb && !wb.valid) el('p', `最新稿 ${wb.file} 未通過格式檢查，暫不展示：${(wb.errors || []).slice(0, 3).join('；')}`, brief, 'section-note');
  if (!data.briefs?.length) el('p', '尚無通過檢查的研究稿（排程每週一晚間產出）。', brief, 'empty');
  data.briefs?.forEach((b, i) => renderBrief(b, data.sectionLabels, brief, i === 0));
  const cal = document.getElementById('calendar'); cal.replaceChildren();
  const c = data.calendar || {};
  if (c.upcoming?.length) { el('h3', '有日期的事件', cal); const dl = el('dl', undefined, cal, 'cal'); for (const m of c.upcoming) { el('dt', `${m.date} ${m.name}`, dl); const dd = el('dd', `${m.note || ''}`, dl); if (typeof m.source === 'string') m.source = { url: m.source, publisher: '來源' }; if (m.source?.url) { dd.append('　'); link(`${m.source.publisher || '來源'} ↗`, m.source.url, dd); } else dd.append('（來源待每週研究補充）'); } }
  if (c.pendingDates?.length) { el('h3', '日期未公布', cal); const dl = el('dl', undefined, cal, 'cal'); for (const m of c.pendingDates) { el('dt', `${m.name}（${m.expected}）`, dl); el('dd', m.why, dl); } }
  if (c.regular?.length) { el('h3', '固定週期', cal); const dl = el('dl', undefined, cal, 'cal'); for (const r of c.regular) { el('dt', `${r.name}｜${r.when}`, dl); el('dd', r.why, dl); } }
  document.getElementById('note').textContent = data.note || '';
}
async function load() {
  const status = document.getElementById('status'); status.textContent = '讀取中…';
  try { const r = await fetch('/api/cn-politics', { cache: 'no-store' }); if (!r.ok) throw Error(`HTTP ${r.status}`); const data = await r.json(); render(data); status.textContent = `資料更新 ${tpe(data.lastSuccess)}（台北）｜查閱 ${new Date().toLocaleString('zh-TW')}`; }
  catch (e) { status.textContent = `讀取失敗：${e.message}`; }
}
document.getElementById('refresh').addEventListener('click', load); load();
