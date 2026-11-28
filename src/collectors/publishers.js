// 媒體名稱與轉載判斷（各標題比對收集器共用）
// 同一家媒體的名稱變體（EnergyNow／EnergyNow.com、UDN／udn、AOL.com／AOL.ca、RTHK／香港電台新聞網）只算一家；
// 入口網站（LINE TODAY、Yahoo、MSN、AOL）轉載別家的同一篇稿不算另一家（2026-11 多次讓單一報導被算成 2 家）。
const AGGREGATORS = /^(LINE TODAY|Yahoo\b.*|MSN\b.*|msn\.com|AOL\b.*)$/i;
const ALIASES = [[/^(RTHK( News)?|香港電台(新聞網)?)$/i, 'rthk'], [/^(UDN|udn\.com|聯合新聞網)$/i, 'udn']];

function pubKey(name) {
  const s = String(name || '').trim();
  for (const [re, k] of ALIASES) if (re.test(s)) return k;
  return s.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '')
    .replace(/(\.(com|co|net|org|news|tw|uk|ca|au|hk|in|jp))+$/, '').replace(/[\s.\-_·]+/g, '');
}

const titleKey = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
const coreTitle = t => titleKey(t).split(/\s*[|｜]\s*/)[0].replace(/[\s!！?？,，、「」"'‘’“”]/g, '');

// 回傳獨立媒體名單（每家一個顯示名稱）
function independentPublishers(items) {
  const own = new Set(items.filter(i => !AGGREGATORS.test(i.publisher || '')).map(i => coreTitle(i.title)));
  const seen = new Map();
  for (const i of items) {
    if (AGGREGATORS.test(i.publisher || '') && own.has(coreTitle(i.title))) continue;
    const k = pubKey(i.publisher);
    if (k && !seen.has(k)) seen.set(k, i.publisher);
  }
  return [...seen.values()];
}

// 合併新舊標題：同一網址保留最早的刊出時間，舊稿重新被抓到時不會變成新一天的事件；keep 在合併後才套用
function mergeItems(list, keep = () => true) {
  const byUrl = new Map();
  for (const i of list) {
    const old = byUrl.get(i.url);
    byUrl.set(i.url, old && Date.parse(old.publishedAt) < Date.parse(i.publishedAt) ? { ...i, publishedAt: old.publishedAt } : i);
  }
  return [...byUrl.values()].filter(keep);
}

// 同一標題在不同天重複出現（舊稿被重新標上新時間）只留最早那天
function firstDayOnly(items, dayOf) {
  const first = new Map();
  for (const it of items) { const k = titleKey(it.title), d = dayOf(it.publishedAt); if (!first.has(k) || d < first.get(k)) first.set(k, d); }
  return items.filter(it => dayOf(it.publishedAt) === first.get(titleKey(it.title)));
}

module.exports = { AGGREGATORS, pubKey, titleKey, coreTitle, independentPublishers, mergeItems, firstDayOnly };
