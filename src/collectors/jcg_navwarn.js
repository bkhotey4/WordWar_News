// 日本海上保安廳 NAVAREA XI 航行警報（西北太平洋與東南亞海域，含台灣周邊與日本周邊）。
// 這是各國依國際海事規範「事前」公告的射擊、演習、飛彈落區與飛彈發射通報，公開、免登入、英文正文。
// 用途：台海次要指標（台灣周邊預告的射擊／演習／飛彈區）、朝鮮半島主要指標（北韓飛彈發射）的官方來源。
// 只記錄公告原文所載的區域與時間，不推測行動方；公告沒有寫是哪一國的演習就不寫。
const fs = require('fs');
const path = require('path');

const PAGE = 'https://www1.kaiho.mlit.go.jp/TUHO/keiho/navarea11.html';
const CGI = 'https://www1.kaiho.mlit.go.jp/TUHO/keiho/cgi';
const CACHE = path.join(__dirname, '../../research/source_cache/jcg_navwarn.json');
const HOUR = 3600_000, DAY = 24 * HOUR;
const UA = 'Mozilla/5.0 WordWarNews/2.0 (personal research bot)';
// 台灣周邊：台灣海峽、巴士海峽、台灣東部至與那國島
const TAIWAN_BOX = { south: 19, north: 28, west: 115, east: 126 };
const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { items: {} }; } }
function writeCache(data, file = CACHE) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, file); }
const strip = html => String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// 列表 XML：<Member><categoly>…</categoly><number>0461</number><tana>260461</tana><title>…</title></Member>
function parseListXml(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<Member>([\s\S]*?)<\/Member>/g)) {
    const f = tag => new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(m[1])?.[1]?.trim() ?? null;
    const tana = f('tana'), number = f('number');
    if (!/^\d{6}$/.test(tana || '') || !/^\d{4}$/.test(number || '')) continue;
    out.push({ tana, number: `${tana.slice(0, 2)}-${number}`, category: (f('categoly') || '').replace(/\s+/g, ''), title: f('title') || '' });
  }
  return out;
}

function classify(text) {
  const t = text.toUpperCase();
  const kinds = [];
  if (/MISSILE|ROCKET|LAUNCH/.test(t)) kinds.push('MISSILE');
  if (/GUNNERY|FIRING|LIVE FIRE|SHOOTING|ROCKET FIRING/.test(t)) kinds.push('FIRING');
  if (/EXERCISE|DRILL|TRAINING|MANEUVER/.test(t)) kinds.push('EXERCISE');
  if (/NORTH KOREA|DPRK|D\.P\.R\.K/.test(t)) kinds.push('DPRK');
  return kinds;
}
// 座標 DD-MM(.m)N DDD-MM(.m)E → [lon, lat]
function coordsIn(text) {
  const out = [];
  for (const m of String(text).matchAll(/(\d{2})-(\d{2}(?:\.\d+)?)\s*([NS])[\s,]+(\d{3})-(\d{2}(?:\.\d+)?)\s*([EW])/g)) {
    const lat = (Number(m[1]) + Number(m[2]) / 60) * (m[3] === 'S' ? -1 : 1), lon = (Number(m[4]) + Number(m[5]) / 60) * (m[6] === 'W' ? -1 : 1);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) out.push([+lon.toFixed(4), +lat.toFixed(4)]);
  }
  return out;
}
// 時間窗：「160400Z TO 161500Z OCT」（日時分 Z，月份在後）；年份取公告發布年，跨年時向後推
function windowsIn(text, issuedAt) {
  const out = [];
  const base = new Date(issuedAt);
  for (const m of String(text).matchAll(/(\d{2})(\d{2})(\d{2})Z\s*(?:TO|-|UNTIL)\s*(\d{2})(\d{2})(\d{2})Z\s*([A-Z]{3})/g)) {
    const mon = MONTHS[m[7]]; if (mon === undefined) continue;
    let year = base.getUTCFullYear(); if (mon < base.getUTCMonth() - 6) year++;
    const from = Date.UTC(year, mon, +m[1], +m[2], +m[3]), to = Date.UTC(year, mon, +m[4], +m[5], +m[6]);
    if (Number.isFinite(from) && Number.isFinite(to) && to >= from) out.push({ from: new Date(from).toISOString(), to: new Date(to).toISOString() });
  }
  return out;
}
// 詳細頁：「NO.26-0461 発表日時：2026年10月12日 09時 <英文正文> NO.26-0456 …」
function parseDetails(html) {
  const text = strip(html);
  const out = [];
  const re = /NO\.(\d{2})-(\d{4})\s*発表日時：(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2})時\s*([\s\S]*?)(?=NO\.\d{2}-\d{4}\s*発表日時|$)/g;
  for (const m of text.matchAll(re)) {
    const issuedAt = new Date(Date.UTC(+m[3], +m[4] - 1, +m[5], +m[6] - 9)).toISOString(); // JST → UTC
    const body = m[7].trim().slice(0, 1500);
    const cancel = /CANCEL THIS MSG (\d{2})(\d{2})(\d{2})Z\s*([A-Z]{3})/.exec(body);
    let cancelAt = null;
    if (cancel && MONTHS[cancel[4]] !== undefined) { const b = new Date(issuedAt); let y = b.getUTCFullYear(); if (MONTHS[cancel[4]] < b.getUTCMonth() - 6) y++; cancelAt = new Date(Date.UTC(y, MONTHS[cancel[4]], +cancel[1], +cancel[2], +cancel[3])).toISOString(); }
    out.push({ number: `${m[1]}-${m[2]}`, tana: `${m[1]}${m[2]}`, issuedAt, text: body, kinds: classify(body), points: coordsIn(body), windows: windowsIn(body, issuedAt), cancelAt });
  }
  return out;
}

async function getText(url, fetchImpl, init = {}) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': UA, ...(init.headers || {}) }, ...init });
  if (!res.ok) throw new Error(`JCG HTTP ${res.status}`);
  return res.text();
}
let inFlight = null;
function refreshJcgNavwarn(options = {}) { if (!inFlight) inFlight = collect(options).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now() } = {}) {
  const cache = readCache(file);
  cache.items = cache.items || {};
  if (!force && cache.lastAttempt && now - Date.parse(cache.lastAttempt) < 3 * HOUR) return cache;
  cache.lastAttempt = new Date(now).toISOString();
  try {
    const year = new Date(now).getUTCFullYear();
    const listed = [];
    for (const y of [year - 1, year]) {
      const xml = await getText(`${CGI}/warnings.cgi`, fetchImpl, { method: 'POST', body: `YEAR=${y}&TYPE=NAVAREA11&LANG=JP`, headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset:UTF-8' } });
      listed.push(...parseListXml(xml));
    }
    if (!listed.length) throw new Error('JCG list empty or layout changed');
    const inForce = new Set(listed.map(i => i.tana));
    const missing = listed.filter(i => !cache.items[i.tana]?.text);
    for (let i = 0; i < missing.length; i += 15) {
      const batch = missing.slice(i, i + 15);
      const html = await getText(`${CGI}/disp_warnings.cgi?TYPE=NAVAREA11&TANA=${batch.map(b => b.tana).join(':')}:&LANG=JP`, fetchImpl);
      for (const d of parseDetails(html)) { const meta = batch.find(b => b.tana === d.tana) || {}; cache.items[d.tana] = { ...d, category: meta.category || null, title: meta.title || null, firstSeenAt: new Date(now).toISOString(), url: PAGE }; }
    }
    for (const it of listed) if (cache.items[it.tana]) cache.items[it.tana] = { ...cache.items[it.tana], category: it.category, title: it.title };
    for (const [tana, it] of Object.entries(cache.items)) {
      it.inForce = inForce.has(tana);
      if (!it.inForce && !it.endedAt) it.endedAt = new Date(now).toISOString();
      if (now - Date.parse(it.issuedAt) > 400 * DAY) delete cache.items[tana];
    }
    Object.assign(cache, { status: 'ONLINE', lastSuccess: new Date(now).toISOString(), error: null, inForce: inForce.size });
  } catch (e) { Object.assign(cache, { status: 'DEGRADED', error: e.message }); }
  writeCache(cache, file);
  return cache;
}

const inBox = ([lon, lat], b) => lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;
const source = (it, now) => ({ url: PAGE, publisher: '日本海上保安廳（NAVAREA XI 航行警報）', sourceClass: 'OFFICIAL', publishedAt: it?.issuedAt || new Date(now).toISOString() });
// key：TW_FIRING（台灣周邊有效的射擊／演習／飛彈區，時間在前 1 天～後 14 天內）、DPRK_MISSILE（48 小時內北韓飛彈發射通報）
// 台灣周邊有效的射擊／演習／飛彈區（時間在前 1 天～後 14 天內），新到舊；預警指標與台海動態圖共用
function taiwanFiringAreas(cache, now = Date.now()) {
  return Object.values(cache?.items || {}).filter(it => it.inForce && it.kinds.some(k => ['FIRING', 'EXERCISE', 'MISSILE'].includes(k)) && it.points.some(p => inBox(p, TAIWAN_BOX))
    && (it.windows.length ? it.windows.some(w => Date.parse(w.to) >= now - DAY && Date.parse(w.from) <= now + 14 * DAY) : now - Date.parse(it.issuedAt) <= 14 * DAY))
    .sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt));
}
function assessJcg(cache, key, now = Date.now()) {
  if (!cache?.lastSuccess || now - Date.parse(cache.lastSuccess) > 24 * HOUR) return null;
  const items = Object.values(cache.items || {});
  const fmt = t => new Date(Date.parse(t) + 8 * HOUR).toISOString().slice(5, 16).replace('T', ' ');
  if (key === 'TW_FIRING') {
    const hits = taiwanFiringAreas(cache, now);
    if (!hits.length) return { status: 'CLEAR', observedAt: cache.lastSuccess, value: 0, unit: '則', summary: `目前有效的 NAVAREA XI 航行警報中，沒有台灣周邊（北緯 ${TAIWAN_BOX.south}–${TAIWAN_BOX.north}°、東經 ${TAIWAN_BOX.west}–${TAIWAN_BOX.east}°）的射擊、演習或飛彈落區公告。`, sources: [source(null, now)] };
    const top = hits[0], w = top.windows[0];
    return { status: 'TRIGGERED', observedAt: top.issuedAt, value: hits.length, unit: '則',
      summary: `航行警報 NO.${top.number}（${fmt(top.issuedAt)} 發布）：${top.text.slice(0, 140)}${w ? `｜時間 ${fmt(w.from)}～${fmt(w.to)}（台北）` : ''}${hits.length > 1 ? `；另有 ${hits.length - 1} 則` : ''}。公告只載明區域與時間，未載明行動方。`.slice(0, 300),
      sources: [source(top, now)] };
  }
  if (key === 'DPRK_MISSILE') {
    const hits = items.filter(it => it.kinds.includes('DPRK') && it.kinds.includes('MISSILE') && now - Date.parse(it.issuedAt) <= 48 * HOUR).sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt));
    if (!hits.length) return { status: 'CLEAR', observedAt: cache.lastSuccess, value: 0, unit: '則', summary: '近 48 小時沒有海上保安廳的北韓飛彈發射航行警報。', sources: [source(null, now)] };
    const top = hits[0];
    return { status: 'TRIGGERED', observedAt: top.issuedAt, value: hits.length, unit: '則', summary: `海上保安廳 NO.${top.number}（${fmt(top.issuedAt)} 發布）：${top.text.slice(0, 160)}${hits.length > 1 ? `；48 小時內共 ${hits.length} 則` : ''}`.slice(0, 300), sources: [source(top, now)] };
  }
  return null;
}

module.exports = { taiwanFiringAreas, refreshJcgNavwarn, parseListXml, parseDetails, classify, coordsIn, windowsIn, assessJcg, readCache, CACHE, PAGE, TAIWAN_BOX };
