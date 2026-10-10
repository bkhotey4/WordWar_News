// 台灣民生與供應鏈指標：非天候因素的大規模停電、外島航班船班停駛、半導體供應鏈管制、戰爭相關假訊息查核量。
// 停電、外島交通：同一天 2 家以上不同媒體報導才算確認（72 小時內有效）。
// 半導體管制、假訊息查核：平常就常出現，和過去 30 天的「3 日數量」比較，超過第 90 百分位才算異常（累積 10 天後才判定）。
const fs = require('fs');
const path = require('path');
const { parseRss } = require('./pla_joint');
const { baselineCheck, mergeDaily } = require('./diplomacy');

const CACHE = path.join(__dirname, '../../research/source_cache/taiwan_civil.json');
const HOUR = 3600_000, DAY = 24 * HOUR, KEEP_DAYS = 35;
const LABELS = { POWER: '非天候因素的大規模停電或電力設施受損', ISLANDS: '外島航班或船班停駛（排除天候）', CHIPS: '半導體與關鍵材料管制', DISINFO: '戰爭相關假訊息查核', MOBIL: '中國民船徵用、集結或國防動員', PANIC: '民眾因戰爭疑慮搶購物資' };
const BASELINE_TYPES = new Set(['CHIPS', 'DISINFO']);

const NEWS_QUERIES = [
  '(停電 OR 限電 OR 跳機 OR 變電所) (台灣 OR 台電) when:3d',
  '(Taiwan) (blackout OR "power outage" OR "power plant") when:3d',
  '(金門 OR 馬祖 OR 澎湖 OR 小三通) (航班 OR 船班 OR 停駛 OR 停航 OR 取消) when:3d',
  '(晶片 OR 半導體 OR 稀土 OR 鎵 OR 鍺) (出口管制 OR 實體清單 OR 禁運 OR 限制出口) when:2d',
  '(chip OR semiconductor OR "rare earth" OR gallium OR germanium) ("export controls" OR "entity list" OR ban OR restrictions) (China OR Taiwan OR TSMC) when:2d',
  '(滾裝船 OR 民船 OR 海上民兵 OR 國防動員 OR 動員令 OR 徵用) (解放軍 OR 共軍 OR 中共 OR 中國) when:3d',
  '(China OR PLA) ("ro-ro" OR "roll-on" OR ferries OR "civilian vessels" OR "maritime militia" OR mobilization) when:3d',
  '(搶購 OR 囤貨 OR 缺貨 OR 搶米 OR 排隊加油) (戰爭 OR 開戰 OR 軍演 OR 共軍 OR 台海 OR 封鎖) when:3d'
];
// 事實查核機構的公開 RSS；只計入和戰爭、國防、民生物資相關的查核
const FACTCHECK_FEEDS = [
  { name: '台灣事實查核中心', url: 'https://tfc-taiwan.org.tw/feed/' },
  { name: 'MyGoPen', url: 'https://www.mygopen.com/feeds/posts/default?alt=rss' }
];
const WAR_TOPIC = /共軍|解放軍|中共軍|開戰|戰爭|攻台|武統|飛彈|導彈|國軍|徵兵|動員|撤僑|戒嚴|斷網|停電|物資|囤積|美軍|國防|演習|台海|兩岸|投降|空襲|防空|避難|封鎖|海纜/;

const feedUrl = q => /[一-鿿]/.test(q)
  ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`
  : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const TAIWAN = /台灣|臺灣|台電|全台|興達|大潭|林口|麥寮|通霄|協和|大林|和平電廠|台中電廠|核[一二三]|[台臺](灣)?(北|中|南|東)部|Taiwan|Taipower|[台臺]北|新北|桃園|新竹|台中|臺中|台南|臺南|高雄|基隆|宜蘭|花蓮|台東|臺東|屏東|嘉義|彰化|雲林|苗栗|南投/i;
const WEATHER = /颱風|地震|豪雨|大雨|雷擊|雷雨|濃霧|大霧|起霧|東北季風|風浪|浪高|天候|海象|低能見度|能見度|強風|寒流|typhoon|earthquake|storm|fog|weather/i;
const DRILL = /演習|演練|模擬|兵推|drill|exercise/i;
const NOT_EVENT = /討論牆|\d{3,4}大停電|週年|回顧|賠償|\?\s*$|會不會|是否|嗎[？?]?$|懶人包|一次看|專家|評論|分析|社論|analysis|opinion|explain|\bhow\b|\bwhy\b/i;

function classify(title) {
  const t = String(title || '');
  if (NOT_EVENT.test(t)) return null;
  // 停電要有規模：全台、輪停、限電、上萬戶、電廠跳機或電力設施遭破壞；單一大樓或幾千戶的區域停電不算
  if (/(全台停電|全台大停電|大規模停電|分區.{0,4}停電|輪流停電|輪停|限電|\d+(\.\d+)?萬戶|百萬戶|電廠.{0,6}(跳機|停機|遭攻擊|爆炸|起火)|變電所.{0,6}(爆炸|遭破壞|遭攻擊)|nationwide blackout|massive blackout|power plant (attack|explosion|fire))/i.test(t)
    && TAIWAN.test(t) && !WEATHER.test(t) && !DRILL.test(t)) return 'POWER';
  if (/金門|馬祖|澎湖|蘭嶼|綠島|小三通|Kinmen|Matsu|Penghu/i.test(t) && /(航班|班機|船班|渡輪|交通船|小三通|flights?|ferr(y|ies)).{0,10}(取消|停駛|停航|暫停|中斷|停飛|cancel|suspend|halt)|停駛|停航|停飛/i.test(t)
    && !WEATHER.test(t) && !DRILL.test(t)) return 'ISLANDS';
  // 中國民船與動員：要有中國／共軍脈絡，排除我國全民防衛動員署、萬安演習等自己的演練
  const CHINA = /中國|中共|共軍|解放軍|大陸|陸方|China|Chinese|PLA\b|Beijing/i;
  if (CHINA.test(t) && !/全民防衛動員|全社會防衛|萬安|民安|漢光|國軍|我國/.test(t)
    && /(滾裝船?|民船|渡輪|漁船|海上民兵|ro-?ro|roll-on|ferr(y|ies)|civilian (ships|vessels)|maritime militia).{0,24}(徵用|集結|集中|動員|演練|參演|運兵|運載|登陸|mobiliz\w*|mass\w*|gather\w*|requisition\w*|exercise|drill|landing|transport\w*)|國防動員令|動員令|全國動員|戰時狀態|徵召退役|mobilization order|declare\w* wartime/i.test(t)) return 'MOBIL';
  // 搶購：要有戰爭脈絡與台灣地點，颱風等天候造成的不算
  if (/搶購|搶買|搶米|搶水|搶泡麵|囤貨|囤積|缺貨|貨架.{0,4}(空|搬空)|排隊加油|大排長龍|panic buying|hoarding|empty shelves/i.test(t)
    && /戰爭|開戰|戰事|軍演|攻台|共軍|解放軍|台海|封鎖|局勢|飛彈|空襲|\bwar\b|invasion|blockade|missile/i.test(t)
    && (TAIWAN.test(t) || /全聯|家樂福|好市多|超市|量販|加油站/.test(t)) && !WEATHER.test(t)) return 'PANIC';
  if (/晶片|半導體|稀土|鎵|鍺|光刻|台積電|chip|semiconductor|rare earth|gallium|germanium|lithograph|ASML|TSMC/i.test(t)
    && /出口管制|實體清單|禁運|限制出口|禁止出口|管制措施|export control|entity list|\bban(s|ned)?\b|restrict\w*|sanction\w*/i.test(t)
    && !/\burg\w*|could|may|might|consider\w*|呼籲|考慮|研議|可能/i.test(t)) return 'CHIPS';
  return null;
}

const taipeiDate = iso => new Date(Date.parse(iso) + 8 * HOUR).toISOString().slice(0, 10);
function buildEvents(items, now = Date.now()) {
  const groups = new Map();
  for (const it of items) {
    if (Date.parse(it.publishedAt) > now + 10 * 60_000) continue;
    const type = it.type || classify(it.title); if (!type) continue;
    const id = `${type}|${taipeiDate(it.publishedAt)}`;
    const g = groups.get(id) || { id, type, date: taipeiDate(it.publishedAt), items: [] };
    if (!g.items.some(x => x.url === it.url)) g.items.push(it);
    groups.set(id, g);
  }
  return [...groups.values()].map(g => {
    g.items.sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
    const publishers = [...new Set(g.items.map(i => i.publisher))];
    // 假訊息查核由查核機構自己發布，不需要 2 家媒體確認
    return { ...g, count: g.items.length, publishers, confirmed: g.type === 'DISINFO' || publishers.length >= 2, firstSeen: g.items[0].publishedAt, items: g.items.slice(0, 6) };
  }).sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));
}

// 事實查核 RSS（WordPress／Blogger 格式）
function parseFactcheck(xml, name) {
  const dec = s => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).trim();
  return [...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/g)].map(m => {
    const b = m[0], get = tag => dec((b.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`)) || [])[1]);
    const cats = [...b.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/g)].map(x => dec(x[1])).join(' ');
    const d = new Date(get('pubDate'));
    return { title: get('title'), url: get('link'), publishedAt: Number.isFinite(d.getTime()) ? d.toISOString() : null, publisher: name, cats };
  }).filter(i => i.title && /^https:\/\//.test(i.url) && i.publishedAt && WAR_TOPIC.test(`${i.title} ${i.cats}`))
    .map(({ cats, ...i }) => ({ ...i, type: 'DISINFO' }));
}

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
let inFlight = null;
function refreshTaiwanCivil(opts = {}) { if (!inFlight) inFlight = collect(opts).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now() } = {}) {
  const prev = readCache(file) || { items: [], daily: {} };
  if (!force && prev.lastAttempt && now - Date.parse(prev.lastAttempt) < 30 * 60_000) return prev;
  const errors = [], fresh = [];
  const get = async url => { const res = await fetchImpl(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 WorldWarNews/2.0' } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.text(); };
  for (const q of NEWS_QUERIES) {
    try { fresh.push(...parseRss(await get(feedUrl(q))).filter(i => classify(i.title))); } catch (e) { errors.push(`${q.slice(0, 20)}…: ${e.message}`); }
  }
  for (const f of FACTCHECK_FEEDS) {
    try { fresh.push(...parseFactcheck(await get(f.url), f.name)); } catch (e) { errors.push(`${f.name}: ${e.message}`); }
  }
  const total = NEWS_QUERIES.length + FACTCHECK_FEEDS.length;
  // 標題只留 7 天；之後只留每日篇數與確認過的事件
  const items = [...new Map([...(prev.items || []), ...fresh].filter(i => now - Date.parse(i.publishedAt) <= 7 * DAY && (i.type === 'DISINFO' || classify(i.title))).map(i => [i.url, i])).values()];
  const events = buildEvents(items, now);
  const counts = {};
  for (const e of events) (counts[`${e.type}|taiwan_strait`] ||= {})[e.date] = e.count;
  const daily = mergeDaily(prev.daily, counts, now);
  const compact = e => ({ id: e.id, type: e.type, theater: 'taiwan_strait', date: e.date, firstSeen: e.firstSeen, publishers: e.publishers.length, title: e.items[0].title, url: e.items[0].url, publisher: e.items[0].publisher });
  const stillValid = e => e.type === 'DISINFO' || classify(e.title) === e.type;
  const history = [...new Map([...(prev.history || []).filter(stillValid), ...events.filter(e => e.confirmed && e.type !== 'DISINFO').map(compact)]
    .filter(e => now - Date.parse(e.firstSeen) <= KEEP_DAYS * DAY).map(e => [e.id, e])).values()].sort((a, b) => b.firstSeen.localeCompare(a.firstSeen)).slice(0, 200);
  const out = { lastAttempt: new Date(now).toISOString(), lastSuccess: errors.length * 2 <= total ? new Date(now).toISOString() : prev.lastSuccess || null,
    status: errors.length ? (errors.length < total ? 'DEGRADED' : 'OFFLINE') : 'ONLINE', errors, items, events, daily, history };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(out)); fs.renameSync(tmp, file);
  return out;
}

function assessCivil(cache, type, now = Date.now()) {
  if (!cache?.lastSuccess || now - Date.parse(cache.lastSuccess) > 12 * HOUR || (cache.lastAttempt && Date.parse(cache.lastAttempt) - Date.parse(cache.lastSuccess) > 2 * HOUR)) return null;
  const recent = (cache.events || []).filter(e => e.type === type && now - Date.parse(e.firstSeen) <= 72 * HOUR && Date.parse(e.firstSeen) <= now);
  const confirmed = recent.filter(e => e.confirmed);
  let extra = '';
  if (BASELINE_TYPES.has(type)) {
    const b = baselineCheck(cache.daily, `${type}|taiwan_strait`, now);
    if (!b.ready) return { status: 'CLEAR', observedAt: cache.lastSuccess, sources: [], summary: `${LABELS[type]}基準累積中（${b.days}/10 天），近 3 天 ${b.recent} 則。` };
    if (!(confirmed.length && b.above && b.recent >= 3)) return { status: 'CLEAR', observedAt: cache.lastSuccess, sources: [], summary: `${LABELS[type]}近 3 天 ${b.recent} 則，在常態範圍內（P90 ${b.p90}）。` };
    extra = `（近 3 天 ${b.recent} 則，高於過去 30 天常態 P90 ${b.p90}）`;
  } else if (!confirmed.length) {
    return { status: 'CLEAR', observedAt: cache.lastSuccess, sources: [], summary: `近 72 小時沒有 2 家以上媒體確認的${LABELS[type]}${recent.length ? `（另有 ${recent.length} 則單一媒體報導待確認）` : ''}。` };
  }
  const e = confirmed[0], uniq = e.items.filter((it, i, arr) => arr.findIndex(x => x.publisher === it.publisher) === i).slice(0, 3);
  return { status: 'TRIGGERED', observedAt: e.firstSeen,
    summary: `${e.date.slice(5).replace('-', '/')} ${LABELS[type]}：${uniq[0].title.slice(0, 90)}${extra}`.slice(0, 300),
    sources: uniq.map(it => ({ url: it.url, publisher: it.publisher, sourceClass: type === 'DISINFO' ? 'EXTERNAL_ASSESSMENT' : 'INDEPENDENT_MEDIA', publishedAt: it.publishedAt })) };
}

module.exports = { refreshTaiwanCivil, classify, parseFactcheck, buildEvents, assessCivil, readCache, CACHE, LABELS };
