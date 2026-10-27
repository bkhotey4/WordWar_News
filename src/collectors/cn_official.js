// 中國官方第一手發布：國防部新聞發言人談話與答記者問、國防部網「東部戰區」專欄、國台辦記者會。
// 用途：(1) 聯合戰備警巡、具名演習的官方公告（與媒體交叉比對並列）；(2) 官方言論強度指數：
//      關鍵詞加權計分，近 3 天合計超過過去 90 天的第 90 百分位才算升級（平常就常有強硬用語，不以單篇判定）。
// 只讀標題與正文的用語，不解讀意圖；國台辦網站對本機連線重置，改讀 Internet Archive 快照（記者會約兩週一次，延遲可接受）。
const fs = require('fs');
const { guardClear } = require('./query_health');
const path = require('path');

const CACHE = path.join(__dirname, '../../research/source_cache/cn_official.json');
const HOUR = 3600_000, DAY = 24 * HOUR;
const UA = { 'User-Agent': 'Mozilla/5.0 WordWarNews/2.0 (personal research bot)' };
const SOURCES = {
  mnd_spokesman: { list: 'http://www.mod.gov.cn/gfbw/xwfyr/fyrthhdjzw/index.html', publisher: '中國國防部新聞發言人', articles: true },
  eastern_theater: { list: 'http://www.mod.gov.cn/gfbw/wzll/dbzq/index.html', publisher: '中國國防部網（東部戰區）', articles: true },
  gwytb: { list: 'https://www.gwytb.gov.cn/xwdt/xwfb/xwfbh/', publisher: '國務院台灣事務辦公室（記者會）', archiveHosts: ['www.gwytb.gov.cn'], articles: true }
};
// 用語與權重；標題命中加倍
const KEYWORDS = [['勿谓言之不预', 4], ['不惜一切代价', 3], ['武统', 3], ['开战', 3], ['封控', 3], ['封锁', 3], ['正义使命', 3], ['联合利剑', 3], ['海峡雷霆', 3], ['联合战备警巡', 3],
  ['玩火', 2], ['自焚', 2], ['严正警告', 2], ['严厉警告', 2], ['坚决反制', 2], ['严惩', 2], ['惩戒', 2], ['武力', 2], ['警巡', 2], ['演习', 2], ['实弹', 2], ['粉碎', 2], ['迎头痛击', 3],
  ['必将', 1], ['决不', 1], ['绝不', 1], ['打击', 1], ['战争', 1], ['挑衅', 1], ['分裂', 1], ['台独', 1], ['不容', 1], ['越线', 1]];
const EXERCISE_RE = /演习|实弹|演练|联合利剑|海峡雷霆|正义使命/;
const PATROL_RE = /联合战备警巡|战备警巡/;
const TAIWAN_RE = /台|海峡|东部战区/;

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { items: {} }; } }
function writeCache(data, file = CACHE) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, file); }
const strip = html => String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const cst = s => { const m = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], (+m[4] || 12) - 8, +m[5] || 0)).toISOString() : null; };

// 國防部網列表：<a href="…html"> … <p class="title">標題</p> <small class="time">2026-10-11 11:19</small>
function parseModList(html) {
  const out = [];
  for (const m of String(html).matchAll(/<a\s+href="(https?:\/\/www\.mod\.gov\.cn\/[^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const title = /class="title"[^>]*>\s*([^<]+?)\s*</.exec(m[2])?.[1], time = /class="time[^"]*"[^>]*>\s*([^<]+?)\s*</.exec(m[2])?.[1];
    const publishedAt = cst(time);
    if (title && publishedAt) out.push({ url: m[1], title: title.trim(), publishedAt });
  }
  return out;
}
// 國台辦列表（結構未固定）：連結文字當標題，連結後 300 字內的第一個日期當發布日
function parseGenericList(html, base) {
  const out = [];
  const text = String(html);
  for (const m of text.matchAll(/<a\s+[^>]*href="([^"]+\.html?)"[^>]*>([^<]{8,120})<\/a>/g)) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 300);
    const date = /\d{4}-\d{2}-\d{2}/.exec(after)?.[0] || /\d{4}-\d{2}-\d{2}/.exec(text.slice(Math.max(0, m.index - 200), m.index))?.[0];
    if (!date) continue;
    let url; try { url = new URL(m[1], base).href; } catch { continue; }
    out.push({ url, title: m[2].trim(), publishedAt: cst(date) });
  }
  return out.filter((x, i, a) => a.findIndex(y => y.url === x.url) === i);
}
// 正文：從內容容器（article-content／TRS_Editor／zhengwen，否則第一個 <p>）起到頁尾標記（责任编辑、相关稿件、分享等）止；不依賴巢狀 div 配對
function parseArticle(html) {
  const s = String(html);
  const start = [/<div[^>]+class="[^"]*\b(?:article-content|TRS_Editor|zhengwen|TRS_UEDITOR)\b[^"]*"[^>]*>/i, /<div[^>]+id="(?:article-content|zoom|Zoom|content)"[^>]*>/i, /<p[\s>]/i]
    .map(re => re.exec(s)?.index).find(i => Number.isInteger(i));
  const text = strip(start === undefined ? s : s.slice(start));
  const end = [/责任编辑/, /相关稿件/, /相关新闻/, /分享到/, /打印本页/, /版权所有/, /免责声明/, /上一篇/].map(re => re.exec(text)?.index).filter(Number.isInteger);
  return text.slice(0, end.length ? Math.min(...end) : undefined).replace(/^.*?来源：\S+\s*\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?\s*/, '').trim().slice(0, 3000);
}
function score(title, text = '') {
  let s = 0; const hits = [];
  for (const [kw, w] of KEYWORDS) {
    const t = (title.match(new RegExp(kw, 'g')) || []).length, b = (text.match(new RegExp(kw, 'g')) || []).length;
    if (t || b) { s += t * w * 2 + Math.min(b, 5) * w; hits.push(kw); }
  }
  return { score: s, hits };
}

// 國防部網只有 http（https 憑證錯誤），自行抓取並依字元集解碼
async function getHtml(url, fetchImpl) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(30000), headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return require('../archive_fetch').bodyText(res);
}

let inFlight = null;
function refreshCnOfficial(options = {}) { if (!inFlight) inFlight = collect(options).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now(), maxArticles = 8 } = {}) {
  const cache = readCache(file);
  cache.items = cache.items || {}; cache.sources = cache.sources || {};
  if (!force && cache.lastAttempt && now - Date.parse(cache.lastAttempt) < 3 * HOUR) return cache;
  cache.lastAttempt = new Date(now).toISOString();
  let ok = 0;
  for (const [key, src] of Object.entries(SOURCES)) {
    try {
      let html, via = 'DIRECT', dataAsOf = null;
      if (src.archiveHosts) { const page = await require('../archive_fetch').fetchDirectOrArchive(src.list, { hosts: src.archiveHosts, fetchImpl, maxAgeHours: 24 * 21, now, timeoutMs: 15000 }); html = page.text; via = page.via; dataAsOf = page.archivedAt; }
      else html = await getHtml(src.list, fetchImpl);
      const list = src.archiveHosts ? parseGenericList(html, src.list) : parseModList(html);
      if (!list.length) throw new Error('list empty or layout changed');
      for (const it of list) {
        const prev = cache.items[it.url];
        cache.items[it.url] = { ...(prev || {}), source: key, publisher: src.publisher, url: it.url, title: it.title, publishedAt: it.publishedAt, firstSeenAt: prev?.firstSeenAt || new Date(now).toISOString(), ...(prev?.text ? {} : score(it.title)) };
      }
      cache.sources[key] = { status: via === 'ARCHIVE' ? 'ONLINE_VIA_ARCHIVE' : 'ONLINE', lastSuccess: new Date(now).toISOString(), items: list.length, via, dataAsOf, error: null };
      ok++;
    } catch (e) { cache.sources[key] = { ...(cache.sources[key] || {}), status: 'DEGRADED', error: e.message }; }
  }
  // 國防部網文章正文（近 90 天、尚未抓過的），每次最多 maxArticles 篇
  let fetched = 0;
  for (const it of Object.values(cache.items).filter(i => SOURCES[i.source]?.articles && !i.text && now - Date.parse(i.publishedAt) <= 90 * DAY).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))) {
    if (fetched >= maxArticles) break;
    try {
      const hosts = SOURCES[it.source].archiveHosts;
      const html = hosts ? (await require('../archive_fetch').fetchDirectOrArchive(it.url, { hosts, fetchImpl, maxAgeHours: 24 * 60, now, timeoutMs: 15000 })).text : await getHtml(it.url, fetchImpl);
      it.text = parseArticle(html); Object.assign(it, score(it.title, it.text)); fetched++;
    }
    catch (e) { it.textError = e.message; }
    await new Promise(r => setTimeout(r, 500));
  }
  for (const [url, it] of Object.entries(cache.items)) if (now - Date.parse(it.publishedAt) > 400 * DAY) delete cache.items[url];
  Object.assign(cache, ok ? { status: ok === Object.keys(SOURCES).length ? 'ONLINE' : 'PARTIAL', lastSuccess: new Date(now).toISOString(), error: Object.entries(cache.sources).filter(([, s]) => s.status === 'DEGRADED').map(([k, s]) => `${k}: ${s.error}`).join('；') || null, articlesFetched: fetched }
    : { status: 'DEGRADED', error: Object.values(cache.sources).map(s => s.error).filter(Boolean).join('；') });
  writeCache(cache, file);
  return cache;
}

const quantile = (values, q) => { const s = [...values].sort((a, b) => a - b); return s[Math.max(0, Math.ceil(q * s.length) - 1)]; };
const src = it => ({ url: it.url, publisher: it.publisher, sourceClass: 'OFFICIAL', publishedAt: it.publishedAt });
// key：PATROL（72 小時內官方發布聯合戰備警巡）、EXERCISE（7 天內官方發布涉台演習）、RHETORIC（近 3 天用語加權分超過 90 日 P90）
function assessCnOfficialRaw(cache, key, now = Date.now()) {
  if (!cache?.lastSuccess || now - Date.parse(cache.lastSuccess) > 48 * HOUR) return null;
  const items = Object.values(cache.items || {}).filter(i => Number.isFinite(Date.parse(i.publishedAt)) && Date.parse(i.publishedAt) <= now);
  const recent = (hours, re) => items.filter(i => now - Date.parse(i.publishedAt) <= hours * HOUR && re.test(i.title) && TAIWAN_RE.test(i.title)).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  if (key === 'PATROL' || key === 'EXERCISE') {
    const hits = key === 'PATROL' ? recent(72, PATROL_RE) : recent(7 * 24, EXERCISE_RE);
    const label = key === 'PATROL' ? '聯合戰備警巡' : '涉台演習';
    if (!hits.length) return { status: 'CLEAR', observedAt: cache.lastSuccess, value: 0, unit: '則', summary: `近 ${key === 'PATROL' ? '72 小時' : '7 天'}中國國防部、東部戰區與國台辦官方發布沒有${label}公告。`, sources: [] };
    const top = hits[0];
    return { status: 'TRIGGERED', observedAt: top.publishedAt, value: hits.length, unit: '則', summary: `${top.publisher}官方發布：「${top.title.slice(0, 80)}」（${top.publishedAt.slice(0, 10)}）${hits.length > 1 ? `，共 ${hits.length} 則` : ''}。`, sources: hits.slice(0, 2).map(src) };
  }
  if (key === 'RHETORIC') {
    const dayKey = t => new Date((typeof t === 'number' ? t : Date.parse(t)) + 8 * HOUR).toISOString().slice(0, 10);
    const daily = {};
    for (const i of items) if (now - Date.parse(i.publishedAt) <= 93 * DAY && TAIWAN_RE.test(i.title + (i.text || '').slice(0, 300))) daily[dayKey(i.publishedAt)] = (daily[dayKey(i.publishedAt)] || 0) + (i.score || 0);
    const sum3 = end => { let s = 0; for (let d = 0; d < 3; d++) s += daily[dayKey(end - d * DAY)] || 0; return s; };
    const current = sum3(now);
    const samples = []; for (let d = 3; d <= 90; d++) samples.push(sum3(now - d * DAY));
    const covered = Math.min(90, Math.round((now - Math.min(...items.map(i => Date.parse(i.publishedAt)), now)) / DAY));
    if (covered < 30) return { status: 'UNKNOWN', observedAt: cache.lastSuccess, summary: `官方言論資料累積中（${covered} 天，需 30 天以上才判定）。`, sources: [] };
    const p90 = quantile(samples, 0.9);
    const top = items.filter(i => now - Date.parse(i.publishedAt) <= 3 * DAY && (i.score || 0) > 0).sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    const trig = current > p90 && current > 0;
    return { status: trig ? 'TRIGGERED' : 'CLEAR', observedAt: top?.publishedAt || cache.lastSuccess, value: current, unit: '分', baseline: { p90, windowDays: 90, samples: samples.length },
      summary: `近 3 天中國官方涉台發布用語加權分 ${current}（90 日 P90 為 ${p90}）${top ? `；最高：${top.publisher}「${top.title.slice(0, 60)}」，用語：${(top.hits || []).slice(0, 5).join('、')}` : ''}。只計用語強度，不解讀意圖。`.slice(0, 300),
      sources: top ? [src(top)] : [] };
  }
  return null;
}

// 部分來源超過 48 小時沒成功時，「沒有命中」改為無法判定
function assessCnOfficial(cache, key, now = Date.now()) {
  const queryOk = Object.fromEntries(Object.entries(cache?.sources || {}).map(([k, v]) => [k, v.lastSuccess]));
  return guardClear(assessCnOfficialRaw(cache, key, now), cache?.sources ? { queryOk } : {}, Object.keys(SOURCES), now, 48 * HOUR);
}

module.exports = { refreshCnOfficial, parseModList, parseGenericList, parseArticle, score, assessCnOfficial, readCache, CACHE, SOURCES, KEYWORDS };
