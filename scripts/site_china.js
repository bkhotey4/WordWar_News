// 公開站「中國政局」頁：官方對台論調走勢、軍方高層人事、政治行事曆、每週中國政局研究（最新與往期）。
// 資料來自 src/collectors/cn_politics.js 的快取與 research/cn_politics_weekly/ 的合格研究稿；本頁為靜態 HTML，不需要 JavaScript。
const STATE = { TRIGGERED: '觸發', CLEAR: '常態', UNKNOWN: '無法判定' };
const ACCESS = { FULL: '已讀全文', PARTIAL: '僅讀公開段落', ABSTRACT: '僅讀摘要' };

// 90 天：每日脅迫（紅）／和統（綠）標題數長條＋14 天脅迫占比折線（純 SVG）
function toneChartSvg(series, esc) {
  const W = 900, H = 240, L = 36, R = 40, T = 16, B = 28, n = Math.max(1, series.length);
  const maxN = Math.max(2, ...series.map(d => d.coerce + d.peace));
  const x = i => L + (i + 0.5) * (W - L - R) / n, bw = Math.max(2, (W - L - R) / n - 1.5);
  const yN = v => T + (H - T - B) * (1 - v / maxN), yS = s => T + (H - T - B) * (1 - s);
  const parts = [];
  for (const s of [0, 0.5, 1]) parts.push(`<line x1="${L}" x2="${W - R}" y1="${yS(s)}" y2="${yS(s)}" stroke="#22344a"/><text x="${W - R + 4}" y="${yS(s) + 4}">${s * 100}%</text>`);
  parts.push(`<text x="2" y="${yN(maxN) + 4}">${maxN}</text><text x="2" y="${yN(0)}">0</text>`);
  series.forEach((d, i) => { const cx = (x(i) - bw / 2).toFixed(1); if (d.peace) parts.push(`<rect x="${cx}" y="${yN(d.peace).toFixed(1)}" width="${bw.toFixed(1)}" height="${(yN(0) - yN(d.peace)).toFixed(1)}" fill="#91d5ab"/>`); if (d.coerce) parts.push(`<rect x="${cx}" y="${yN(d.peace + d.coerce).toFixed(1)}" width="${bw.toFixed(1)}" height="${(yN(d.peace) - yN(d.peace + d.coerce)).toFixed(1)}" fill="#f4a6a0"/>`); });
  const pts = series.map((d, i) => d.share14 === null ? null : `${x(i).toFixed(1)},${yS(d.share14).toFixed(1)}`).filter(Boolean);
  if (pts.length > 1) parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="#72d6e8" stroke-width="2"/>`);
  [0, Math.floor(n / 2), n - 1].forEach(i => { if (series[i]) parts.push(`<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(series[i].date.slice(5))}</text>`); });
  return `<svg class="cn-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="近 90 天官方涉台標題的脅迫與和統用語數量，以及 14 天脅迫占比">${parts.join('')}</svg>
<p class="cn-legend"><span><i style="background:#f4a6a0"></i>脅迫類用語標題（每日）</span><span><i style="background:#91d5ab"></i>和統類用語標題（每日）</span><span><i style="background:#72d6e8"></i>14 天脅迫占比（右軸）</span></p>`;
}
const headlineList = (list, { esc, link, md }, empty) => list?.length
  ? `<ul class="cn-list">${list.map(i => `<li>${link(i.url, i.title)}<span class="muted small">｜${esc(i.publisher)}｜${esc(md(i.publishedAt))}${i.dateBasis === 'FIRST_SEEN' ? '（本站首次看到）' : ''}</span></li>`).join('')}</ul>`
  : `<p class="muted">${esc(empty)}</p>`;
const statCard = (label, r, { esc, link }) => `<div class="cn-stat"><p class="muted small">${esc(label)}</p><p class="cn-state cn-${(r?.status || 'UNKNOWN').toLowerCase()}">${esc(STATE[r?.status] || STATE.UNKNOWN)}</p><p>${esc(r?.summary || '資料不足，無法判定。')}</p>${r?.sources?.[0] ? `<p class="small">${link(r.sources[0].url, r.sources[0].publisher)}</p>` : ''}</div>`;
function briefHtml(b, labels, { esc, link, tpe }, open) {
  const sec = Object.entries(labels).map(([k, label]) => { const s = b.sections[k]; if (!s) return ''; const srcs = s.sources.map(id => b.sources.find(x => x.id === id)).filter(Boolean).map(src => link(src.url, `${src.publisher}：${src.title.slice(0, 40)}（${ACCESS[src.access] || src.access}）`)).join('　'); return `<h4>${esc(label)}</h4><p>${esc(s.text)}</p><p class="small cn-srcs">${srcs}</p>`; }).join('');
  return `<details class="cn-brief"${open ? ' open' : ''}><summary><b>${esc(b.week)}｜${esc(b.title)}</b><span class="muted small">　寫於 ${esc(tpe(Date.parse(b.writtenAt)))}（台北）</span></summary><p>${esc(b.summary)}</p>${sec}${(b.caveats || []).map(c => `<p class="muted small">注意：${esc(c)}</p>`).join('')}</details>`;
}

// 長期分析（每季）：每節分「已知事實」與「研判」
function analysisHtml(pe, { esc, link, tpe }) {
  const warn = pe && !pe.newestValid ? `<p class="muted small">最新稿 ${esc(pe.newestFile)} 未通過格式檢查，暫不展示：${esc((pe.newestErrors || []).slice(0, 2).join('；'))}</p>` : '';
  const a = pe?.analysis;
  if (!a) return `${warn}<p class="muted">尚無通過檢查的長期分析（每季初產出）。</p>`;
  const src = id => a.sources.find(s => s.id === id);
  const ind = a.indicators?.length ? `<div class="cn-ind">${a.indicators.map(i => { const s = src(i.source); return `<div><span>${esc(i.label)}</span><b>${esc(i.value)}</b><span>${esc(i.asOf)}｜${s ? link(s.url, s.publisher) : ''}</span></div>`; }).join('')}</div>` : '';
  const secs = Object.entries(pe.sectionLabels || {}).map(([k, label]) => { const s = a.sections[k]; if (!s) return ''; const srcs = s.sources.map(src).filter(Boolean).map(x => link(x.url, `${x.publisher}：${x.title.slice(0, 40)}（${ACCESS[x.access] || x.access}）`)).join('　');
    return `<h3>${esc(label)}</h3><div class="cn-facts"><p class="cn-tag">已知事實</p><p>${esc(s.facts)}</p></div><div class="cn-assess"><p class="cn-tag">研判</p><p>${esc(s.assessment)}</p></div><p class="small cn-srcs">${srcs}</p>`; }).join('');
  return `${warn}<h3>${esc(a.quarter)}｜${esc(a.title)}</h3><p class="muted small">寫於 ${esc(tpe(Date.parse(a.writtenAt)))}（台北）</p><p>${esc(a.summary)}</p>${ind}${secs}${(a.caveats || []).map(c => `<p class="muted small">注意：${esc(c)}</p>`).join('')}`;
}

function chinaPage({ esc, link, tpe, md, now }) {
  const panel = require('../src/collectors/cn_politics').cnPoliticsPanel(undefined, now);
  const briefs = require('../src/cn_politics_brief');
  const latest = briefs.latestBrief(undefined, now), valid = briefs.listBriefs(undefined, now), pe = briefs.latestAnalysis(undefined, now);
  let marketsHtml = '';
  try { const M = require('../src/collectors/markets'); marketsHtml = M.marketPanel(M.readCache(), esc, { panel: 'china' }); } catch { /* 無報價 */ }
  const cal = panel.calendar || {};
  return `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>中國政治與經濟｜WorldWar 戰況情報站</title><meta name="description" content="中國政治與經濟的每季長期分析、官方對台論調走勢、軍方高層人事與整肅、人民幣與陸港股、政治行事曆，以及每週附來源的中國政局研究。">
<link rel="canonical" href="https://bkhotey4.github.io/wordwar-intel/china.html"><link rel="stylesheet" href="style.css">
<style>.cn-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0}.cn-stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.cn-state{font-weight:700;font-size:1.3rem;margin:4px 0}.cn-triggered{color:#f2cd7b}.cn-clear{color:#91d5ab}.cn-unknown{color:var(--dim)}
.cn-chart{width:100%;height:auto;background:var(--panel);border:1px solid var(--line);border-radius:10px}.cn-chart text{font-size:11px;fill:var(--dim);font-family:monospace}.cn-legend{display:flex;gap:16px;flex-wrap:wrap;font-size:.82rem;color:var(--dim)}.cn-legend i{display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:4px;vertical-align:-2px}
.cn-list{list-style:none;padding:0;margin:0}.cn-list li{padding:8px 0;border-bottom:1px solid var(--line)}.cn-brief{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin:10px 0}.cn-brief summary{cursor:pointer}.cn-brief h4{color:var(--cyan);margin:12px 0 4px}.cn-srcs a{margin-right:10px}
.cn-cal dt{font-weight:600;margin-top:8px}.cn-cal dd{margin:2px 0 0;color:var(--dim);font-size:.9rem}@media(max-width:700px){.cn-stats{grid-template-columns:1fr}}
.cn-pe h3{color:var(--cyan);margin:16px 0 6px}.cn-facts{border-left:3px solid #2c6d58;padding-left:12px}.cn-assess{border-left:3px solid #d9bc6a;padding-left:12px}.cn-tag{font-size:.75rem;color:var(--dim);margin:0}
.cn-ind{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin:12px 0}.cn-ind div{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px}.cn-ind b{display:block;font-size:1.25rem}.cn-ind span{font-size:.78rem;color:var(--dim)}
${require('../src/collectors/markets').CSS}</style></head><body>
<header class="top"><div class="brand"><h1>中國政治與經濟</h1><p>長期分析、對台論調、軍方人事、陸港市場、行事曆與每週研究｜資料更新 ${esc(panel.lastSuccess ? tpe(Date.parse(panel.lastSuccess)) : '—')}（台北）</p></div><nav><a href="index.html">← 回首頁</a><a href="journals.html">期刊新文章</a><a href="timeline.html">事件時間軸</a></nav></header>
<main class="narrow">
<p class="notice small">本頁提供背景與對解放軍能力、意圖的判斷，不是行動時間的預測。分析中「已知事實」與「研判」分開寫；論調與人事只計官方標題用語與公告，不解讀意圖；市場與行事曆只作背景，不改變預警燈號。</p>
<section class="cn-pe"><h2>長期分析（每季）</h2>${analysisHtml(pe, { esc, link, tpe })}</section>
<h2>人民幣與陸港股（背景）</h2>${marketsHtml || '<p class="muted">報價尚未取得。</p>'}
<div class="cn-stats">${statCard('對台論調（近 14 天脅迫用語占比）', panel.tone, { esc, link })}${statCard('軍方高層人事（近 30 天）', panel.personnel, { esc, link })}</div>
<h2>官方對台論調（近 90 天）</h2>
<p class="muted small">來源：中國台灣網（國台辦官方入口）時政要聞與評論、新華網台灣頻道的涉台標題。脅迫類：武力、懲戒、分裂、演習、制裁等；和統類：和平統一、融合發展、交流、同胞等。</p>
${toneChartSvg(panel.toneSeries || [], esc)}
<h3>近期脅迫類用語標題</h3>${headlineList(panel.recentCoercive, { esc, link, md }, '近期沒有脅迫類用語的涉台標題。')}
<h3>近期和統類用語標題</h3>${headlineList(panel.recentPeace, { esc, link, md }, '近期沒有和統類用語的涉台標題。')}
<h2>軍方高層人事與整肅</h2>
<p class="muted small">來源：中國軍網「軍委」「戰區」專欄的任免、審查調查標題；專欄無逐篇日期，以本站首次看到的時間為準。全國人大常委會的罷免公告由每週研究人工查核。</p>
${headlineList(panel.recentPersonnel, { esc, link, md }, '近期沒有軍方高層人事或審查公告。')}
<h2>每週中國政局研究</h2>
${latest && !latest.valid ? `<p class="muted small">最新稿 ${esc(latest.file)} 未通過格式檢查，暫不展示：${esc((latest.errors || []).slice(0, 2).join('；'))}</p>` : ''}
${valid.length ? valid.map((b, i) => briefHtml(b, briefs.SECTIONS, { esc, link, tpe }, i === 0)).join('') : '<p class="muted">尚無通過檢查的研究稿（每週一晚間產出）。</p>'}
<h2>政治行事曆（背景）</h2>
${cal.upcoming?.length ? `<h3>有日期的事件</h3><dl class="cn-cal">${cal.upcoming.map(m => typeof m.source === 'string' ? { ...m, source: { url: m.source, publisher: '來源' } } : m).map(m => `<dt>${esc(m.date)} ${esc(m.name)}</dt><dd>${esc(m.note || '')}${m.source?.url ? '　' + link(m.source.url, m.source.publisher || '來源') : '（來源待每週研究補充）'}</dd>`).join('')}</dl>` : ''}
${cal.pendingDates?.length ? `<h3>日期未公布</h3><dl class="cn-cal">${cal.pendingDates.map(m => `<dt>${esc(m.name)}（${esc(m.expected)}）</dt><dd>${esc(m.why)}</dd>`).join('')}</dl>` : ''}
${cal.regular?.length ? `<h3>固定週期</h3><dl class="cn-cal">${cal.regular.map(r => `<dt>${esc(r.name)}｜${esc(r.when)}</dt><dd>${esc(r.why)}</dd>`).join('')}</dl>` : ''}
<p class="muted small">${esc(panel.note)}｜本頁產生 ${esc(tpe(now))}（台北）。本站為個人整理，非官方資訊。</p>
</main></body></html>`;
}

// 首頁台海戰區側欄：中國政治與經濟摘要（最新每週稿與長期分析標題）＋連結
function chinaBox({ esc, now = Date.now() }) {
  const briefs = require('../src/cn_politics_brief');
  const w = briefs.listBriefs(undefined, now)[0], pe = briefs.latestAnalysis(undefined, now)?.analysis;
  if (!w && !pe) return '';
  const cut = (s, n) => s.length > n ? `${s.slice(0, n - 1)}…` : s;
  return `<div class="cc-box"><h2>🏛️ 中國政治與經濟 <span>CHINA</span></h2>
    ${w ? `<div class="cc-tt"><p class="cc-tt-m">每週研究｜${esc(w.week)}</p><h4>${esc(w.title)}</h4><p>${esc(cut(w.summary, 140))}</p></div>` : ''}
    ${pe ? `<div class="cc-tt"><p class="cc-tt-m">長期分析｜${esc(pe.quarter)}</p><h4>${esc(pe.title)}</h4></div>` : ''}
    <p class="cc-tt-more"><a href="china.html">看中國政治與經濟 →</a></p></div>`;
}

module.exports = { chinaPage, chinaBox, toneChartSvg };
