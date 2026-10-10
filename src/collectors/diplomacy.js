// 外交與政治指標：以 Google News 標題比對撤僑／旅遊警示、外交關係變化、官方言論強度、制裁、航班停飛與降溫訊號。
// 同一天、同一戰區、同一類事件有 2 家以上不同媒體報導才算確認（72 小時內有效）。
// 言論、制裁、停飛這三類平常就常出現，另外和過去 30 天的「3 日報導量」比較，超過第 90 百分位才算升級。
const fs = require('fs');
const path = require('path');
const { parseRss } = require('./pla_joint');

const CACHE = path.join(__dirname, '../../research/source_cache/diplomacy.json');
const HOUR = 3600_000, DAY = 24 * HOUR;
const KEEP_DAYS = 35;

const THEATERS = {
  taiwan_strait: /Taiwan|Taipei|台灣|臺灣|台海|兩岸|國台辦|賴清德|台獨|對台|涉台/i,
  iran_gulf: /Iran|Tehran|Hormuz|Persian Gulf|伊朗|德黑蘭|荷莫茲|波斯灣/i,
  europe_security: /Poland|Polish|Baltic|Lithuania|Latvia|Estonia|Romania|Moldova|Belarus|\bNATO\b|\bEU\b|European Union|歐盟|波蘭|波羅的海|立陶宛|拉脫維亞|愛沙尼亞|羅馬尼亞|白俄|北約/i,
  ukraine_front: /Ukrain|Kyiv|Kiev|Russia|Moscow|Kremlin|Putin|Zelensky|烏克蘭|基輔|俄羅斯|俄國|莫斯科|克里姆林|普丁|澤倫斯基/i,
  korea_peninsula: /North Korea|N\. Korea|DPRK|Pyongyang|Kim Jong|South Korea|Seoul|北韓|朝鮮|平壤|金正恩|南韓|韓國|首爾/i,
  south_china_sea: /South China Sea|West Philippine Sea|Philippin|Manila|Second Thomas|Scarborough|Spratly|南海|菲律賓|馬尼拉|仁愛礁|黃岩島|南沙/i,
  middle_east: /Israel|Gaza|Lebanon|Hezbollah|Hamas|Houthi|Yemen|Red Sea|Syria|以色列|加薩|黎巴嫩|真主黨|哈瑪斯|胡塞|葉門|紅海|敘利亞/i
};
const LABELS = { ARMS: '美國對台軍售或涉台法案', CNTW: '中國對台制裁、關稅、禁令或懲戒措施', UN: '聯合國、IAEA 或北約等國際組織行動', SHIP: '航運戰爭險上調或航運公司繞道停航', EVAC: '撤僑或旅遊警示升級', DIPLO: '外交關係變化', RHETORIC: '官方言論升級', SANCTION: '新制裁或出口管制', FLIGHTS: '航空公司停飛或領空關閉', DEESC: '降溫訊號（通話、會談、停火）' };
// 平常就常見的類型：要和過去 30 天比較
const BASELINE_TYPES = new Set(['RHETORIC', 'SANCTION', 'FLIGHTS', 'SHIP']);
// 台海的航運異常很少見，2 家媒體確認就算；美伊戰區平常就多，仍要比 30 日常態
const NO_BASELINE = new Set(['SHIP|taiwan_strait']);

const QUERIES = [
  '("travel advisory" OR "ordered departure" OR evacuate OR "leave immediately") (Taiwan OR Iran OR Poland OR Lithuania OR Ukraine OR Russia) when:3d',
  '("recalls ambassador" OR "expels diplomats" OR "embassy closed" OR "closes embassy" OR "Security Council" OR "severs ties") (Taiwan OR China OR Iran OR Russia OR Poland OR Belarus) when:3d',
  '(sanctions OR "entity list" OR "export controls") (China OR Iran OR Russia) (new OR imposes OR announces) when:2d',
  '(airline OR airlines) (suspend OR suspends OR cancel OR halt) flights (Tehran OR Taipei OR Moscow OR Warsaw OR Vilnius OR Gulf OR Iran OR Russia) when:3d',
  '("Taiwan Affairs Office" OR "Chinese foreign ministry" OR "Chinese defense ministry") Taiwan when:3d',
  '(Taiwan OR Iran OR Russia OR Ukraine) ("phone call" OR talks OR ceasefire OR summit) when:2d',
  '(國台辦 OR 外交部 OR 國防部) 台灣 (嚴正警告 OR 懲戒 OR 玩火 OR 迎頭痛擊 OR 堅決反擊 OR 嚴懲) when:3d',
  '(撤僑 OR 旅遊警示 OR 召回大使 OR 驅逐外交官 OR 斷交 OR 停飛) when:3d',
  '(通話 OR 會談 OR 停火) (台灣 OR 美中 OR 伊朗 OR 烏克蘭 OR 俄羅斯) when:2d',
  '("war risk" OR "Joint War Committee" OR reroute OR "suspend transits" OR "avoid") (Hormuz OR "Taiwan Strait" OR Kaohsiung OR Keelung) (shipping OR vessels OR insurers) when:3d',
  '(兵險 OR 戰爭險 OR 繞道 OR 暫停通行 OR 停航) (台灣海峽 OR 台海 OR 荷莫茲 OR 高雄港 OR 基隆港) when:3d',
  '(Taiwan) ("arms sale" OR DSCA OR "Taiwan Relations Act" OR "Taiwan Policy Act" OR NDAA) when:7d',
  '(對台軍售 OR 涉台法案 OR 國防授權法) (台灣 OR 美國) when:7d',
  '(國台辦 OR 商務部 OR 海關總署) (台灣 OR 台獨) (制裁 OR 懲戒 OR 關稅 OR 禁止 OR 暫停 OR 清單 OR 懸賞) when:3d',
  '("Security Council" OR IAEA OR "NATO summit") (Iran OR Ukraine OR Russia OR "North Korea" OR Israel OR Gaza OR Lebanon) (vote OR resolution OR report OR meeting) when:3d'
];
const feedUrl = q => /[一-鿿]/.test(q)
  ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`
  : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const NOT_EVENT = /\?\s*$|^(will|could|should|can|is|are|does)\b|\bopinion\b|plague|outbreak|virus|measles|pandemic|hurricane|typhoon|earthquake|wildfire|疫情|鼠疫|颱風|地震|會不會|是否|嗎[？?]?$|analysis|explain|\bhow\b|\bwhy\b|\bwhat\b|lessons|anniversar|years? (after|ago)|podcast|評論|分析|社論|週年|回顧|專欄/i;
const RULES = [
  ['SHIP', /war[- ]risk|Joint War Committee|\bJWC\b|listed area|兵險|戰爭險|戰爭風險.{0,4}保費|保費.{0,6}(飆|漲|上調|翻倍)|(reroute\w*|divert\w*|avoid\w*|suspend\w*|halt\w*|paus\w*).{0,30}(transits?|passage|sailings?|routes?|voyages?|port calls?)|繞道|暫停.{0,6}(航行|通行|航線|靠港)|停止靠港/i],
  ['EVAC', /(raises?|raised|issues?|issued|upgrad\w*|elevat\w*).{0,40}(travel advisory|level 4|do not travel)|urg\w* (its )?(citizens|nationals|americans|britons|residents).{0,30}(leave|depart)|ordered departure|evacuat\w*.{0,25}(citizens|nationals|diplomat|embassy|staff|families)|撤僑|撤離.{0,4}(僑民|公民|人員|使館|眷屬)|(提高|升級|發布|升至).{0,8}旅遊警示|儘速離境|盡速離境/i],
  ['DIPLO', /recall\w* (its |the )?ambassador|expel\w*.{0,25}diplomat|embassy (is )?(closed|closes|shut)|clos\w* (its |the )?(embassy|consulate)|sever\w* (diplomatic )?(ties|relations)|cut\w* diplomatic ties|downgrad\w* (diplomatic )?(ties|relations)|security council.{0,30}(emergency|urgent)|emergency.{0,20}security council|persona non grata|召回大使|驅逐.{0,6}外交官|關閉.{0,4}(大使館|領事館|代表處)|斷交|降低外交關係|安理會.{0,6}緊急/i],
  // 對台軍售與美國涉台法案（只歸台海）
  ['ARMS', /(approv\w*|clear\w*|notif\w*|announc\w*|批准|核准|宣布|通知國會|知會國會|同意).{0,40}(arms sales?|weapons? sales?|military sales?|軍售|武器)|\bDSCA\b|(pass\w*|sign\w*|enact\w*|通過|簽署|三讀).{0,25}(Taiwan[\w ]{0,30}Act|NDAA|台灣.{0,10}(法案|條款)|涉台.{0,6}(法案|條款)|國防授權法)/i],
  // 中國對台措施：中方機關＋制裁、關稅、禁令、懲戒名單、懸賞通緝等
  ['CNTW', /(國台辦|商務部|海關總署|海關|財政部|公安|中國|中共|北京|陸方|大陸|China|Chinese|Beijing|Taiwan Affairs Office).{0,30}(制裁|懲戒|懲治|列入|清單|暫停|中止|禁止進口|暫停進口|進口禁令|關稅|反傾銷|貿易壁壘|ECFA|台獨頑固分子|懸賞|通緝|立案|sanction\w*|\bbans?\b|banned|tariffs?|suspend\w*|blacklist\w*|bounty|wanted list|punish\w*)/i],
  // 國際組織：安理會表決／決議、IAEA 報告與理事會、北約峰會
  ['UN', /(\bUN\b|U\.N\.|United Nations|Security Council|General Assembly|IAEA|NATO summit|安理會|聯合國|聯大|國際原子能|原子能總署|北約峰會).{0,40}(resolution|vote\w*|veto\w*|session|meets?|meeting|report\w*|board|condemn\w*|snapback|inspect\w*|決議|表決|否決|會議|開會|報告|理事會|譴責|峰會|查核|視察)/i],
  ['FLIGHTS', /(suspend\w*|cancel\w*|halt\w*|reroute\w*|divert\w*).{0,30}flights?|flights?.{0,20}(suspended|cancelled|canceled|halted)|airspace (is )?(closed|closure|shut)|clos\w* (its )?airspace|停飛|暫停.{0,6}航班|取消.{0,6}航班|領空關閉|關閉領空/i],
  ['SANCTION', /(new|imposes?|imposed|announc\w*|slaps?|expands?|tightens?).{0,25}(sanction|export control|entity list)|sanctions? (on|against)|blacklist\w*|新一輪制裁|宣布.{0,8}制裁|祭出.{0,6}制裁|列入實體清單|出口管制/i],
  ['RHETORIC', /stern warning|severe(ly)? punish|playing with fire|head-on|will not sit idly|crush\w*|resolute(ly)? (counter|strike)|嚴正警告|懲戒|懲治|嚴懲|玩火自焚|迎頭痛擊|堅決反擊|絕不坐視|粉碎/i],
  ['DEESC', /phone call|\bcall(ed)? with|\btalks?\b|\bmeet(s|ing)?\b|summit|ceasefire|truce|de-?escalat\w*|hotline|negotiat\w*|通話|會談|會晤|峰會|停火|降溫|談判|熱線|對話/i]
];

// 降溫訊號要同時提到衝突雙方（例如美＋中、美＋伊朗、俄＋烏），避免「北約代表團去基輔會談」這類被誤算
const US = { test: t => /\bUS\b|U\.S\./.test(t) || /United States|Washington|Trump|Rubio|Vance|美國|美方|川普|白宮/i.test(t) };
const DEESC_PAIRS = {
  taiwan_strait: [[US, /China|Chinese|Beijing|\bXi\b|中國|北京|習近平|中方|美中|中美/i], [/Taiwan|台灣|臺灣|賴清德/i, /China|Beijing|中國|北京|大陸|國台辦/i]],
  iran_gulf: [[US, /Iran|Tehran|伊朗|德黑蘭/i]],
  europe_security: [[/Russia|Moscow|Putin|Kremlin|俄/i, /\bNATO\b|Poland|Polish|Baltic|Europe|\bEU\b|北約|波蘭|歐盟|歐洲/i]],
  korea_peninsula: [[US, /North Korea|DPRK|Pyongyang|Kim Jong|北韓|朝鮮|金正恩/i], [/South Korea|Seoul|南韓|韓國/i, /North Korea|DPRK|Pyongyang|北韓|朝鮮/i]],
  south_china_sea: [[/China|Chinese|Beijing|中國|北京/i, /Philippin|Manila|菲律賓|馬尼拉/i]],
  middle_east: [[/Israel|以色列/i, /Hamas|Hezbollah|Lebanon|Gaza|哈瑪斯|真主黨|黎巴嫩|加薩/i]],
  ukraine_front: [[/Russia|Moscow|Putin|Kremlin|俄/i, /Ukrain|Kyiv|Zelensky|烏/i], [/Putin|Kremlin|普丁|克里姆林/i, US]]
};
// 「沒有會談」「談判破局」不是降溫
const DEESC_NEG = /\bno\b|\bnot\b|n't|den(y|ies|ied)|reject\w*|refus\w*|collaps\w*|stall\w*|break(s)? down|broke down|fail\w*|沒有|否認|拒絕|破局|停滯|中斷|喊停/i;
const NOT_DEESC = /traders|odds|\bbets?\b|betting|poll|prediction|market|股市|賠率|民調/i;

function classify(title) {
  const t = String(title || '');
  if (NOT_EVENT.test(t)) return [];
  const type = (RULES.find(([, re]) => re.test(t)) || [])[0];
  if (!type) return [];
  if (type === 'SANCTION' && /\burg\w*|call(s|ed)? for|could|may|might|consider\w*|weigh\w*|threat\w*|warn\w* of|呼籲|考慮|威脅|研議|可能/i.test(t)) return [];
  let hits = Object.entries(THEATERS).filter(([, re]) => re.test(t)).map(([theater]) => theater);
  // 「波蘭驅逐俄國外交官」屬北約東翼；沒提到烏克蘭就不算烏俄戰區。另外烏俄戰區一定要提到俄方（排除烏克蘭與其他國家之間的外交事件）
  if (!/Russia|Moscow|Kremlin|Putin|俄|普丁|克里姆林/i.test(t)) hits = hits.filter(h => h !== 'ukraine_front');
  if (type === 'ARMS' || type === 'CNTW') hits = hits.filter(h => h === 'taiwan_strait');
  if (type === 'DEESC') { if (NOT_DEESC.test(t) || DEESC_NEG.test(t)) return []; hits = hits.filter(h => (DEESC_PAIRS[h] || []).some(([x, y]) => x.test(t) && y.test(t))); }
  if (hits.includes('europe_security') && !/Ukrain|Kyiv|Kiev|烏克蘭|基輔/i.test(t)) hits = hits.filter(h => h !== 'ukraine_front');
  return hits.map(theater => ({ type, theater }));
}

const taipeiDate = iso => new Date(Date.parse(iso) + 8 * HOUR).toISOString().slice(0, 10);

// 同一天、同一戰區、同一類型併成一筆事件
function buildEvents(items, now = Date.now()) {
  const groups = new Map();
  for (const it of items) {
    if (Date.parse(it.publishedAt) > now + 10 * 60_000) continue;
    for (const c of classify(it.title)) {
      const id = `${c.type}|${c.theater}|${taipeiDate(it.publishedAt)}`;
      const g = groups.get(id) || { id, type: c.type, theater: c.theater, date: taipeiDate(it.publishedAt), items: [] };
      if (!g.items.some(x => x.url === it.url)) g.items.push(it);
      groups.set(id, g);
    }
  }
  return [...groups.values()].map(g => {
    g.items.sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
    const publishers = [...new Set(g.items.map(i => i.publisher))];
    return { ...g, count: g.items.length, publishers, confirmed: publishers.length >= 2, firstSeen: g.items[0].publishedAt, items: g.items.slice(0, 6) };
  }).sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));
}

// 每日報導量（type|theater → {日期: 篇數}），作為言論、制裁、停飛的基準
function dailyCounts(events) {
  const out = {};
  for (const e of events) (out[`${e.type}|${e.theater}`] ||= {})[e.date] = e.count;
  return out;
}
function mergeDaily(prev = {}, fresh = {}, now = Date.now()) {
  const cutoff = taipeiDate(new Date(now - KEEP_DAYS * DAY).toISOString());
  const out = {};
  for (const key of new Set([...Object.keys(prev), ...Object.keys(fresh)])) {
    const m = { ...(prev[key] || {}) };
    for (const [d, n] of Object.entries(fresh[key] || {})) m[d] = Math.max(m[d] || 0, n);
    for (const d of Object.keys(m)) if (d < cutoff) delete m[d];
    out[key] = m;
  }
  return out;
}
function percentile(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
}
// 最近 3 天的報導量 vs 過去 30 天各個 3 日區間的第 90 百分位；累積不到 10 天就不判定升級
function baselineCheck(daily, key, now = Date.now()) {
  const m = daily?.[key] || {}, firstDay = Object.keys(m).sort()[0];
  const days = firstDay ? Math.round((Date.parse(taipeiDate(new Date(now).toISOString())) - Date.parse(firstDay)) / DAY) + 1 : 0;
  const sum3 = endOffset => [0, 1, 2].reduce((a, k) => a + (m[taipeiDate(new Date(now - (endOffset + k) * DAY).toISOString())] || 0), 0);
  const recent = sum3(0);
  const windows = []; for (let off = 3; off <= 30; off++) windows.push(sum3(off));
  const p90 = percentile(windows, 0.9);
  return { days, recent, p90, ready: days >= 10, above: days >= 10 && recent > Math.max(2, p90) };
}

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
let inFlight = null;
function refreshDiplomacy(opts = {}) { if (!inFlight) inFlight = collect(opts).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now() } = {}) {
  const prev = readCache(file) || { items: [], daily: {} };
  if (!force && prev.lastAttempt && now - Date.parse(prev.lastAttempt) < 30 * 60_000) return prev;
  const errors = [], fresh = [];
  for (const q of QUERIES) {
    try {
      const res = await fetchImpl(feedUrl(q), { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 WorldWarNews/2.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fresh.push(...parseRss(await res.text()).filter(i => classify(i.title).length)); // 只保留有分類到的標題，檔案才不會變大
    } catch (e) { errors.push(`${q.slice(0, 24)}…: ${e.message}`); }
  }
  // 原始標題只留 7 天（事件判定用），長期只留每日篇數
  const items = [...new Map([...(prev.items || []), ...fresh].filter(i => now - Date.parse(i.publishedAt) <= 7 * DAY).map(i => [i.url, i])).values()];
  const events = buildEvents(items, now);
  const daily = mergeDaily(prev.daily, dailyCounts(events), now);
  // 確認過的事件另存 35 天，給網站時間軸用
  const compact = e => ({ id: e.id, type: e.type, theater: e.theater, date: e.date, firstSeen: e.firstSeen, publishers: e.publishers.length, title: e.items[0].title, url: e.items[0].url, publisher: e.items[0].publisher });
  const stillValid = e => classify(e.title).some(c => c.type === e.type && c.theater === e.theater);
  const keepEvents = [...new Map([...(prev.history || []).filter(stillValid), ...events.filter(e => e.confirmed).map(compact)]
    .filter(e => now - Date.parse(e.firstSeen) <= KEEP_DAYS * DAY).map(e => [e.id, e])).values()]
    .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen)).slice(0, 400);
  const out = { lastAttempt: new Date(now).toISOString(), lastSuccess: errors.length * 2 <= QUERIES.length ? new Date(now).toISOString() : prev.lastSuccess || null,
    status: errors.length ? (errors.length < QUERIES.length ? 'DEGRADED' : 'OFFLINE') : 'ONLINE', errors, items, events, daily, history: keepEvents };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(out)); fs.renameSync(tmp, file);
  return out;
}

// 給預警看板：types 可為多種（例如 DIPLO＋RHETORIC 合成一個指標）
function assessDiplomacy(cache, theater, types, now = Date.now()) {
  if (!cache?.lastSuccess || now - Date.parse(cache.lastSuccess) > 12 * HOUR || (cache.lastAttempt && Date.parse(cache.lastAttempt) - Date.parse(cache.lastSuccess) > 2 * HOUR)) return null;
  types = [].concat(types);
  const hits = [], notes = [];
  for (const type of types) {
    const recent = (cache.events || []).filter(e => e.type === type && e.theater === theater && now - Date.parse(e.firstSeen) <= 72 * HOUR && Date.parse(e.firstSeen) <= now);
    const confirmed = recent.filter(e => e.confirmed);
    if (BASELINE_TYPES.has(type) && !NO_BASELINE.has(`${type}|${theater}`)) {
      const b = baselineCheck(cache.daily, `${type}|${theater}`, now);
      if (confirmed.length && b.above) hits.push({ type, e: confirmed[0], extra: `近 3 天 ${b.recent} 篇，高於過去 30 天常態（P90 ${b.p90}）` });
      else notes.push(b.ready ? `${LABELS[type]}近 3 天 ${b.recent} 篇，在常態範圍內（P90 ${b.p90}）` : `${LABELS[type]}基準累積中（${b.days}/10 天）`);
    } else if (confirmed.length) hits.push({ type, e: confirmed[0] });
    else notes.push(`近 72 小時沒有 2 家以上媒體確認的${LABELS[type]}${recent.length ? `（另有 ${recent.length} 則單一媒體報導待確認）` : ''}`);
  }
  if (!hits.length) return { status: 'CLEAR', observedAt: cache.lastSuccess, sources: [], summary: `${notes.join('；')}。` };
  const h = hits[0], uniq = h.e.items.filter((it, i, arr) => arr.findIndex(x => x.publisher === it.publisher) === i).slice(0, 3);
  return { status: 'TRIGGERED', observedAt: h.e.firstSeen,
    summary: `${h.e.date.slice(5).replace('-', '/')} ${h.e.publishers.length} 家媒體報導${LABELS[h.type]}：${uniq[0].title.slice(0, 90)}${h.extra ? `（${h.extra}）` : ''}`.slice(0, 300),
    sources: uniq.map(it => ({ url: it.url, publisher: it.publisher, sourceClass: 'INDEPENDENT_MEDIA', publishedAt: it.publishedAt })) };
}

module.exports = { refreshDiplomacy, classify, buildEvents, dailyCounts, mergeDaily, baselineCheck, assessDiplomacy, readCache, CACHE, QUERIES, LABELS, THEATERS };
