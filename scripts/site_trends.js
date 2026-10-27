// 公開網頁的「今日重點」、30 天警戒色帶、台海共機架次走勢圖與報導彙整頁。
// 圖表以內嵌 SVG 產生（不需外部套件）；每個色塊與資料點都有 <title> 提示，並附表格版本。
const fs = require('fs');
const path = require('path');

const DAY = 86400_000, HOUR = 3600_000;
const LEVEL = { 1: ['#22c55e', '常態'], 2: ['#eab308', '升溫'], 3: ['#f97316', '高度警戒'], 4: ['#ef4444', '危機'] };
const tpeDate = ms => new Date(ms + 8 * HOUR).toISOString().slice(0, 10);
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };

function todaySummary({ board, twFeed, reports, names, esc, link, md }) {
  const ranked = board.theaters.filter(t => t.level).sort((a, b) => b.level - a.level);
  const top = ranked[0];
  const lead = top
    ? `目前最高：<b>${esc(top.name)}</b> 第 ${top.level} 級「${esc(top.levelName)}」— ${esc(top.reason)}${top.triggered?.[0] ? `；主要觸發：${esc(top.triggered[0].name)}` : ''}。`
    : '各戰區資料不足，暫無法判定等級。';
  const o = twFeed?.latest?.observation;
  const kpis = o ? `<div class="kpis">
    <div class="kpi"><span>${esc(md(o.periodEnd))} 共機</span><b>${o.aircraft?.value ?? '—'}</b><span>架次（國防部）</span></div>
    <div class="kpi"><span>越中線／進空域</span><b>${o.crossingOrAirspace?.value ?? '—'}</b><span>架次</span></div>
    <div class="kpi"><span>共艦</span><b>${o.ships?.value ?? '—'}</b><span>艘</span></div>
    <div class="kpi"><span>公務船</span><b>${o.officialVessels?.value ?? '—'}</b><span>艘</span></div></div>` : '';
  const latest = (reports || [])[0];
  return {
    lead: `<p class="lead">${lead}</p>${latest ? `<p class="muted">最新報導：<a href="#r-${esc(latest.id)}">${esc(latest.title)}</a></p>` : ''}`,
    kpis: kpis ? `${kpis}${twFeed?.latest?.url ? `<p class="muted small">來源：${link(twFeed.latest.url, '國防部臺海周邊動態')}</p>` : ''}` : ''
  };
}

// 每天取當天最高等級；沒有紀錄的日子為灰色「無資料」
function dailyLevels(history, theater, now, days = 30) {
  const byDay = new Map();
  for (const s of history.snapshots || []) {
    if (s.theater !== theater) continue;
    const lv = s.level ?? s.rawLevel; if (!Number.isInteger(lv)) continue;
    const d = tpeDate(Date.parse(s.at));
    byDay.set(d, Math.max(byDay.get(d) || 0, lv));
  }
  return Array.from({ length: days }, (_, i) => { const d = tpeDate(now - (days - 1 - i) * DAY); return { date: d, level: byDay.get(d) || null }; });
}

const SHORT = { taiwan_strait: '台海', iran_gulf: '美伊與荷莫茲', europe_security: '歐洲與北約', ukraine_front: '烏俄', korea_peninsula: '朝鮮半島', south_china_sea: '南海', middle_east: '以巴與紅海' };
function levelStrips(history, theaters, now, esc) {
  // 只畫有紀錄以來的天數（至少 14 天、最多 30 天），避免整排灰色
  const firstIdx = Math.min(...theaters.map(([id]) => { const d = dailyLevels(history, id, now); const i = d.findIndex(x => x.level); return i < 0 ? 30 : i; }));
  const span = Math.max(14, 30 - Math.min(firstIdx, 30));
  const rows = theaters.map(([id, rawName]) => {
    const name = SHORT[id] || rawName;
    const days = dailyLevels(history, id, now, span);
    const cells = days.map(d => {
      const [c, n] = LEVEL[d.level] || ['#334155', '無資料'];
      return `<div class="cell" style="background:${c}" title="${d.date.slice(5).replace('-', '/')}：${d.level ? `第 ${d.level} 級 ${n}` : n}">${d.level || ''}</div>`;
    }).join('');
    return `<div class="strip"><span class="nm">${esc(name)}</span><div class="cells" style="grid-template-columns:repeat(${span},1fr)" role="img" aria-label="${esc(name)} 每日最高警戒等級：${days.map(d => `${d.date.slice(5)} ${d.level || '無資料'}`).join('、')}">${cells}</div></div>`;
  }).join('');
  const first = tpeDate(now - (span - 1) * DAY).slice(5).replace('-', '/'), last = tpeDate(now).slice(5).replace('-', '/');
  return `<h3>每日最高警戒等級（${first}–${last}）</h3><div class="strips">${rows}</div>
    <div class="legend">${Object.entries(LEVEL).map(([k, [c, n]]) => `<span><i style="background:${c}"></i>${k} ${n}</span>`).join('')}<span><i style="background:#334155"></i>無資料（系統 9/29 起記錄）</span></div>`;
}

function niceMax(v) { if (v <= 10) return 10; const p = 10 ** Math.floor(Math.log10(v)); return Math.ceil(v / p) * p; }

function aircraftChart(twFeed, esc, md) {
  const pts = (twFeed?.history || []).filter(h => h.observation?.aircraft?.value != null && h.observation?.periodEnd)
    .map(h => ({ t: h.observation.periodEnd, v: h.observation.aircraft.value, url: h.url }))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t)).slice(-30);
  if (pts.length < 2) return '<p class="muted">台海共機架次歷史資料不足。</p>';
  const p95 = (twFeed?.assessment?.indicators || []).find(i => i.metric === 'aircraft')?.historicalP95;
  const W = 900, H = 240, L = 44, R = 16, T = 16, B = 34;
  const max = niceMax(Math.max(...pts.map(p => p.v), p95 || 0));
  const x = i => L + (W - L - R) * i / (pts.length - 1), y = v => T + (H - T - B) * (1 - v / max);
  const ticks = [0, max / 2, max].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#1f3a5a" stroke-width="1"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="#93a9c2">${v}</text>`).join('');
  const xl = pts.map((p, i) => ((i % 7 === 0 && pts.length - 1 - i >= 3) || i === pts.length - 1) ? `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" font-size="12" fill="#93a9c2">${esc(md(p.t))}</text>` : '').join('');
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const dots = pts.map((p, i) => `<g><title>${md(p.t)}：共機 ${p.v} 架次</title><circle cx="${x(i)}" cy="${y(p.v)}" r="12" fill="transparent"/><circle cx="${x(i)}" cy="${y(p.v)}" r="4" fill="#00e5ff" stroke="#0d1b2e" stroke-width="2"/></g>`).join('');
  const lastP = pts[pts.length - 1], maxP = pts.reduce((a, b) => (b.v > a.v ? b : a));
  const label = (p, i, txt) => `<text x="${i === pts.length - 1 ? x(i) - 8 : Math.min(x(i) + 8, W - R - 70)}" y="${y(p.v) - 12}"${i === pts.length - 1 ? ' text-anchor="end"' : ''} font-size="13" font-weight="700" fill="#e8f1fb">${txt}</text>`;
  const p95Line = p95 ? `<line x1="${L}" x2="${W - R}" y1="${y(p95)}" y2="${y(p95)}" stroke="#93a9c2" stroke-width="1.5" stroke-dasharray="6 5"/><text x="${W - R}" y="${y(p95) - 6}" text-anchor="end" font-size="12" fill="#93a9c2">60 日 P95：${p95}</text>` : '';
  const table = pts.slice().reverse().map(p => `<tr><td>${esc(md(p.t))}</td><td>${p.v}</td></tr>`).join('');
  return `<h3>台海共機架次（國防部每日通報，近 ${pts.length} 筆）</h3>
    <div class="chart"><div class="scroll"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="台海共機架次走勢">${ticks}${p95Line}${xl}
      <polyline points="${line}" fill="none" stroke="#00e5ff" stroke-width="2" stroke-linejoin="round"/>${dots}
      ${label(maxP, pts.indexOf(maxP), `最高 ${maxP.v}`)}${maxP !== lastP ? label(lastP, pts.length - 1, `最新 ${lastP.v}`) : ''}</svg></div>
    <details><summary>表格</summary><table><tr><th>日期</th><th>共機架次</th></tr>${table}</table></details></div>
    <p class="muted">虛線為過去 60 天的第 95 百分位，超過即觸發預警指標；單日偏高常見於聯合戰備警巡，不代表戰爭即將發生。</p>`;
}

function archivePage({ root, names, esc, link, md, tpe, now }) {
  const store = readJson(path.join(root, 'research', 'reports.json'), { reports: [] });
  const docs = new Map((readJson(path.join(root, 'research', 'sources.json'), { documents: [] }).documents || []).map(d => [d.id, d]));
  const list = (store.reports || []).filter(r => r.reviewed && !r.supersededBy && Number.isFinite(Date.parse(r.asOf)))
    .sort((a, b) => Date.parse(b.asOf) - Date.parse(a.asOf)).slice(0, 30);
  const theaterName = r => names[r.theater] || (r.coverage || r.theater === 'global' ? '全球' : r.theater);
  const theatersUsed = [...new Set(list.map(theaterName))];
  const items = list.map(r => {
    const refs = (r.basis || []).map(b => docs.get(b.id)).filter(Boolean);
    const sections = (r.sections || []).map(s => `<h4><span class="kind k-${esc(s.kind)}">${{ REPORTED: '報導', ANALYSIS: '研判', UNCERTAIN: '待證' }[s.kind] || '重點'}</span>${esc(s.label)}</h4><p>${esc(s.text)}</p>`).join('');
    const fresh = now - Date.parse(r.asOf) <= 48 * HOUR;
    return `<article class="report" id="r-${esc(r.id)}" data-theater="${esc(theaterName(r))}" data-text="${esc((r.title + ' ' + (r.sections || []).map(s => s.label + s.text).join(' ')).toLowerCase())}">
      <p class="meta">${esc(theaterName(r))}｜資料截至 ${esc(tpe(Date.parse(r.asOf)))}${fresh ? '' : '｜<span title="超過 48 小時，僅供回顧">已過時效</span>'}</p>
      <h3>${esc(r.title)}</h3>
      <details><summary>內容與來源</summary>${sections}<ol class="refs">${refs.map((d, i) => `<li>[${i + 1}] ${link(d.url, d.publisher)}｜發布 ${esc(md(d.publishedAt))}</li>`).join('')}</ol></details>
    </article>`;
  }).join('\n');
  const html = `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>報導彙整｜WorldWar 戰況情報站</title><meta name="description" content="WorldWar 戰況情報站過去 30 篇查核報導，可依戰區篩選與搜尋。">
<link rel="canonical" href="https://bkhotey4.github.io/wordwar-intel/archive.html"><link rel="stylesheet" href="style.css"></head><body>
<header class="top"><h1>報導彙整</h1><p>過去 ${list.length} 篇查核報導｜最後更新 ${esc(tpe(now))}（台北）</p><nav><a href="index.html">← 回首頁</a></nav></header>
<main>
<div class="filters"><input id="q" type="search" placeholder="搜尋關鍵字，例如 荷莫茲、共機、基輔" aria-label="搜尋報導">
<div class="chips"><button class="chip on" data-t="">全部</button>${theatersUsed.map(t => `<button class="chip" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
<p class="muted" id="count"></p></div>
${items || '<p class="muted">目前沒有報導。</p>'}
</main>
<footer><p>超過 48 小時的報導僅供回顧，可能已有新進展；各篇附原文連結。本站為個人整理，非官方資訊。</p></footer>
<style>.filters{position:sticky;top:0;background:var(--bg);padding:10px 0;z-index:1}#q{width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--text);font-size:16px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.chip{background:transparent;color:var(--dim);border:1px solid var(--line);border-radius:999px;padding:4px 12px;cursor:pointer;font:inherit}.chip.on{background:var(--cyan);color:#0b1220;border-color:var(--cyan);font-weight:700}</style>
<script>
const q=document.getElementById('q'),chips=[...document.querySelectorAll('.chip')],items=[...document.querySelectorAll('article.report')],count=document.getElementById('count');let th='';
function apply(){const k=q.value.trim().toLowerCase();let n=0;for(const a of items){const ok=(!th||a.dataset.theater===th)&&(!k||a.dataset.text.includes(k));a.style.display=ok?'':'none';if(ok)n++;}count.textContent='顯示 '+n+' 篇';}
q.addEventListener('input',apply);chips.forEach(c=>c.addEventListener('click',()=>{chips.forEach(x=>x.classList.remove('on'));c.classList.add('on');th=c.dataset.t;apply();}));apply();
</script></body></html>`;
  return { html, count: list.length };
}

// RSS 2.0：過去 30 篇報導；時效內的連到單篇頁，其餘連到彙整頁對應位置
function rssFeed({ root, names, site, active, now }) {
  const x = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const store = readJson(path.join(root, 'research', 'reports.json'), { reports: [] });
  const list = (store.reports || []).filter(r => r.reviewed && !r.supersededBy && Number.isFinite(Date.parse(r.asOf)))
    .sort((a, b) => Date.parse(b.asOf) - Date.parse(a.asOf)).slice(0, 30);
  const items = list.map(r => {
    const url = active.has(r.id) ? `${site}r/${r.id}.html` : `${site}archive.html#r-${r.id}`;
    const body = (r.sections || []).map(s => `【${s.label}】${s.text}`).join('\n');
    const pub = new Date(Date.parse(r.generatedAt) || Date.parse(r.asOf)).toUTCString();
    return `<item><title>${x(r.title)}</title><link>${x(url)}</link><guid isPermaLink="false">${x(r.id)}</guid><pubDate>${pub}</pubDate><category>${x(names[r.theater] || (r.theater === 'global' ? '全球' : r.theater))}</category><description>${x(body.slice(0, 1500))}</description></item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>WorldWar 戰況情報站</title><link>${x(site)}</link><description>台海、美伊、歐洲與北約東翼、烏俄的公開來源查核報導（試行中，非官方）。</description><language>zh-TW</language><lastBuildDate>${new Date(now).toUTCString()}</lastBuildDate>\n${items}\n</channel></rss>\n`;
}

module.exports = { rssFeed, todaySummary, dailyLevels, levelStrips, aircraftChart, archivePage };
