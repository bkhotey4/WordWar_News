// 燈號準確度回顧：公開回測結果（各指標用現行規則逐日重算，對照已公開的大型演習），
// 以及近 30 天各戰區的燈號天數。目的是讓讀者知道哪些指標有用、哪些常誤報。
const fs = require('fs');
const path = require('path');

const HOUR = 3600_000, DAY = 24 * HOUR;
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const LEVEL_NAMES = { 1: '常態', 2: '升溫', 3: '高度警戒', 4: '危機' };

function grade(i) {
  if (!i.eventsCovered) return ['無法評估', '涵蓋期間內沒有參考事件'];
  const hitRate = i.hits / i.eventsCovered;
  if (hitRate >= 0.6 && i.falseAlarmsPer30Days <= 0.5) return ['較可靠', '多數事件前有提前觸發，誤報少'];
  if (hitRate >= 0.4) return ['參考用', '有一定提前量，但誤報或漏報不少'];
  return ['僅供輔助', '提前觸發的比例低'];
}

function accuracyPage({ backtest, history, names, theaters, esc, tpe, link, now }) {
  const inds = backtest?.indicators || [];
  const events = backtest?.referenceEvents || [];
  // 近 30 天燈號天數
  const rows = theaters.map(id => {
    const byDay = new Map();
    for (const s of history.snapshots || []) {
      if (s.theater !== id) continue; const lv = s.level ?? s.rawLevel; if (!Number.isInteger(lv)) continue;
      if (now - Date.parse(s.at) > 30 * DAY) continue;
      const d = new Date(Date.parse(s.at) + 8 * HOUR).toISOString().slice(0, 10);
      byDay.set(d, Math.max(byDay.get(d) || 0, lv));
    }
    const cnt = [1, 2, 3, 4].map(k => [...byDay.values()].filter(v => v === k).length);
    return `<tr><td>${esc(names[id] || id)}</td>${cnt.map(n => `<td class="num">${n}</td>`).join('')}<td class="num">${Math.max(0, 30 - byDay.size)}</td></tr>`;
  }).join('');
  const indRows = inds.map(i => {
    const [g, why] = grade(i);
    return `<tr><td><b>${esc(i.name)}</b><br><span class="muted small">${esc(names[i.theater] || i.theater)}｜資料 ${esc(i.coverage?.from || '?')}～${esc(i.coverage?.to || '?')}${i.note ? `｜${esc(i.note)}` : ''}</span></td>
      <td class="num">${i.eventsCovered ?? 0}</td><td class="num">${i.hits ?? 0}</td><td class="num">${i.duringOnly ?? 0}</td><td class="num">${i.misses ?? 0}</td>
      <td class="num">${i.falseAlarmsPer30Days ?? '—'}</td><td class="num">${i.medianLeadDays ?? '—'}</td><td><span class="grade g-${esc(g)}" title="${esc(why)}">${esc(g)}</span></td></tr>`;
  }).join('');
  return `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>燈號準確度回顧｜WorldWar 戰況情報站</title><meta name="description" content="預警指標回測：對照公開的大型軍演，各指標命中、漏報、誤報與提前天數。">
<link rel="stylesheet" href="style.css"></head><body><header class="top"><div class="brand"><h1>燈號準確度回顧</h1><p>回測產生於 ${esc(backtest?.generatedAt ? tpe(Date.parse(backtest.generatedAt)) : '—')}</p></div><nav><a href="index.html">← 回首頁</a><a href="timeline.html">時間軸</a></nav></header>
<main class="narrow">
<p class="notice small">這頁公開本站預警指標「過去準不準」。樣本很少（${events.length} 個參考事件），結果只能說明指標的傾向，<b>不能換算成開戰機率</b>。</p>
<h2>各指標回測</h2>
<div class="scrollx"><table class="mtab acc"><tr><th>指標</th><th>涵蓋事件</th><th>提前命中</th><th>僅事件期間</th><th>漏報</th><th>誤報／30 天</th><th>提前天數（中位數）</th><th>評價</th></tr>${indRows || '<tr><td colspan="8" class="muted">尚無回測結果。</td></tr>'}</table></div>
<p class="muted small">方法：${esc(backtest?.method || '')}</p>
<p class="muted small">限制：${esc(backtest?.limitations || '')}</p>
<h2>參考事件</h2><ul>${events.map(e => `<li>${esc(e.start)}～${esc(e.end || e.start)}｜${esc(names[e.theater] || e.theater)}｜${esc(e.name)}（${(e.sources || []).map(s => link(s.url, s.publisher)).join('、')}）</li>`).join('')}</ul>
<h2>近 30 天燈號天數</h2>
<table class="mtab"><tr><th>戰區</th>${[1, 2, 3, 4].map(k => `<th>${LEVEL_NAMES[k]}</th>`).join('')}<th>無資料</th></tr>${rows}</table>
<p class="muted small">外交、市場、民生等新指標上線時間較短，累積足夠資料後才會納入回測。</p>
</main></body></html>`;
}

const CSS = `.scrollx{overflow-x:auto}.acc td,.acc th{font-size:.92em}.num{text-align:right;font-variant-numeric:tabular-nums}
.grade{padding:2px 10px;border-radius:999px;border:1px solid var(--line);white-space:nowrap}.g-較可靠{color:#34d399;border-color:#34d399}.g-參考用{color:#eab308;border-color:#eab308}.g-僅供輔助{color:#f97316;border-color:#f97316}`;

module.exports = { accuracyPage, grade, CSS };
