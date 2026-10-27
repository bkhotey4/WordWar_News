'use strict';
// 多查詢來源的「部分失敗」處理。
// 整體 lastSuccess 只代表過半查詢有回應；若其中某些查詢已經很久沒成功，
// 「沒有命中」就不能當成「未觸發」，要改成「無法判定」。
const HOUR = 3600_000;

// 每個查詢各自記最後成功時間
function markOk(prev, keys, now) {
  const out = { ...(prev || {}) };
  for (const k of keys) out[k] = new Date(now).toISOString();
  return out;
}

// 回傳超過 maxAge 沒成功的查詢數；舊快取沒有 queryOk 時，以最近一輪的失敗數為準
function staleCount(cache, keys, now, maxAge) {
  if (!cache?.queryOk) return (cache?.errors || []).length;
  return keys.filter(k => { const t = Date.parse(cache.queryOk[k] || ''); return !Number.isFinite(t) || now - t > maxAge; }).length;
}

function guardClear(result, cache, keys, now = Date.now(), maxAge = 12 * HOUR) {
  if (!result || result.status !== 'CLEAR') return result;
  const n = staleCount(cache, keys, now, maxAge);
  if (!n) return result;
  return { ...result, status: 'UNKNOWN',
    summary: `${n}/${keys.length} 個查詢超過 ${Math.round(maxAge / HOUR)} 小時沒有成功，沒有命中不代表沒有發生（${result.summary || ''}）`.slice(0, 300) };
}

module.exports = { markOk, staleCount, guardClear };
