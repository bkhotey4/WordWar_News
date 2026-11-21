// 金融市場訊號：油價、黃金、VIX、台股、台積電、新台幣、歐洲天然氣的每日收盤（Yahoo Finance 公開報價）。
// 以「當日漲跌幅 ÷ 過去 60 個交易日的日波動」換算 z 值，超過 3 個標準差或超過固定漲跌幅才算異常。
// 市場會因各種原因波動，所以只列為「次要指標」，必須搭配其他軍事指標才會把等級推高。不構成投資建議。
const fs = require('fs');
const path = require('path');

const CACHE = path.join(__dirname, '../../research/source_cache/markets.json');
const HOUR = 3600_000;
// dir：+1 表示上漲才是風險訊號（油價、避險資產、美元兌新台幣），-1 表示下跌才是（股市）
const INSTRUMENTS = [
  { sym: 'BZ=F', name: '布蘭特原油', unit: '美元／桶', theater: 'iran_gulf', dir: 1, pct: 6, dp: 2 },
  { sym: 'CL=F', name: 'WTI 原油', unit: '美元／桶', theater: 'iran_gulf', dir: 1, pct: 6, dp: 2, context: true },
  { sym: 'TTF=F', name: '歐洲天然氣 TTF', unit: '歐元／MWh', theater: 'europe_security', dir: 1, pct: 12, dp: 2 },
  { sym: '^TWII', name: '台股加權指數', unit: '點', theater: 'taiwan_strait', dir: -1, pct: 4, dp: 0 },
  { sym: '2330.TW', name: '台積電', unit: '元', theater: 'taiwan_strait', dir: -1, pct: 5, dp: 0 },
  { sym: 'TWD=X', name: '美元兌新台幣', unit: '元', theater: 'taiwan_strait', dir: 1, pct: 1.5, dp: 3 },
  { sym: 'GC=F', name: '黃金', unit: '美元／盎司', theater: 'global', dir: 1, pct: 3, dp: 0, context: true },
  { sym: '^VIX', name: 'VIX 恐慌指數', unit: '', theater: 'global', dir: 1, pct: 30, dp: 1, level: 30, context: true },
  // 中國政治與經濟頁的背景報價：context＝不進預警指標；panel＝不出現在首頁市場表
  { sym: 'CNY=X', name: '美元兌人民幣', unit: '元', theater: 'china', dir: 1, pct: 1, dp: 4, context: true, panel: 'china' },
  { sym: '000001.SS', name: '上證綜合指數', unit: '點', theater: 'china', dir: -1, pct: 4, dp: 0, context: true, panel: 'china' },
  { sym: '^HSI', name: '香港恆生指數', unit: '點', theater: 'china', dir: -1, pct: 4, dp: 0, context: true, panel: 'china' }
];
const quoteUrl = sym => `https://finance.yahoo.com/quote/${encodeURIComponent(sym)}`;

function analyze(inst, series) {
  const pts = series.filter(p => Number.isFinite(p.c) && p.c > 0);
  if (pts.length < 30) return { ...inst, status: 'INSUFFICIENT', points: pts.slice(-30) };
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const rets = pts.slice(1).map((p, i) => Math.log(p.c / pts[i].c));
  const base = rets.slice(-61, -1);
  const mean = base.reduce((a, b) => a + b, 0) / base.length;
  const sd = Math.sqrt(base.reduce((a, b) => a + (b - mean) ** 2, 0) / (base.length - 1)) || 1e-9;
  const r = rets[rets.length - 1];
  const pct = (last.c / prev.c - 1) * 100, z = r / sd;
  // 兩點之間隔了幾個平日：Yahoo 日線偶爾缺一天，前後兩點的變動其實跨兩個交易日，不能算單日異常
  let gap = 0; for (let d = Date.parse(prev.t.slice(0, 10)) + 86400_000; d < Date.parse(last.t.slice(0, 10)); d += 86400_000) { const w = new Date(d).getUTCDay(); if (w !== 0 && w !== 6) gap++; }
  const pct5 = pts.length > 5 ? (last.c / pts[pts.length - 6].c - 1) * 100 : null;
  const reasons = [];
  if (!gap && inst.dir * z >= 3) reasons.push(`單日變動達 ${Math.abs(z).toFixed(1)} 個標準差`);
  if (!gap && inst.dir * pct >= inst.pct) reasons.push(`單日${inst.dir > 0 ? '上漲' : '下跌'} ${Math.abs(pct).toFixed(1)}%`);
  if (inst.level && last.c >= inst.level) reasons.push(`指數達 ${last.c.toFixed(1)}（30 以上代表市場恐慌）`);
  return { ...inst, status: reasons.length ? 'ANOMALY' : 'NORMAL', last: last.c, date: last.t, prev: prev.c, pct, pct5, z, gap, reasons, url: quoteUrl(inst.sym), points: pts.slice(-30) };
}

async function fetchSeries(sym, fetchImpl) {
  const res = await fetchImpl(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=6mo&interval=1d`,
    { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 WordWarNews/2.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json(), q = j?.chart?.result?.[0];
  if (!q?.timestamp) throw new Error('沒有報價資料');
  const closes = q.indicators?.quote?.[0]?.close || [];
  const out = q.timestamp.map((t, i) => ({ t: new Date(t * 1000).toISOString(), c: closes[i] }));
  // 日線缺最新一天時，用 meta 的最新成交價補（上證、恆生曾停在兩個交易日前）
  const m = q.meta, lastDay = out.filter(p => Number.isFinite(p.c)).at(-1)?.t.slice(0, 10) || '';
  if (m?.regularMarketPrice > 0 && m.regularMarketTime) { const t = new Date(m.regularMarketTime * 1000).toISOString(); if (t.slice(0, 10) > lastDay) out.push({ t, c: m.regularMarketPrice }); }
  return out;
}

// Yahoo 的台股日線偶爾有整天收盤是空值（2026-11 曾缺 11/3 大跌那天，前一天被當成最新），用證交所官方收盤補齊；證交所抓不到就維持 Yahoo
async function twseCloses(now, fetchImpl) {
  const months = [0, 1].map(back => { const t = new Date(now + 8 * HOUR); t.setUTCDate(1); t.setUTCMonth(t.getUTCMonth() - back); return t.toISOString().slice(0, 7).replace('-', ''); });
  const out = [];
  for (const ym of months) {
    const res = await fetchImpl(`https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date=${ym}01&response=json`, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 WordWarNews/2.0' } });
    if (!res.ok) throw new Error(`證交所 HTTP ${res.status}`);
    for (const row of (await res.json())?.data || []) {
      const m = String(row[0]).match(/^(\d{2,3})\/(\d{2})\/(\d{2})$/), c = Number(String(row[4]).replace(/,/g, ''));
      if (m && c > 0) out.push({ t: `${Number(m[1]) + 1911}-${m[2]}-${m[3]}T01:00:00.000Z`, c });
    }
  }
  return out;
}
function mergeCloses(series, official) {
  const byDay = new Map(series.map(p => [p.t.slice(0, 10), p]));
  for (const p of official) byDay.set(p.t.slice(0, 10), p);
  return [...byDay.values()].sort((a, b) => a.t.localeCompare(b.t));
}

function readCache(file = CACHE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
let inFlight = null;
function refreshMarkets(opts = {}) { if (!inFlight) inFlight = collect(opts).finally(() => { inFlight = null; }); return inFlight; }
async function collect({ force = false, file = CACHE, fetchImpl = fetch, now = Date.now() } = {}) {
  const prev = readCache(file) || {};
  if (!force && prev.lastAttempt && now - Date.parse(prev.lastAttempt) < 30 * 60_000) return prev;
  const quotes = [], errors = [];
  for (const inst of INSTRUMENTS) {
    try {
      let series = await fetchSeries(inst.sym, fetchImpl);
      if (inst.sym === '^TWII') { try { series = mergeCloses(series, await twseCloses(now, fetchImpl)); } catch (e) { console.warn('[MARKETS] 證交所收盤補齊失敗：', e.message); } }
      quotes.push(analyze(inst, series));
    }
    catch (e) { errors.push(`${inst.name}：${e.message}`); const old = (prev.quotes || []).find(q => q.sym === inst.sym); if (old) quotes.push({ ...old, stale: true }); }
  }
  const out = { lastAttempt: new Date(now).toISOString(), lastSuccess: errors.length < INSTRUMENTS.length ? new Date(now).toISOString() : prev.lastSuccess || null,
    status: errors.length ? (errors.length < INSTRUMENTS.length ? 'DEGRADED' : 'OFFLINE') : 'ONLINE', errors, quotes };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(out, null, 1)); fs.renameSync(tmp, file);
  return out;
}

// 預警看板次要指標：該戰區（非參考用）商品最近一個交易日異常 → 觸發；報價 4 天內才算有效（涵蓋週末）
function assessMarket(cache, theater, now = Date.now()) {
  if (!cache?.lastSuccess || now - Date.parse(cache.lastSuccess) > 24 * HOUR) return null;
  const qs = (cache.quotes || []).filter(q => q.theater === theater && !q.context && !q.stale && q.date && now - Date.parse(q.date) <= 4 * 24 * HOUR);
  if (!qs.length) return null;
  const hit = qs.filter(q => q.status === 'ANOMALY');
  const fmt = q => `${q.name} ${q.pct >= 0 ? '+' : ''}${q.pct.toFixed(1)}%`;
  if (!hit.length) return { status: 'CLEAR', observedAt: cache.lastSuccess, sources: [], summary: `最近交易日沒有異常波動（${qs.map(fmt).join('、')}）。` };
  return { status: 'TRIGGERED', observedAt: hit[0].date,
    summary: `${hit.map(q => `${fmt(q)}：${q.reasons.join('、')}`).join('；')}。市場波動原因很多，需搭配其他指標判讀。`.slice(0, 300),
    sources: hit.slice(0, 3).map(q => ({ url: q.url, publisher: 'Yahoo Finance 報價', sourceClass: 'INDEPENDENT_MEDIA', publishedAt: q.date })) };
}

// 網頁側欄：每項商品一行，含漲跌與 30 日走勢小圖
// panel：預設首頁（排除中國頁專用報價）；'china' 只列中國頁的報價
function marketPanel(cache, esc, { panel = null } = {}) {
  if (!cache?.quotes?.length) return '';
  cache = { ...cache, quotes: cache.quotes.filter(q => (q.panel || null) === panel) };
  if (!cache.quotes.length) return '';
  const spark = q => {
    const v = (q.points || []).map(p => p.c); if (v.length < 2) return '';
    const lo = Math.min(...v), hi = Math.max(...v), W = 80, H = 22;
    const pts = v.map((c, i) => `${(i * W / (v.length - 1)).toFixed(1)},${(H - 2 - (hi === lo ? 0.5 : (c - lo) / (hi - lo)) * (H - 4)).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="#93a9c2" stroke-width="1.5"/></svg>`;
  };
  const newestDay = cache.quotes.reduce((m, q) => (q.date && q.date.slice(0, 10) > m ? q.date.slice(0, 10) : m), '');
  const rows = cache.quotes.map(q => {
    if (q.status === 'INSUFFICIENT' || !Number.isFinite(q.last)) return '';
    // 抓取失敗沿用的舊報價（stale）或超過 4 天的報價要標日期，不能當成即時
    const old = q.stale || !q.date || Date.now() - Date.parse(q.date) > 4 * 24 * 3600_000;
    const lag = !old && q.date && q.date.slice(0, 10) < newestDay;
    const risk = q.dir * q.pct > 0, cls = old ? 'stale' : q.status === 'ANOMALY' ? 'alert' : risk ? 'up' : 'down';
    return `<tr class="${cls}" title="${esc(q.reasons?.length ? q.reasons.join('、') : `與過去 60 日比較：${Math.abs(q.z).toFixed(1)} 個標準差`)}">
      <td>${q.status === 'ANOMALY' && !old ? '⚠️ ' : ''}<a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.name)}</a>${q.gap ? `<small class="muted">（跨 ${q.gap + 1} 個交易日）</small>` : ''}${lag ? `<small class="muted">（${esc(new Date(Date.parse(q.date) + 8 * 3600_000).toISOString().slice(5, 10).replace('-', '/'))}）</small>` : ''}${old ? `<small class="muted">（${q.date ? esc(new Date(Date.parse(q.date) + 8 * 3600_000).toISOString().slice(5, 10).replace('-', '/')) : '日期不明'} 舊報價）</small>` : ''}</td>
      <td class="num">${q.last.toLocaleString('en-US', { minimumFractionDigits: q.dp, maximumFractionDigits: q.dp })}</td>
      <td class="num chg">${q.pct >= 0 ? '+' : ''}${q.pct.toFixed(1)}%</td><td>${spark(q)}</td></tr>`;
  }).join('');
  const legend = panel === 'china' ? '橘色＝人民幣貶值或陸股、港股下跌；⚠️＝超過 3 個標準差或固定門檻。只作背景，不列入預警燈號。資料：Yahoo Finance，可能延遲。不構成投資建議。'
    : '橘色＝往風險方向變動（油價、天然氣、黃金、美元兌新台幣上漲，台股下跌）；⚠️＝超過 3 個標準差或固定門檻。各市場收盤時間不同，名稱後的日期是該報價的資料日。資料：Yahoo Finance，可能延遲。不構成投資建議。';
  return `<table class="mkt">${rows}</table>
    <p class="muted small">${legend}</p>`;
}

const CSS = `.mkt{width:100%;border-collapse:collapse;font-size:.9em}.mkt td{padding:3px 4px;border-bottom:1px solid var(--line)}.mkt a{color:var(--text);text-decoration:none}
.mkt .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.mkt .up .chg{color:#f59e0b;font-weight:700}.mkt .down .chg{color:var(--dim)}
.mkt .alert td{background:rgba(239,68,68,.12)}.mkt .alert .chg{color:#fca5a5;font-weight:700}.spark{width:80px;height:22px;display:block}`;

module.exports = { mergeCloses, CSS, INSTRUMENTS, analyze, refreshMarkets, assessMarket, marketPanel, readCache, CACHE };
