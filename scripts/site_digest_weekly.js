// 期刊中文導讀「每週彙整」：每次建置網站時，把導讀依原文發表週（台北時間，週一到週日）存進 research/journal_weekly/<週>.json。
// 這些週檔只增不刪，所以導讀排程把 journal_digest.json 裁到 120 篇也不影響過去的週資料。
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'research', 'journal_weekly');
const HOUR = 3600_000, DAY = 24 * HOUR;
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };

// ISO 週（台北時間）：回傳 { key: '2026-W41', start: 週一日期, end: 週日日期 }
function weekOf(iso) {
  const t = new Date(Date.parse(iso) + 8 * HOUR);
  const day = (t.getUTCDay() + 6) % 7; // 週一＝0
  const monday = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - day));
  const thursday = new Date(monday.getTime() + 3 * DAY);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY / 7) + 1;
  const ymd = d => d.toISOString().slice(0, 10);
  return { key: `${year}-W${String(week).padStart(2, '0')}`, start: ymd(monday), end: ymd(new Date(monday.getTime() + 6 * DAY)) };
}

// 把目前合格的導讀併進各週檔（同 id 以新內容為準）；回傳有變動的週
function archiveDigest(items, dir = DIR) {
  const byWeek = new Map();
  for (const it of items) { const w = weekOf(it.publishedAt); byWeek.set(w.key, [...(byWeek.get(w.key) || []), it]); }
  const changed = [];
  for (const [key, list] of byWeek) {
    const file = path.join(dir, `${key}.json`);
    const old = readJson(file, { week: key, items: [] });
    const merged = new Map((old.items || []).map(i => [i.id, i]));
    let dirty = false;
    for (const it of list) if (JSON.stringify(merged.get(it.id)) !== JSON.stringify(it)) { merged.set(it.id, it); dirty = true; }
    if (!dirty) continue;
    const w = weekOf(list[0].publishedAt);
    fs.mkdirSync(dir, { recursive: true });
    const out = { week: key, start: w.start, end: w.end, items: [...merged.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)) };
    const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(out, null, 1)); fs.renameSync(tmp, file);
    changed.push(key);
  }
  return changed;
}

// 讀取所有週檔；每篇再用目前的格式規則檢查一次，不合格的不顯示
function loadWeeks(checkItem, now = Date.now(), dir = DIR) {
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => /^\d{4}-W\d{2}\.json$/.test(f)); } catch { return []; }
  return files.map(f => readJson(path.join(dir, f), null)).filter(Boolean)
    .map(w => ({ ...w, items: (w.items || []).filter(it => !checkItem(it, now).length) }))
    .filter(w => w.items.length).sort((a, b) => b.week.localeCompare(a.week));
}

const range = w => `${w.start.slice(5).replace('-', '/')}～${w.end.slice(5).replace('-', '/')}`;

function weeklyPage(weeks, { esc, tpe, now, card, CATEGORIES, THEATERS }) {
  const total = weeks.reduce((a, w) => a + w.items.length, 0);
  const stats = w => {
    const by = (key, names) => Object.entries(w.items.reduce((m, it) => (it[key] ? (m[it[key]] = (m[it[key]] || 0) + 1, m) : m), {}))
      .sort((a, b) => b[1] - a[1]).map(([k, n]) => `${names[k] || k} ${n}`).join('、');
    const th = by('theater', THEATERS), cat = by('category', CATEGORIES);
    return `<p class="muted small">${w.items.length} 篇${cat ? `｜${esc(cat)}` : ''}${th ? `｜戰區：${esc(th)}` : ''}</p>`;
  };
  const section = (w, i) => {
    const body = `${stats(w)}<div class="jgrid">${w.items.map(card).join('\n')}</div>`;
    const title = `${esc(w.week.replace('-W', ' 年第 '))} 週（${esc(range(w))}）`;
    return i === 0 ? `<section class="wk" id="w-${esc(w.week)}"><h2>${title}</h2>${body}</section>`
      : `<details class="wk" id="w-${esc(w.week)}"><summary><h2>${title}</h2></summary>${body}</details>`;
  };
  return `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>每週期刊導讀｜WorldWar 戰況情報站</title><meta name="description" content="外交期刊、軍事戰略評論、智庫與台灣觀點的中文導讀，依週彙整。">
<link rel="canonical" href="https://bkhotey4.github.io/wordwar-intel/digest.html"><link rel="stylesheet" href="style.css"></head><body>
<header class="top"><div class="brand"><h1>每週期刊導讀</h1><p>共 ${weeks.length} 週、${total} 篇｜最後更新 ${esc(tpe(now))}（台北）</p></div><nav><a href="index.html">← 回首頁</a><a href="journals.html">期刊新文章</a></nav></header>
<main class="narrow">
<p class="notice small">本站自行撰寫的中文摘要，非全文翻譯；依原文發表日期分週（週一到週日）。觀點屬原作者，請點原文連結閱讀全文。</p>
${weeks.length ? `<nav class="wk-nav">${weeks.map(w => `<a href="#w-${esc(w.week)}">${esc(range(w))}（${w.items.length}）</a>`).join('')}</nav>${weeks.map(section).join('\n')}` : '<p class="muted">還沒有導讀，第一批會在導讀排程執行後出現。</p>'}
</main>
<script>if(location.hash){const d=document.querySelector(location.hash);if(d&&d.tagName==='DETAILS')d.open=true}</script>
</body></html>`;
}

const CSS = `.narrow{max-width:1000px;margin:0 auto;padding:16px}.wk{margin:18px 0}.wk summary{cursor:pointer;list-style:revert}.wk summary h2{display:inline;font-size:1.15em}
.wk-nav{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.wk-nav a{padding:4px 12px;border:1px solid var(--line);border-radius:999px;color:var(--dim);text-decoration:none;font-size:.9em}.wk-nav a:hover{color:var(--cyan)}`;

module.exports = { weekOf, archiveDigest, loadWeeks, weeklyPage, CSS, DIR };
