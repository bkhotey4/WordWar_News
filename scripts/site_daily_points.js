// 每日戰況中文重點：由本機排程讀 ISW 等每日評估後，用自己的話寫成 3～5 點中文重點，存在 research/daily_points.json。
// 這裡負責格式檢查與首頁呈現（每個戰區只顯示最新一天）。非全文翻譯。
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'research', 'daily_points.json');
const THEATERS = { taiwan_strait: '台海', korea_peninsula: '朝鮮半島', south_china_sea: '南海', iran_gulf: '美伊與荷莫茲', middle_east: '以巴、黎巴嫩與紅海', europe_security: '歐洲與北約東翼', ukraine_front: '烏俄', global: '全球' };
const SIMPLIFIED = /[图视软频为这们说开关发时会来对国过还进动战经济]/;
const HOUR = 3600_000, DAY = 24 * HOUR;
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const str = (v, max, min = 1) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
const httpsUrl = v => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && v.length <= 600; } catch { return false; } };

function checkItem(it) {
  const e = [], k = it?.id || '(無 id)';
  if (!/^[a-z0-9-]{4,100}$/.test(it?.id || '')) e.push(`${k}：id 只能用小寫英數與連字號`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(it?.date || '')) e.push(`${k}：date 要是 YYYY-MM-DD`);
  if (!Object.hasOwn(THEATERS, it?.theater)) e.push(`${k}：theater 必須是 ${Object.keys(THEATERS).join('／')}`);
  if (!str(it?.title, 60, 4)) e.push(`${k}：title（中文標題）4～60 字`);
  if (!Array.isArray(it?.points) || it.points.length < 3 || it.points.length > 5 || !it.points.every(p => str(p, 120, 10))) e.push(`${k}：points 需 3～5 點，每點 10～120 字`);
  if (!Array.isArray(it?.sources) || !it.sources.length || it.sources.length > 4 || !it.sources.every(s => httpsUrl(s?.url) && str(s?.publisher, 80))) e.push(`${k}：sources 需 1～4 筆 {publisher, url(https)}`);
  const zh = [it?.title, ...(it?.points || [])].join('');
  if (SIMPLIFIED.test(zh)) e.push(`${k}：含簡體字，請用臺灣繁體`);
  for (const q of zh.match(/「[^」]*」/g) || []) if (q.length > 27) e.push(`${k}：直接引用過長，請改寫成自己的話`);
  return e;
}
function checkFile(d) {
  if (!Array.isArray(d?.items)) return ['items 必須是陣列'];
  const errors = d.items.flatMap(checkItem), ids = new Set();
  for (const it of d.items) { if (ids.has(it.id)) errors.push(`id 重複：${it.id}`); ids.add(it.id); }
  if (d.items.length > 200) errors.push('超過 200 筆，請移除最舊的');
  return errors;
}

// 每個戰區取最新一天、且在 3 天內的重點
function latestByTheater(now = Date.now(), file = FILE) {
  const items = (readJson(file, { items: [] }).items || []).filter(it => !checkItem(it).length && now - Date.parse(`${it.date}T23:59:59+08:00`) <= 3 * DAY);
  const best = new Map();
  for (const it of items) if (!best.has(it.theater) || it.date > best.get(it.theater).date) best.set(it.theater, it);
  const order = Object.keys(THEATERS);
  return [...best.values()].sort((a, b) => order.indexOf(a.theater) - order.indexOf(b.theater));
}

function homeSection(items, { esc }) {
  if (!items.length) return '';
  return `<div class="dp-grid">${items.map(it => `<article class="dp-card"><p class="meta">${esc(THEATERS[it.theater])}｜${esc(it.date.slice(5).replace('-', '/'))}</p><h3>${esc(it.title)}</h3>
    <ul>${it.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
    <p class="muted small">依據：${it.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.publisher)}</a>`).join('、')}｜本站自行整理，非全文翻譯</p></article>`).join('')}</div>`;
}

const CSS = `.dp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px}.dp-card{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--cyan);border-radius:10px;padding:12px 16px}
.dp-card h3{margin:2px 0 6px;font-size:1.05em}.dp-card ul{margin:0 0 6px;padding-left:18px}.dp-card li{margin:3px 0}`;

module.exports = { FILE, THEATERS, checkItem, checkFile, latestByTheater, homeSection, CSS };

if (require.main === module) {
  const f = process.argv[2] || FILE;
  let d; try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.error(`JSON 讀取失敗：${e.message}`); process.exit(1); }
  const errors = checkFile(d);
  if (errors.length) { console.error(`不合格 ${errors.length} 項：\n- ${errors.join('\n- ')}`); process.exit(1); }
  console.log(`合格：${f} 共 ${d.items.length} 筆`);
}
