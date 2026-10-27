// 事件時間軸：把查核報導、燈號變化、外交與政治事件、北約東翼與共軍行動依時間排在一起（近 30 天）。
const fs = require('fs');
const path = require('path');

const HOUR = 3600_000, DAY = 24 * HOUR;
const LEVEL_NAMES = { 1: '常態', 2: '升溫', 3: '高度警戒', 4: '危機' };
const KINDS = {
  REPORT: { icon: '📰', label: '查核報導' }, LEVEL_UP: { icon: '⚠️', label: '燈號上升' }, LEVEL_DOWN: { icon: '✅', label: '燈號下降' },
  EVAC: { icon: '🧳', label: '撤僑／旅遊警示' }, DIPLO: { icon: '🏛️', label: '外交關係' }, RHETORIC: { icon: '📢', label: '官方言論' },
  SANCTION: { icon: '💼', label: '制裁' }, FLIGHTS: { icon: '✈️', label: '航班停飛' }, DEESC: { icon: '🕊️', label: '降溫訊號' }, MIL: { icon: '🛩️', label: '軍事行動' },
  POWER: { icon: '⚡', label: '停電' }, ARMS: { icon: '🛡️', label: '軍售／涉台法案' }, MOBPREP: { icon: '🎖️', label: '動員前兆' }, HOMEFRONT: { icon: '🏚️', label: '緊急狀態／物資' }, EUPREP: { icon: '🇪🇺', label: '歐洲備戰' }, CNTW: { icon: '🇨🇳', label: '中國對台措施' }, UN: { icon: '🌐', label: '國際組織' }, MOBIL: { icon: '🚢', label: '民船／動員' }, PANIC: { icon: '🛒', label: '搶購' }, SHIP: { icon: '⚓', label: '航運' }, ISLANDS: { icon: '⛴️', label: '外島交通' }, CHIPS: { icon: '🔌', label: '半導體管制' }
};
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const tpeDate = ms => new Date(ms + 8 * HOUR).toISOString().slice(0, 10);

// 每天取最高等級，和前一個有資料的日子比較，有變化才列入
function levelChanges(history, theater, now, days = 30) {
  const byDay = new Map();
  for (const s of history.snapshots || []) {
    if (s.theater !== theater) continue;
    const lv = s.level ?? s.rawLevel; if (!Number.isInteger(lv)) continue;
    const d = tpeDate(Date.parse(s.at));
    byDay.set(d, Math.max(byDay.get(d) || 0, lv));
  }
  const out = []; let prev = null;
  for (const d of [...byDay.keys()].sort()) {
    const lv = byDay.get(d);
    if (prev !== null && lv !== prev && now - Date.parse(`${d}T00:00:00+08:00`) <= days * DAY)
      out.push({ at: `${d}T12:00:00+08:00`, theater, kind: lv > prev ? 'LEVEL_UP' : 'LEVEL_DOWN', title: `由第 ${prev} 級${lv > prev ? '升至' : '降至'}第 ${lv} 級「${LEVEL_NAMES[lv]}」` });
    prev = lv;
  }
  return out;
}

function collectTimeline({ root, now = Date.now(), theaters, days = 30 }) {
  const cutoff = now - days * DAY, ev = [];
  // 查核報導（連到報導彙整頁）
  for (const r of readJson(path.join(root, 'research', 'reports.json'), { reports: [] }).reports || []) {
    if (!r.reviewed || r.supersededBy || !Number.isFinite(Date.parse(r.asOf))) continue;
    ev.push({ at: r.asOf, theater: r.theater, kind: 'REPORT', title: r.title, href: `archive.html#r-${r.id}` });
  }
  // 燈號變化
  const history = readJson(path.join(root, 'research', 'warning_history.json'), { snapshots: [] });
  for (const id of theaters) ev.push(...levelChanges(history, id, now, days));
  // 外交與政治（2 家以上媒體確認）
  const dip = readJson(path.join(root, 'research', 'source_cache', 'diplomacy.json'), null);
  for (const e of dip?.history || []) ev.push({ at: e.firstSeen, theater: e.theater, kind: e.type, sub: e.type, pubs: e.publishers, title: e.title, href: e.url, note: `${e.publishers} 家媒體` });
  const civ = readJson(path.join(root, 'research', 'source_cache', 'taiwan_civil.json'), null);
  for (const e of civ?.history || []) ev.push({ at: e.firstSeen, theater: 'taiwan_strait', kind: e.type, sub: e.type, pubs: e.publishers, title: e.title, href: e.url, note: `${e.publishers} 家媒體` });
  const mobc = readJson(path.join(root, 'research', 'source_cache', 'mobilization.json'), null);
  for (const e of mobc?.history || []) ev.push({ at: e.firstSeen, theater: e.theater, sub: e.type, pubs: e.publishers, kind: e.type === 'EUPREP' ? 'EUPREP' : /EMERGENCY|STOCKPILE/.test(e.type) ? 'HOMEFRONT' : 'MOBPREP', title: e.title, href: e.url, note: `${e.publishers} 家媒體` });
  const reg = readJson(path.join(root, 'research', 'source_cache', 'regional.json'), null);
  for (const e of reg?.history || []) ev.push({ at: e.firstSeen, theater: e.theater, kind: 'MIL', sub: e.type, pubs: e.publishers, title: e.title, href: e.url, note: `${e.publishers} 家媒體` });
  // 北約東翼領空事件、共軍聯合戰備警巡與具名演習（2 家以上媒體確認）
  const nato = readJson(path.join(root, 'research', 'source_cache', 'nato_flank.json'), null);
  for (const e of (nato?.events || []).filter(e => e.confirmed)) ev.push({ at: e.firstSeen, theater: 'europe_security', kind: 'MIL', sub: e.type, pubs: (e.publishers || []).length, title: e.items?.[0]?.title || e.type, href: e.items?.[0]?.url, note: `${e.publishers.length} 家媒體` });
  const pla = readJson(path.join(root, 'research', 'source_cache', 'pla_joint.json'), null);
  for (const e of (pla?.events || []).filter(e => e.confirmed)) ev.push({ at: e.firstSeen, theater: 'taiwan_strait', kind: 'MIL', sub: e.type, exName: e.name, pubs: (e.publishers || []).length, title: e.items?.[0]?.title || e.name || e.type, href: e.items?.[0]?.url, note: `${(e.publishers || []).length} 家媒體` });
  const seen = new Set();
  return ev.filter(e => Number.isFinite(Date.parse(e.at)) && Date.parse(e.at) >= cutoff && Date.parse(e.at) <= now + HOUR && theaters.concat('global').includes(e.theater))
    .filter(e => { const k = `${e.kind}|${e.theater}|${e.title}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

function row(e, { esc, names, tpe }) {
  const k = KINDS[e.kind] || { icon: '•', label: e.kind };
  const safe = e.href && /^(https:\/\/|archive\.html|r\/|digest\.html)/.test(e.href);
  const title = safe ? `<a href="${esc(e.href)}"${/^https?:/.test(e.href) ? ' target="_blank" rel="noopener"' : ''}>${esc(e.title)}</a>` : esc(e.title);
  return `<li class="tl-item k-${esc(e.kind)}" data-theater="${esc(e.theater)}"><time>${esc(tpe(Date.parse(e.at)).slice(5, 16))}</time>
    <span class="tl-tag">${esc(names[e.theater] || '全球')}</span><span class="tl-kind" title="${esc(k.label)}">${k.icon} ${esc(k.label)}</span>
    <span class="tl-title">${title}${e.note ? ` <span class="muted small">（${esc(e.note)}）</span>` : ''}</span></li>`;
}

function homeSection(events, helpers, limit = 10) {
  if (!events.length) return '<p class="muted">近 30 天還沒有可列入的事件。</p>';
  return `<ol class="timeline">${events.slice(0, limit).map(e => row(e, helpers)).join('')}</ol><p><a href="timeline.html">看完整 30 天時間軸（可依戰區篩選）→</a></p>`;
}

function timelinePage(events, { esc, names, tpe, now, theaters }) {
  const btn = (id, label, on) => `<button type="button" data-f="${esc(id)}"${on ? ' class="on"' : ''}>${esc(label)}</button>`;
  return `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>事件時間軸｜WorldWar 戰況情報站</title><meta name="description" content="台海、美伊、北約東翼、烏俄近 30 天的查核報導、燈號變化、外交與政治事件時間軸。">
<link rel="stylesheet" href="style.css"></head><body><header class="top"><h1>WorldWar 戰況情報站</h1><nav><a href="index.html">← 回首頁</a><a href="archive.html">報導彙整</a></nav></header>
<main class="narrow"><h2>事件時間軸（近 30 天）</h2>
<p class="muted">外交、政治與軍事事件需 2 家以上媒體報導才列入；燈號變化取每天最高等級。更新於 ${esc(tpe(now))}。</p>
<div class="tl-filter">${btn('all', '全部', true)}${theaters.map(id => btn(id, names[id] || id)).join('')}</div>
<ol class="timeline full">${events.map(e => row(e, { esc, names, tpe })).join('')}</ol>
${events.length ? '' : '<p class="muted">近 30 天還沒有可列入的事件。</p>'}
</main>
<script>document.querySelectorAll('.tl-filter button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tl-filter button').forEach(x=>x.classList.toggle('on',x===b));const f=b.dataset.f;document.querySelectorAll('.timeline li').forEach(li=>{li.hidden=f!=='all'&&li.dataset.theater!==f})})</script>
</body></html>`;
}

const CSS = `.brief{font-size:1.05em;margin:0 0 10px;padding:10px 12px;border-left:4px solid var(--cyan);background:rgba(34,211,238,.07);border-radius:6px}
.timeline{list-style:none;margin:0;padding:0}.tl-item{display:grid;grid-template-columns:92px auto 1fr;gap:4px 10px;padding:8px 0;border-bottom:1px solid var(--line);align-items:baseline}
.tl-item time{color:var(--dim);font-variant-numeric:tabular-nums;white-space:nowrap}.tl-tag{font-size:.8em;padding:1px 8px;border:1px solid var(--line);border-radius:999px;color:var(--dim);white-space:nowrap}
.tl-kind{font-size:.85em;color:var(--dim);white-space:nowrap}.tl-title{grid-column:2/-1}.tl-item.k-LEVEL_UP .tl-kind{color:#f59e0b;font-weight:700}.tl-item.k-LEVEL_DOWN .tl-kind,.tl-item.k-DEESC .tl-kind{color:#34d399}
.tl-item.k-EVAC .tl-kind{color:#fca5a5;font-weight:700}.tl-filter{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.tl-filter button{padding:6px 14px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--dim);cursor:pointer;font-size:15px}
.tl-filter button.on{background:var(--cyan);color:#0b1220;border-color:var(--cyan);font-weight:700}
@media (max-width:600px){.tl-item{grid-template-columns:auto 1fr}.tl-title{grid-column:1/-1}}`;

module.exports = { collectTimeline, levelChanges, homeSection, timelinePage, KINDS, CSS };
