// 盟方官方聲明：日本防衛省「お知らせ」RSS、美國國防部（war.gov）新聞稿 RSS、以 Google News 限定美國政府網域搜尋國務院與印太司令部聲明。
// 用途：美日官方公開點名中方在台海或南海的異常、危險或脅迫行動時，通常已用其機密管道確認過——是公開資料中最接近「內部確認」的訊號。
// 只採用官方網域的原文標題；媒體轉述不算。也收日本防衛省的北韓飛彈公告，作為朝鮮半島飛彈指標的官方來源。
const fs = require('fs');
const path = require('path');

const CACHE = path.join(__dirname, '../../research/source_cache/ally_statements.json');
const HOUR = 3600_000, DAY = 24 * HOUR;
const UA = { 'User-Agent': 'WordWarNews/2.0 (personal research bot)' };
const OFFICIAL_HOSTS = /(^|\.)(state\.gov|war\.gov|defense\.gov|pacom\.mil|whitehouse\.gov|mod\.go\.jp|mofa\.go\.jp|navy\.mil)$/;
const GNEWS_Q = '(site:state.gov OR site:war.gov OR site:defense.gov OR site:pacom.mil) (China OR PRC OR PLA OR Chinese) (Taiwan OR "South China Sea" OR Philippines OR Philippine OR Scarborough OR "Second Thomas") when:14d';
const FEEDS = [
  { id: 'mod_jp', publisher: '日本防衛省', url: 'https://www.mod.go.jp/j/rss/news.xml' },
  { id: 'war_gov', publisher: '美國國防部（war.gov）', url: 'https://www.war.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=9&Site=945&max=30' },
  { id: 'us_gov_search', publisher: '美國政府網站（Google News 限定 .gov／.mil 網域）', url: `https://news.google.com/rss/search?q=${encodeURIComponent(GNEWS_Q)}&hl=en-US&gl=US&ceid=US:en`, gnews: true }
];

const CHINA = /China|Chinese|PRC|PLA\b|People's Liberation|中国|中國/i;
const TAIWAN = /Taiwan|Taiwan Strait|台湾|台灣|東シナ海|尖閣|与那国|East China Sea/i;
const SCS = /South China Sea|Philippine|Scarborough|Second Thomas|Sabina|Spratly|南シナ海|フィリピン/i;
const CALLOUT = /unsafe|unprofessional|coerci|provocat|aggressi|destabiliz|condemn|concern|intimidat|dangerous|reckless|blockade|harass|water cannon|laser|ram|抗議|懸念|遺憾|危険|威圧|挑発/i;
const DPRK_MISSILE = /北朝鮮のミサイル|North Korea[n]? .*(missile|launch)|DPRK .*(missile|launch)/i;

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { items: [] }; } }
function writeCache(data, file = CACHE) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, file); }
const decode = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const tag = (xml, name) => decode((xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)) || [])[1]);

function classify(title) {
  const tags = [];
  if (DPRK_MISSILE.test(title)) tags.push('DPRK_MISSILE');
  if (CHINA.test(title) && TAIWAN.test(title)) tags.push(CALLOUT.test(title) ? 'TW_CALLOUT' : 'TW_MENTION');
  if (CHINA.test(title) && SCS.test(title)) tags.push(CALLOUT.test(title) ? 'SCS_CALLOUT' : 'SCS_MENTION');
  return tags;
}

// RSS 2.0 項目；Google News 版只收 <source url> 為官方網域者，標題去掉「 - 發布單位」尾巴
function parseRss(xml, feed) {
  const out = [];
  for (const it of String(xml).split('<item>').slice(1)) {
    let title = tag(it, 'title'), link = tag(it, 'link');
    try { link = new URL(link, feed.url).href; } catch { link = ''; } // 日本防衛省 RSS 用相對網址
    const published = Date.parse(tag(it, 'pubDate') || tag(it, 'dc:date'));
    let publisher = feed.publisher;
    if (feed.gnews) {
      const src = it.match(/<source url="([^"]+)">([^<]*)<\/source>/);
      let host = ''; try { host = new URL(src?.[1] || '').hostname; } catch { /* 沒有來源網址 */ }
      if (!OFFICIAL_HOSTS.test(host)) continue;
      publisher = decode(src[2]) || host;
      title = title.replace(/\s+-\s+[^-]+$/, '');
    }
    if (!title || !Number.isFinite(published) || !/^https:\/\//.test(link)) continue;
    const tags = classify(title);
    if (!tags.length) continue;
    out.push({ id: `${feed.id}:${link}`, feed: feed.id, title: title.slice(0, 200), url: link, publisher, publishedAt: new Date(published).toISOString(), tags });
  }
  return out;
}

let inFlight = null;
function refreshAllyStatements(options = {}) { if (!inFlight) inFlight = collect(options).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now() } = {}) {
  const cache = readCache(file);
  if (!force && cache.lastAttempt && now - Date.parse(cache.lastAttempt) < HOUR) return cache;
  cache.lastAttempt = new Date(now).toISOString();
  const errors = [], byId = new Map((cache.items || []).map(i => [i.id, i]));
  let ok = 0;
  for (const feed of FEEDS) {
    try {
      const res = await fetchImpl(feed.url, { signal: AbortSignal.timeout(30000), headers: UA, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      if (!/<rss|<channel/.test(xml)) throw new Error('不是 RSS');
      for (const i of parseRss(xml, feed)) byId.set(i.id, i);
      ok++;
    } catch (e) { errors.push(`${feed.publisher}：${e.message}`); }
  }
  const items = [...byId.values()].filter(i => now - Date.parse(i.publishedAt) <= 60 * DAY).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  Object.assign(cache, { items, errors, status: ok === FEEDS.length ? 'ONLINE' : ok ? 'PARTIAL' : 'DEGRADED' });
  if (ok) cache.lastSuccess = new Date(now).toISOString();
  cache.error = errors.join('；') || null;
  writeCache(cache, file);
  return cache;
}

// kind：TW_CALLOUT／SCS_CALLOUT（72 小時內）、DPRK_MISSILE（48 小時內）
function assessAlly(cache, kind, now = Date.now()) {
  if (!cache?.lastSuccess || now - Date.parse(cache.lastSuccess) > 12 * HOUR) return null;
  const win = kind === 'DPRK_MISSILE' ? 48 * HOUR : 72 * HOUR;
  const hits = (cache.items || []).filter(i => i.tags.includes(kind) && now - Date.parse(i.publishedAt) <= win && Date.parse(i.publishedAt) <= now + HOUR);
  const label = { TW_CALLOUT: '美日官方點名中方在台海或東海的危險、脅迫或挑釁行動', SCS_CALLOUT: '美日官方點名中方在南海的危險、脅迫或挑釁行動', DPRK_MISSILE: '日本防衛省公布北韓飛彈發射' }[kind];
  if (!hits.length) return { status: 'CLEAR', observedAt: cache.lastSuccess, summary: `近 ${win / HOUR} 小時沒有${label}的官方原文。`, sources: [] };
  const h = hits[0];
  return { status: 'TRIGGERED', observedAt: h.publishedAt, summary: `${label}：${h.publisher}「${h.title}」${hits.length > 1 ? `等 ${hits.length} 則` : ''}`,
    sources: hits.slice(0, 3).map(i => ({ url: i.url, publisher: i.publisher, sourceClass: 'OFFICIAL', publishedAt: i.publishedAt })) };
}

module.exports = { refreshAllyStatements, assessAlly, parseRss, classify, readCache, CACHE, FEEDS };
