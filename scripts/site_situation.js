// 首頁「全球動態整理」：把各戰區的預警指標依軍事／外交政治／民生經濟分類，只列出異常的項目；
// 以及「即時動態（48 小時）」：時間軸裡最近 48 小時經確認的事件（不含查核報導），最多 8 則。不新增資料來源。
const HOUR = 3600_000;
const DIPLO = new Set(['tw_evac', 'tw_diplomatic', 'tw_sanction_flight', 'tw_political_window', 'tw_deesc', 'ir_evac', 'ir_diplomatic', 'ir_sanction_flight', 'ir_iaea', 'ir_talks',
  'eu_evac', 'eu_diplomatic', 'eu_sanction_flight', 'eu_nato_art4', 'eu_deesc', 'ua_diplomatic', 'ua_sanction_flight', 'ua_mobilization', 'ua_deesc', 'ua_un',
  'eu_prep', 'tw_arms', 'tw_cn_measures', 'kr_evac', 'kr_diplomatic', 'kr_un', 'kr_deesc', 'scs_diplomatic', 'scs_deesc', 'me_evac', 'me_diplomatic', 'me_un', 'me_deesc']);
const CIVIL = new Set(['tw_cn_homefront', 'kr_homefront', 'ir_homefront', 'me_homefront', 'ua_homefront', 'tw_market', 'tw_power', 'tw_islands', 'tw_chips', 'tw_disinfo', 'tw_panic', 'tw_shipping', 'tw_infra', 'ir_oil', 'ir_ship_insurance', 'eu_energy']);
const CATS = [['MIL', '🛡️ 軍事與動員'], ['DIP', '🏛️ 外交政治'], ['CIV', '🏭 後方與經濟']];
const catOf = id => DIPLO.has(id) ? 'DIP' : CIVIL.has(id) ? 'CIV' : 'MIL';
const shortName = n => String(n || '').split(/[（(，]|超過/)[0].trim();

function situationSection(board, { esc, order, names }) {
  const cards = order.map(id => board.theaters.find(t => t.id === id)).filter(Boolean).map(t => {
    const rows = CATS.map(([cat, label]) => {
      const inds = t.indicators.filter(i => catOf(i.id) === cat && i.tier !== 'DECISIVE');
      const hot = inds.filter(i => i.status === 'TRIGGERED' && i.tier !== 'DEESCALATION');
      const calm = inds.filter(i => i.status === 'TRIGGERED' && i.tier === 'DEESCALATION');
      if (!inds.length) return '';
      const known = inds.filter(i => i.status !== 'UNKNOWN').length;
      const body = hot.length
        ? `<ul>${hot.slice(0, 3).map(i => `<li class="hot"><b>${esc(shortName(i.name))}</b><span>${esc(String(i.summary || '').slice(0, 90))}</span></li>`).join('')}</ul>`
        : `<p class="ok">無異常<span class="muted small">（${known}/${inds.length} 項有資料）</span></p>`;
      const calmLine = calm.length ? `<p class="calm-line">🕊️ ${esc(String(calm[0].summary || '').slice(0, 80))}</p>` : '';
      return `<div class="sit-row"><div class="sit-cat">${label}</div><div class="sit-body">${body}${calmLine}</div></div>`;
    }).join('');
    return `<div class="sit-card"><h3>${esc(names[t.id] || t.name)}</h3>${rows}</div>`;
  }).join('');
  return `<div class="sit-grid">${cards}</div>`;
}

function liveSection(events, { esc, names, tpe, kinds, now }) {
  const recent = events.filter(e => e.kind !== 'REPORT' && now - Date.parse(e.at) <= 48 * HOUR).slice(0, 8);
  if (!recent.length) return '<p class="muted">近 48 小時沒有經 2 家以上媒體確認的新事件。</p>';
  return `<ul class="live">${recent.map(e => {
    const k = kinds[e.kind] || { icon: '•', label: e.kind };
    const safe = e.href && /^https:\/\//.test(e.href);
    return `<li><span class="lv-time">${esc(tpe(Date.parse(e.at)).slice(5, 16))}</span><span class="lv-tag">${esc(names[e.theater] || '全球')}｜${k.icon} ${esc(k.label)}</span><span class="lv-title">${safe ? `<a href="${esc(e.href)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : esc(e.title)}</span></li>`;
  }).join('')}</ul>`;
}

const CSS = `.sit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.sit-card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.sit-card h3{margin:0 0 8px;font-size:1.05em}
.sit-row{display:grid;grid-template-columns:92px 1fr;gap:8px;padding:6px 0;border-top:1px solid var(--line)}.sit-cat{color:var(--dim);font-size:.9em;white-space:nowrap}
.sit-body ul{margin:0;padding-left:0;list-style:none}.sit-body li.hot{margin:0 0 4px}.sit-body li.hot b{color:#f59e0b;margin-right:6px}.sit-body li.hot span{font-size:.88em;color:var(--text)}
.sit-body .ok{margin:0;color:#34d399;font-size:.92em}.calm-line{margin:2px 0 0;color:#34d399;font-size:.85em}
.live{list-style:none;margin:0;padding:0}.live li{display:grid;grid-template-columns:92px 240px 1fr;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);font-size:.92em}.lv-time{color:var(--dim);font-variant-numeric:tabular-nums}.lv-tag{color:var(--dim)}
@media(max-width:900px){.sit-grid{grid-template-columns:1fr}.live li{grid-template-columns:1fr}.lv-time,.lv-tag{display:inline}}`;

module.exports = { situationSection, liveSection, catOf, CSS };
