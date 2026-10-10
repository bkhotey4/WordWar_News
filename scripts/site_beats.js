// 跑線記者式重點：由本機排程讀報導後用自己的話寫成，存在 research/beat_briefs.json。這裡負責格式檢查與首頁呈現。非全文翻譯。
// 條線（beat）：軍事、外交、政治三條主線，加上經濟能源、科技晶片、輿論認知戰、網路資安四個面向，與熱點戰區用的「綜合」。
// 戰區：7 個有預警燈號的主戰區、5 個只追蹤重點的熱點戰區，以及跨戰區的 global。
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'research', 'beat_briefs.json');
const BEATS = { MIL: '軍事', DIP: '外交', POL: '政治', ECON: '經濟與能源', TECH: '科技與晶片', INFO: '輿論與認知作戰', CYBER: '網路與資安', SUM: '綜合' };
const MAIN_BEATS = ['MIL', 'DIP', 'POL'];
const EXTRA_BEATS = ['ECON', 'TECH', 'INFO', 'CYBER'];
const ICON = { MIL: '🛡️', DIP: '🏛️', POL: '📜', ECON: '🛢️', TECH: '💾', INFO: '📣', CYBER: '🖥️', SUM: '🧭' };
const MAIN_THEATERS = { taiwan_strait: '台海', korea_peninsula: '朝鮮半島', south_china_sea: '南海', iran_gulf: '美伊與荷莫茲', middle_east: '以巴、黎巴嫩與紅海', europe_security: '歐洲與北約東翼', ukraine_front: '烏俄' };
const HOTSPOTS = { india_pakistan: '印巴', myanmar: '緬甸', sudan: '蘇丹', sahel: '薩赫勒', venezuela: '委內瑞拉與加勒比海' };
const THEATERS = { ...MAIN_THEATERS, ...HOTSPOTS, global: '全球' };
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
  if (!Object.hasOwn(BEATS, it?.beat)) e.push(`${k}：beat 必須是 ${Object.keys(BEATS).join('／')}`);
  if (it?.beat === 'SUM' && !Object.hasOwn(HOTSPOTS, it?.theater)) e.push(`${k}：SUM（綜合）只用於熱點戰區`);
  if (!str(it?.title, 60, 4)) e.push(`${k}：title 4～60 字`);
  if (!Array.isArray(it?.points) || it.points.length < 3 || it.points.length > 8 || !it.points.every(p => str(p, 140, 10))) e.push(`${k}：points 需 3～8 點，每點 10～140 字`);
  if (it?.context !== undefined && !str(it.context, 220, 10)) e.push(`${k}：context（背景脈絡）10～220 字`);
  if (it?.outlook !== undefined && !str(it.outlook, 160, 10)) e.push(`${k}：outlook（可能走向）10～160 字`);
  if (it?.watch !== undefined && !str(it.watch, 60, 4)) e.push(`${k}：watch（接下來看）4～60 字`);
  if (it?.stances !== undefined && (!Array.isArray(it.stances) || it.stances.length > 5 || !it.stances.every(s => str(s?.actor, 20) && str(s?.view, 120, 6)))) e.push(`${k}：stances 最多 5 筆 {actor 1～20 字, view 6～120 字}`);
  if (it?.actors !== undefined && (!Array.isArray(it.actors) || it.actors.length > 8 || !it.actors.every(a => str(a, 20)))) e.push(`${k}：actors 最多 8 個，每個 1～20 字`);
  if (!Array.isArray(it?.sources) || !it.sources.length || it.sources.length > 6 || !it.sources.every(s => httpsUrl(s?.url) && str(s?.publisher, 80))) e.push(`${k}：sources 需 1～6 筆 {publisher, url(https)}`);
  const zh = [it?.title, it?.context, it?.outlook, it?.watch, ...(it?.points || []), ...(it?.stances || []).flatMap(s => [s?.actor, s?.view]), ...(it?.actors || [])].filter(x => typeof x === 'string').join('');
  if (SIMPLIFIED.test(zh)) e.push(`${k}：含簡體字，請用臺灣繁體`);
  for (const q of zh.match(/「[^」]*」/g) || []) if (q.length > 27) e.push(`${k}：直接引用過長，請改寫成自己的話`);
  return e;
}
function checkFile(d) {
  if (!Array.isArray(d?.items)) return ['items 必須是陣列'];
  const errors = d.items.flatMap(checkItem), ids = new Set();
  for (const it of d.items) { if (ids.has(it.id)) errors.push(`id 重複：${it.id}`); ids.add(it.id); }
  if (d.items.length > 600) errors.push('超過 600 筆，請移除最舊的');
  return errors;
}

// { theater: { beat: item } }，每條線取最新一天、且在 3 天內的
function latestMap(now = Date.now(), file = FILE) {
  const out = {};
  for (const it of readJson(file, { items: [] }).items || []) {
    if (checkItem(it).length || now - Date.parse(`${it.date}T23:59:59+08:00`) > 3 * DAY) continue;
    const t = (out[it.theater] ||= {});
    if (!t[it.beat] || it.date > t[it.beat].date) t[it.beat] = it;
  }
  return out;
}

// 卡片：標題＋關鍵人物標籤＋前 3 點；其餘重點、背景、各方立場、可能走向收在「展開完整分析」
function beatHtml(it, { esc }, { showBeat = false } = {}) {
  if (!it) return '';
  const more = it.points.slice(3);
  const deep = [
    more.length ? `<ul>${more.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : '',
    it.context ? `<p><b>背景脈絡</b>：${esc(it.context)}</p>` : '',
    it.stances?.length ? `<p><b>各方立場</b></p><ul class="stances">${it.stances.map(s => `<li><b>${esc(s.actor)}</b>：${esc(s.view)}</li>`).join('')}</ul>` : '',
    it.outlook ? `<p><b>可能走向</b>：${esc(it.outlook)}</p>` : ''
  ].join('');
  return `<div class="beat"><p class="beat-meta">${showBeat ? `${ICON[it.beat]} ` : ''}${esc(BEATS[it.beat])}線｜${esc(it.date.slice(5).replace('-', '/'))}</p><h5>${esc(it.title)}</h5>
    ${it.actors?.length ? `<p class="beat-actors">${it.actors.map(a => `<span>${esc(a)}</span>`).join('')}</p>` : ''}
    <ul>${it.points.slice(0, 3).map(p => `<li>${esc(p)}</li>`).join('')}</ul>${deep ? `<details class="beat-more"><summary>展開完整分析</summary>${deep}</details>` : ''}${it.watch ? `<p class="beat-watch">👀 接下來看：${esc(it.watch)}</p>` : ''}
    <p class="beat-src">依據：${it.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.publisher)}</a>`).join('、')}｜本站自行整理</p></div>`;
}

// 主戰區橫幅下方的「更多面向」列（經濟、科技、輿論、資安）
function extraRow(theaterBeats = {}, helpers) {
  const cards = EXTRA_BEATS.map(b => beatHtml(theaterBeats[b], helpers, { showBeat: true })).filter(Boolean);
  return cards.length ? `<div class="band-extra"><h4>更多面向</h4><div class="beat-grid">${cards.join('')}</div></div>` : '';
}

// 熱點戰區與跨戰區（global）：沒有預警燈號，只放重點
function hotspotsHtml(map, helpers) {
  const order = [...Object.keys(HOTSPOTS), 'global'];
  const blocks = order.filter(id => map[id]).map(id => {
    const b = map[id], keys = ['SUM', ...MAIN_BEATS, ...EXTRA_BEATS].filter(k => b[k]);
    return `<section class="hot" id="hot-${id}"><h3>${esc0(helpers, THEATERS[id])}</h3><div class="beat-grid">${keys.map(k => beatHtml(b[k], helpers, { showBeat: true })).join('')}</div></section>`;
  });
  return blocks.join('');
}
const esc0 = (h, s) => h.esc(s);

const CSS = `.beat{background:rgba(255,255,255,.035);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:0 0 10px}
.beat-meta{margin:0;font-size:.78em;color:var(--dim)}.beat h5{margin:3px 0 6px;font-size:1em;line-height:1.45}.beat ul{margin:0 0 6px;padding-left:18px;font-size:.92em}.beat li{margin:3px 0}
.beat-actors{margin:0 0 6px;display:flex;flex-wrap:wrap;gap:4px}.beat-actors span{font-size:.74em;padding:1px 8px;border-radius:999px;border:1px solid var(--line);color:var(--dim)}
.beat-more{margin:2px 0 6px;font-size:.9em}.beat-more summary{cursor:pointer;color:var(--cyan);font-size:.92em}.beat-more p{margin:6px 0}.beat-more .stances{padding-left:18px}
.beat-watch{margin:4px 0;font-size:.88em;color:var(--cyan)}.beat-src{margin:4px 0 0;font-size:.76em;color:var(--dim)}
.beat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px;align-items:start}.beat-grid .beat{margin:0}
.band-extra{margin-top:10px;border-top:1px dashed var(--line);padding-top:10px}.band-extra h4{margin:0 0 6px;font-size:.92em;color:var(--dim)}
.hot{background:var(--panel);border:1px solid var(--line);border-top:4px solid #64748b;border-radius:12px;padding:12px 14px;margin:0 0 14px}.hot h3{margin:0 0 8px;font-size:1.1em}`;

module.exports = { FILE, BEATS, MAIN_BEATS, EXTRA_BEATS, THEATERS, MAIN_THEATERS, HOTSPOTS, checkItem, checkFile, latestMap, beatHtml, extraRow, hotspotsHtml, CSS };

if (require.main === module) {
  const f = process.argv[2] || FILE;
  let d; try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.error(`JSON 讀取失敗：${e.message}`); process.exit(1); }
  const errors = checkFile(d);
  if (errors.length) { console.error(`不合格 ${errors.length} 項：\n- ${errors.join('\n- ')}`); process.exit(1); }
  console.log(`合格：${f} 共 ${d.items.length} 筆`);
}
