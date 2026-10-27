// 期刊新文章：直接讀外交期刊、軍事評論與智庫的公開 RSS，列出近 7 天與本站戰區相關的新文章（原文標題＋連結＋中文主題標籤）。
// 不翻譯、不轉載內文；每次產生網頁時重新抓取，不需要另外的排程任務。
const fs = require('fs');
const path = require('path');
const { fetchText } = require('../src/win_fetch');

// ── 中文導讀（由戰況撰稿排程寫入 research/journal_digest.json；本站自行撰寫的摘要，非全文翻譯）──
const FILE = path.join(__dirname, '..', 'research', 'journal_digest.json');
const CATEGORIES = { DIPLOMACY: '外交期刊', MILITARY: '軍事戰略評論', THINK_TANK: '國防外交智庫', ECONOMY: '經濟安全智庫', JAPAN: '日本觀點', TAIWAN: '台灣觀點' };
const ACCESS = { FULL: '已讀全文', PARTIAL: '僅讀公開段落', ABSTRACT: '僅讀摘要' };
const THEATERS = { korea_peninsula: '朝鮮半島', taiwan_strait: '台海', iran_gulf: '美伊與荷莫茲', europe_security: '歐洲與北約', ukraine_front: '烏俄', middle_east: '以巴與紅海', south_china_sea: '南海', global: '全球' };
const SIMPLIFIED = /[图视软频为这们说开关发时会来对国过还进动战经济]/;

const str = (v, max, min = 1) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
const httpsUrl = v => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password && v.length <= 600; } catch { return false; } };

function readDigest(file = FILE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { items: [] }; } }

// 每筆的格式檢查；回傳錯誤訊息陣列
function checkItem(it, now = Date.now()) {
  const e = [], k = it?.id || '(無 id)';
  if (!/^[a-z0-9-]{4,100}$/.test(it?.id || '')) e.push(`${k}：id 只能用小寫英數與連字號`);
  if (!str(it?.title, 300)) e.push(`${k}：title（原文標題）必填`);
  if (!str(it?.titleZh, 120)) e.push(`${k}：titleZh（中文標題，120 字內）必填`);
  if (!str(it?.publication, 80)) e.push(`${k}：publication 必填`);
  if (!Object.hasOwn(CATEGORIES, it?.category)) e.push(`${k}：category 必須是 ${Object.keys(CATEGORIES).join('／')}`);
  if (!Object.hasOwn(ACCESS, it?.access)) e.push(`${k}：access 必須是 FULL／PARTIAL／ABSTRACT`);
  if (!httpsUrl(it?.url)) e.push(`${k}：url 必須是 https`);
  const t = Date.parse(it?.publishedAt);
  if (!Number.isFinite(t) || t > now + 3600_000) e.push(`${k}：publishedAt 無效或在未來`);
  if (!str(it?.summary, 400, 60)) e.push(`${k}：summary 需 60～400 字（用自己的話摘要，不是翻譯全文）`);
  if (!str(it?.taiwanRelevance, 200, 15)) e.push(`${k}：taiwanRelevance 需 15～200 字`);
  if (it?.theater !== undefined && !Object.hasOwn(THEATERS, it.theater)) e.push(`${k}：theater 不在清單內`);
  if (it?.author !== undefined && !str(it.author, 120)) e.push(`${k}：author 太長`);
  if (it?.keyPoints !== undefined && (!Array.isArray(it.keyPoints) || it.keyPoints.length < 2 || it.keyPoints.length > 5 || !it.keyPoints.every(p => str(p, 140, 10)))) e.push(`${k}：keyPoints 需 2～5 點，每點 10～140 字`);
  if (it?.outlook !== undefined && !str(it.outlook, 200, 10)) e.push(`${k}：outlook（作者研判或預測）10～200 字`);
  const zh = [it?.titleZh, it?.summary, it?.taiwanRelevance, it?.outlook, ...(it?.keyPoints || [])].join('');
  if (SIMPLIFIED.test(zh)) e.push(`${k}：含簡體字，請用臺灣繁體`);
  // 引號內直接引用最多 25 字，避免大段轉載
  for (const q of zh.match(/「[^」]*」/g) || []) if (q.length > 27) e.push(`${k}：直接引用過長（${q.slice(0, 12)}…），請改寫成自己的話`);
  return e;
}
function checkDigest(d, now = Date.now()) {
  if (!Array.isArray(d?.items)) return ['items 必須是陣列'];
  const errors = d.items.flatMap(it => checkItem(it, now));
  const ids = new Set(), urls = new Set();
  for (const it of d.items) {
    if (ids.has(it.id)) errors.push(`id 重複：${it.id}`); ids.add(it.id);
    if (urls.has(it.url)) errors.push(`url 重複：${it.url}`); urls.add(it.url);
  }
  if (d.items.length > 120) errors.push('超過 120 筆，請移除最舊的');
  return errors;
}

function validItems(now = Date.now(), file = FILE) {
  return (readDigest(file).items || []).filter(it => !checkItem(it, now).length)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

function card(it, { esc, link, md }) {
  return `<article class="jcard" data-cat="${esc(it.category)}" data-text="${esc([it.titleZh, it.title, it.publication, it.summary, it.taiwanRelevance].join(' ').toLowerCase())}">
    <p class="meta"><span class="pub">${esc(it.publication)}</span>｜${esc(CATEGORIES[it.category])}｜${esc(md(it.publishedAt))}${it.theater ? `｜${esc(THEATERS[it.theater])}` : ''}</p>
    <h3>${esc(it.titleZh)}</h3>
    <p class="orig">${link(it.url, it.title)}${it.author ? `｜${esc(it.author)}` : ''}</p>
    <p>${esc(it.summary)}</p>
    ${it.keyPoints?.length ? `<ul class="jk">${it.keyPoints.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    ${it.outlook ? `<p class="jo"><b>作者研判：</b>${esc(it.outlook)}</p>` : ''}
    <p class="tw"><b>對台灣的意義：</b>${esc(it.taiwanRelevance)}</p>
    <p class="muted small">本站中文導讀，非全文翻譯｜${esc(ACCESS[it.access])}</p>
  </article>`;
}



const FEEDS = [
  { name: 'Foreign Affairs', cat: '外交期刊', url: 'https://www.foreignaffairs.com/rss.xml' },
  { name: 'Foreign Policy', cat: '外交期刊', url: 'https://foreignpolicy.com/feed/' },
  { name: 'The Diplomat', cat: '外交期刊', url: 'https://thediplomat.com/feed/' },
  { name: 'War on the Rocks', cat: '軍事戰略評論', url: 'https://warontherocks.com/feed/' },
  { name: 'CSIS', cat: '智庫', url: 'https://www.csis.org/rss.xml' },
  { name: 'CSIS AMTI', cat: '智庫', url: 'https://amti.csis.org/feed/' },
  { name: 'RAND', cat: '智庫', url: 'https://www.rand.org/pubs/commentary.xml' },
  { name: 'Lowy Interpreter', cat: '智庫', url: 'https://www.lowyinstitute.org/the-interpreter/rss.xml' }
];
// 主題標籤（中文），標題或分類命中才收錄
const TOPICS = [
  ['台海', /\bTaiwan|Taipei|Cross-Strait|Lai Ching-te/i],
  ['中國', /\bChina|Chinese|Beijing|\bPLA\b|Xi Jinping|\bCCP\b/i],
  ['美伊', /\bIran|Tehran|Hormuz|Persian Gulf|Houthi/i],
  ['俄烏', /\bRussia|Ukrain|Kyiv|Kremlin|Putin/i],
  ['北約', /\bNATO\b|Poland|Baltic|Eastern Flank/i],
  ['南海', /South China Sea|Philippin|Scarborough|Spratly|Second Thomas/i],
  ['日韓', /\bJapan|Korea|Pyongyang/i]
];
const DAY = 86400_000;

const decode = s => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&#8217;|&rsquo;/g, '’').replace(/&#8216;|&lsquo;/g, '‘').replace(/&#8220;|&ldquo;/g, '“').replace(/&#8221;|&rdquo;/g, '”')
  .replace(/&#8211;|&ndash;/g, '–').replace(/&#8212;|&mdash;/g, '—').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim();

function parseFeed(xml, feed) {
  const blocks = [...String(xml).matchAll(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/g)].map(m => m[0]);
  return blocks.map(b => {
    const get = tag => (b.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`)) || [])[1];
    const linkHref = (b.match(/<link\b[^>]*href="([^"]+)"/) || [])[1];
    const url = decode(get('link')) || linkHref;
    const date = decode(get('pubDate') || get('published') || get('updated') || get('dc:date'));
    const cats = [...b.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/g)].map(m => decode(m[1])).join(' ');
    return { title: decode(get('title')), url, publishedAt: new Date(date), cats, publication: feed.name, category: feed.cat };
  }).filter(i => i.title && /^https:\/\//.test(i.url || '') && i.publishedAt && Number.isFinite(i.publishedAt.getTime()))
    .map(i => ({ ...i, publishedAt: i.publishedAt.toISOString() }));
}

function tagItems(items, now = Date.now(), days = 7) {
  const seen = new Set();
  return items.filter(i => now - Date.parse(i.publishedAt) <= days * DAY && Date.parse(i.publishedAt) <= now + 3600_000)
    .map(i => ({ ...i, tags: TOPICS.filter(([, re]) => re.test(`${i.title} ${i.cats}`)).map(([t]) => t) }))
    .filter(i => i.tags.length && !seen.has(i.url) && seen.add(i.url))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

async function collect({ now = Date.now(), fetcher = fetchText } = {}) {
  const items = [], errors = [];
  for (const f of FEEDS) {
    try { items.push(...parseFeed(await fetcher(f.url, { hosts: [new URL(f.url).hostname] }), f)); }
    catch (e) { errors.push(`${f.name}：${e.message}`); }
  }
  return { items: tagItems(items, now), errors };
}

function row(it, { esc, link, md }) {
  return `<li class="jrow" data-cat="${esc(it.category)}" data-tags="${esc(it.tags.join(' '))}" data-text="${esc(`${it.title} ${it.publication}`.toLowerCase())}">
    <div class="jt">${link(it.url, it.title)}</div>
    <div class="jm"><span class="pub">${esc(it.publication)}</span>｜${esc(md(it.publishedAt))}${it.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></li>`;
}

function homeSection(items, helpers, digest = []) {
  const recentDigest = digest.slice(0, 4);
  const dHtml = recentDigest.length ? `<h3>中文導讀</h3><div class="jgrid">${recentDigest.map(it => card(it, helpers)).join('\n')}</div><p><a href="digest.html">看每週導讀彙整 →</a></p>` : '';
  if (!items.length) return dHtml + '<p class="muted">近 7 天沒有抓到與各戰區相關的期刊新文章。</p>';
  return `${dHtml}<h3>近 7 天新文章（原文標題）</h3><p class="muted small">直接取自各期刊與智庫的公開 RSS，列出原文標題與連結（英文原文，部分需付費訂閱）。</p>
    <ul class="jlist">${items.slice(0, 8).map(it => row(it, helpers)).join('\n')}</ul><p><a href="journals.html">看近 7 天全部 ${items.length} 篇 →</a></p>`;
}

function journalsPage(items, { esc, link, md, tpe, now, errors = [], digest = [] }) {
  const tags = TOPICS.map(([t]) => t).filter(t => items.some(i => i.tags.includes(t)));
  return `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>期刊新文章｜WorldWar 戰況情報站</title><meta name="description" content="Foreign Affairs、Foreign Policy、The Diplomat、War on the Rocks、CSIS、RAND 等外交與戰略期刊近 7 天的相關新文章。">
<link rel="canonical" href="https://bkhotey4.github.io/wordwar-intel/journals.html"><link rel="stylesheet" href="style.css"></head><body>
<header class="top"><div class="brand"><h1>期刊新文章</h1><p>近 7 天｜共 ${items.length} 篇｜最後更新 ${esc(tpe(now))}（台北）</p></div><nav><a href="index.html">← 回首頁</a><a href="archive.html">報導彙整</a></nav></header>
<main class="narrow">
<p class="notice small">標題與連結直接取自各期刊、智庫的公開 RSS，本站只加上中文主題標籤，不翻譯也不轉載內文；部分期刊需付費訂閱才能閱讀全文。觀點屬原作者。</p>
<div class="filters"><input id="q" type="search" placeholder="搜尋標題，例如 deterrence、Hormuz" aria-label="搜尋標題">
<div class="chips"><button class="chip on" data-t="">全部</button>${tags.map(t => `<button class="chip" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div><p class="muted" id="count"></p></div>
${digest.length ? `<h2>中文導讀（${digest.length} 篇）</h2><p><a href="digest.html">依週查看過去的導讀 →</a></p><div class="jgrid">${digest.map(it => card(it, { esc, link, md })).join('\n')}</div><h2>近 7 天新文章（原文標題）</h2>` : ''}
<ul class="jlist">${items.map(it => row(it, { esc, link, md })).join('\n') || '<li class="muted">近 7 天沒有相關新文章。</li>'}</ul>
${errors.length ? `<p class="muted small">本次無法讀取：${esc(errors.map(e => e.split('：')[0]).join('、'))}</p>` : ''}
</main>
<style>.narrow{max-width:1000px;margin:0 auto;padding:16px}.filters{position:sticky;top:0;background:var(--bg);padding:10px 0;z-index:1}#q{width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--text);font-size:16px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.chip{background:transparent;color:var(--dim);border:1px solid var(--line);border-radius:999px;padding:4px 12px;cursor:pointer;font:inherit}.chip.on{background:var(--cyan);color:#0b1220;border-color:var(--cyan);font-weight:700}</style>
<script>
const q=document.getElementById('q'),chips=[...document.querySelectorAll('.chip')],rows=[...document.querySelectorAll('.jrow')],count=document.getElementById('count');let t='';
function apply(){const k=q.value.trim().toLowerCase();let n=0;for(const r of rows){const ok=(!t||r.dataset.tags.split(' ').includes(t))&&(!k||r.dataset.text.includes(k));r.style.display=ok?'':'none';if(ok)n++;}count.textContent='顯示 '+n+' 篇';}
q.addEventListener('input',apply);chips.forEach(c=>c.addEventListener('click',()=>{chips.forEach(x=>x.classList.remove('on'));c.classList.add('on');t=c.dataset.t;apply();}));apply();
</script></body></html>`;
}

const CSS = `.jk{margin:4px 0 6px;padding-left:18px;font-size:.92em}.jk li{margin:2px 0}.jo{margin:4px 0;padding:6px 10px;border-left:2px solid #a78bfa;background:rgba(167,139,250,.08);border-radius:0 6px 6px 0;font-size:.92em}
.jlist{list-style:none;padding:0;margin:0;display:grid;gap:8px}
.jrow{background:var(--panel);border:1px solid var(--line);border-left:4px solid #a78bfa;border-radius:8px;padding:8px 14px}
.jt a{color:var(--text);font-weight:600;text-decoration:none}.jt a:hover{text-decoration:underline;color:var(--cyan)}
.jm{color:var(--dim);font-size:.88em;margin-top:2px}.jm .pub{color:#c4b5fd;font-weight:600}
.tag{display:inline-block;margin-left:6px;padding:0 8px;border-radius:999px;border:1px solid var(--line);font-size:.85em;color:var(--text)}
.jgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px}
.jcard{background:var(--panel);border:1px solid var(--line);border-left:4px solid #a78bfa;border-radius:10px;padding:12px 16px}
.jcard h3{margin:2px 0 4px;font-size:1.1em}.jcard .orig{font-size:.88em;margin:0 0 6px;color:var(--dim)}.jcard .pub{color:#c4b5fd;font-weight:600}
.jcard .tw{background:rgba(0,229,255,.06);border-radius:6px;padding:6px 10px}`;

module.exports = { card, THEATERS, readDigest, checkItem, checkDigest, validItems, FILE, CATEGORIES, ACCESS, FEEDS, TOPICS, parseFeed, tagItems, collect, homeSection, journalsPage, CSS };
