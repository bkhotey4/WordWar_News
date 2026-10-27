// 官方旅遊警示與撤離通知（第一手 feed，不經新聞）：
//   美國國務院 Travel Advisories RSS（Level 1–4）、英國外交部 FCDO 旅遊建議 Atom（更新摘要）、
//   日本外務省海外安全情報 RSS（危険情報／スポット情報）、台灣外交部領事事務局旅遊警示 RSS（第一～四級）。
// 用途：各戰區「撤僑、使館人員撤離或旅遊警示升級」指標的官方來源（與媒體比對並列）。
// 只記錄公告本身：國家、等級、發布時間、原文連結；等級升高或出現撤離字樣才觸發。
const fs = require('fs');
const { guardClear } = require('./query_health');
const path = require('path');

const CACHE = path.join(__dirname, '../../research/source_cache/travel_advisories.json');
const HOUR = 3600_000, DAY = 24 * HOUR;
const UA = { 'User-Agent': 'Mozilla/5.0 WordWarNews/2.0 (personal research bot)' };
const FEEDS = {
  US: { url: 'https://travel.state.gov/_res/rss/TAsTWs.xml', publisher: '美國國務院（Travel Advisory）' },
  UK: { url: 'https://www.gov.uk/foreign-travel-advice.atom', publisher: '英國外交部（FCDO Travel Advice）' },
  JP: { url: 'https://www.anzen.mofa.go.jp/rss/news.xml', publisher: '日本外務省（海外安全情報）' },
  TW: { url: 'https://www.boca.gov.tw/sp-trwa-rss-1.xml', publisher: '中華民國外交部領事事務局（旅遊警示）' }
};
// 國家（各語言寫法）→ 戰區
const COUNTRY_THEATER = [
  [/^taiwan\b|台湾|臺灣|台灣/i, 'taiwan_strait'], [/^china\b|^people's republic of china|中国\b|中國大陸|中华人民共和国/i, 'taiwan_strait'],
  [/^iran\b|イラン|伊朗/i, 'iran_gulf'], [/^iraq\b|イラク|伊拉克/i, 'iran_gulf'], [/united arab emirates|アラブ首長国|阿拉伯聯合大公國/i, 'iran_gulf'], [/^qatar|カタール|卡達/i, 'iran_gulf'], [/^bahrain|バーレーン|巴林/i, 'iran_gulf'], [/^kuwait|クウェート|科威特/i, 'iran_gulf'], [/^oman\b|オマーン|阿曼/i, 'iran_gulf'], [/saudi arabia|サウジアラビア|沙烏地阿拉伯/i, 'iran_gulf'],
  [/^poland|ポーランド|波蘭/i, 'europe_security'], [/^lithuania|リトアニア|立陶宛/i, 'europe_security'], [/^latvia|ラトビア|拉脫維亞/i, 'europe_security'], [/^estonia|エストニア|愛沙尼亞/i, 'europe_security'], [/^romania|ルーマニア|羅馬尼亞/i, 'europe_security'], [/^belarus|ベラルーシ|白俄羅斯/i, 'europe_security'], [/^moldova|モルドバ|摩爾多瓦/i, 'europe_security'], [/^finland|フィンランド|芬蘭/i, 'europe_security'],
  [/^ukraine|ウクライナ|烏克蘭/i, 'ukraine_front'], [/^russia|ロシア|俄羅斯/i, 'ukraine_front'],
  [/north korea|democratic people's republic|北朝鮮|北韓/i, 'korea_peninsula'], [/south korea|^korea\b|韓国|南韓|韓國/i, 'korea_peninsula'],
  [/^israel|イスラエル|以色列/i, 'middle_east'], [/^lebanon|レバノン|黎巴嫩/i, 'middle_east'], [/^yemen|イエメン|葉門/i, 'middle_east'], [/^syria|シリア|敘利亞/i, 'middle_east'], [/^jordan|ヨルダン|約旦/i, 'middle_east'], [/west bank|gaza|パレスチナ|巴勒斯坦/i, 'middle_east'],
  [/^philippines|フィリピン|菲律賓/i, 'south_china_sea']
];
// 波灣國家的警示若明確針對葉門邊境（胡塞武裝相關），歸以巴／紅海戰區而非美伊
const YEMEN_BORDER_RE = /yemen|葉門|イエメン|najran|jizan|jazan|asir|border regions with yemen/i;
const theaterOf = (country, text = '') => {
  const theater = COUNTRY_THEATER.find(([re]) => re.test(country))?.[1] || null;
  return theater === 'iran_gulf' && YEMEN_BORDER_RE.test(text) ? 'middle_east' : theater;
};
const EVAC_RE = /ordered departure|authorized departure|depart(ure)? of (non-emergency|dependants|dependents|family)|leave (the country|now|immediately)|evacuat|withdraw(al|n)? of (dependants|staff|personnel)|embassy (has )?(suspended|closed)|儘速離境|退避|退避勧告|出国を|撤離|撤僑/i;

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { current: {}, events: [] }; } }
function writeCache(data, file = CACHE) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, file); }
const cdata = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (block, name) => cdata(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(block)?.[1]);
// 只有日期沒有時間的 pubDate（美國國務院）以 UTC 中午計，避免本機時區把日期往前推一天
const iso = v => { const s = String(v || '').trim(); const t = Date.parse(/\d{1,2}:\d{2}/.test(s) || !s ? s : `${s} 12:00:00 GMT`); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

// 每個 feed → 統一格式 { source, country, level(1–4|null), title, text, url, publishedAt }
function parseFeed(source, xml) {
  const out = [];
  if (source === 'US') {
    for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const title = tag(m[1], 'title'); const mm = /^(.+?)\s*-\s*Level\s*(\d)/i.exec(title); if (!mm) continue;
      out.push({ source, country: mm[1].trim(), level: Number(mm[2]), title, text: tag(m[1], 'description').slice(0, 600), url: tag(m[1], 'link'), publishedAt: iso(tag(m[1], 'pubDate')) });
    }
  } else if (source === 'UK') {
    for (const m of String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      const summary = tag(m[1], 'summary'), country = tag(m[1], 'title');
      const link = /<link[^>]+rel="alternate"[^>]+href="([^"]+)"/.exec(m[1])?.[1] || '';
      // FCDO 沒有數字等級；「advise against all travel」視為第 4 級、「all but essential」第 3 級
      const level = /advise against all travel to (the )?(whole|entire|all of)|advise against all travel\b(?! to (parts|some|areas|the following))/i.test(summary) ? 4 : /advise against all but essential travel/i.test(summary) ? 3 : null;
      out.push({ source, country, level, title: `${country}：${summary.slice(0, 120)}`, text: summary.slice(0, 600), url: link, publishedAt: iso(tag(m[1], 'updated')) });
    }
  } else if (source === 'JP') {
    for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const title = tag(m[1], 'title'), category = tag(m[1], 'category');
      const lv = /レベル\s*(\d)/.exec(title + ' ' + tag(m[1], 'description'));
      const country = /^([^：:（(]+?)(?:：|:|（|\(|の|に|へ)/.exec(title)?.[1]?.trim() || title.slice(0, 20);
      out.push({ source, country, level: lv ? Number(lv[1]) : null, title: `${category ? `[${category}] ` : ''}${title}`, text: tag(m[1], 'description').slice(0, 600), url: tag(m[1], 'link'), publishedAt: iso(tag(m[1], 'pubDate')) });
    }
  } else if (source === 'TW') {
    for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const title = tag(m[1], 'title'); const mm = /^第([一二三四])級[：:]\s*(\S+?)\s*-\s*([^-]+?)\s*-/.exec(title); if (!mm) continue;
      out.push({ source, country: mm[3].trim(), level: '一二三四'.indexOf(mm[1]) + 1, title, text: tag(m[1], 'description').slice(0, 600), url: tag(m[1], 'link'), publishedAt: iso(tag(m[1], 'pubDate')) });
    }
  }
  return out.filter(i => i.country && i.url && i.publishedAt);
}

let inFlight = null;
function refreshTravelAdvisories(options = {}) { if (!inFlight) inFlight = collect(options).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now() } = {}) {
  const cache = readCache(file);
  cache.current = cache.current || {}; cache.events = cache.events || []; cache.feeds = cache.feeds || {};
  if (!force && cache.lastAttempt && now - Date.parse(cache.lastAttempt) < 2 * HOUR) return cache;
  cache.lastAttempt = new Date(now).toISOString();
  let okCount = 0;
  for (const [source, feed] of Object.entries(FEEDS)) {
    try {
      const res = await fetchImpl(feed.url, { signal: AbortSignal.timeout(30000), headers: UA });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = parseFeed(source, await res.text());
      if (!items.length) throw new Error('feed empty or layout changed');
      for (const it of items) {
        const theater = theaterOf(it.country, `${it.title} ${it.text}`); if (!theater) continue;
        const key = `${source}:${it.country}`;
        const prev = cache.current[key];
        const evac = EVAC_RE.test(`${it.title} ${it.text}`);
        const raised = prev && it.level != null && prev.level != null && it.level > prev.level;
        const firstSeen = !prev;
        // 撤離字樣只在「新出現」時算事件：第 4 級國家的例行重發公告本來就寫著儘速離境，重發不代表情勢變化
        const newEvac = evac && !(prev && (prev.evac || (prev.evac === undefined && prev.level != null && prev.level >= 4 && it.level === prev.level)));
        // 事件：等級升高、或新出現撤離字樣（同一篇只記一次）
        if ((raised || newEvac) && !cache.events.some(e => e.url === it.url && e.publishedAt === it.publishedAt))
          cache.events.push({ source, publisher: feed.publisher, country: it.country, theater, kind: raised ? 'LEVEL_RAISED' : 'EVACUATION_TEXT', from: prev?.level ?? null, to: it.level, title: it.title.slice(0, 160), url: it.url, publishedAt: it.publishedAt, recordedAt: new Date(now).toISOString() });
        // 首次看到就記為目前等級（不算事件，因為沒有「之前」可比）
        if (firstSeen || Date.parse(it.publishedAt) >= Date.parse(prev.publishedAt)) cache.current[key] = { source, country: it.country, theater, level: it.level, evac, title: it.title.slice(0, 160), url: it.url, publishedAt: it.publishedAt };
      }
      cache.feeds[source] = { status: 'ONLINE', lastSuccess: new Date(now).toISOString(), items: items.length, error: null };
      okCount++;
    } catch (e) { cache.feeds[source] = { ...(cache.feeds[source] || {}), status: 'DEGRADED', error: e.message }; }
  }
  cache.events = cache.events.filter(e => now - Date.parse(e.publishedAt) <= 400 * DAY).slice(-500);
  Object.assign(cache, okCount ? { status: okCount === Object.keys(FEEDS).length ? 'ONLINE' : 'PARTIAL', lastSuccess: new Date(now).toISOString(), error: okCount === 4 ? null : Object.entries(cache.feeds).filter(([, f]) => f.status !== 'ONLINE').map(([k, f]) => `${k}: ${f.error}`).join('；') }
    : { status: 'DEGRADED', error: Object.values(cache.feeds).map(f => f.error).filter(Boolean).join('；') });
  writeCache(cache, file);
  return cache;
}

const LEVEL_WORD = { US: { 3: 'Level 3 Reconsider Travel', 4: 'Level 4 Do Not Travel' }, TW: { 3: '第三級橙色', 4: '第四級紅色' }, JP: { 3: 'レベル3 渡航中止勧告', 4: 'レベル4 退避勧告' }, UK: { 3: '不建議非必要旅行', 4: '不建議任何旅行' } };
// 近 14 天內該戰區國家：等級升到 3／4 級，或公告含撤離字樣 → 觸發
// 舊版快取記下的例行重發（第 4 級維持第 4 級又含撤離字樣）不算事件
const standingReissue = e => e.from != null && e.from === e.to && e.to >= 4;
function assessAdvisoriesRaw(cache, theaterId, now = Date.now()) {
  if (!cache?.lastSuccess || now - Date.parse(cache.lastSuccess) > 48 * HOUR) return null;
  const hits = (cache.events || []).filter(e => e.theater === theaterId && now - Date.parse(e.publishedAt) <= 14 * DAY && ((e.kind === 'EVACUATION_TEXT' && !standingReissue(e)) || (e.kind === 'LEVEL_RAISED' && e.to >= 3)))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const levels = Object.values(cache.current || {}).filter(c => c.theater === theaterId && c.level != null).map(c => `${c.source} ${c.country} ${c.level}`).slice(0, 8).join('、');
  if (!hits.length) return { status: 'CLEAR', observedAt: cache.lastSuccess, value: 0, unit: '則', summary: `近 14 天美、英、日、台官方旅遊警示沒有升到第 3／4 級或撤離公告${levels ? `（目前等級：${levels}）` : ''}。`, sources: [] };
  const top = hits[0];
  return { status: 'TRIGGERED', observedAt: top.publishedAt, value: hits.length, unit: '則',
    summary: `${top.publisher}：${top.country} ${top.kind === 'LEVEL_RAISED' ? `等級由 ${top.from ?? '—'} 升為 ${top.to}（${LEVEL_WORD[top.source]?.[top.to] || ''}）` : '公告含撤離／儘速離境字樣'}；${top.title.slice(0, 100)}${hits.length > 1 ? `；近 14 天共 ${hits.length} 則` : ''}`.slice(0, 300),
    sources: hits.slice(0, 3).filter((h, i, a) => a.findIndex(x => x.url === h.url) === i).map(h => ({ url: h.url, publisher: h.publisher, sourceClass: 'OFFICIAL', publishedAt: h.publishedAt })) };
}

// 部分來源超過 48 小時沒成功時，「沒有命中」改為無法判定
function assessAdvisories(cache, theaterId, now = Date.now()) {
  const queryOk = Object.fromEntries(Object.entries(cache?.feeds || {}).map(([k, v]) => [k, v.lastSuccess]));
  return guardClear(assessAdvisoriesRaw(cache, theaterId, now), cache?.feeds ? { queryOk } : {}, Object.keys(FEEDS), now, 48 * HOUR);
}

module.exports = { refreshTravelAdvisories, parseFeed, theaterOf, assessAdvisories, readCache, CACHE, FEEDS, EVAC_RE };
