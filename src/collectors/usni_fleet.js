// 美軍航艦動態：讀 USNI News「Fleet and Marine Tracker」週報 RSS，依文中「In the …」段落統計各海域的航艦（CVN）。
// 西太平洋（含日本、南海、東海、菲律賓海）≥3 艘 → 台海次要指標；中東海域（阿拉伯海、紅海、阿曼灣、波斯灣、亞丁灣）≥2 艘 → 美伊次要指標。
// 週報超過 10 天沒更新就回「無法判定」。航艦位置為 USNI 依公開資料整理的概略位置。
const fs = require('fs');
const path = require('path');

const CACHE = path.join(__dirname, '../../research/source_cache/usni_fleet.json');
// 分類 feed 從 2026-10-13 起不再更新（週報其實照常出刊），所以先用站內搜尋 feed，再退回全站 feed 和分類 feed
const FEEDS = ['https://news.usni.org/?s=%22Fleet+and+Marine+Tracker%22&feed=rss2', 'https://news.usni.org/feed', 'https://news.usni.org/category/fleet-tracker/feed'];
const HOUR = 3600_000, DAY = 24 * HOUR;
const REGIONS = {
  WESTPAC: { name: '西太平洋', re: /South\s*China Sea|East China Sea|Philippine Sea|Western Pacific|7th Fleet|Sea of Japan|Japan|Guam|Okinawa|Taiwan|Yellow Sea|Korea/i, theater: 'taiwan_strait', threshold: 3 },
  MIDEAST: { name: '中東海域', re: /Arabian Sea|Red Sea|Gulf of Oman|Persian Gulf|Arabian Gulf|Gulf of Aden|Middle East|Strait of Hormuz/i, theater: 'iran_gulf', threshold: 2 },
  EUROPE: { name: '歐洲海域', re: /Mediterranean|North Sea|Norwegian Sea|Baltic|Eastern Atlantic|Norway/i },
  OTHER: { name: '其他海域', re: /./ }
};
const CVN_NAMES = { 68: 'Nimitz', 69: 'Eisenhower', 70: 'Carl Vinson', 71: 'Theodore Roosevelt', 72: 'Abraham Lincoln', 73: 'George Washington', 74: 'John C. Stennis', 75: 'Harry S. Truman', 76: 'Ronald Reagan', 77: 'George H.W. Bush', 78: 'Gerald R. Ford', 79: 'John F. Kennedy' };

const decode = s => String(s || '').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&nbsp;| /g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

// 解析一篇週報：每個 <h2>「In the …」段落裡出現的 (CVN-xx)
function parseTracker(contentHtml) {
  const parts = String(contentHtml).split(/<h2[^>]*>/i).slice(1);
  const carriers = new Map();
  for (const p of parts) {
    const heading = decode(p.split(/<\/h2>/i)[0].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    const region = Object.entries(REGIONS).find(([, r]) => r.re.test(heading))[0];
    for (const m of p.matchAll(/\(CVN[\s-]?(\d{2})\)/g)) {
      const hull = Number(m[1]);
      if (!carriers.has(hull)) carriers.set(hull, { hull, name: CVN_NAMES[hull] || `CVN-${hull}`, region, where: heading.replace(/^In (the )?/i, '') });
    }
  }
  return [...carriers.values()].sort((a, b) => a.hull - b.hull);
}

function parseItem(item) {
  const get = tag => (item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)) || [])[1] || '';
  const content = (get('content:encoded').match(/<!\[CDATA\[([\s\S]*?)\]\]>/) || [])[1] || get('content:encoded');
  const d = new Date(get('pubDate'));
  const url = decode(get('link')).trim();
  if (!Number.isFinite(d.getTime()) || !/^https:\/\//.test(url)) return null;
  return { title: decode(get('title').replace(/<!\[CDATA\[|\]\]>/g, '')).trim(), url, publishedAt: d.toISOString(), carriers: parseTracker(content) };
}
// 全站 feed 夾雜一般新聞，只取標題是週報、且有解析到航艦的最新一篇
function parseFeed(xml) {
  const items = [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => parseItem(m[1])).filter(x => x && /Fleet (and Marine )?Tracker/i.test(x.title) && x.carriers.length);
  return items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0] || null;
}

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
let inFlight = null;
function refreshUsniFleet(opts = {}) { if (!inFlight) inFlight = collect(opts).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now() } = {}) {
  const prev = readCache(file) || {};
  if (!force && prev.lastAttempt && now - Date.parse(prev.lastAttempt) < 6 * HOUR) return prev;
  let out, latest = null; const errors = [];
  for (const feed of FEEDS) {
    try {
      const res = await fetchImpl(feed, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Mozilla/5.0 WorldWarNews/2.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const found = parseFeed(await res.text());
      if (!found) throw new Error('找不到週報內容');
      if (!latest || Date.parse(found.publishedAt) > Date.parse(latest.publishedAt)) latest = found;
      if (now - Date.parse(latest.publishedAt) <= 8 * DAY) break; // 週報每週出刊，夠新就不用再抓下一個（每個 feed 都近 1 MB）
    } catch (e) { errors.push(e.message); }
  }
  // 舊快取比這次抓到的新時保留舊的，避免三個 feed 都落後時日期倒退
  if (latest && prev.latest && Date.parse(prev.latest.publishedAt) > Date.parse(latest.publishedAt)) latest = prev.latest;
  if (latest) out = { lastAttempt: new Date(now).toISOString(), lastSuccess: new Date(now).toISOString(), status: 'ONLINE', error: null, latest };
  else out = { ...prev, lastAttempt: new Date(now).toISOString(), status: 'OFFLINE', error: errors.join('；') || '找不到週報內容' };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(out, null, 1)); fs.renameSync(tmp, file);
  return out;
}

function counts(latest) {
  const c = {}; for (const k of Object.keys(REGIONS)) c[k] = 0;
  for (const x of latest?.carriers || []) c[x.region]++;
  return c;
}

// 給預警看板：週報 10 天內才判定
function assessCarriers(cache, theater, now = Date.now()) {
  const l = cache?.latest;
  if (!l || now - Date.parse(l.publishedAt) > 10 * DAY) return null;
  const [key, r] = Object.entries(REGIONS).find(([, v]) => v.theater === theater) || [];
  if (!key) return null;
  const list = l.carriers.filter(x => x.region === key);
  const md = l.publishedAt.slice(5, 10).replace('-', '/');
  const names = list.map(x => `${x.name}（${x.where}）`).join('、') || '無';
  const src = [{ url: l.url, publisher: 'USNI News Fleet Tracker', sourceClass: 'INDEPENDENT_MEDIA', publishedAt: l.publishedAt }];
  if (list.length >= r.threshold) return { status: 'TRIGGERED', observedAt: l.publishedAt, sources: src, summary: `USNI ${md} 週報：${r.name}有 ${list.length} 艘航艦（門檻 ${r.threshold}）：${names}。`.slice(0, 300) };
  return { status: 'CLEAR', observedAt: l.publishedAt, sources: src, summary: `USNI ${md} 週報：${r.name}有 ${list.length} 艘航艦（門檻 ${r.threshold}）：${names}。`.slice(0, 300) };
}

// 網站側欄
function fleetPanel(cache, esc, now = Date.now()) {
  const l = cache?.latest; if (!l) return '';
  const c = counts(l), stale = now - Date.parse(l.publishedAt) > 10 * DAY;
  // 週報超過 10 天：位置可能早就變了，放在最上面明講天數、清單變淡（預警看板此時也已不採用）
  const age = Math.floor((now - Date.parse(l.publishedAt)) / DAY);
  return `${stale ? `<p class="fleet-stale">⚠️ USNI 已 ${age} 天沒有發布新週報，以下是 ${esc(l.publishedAt.slice(5, 10).replace('-', '/'))} 的位置，現況可能不同；預警燈號目前不採用這份資料。</p>` : ''}<ul class="fleet${stale ? ' is-stale' : ''}">${['WESTPAC', 'MIDEAST', 'EUROPE', 'OTHER'].map(k => `<li><b>${esc(REGIONS[k].name)}</b> ${c[k]} 艘<span class="muted small">${l.carriers.filter(x => x.region === k).map(x => ` ${esc(x.name)}`).join('、')}</span></li>`).join('')}</ul>
  <p class="muted small">資料：<a href="${esc(l.url)}" target="_blank" rel="noopener">USNI News 艦隊追蹤</a>（${esc(l.publishedAt.slice(0, 10))}）${stale ? '｜<b>週報已超過 10 天未更新，僅供參考</b>' : ''}；概略位置。</p>`;
}

const CSS = `.fleet{list-style:none;padding:0;margin:0}.fleet li{padding:3px 0;border-bottom:1px solid var(--line)}.fleet.is-stale{opacity:.55}.fleet-stale{margin:0 0 6px;padding:6px 8px;border:1px solid #b45309;border-radius:6px;color:#fbbf24;font-size:.85em}`;

module.exports = { refreshUsniFleet, parseTracker, parseFeed, assessCarriers, fleetPanel, counts, readCache, CACHE, CSS, REGIONS };
