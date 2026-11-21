'use strict';
// 透過 Internet Archive（Wayback Machine）讀取公開網頁的最近快照。
// 用途：官方網站以防機器人機制擋下程式連線（HTTP 403／Cloudflare 驗證）時，改讀公開典藏的快照，
// 不偽裝瀏覽器、不繞過驗證。快照有延遲，呼叫端必須把 archivedAt 當作資料時間，並標示來源為典藏。
const AVAILABILITY = 'https://archive.org/wayback/available';
const CDX = 'https://web.archive.org/cdx/search/cdx';
const UA = 'Mozilla/5.0 WordWarNews/2.0 (personal research bot)';
const HOUR = 3600_000;

// 依網頁宣告的字元集解碼（中國政府網站多為 GB2312／GBK，日本網站有 Shift_JIS）；沒有宣告就當 UTF-8
function decodeBuffer(buffer) {
  const head = Buffer.from(buffer).toString('latin1', 0, 4000);
  const cs = (/charset=["']?([\w-]+)/i.exec(head)?.[1] || '').toLowerCase();
  const enc = /^(gb2312|gbk|gb18030)$/.test(cs) ? 'gb18030' : /shift[_-]?jis|sjis/.test(cs) ? 'shift_jis' : /euc-jp/.test(cs) ? 'euc-jp' : 'utf-8';
  try { return new TextDecoder(enc).decode(buffer); } catch { return Buffer.from(buffer).toString('utf8'); }
}
// 測試用的假回應可能沒有 arrayBuffer
const bodyText = async res => typeof res.arrayBuffer === 'function' ? decodeBuffer(await res.arrayBuffer()) : res.text();

function stamp(ts) { // 14 碼時間戳 → ISO
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(ts);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z` : null;
}
function checkUrl(url, hosts) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.username || u.password || !hosts.includes(u.hostname)) throw new Error(`Unexpected URL host ${u.hostname}`);
  return u;
}

// 最近的快照時間戳：先查 CDX（可列多筆、挑最新且有內容的），失敗再用 availability API
async function latestSnapshot(url, { fetchImpl = fetch, since } = {}) {
  const key = url.replace(/^https?:\/\//, '');
  try {
    const from = new Date(since || Date.now() - 30 * 24 * HOUR).toISOString().slice(0, 10).replace(/-/g, '');
    const res = await fetchImpl(`${CDX}?url=${encodeURIComponent(key)}&from=${from}&fl=timestamp,statuscode,length&limit=-20`, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': UA } });
    if (res.ok) {
      const rows = (await res.text()).trim().split('\n').map(l => l.trim().split(/\s+/)).filter(r => /^\d{14}$/.test(r[0]));
      // 只要快照有實際內容（長度 > 5KB）就採用；CDX 的狀態碼有時顯示 204 但內容完整
      const good = rows.filter(r => Number(r[2]) > 5000 && (r[1] === '200' || r[1] === '204' || r[1] === '-'));
      if (good.length) return good.at(-1)[0];
    }
  } catch { /* 改用 availability API */ }
  const res = await fetchImpl(`${AVAILABILITY}?url=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Wayback availability HTTP ${res.status}`);
  const ts = (await res.json()).archived_snapshots?.closest?.timestamp;
  if (!/^\d{14}$/.test(ts || '')) throw new Error('Wayback has no snapshot');
  return ts;
}

// 回傳快照原始內容（id_ 旗標＝未經 Wayback 改寫的原文）與典藏時間
async function fetchViaWayback(url, { hosts, fetchImpl = fetch, maxAgeHours = 72, maxBytes = 4_000_000, now = Date.now() } = {}) {
  checkUrl(url, hosts);
  const ts = await latestSnapshot(url, { fetchImpl, since: now - 30 * 24 * HOUR });
  const archivedAt = stamp(ts);
  if (!archivedAt) throw new Error('Wayback timestamp unreadable');
  if (now - Date.parse(archivedAt) > maxAgeHours * HOUR) throw new Error(`Wayback snapshot too old (${archivedAt})`);
  const res = await fetchImpl(`https://web.archive.org/web/${ts}id_/${url}`, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`Wayback snapshot HTTP ${res.status}`);
  const text = await bodyText(res);
  if (text.length > maxBytes) throw new Error('snapshot too large');
  if (isBlockPage(text)) throw new Error('Wayback snapshot is a block page');
  return { text, archivedAt, snapshotUrl: `https://web.archive.org/web/${ts}/${url}` };
}
const isBlockPage = text => /<title>\s*(Just a moment|Attention Required|Internet Archive: Temporarily Offline)/i.test(String(text).slice(0, 3000));

// 請 Internet Archive 現在抓一次（Save Page Now）：由典藏機構自己的爬蟲取得頁面，回應內容即為所抓到的原文，
// 同時留下公開快照作為出處。只在直接連線與既有快照都不可用時使用，呼叫端須限制頻率（建議 ≥ 6 小時一次）。
async function savePageNow(url, { hosts, fetchImpl = fetch, maxBytes = 4_000_000, timeoutMs = 240000 } = {}) {
  checkUrl(url, hosts);
  const res = await fetchImpl(`https://web.archive.org/save/${url}`, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`Save Page Now HTTP ${res.status}`);
  const text = await bodyText(res);
  if (text.length > maxBytes) throw new Error('capture too large');
  if (isBlockPage(text)) throw new Error('Save Page Now returned a block or offline page');
  const loc = typeof res.headers?.get === 'function' ? res.headers.get('content-location') || '' : '';
  const ts = /\/web\/(\d{14})/.exec(loc)?.[1];
  return { text, archivedAt: ts ? stamp(ts) : new Date().toISOString(), snapshotUrl: ts ? `https://web.archive.org/web/${ts}/${url}` : `https://web.archive.org/web/*/${url}` };
}

// 官方網站優先，被擋（403／驗證頁）才讀典藏；回傳 { text, via: 'DIRECT'|'ARCHIVE', archivedAt, snapshotUrl }
async function fetchDirectOrArchive(url, { hosts, fetchImpl = fetch, headers = {}, maxAgeHours = 72, timeoutMs = 30000, now = Date.now() } = {}) {
  checkUrl(url, hosts);
  let blocked = null;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': UA, ...headers }, redirect: 'follow' });
    const text = await bodyText(res);
    if (res.ok && !isBlockPage(text)) return { text, via: 'DIRECT', archivedAt: null, snapshotUrl: null };
    blocked = new Error(`HTTP ${res.status}`);
  } catch (e) { blocked = e; }
  try {
    const snap = await fetchViaWayback(url, { hosts, fetchImpl, maxAgeHours, now });
    return { ...snap, via: 'ARCHIVE', directError: blocked.message };
  } catch (e) { throw new Error(`${blocked.message}；典藏備援也失敗：${e.message}`); }
}

module.exports = { fetchViaWayback, fetchDirectOrArchive, savePageNow, latestSnapshot, stamp, isBlockPage, decodeBuffer, bodyText };
