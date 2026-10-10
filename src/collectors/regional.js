// 新增戰區的軍事指標：朝鮮半島、南海、以巴／黎巴嫩／紅海。以 Google News 標題比對，
// 同一天同一類事件有 2 家以上不同媒體報導才算確認（72 小時內有效）；以色列空襲、對以色列火箭攻擊這類戰事中天天有的，
// 另外和過去 30 天的「3 日報導量」比較，超過第 90 百分位才算升級（累積 10 天後才判定）。
const fs = require('fs');
const path = require('path');
const { parseRss } = require('./pla_joint');
const { baselineCheck, mergeDaily } = require('./diplomacy');

const CACHE = path.join(__dirname, '../../research/source_cache/regional.json');
const HOUR = 3600_000, DAY = 24 * HOUR, KEEP_DAYS = 35;

const NK = /North Korea|N\.? Korea|DPRK|Pyongyang|Kim Jong|北韓|朝鮮|平壤|金正恩/i;
const PH_CN = /Philippin|Manila|菲律賓|菲國|菲方|馬尼拉/i;
const SCS_PLACE = /Second Thomas|Ayungin|Scarborough|Sabina|Spratly|Thitu|Pag-?asa|Sandy Cay|South China Sea|West Philippine Sea|仁愛礁|黃岩島|仙賓礁|南沙|中業島|南海|鐵線礁/i;
const ISRAEL = /Israel|IDF|以色列|以軍/i;
// 各類型：所屬戰區、比對規則、是否需要比較 30 日常態
const TYPES = [
  { type: 'DPRK_NUKE', theater: 'korea_peninsula', label: '北韓核試或核設施異常', baseline: false,
    test: t => NK.test(t) && /nuclear test|Punggye|核試|核子試驗|豐溪里|enrichment facility|uranium enrichment|鈾濃縮/i.test(t) },
  { type: 'DPRK_MISSILE', theater: 'korea_peninsula', label: '北韓飛彈發射', baseline: false,
    test: t => NK.test(t) && /(fires?|fired|launch\w*|test\w*).{0,30}(ballistic|missile|ICBM|rocket|cruise)|(ballistic|missile|ICBM).{0,20}(launch|fired)|發射.{0,12}(彈道|飛彈|導彈|洲際|火箭)|(彈道|飛彈|導彈).{0,6}發射|試射/i.test(t) },
  { type: 'DMZ', theater: 'korea_peninsula', label: '非軍事區交火、越界或 GPS 干擾', baseline: false,
    test: t => (NK.test(t) || /DMZ|非軍事區|板門店|延坪島|NLL|北方界線/i.test(t)) && /(DMZ|非軍事區|border|邊界|界線|NLL|延坪).{0,30}(shots?|fire[sd]?|gunfire|cross\w*|incursion|交火|開火|鳴槍|越界|越過)|GPS (jamming|interference)|GPS.{0,4}干擾|warning shots|警告射擊/i.test(t) },
  { type: 'ALLIED_DRILL', theater: 'korea_peninsula', label: '美韓（日）大規模聯合演習', baseline: false,
    test: t => /Freedom Shield|Ulchi|Freedom Edge|Freedom Flag|自由之盾|乙支|自由之刃|(US|U\.S\.|美|美日韓|美韓).{0,12}(South Korea|Korea|韓).{0,20}(joint|combined|聯合).{0,10}(drills?|exercises?|演習|軍演)/i.test(t) },
  { type: 'SCS_BLOCK', theater: 'south_china_sea', label: '中方阻擋補給、封鎖或登臨', baseline: false,
    test: t => SCS_PLACE.test(t) && /(block\w*|blockade|board\w*|seiz\w*|阻擋|阻攔|封鎖|登臨|登船|扣押|攔截).{0,30}(resupply|supply|mission|vessel|boat|補給|運補|船)|(resupply|運補|補給).{0,20}(blocked|thwarted|disrupted|受阻|被阻)/i.test(t) },
  { type: 'SCS_CLASH', theater: 'south_china_sea', label: '中菲海上衝突（水砲、衝撞、雷射）', baseline: false,
    test: t => (PH_CN.test(t) || SCS_PLACE.test(t)) && /water cannon|ramm?(ed|ing)?\b|collid\w*|collision|laser|sideswip\w*|dangerous maneuver|水砲|水炮|衝撞|撞擊|擦撞|雷射|激光|危險動作|危險機動/i.test(t) },
  { type: 'SCS_DRILL', theater: 'south_china_sea', label: '南部戰區演習或美菲聯合巡航', baseline: false,
    test: t => SCS_PLACE.test(t) && /(Southern Theater|南部戰區|PLA Navy|解放軍).{0,20}(patrol|drill|exercise|戰備警巡|演習|巡航)|(US|U\.S\.|美|Japan|日本|Australia|澳).{0,20}(Philippin|菲).{0,30}(joint|maritime cooperative|聯合).{0,10}(patrol|sail|exercise|巡航|巡邏|演習)|Balikatan|肩並肩/i.test(t) },
  { type: 'TW_COASTGUARD', theater: 'taiwan_strait', label: '中國海警進入金門、馬祖限制水域或登檢台灣船隻', baseline: false,
    test: t => /海警|China Coast Guard|CCG/i.test(t) && /金門|馬祖|東沙|Kinmen|Matsu|Pratas|台灣漁船|臺灣漁船|Taiwanese (boat|vessel|fishing)/i.test(t) && /限制水域|禁止水域|執法巡查|巡查|登檢|登臨|扣押|驅離|闖入|侵入|進入|restricted waters|prohibited waters|board\w*|inspect\w*|seiz\w*|intru\w*|patrol/i.test(t) },
  { type: 'HOUTHI', theater: 'middle_east', label: '胡塞攻擊紅海／亞丁灣船隻', baseline: false,
    test: t => /Houthi|胡塞|葉門叛軍/i.test(t) && /(attack\w*|strik\w*|hit|target\w*|missile|drone|seiz\w*|攻擊|襲擊|擊中|飛彈|無人機|扣押|劫持).{0,40}(ship|vessel|tanker|carrier|merchant|商船|貨輪|油輪|船隻|船舶)|(ship|vessel|tanker|商船|貨輪|油輪).{0,30}(attacked|hit|struck|遇襲|被擊中)/i.test(t) },
  { type: 'IL_STRIKE', theater: 'middle_east', label: '以色列對黎巴嫩、敘利亞、伊拉克或葉門空襲', baseline: true,
    test: t => ISRAEL.test(t) && /(air ?strikes?|strikes?|bomb\w*|空襲|轟炸|打擊|攻擊)/i.test(t) && /Lebanon|Beirut|Hezbollah|Syria|Damascus|Iraq|Yemen|Hodeidah|Sanaa|黎巴嫩|貝魯特|真主黨|敘利亞|大馬士革|伊拉克|葉門|荷台達|沙那/i.test(t) },
  { type: 'LB_ROCKETS', theater: 'middle_east', label: '對以色列的火箭、飛彈或無人機攻擊', baseline: true,
    test: t => /Hezbollah|Hamas|Houthi|Iraqi militia|真主黨|哈瑪斯|胡塞|民兵/i.test(t) && /(rockets?|missiles?|drones?|火箭|飛彈|導彈|無人機).{0,30}(at|toward|into|on|launched|fired|攻擊|射向|襲擊)?.{0,20}(Israel|以色列)/i.test(t) && !/Israeli (strike|air ?strike)s? (on|kill)/i.test(t) }
];
const LABELS = Object.fromEntries(TYPES.map(x => [x.type, x.label]));
const NOT_EVENT = /\?\s*$|^(will|could|should|can|is|are|does|why|how|what)\b|\bopinion\b|analysis|explain|explainer|podcast|anniversar|years? (after|ago)|會不會|是否|嗎[？?]?$|懶人包|一次看|專家|評論|分析|社論|週年|回顧/i;

const QUERIES = [
  '("North Korea" OR DPRK OR Pyongyang) (missile OR ballistic OR ICBM OR "nuclear test") when:3d',
  '(北韓 OR 朝鮮) (飛彈 OR 彈道 OR 試射 OR 核試) when:3d',
  '(DMZ OR "South Korea" OR "Freedom Shield" OR Ulchi) ("North Korea" OR drills OR "warning shots" OR GPS) when:3d',
  '(Philippines OR "Second Thomas" OR Scarborough OR Sabina OR "South China Sea") ("water cannon" OR rammed OR collision OR laser OR resupply OR blockade OR patrol) China when:3d',
  '(菲律賓 OR 仁愛礁 OR 黃岩島 OR 南海) (水砲 OR 水炮 OR 衝撞 OR 雷射 OR 補給 OR 海警) when:3d',
  '(Houthi OR Houthis) (ship OR vessel OR tanker OR "Red Sea" OR "Gulf of Aden") when:3d',
  '(Israel OR IDF) (strike OR strikes OR airstrike) (Lebanon OR Hezbollah OR Syria OR Iraq OR Yemen) when:2d',
  '(Hezbollah OR Hamas OR Houthi) (rockets OR missiles OR drones) Israel when:2d',
  '(以色列 OR 胡塞 OR 真主黨) (空襲 OR 攻擊 OR 商船 OR 火箭) when:2d',
  '(海警) (金門 OR 馬祖 OR 東沙 OR 台灣漁船) when:3d'
];
const feedUrl = q => /[一-鿿]/.test(q)
  ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`
  : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

// 一個標題只歸入第一個符合的類型（順序依嚴重程度）
function classify(title) {
  const t = String(title || '');
  if (NOT_EVENT.test(t)) return null;
  const hit = TYPES.find(x => x.test(t));
  return hit ? { type: hit.type, theater: hit.theater } : null;
}

const taipeiDate = iso => new Date(Date.parse(iso) + 8 * HOUR).toISOString().slice(0, 10);
function buildEvents(items, now = Date.now()) {
  const groups = new Map();
  for (const it of items) {
    if (Date.parse(it.publishedAt) > now + 10 * 60_000) continue;
    const c = classify(it.title); if (!c) continue;
    const id = `${c.type}|${taipeiDate(it.publishedAt)}`;
    const g = groups.get(id) || { id, type: c.type, theater: c.theater, date: taipeiDate(it.publishedAt), items: [] };
    if (!g.items.some(x => x.url === it.url)) g.items.push(it);
    groups.set(id, g);
  }
  return [...groups.values()].map(g => {
    g.items.sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
    const publishers = [...new Set(g.items.map(i => i.publisher))];
    return { ...g, count: g.items.length, publishers, confirmed: publishers.length >= 2, firstSeen: g.items[0].publishedAt, items: g.items.slice(0, 6) };
  }).sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));
}

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
let inFlight = null;
function refreshRegional(opts = {}) { if (!inFlight) inFlight = collect(opts).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now() } = {}) {
  const prev = readCache(file) || { items: [], daily: {} };
  if (!force && prev.lastAttempt && now - Date.parse(prev.lastAttempt) < 30 * 60_000) return prev;
  const errors = [], fresh = [];
  for (const q of QUERIES) {
    try {
      const res = await fetchImpl(feedUrl(q), { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 WorldWarNews/2.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fresh.push(...parseRss(await res.text()).filter(i => classify(i.title)));
    } catch (e) { errors.push(`${q.slice(0, 24)}…: ${e.message}`); }
  }
  const items = [...new Map([...(prev.items || []), ...fresh].filter(i => now - Date.parse(i.publishedAt) <= 7 * DAY && classify(i.title)).map(i => [i.url, i])).values()];
  const events = buildEvents(items, now);
  const counts = {};
  for (const e of events) (counts[`${e.type}|${e.theater}`] ||= {})[e.date] = e.count;
  const daily = mergeDaily(prev.daily, counts, now);
  const compact = e => ({ id: e.id, type: e.type, theater: e.theater, date: e.date, firstSeen: e.firstSeen, publishers: e.publishers.length, title: e.items[0].title, url: e.items[0].url, publisher: e.items[0].publisher });
  const stillValid = e => classify(e.title)?.type === e.type;
  const history = [...new Map([...(prev.history || []).filter(stillValid), ...events.filter(e => e.confirmed).map(compact)]
    .filter(e => now - Date.parse(e.firstSeen) <= KEEP_DAYS * DAY).map(e => [e.id, e])).values()].sort((a, b) => b.firstSeen.localeCompare(a.firstSeen)).slice(0, 300);
  const out = { lastAttempt: new Date(now).toISOString(), lastSuccess: errors.length * 2 <= QUERIES.length ? new Date(now).toISOString() : prev.lastSuccess || null,
    status: errors.length ? (errors.length < QUERIES.length ? 'DEGRADED' : 'OFFLINE') : 'ONLINE', errors, items, events, daily, history };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(out)); fs.renameSync(tmp, file);
  return out;
}

function assessRegional(cache, type, now = Date.now()) {
  if (!cache?.lastSuccess || now - Date.parse(cache.lastSuccess) > 12 * HOUR || (cache.lastAttempt && Date.parse(cache.lastAttempt) - Date.parse(cache.lastSuccess) > 2 * HOUR)) return null;
  const def = TYPES.find(x => x.type === type); if (!def) return null;
  const recent = (cache.events || []).filter(e => e.type === type && now - Date.parse(e.firstSeen) <= 72 * HOUR && Date.parse(e.firstSeen) <= now);
  const confirmed = recent.filter(e => e.confirmed);
  let extra = '';
  if (def.baseline) {
    const b = baselineCheck(cache.daily, `${type}|${def.theater}`, now);
    if (!b.ready) return { status: 'CLEAR', observedAt: cache.lastSuccess, sources: [], summary: `${def.label}：基準累積中（${b.days}/10 天），近 3 天 ${b.recent} 則報導。` };
    if (!(confirmed.length && b.above)) return { status: 'CLEAR', observedAt: cache.lastSuccess, sources: [], summary: `${def.label}：近 3 天 ${b.recent} 則，在常態範圍內（P90 ${b.p90}）。` };
    extra = `（近 3 天 ${b.recent} 則，高於 30 日常態 P90 ${b.p90}）`;
  } else if (!confirmed.length) {
    return { status: 'CLEAR', observedAt: cache.lastSuccess, sources: [], summary: `近 72 小時沒有 2 家以上媒體確認的${def.label}${recent.length ? `（另有 ${recent.length} 則單一媒體報導待確認）` : ''}。` };
  }
  const e = confirmed[0], uniq = e.items.filter((it, i, arr) => arr.findIndex(x => x.publisher === it.publisher) === i).slice(0, 3);
  return { status: 'TRIGGERED', observedAt: e.firstSeen, summary: `${e.date.slice(5).replace('-', '/')} ${e.publishers.length} 家媒體報導${def.label}：${uniq[0].title.slice(0, 90)}${extra}`.slice(0, 300),
    sources: uniq.map(it => ({ url: it.url, publisher: it.publisher, sourceClass: 'INDEPENDENT_MEDIA', publishedAt: it.publishedAt })) };
}

module.exports = { refreshRegional, classify, buildEvents, assessRegional, readCache, CACHE, LABELS, TYPES };
