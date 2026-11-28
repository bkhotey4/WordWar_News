'use strict';
// 燈號變化紀錄：從 research/warning_history.json 的快照（每輪巡檢一筆，記等級與觸發的指標 id）整理成各戰區的時間軸，
// 讓讀者看懂「為什麼現在是這一級」。指標中斷不到 6 小時視為持續（避免資料空窗造成一閃一閃），只列近 30 天。
const HOUR = 3600_000, DAY = 24 * HOUR;
const MERGE_GAP = 6 * HOUR;
const WINDOW = 30 * DAY;

// 回傳新到舊的事件：{ at, type: 'LEVEL'|'ON'|'OFF'|'RULE', from, to, ids, ruleVersion }
function levelTimeline(snapshots, theater, { now = Date.now() } = {}) {
  const snaps = (snapshots || []).filter(s => s.theater === theater && Number.isFinite(Date.parse(s.at))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const events = [];
  const lastSeen = new Map(), onSince = new Map();
  let prev = null;
  for (const s of snaps) {
    // 10/26 以前的快照沒有記錄觸發指標（沒有 ind 欄位）：不能說「沒有指標觸發」，也不拿來推算觸發／解除
    const t = Date.parse(s.at), hasInd = Array.isArray(s.ind), ids = new Set(s.ind || []);
    if (prev && s.ruleVersion && prev.ruleVersion && s.ruleVersion !== prev.ruleVersion) events.push({ at: s.at, type: 'RULE', ruleVersion: s.ruleVersion });
    // 指標：新出現（或中斷超過 6 小時後再出現）記「觸發」；最後一次出現後超過 6 小時沒再出現記「解除」（時間取最後一次出現）
    if (hasInd) for (const [id, seen] of lastSeen) if (!ids.has(id) && t - seen > MERGE_GAP && onSince.has(id)) { events.push({ at: new Date(seen).toISOString(), type: 'OFF', ids: [id] }); onSince.delete(id); }
    const fresh = [];
    if (hasInd) for (const id of ids) { if (!onSince.has(id)) { onSince.set(id, t); fresh.push(id); } lastSeen.set(id, t); }
    if (prev && s.level !== prev.level) events.push({ at: s.at, type: 'LEVEL', from: prev.level ?? null, to: s.level ?? null, ids: [...ids], recorded: hasInd });
    // 第一筆有記錄指標的快照：當時已在觸發中的指標不是「新觸發」
    if (fresh.length && prev && Array.isArray(prev.ind)) events.push({ at: s.at, type: 'ON', ids: fresh });
    prev = s;
  }
  // 最後一筆快照之後超過 6 小時都沒再出現的，也算解除
  const end = prev ? Date.parse(prev.at) : now;
  for (const [id, seen] of lastSeen) if (onSince.has(id) && end - seen > MERGE_GAP) events.push({ at: new Date(seen).toISOString(), type: 'OFF', ids: [id] });
  return events.filter(e => now - Date.parse(e.at) <= WINDOW).sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (a.type === 'LEVEL' ? -1 : 1));
}

function historyHtml(events, { esc, names = {}, limit = 15 } = {}) {
  if (!events.length) return '<p class="muted small">近 30 天沒有燈號或指標變化。</p>';
  const tpe = iso => new Date(Date.parse(iso) + 8 * HOUR).toISOString().slice(5, 16).replace('T', ' ').replace('-', '/');
  const nm = ids => ids.map(id => esc(names[id] || id)).join('、');
  const row = e => {
    if (e.type === 'RULE') return `<li class="lvh-rule"><time>${tpe(e.at)}</time><span>判定規則改版（${esc(e.ruleVersion)}），之前的等級不能直接比較</span></li>`;
    if (e.type === 'LEVEL') {
      if (e.to == null) return `<li class="lvh-off"><time>${tpe(e.at)}</time><span>改為無法判定（原 ${e.from ?? '—'} 級）：資料不足</span></li>`;
      const up = (e.to || 0) > (e.from || 0);
      return `<li class="lvh-lv ${up ? 'up' : 'down'}"><time>${tpe(e.at)}</time><span><b>${up ? '▲ 升到' : '▼ 降到'} ${e.to ?? '—'} 級</b>（原 ${e.from ?? '—'} 級）${e.recorded === false ? '｜當時未記錄觸發指標' : e.ids.length ? `｜當時觸發：${nm(e.ids)}` : '｜當時沒有指標觸發'}</span></li>`;
    }
    return `<li class="lvh-${e.type === 'ON' ? 'on' : 'off'}"><time>${tpe(e.at)}</time><span>${e.type === 'ON' ? '觸發' : '解除'}：${nm(e.ids)}</span></li>`;
  };
  const shown = events.slice(0, limit);
  return `<ol class="lvh">${shown.map(row).join('')}</ol>${events.length > limit ? `<p class="muted small">只列最近 ${limit} 筆（近 30 天共 ${events.length} 筆）。</p>` : ''}`;
}

const CSS = `.lvh{list-style:none;margin:6px 0 0;padding:0 0 0 14px;border-left:2px solid var(--line)}.lvh li{position:relative;margin:0 0 8px;font-size:.86em;line-height:1.55;display:grid;grid-template-columns:86px 1fr;gap:8px}
.lvh li::before{content:'';position:absolute;left:-19px;top:6px;width:8px;height:8px;border-radius:50%;background:#475569}.lvh time{color:var(--dim);font-variant-numeric:tabular-nums}
.lvh .lvh-lv.up::before{background:#f97316}.lvh .lvh-lv.down::before{background:#7dd3fc}.lvh .lvh-on::before{background:#eab308}.lvh .lvh-off::before{background:#64748b}.lvh .lvh-rule span{color:var(--dim);font-style:italic}`;

module.exports = { levelTimeline, historyHtml, CSS, MERGE_GAP };
