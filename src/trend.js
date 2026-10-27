// 趨勢預警：數值還沒超過 60 日 P95，但近 3 天明顯爬升時先提醒（P95 指標是「已經很高」，這裡抓「正在變高」）。
// 規則 trend-v1：近 3 天平均 ≥ 前 7 天平均的 1.5 倍、且 ≥ 60 日 P75，且近 3 天每天都高於前 7 天平均；
// 已超過 P95 時交給原本的 P95 指標，不重複觸發。歷史不足 20 天或最新資料超過 72 小時不判定。
const DAY = 86_400_000;

const quantile = (vals, q) => {
  const s = [...vals].sort((a, b) => a - b);
  const pos = (s.length - 1) * q, lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
};
const avg = vals => vals.reduce((a, b) => a + b, 0) / vals.length;
const round1 = v => Math.round(v * 10) / 10;

// series：[{ date: 'YYYY-MM-DD', value }]，同一天只留最後一筆
function assessTrend(series, { label, unit, now = Date.now(), source }) {
  const byDate = new Map();
  for (const d of series || []) if (d && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && Number.isFinite(d.value)) byDate.set(d.date, d.value);
  const days = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).filter(([d]) => Date.parse(`${d}T00:00:00Z`) <= now);
  if (days.length < 20) return null;
  const [lastDate] = days.at(-1);
  if (now - Date.parse(`${lastDate}T00:00:00Z`) > 72 * 3600_000) return null;
  const vals = days.map(([, v]) => v);
  const last3 = vals.slice(-3), prev7 = vals.slice(-10, -3);
  const hist = days.filter(([d]) => Date.parse(`${lastDate}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`) <= 60 * DAY).map(([, v]) => v);
  const a3 = avg(last3), a7 = avg(prev7), p75 = quantile(hist, 0.75), p95 = quantile(hist, 0.95);
  const rising = a7 > 0 ? a3 >= 1.5 * a7 && last3.every(v => v > a7) : a3 > 0 && last3.every(v => v > 0);
  const triggered = rising && a3 >= p75 && a3 <= p95;
  const tail = `近 3 天平均 ${round1(a3)}${unit}，前 7 天平均 ${round1(a7)}${unit}（近 ${hist.length} 天 P75 ${round1(p75)}、P95 ${round1(p95)}）`;
  return { status: triggered ? 'TRIGGERED' : 'CLEAR', observedAt: `${lastDate}T00:00:00Z`, value: round1(a3), unit,
    baseline: { p75: round1(p75), p95: round1(p95), windowDays: 60, samples: hist.length },
    summary: triggered ? `${label}正在爬升：${tail}，尚未超過 P95。` : `${label}沒有明顯爬升：${tail}。`,
    sources: source ? [source] : [] };
}

// 國防部每日通報：periodEnd 換成台北日期
function mndSeries(history, metric) {
  return (history || []).map(d => {
    const end = Date.parse(d.observation?.periodEnd || '');
    const v = d.observation?.[metric]?.value;
    return Number.isFinite(end) && Number.isFinite(v) ? { date: new Date(end + 8 * 3600_000).toISOString().slice(0, 10), value: v, url: d.url } : null;
  }).filter(Boolean);
}

module.exports = { assessTrend, mndSeries, quantile };
