// 動員前兆：各國開戰前常見的準備動作——後備召集與役期、緊急狀態與資訊管制、民防與醫療、物資儲備與經濟管制，
// 以及歐洲各國與歐盟的備戰（國防預算、恢復徵兵、民防手冊）。以 Google News 標題比對，標題中「第一個出現的國家」視為行動方，
// 對應到該國所屬戰區。同一天同一類有 2 家以上媒體報導才算確認；戰事中天天有的（俄國、以色列召集後備、歐洲備戰、物資收儲）另比 30 日常態。
const fs = require('fs');
const path = require('path');
const { parseRss } = require('./pla_joint');
const { baselineCheck, mergeDaily } = require('./diplomacy');

const CACHE = path.join(__dirname, '../../research/source_cache/mobilization.json');
const HOUR = 3600_000, DAY = 24 * HOUR, KEEP_DAYS = 35;

// 行動方國家 → 戰區
const ACTORS = [
  ['CN', /China|Chinese|Beijing|\bPLA\b|中國|中共|北京|解放軍|陸方/i, 'taiwan_strait'],
  ['RU', /Russia|Russian|Moscow|Kremlin|Putin|俄羅斯|俄國|俄方|莫斯科|克里姆林|普丁/i, 'ukraine_front'],
  ['BY', /Belarus|Minsk|Lukashenko|白俄/i, 'europe_security'],
  ['KP', /North Korea|N\. Korea|DPRK|Pyongyang|Kim Jong|北韓|朝鮮|平壤|金正恩/i, 'korea_peninsula'],
  ['IR', /Iran|Tehran|伊朗|德黑蘭/i, 'iran_gulf'],
  ['IL', /Israel|IDF|以色列|以軍/i, 'middle_east'],
  // 其他國家（不屬於任何戰區的行動方，例如日本宣布對俄制裁、美國呼籲歐洲動員）：標題以它們開頭就不算
  ['OTHER', /Japan|Japanese|\bUS\b|U\.S\.|United States|America|Britain|British|\bUK\b|Canada|Australia|Ukrain|India|South Korea|Seoul|Asia|West|Trump|Rubio|日本|美國|美方|英國|加拿大|澳洲|烏克蘭|印度|南韓|韓國|亞洲|西方|川普/, null],
  ['EU', /\bEU\b|European Union|Brussels|Europe|Poland|Polish|Germany|German|Sweden|Swedish|Finland|Finnish|France|French|Baltic|Lithuania|Latvia|Estonia|Norway|Denmark|Netherlands|Dutch|Romania|歐盟|歐洲|波蘭|德國|瑞典|芬蘭|法國|波羅的海|立陶宛|拉脫維亞|愛沙尼亞|挪威|丹麥|荷蘭|羅馬尼亞/i, 'europe_security']
];
const RULES = [
  ['EMERGENCY', /state of emergency|martial law|wartime (regime|footing|status|economy)|state of war|internet (shutdown|blackout)|block\w* (the )?(social media|internet|Telegram|WhatsApp|Instagram)|緊急狀態|戒嚴|戰時(狀態|體制|經濟)|進入戰爭狀態|斷網|網路封鎖|封鎖(社群|網路|通訊軟體)/i],
  ['RESERVE', /reservists?|call(ed|s|ing)? up|call-ups?|mobiliz\w*|conscript\w*|draft (age|law)|stop-loss|extend\w* (military |mandatory )?service|召集|後備軍人|後備役|動員令|徵兵|徵召|延長(服役|役期)|暫停退伍|兵役法|動員法|退伍.{0,4}(暫停|延後)/i],
  ['CIVDEF', /civil defen[cs]e|air[- ]raid (drills?|sirens?|exercises?)|bomb shelters?|iodine|evacuation drills?|emergency (preparedness )?(booklet|brochure|guide|kit)|blood (supply|supplies|reserves|drive)|民防|防空(演習|演練|警報)|防空洞|避難所|碘片|疏散演練|戰時醫療|血庫|徵用醫院/i],
  ['STOCKPILE', /((stockpil\w*|strategic (reserves?|stocks?)|export (ban|curbs|restrictions)|囤積|收儲|戰略(儲備|物資)|限制出口|禁止出口|出口禁令).{0,30}(grain|rice|wheat|soy\w*|pork|food|oil|crude|fuel|diesel|gas|copper|metals?|gold|medic\w*|糧|米|小麥|大豆|豬肉|食品|石油|原油|燃料|柴油|天然氣|銅|金屬|黃金|藥))|((grain|rice|wheat|soy\w*|food|oil|crude|fuel|糧|米|小麥|大豆|石油|原油|燃料).{0,20}(stockpil\w*|reserves?|囤積|收儲|儲備))|capital controls?|repatriat\w* (assets|funds|gold)|資本管制|撤回海外(資產|資金)/i],
  ['EUPREP', /defen[cs]e (spending|budget|plan|fund|industry|bonds?)|rearm\w*|ReArm|\bSAFE\b|readiness 2030|military mobility|national service|國防(預算|支出|計畫|基金)|重新武裝|備戰|恢復徵兵/i]
];
const LABELS = { EMERGENCY: '緊急狀態、戒嚴或資訊管制', RESERVE: '後備召集、延長役期或動員法令', CIVDEF: '民防演習、避難所或醫療備戰', STOCKPILE: '戰略物資收儲或經濟管制', EUPREP: '歐洲各國與歐盟備戰（國防預算、徵兵、民防）' };
// 這些組合平常就常見，要比 30 日常態
const BASELINE = new Set(['RESERVE|ukraine_front', 'RESERVE|middle_east', 'EUPREP|europe_security', 'STOCKPILE|taiwan_strait', 'STOCKPILE|ukraine_front', 'STOCKPILE|iran_gulf', 'CIVDEF|europe_security', 'EMERGENCY|ukraine_front']);
const NOT_EVENT = /討論牆|開講|解讀|觀點|投書|專欄|trims?|reduc\w*|scal\w* back|releas\w* reservists|demobiliz\w*|縮減|解除動員|復員|\?\s*$|^(will|could|should|can|is|are|does|why|how|what)\b|\bopinion\b|analysis|explain|explainer|podcast|anniversar|years? (after|ago)|history of|會不會|是否|嗎[？?]?$|懶人包|一次看|專家|評論|分析|社論|週年|回顧|歷史/i;
// 台灣自己的整備（全社會防衛、萬安、國軍）不是威脅訊號，排除
const OWN = /台灣|臺灣|國軍|我國|全民防衛|全社會防衛|萬安|民安|Taiwan(?:ese)? (army|military|government|reservists?|civil)/i;

const QUERIES = [
  '(Russia OR "North Korea" OR Iran OR Israel OR Belarus OR China) (reservists OR mobilization OR conscription OR "call-up") when:3d',
  '(Russia OR Iran OR "North Korea" OR Israel OR China) ("state of emergency" OR "martial law" OR "internet shutdown" OR "civil defense" OR "air raid drill") when:3d',
  '(China OR Russia OR Iran) (stockpiling OR "strategic reserves" OR "export ban" OR "capital controls") when:3d',
  '(EU OR Europe OR Poland OR Germany OR Sweden OR Finland OR Baltic) ("defence spending" OR "defense spending" OR rearm OR conscription OR "civil defence" OR "national service") when:3d',
  '(中國 OR 俄羅斯 OR 北韓 OR 伊朗 OR 以色列) (動員 OR 後備 OR 徵兵 OR 戒嚴 OR 緊急狀態 OR 民防 OR 防空演習) when:3d',
  '(中國 OR 大陸) (囤積 OR 收儲 OR 戰略儲備 OR 國防動員 OR 戰時) when:3d',
  '(歐盟 OR 歐洲 OR 波蘭 OR 德國 OR 瑞典 OR 芬蘭) (國防預算 OR 備戰 OR 徵兵 OR 民防) when:3d'
];
const feedUrl = q => /[一-鿿]/.test(q)
  ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`
  : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

// 標題中最早出現的國家當作行動方
function actorOf(t) {
  let best = null;
  for (const [code, re, theater] of ACTORS) {
    const m = re.exec(t); if (m && (!best || m.index < best.index)) best = { code, theater, index: m.index };
  }
  return best;
}
function classify(title) {
  const t = String(title || '');
  if (NOT_EVENT.test(t)) return null;
  const actor = actorOf(t); if (!actor || !actor.theater) return null;
  if (OWN.test(t) && actor.code !== 'CN') return null;
  if (actor.code === 'CN' && OWN.test(t) && !/^[^台臺]*?(中國|中共|北京|解放軍|China|Beijing|PLA)/i.test(t)) return null;
  const rule = RULES.find(([, re]) => re.test(t));
  if (!rule) return null;
  // 行動方要出現在動作之前（「亞洲囤油因應伊朗戰事」的行動方不是伊朗）
  if (rule[1].exec(t).index < actor.index) return null;
  let type = rule[0];
  if (actor.code === 'EU') type = 'EUPREP'; // 歐洲各國的備戰動作統一歸「歐洲備戰」
  else if (type === 'EUPREP') return null;   // 非歐洲國家的國防預算新聞不算
  return { type, theater: actor.theater, actor: actor.code };
}

const taipeiDate = iso => new Date(Date.parse(iso) + 8 * HOUR).toISOString().slice(0, 10);
function buildEvents(items, now = Date.now()) {
  const groups = new Map();
  for (const it of items) {
    if (Date.parse(it.publishedAt) > now + 10 * 60_000) continue;
    const c = classify(it.title); if (!c) continue;
    const id = `${c.type}|${c.theater}|${taipeiDate(it.publishedAt)}`;
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
function refreshMobilization(opts = {}) { if (!inFlight) inFlight = collect(opts).finally(() => { inFlight = null; }); return inFlight; }
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
  const stillValid = e => { const c = classify(e.title); return c && c.type === e.type && c.theater === e.theater; };
  const history = [...new Map([...(prev.history || []).filter(stillValid), ...events.filter(e => e.confirmed).map(compact)]
    .filter(e => now - Date.parse(e.firstSeen) <= KEEP_DAYS * DAY).map(e => [e.id, e])).values()].sort((a, b) => b.firstSeen.localeCompare(a.firstSeen)).slice(0, 300);
  const out = { lastAttempt: new Date(now).toISOString(), lastSuccess: errors.length * 2 <= QUERIES.length ? new Date(now).toISOString() : prev.lastSuccess || null,
    status: errors.length ? (errors.length < QUERIES.length ? 'DEGRADED' : 'OFFLINE') : 'ONLINE', errors, items, events, daily, history };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(out)); fs.renameSync(tmp, file);
  return out;
}

// types 可以是多種（例如 EMERGENCY+CIVDEF+STOCKPILE 合成「後方備戰」一個指標）
function assessMobilization(cache, theater, types, now = Date.now()) {
  if (!cache?.lastSuccess || now - Date.parse(cache.lastSuccess) > 12 * HOUR || (cache.lastAttempt && Date.parse(cache.lastAttempt) - Date.parse(cache.lastSuccess) > 2 * HOUR)) return null;
  const hits = [], notes = [];
  for (const type of [].concat(types)) {
    const recent = (cache.events || []).filter(e => e.type === type && e.theater === theater && now - Date.parse(e.firstSeen) <= 72 * HOUR && Date.parse(e.firstSeen) <= now);
    const confirmed = recent.filter(e => e.confirmed);
    if (BASELINE.has(`${type}|${theater}`)) {
      const b = baselineCheck(cache.daily, `${type}|${theater}`, now);
      if (confirmed.length && b.above) hits.push({ type, e: confirmed[0], extra: `近 3 天 ${b.recent} 則，高於 30 日常態 P90 ${b.p90}` });
      else notes.push(b.ready ? `${LABELS[type]}在常態範圍內` : `${LABELS[type]}基準累積中（${b.days}/10 天）`);
    } else if (confirmed.length) hits.push({ type, e: confirmed[0] });
    else notes.push(`近 72 小時沒有 2 家以上媒體確認的${LABELS[type]}${recent.length ? `（另有 ${recent.length} 則待確認）` : ''}`);
  }
  if (!hits.length) return { status: 'CLEAR', observedAt: cache.lastSuccess, sources: [], summary: `${notes.join('；')}。`.slice(0, 300) };
  const h = hits[0], uniq = h.e.items.filter((it, i, arr) => arr.findIndex(x => x.publisher === it.publisher) === i).slice(0, 3);
  return { status: 'TRIGGERED', observedAt: h.e.firstSeen,
    summary: `${h.e.date.slice(5).replace('-', '/')} ${h.e.publishers.length} 家媒體報導${LABELS[h.type]}：${uniq[0].title.slice(0, 90)}${h.extra ? `（${h.extra}）` : ''}`.slice(0, 300),
    sources: uniq.map(it => ({ url: it.url, publisher: it.publisher, sourceClass: 'INDEPENDENT_MEDIA', publishedAt: it.publishedAt })) };
}

module.exports = { refreshMobilization, classify, actorOf, buildEvents, assessMobilization, readCache, CACHE, LABELS };
