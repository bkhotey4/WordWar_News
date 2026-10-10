// 共軍「聯合戰備警巡」與具名演習（聯合利劍、海峽雷霆等）即時偵測。
// 國防部這類公告是臨時新聞稿，不在每日動態清單內；這裡以 Google News 彙整國內外媒體標題，
// 同一天、同一類事件要有 2 家以上不同媒體報導才算確認，確認後觸發台海主要指標。
const fs = require('fs');
const path = require('path');

const CACHE = path.join(__dirname, '../../research/source_cache/pla_joint.json');
const HOUR = 3600_000, DAY_MS = 24 * HOUR;
const QUERIES = [
  '"聯合戰備警巡" when:2d',
  '(東部戰區 OR 解放軍 OR 共軍) (演習 OR 軍演) (臺灣 OR 台灣 OR 台島 OR 圍台) when:2d',
  '(PLA OR "Eastern Theater Command") (drills OR exercise OR "combat readiness patrol") Taiwan when:2d'
];
const feedUrl = q => /[\u4e00-\u9fff]/.test(q)
  ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`
  : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

// 具名演習（歷年東部戰區圍台演習名稱）；「漢光」是國軍自己的演習，排除
const EXERCISE_NAMES = ['聯合利劍', '海峽雷霆', '正義使命', 'Joint Sword', 'Strait Thunder', 'Justice Mission'];
function classify(title) {
  const t = String(title || '');
  if (/漢光|Han Kuang/i.test(t)) return null;
  // 回顧、週年、分析、評論類標題不是新事件
  if (/週年|周年|回顧|分析|評論|專家|解讀|懶人包|一次看|anniversar|analysis|opinion|explain|lessons|\?\s*$|是否|會不會/i.test(t)) return null;
  const named = EXERCISE_NAMES.find(n => t.toLowerCase().includes(n.toLowerCase()));
  const quoted = t.match(/東部戰區[^」]{0,20}「([^」]{2,10})」[^。，]{0,6}(演習|軍演)/);
  if (named || (quoted && /演習|軍演/.test(t))) return { type: 'NAMED_EXERCISE', name: named || quoted[1] };
  if (/聯合戰備警巡|joint combat readiness patrol/i.test(t)) return { type: 'JOINT_PATROL', name: '聯合戰備警巡' };
  return null;
}
function numbers(title) {
  const t = String(title || '');
  const sorties = t.match(/(\d{1,3})\s*架次/) || t.match(/(\d{1,3})\s*(?:military )?(?:aircraft|planes|jets)/i);
  const crossing = t.match(/(\d{1,3})\s*架次?[^，。]{0,6}(?:逾越|越過|跨越)中線/) || t.match(/(?:逾越|越過|跨越)中線[^，。\d]{0,8}(\d{1,3})/);
  return { sorties: sorties ? Number(sorties[1]) : null, crossing: crossing ? Number(crossing[1]) : null };
}

// Google News RSS：<item><title>…</title><link>…</link><pubDate>…</pubDate><source url="…">媒體</source></item>
function parseRss(xml) {
  const decode = s => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const get = tag => decode((m[1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)) || [])[1]);
    const publisher = get('source');
    let title = get('title');
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -publisher.length - 3);
    const d = new Date(get('pubDate'));
    return { title, url: get('link'), publishedAt: Number.isFinite(d.getTime()) ? d.toISOString() : null, publisher };
  }).filter(i => i.title && i.url && i.publisher && Number.isFinite(Date.parse(i.publishedAt)));
}

const taipeiDate = iso => new Date(Date.parse(iso) + 8 * HOUR).toISOString().slice(0, 10);
// 同一天同一類事件併成一筆；不同媒體數 ≥ 2 才確認
function buildEvents(items, now = Date.now()) {
  const groups = new Map();
  for (const it of items) {
    if (Date.parse(it.publishedAt) > now + 10 * 60_000) continue;
    const c = classify(it.title); if (!c) continue;
    const key = `${c.type}|${c.type === 'NAMED_EXERCISE' ? c.name : ''}|${taipeiDate(it.publishedAt)}`;
    const g = groups.get(key) || { id: key, type: c.type, name: c.name, date: taipeiDate(it.publishedAt), items: [] };
    if (!g.items.some(x => x.url === it.url)) g.items.push({ ...it, ...numbers(it.title) });
    groups.set(key, g);
  }
  return [...groups.values()].map(g => {
    const publishers = [...new Set(g.items.map(i => i.publisher))];
    const pick = k => Math.max(0, ...g.items.map(i => i[k] || 0)) || null;
    g.items.sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
    return { ...g, publishers, confirmed: publishers.length >= 2, sorties: pick('sorties'), crossing: pick('crossing'),
      firstSeen: g.items[0].publishedAt, items: g.items.slice(0, 8) };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
let inFlight = null;
function refreshPlaJoint(opts = {}) { if (!inFlight) inFlight = collect(opts).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now() } = {}) {
  const prev = readCache(file) || { items: [] };
  if (!force && prev.lastAttempt && now - Date.parse(prev.lastAttempt) < 20 * 60_000) return prev;
  const errors = []; const fresh = [];
  for (const q of QUERIES) {
    try {
      const res = await fetchImpl(feedUrl(q), { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 WordWarNews/2.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fresh.push(...parseRss(await res.text()));
    } catch (e) { errors.push(`${q.slice(0, 20)}…: ${e.message}`); }
  }
  // 保留 14 天內的標題，讓事件跨輪巡檢累積媒體數
  const byUrl = new Map([...(prev.items || []), ...fresh].filter(i => now - Date.parse(i.publishedAt) <= 14 * 24 * HOUR).map(i => [i.url, i]));
  const items = [...byUrl.values()];
  const out = { lastAttempt: new Date(now).toISOString(), lastSuccess: errors.length * 2 <= QUERIES.length ? new Date(now).toISOString() : prev.lastSuccess || null,
    status: errors.length ? (errors.length < QUERIES.length ? 'DEGRADED' : 'OFFLINE') : 'ONLINE', errors, items, events: buildEvents(items, now) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(out, null, 1)); fs.renameSync(tmp, file);
  return out;
}

// 給預警看板：聯合戰備警巡 72 小時內、具名演習 7 天內有確認事件就觸發
function assessPlaJoint(cache, type, now = Date.now()) {
  if (!cache?.events) return null;
  const windowH = type === 'NAMED_EXERCISE' ? 7 * 24 : 72;
  const recent = cache.events.filter(e => e.type === type && now - Date.parse(e.firstSeen) <= windowH * HOUR && Date.parse(e.firstSeen) <= now);
  const hit = recent.find(e => e.confirmed);
  if (!cache.lastSuccess || now - Date.parse(cache.lastSuccess) > 12 * HOUR || (cache.lastAttempt && Date.parse(cache.lastAttempt) - Date.parse(cache.lastSuccess) > 2 * HOUR)) return null; // 來源太久沒更新就不判定
  return { hit, pending: recent.filter(e => !e.confirmed) };
}

// 新確認事件快訊：同一事件只推一次；具名演習不受靜默時段限制
const ALERT_STATE = path.join(__dirname, '../../research/pla_alert_state.json');
function alertText(e) {
  const head = e.type === 'NAMED_EXERCISE' ? `# 🚨 共軍具名演習：「${e.name}」` : '# ⚠️ 共軍「聯合戰備警巡」';
  return [head,
    `${e.date.slice(5).replace('-', '/')}｜${e.publishers.length} 家媒體報導${e.sorties ? `｜共機 ${e.sorties} 架次` : ''}${e.crossing ? `，${e.crossing} 架次越過中線` : ''}`,
    ...e.items.filter((it, i, arr) => arr.findIndex(x => x.publisher === it.publisher) === i).slice(0, 3).map(it => `• ${it.publisher}：${it.title} <${it.url}>`),
    '',
    e.type === 'NAMED_EXERCISE' ? '具名演習規模通常較大，請留意國防部與政府公告；輸入 `/warning theater:台海` 看預警等級、`/prepare` 看準備清單。'
      : '聯合戰備警巡多數在數小時內結束，屬常見施壓手段；預警等級會一併重新計算。輸入 `/warning` 看看板。',
    '（依媒體標題交叉比對自動偵測；以國防部正式公告為準）'].join('\n').slice(0, 1990);
}
async function dispatchPlaAlerts(client, subscribers, { cache = readCache(), file = ALERT_STATE, shouldDeliver = () => ({ deliver: true }), markDelivered = () => {}, now = Date.now() } = {}) {
  const state = (() => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } })();
  const events = (cache?.events || []).filter(e => e.confirmed && now - Date.parse(e.firstSeen) <= 24 * HOUR);
  if (!state) { // 第一次執行只記錄現況，不補推舊事件
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ sent: events.map(e => e.id) }));
    return [];
  }
  const results = [], sent = new Set(state.sent || []);
  // 隔天的追蹤報導（同類型、同名稱、日期相差 1 天內）視為同一事件，不重複推播
  const near = e => [...sent].some(id => { const [type, name, date] = id.split('|'); return type === e.type && name === (e.type === 'NAMED_EXERCISE' ? e.name : '') && Math.abs(Date.parse(date) - Date.parse(e.date)) <= DAY_MS; });
  for (const e of events.filter(x => !sent.has(x.id))) {
    if (near(e)) { sent.add(e.id); results.push({ eventId: `PLA_${e.id}`, status: 'FOLLOW_UP_SKIPPED' }); continue; }
    const level = e.type === 'NAMED_EXERCISE' ? 'CRITICAL' : 'WARNING', eventId = `PLA_${e.id}`;
    let ok = 0, tried = 0;
    for (const sub of subscribers) {
      const d = shouldDeliver(sub.userId, { theater: 'taiwan_strait', level, eventId, code: 'PLA_JOINT' });
      if (!d.deliver) { results.push({ eventId, userId: sub.userId, status: 'DEFERRED' }); continue; }
      tried++;
      try { await (await client.users.fetch(sub.userId)).send({ content: alertText(e), components: require('../push_buttons').buttonsFor('taiwan_strait', { mute: false }), allowedMentions: { parse: [] } }); markDelivered(sub.userId, eventId); ok++; results.push({ eventId, userId: sub.userId, status: 'SENT' }); }
      catch (err) { results.push({ eventId, userId: sub.userId, status: 'FAILED', error: err.message }); }
    }
    if (ok || !tried) sent.add(e.id); // 全部失敗時下一輪重試；靜默時段延後者不重推（等級變化推播會補上）
  }
  fs.writeFileSync(file, JSON.stringify({ sent: [...sent].slice(-200) }));
  return results;
}

module.exports = { dispatchPlaAlerts, alertText, refreshPlaJoint, parseRss, classify, numbers, buildEvents, assessPlaJoint, readCache, CACHE, QUERIES, feedUrl };
