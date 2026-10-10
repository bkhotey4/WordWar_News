// 「戰情指揮中心」版面（G）：每個戰區一頁 — 戰區大圖與標題、軍事／外交／情報／政治四個觀點（現況→預判→下一個觀察點）、
// 右側衛星影像前後期判讀與各方觀點。內容來自 research/beat_briefs.json（記者式整理）、時間軸事件（備援）與 site_imint。
const BEAT = require('./site_beats');
const IM = require('./site_imint');

const EN = { taiwan_strait: 'TAIWAN STRAIT', korea_peninsula: 'KOREAN PENINSULA', south_china_sea: 'SOUTH CHINA SEA', iran_gulf: 'IRAN · HORMUZ', middle_east: 'LEVANT · RED SEA', europe_security: 'NATO EASTERN FLANK', ukraine_front: 'UKRAINE' };
const PERSP = [
  { key: 'MIL', name: '軍事', icon: '🛡️', color: '#f59e0b', beats: ['MIL'], events: 'MIL' },
  { key: 'DIP', name: '外交', icon: '🏛️', color: '#38bdf8', beats: ['DIP'], events: 'DIP' },
  { key: 'INT', name: '情報', icon: '🛰️', color: '#a78bfa', beats: ['INFO', 'CYBER'], events: null },
  { key: 'POL', name: '政治', icon: '📜', color: '#f472b6', beats: ['POL'], events: 'POL' }
];
const TANK = /CSIS|RAND|Brookings|CNAS|Hudson|Heritage|AEI|ISW|Stimson|Carnegie|CFR|38 North|War on the Rocks|Critical Threats|CTP|防衛研究所|NIDS|國際問題研究所|JIIA|笹川|PHP|中曽根|IISS|Chatham|ECFR/i;

function perspective(p, tb, t, ctx) {
  const { esc } = ctx.helpers;
  const items = p.beats.map(b => tb[b]).filter(Boolean);
  const head = `<header><span class="cc-ic">${p.icon}</span><h3>${p.name}</h3>${items.length ? `<em>${items.reduce((n, i) => n + i.sources.length, 0)} 個來源</em>` : ''}</header>`;
  if (!items.length) {
    const ev = p.events ? ctx.BR.eventCards(ctx.events, t.id, p.events, ctx.helpers, { now: ctx.now }) : '';
    return `<section class="cc-pc" style="--c:${p.color}">${head}<p class="cc-lbl">▍現況</p>${ev || '<p class="cc-none">近期沒有整理或經確認的事件</p>'}</section>`;
  }
  const main = items[0];
  const outlook = items.find(i => i.outlook)?.outlook;
  const watch = items.find(i => i.watch)?.watch;
  const tanks = [...new Set(items.flatMap(i => (i.stances || []).map(s => s.actor)).filter(a => TANK.test(a)))];
  const more = [
    main.points.length > 3 ? `<ul>${main.points.slice(3).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '',
    main.context ? `<p><b>背景</b>：${esc(main.context)}</p>` : ''
  ].join('');
  return `<section class="cc-pc" style="--c:${p.color}">${head}
    <p class="cc-lbl">▍現況｜${esc(main.date.slice(5).replace('-', '/'))}</p><h4>${esc(main.title)}</h4><ul>${main.points.slice(0, 3).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    ${more ? `<details class="cc-more"><summary>展開完整分析</summary>${more}</details>` : ''}
    <p class="cc-lbl">▍預判</p>${outlook ? `<p class="cc-fc">${esc(outlook)}</p>` : '<p class="cc-fc cc-dim">本線尚無機構研判</p>'}
    ${watch ? `<p class="cc-lbl">▍下一個觀察點</p><p class="cc-wt">◎ ${esc(watch)}</p>` : ''}
    ${tanks.length ? `<p class="cc-tks">${tanks.map(a => `<span>${esc(a)}</span>`).join('')}</p>` : ''}
    ${items.slice(1).map(i => `<p class="cc-ex">＋ ${esc(BEAT.BEATS[i.beat])}：${esc(i.title)}</p>`).join('')}
    <p class="cc-src">${items.flatMap(i => i.sources).slice(0, 4).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.publisher)}</a>`).join('・')}</p></section>`;
}

function stancesBox(tb, { esc }) {
  const all = Object.values(tb).flatMap(i => (i.stances || []).map(s => ({ ...s, beat: i.beat })));
  const list = [...all.filter(s => TANK.test(s.actor)), ...all.filter(s => !TANK.test(s.actor))].slice(0, 7);
  if (!list.length) return '';
  return `<div class="cc-box"><h2>🧭 各方觀點 <span>STANCES</span></h2>${list.map(s => `<div class="cc-st${TANK.test(s.actor) ? ' tank' : ''}"><b>${esc(s.actor)}</b><small>${esc(BEAT.BEATS[s.beat])}</small><p>${esc(s.view)}</p></div>`).join('')}</div>`;
}

function imintBox(list, helpers) {
  if (!list?.length) return `<div class="cc-box"><h2>🛰️ 衛星影像判讀 <span>IMINT</span></h2><p class="cc-none">此戰區尚未設定衛星觀測點。</p></div>`;
  return `<div class="cc-box"><h2>🛰️ 衛星影像判讀 <span>IMINT</span></h2>${list.map(p => IM.panelHtml(p, helpers)).join('')}</div>`;
}

// 智庫研判（期刊中文導讀裡標到此戰區、30 天內的文章）：用重點與研判呈現，不需要點連結
function thinkBox(theater, ctx) {
  const { esc } = ctx.helpers, now = ctx.now;
  const list = (ctx.digest || []).filter(it => it.theater === theater && now - Date.parse(it.publishedAt) <= 30 * 86400_000).slice(0, 3);
  if (!list.length) return '';
  return `<div class="cc-box"><h2>📚 智庫研判 <span>RESEARCH</span></h2>${list.map(it => `<div class="cc-tt"><p class="cc-tt-m">${esc(it.publication)}｜${esc(it.publishedAt.slice(5, 10).replace('-', '/'))}</p><h4>${esc(it.titleZh)}</h4>
    ${it.keyPoints?.length ? `<ul>${it.keyPoints.slice(0, 3).map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : `<p>${esc(it.summary.length > 150 ? it.summary.slice(0, 148) + '…' : it.summary)}</p>`}
    ${it.outlook ? `<p class="cc-tt-o">研判：${esc(it.outlook)}</p>` : ''}<p class="cc-tt-tw">對台灣：${esc(it.taiwanRelevance)}</p></div>`).join('')}<p class="cc-tt-more"><a href="digest.html">看全部智庫導讀 →</a></p></div>`;
}

// 智庫研究導讀區（放在戰區面板下方）：最新 6 篇完整導讀卡
function thinkSection(ctx) {
  const list = (ctx.digest || []).slice(0, 6);
  if (!list.length || !ctx.jcard) return '';
  return `<section class="cc-think" id="research"><h2 class="cc-h">📚 國防・外交・經濟智庫研究導讀</h2><p class="cc-dim">美、日、台與國際智庫及期刊的最新研究，用中文整理論點、證據與作者研判，不用點進原文也能看懂。</p><div class="jgrid">${list.map(ctx.jcard).join('')}</div><p><a href="digest.html">看每週導讀彙整 →</a>｜<a href="journals.html">近 7 天智庫與期刊新文章清單 →</a></p></section>`;
}

// 主戰區面板：回傳 [{ id, name, level, color, html }]
function theaterPanels(ctx) {
  const { board, order, level, img, beats, imint, helpers, shortName } = ctx;
  const { esc } = helpers;
  return order.map(id => board.theaters.find(t => t.id === id)).filter(Boolean).map(t => {
    const [color, lname] = level[t.level] || ['#94a3b8', '無法判定'];
    const tb = beats[t.id] || {};
    const lead = ['MIL', 'POL', 'DIP', 'INFO', 'CYBER'].map(b => tb[b]).filter(Boolean);
    const headline = lead[0]?.title || `${t.name}：${t.triggered[0] ? shortName(t.triggered[0].name) : '目前沒有指標超過門檻'}`;
    const sub = lead.slice(1, 3).map(i => i.title).join('；') || t.triggered.slice(0, 3).map(i => shortName(i.name)).join('、');
    const pic = img(t.id);
    const extra = BEAT.extraRow(Object.fromEntries(Object.entries(tb).filter(([k]) => k === 'ECON' || k === 'TECH')), helpers);
    const html = `<section class="cc-panel" id="cc-${t.id}" style="--lv:${color}"><div class="cc-main">
      <div class="cc-hero">${pic ? `<img src="${pic}" alt="${esc(t.name)} 戰場圖">` : ''}<div class="cc-scan"></div><div class="cc-ov">
        <span class="cc-tag">THEATER ▸ ${EN[t.id] || t.id.toUpperCase()} ▸ LEVEL ${t.level || '—'} ${esc((t.levelName || lname).replace(/（.*）/, ''))}</span>
        <h2>${esc(headline)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}${pic ? `<a class="cc-zoom" href="${pic}" target="_blank" rel="noopener">放大戰場圖 ↗</a>` : ''}</div></div>
      <div class="cc-grid4">${PERSP.map(p => perspective(p, tb, t, ctx)).join('')}</div>${extra}</div>
      <aside class="cc-side">${imintBox(imint[t.id], helpers)}${thinkBox(t.id, ctx)}${stancesBox(tb, helpers)}</aside></section>`;
    return { id: t.id, name: t.name, level: t.level, color, html };
  });
}

// 熱點戰區與全球議題（沒有燈號）：記者整理＋衛星影像
function hotspotsPanel(ctx) {
  const { beats, imint, helpers } = ctx;
  const ids = [...Object.keys(BEAT.HOTSPOTS), 'global'].filter(id => beats[id] || imint[id]?.length);
  if (!ids.length) return '';
  return ids.map(id => {
    const b = beats[id] || {};
    const cards = ['SUM', ...BEAT.MAIN_BEATS, ...BEAT.EXTRA_BEATS].filter(k => b[k]).map(k => BEAT.beatHtml(b[k], helpers, { showBeat: true })).join('');
    return `<section class="cc-panel cc-hotp"><div class="cc-main"><h2 class="cc-h">${helpers.esc(BEAT.THEATERS[id])}</h2><div class="beat-grid">${cards || '<p class="cc-none">近期沒有整理</p>'}</div></div>
      ${imint[id]?.length ? `<aside class="cc-side">${imintBox(imint[id], helpers)}</aside>` : ''}</section>`;
  }).join('');
}

const CSS = `.cc{--pn:rgba(13,27,46,.78);--ln:rgba(56,189,248,.22);--cy:#22d3ee;position:relative}
.cc:before{content:"";position:fixed;inset:0;z-index:-1;background:radial-gradient(circle at 15% -10%,rgba(14,58,99,.55) 0,transparent 45%),linear-gradient(rgba(34,211,238,.045) 1px,transparent 1px) 0 0/40px 40px,linear-gradient(90deg,rgba(34,211,238,.045) 1px,transparent 1px) 0 0/40px 40px;pointer-events:none}
.cc-radio{position:absolute;opacity:0;pointer-events:none}.cc-tp{display:none}
.cc-gauges{position:sticky;top:0;z-index:6;display:flex;gap:8px;overflow-x:auto;padding:10px 0 12px;background:rgba(3,7,18,.86);backdrop-filter:blur(8px);scrollbar-width:thin}
.cc-g{flex:1 0 128px;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px 11px;border:1px solid var(--ln);border-radius:9px;background:var(--pn);cursor:pointer;color:var(--text)}
.cc-g span{font-size:.88em;white-space:nowrap}.cc-g b{font:700 1.35em ui-monospace,Consolas,monospace;color:var(--c);text-shadow:0 0 12px var(--c)}.cc-g i{position:absolute;left:0;bottom:0;height:3px;background:var(--c);box-shadow:0 0 8px var(--c)}
.cc-live{display:inline-flex;align-items:center;gap:6px;color:#f87171;font:700 .78em ui-monospace,monospace;margin:0 0 6px}.cc-live:before{content:"";width:8px;height:8px;border-radius:50%;background:#ef4444;box-shadow:0 0 10px #ef4444;animation:ccp 1.6s infinite}
@keyframes ccp{50%{opacity:.3}}
.cc-g.hot3{border-color:var(--c);box-shadow:0 0 14px color-mix(in srgb,var(--c) 55%,transparent);animation:cch 2.4s ease-in-out infinite}.cc-g.hot4{border:2px solid var(--c);background:color-mix(in srgb,var(--c) 22%,var(--pn));animation:cch 1.2s ease-in-out infinite}
@keyframes cch{50%{box-shadow:0 0 26px var(--c)}}@media (prefers-reduced-motion:reduce){.cc-g.hot3,.cc-g.hot4,.cc-scan,.cc-live:before{animation:none}}
.cc-panel{display:grid;grid-template-columns:minmax(0,1fr) 370px;gap:16px;align-items:start}
.cc-hero{position:relative;height:270px;border:1px solid var(--ln);border-radius:12px;overflow:hidden;background:#000}.cc-hero img{width:100%;height:100%;object-fit:cover;opacity:.55}
.cc-scan{position:absolute;left:0;right:0;height:2px;top:0;background:linear-gradient(90deg,transparent,var(--cy),transparent);opacity:.55;animation:ccs 6s linear infinite}@keyframes ccs{to{top:100%}}
.cc-ov{position:absolute;inset:0;padding:16px 20px;display:flex;flex-direction:column;justify-content:flex-end;background:linear-gradient(transparent 25%,rgba(2,6,23,.96))}
.cc-ov h2{margin:4px 0 2px;font-size:1.55em;line-height:1.3;border:0;padding:0}.cc-ov h2:before{display:none}.cc-ov p{margin:0;color:#cbd5e1;font-size:.92em}
.cc-tag{align-self:flex-start;font:.74em ui-monospace,Consolas,monospace;color:var(--cy);border:1px solid var(--cy);padding:1px 8px;border-radius:4px}.cc-zoom{position:absolute;top:10px;right:12px;font-size:.75em;color:var(--cy)}
.cc-grid4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:14px}
.cc-pc{background:var(--pn);border:1px solid var(--ln);border-top:3px solid var(--c);border-radius:10px;padding:12px 14px;min-width:0}
.cc-pc header{display:flex;align-items:center;gap:8px}.cc-pc h3{margin:0;font-size:1.05em;color:var(--c)}.cc-pc em{margin-left:auto;font:normal .7em ui-monospace,monospace;color:var(--dim)}
.cc-ic{width:30px;height:30px;display:grid;place-items:center;border-radius:8px;background:rgba(255,255,255,.06)}
.cc-lbl{margin:10px 0 3px;font-size:.7em;letter-spacing:.12em;color:var(--dim)}.cc-pc h4{margin:0 0 4px;font-size:.95em;line-height:1.45}.cc-pc ul{margin:0;padding-left:16px;font-size:.85em;color:#cbd5e1}.cc-pc li{margin:2px 0}
.cc-fc{margin:0;font-size:.86em;padding:8px 10px;border-left:2px solid var(--c);background:rgba(255,255,255,.04);border-radius:0 6px 6px 0}.cc-dim,.cc-none{color:var(--dim);font-size:.84em}
.cc-wt{margin:0;font-size:.84em;color:var(--cy)}.cc-tks{margin:8px 0 0;display:flex;flex-wrap:wrap;gap:4px}.cc-tks span{font-size:.7em;padding:1px 8px;border-radius:999px;background:rgba(167,139,250,.15);color:#c4b5fd;border:1px solid rgba(167,139,250,.4)}
.cc-ex{margin:6px 0 0;font-size:.78em;color:var(--dim)}.cc-src{margin:8px 0 0;font-size:.72em;color:var(--dim)}.cc-src a{color:var(--dim)}
.cc-more{margin:4px 0 0;font-size:.84em}.cc-more summary{cursor:pointer;color:var(--cy);font-size:.92em}.cc-pc .icards.one{grid-template-columns:1fr}
.cc-box{background:var(--pn);border:1px solid var(--ln);border-radius:12px;padding:14px;margin-bottom:14px}.cc-box h2{margin:0 0 10px;font-size:1em;letter-spacing:.06em;border:0;padding:0}.cc-box h2:before{display:none}.cc-box h2 span{color:var(--cy);font:600 .85em ui-monospace,monospace}
.cc-st{border-left:2px solid var(--ln);padding:2px 0 2px 10px;margin:0 0 10px}.cc-st.tank{border-left-color:#a78bfa}.cc-st b{font-size:.86em;color:var(--cy)}.cc-st.tank b{color:#c4b5fd}.cc-st small{margin-left:6px;color:var(--dim);font-size:.72em}.cc-st p{margin:2px 0 0;font-size:.82em;color:#cbd5e1}
.cc-side{position:sticky;top:76px;max-height:calc(100vh - 86px);overflow-y:auto;scrollbar-width:thin}
.cc-tt{border-left:2px solid #a78bfa;padding:2px 0 2px 10px;margin:0 0 12px}.cc-tt-m{margin:0;font-size:.72em;color:#c4b5fd}.cc-tt h4{margin:2px 0 4px;font-size:.9em}.cc-tt ul{margin:0;padding-left:16px;font-size:.8em;color:#cbd5e1}.cc-tt p{margin:3px 0;font-size:.8em;color:#cbd5e1}.cc-tt-o{color:#e9d5ff!important}.cc-tt-tw{color:var(--cy)!important}.cc-tt-more{margin:0;font-size:.8em}
.cc-think{margin:24px 0 8px}.cc-hero img{object-position:center 65%}.cc-h{margin:0 0 10px}.cc-hotp{margin-bottom:16px}
@media(max-width:1180px){.cc-panel{grid-template-columns:1fr}.cc-side{position:static;max-height:none;overflow:visible}.cc-grid4{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:640px){.cc-grid4{grid-template-columns:1fr}.cc-hero{height:220px}.cc-ov h2{font-size:1.2em}.cc-g{flex-basis:112px}}`;

module.exports = { theaterPanels, hotspotsPanel, thinkSection, CSS, PERSP };
