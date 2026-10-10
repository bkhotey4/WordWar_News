// 每月戰況月報：每月 1 日（台北）把上個月的燈號天數、大事記、市場變化與期刊導讀存成 research/monthly/YYYY-MM.json，
// 網站產生月報頁，Discord 在 1 日 09:00 後通知訂閱者一次。等級不是開戰機率。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'research', 'monthly');
const STATE = path.join(ROOT, 'research', 'monthly_push_state.json');
const SITE = 'https://bkhotey4.github.io/wordwar-intel/';
const HOUR = 3600_000, DAY = 24 * HOUR;
const THEATERS = ['taiwan_strait', 'korea_peninsula', 'south_china_sea', 'iran_gulf', 'middle_east', 'europe_security', 'ukraine_front'];
const NAMES = { taiwan_strait: '台海', iran_gulf: '美伊與荷莫茲', europe_security: '歐洲與北約東翼', ukraine_front: '烏俄', korea_peninsula: '朝鮮半島', south_china_sea: '南海', middle_east: '以巴、黎巴嫩與紅海' };
const LEVEL_NAMES = { 1: '常態', 2: '升溫', 3: '高度警戒', 4: '危機' };
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const tpeDate = ms => new Date(ms + 8 * HOUR).toISOString().slice(0, 10);

// 上一個完整月份，例如 10/1 時回傳 "2026-09"
function previousMonth(now = Date.now()) {
  const t = new Date(now + 8 * HOUR), y = t.getUTCFullYear(), m = t.getUTCMonth(); // m：本月（0 起算）
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toISOString().slice(0, 7);
}
const daysIn = month => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

function monthlyData(month, { root = ROOT, now = Date.now() } = {}) {
  const n = daysIn(month), dates = Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  // 1. 燈號：每天取最高等級
  const history = readJson(path.join(root, 'research', 'warning_history.json'), { snapshots: [] });
  const levels = {};
  for (const id of THEATERS) {
    const byDay = new Map();
    for (const s of history.snapshots || []) {
      if (s.theater !== id) continue;
      const lv = s.level ?? s.rawLevel; if (!Number.isInteger(lv)) continue;
      const d = tpeDate(Date.parse(s.at)); if (!d.startsWith(month)) continue;
      byDay.set(d, Math.max(byDay.get(d) || 0, lv));
    }
    const days = { 1: 0, 2: 0, 3: 0, 4: 0, none: 0 };
    for (const d of dates) { const lv = byDay.get(d); if (lv) days[lv]++; else days.none++; }
    levels[id] = { days, max: Math.max(0, ...byDay.values()) || null, daily: dates.map(d => byDay.get(d) || null) };
  }
  // 2. 大事記（時間軸）
  let events = [];
  try {
    const TL = require('../scripts/site_timeline');
    events = TL.collectTimeline({ root, now, theaters: THEATERS, days: 70 }).filter(e => tpeDate(Date.parse(e.at)).startsWith(month));
  } catch { /* 時間軸模組不在 */ }
  const counts = events.reduce((m, e) => (m[e.kind] = (m[e.kind] || 0) + 1, m), {});
  // 3. 市場：月初與月底收盤
  const markets = [];
  for (const q of readJson(path.join(root, 'research', 'source_cache', 'markets.json'), { quotes: [] }).quotes || []) {
    const pts = (q.points || []).filter(p => Number.isFinite(p.c) && tpeDate(Date.parse(p.t)).startsWith(month));
    if (pts.length < 2) continue;
    const first = pts[0].c, last = pts[pts.length - 1].c, hi = Math.max(...pts.map(p => p.c)), lo = Math.min(...pts.map(p => p.c));
    markets.push({ name: q.name, dp: q.dp ?? 2, first, last, pct: (last / first - 1) * 100, hi, lo, anomalyDays: null });
  }
  // 4. 期刊導讀
  const journals = [];
  try {
    for (const f of fs.readdirSync(path.join(root, 'research', 'journal_weekly')).filter(f => f.endsWith('.json'))) {
      for (const it of readJson(path.join(root, 'research', 'journal_weekly', f), { items: [] }).items || []) if (tpeDate(Date.parse(it.publishedAt)).startsWith(month)) journals.push(it);
    }
  } catch { /* 還沒有週檔 */ }
  journals.sort((a, b) => (b.theater === 'taiwan_strait') - (a.theater === 'taiwan_strait') || Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return { month, generatedAt: new Date(now).toISOString(), days: n, levels, counts,
    events: events.filter(e => e.kind !== 'DEESC').slice(0, 40).map(({ at, theater, kind, title, href }) => ({ at, theater, kind, title, href })),
    deescalation: events.filter(e => e.kind === 'DEESC').length, markets,
    journals: journals.slice(0, 8).map(({ id, titleZh, publication, url, theater, publishedAt }) => ({ id, titleZh, publication, url, theater, publishedAt })) };
}

// 有資料才存檔；已存在就不覆蓋（月報是當月結束時的紀錄）
function ensureSnapshot(now = Date.now(), { dir = DIR, root = ROOT } = {}) {
  const month = previousMonth(now), file = path.join(dir, `${month}.json`);
  if (fs.existsSync(file)) return readJson(file, null);
  // 月中才第一次建立會缺前面的日子（燈號紀錄只保留 40 天），所以只在 1～3 日建立
  if (new Date(now + 8 * HOUR).getUTCDate() > 3) return null;
  const data = monthlyData(month, { root, now });
  const hasData = Object.values(data.levels).some(l => l.max) || data.events.length;
  if (!hasData) return null;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
  return data;
}
function listMonths(dir = DIR) {
  try { return fs.readdirSync(dir).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).map(f => readJson(path.join(dir, f), null)).filter(Boolean).sort((a, b) => b.month.localeCompare(a.month)); } catch { return []; }
}

function monthLabel(month) { const [y, m] = month.split('-'); return `${y} 年 ${Number(m)} 月`; }
function monthlyHtml(d, { esc, tpe, link }) {
  const LV = { 1: '#22c55e', 2: '#eab308', 3: '#f97316', 4: '#ef4444' };
  const strip = l => `<div class="mstrip">${l.daily.map((lv, i) => `<span title="${i + 1} 日：${lv ? `第 ${lv} 級` : '無資料'}" style="background:${lv ? LV[lv] : '#334155'}"></span>`).join('')}</div>`;
  const c = d.counts || {};
  const KIND = { REPORT: '📰 查核報導', LEVEL_UP: '⚠️ 燈號上升', LEVEL_DOWN: '✅ 燈號下降', EVAC: '🧳 撤僑／旅遊警示', DIPLO: '🏛️ 外交事件', RHETORIC: '📢 官方言論', SANCTION: '💼 制裁', FLIGHTS: '✈️ 停飛', DEESC: '🕊️ 降溫訊號', MIL: '🛩️ 軍事行動', POWER: '⚡ 停電', MOBIL: '🚢 民船／動員', PANIC: '🛒 搶購', SHIP: '⚓ 航運', ISLANDS: '⛴️ 外島交通', CHIPS: '🔌 半導體管制' };
  return `<section class="month" id="m-${esc(d.month)}"><h2>${esc(monthLabel(d.month))}</h2>
  <h3>燈號天數</h3><table class="mtab"><tr><th>戰區</th><th>最高</th><th>每日燈號（1 日→月底）</th><th>天數</th></tr>
  ${THEATERS.map(id => { const l = d.levels[id] || {}; return `<tr><td>${esc(NAMES[id])}</td><td>${l.max ? `第 ${l.max} 級` : '—'}</td><td>${l.daily ? strip(l) : ''}</td><td class="small">${[4, 3, 2, 1].filter(k => l.days?.[k]).map(k => `${LEVEL_NAMES[k]} ${l.days[k]}`).join('、')}${l.days?.none ? `、無資料 ${l.days.none}` : ''}</td></tr>`; }).join('')}</table>
  <h3>大事記</h3><p class="muted small">${Object.entries(c).map(([k, n]) => `${esc(KIND[k] || k)} ${n}`).join('｜') || '本月沒有列入時間軸的事件'}</p>
  <ol class="timeline">${(d.events || []).slice(0, 25).map(e => `<li class="tl-item k-${esc(e.kind)}"><time>${esc(tpe(Date.parse(e.at)).slice(5, 10))}</time><span class="tl-tag">${esc(NAMES[e.theater] || '全球')}</span><span class="tl-kind">${esc(KIND[e.kind] || e.kind)}</span><span class="tl-title">${e.href && /^(https:\/\/|archive\.html|r\/|digest\.html)/.test(e.href) ? `<a href="${esc(e.href)}"${/^https?:/.test(e.href) ? ' target="_blank" rel="noopener"' : ''}>${esc(e.title)}</a>` : esc(e.title)}</span></li>`).join('')}</ol>
  ${d.markets?.length ? `<h3>市場（月初 → 月底收盤）</h3><table class="mtab"><tr><th>商品</th><th>月初</th><th>月底</th><th>漲跌</th><th>區間</th></tr>${d.markets.map(m => `<tr><td>${esc(m.name)}</td><td>${m.first.toFixed(m.dp)}</td><td>${m.last.toFixed(m.dp)}</td><td>${m.pct >= 0 ? '+' : ''}${m.pct.toFixed(1)}%</td><td class="small">${m.lo.toFixed(m.dp)}～${m.hi.toFixed(m.dp)}</td></tr>`).join('')}</table><p class="muted small">資料：Yahoo Finance；不構成投資建議。</p>` : ''}
  ${d.journals?.length ? `<h3>期刊導讀精選</h3><ul>${d.journals.map(j => `<li>${esc(j.publication)}｜<a href="digest.html">${esc(j.titleZh)}</a>（${/^https:\/\//.test(j.url || '') ? link(j.url, '原文') : '原文'}）</li>`).join('')}</ul>` : ''}
  <p class="muted small">產生於 ${esc(tpe(Date.parse(d.generatedAt)))}；燈號依當時規則計算，不是開戰機率。</p></section>`;
}

function monthlyPage(months, helpers) {
  const { esc, tpe, now } = helpers;
  return `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>每月戰況月報｜WorldWar 戰況情報站</title><meta name="description" content="台海、美伊、北約東翼、烏俄每月燈號天數、大事記、市場變化與期刊導讀精選。">
<link rel="stylesheet" href="style.css"></head><body><header class="top"><div class="brand"><h1>每月戰況月報</h1><p>每月 1 日自動產生｜更新於 ${esc(tpe(now))}</p></div><nav><a href="index.html">← 回首頁</a><a href="timeline.html">時間軸</a></nav></header>
<main class="narrow">${months.length ? `<nav class="wk-nav">${months.map(m => `<a href="#m-${esc(m.month)}">${esc(monthLabel(m.month))}</a>`).join('')}</nav>${months.map(m => monthlyHtml(m, helpers)).join('\n')}` : '<p class="muted">第一份月報會在下個月 1 日產生。</p>'}</main></body></html>`;
}

function monthlyPayload(d) {
  const lines = THEATERS.map(id => {
    const l = d.levels[id]; if (!l?.max) return `• ${NAMES[id]}：資料不足`;
    return `• ${NAMES[id]}：最高第 ${l.max} 級（${[4, 3, 2, 1].filter(k => l.days[k]).map(k => `${LEVEL_NAMES[k]} ${l.days[k]} 天`).join('、')}）`;
  });
  const c = d.counts || {};
  return { content: `🗓️ **${monthLabel(d.month)} 戰況月報**\n${lines.join('\n')}\n本月時間軸：查核報導 ${c.REPORT || 0}、燈號上升 ${c.LEVEL_UP || 0}、外交事件 ${(c.DIPLO || 0) + (c.EVAC || 0)}、軍事行動 ${c.MIL || 0} 則\n完整月報：${SITE}monthly.html#m-${d.month}\n（等級依公開資料與固定規則計算，不是開戰機率）` };
}

// 每月 1 日台北 09:00 後送一次
async function dispatchMonthly(client, subscribers, { now = Date.now(), file = STATE, shouldDeliver = () => ({ deliver: true }), markDelivered = () => {} } = {}) {
  const t = new Date(now + 8 * HOUR);
  if (t.getUTCDate() > 2 || (t.getUTCDate() === 1 && t.getUTCHours() < 9)) return [];
  const d = ensureSnapshot(now); if (!d) return [];
  const state = readJson(file, {}), same = state.month === d.month, sent = new Set(same ? state.sentTo : []), attempts = same ? (state.attempts || {}) : {};
  const eventId = `MONTHLY_${d.month}`;
  const todo = subscribers.filter(s => !sent.has(s.userId) && (attempts[s.userId] || 0) < 5 && shouldDeliver(s.userId, { level: 'ROUTINE', eventId, code: 'MONTHLY' }).deliver);
  if (!todo.length) return [];
  const payload = monthlyPayload(d), results = [];
  for (const sub of todo) {
    try { await (await client.users.fetch(sub.userId)).send(payload); markDelivered(sub.userId, eventId); sent.add(sub.userId); results.push({ userId: sub.userId, status: 'SENT' }); }
    catch (e) { attempts[sub.userId] = (attempts[sub.userId] || 0) + 1; results.push({ userId: sub.userId, status: 'FAILED', error: e.message }); }
  }
  const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify({ month: d.month, sentTo: [...sent], attempts })); fs.renameSync(tmp, file);
  return results;
}

const CSS = `.mtab{width:100%;border-collapse:collapse;margin:6px 0 12px}.mtab th,.mtab td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
.mstrip{display:grid;grid-template-columns:repeat(31,1fr);gap:2px;min-width:180px}.mstrip span{display:block;height:14px;border-radius:2px}.month{margin:20px 0 30px}
@media (max-width:600px){.mtab{font-size:.85em}.mstrip{min-width:120px}}`;

module.exports = { previousMonth, monthlyData, ensureSnapshot, listMonths, monthlyPage, monthlyPayload, dispatchMonthly, CSS, DIR };
