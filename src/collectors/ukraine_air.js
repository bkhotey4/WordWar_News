// 烏克蘭空軍（Повітряні Сили ЗСУ）每日公布的俄軍飛彈與無人機數量。
// 來源：空軍官方 Telegram 頻道的公開網頁版 https://t.me/s/kpszsu（夜間與白天兩則彙整通報）。
// 數字為烏方（交戰方）公布，只用於「攻擊量相對歷史的變化」，不當作外部證實的戰果。
const fs = require('fs');
const path = require('path');


const CHANNEL = 'https://t.me/s/kpszsu';
const CACHE = path.join(__dirname, '../../research/source_cache/ukraine_air_attacks.json');
const DAY = 86400_000;
const MONTHS = { 'січня': 1, 'лютого': 2, 'березня': 3, 'квітня': 4, 'травня': 5, 'червня': 6, 'липня': 7, 'серпня': 8, 'вересня': 9, 'жовтня': 10, 'листопада': 11, 'грудня': 12 };
const WORDS = { 'одною': 1, 'однією': 1, 'двома': 2, 'трьома': 3, 'чотирма': 4, "п'ятьма": 5, 'шістьма': 6, 'сімома': 7, 'сьома': 7, 'вісьмома': 8, "дев'ятьма": 9, 'десятьма': 10 };

function countBefore(clause, index, singular) {
  const tokens = clause.slice(0, index).trim().split(/\s+/).slice(singular ? -3 : -4);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const raw = tokens[i], w = raw.replace(/[,.;:()]/g, '').toLowerCase();
    if (/^\d+$/.test(w)) return Number(w);
    if (WORDS[w]) return WORDS[w];
    if ((singular || i < tokens.length - 1) && (/,$/.test(raw) || ['та', 'і', 'й'].includes(w))) break;
  }
  return singular ? 1 : null;
}

// 武器型號：類別（依形容詞）＋型號（依名稱），數量取自通報原文；沒有數字時 count 為 null
const CATEGORIES = [[/балістичн/i, '彈道飛彈'], [/крилат/i, '巡弋飛彈'], [/протикорабельн/i, '反艦飛彈'], [/протирадіолокаційн/i, '反輻射飛彈'], [/зенітн/i, '防空飛彈（對地用）'], [/керован/i, '導引飛彈']];
const MODELS = [[/Іскандер|Искандер|Iskander/i, '伊斯坎德爾'], [/Кинджал|Кінжал|Kinzhal/i, '匕首'], [/Калібр|Kalibr/i, '口徑'], [/Циркон|Zircon/i, '鋯石'], [/Онікс|Oniks/i, '縞瑪瑙'],
  [/Х-101|Kh-101/i, 'Kh-101'], [/Х-22|Kh-22/i, 'Kh-22'], [/Х-59|Х-69|Kh-59|Kh-69/i, 'Kh-59/69'], [/Х-31|Kh-31/i, 'Kh-31'], [/KN-23/i, 'KN-23'], [/С-300|С-400|S-300|S-400/i, 'S-300/400']];
function weaponsIn(clause, rest) {
  const out = [];
  const tokens = [...clause.matchAll(/ракет(ою|ами|и)(?![а-яіїє])/gi)];
  for (const x of tokens) {
    const before = clause.slice(Math.max(0, x.index - 40), x.index), after = clause.slice(x.index, x.index + 60).split(/,|;|\n| та | і /)[0];
    const category = (CATEGORIES.find(([re]) => re.test(before)) || [null, '飛彈'])[1];
    const models = MODELS.filter(([re]) => re.test(after)).map(([, n]) => n);
    out.push({ category, model: models.join('／') || null, count: countBefore(clause, x.index, x[1].toLowerCase() === 'ою'), basis: 'LAUNCHED' });
  }
  // 發射數缺漏的型號，用擊落清單補（標示為「擊落數下限」）
  const at = rest.search(/збито/i);
  if (at >= 0) for (const m of rest.slice(at).matchAll(/^\s*[-–•]\s*(\d+)\s+([^\n;]*?ракет[^\n;]*)/gim)) {
    const category = (CATEGORIES.find(([re]) => re.test(m[2])) || [null, '飛彈'])[1];
    const model = MODELS.filter(([re]) => re.test(m[2])).map(([, n]) => n).join('／') || null;
    const same = out.find(w => w.count === null && (w.model === model || w.category === category));
    if (same) { same.count = Number(m[1]); same.basis = 'INTERCEPTED_MIN'; }
  }
  const jetM = clause.match(/(\d+)\s+(?:з|із)\s+них\s*[-—–]\s*реактивн/i) || clause.match(/з\s+яких\s+(\d+)\s*[-—–]\s*реактивн/i);
  const jet = jetM;
  const droneTypes = [[/Shahed|Шахед/i, 'Shahed 沙赫德'], [/Гербера/i, 'Gerbera 誘餌機'], [/Пародія/i, '「模仿」誘餌機'], [/Бандероль|Дань-Т/i, '「包裹」巡飛彈']].filter(([re]) => re.test(clause)).map(([, n]) => n);
  return { missilesByType: out, jetDrones: jet ? Number(jet[1]) : null, droneTypes };
}

// 回傳 {kind:'NIGHT'|'DAY', date:'YYYY-MM-DD', drones, missiles}；看不懂的通報回傳 null，不猜數字
function parseAirForceSummary(text, postedAt) {
  const t = String(text || '').replace(/ /g, ' ').replace(/[’`ʼ]/g, "'");
  let m = t.match(/У ніч на (\d{1,2}) ([а-яіїє]+)/i), kind = null;
  if (m && /\(з \d{1,2}[:.]\d{2}/.test(t)) kind = 'NIGHT';
  else { m = t.match(/Протягом (?:дня|доби) (\d{1,2}) ([а-яіїє]+)/i); if (m) kind = 'DAY'; }
  if (!kind) return null;
  const month = MONTHS[m[2].toLowerCase()];
  const posted = new Date(postedAt);
  if (!month || Number.isNaN(posted.getTime())) return null;
  let year = posted.getUTCFullYear(); if (month === 12 && posted.getUTCMonth() === 0) year--;
  const date = `${year}-${String(month).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
  const start = t.search(/атакува/);
  if (start < 0) return null;
  let clause = t.slice(start);
  const end = clause.search(/За попередніми|Про це|Основний напрямок|Основні напрямки|Станом на|Повітряний напад відбивали|❗|💥/);
  if (end > 0) clause = clause.slice(0, end);
  const dm = clause.match(/(\d+)(?:-[а-яіїє]+)?\s+(?:ударн\S*\s+)?(?:БпЛА|БПЛА|безпілотн)/i);
  let missiles = 0, unknown = false, mentions = 0;
  for (const x of clause.matchAll(/ракет(ою|ами|и)(?![а-яіїє])/gi)) {
    mentions++;
    const n = countBefore(clause, x.index, x[1].toLowerCase() === 'ою');
    if (n === null) unknown = true; else missiles += n;
  }
  // 發射數未寫明時，改用「已擊落／壓制」清單中的飛彈數作為下限
  let basis = 'LAUNCHED';
  if (unknown) {
    const rest = t.slice(start + clause.length); // 只看攻擊描述之後的擊落清單
    const at = rest.search(/збито/i);
    const lines = at >= 0 ? [...rest.slice(at).matchAll(/^\s*[-–•]\s*(\d+)\s+[^\n;]*?ракет/gim)] : [];
    if (lines.length) { missiles = Math.max(missiles, lines.reduce((sum, x) => sum + Number(x[1]), 0)); basis = 'INTERCEPTED_MIN'; unknown = false; }
    // 仍無數字：每種被點名的飛彈至少 1 枚，只作下限
    else { missiles = Math.max(missiles, mentions); basis = 'MENTIONED_MIN'; unknown = false; }
  }
  return { kind, date, drones: dm ? Number(dm[1]) : null, missiles: unknown ? null : missiles,
    missileBasis: unknown ? null : (missiles === 0 && !/ракет/i.test(clause) ? 'NONE_REPORTED' : basis),
    weapons: weaponsIn(clause, t.slice(start + clause.length)) };
}

function parsePage(html) {
  const $ = require('cheerio').load(html);
  return $('.tgme_widget_message').toArray().map(el => {
    const node = $(el), textNode = node.find('.tgme_widget_message_text').first();
    textNode.find('br').replaceWith('\n');
    return { post: node.attr('data-post'), time: node.find('time').first().attr('datetime'), text: textNode.text() };
  }).filter(m => /^kpszsu\/\d+$/.test(m.post || '') && Number.isFinite(Date.parse(m.time)));
}

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { reports: [] }; } }
function writeCache(data, file = CACHE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
}
function mergeReports(cache, found) {
  const byPost = new Map((cache.reports || []).map(r => [r.post, r]));
  for (const r of found) byPost.set(r.post, r);
  cache.reports = [...byPost.values()].sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  return cache;
}

let inFlight = null;
function refreshUkraineAir(options = {}) { if (!inFlight) inFlight = collect(options).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now(), maxPages = 40 } = {}) {
  const cache = readCache(file);
  if (!force && cache.lastAttempt && now - Date.parse(cache.lastAttempt) < 30 * 60_000) return cache;
  cache.lastAttempt = new Date(now).toISOString();
  try {
    const known = Math.max(0, ...(cache.reports || []).map(r => Number(r.post.split('/')[1])));
    const found = [];
    let before = null, pages = 0, reachedKnown = false;
    while (pages < maxPages && !reachedKnown) {
      const res = await fetchImpl(before ? `${CHANNEL}?before=${before}` : CHANNEL, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 WordWarNews/2.0' } });
      if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
      const messages = parsePage(await res.text());
      if (!messages.length) { if (!pages) throw new Error('Telegram page layout changed'); break; }
      pages++;
      for (const m of messages) {
        const parsed = /атакува/.test(m.text) ? parseAirForceSummary(m.text, m.time) : null;
        if (parsed) found.push({ post: m.post, url: `https://t.me/${m.post}`, time: new Date(m.time).toISOString(), ...parsed, excerpt: m.text.replace(/\s+/g, ' ').trim().slice(0, 240) });
      }
      const oldest = Math.min(...messages.map(m => Number(m.post.split('/')[1])));
      reachedKnown = known > 0 && oldest <= known;
      // 首次執行最多回溯 3 天；歷史基線由 research/source_cache 的初始資料提供
      if (!known && now - Math.min(...messages.map(m => Date.parse(m.time))) > 3 * DAY) break;
      before = oldest;
    }
    mergeReports(cache, found);
    // 舊紀錄（初始資料）沒有武器型號：近 14 天最多補抓 20 則單篇頁面
    const missing = cache.reports.filter(r => !r.weapons && now - Date.parse(r.time) <= 14 * DAY).slice(0, 20);
    for (const r of missing) {
      try {
        const res = await fetchImpl(`https://t.me/${r.post}?embed=1&mode=tme`, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 WordWarNews/2.0' } });
        if (!res.ok) continue;
        const [m] = parsePage(await res.text());
        const text = m?.text; if (!text) continue;
        const p = parseAirForceSummary(text, r.time);
        if (p) Object.assign(r, { weapons: p.weapons, excerpt: r.excerpt || text.replace(/\s+/g, ' ').trim().slice(0, 240) });
      } catch { /* 下次再補 */ }
    }
    Object.assign(cache, { status: 'ONLINE', lastSuccess: new Date(now).toISOString(), channel: CHANNEL, pagesRead: pages, error: null });
  } catch (e) {
    Object.assign(cache, { status: 'DEGRADED', error: e.message });
  }
  writeCache(cache, file);
  return cache;
}

function quantile(values, q) { const s = [...values].sort((a, b) => a - b); return s[Math.ceil(q * s.length) - 1]; }
// 以「夜間通報日期」為一天：夜間＋同日白天的無人機與飛彈總數
function dailySeries(reports) {
  const days = new Map();
  for (const r of [...reports].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))) {
    if (r.drones === null && r.missiles === null) continue;
    const d = days.get(r.date) || { date: r.date };
    d[r.kind === 'NIGHT' ? 'night' : 'day'] = r; // 同日同類型以較晚的通報（更正）為準
    days.set(r.date, d);
  }
  return [...days.values()].filter(d => d.night).map(d => {
    const parts = [d.night, d.day].filter(Boolean);
    const missilesKnown = parts.every(p => p.missiles !== null);
    return { date: d.date, drones: parts.reduce((s, p) => s + (p.drones || 0), 0), missiles: missilesKnown ? parts.reduce((s, p) => s + p.missiles, 0) : null,
      nightMissiles: d.night.missiles, complete: Boolean(d.day), sources: parts.map(p => p.url) };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function assessUkraineAir(cache, now = Date.now()) {
  const result = { status: 'UNAVAILABLE', ruleVersion: 'ua-air-7d-p95-v1' };
  const series = dailySeries(cache?.reports || []).filter(d => Date.parse(`${d.date}T06:00:00Z`) <= now);
  const latest = series.at(-1);
  if (!latest) return result;
  if (now - Date.parse(`${latest.date}T06:00:00Z`) > 48 * 3600_000) return { ...result, status: 'STALE', latest };
  const total = d => d.drones + (d.missiles || 0);
  const idx = new Map(series.map((d, i) => [d.date, i]));
  const shift = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
  const avg7 = endDate => {
    const vals = [];
    for (let k = 0; k < 7; k++) { const i = idx.get(shift(endDate, -k)); if (i !== undefined) vals.push(total(series[i])); }
    return vals.length >= 5 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const current = avg7(latest.date);
  const avgSamples = [], missileSamples = [];
  for (let d = 1; d <= 60; d++) {
    const date = shift(latest.date, -d);
    const a = avg7(date); if (a !== null) avgSamples.push(a);
    const i = idx.get(date); if (i !== undefined && series[i].nightMissiles !== null) missileSamples.push(series[i].nightMissiles);
  }
  const base = { ...result, latest, current7dAvg: current === null ? null : Math.round(current), samples: avgSamples.length, missileSamples: missileSamples.length };
  if (current === null || avgSamples.length < 30) return { ...base, status: 'INSUFFICIENT_HISTORY' };
  const p95 = quantile(avgSamples, 0.95);
  const missileP95 = missileSamples.length >= 30 ? quantile(missileSamples, 0.95) : null;
  const volumeHigh = current > p95;
  const missileHigh = missileP95 !== null && latest.nightMissiles !== null && latest.nightMissiles > missileP95;
  return { ...base, historicalP95: Math.round(p95), missileP95, volumeHigh, missileHigh, baselineWindowDays: 60,
    status: volumeHigh || missileHigh ? 'ABOVE_HISTORICAL_P95' : 'WITHIN_HISTORICAL_RANGE' };
}

module.exports = { refreshUkraineAir, parseAirForceSummary, parsePage, dailySeries, assessUkraineAir, mergeReports, readCache, CACHE, CHANNEL };
