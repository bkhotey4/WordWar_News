// 中國內政背景（第一層：可量測的官方訊號）
//   1. 黨／國家對台論調：中國台灣網（國台辦官方入口）時政要聞與評論、新華台灣頻道的標題，
//      分「和統類」與「脅迫類」用語，近 14 天脅迫用語占比對比過去 90 天的 P90。
//   2. 軍方高層人事：中國軍網「軍委」「戰區」專欄的任免、審查調查標題，近 30 天達 2 則即觸發。
//   3. 政治行事曆：research/cn_political_calendar.json（兩會、北戴河、全會、建軍百年等），只作背景，不改變等級。
// 內政是慢變數：以上皆為次要指標或背景，不推高主要等級；只計用語與公告，不解讀意圖。
// 為什麼不用人民日報／新華時政 RSS：本機連到的是過期快取頁；全國人大網列表是 JavaScript 動態載入，罷免公告改由每週研究稿人工查核。
const fs = require('fs');
const path = require('path');

const CACHE = path.join(__dirname, '../../research/source_cache/cn_politics.json');
const CALENDAR = path.join(__dirname, '../../research/cn_political_calendar.json');
const HOUR = 3600_000, DAY = 24 * HOUR;
const SOURCES = {
  taiwan_cn_politics: { url: 'https://www.taiwan.cn/xwzx/PoliticsNews/', publisher: '中國台灣網（國台辦）時政要聞', kind: 'TONE' },
  taiwan_cn_comment: { url: 'https://www.taiwan.cn/plzhx/', publisher: '中國台灣網（國台辦）評論', kind: 'TONE' },
  xinhua_tw: { url: 'https://www.news.cn/tw/', publisher: '新華網台灣頻道', kind: 'TONE' },
  pla_jw: { url: 'http://www.81.cn/jw_208551/index.html', publisher: '中國軍網「軍委」', kind: 'PERSONNEL' },
  pla_zq: { url: 'http://www.81.cn/zq_208553/index.html', publisher: '中國軍網「戰區」', kind: 'PERSONNEL' }
};
const TAIWAN_RE = /台|两岸|金门|马祖|澎湖/;
const PEACE_RE = /和平统一|融合发展|两岸一家亲|交流|协商|和平发展|同胞|惠台|融合|心灵契合|共同家园|合作/g;
const COERCE_RE = /武力|惩戒|顽固|分裂|军事|打击|严惩|反分裂国家法|绝不承诺|战争|制裁|围岛|演习|警巡|封控|清算|台独势力|不会得逞|自取灭亡|玩火|粉碎/g;
const PERSONNEL_RE = /任命|任免|免去|免职|罢免|撤销.{0,6}职务|审查调查|接受调查|开除党籍|撤职|违纪违法|落马|逮捕|军衔晋升|晋升上将/;
const MILITARY_RE = /军委|战区|司令员|政委|参谋长|上将|中将|少将|火箭军|海军|空军|陆军|武警|军队|解放军|国防部长|部长/;

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { items: {} }; } }
function writeCache(data, file = CACHE) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, file); }
function readCalendar(file = CALENDAR) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { regular: [], milestones: [], pendingDates: [] }; } }

// 中國台灣網：<h2 class="list-item-title"><a href="URL" title="標題">…</a></h2> … <p class="date">2026-10-14</p>；評論頁沒有日期，取網址的 tYYYYMMDD
function parseTaiwanCn(html) {
  const out = [];
  for (const m of String(html).matchAll(/<h2 class="list-item-title[^"]*">\s*<a href="(https?:\/\/www\.taiwan\.cn\/[^"]+\.html?)"[^>]*title="([^"]+)"[^>]*>[\s\S]*?<\/h2>([\s\S]{0,600}?)(?=<li|$)/g)) {
    const date = /<p class="date">\s*(\d{4}-\d{2}-\d{2})/.exec(m[3])?.[1] || (/\/t(\d{4})(\d{2})(\d{2})_/.exec(m[1]) ? m[1].replace(/.*\/t(\d{4})(\d{2})(\d{2})_.*/, '$1-$2-$3') : null);
    if (date) out.push({ url: m[1], title: m[2].trim(), publishedAt: `${date}T04:00:00Z`, dateBasis: 'PAGE' });
  }
  return out;
}
// 新華台灣：網址含日期 /tw/YYYYMMDD/…/c.html
function parseXinhuaTw(html) {
  const out = [];
  for (const m of String(html).matchAll(/<a href=['"](https?:\/\/www\.news\.cn\/tw\/(\d{4})(\d{2})(\d{2})\/[^'"]+\.html)['"][^>]*>([^<]{6,120})<\/a>/g)) out.push({ url: m[1], title: m[5].trim(), publishedAt: `${m[2]}-${m[3]}-${m[4]}T04:00:00Z`, dateBasis: 'URL' });
  return out.filter((x, i, a) => a.findIndex(y => y.url === x.url) === i);
}
// 中國軍網專欄：<div class="title"><a href="…html">標題</a>；頁面沒有逐篇日期，以首次看到的時間為準（每 3 小時巡檢）
function parse81(html) {
  const out = [];
  for (const m of String(html).matchAll(/<a href="(https?:\/\/www\.81\.cn\/[^"]+\/\d+\.html)"[^>]*>\s*([^<]{8,120}?)\s*<\/a>/g)) if (!/^全文$|^更多/.test(m[2])) out.push({ url: m[1], title: m[2].trim(), publishedAt: null, dateBasis: 'FIRST_SEEN' });
  return out.filter((x, i, a) => a.findIndex(y => y.url === x.url) === i);
}
function toneOf(title) {
  if (!TAIWAN_RE.test(title)) return null;
  const peace = (title.match(PEACE_RE) || []).length, coerce = (title.match(COERCE_RE) || []).length;
  return { peace, coerce, cls: coerce > peace ? 'COERCE' : peace > coerce ? 'PEACE' : (coerce ? 'MIXED' : 'NEUTRAL') };
}

let inFlight = null;
function refreshCnPolitics(options = {}) { if (!inFlight) inFlight = collect(options).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now() } = {}) {
  const cache = readCache(file);
  cache.items = cache.items || {}; cache.sources = cache.sources || {};
  if (!force && cache.lastAttempt && now - Date.parse(cache.lastAttempt) < 3 * HOUR) return cache;
  cache.lastAttempt = new Date(now).toISOString();
  let ok = 0;
  for (const [key, src] of Object.entries(SOURCES)) {
    try {
      // 中國台灣網對自報名稱的機器人 UA 回 403，一般瀏覽器標頭即可；與國防部、海事局採集相同做法（win_fetch.BROWSER_HEADERS）
      const res = await fetchImpl(src.url, { signal: AbortSignal.timeout(30000), headers: { ...require('../win_fetch').BROWSER_HEADERS, 'Accept-Language': 'zh-CN,zh;q=0.9' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await require('../archive_fetch').bodyText(res);
      const list = /taiwan\.cn/.test(src.url) ? parseTaiwanCn(html) : /news\.cn/.test(src.url) ? parseXinhuaTw(html) : parse81(html);
      if (!list.length) throw new Error('list empty or layout changed');
      for (const it of list) {
        const prev = cache.items[it.url];
        const publishedAt = it.publishedAt || prev?.publishedAt || new Date(now).toISOString();
        const tone = src.kind === 'TONE' ? toneOf(it.title) : null;
        const personnel = src.kind === 'PERSONNEL' && PERSONNEL_RE.test(it.title) && MILITARY_RE.test(it.title);
        cache.items[it.url] = { ...(prev || {}), source: key, publisher: src.publisher, url: it.url, title: it.title, publishedAt, dateBasis: it.dateBasis, firstSeenAt: prev?.firstSeenAt || new Date(now).toISOString(), tone, personnel };
      }
      cache.sources[key] = { status: 'ONLINE', lastSuccess: new Date(now).toISOString(), items: list.length, error: null };
      ok++;
    } catch (e) { cache.sources[key] = { ...(cache.sources[key] || {}), status: 'DEGRADED', error: e.message }; }
  }
  for (const [url, it] of Object.entries(cache.items)) if (now - Date.parse(it.publishedAt) > 400 * DAY) delete cache.items[url];
  Object.assign(cache, ok ? { status: ok === Object.keys(SOURCES).length ? 'ONLINE' : 'PARTIAL', lastSuccess: new Date(now).toISOString(), error: Object.entries(cache.sources).filter(([, s]) => s.status === 'DEGRADED').map(([k, s]) => `${k}: ${s.error}`).join('；') || null }
    : { status: 'DEGRADED', error: Object.values(cache.sources).map(s => s.error).filter(Boolean).join('；') });
  writeCache(cache, file);
  return cache;
}

const quantile = (values, q) => { const s = [...values].sort((a, b) => a - b); return s[Math.max(0, Math.ceil(q * s.length) - 1)]; };
const src = it => ({ url: it.url, publisher: it.publisher, sourceClass: 'OFFICIAL', publishedAt: it.publishedAt });
const validItems = (cache, now) => Object.values(cache.items || {}).filter(i => Number.isFinite(Date.parse(i.publishedAt)) && Date.parse(i.publishedAt) <= now);
// 近 14 天「脅迫類／（脅迫類＋和統類）」
function toneStats(items, end) {
  const win = items.filter(i => i.tone && i.tone.cls !== 'NEUTRAL' && Date.parse(i.publishedAt) <= end && end - Date.parse(i.publishedAt) <= 14 * DAY);
  const coerce = win.filter(i => i.tone.cls === 'COERCE' || i.tone.cls === 'MIXED').length, peace = win.filter(i => i.tone.cls === 'PEACE').length;
  return { n: win.length, coerce, peace, share: coerce + peace ? coerce / (coerce + peace) : null };
}
// 每日和統／脅迫標題數（給走勢圖；台北日期）
function toneSeries(cache, now = Date.now(), days = 90) {
  const items = validItems(cache, now).filter(i => i.tone && i.tone.cls !== 'NEUTRAL');
  const out = [];
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(now - d * DAY + 8 * HOUR).toISOString().slice(0, 10);
    const day = items.filter(i => new Date(Date.parse(i.publishedAt) + 8 * HOUR).toISOString().slice(0, 10) === date);
    out.push({ date, coerce: day.filter(i => i.tone.cls !== 'PEACE').length, peace: day.filter(i => i.tone.cls === 'PEACE').length, share14: toneStats(items, now - d * DAY).share });
  }
  return out;
}
// key：TONE（脅迫占比超過 90 日 P90 且脅迫類 ≥ 5 則）、PERSONNEL（30 天內軍方任免／審查公告 ≥ 2 則）
function assessCnPolitics(cache, key, now = Date.now()) {
  if (!cache?.lastSuccess || now - Date.parse(cache.lastSuccess) > 48 * HOUR) return null;
  const items = validItems(cache, now);
  if (key === 'TONE') {
    const cur = toneStats(items, now);
    const oldest = Math.min(...items.map(i => Date.parse(i.publishedAt)), now);
    const covered = Math.round((now - oldest) / DAY);
    if (covered < 30 || cur.n < 10) return { status: 'UNKNOWN', observedAt: cache.lastSuccess, summary: `對台論調基線累積中（資料 ${Math.min(covered, 999)} 天、近 14 天涉台標題 ${cur.n} 則；需 30 天與 10 則以上）。`, sources: [] };
    const samples = []; for (let d = 14; d <= 90; d++) { const s = toneStats(items, now - d * DAY); if (s.share !== null && s.n >= 5) samples.push(s.share); }
    if (samples.length < 15) return { status: 'UNKNOWN', observedAt: cache.lastSuccess, summary: `對台論調基線樣本不足（${samples.length}／15）。`, sources: [] };
    const p90 = quantile(samples, 0.9);
    const trig = cur.share !== null && cur.share > p90 && cur.coerce >= 5;
    const top = items.filter(i => i.tone?.cls === 'COERCE' && now - Date.parse(i.publishedAt) <= 14 * DAY).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
    return { status: trig ? 'TRIGGERED' : 'CLEAR', observedAt: top?.publishedAt || cache.lastSuccess, value: Math.round((cur.share || 0) * 100), unit: '%', baseline: { p90: Math.round(p90 * 100), windowDays: 90, samples: samples.length },
      summary: `近 14 天國台辦入口與新華台灣頻道涉台標題 ${cur.n} 則，脅迫類用語占 ${Math.round((cur.share || 0) * 100)}%（90 日 P90 ${Math.round(p90 * 100)}%）${trig ? '，論調明顯轉硬' : '，在常態範圍內'}${top ? `；例：「${top.title.slice(0, 40)}」` : ''}。只計用語，不解讀意圖。`.slice(0, 300),
      sources: top ? [src(top)] : [] };
  }
  if (key === 'PERSONNEL') {
    const hits = items.filter(i => i.personnel && now - Date.parse(i.publishedAt) <= 30 * DAY).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    if (!hits.length) return { status: 'CLEAR', observedAt: cache.lastSuccess, value: 0, unit: '則', summary: '近 30 天中國軍網軍委／戰區專欄沒有軍方高層任免或審查調查的公告標題。', sources: [] };
    const trig = hits.length >= 2;
    return { status: trig ? 'TRIGGERED' : 'CLEAR', observedAt: hits[0].publishedAt, value: hits.length, unit: '則', summary: `近 30 天軍方高層人事／審查公告 ${hits.length} 則${trig ? '（達 2 則，整肅或改組期間通常影響近期作戰準備）' : ''}：「${hits[0].title.slice(0, 50)}」${hits[0].dateBasis === 'FIRST_SEEN' ? '（日期為本站首次看到）' : ''}。`.slice(0, 300), sources: hits.slice(0, 2).map(src) };
  }
  return null;
}

// 網站頁面與 API 用
function cnPoliticsPanel(cache = readCache(), now = Date.now()) {
  const items = validItems(cache, now).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const cal = readCalendar();
  const upcoming = (cal.milestones || []).filter(m => Date.parse(`${m.date}T00:00:00+08:00`) >= now - 3 * DAY).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  const brief = it => ({ title: it.title, url: it.url, publisher: it.publisher, publishedAt: it.publishedAt, dateBasis: it.dateBasis });
  return { generatedAt: new Date(now).toISOString(), status: cache.status || 'UNKNOWN', lastSuccess: cache.lastSuccess || null,
    sources: Object.fromEntries(Object.entries(SOURCES).map(([k, s]) => [k, { publisher: s.publisher, url: s.url, ...(cache.sources?.[k] || { status: 'UNKNOWN' }) }])),
    tone: assessCnPolitics(cache, 'TONE', now), personnel: assessCnPolitics(cache, 'PERSONNEL', now),
    toneSeries: toneSeries(cache, now),
    recentCoercive: items.filter(i => i.tone?.cls === 'COERCE').slice(0, 8).map(brief),
    recentPeace: items.filter(i => i.tone?.cls === 'PEACE').slice(0, 5).map(brief),
    recentPersonnel: items.filter(i => i.personnel).slice(0, 10).map(brief),
    calendar: { regular: cal.regular || [], upcoming, pendingDates: cal.pendingDates || [] },
    note: '內政是慢變數：以上只計官方標題用語與公告，不解讀意圖；行事曆只作背景，不改變等級。' };
}

module.exports = { refreshCnPolitics, parseTaiwanCn, parseXinhuaTw, parse81, toneOf, toneSeries, assessCnPolitics, cnPoliticsPanel, readCache, readCalendar, CACHE, CALENDAR, SOURCES };
