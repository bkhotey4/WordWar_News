// 國家災害防救科技中心（NCDR）民生示警公開資料平台：CAP 格式即時告警 Atom feed（公有領域）。
// 用途：顯示政府目前發布的告警；台海指標只看「防空、飛彈、國家級警報」這類與戰爭相關的實際告警（排除演習、測試）。
// 一般天氣告警（高溫、強風、豪雨）只列在官方數據區作背景，不觸發戰爭指標。
const fs = require('fs');
const path = require('path');

const FEED = 'https://alerts.ncdr.nat.gov.tw/RssAtomFeed.ashx';
const PAGE = 'https://alerts.ncdr.nat.gov.tw/';
const CACHE = path.join(__dirname, '../../research/source_cache/ncdr_alerts.json');
const HOUR = 3600_000;
const WAR_RE = /防空|空襲|飛彈|導彈|國家級警報|警報試放|戰時|核子事故|輻射/;
const DRILL_RE = /演習|演練|測試|試放|萬安/;

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { entries: [], warHistory: [] }; } }
function writeCache(data, file = CACHE) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, file); }

const decode = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').trim();
const tag = (xml, name) => decode((xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)) || [])[1]);
// CAP 時間格式：「2026/10/19 下午 05:11:00」（台北時間）
function capTime(s) {
  const m = String(s || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s*(上午|下午)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  let h = Number(m[5]);
  if (m[4] === '下午' && h < 12) h += 12;
  if (m[4] === '上午' && h === 12) h = 0;
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T${String(h).padStart(2, '0')}:${m[6]}:${m[7] || '00'}+08:00`;
  return Number.isFinite(Date.parse(iso)) ? new Date(iso).toISOString() : null;
}

function parseFeed(xml) {
  return String(xml).split('<entry>').slice(1).map(e => {
    const title = tag(e, 'title'), summary = tag(e, 'summary');
    const href = (e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || null;
    const status = tag(e, 'cap:status') || null;
    const text = `${title} ${summary}`;
    return {
      id: tag(e, 'id'), title, summary: summary.slice(0, 300), sender: tag(e, 'name'), updated: tag(e, 'updated'),
      category: (e.match(/<category term="([^"]+)"/) || [])[1] || title, status, msgType: tag(e, 'cap:msgType') || null,
      effective: capTime(tag(e, 'cap:effective')), expires: capTime(tag(e, 'cap:expires')), url: href && /^https:\/\//.test(href) ? href : null,
      war: WAR_RE.test(text), drill: DRILL_RE.test(text) || (status && status !== 'Actual')
    };
  }).filter(e => e.id && e.title);
}

let inFlight = null;
function refreshNcdrAlerts(options = {}) { if (!inFlight) inFlight = collect(options).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now() } = {}) {
  const cache = readCache(file);
  if (!force && cache.lastAttempt && now - Date.parse(cache.lastAttempt) < 0.25 * HOUR) return cache;
  cache.lastAttempt = new Date(now).toISOString();
  try {
    const res = await fetchImpl(FEED, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'WordWarNews/2.0 (personal research bot)' } });
    if (!res.ok) throw new Error(`NCDR HTTP ${res.status}`);
    const xml = await res.text();
    if (!/<feed[\s>]/.test(xml)) throw new Error('NCDR feed format changed');
    const entries = parseFeed(xml);
    // 與戰爭相關的告警另存歷史（feed 只有目前有效的），保留 90 天
    const hist = new Map((cache.warHistory || []).map(e => [e.id, e]));
    for (const e of entries.filter(x => x.war)) hist.set(e.id, e);
    const warHistory = [...hist.values()].filter(e => now - Date.parse(e.updated || e.effective || 0) <= 90 * 24 * HOUR);
    Object.assign(cache, { entries, warHistory, status: 'ONLINE', lastSuccess: new Date(now).toISOString(), error: null });
  } catch (e) { Object.assign(cache, { status: 'DEGRADED', error: e.message }); }
  writeCache(cache, file);
  return cache;
}

const active = (e, now) => (!e.expires || Date.parse(e.expires) > now) && (!e.effective || Date.parse(e.effective) <= now + HOUR);

// 台海指標：近 24 小時內有「實際」（非演習）的防空、飛彈或國家級警報即觸發
function assessNcdrAlerts(cache, now = Date.now()) {
  if (!cache?.lastSuccess) return null;
  if (now - Date.parse(cache.lastSuccess) > 6 * HOUR) return null;
  const src = [{ url: PAGE, publisher: '國家災害防救科技中心 民生示警平台', sourceClass: 'OFFICIAL', publishedAt: cache.lastSuccess }];
  const recentWar = (cache.warHistory || []).filter(e => !e.drill && now - Date.parse(e.updated || e.effective) <= 24 * HOUR);
  const nowActive = (cache.entries || []).filter(e => active(e, now));
  const kinds = [...new Set(nowActive.map(e => e.category))];
  if (recentWar.length) {
    const e = recentWar[0];
    return { status: 'TRIGGERED', observedAt: e.updated || e.effective, summary: `${e.sender || '政府'}發布「${e.title}」：${e.summary.slice(0, 80)}（實際告警，非演習）`, sources: [{ ...src[0], url: e.url || PAGE, publishedAt: e.updated }] };
  }
  const drills = (cache.warHistory || []).filter(e => e.drill && now - Date.parse(e.updated || e.effective) <= 72 * HOUR);
  return { status: 'CLEAR', observedAt: cache.lastSuccess,
    summary: `近 24 小時沒有防空、飛彈或國家級實際告警。${nowActive.length ? `目前生效中的一般告警 ${nowActive.length} 則（${kinds.slice(0, 4).join('、')}）。` : '目前沒有生效中的告警。'}${drills.length ? `另有演習／測試告警 ${drills.length} 則。` : ''}`, sources: src };
}

module.exports = { refreshNcdrAlerts, assessNcdrAlerts, parseFeed, capTime, readCache, CACHE, FEED, PAGE };
