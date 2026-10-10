// 歐洲與北約東翼自動指標：以 Google News 標題比對「領空遭侵犯」與「戰機緊急升空／機場關閉」，
// 同一天同一類事件有 2 家以上不同媒體報導才算確認（72 小時內有效）。沒有確認事件時回報「未觸發」，
// 讓預警燈號在研究紀錄過期時也能判定，而不是顯示「無法判定」。
const fs = require('fs');
const path = require('path');
const { parseRss } = require('./pla_joint');

const CACHE = path.join(__dirname, '../../research/source_cache/nato_flank.json');
const HOUR = 3600_000;
const COUNTRY = /\b(Poland|Polish|Romania|Romanian|Lithuania|Latvia|Estonia|Baltic|Moldova|Slovakia|Finland)\b|波蘭|羅馬尼亞|立陶宛|拉脫維亞|愛沙尼亞|波羅的海/i;
const QUERIES = [
  '(Poland OR Romania OR Lithuania OR Latvia OR Estonia) ("airspace violation" OR "violated airspace" OR "entered airspace" OR "drone incursion" OR "drone crashed") when:3d',
  '(Poland OR Romania) ("scrambled" OR "fighter jets" OR "airport closed" OR "airports closed") (Russian OR Russia) when:3d',
  '(波蘭 OR 羅馬尼亞 OR 波羅的海) (領空 OR 無人機 OR 戰機升空 OR 緊急升空) when:3d'
];
const feedUrl = q => /[一-鿿]/.test(q)
  ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`
  : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

// AIRSPACE：領空遭侵犯／無人機墜落境內；RESPONSE：戰機升空、機場關閉、交戰規則
function classify(title) {
  const t = String(title || '');
  if (!COUNTRY.test(t)) return null;
  // 回顧、調查結案、評論類標題不是新事件
  if (/investigat|inquir|prosecut|probe|closed (the )?case|closes (the )?(case|investigation|probe)|anniversar|lessons|analysis|opinion|explain|\bhow\b|\bwhy\b|\bwhat\b|challenge|highlights|years? (after|ago)|months? (after|ago)|調查|週年|回顧|分析|評論/i.test(t)) return null;
  if (/airspace (violation|was violated)|violat\w* (\w+ ){0,2}airspace|entered (\w+ )?airspace|incursion|drone (crash|fell|debris|wreck)|debris (found|fell)|領空|墜落|殘骸/i.test(t)) return 'AIRSPACE';
  if (/scrambl|fighter jets|jets (were )?(sent|deployed)|airports? (closed|shut|suspend)|rules of engagement|緊急升空|戰機升空|機場關閉/i.test(t)) return 'RESPONSE';
  return null;
}

const taipeiDate = iso => new Date(Date.parse(iso) + 8 * HOUR).toISOString().slice(0, 10);
function buildEvents(items, now = Date.now()) {
  const groups = new Map();
  for (const it of items) {
    if (Date.parse(it.publishedAt) > now + 10 * 60_000) continue;
    const type = classify(it.title); if (!type) continue;
    const id = `${type}|${taipeiDate(it.publishedAt)}`;
    const g = groups.get(id) || { id, type, date: taipeiDate(it.publishedAt), items: [] };
    if (!g.items.some(x => x.url === it.url)) g.items.push(it);
    groups.set(id, g);
  }
  return [...groups.values()].map(g => {
    g.items.sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
    const publishers = [...new Set(g.items.map(i => i.publisher))];
    return { ...g, publishers, confirmed: publishers.length >= 2, firstSeen: g.items[0].publishedAt, items: g.items.slice(0, 6) };
  }).sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));
}

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
let inFlight = null;
function refreshNatoFlank(opts = {}) { if (!inFlight) inFlight = collect(opts).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now() } = {}) {
  const prev = readCache(file) || { items: [] };
  if (!force && prev.lastAttempt && now - Date.parse(prev.lastAttempt) < 30 * 60_000) return prev;
  const errors = [], fresh = [];
  for (const q of QUERIES) {
    try {
      const res = await fetchImpl(feedUrl(q), { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 WordWarNews/2.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fresh.push(...parseRss(await res.text()));
    } catch (e) { errors.push(`${q.slice(0, 24)}…: ${e.message}`); }
  }
  const items = [...new Map([...(prev.items || []), ...fresh].filter(i => now - Date.parse(i.publishedAt) <= 14 * 24 * HOUR).map(i => [i.url, i])).values()];
  const out = { lastAttempt: new Date(now).toISOString(), lastSuccess: errors.length * 2 <= QUERIES.length ? new Date(now).toISOString() : prev.lastSuccess || null,
    status: errors.length ? (errors.length < QUERIES.length ? 'DEGRADED' : 'OFFLINE') : 'ONLINE', errors, items, events: buildEvents(items, now) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(out, null, 1)); fs.renameSync(tmp, file);
  return out;
}

// 給預警看板：72 小時內有確認事件 → 觸發；來源 12 小時內有更新但沒有確認事件 → 未觸發；來源過期 → 無法判定
function assessNato(cache, type, now = Date.now()) {
  if (!cache?.lastSuccess || now - Date.parse(cache.lastSuccess) > 12 * HOUR || (cache.lastAttempt && Date.parse(cache.lastAttempt) - Date.parse(cache.lastSuccess) > 2 * HOUR)) return null;
  const recent = (cache.events || []).filter(e => e.type === type && now - Date.parse(e.firstSeen) <= 72 * HOUR && Date.parse(e.firstSeen) <= now);
  const label = type === 'AIRSPACE' ? '領空遭侵犯' : '戰機升空或機場關閉';
  const hit = recent.find(e => e.confirmed);
  if (!hit) return { status: 'CLEAR', observedAt: cache.lastSuccess, sources: [],
    summary: `近 72 小時沒有 2 家以上媒體確認的${label}${recent.length ? `（另有 ${recent.length} 則單一媒體報導待確認）` : ''}。` };
  const uniq = hit.items.filter((it, i, arr) => arr.findIndex(x => x.publisher === it.publisher) === i).slice(0, 3);
  return { status: 'TRIGGERED', observedAt: hit.firstSeen,
    summary: `${hit.date.slice(5).replace('-', '/')} ${hit.publishers.length} 家媒體報導${label}：${uniq[0].title.slice(0, 90)}`,
    sources: uniq.map(it => ({ url: it.url, publisher: it.publisher, sourceClass: 'INDEPENDENT_MEDIA', publishedAt: it.publishedAt })) };
}

module.exports = { refreshNatoFlank, classify, buildEvents, assessNato, readCache, CACHE, QUERIES };
