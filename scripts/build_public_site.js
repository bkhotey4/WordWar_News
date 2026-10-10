// 公開情報網頁（GitHub Pages）：把預警看板、戰況報導圖卡、戰區海報與戰場圖、週報、民眾準備清單
// 產生成靜態網頁到 public_site/，加上 --push 時以「只保留最新一版」的方式推到 GitHub（不累積舊圖，倉庫不會越來越大）。
// 只輸出公開來源整理後的內容；不含 .env、訂閱者 ID、資料庫或原始閱讀筆記。
// 用法：node scripts/build_public_site.js [--push]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public_site');
const CONFIG = path.join(ROOT, 'research', 'public_site.json');
const HOUR = 3600_000;
// 烏俄戰場圖與海報含 DeepState 控制區幾何，授權未允許轉載，公開網頁不放（改附原站連結）
const MAP_THEATERS = ['taiwan_strait', 'korea_peninsula', 'iran_gulf', 'europe_security', 'middle_east', 'south_china_sea', 'ukraine_front'];
const WARN_ORDER = ['taiwan_strait', 'korea_peninsula', 'south_china_sea', 'iran_gulf', 'middle_east', 'europe_security', 'ukraine_front'];
const LEVEL = { 1: ['#22c55e', '常態'], 2: ['#eab308', '升溫'], 3: ['#f97316', '高度警戒'], 4: ['#ef4444', '危機'] };

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeUrl = u => { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : null; } catch { return null; } };
const link = (u, text) => { const s = safeUrl(u); return s ? `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text); };
const tpe = ms => new Date(ms + 8 * HOUR).toISOString().slice(0, 16).replace('T', ' ');
const md = iso => { const d = new Date(Date.parse(iso) + 8 * HOUR); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };

function writeAsset(name, buf, assets) {
  fs.writeFileSync(path.join(OUT, 'assets', name), buf);
  assets.push(name);
  return `assets/${name}`;
}
async function attempt(label, fn, errors) {
  try { return await fn(); } catch (e) { errors.push(`${label}：${e.message}`); console.warn('[SITE]', label, e.message); return null; }
}

async function build({ now = Date.now() } = {}) {
  fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
  for (const f of fs.readdirSync(path.join(OUT, 'assets'))) fs.rmSync(path.join(OUT, 'assets', f), { force: true });
  fs.rmSync(path.join(OUT, 'r'), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'r'), { recursive: true });
  const SITE_URL = 'https://bkhotey4.github.io/wordwar-intel/';
  const errors = [], assets = [];
  const wb = require('../src/warning_board');
  const board = wb.getWarningBoard(now);
  const NAMES = require('../src/battle_map').NAMES;

  // 1. 預警看板
  const shortName = n => String(n || '').split(/[（(，]|超過/)[0].trim();
  const TREND = { UP: ['▲', '比 7 天前升高'], DOWN: ['▼', '比 7 天前降低'], FLAT: ['─', '與 7 天前相同'], UNKNOWN: ['', ''] };
  const warnCards = WARN_ORDER.map(id => board.theaters.find(t => t.id === id)).filter(Boolean).map(t => {
    const [color, name] = LEVEL[t.level] || ['#94a3b8', '無法判定'];
    const [arrow, arrowTip] = TREND[t.trend] || TREND.UNKNOWN;
    const why = t.triggered.slice(0, 3).map(i => `<li>${esc(shortName(i.name))}</li>`).join('');
    const calm = (t.deescalation || [])[0];
    const trig = t.triggered.slice(0, 6).map(i => `<li><b>${esc(shortName(i.name))}</b>：${esc(i.summary || '')}${i.sources?.[0] ? ` ${link(i.sources[0].url, `［${i.sources[0].publisher}］`)}` : ''}</li>`).join('');
    const de = (t.deescalation || []).slice(0, 2).map(i => `<li class="calm">降溫訊號｜${esc(i.summary || i.name)}</li>`).join('');
    return `<div class="wtile" style="--lv:${color}">
      <div class="wt-head"><span class="dot"></span><b class="wt-name">${esc(t.name)}</b>${arrow ? `<span class="wt-trend" title="${esc(arrowTip)}">${arrow}</span>` : ''}</div>
      <div class="wt-level">${t.level ? `<span class="wt-num">${t.level}</span><span class="wt-lname">${esc((t.levelName || name).replace(/（.*）/, ''))}</span>` : '<span class="wt-lname">無法判定</span>'}</div>
      ${why ? `<ul class="wt-why">${why}</ul>` : '<p class="wt-none">目前沒有指標超過門檻</p>'}
      ${calm ? `<p class="wt-calm" title="${esc(calm.summary || '')}">🕊️ 有降溫訊號（見原因與來源）</p>` : ''}
      <details><summary>原因與來源</summary><p class="muted small">${esc(t.reason)}</p>${trig || de ? `<ul>${trig}${de}</ul>` : ''}${t.nextWatch ? `<p class="watch">下一個觀察點：${esc(t.nextWatch)}</p>` : ''}</details>
    </div>`;
  }).join('\n');
  const upcoming = (board.upcoming || []).map(d => `<li><b>${esc(d.date.slice(5).replace('-', '/'))}</b> ${esc(d.name)}${d.note ? `<br><span class="muted small">${esc(d.note)}</span>` : ''}</li>`).join('');

  // 2. 全球海報、週報
  const globalPoster = await attempt('全球海報', async () => writeAsset('poster_global.jpg', (await require('../src/poster').renderGlobalPoster({ now, board })).buffer, assets), errors);
  const weekly = await attempt('週報', async () => writeAsset('weekly.jpg', await require('../src/weekly').renderWeekly(now), assets), errors);

  // 3. 戰況報導（時效內、已覆核）
  const feed = require('../src/research_reports').getResearchFeed(now);
  const reports = [];
  for (const r of feed.reports.slice(0, 8)) {
    const cards = await attempt(`報導圖卡 ${r.id}`, async () => {
      const { buffers } = await require('../src/report_card').renderReportCards(r, { now, publicSafe: true, quality: 82 });
      return buffers.map((b, i) => writeAsset(`report_${r.id}_${i + 1}.jpg`, b, assets));
    }, errors) || [];
    const sections = (r.sections || []).map(s => `<h4><span class="kind k-${esc(s.kind)}">${{ REPORTED: '報導', ANALYSIS: '研判', UNCERTAIN: '待證' }[s.kind] || '重點'}</span>${esc(s.label)}</h4><p>${esc(s.text)}</p>`).join('');
    const refs = (r.references || []).map((x, i) => `<li>[${i + 1}] ${link(x.url, x.publisher)}｜發布 ${esc(md(x.publishedAt))}</li>`).join('');
    // 單篇分享頁：貼到 LINE／Discord 會顯示重點圖卡
    const tName = NAMES[r.theater] || (r.coverage || r.theater === 'global' ? '全球' : r.theater);
    const summary = (r.cardPoints?.[0]?.text || r.sections?.[0]?.text || '').slice(0, 120);
    fs.writeFileSync(path.join(OUT, 'r', `${r.id}.html`), `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(r.title)}｜WorldWar 戰況情報站</title><meta name="description" content="${esc(summary)}">
<link rel="canonical" href="${SITE_URL}r/${esc(r.id)}.html"><meta property="og:type" content="article"><meta property="og:title" content="${esc(r.title)}">
<meta property="og:description" content="${esc(summary)}"><meta property="og:url" content="${SITE_URL}r/${esc(r.id)}.html">${cards[0] ? `<meta property="og:image" content="${SITE_URL}${cards[0]}"><meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="stylesheet" href="../style.css"></head><body><header class="top"><h1>WorldWar 戰況情報站</h1><nav><a href="../index.html">← 回首頁</a><a href="../archive.html">報導彙整</a></nav></header><main>
<article class="report"><p class="meta">${esc(tName)}｜資料截至 ${esc(tpe(Date.parse(r.asOf)))}</p><h3>${esc(r.title)}</h3>
${cards.map(c => `<a href="../${c}" target="_blank"><img src="../${c}" alt="${esc(r.title)} 圖卡"></a>`).join('')}${sections}<ol class="refs">${refs}</ol></article>
<p class="notice">預警等級與報導依公開資料整理（試行中），不是開戰機率；交戰方數字為其自稱。</p></main></body></html>`);
    reports.push(`<article class="report" id="r-${esc(r.id)}">
      <p class="meta">${esc(NAMES[r.theater] || (r.coverage || r.theater === 'global' ? '全球' : r.theater))}｜資料截至 ${esc(tpe(Date.parse(r.asOf)))}</p>
      <h3><a class="plain" href="r/${esc(r.id)}.html">${esc(r.title)}</a></h3>
      ${cards[0] ? `<a href="${cards[0]}" target="_blank"><img loading="lazy" src="${cards[0]}" alt="${esc(r.title)} 重點圖卡"></a>` : ''}
      <details><summary>完整內容與來源</summary>${cards[1] ? `<a href="${cards[1]}" target="_blank"><img loading="lazy" src="${cards[1]}" alt="${esc(r.title)} 完整內容圖卡"></a>` : ''}${sections}<ol class="refs">${refs}</ol></details>
    </article>`);
  }

  // 4. 戰區海報與戰場圖
  const theaters = [];
  for (const id of MAP_THEATERS) {
    const poster = await attempt(`海報 ${id}`, async () => writeAsset(`poster_${id}.jpg`, (await require('../src/poster').renderTheaterPoster(id, { now, board })).buffer, assets), errors);
    const map = await attempt(`戰場圖 ${id}`, async () => require('../src/battle_map').renderBattleMap(id, { now, board, noControl: id === 'ukraine_front' }), errors);
    const mapSrc = map ? writeAsset(`map_${id}.jpg`, map.buffer, assets) : null;
    if (!poster && !mapSrc) continue;
    theaters.push({ id, name: NAMES[id], html: `<section class="theater" id="t-${id}">
      ${poster ? `<a href="${poster}" target="_blank"><img loading="lazy" src="${poster}" alt="${esc(NAMES[id])} 戰況海報"></a>` : ''}
      ${mapSrc ? `<a href="${mapSrc}" target="_blank"><img loading="lazy" src="${mapSrc}" alt="${esc(NAMES[id])} 戰場圖"></a><p>${esc(map.paragraph || '')}</p>` : ''}
      ${map?.sourceLinks?.length ? `<p class="muted">比對來源：${map.sourceLinks.slice(0, 6).map(l => link(l.url, l.title)).join('、')}</p>` : ''}
    </section>` });
  }
  // 烏俄：數字摘要＋外部控制區地圖連結
  const ua = await attempt('烏俄數字', async () => {
    const a = require('../src/collectors/ukraine_air'), r = a.assessUkraineAir(a.readCache(), now);
    return r.latest ? `${md(r.latest.date + 'T12:00:00Z')} 烏克蘭空軍通報：無人機 ${r.latest.drones} 架、飛彈 ${r.latest.missiles ?? '—'} 枚；7 日日均 ${r.current7dAvg ?? '—'}（交戰方公布數字）。` : '';
  }, errors);
  theaters.push({ id: 'ukraine_front', name: '烏俄戰爭', html: `<section class="theater" id="t-ukraine_front"><p>${esc(ua || '')}</p>
    <p class="muted">控制區地圖請看原站：${link('https://deepstatemap.live/', 'DeepStateMap')}、${link('https://understandingwar.org/', 'ISW 每日評估')}（本站不轉載其地圖）。</p></section>` });
  const tabs = `<div class="tabs">${theaters.map((t, i) => `<input type="radio" name="th" id="tab-${t.id}"${i ? '' : ' checked'}><label for="tab-${t.id}">${esc(t.name)}</label>`).join('')}
    ${theaters.map(t => `<div class="panel p-${t.id}">${t.html}</div>`).join('')}</div>
    <style>${theaters.map(t => `#tab-${t.id}:checked~.p-${t.id}{display:block}`).join('')}</style>`;

  // 5. 民眾準備清單
  const ck = readJson(path.join(ROOT, 'research', 'prepare_checklist.json'), null);
  const prep = ck ? `<ul>${ck.principles.map(p => `<li>${esc(p.text)}</li>`).join('')}</ul>
    <div class="cols"><div><h4>家中儲備（每人）</h4><ul>${ck.home.map(i => `<li>${i.basis === 'OFFICIAL' ? '📘' : '📐'} ${esc(i.item)}${i.perPersonDay ? `：每天約 ${i.perPersonDay} ${esc(i.unit)}` : ''}</li>`).join('')}</ul></div>
    <div><h4>緊急避難包</h4><ul>${ck.gobag.map(i => `<li>📘 ${esc(i.item)}</li>`).join('')}</ul>
    <h4>聽到空襲警報</h4><ul>${ck.airRaid.map(a => `<li>${esc(a)}</li>`).join('')}</ul><p>☎️ ${esc(ck.hotlines)}</p></div></div>
    <p class="muted">📘 官方指引明列；📐 依官方原則換算的估算。來源：${ck.sources.map(s => link(s.url, s.title)).join('、')}</p>` : '';

  // 6. 今日重點與 30 天走勢
  const trends = require('./site_trends');
  const history = readJson(path.join(ROOT, 'research', 'warning_history.json'), { snapshots: [] });
  let twFeed = null;
  try { twFeed = require('../src/taiwan_intel').getTaiwanFeed(now); } catch (e) { errors.push(`台海資料：${e.message}`); }
  const today = trends.todaySummary({ board, twFeed, reports: feed.reports, names: NAMES, esc, link, md });
  const trendHtml = trends.levelStrips(history, WARN_ORDER.map(id => [id, board.theaters.find(t => t.id === id)?.name || NAMES[id]]), now, esc)
    + trends.aircraftChart(twFeed, esc, md);

  // 市場訊號
  let marketHtml = '';
  try { const M = require('../src/collectors/markets'); marketHtml = M.marketPanel(M.readCache(), esc); } catch (e) { errors.push(`市場：${e.message}`); }

  // 美軍航艦
  let fleetHtml = '';
  try { const U = require('../src/collectors/usni_fleet'); fleetHtml = U.fleetPanel(U.readCache(), esc, now); } catch (e) { errors.push(`航艦：${e.message}`); }

  // 期刊導讀
  const J = require('./site_journals');
  const jr = await attempt('期刊 RSS', () => J.collect({ now }), errors) || { items: [], errors: [] };
  const journals = jr.items;
  if (jr.errors.length) errors.push(...jr.errors.map(e => `期刊：${e}`));
  const digest = J.validItems(now);
  const journalHome = J.homeSection(journals, { esc, link, md }, digest);
  const digestHome = digest.length ? `<div class="jgrid">${digest.slice(0, 3).map(it => J.card(it, { esc, link, md })).join('\n')}</div><p><a href="digest.html">看全部導讀（依週整理）→</a></p>` : '';
  // 每週導讀彙整：導讀依原文發表週存檔（只增不刪），另產生 digest.html
  const WD = require('./site_digest_weekly');
  try {
    WD.archiveDigest(digest);
    fs.writeFileSync(path.join(OUT, 'digest.html'), WD.weeklyPage(WD.loadWeeks(J.checkItem, now), { esc, tpe, now, card: it => J.card(it, { esc, link, md }), CATEGORIES: J.CATEGORIES, THEATERS: J.THEATERS }));
  } catch (e) { errors.push(`每週導讀：${e.message}`); }
  fs.writeFileSync(path.join(OUT, 'journals.html'), J.journalsPage(journals, { esc, link, md, tpe, now, errors: jr.errors, digest }));

  // 離線版準備清單＋附近避難處所＋PWA
  const SP = require('./site_prepare');
  let shelterIndex = null;
  await attempt('避難處所資料', () => require('./build_shelters').build(), errors);
  try {
    const SH = require('./build_shelters').OUT;
    shelterIndex = JSON.parse(fs.readFileSync(path.join(SH, 'index.json'), 'utf8'));
    fs.mkdirSync(path.join(OUT, 'shelters'), { recursive: true });
    for (const f of fs.readdirSync(SH)) fs.copyFileSync(path.join(SH, f), path.join(OUT, 'shelters', f));
  } catch (e) { errors.push(`避難處所：${e.message}`); shelterIndex = null; }
  fs.writeFileSync(path.join(OUT, 'prepare.html'), SP.preparePage({ prepHtml: prep, esc, tpe, now, shelterIndex }));
  fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), SP.manifest());
  fs.writeFileSync(path.join(OUT, 'sw.js'), SP.serviceWorker(String(now), { shelters: !!shelterIndex, sheltersVersion: shelterIndex?.updated || 'none' }));
  for (const icon of ['icon-192.png', 'icon-512.png']) fs.copyFileSync(path.join(__dirname, 'site_assets', icon), path.join(OUT, icon));
  // 燈號準確度回顧
  try {
    const bt = require('../src/warning_backtest').getWarningBacktest(now);
    fs.writeFileSync(path.join(OUT, 'accuracy.html'), require('./site_accuracy').accuracyPage({ backtest: bt, history, names: NAMES, theaters: WARN_ORDER, esc, tpe, link, now }));
  } catch (e) { errors.push(`準確度回顧：${e.message}`); }
  // 每月月報
  try {
    const MO = require('../src/monthly');
    MO.ensureSnapshot(now);
    fs.writeFileSync(path.join(OUT, 'monthly.html'), MO.monthlyPage(MO.listMonths(), { esc, tpe, link, now }));
  } catch (e) { errors.push(`月報：${e.message}`); }

  // 7. 報導彙整頁（過去 30 篇，含已超過 48 小時的）
  const archive = trends.archivePage({ root: ROOT, names: NAMES, esc, link, md, tpe, now });
  fs.writeFileSync(path.join(OUT, 'archive.html'), archive.html);
  // 事件時間軸與每日一句話摘要
  const TL = require('./site_timeline');
  const tlEvents = TL.collectTimeline({ root: ROOT, now, theaters: WARN_ORDER });
  fs.writeFileSync(path.join(OUT, 'timeline.html'), TL.timelinePage(tlEvents, { esc, names: NAMES, tpe, now, theaters: WARN_ORDER }));
  const timelineHome = TL.homeSection(tlEvents, { esc, names: NAMES, tpe });
  // 全球動態整理（依軍事／外交政治／民生經濟分類，只列異常）與 48 小時即時動態
  const SIT = require('./site_situation');
  const situationHtml = SIT.situationSection(board, { esc, order: WARN_ORDER, names: NAMES });
  const DP = require('./site_daily_points');
  const pointsHtml = DP.homeSection(DP.latestByTheater(now), { esc });
  const liveHtml = SIT.liveSection(tlEvents, { esc, names: NAMES, tpe, kinds: TL.KINDS, now });
  let briefLine = '';
  // 緊急橫幅：任一戰區第 3 級以上時顯示在頁首下方
  const severe = board.theaters.filter(t => t.level >= 3).sort((a, b) => b.level - a.level);
  const alertBanner = severe.length ? `<div class="alert-banner lv${severe[0].level}" role="alert"><b>⚠️ ${severe[0].level >= 4 ? '危機' : '高度警戒'}</b>　${severe.map(t => `${esc(t.name)} 第 ${t.level} 級「${esc(t.levelName)}」：${esc(t.triggered?.[0]?.name || t.reason)}`).join('｜')}
    <span class="ab-links"><a href="prepare.html">🧺 檢查準備清單</a><a href="timeline.html">🕒 事件經過</a></span>
    <span class="ab-note">本頁更新於 ${esc(tpe(now))}；情勢變化快，請以 Discord 即時通知與政府公告為準。</span></div>` : '';
  try { briefLine = require('../src/daily_brief').briefText(board, { now, markets: require('../src/collectors/markets').readCache() }); } catch (e) { errors.push(`每日摘要：${e.message}`); }
  fs.writeFileSync(path.join(OUT, 'feed.xml'), trends.rssFeed({ root: ROOT, names: NAMES, site: SITE_URL, active: new Set(feed.reports.map(r => r.id)), now }));

  const generated = tpe(now);
  const numberCards = `${today.kpis ? `<div class="ncard"><h3>台海今日</h3>${today.kpis}</div>` : ''}${marketHtml ? `<div class="ncard"><h3>📈 市場訊號</h3>${marketHtml}</div>` : ''}${fleetHtml ? `<div class="ncard"><h3>🚢 美軍航艦位置</h3>${fleetHtml}</div>` : ''}${upcoming ? `<div class="ncard"><h3>📅 敏感日期</h3><ul class="dates">${upcoming}</ul></div>` : ''}`;
  // 首頁區塊（三種版面共用）
  const BR = require('./site_briefs'), LAY = require('./site_layouts');
  const bh = { esc, names: NAMES, tpe, kinds: TL.KINDS };
  const cols = BR.columnParts(tlEvents, bh, { now });
  const warnRows = WARN_ORDER.map(id => board.theaters.find(t => t.id === id)).filter(Boolean);
  const imgOf = id => ['map', 'poster'].map(k => `assets/${k}_${id}.jpg`).find(p => fs.existsSync(path.join(OUT, p))) || null;
  const focusList = BR.topEvents(tlEvents, { now, n: 6 });
  const BEAT = require('./site_beats');
  const beatMap = BEAT.latestMap(now);
  const imint = await attempt('衛星前後期比對', () => require('./site_imint').prepare(OUT), errors) || {};
  const CMD = require('./site_command');
  const ccCtx = { board, order: WARN_ORDER, level: LEVEL, img: imgOf, beats: beatMap, imint, helpers: bh, shortName, BR, events: tlEvents, now, digest, jcard: it => J.card(it, { esc, link, md }) };
  const S = {
    hotspots: BEAT.hotspotsHtml(beatMap, bh),
    warnStrip: `<nav class="wstrip" id="warn">${warnRows.map(t => { const [color] = LEVEL[t.level] || ['#94a3b8']; return `<a class="wpill" style="--lv:${color}" href="#band-${t.id}"><span class="dot"></span>${esc(t.name.replace(/戰爭|與荷莫茲海峽|、黎巴嫩/g, ''))}<b>${t.level || '—'}</b></a>`; }).join('')}</nav>`,
    focus: BR.cardsHtml(focusList.slice(0, 3), bh, 'hero') + BR.cardsHtml(focusList.slice(3), bh),
    ccPanels: CMD.theaterPanels(ccCtx),
    ccHot: CMD.hotspotsPanel(ccCtx),
    ccThink: CMD.thinkSection(ccCtx),
    bandList: BR.theaterBands(tlEvents, board, bh, { now, order: WARN_ORDER, level: LEVEL, img: imgOf, shortName, beats: beatMap, beatHtml: BEAT.beatHtml, extra: id => BEAT.extraRow(beatMap[id], bh), asList: true }),
    bands: BR.theaterBands(tlEvents, board, bh, { now, order: WARN_ORDER, level: LEVEL, img: imgOf, shortName, beats: beatMap, beatHtml: BEAT.beatHtml, extra: id => BEAT.extraRow(beatMap[id], bh) }),
    bento: (() => {
      const ranked = [...warnRows].sort((a, b) => (b.level || 0) - (a.level || 0) || b.triggered.length - a.triggered.length);
      const tile = (t, big) => { const [color, nm] = LEVEL[t.level] || ['#94a3b8', '無法判定']; return `<div class="btile${big ? ' big' : ''}" style="--lv:${color}"><h3>${esc(t.name)}</h3><div class="bl">${t.level || '—'}</div><div>${esc((t.levelName || nm).replace(/（.*）/, ''))}</div>${t.triggered.length ? `<ul>${t.triggered.slice(0, big ? 4 : 2).map(i => `<li>${esc(shortName(i.name))}</li>`).join('')}</ul>` : '<p class="muted small">沒有指標超過門檻</p>'}</div>`; };
      return [tile(ranked[0], true), ...ranked.slice(1).map(t => tile(t, false)), ...focusList.map(e => BR.cardsHtml([e], bh))].join('');
    })(),
    brief: briefLine ? `<section class="hero"><p class="brief">📌 ${esc(briefLine)}</p></section>` : '',
    warn: `<section id="warn"><h2>戰區預警</h2><div class="wgrid">${warnCards}</div><p class="muted small">等級依公開資料與固定規則計算（試行中），<b>不是開戰機率</b>。「無法判定」表示資料不足，不代表平靜。</p></section>`,
    warnList: `<section id="warn"><h2 class="sh">戰區預警</h2><ul class="wlist">${WARN_ORDER.map(id => board.theaters.find(t => t.id === id)).filter(Boolean).map(t => { const [color, nm] = LEVEL[t.level] || ['#94a3b8', '無法判定']; return `<li style="--lv:${color}"><span class="dot"></span><span class="wn">${esc(t.name)}<small>${esc(t.triggered[0] ? shortName(t.triggered[0].name) : '無指標超過門檻')}</small></span><span class="wl">${t.level ? `${t.level}｜${esc((t.levelName || nm).replace(/（.*）/, ''))}` : '—'}</span></li>`; }).join('')}</ul><p class="muted small">不是開戰機率。</p></section>`,
    situation: situationHtml,
    colMil: cols.MIL, colDip: cols.DIP, colPol: cols.POL,
    countries: BR.countriesSection(tlEvents, bh, { now }),
    points: pointsHtml,
    reports: `<section id="reports"><h2>重點情資</h2>${reports.length ? `<div class="rgrid">${reports.join('\n')}</div>` : '<p class="muted">目前沒有時效內（48 小時）完成查核的報導。</p>'}<p><a href="archive.html">過去 30 篇報導 →</a></p></section>`,
    numbers: `<section id="numbers"><h2>關鍵數據</h2><div class="ngrid">${numberCards}</div></section>`,
    warnSide: `<section id="warn"><h2 class="sh">戰區預警</h2><ul class="wlist">${warnRows.map(t => { const [color, nm] = LEVEL[t.level] || ['#94a3b8', '無法判定']; return `<li style="--lv:${color}"><label class="wlink" for="th-${t.id}"><span class="dot"></span><span class="wn">${esc(t.name)}<small>${esc(t.triggered.length ? t.triggered.slice(0, 2).map(i => shortName(i.name)).join('、') : '無指標超過門檻')}</small></span><span class="wl">${t.level ? `${t.level}｜${esc((t.levelName || nm).replace(/（.*）/, ''))}` : '—'}</span></label></li>`; }).join('')}</ul><p class="muted small">燈號是依公開指標判定的緊張程度，不是開戰機率。點戰區即可切換右側內容。</p></section>`,
    numbersStack: `<section class="nstack">${numberCards}</section>`,
    digest: digestHome ? `<section id="digest"><h2>期刊導讀</h2>${digestHome}</section>` : '',
    cta: `<section class="cta"><a class="cta-card" href="prepare.html"><b>🧺 民眾準備清單＋附近防空避難處所</b><span>家中儲備、避難包、空襲應變；加到手機主畫面後斷網也能看 →</span></a></section>`,
    more: `<details class="more" id="more"><summary>更多：警戒走勢、戰區海報與戰場圖、週報</summary>
<section id="trend"><h2>警戒走勢</h2>${trendHtml}</section>
${globalPoster ? `<section id="global"><h2>全球重點</h2><a href="${globalPoster}" target="_blank"><img loading="lazy" src="${globalPoster}" alt="全球戰況重點海報"></a></section>` : ''}
<section id="theaters"><h2>戰區海報與戰場圖</h2>${tabs}</section>
${weekly ? `<section id="weekly"><h2>每週週報</h2><a href="${weekly}" target="_blank"><img loading="lazy" src="${weekly}" alt="每週戰況週報"></a></section>` : ''}
</details>`,
    links: `<nav class="links"><a href="briefing.html">圖文情勢簡報</a><a href="timeline.html">🕒 事件時間軸</a><a href="journals.html">📖 期刊新文章</a><a href="digest.html">🗂️ 每週導讀</a><a href="monthly.html">🗓️ 每月月報</a><a href="accuracy.html">🎯 燈號準確度</a><a href="archive.html">📚 報導彙整</a><a href="feed.xml">📡 RSS</a></nav>`,
    notice: `<p class="notice small">交戰方數字為其自稱。「政府投降」「國家戰敗」一類訊息一律是假訊息。本站為個人整理，非官方資訊。</p>`
  };
  const NAV = {
    A: '<a href="#warn">預警</a><a href="#columns">軍事・外交・政治</a><a href="#countries">各國動向</a><a href="#reports">重點情資</a><a href="prepare.html">準備清單</a><a href="#more">更多</a>',
    B: '<a href="#warn">預警</a><a href="#intel">情勢整理</a><a href="#reports">重點情資</a><a href="#numbers">關鍵數據</a><a href="prepare.html">準備清單</a><a href="#more">更多</a>',
    D: '<a href="#warn">燈號</a><a href="#focus">今日焦點</a><a href="#columns">軍事・外交・政治</a><a href="#reports">重點情資</a><a href="prepare.html">準備清單</a>',
    E: '<a href="#warn">預警</a><a href="#bands">各戰區情勢</a><a href="#reports">重點情資</a><a href="prepare.html">準備清單</a>',
    G: '<a href="#bands">戰情指揮中心</a><a href="#reports">重點情資</a><a href="prepare.html">準備清單</a>',
    F: '<a href="#bento">戰情總覽</a><a href="#intel">依類別與國家</a><a href="#reports">重點情資</a><a href="prepare.html">準備清單</a>',
    C: '<a href="#intel">情勢整理</a><a href="#reports">重點情資</a><a href="prepare.html">準備清單</a><a href="#more">更多</a>'
  };
  const page = (variant, preview) => `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WorldWar 戰況情報站</title><meta name="description" content="台海、美伊、歐洲與北約東翼、烏俄的公開來源預警看板與戰況報導，每日更新。">
<link rel="canonical" href="https://bkhotey4.github.io/wordwar-intel/">
<meta property="og:title" content="WorldWar 戰況情報站"><meta property="og:type" content="website"><meta property="og:url" content="https://bkhotey4.github.io/wordwar-intel/">
<meta property="og:description" content="台海、美伊、歐洲與北約東翼、烏俄的公開來源預警看板與戰況報導，每日更新。">${globalPoster ? '<meta property="og:image" content="https://bkhotey4.github.io/wordwar-intel/assets/poster_global.jpg">' : ''}
<meta name="keywords" content="台海,戰況,預警,美伊,荷莫茲,烏俄,波蘭,北約,共機,聯合戰備警巡,戰爭準備,避難包">
<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#060d18"><link rel="apple-touch-icon" href="icon-192.png">
<link rel="alternate" type="application/rss+xml" title="WorldWar 戰況情報站" href="feed.xml">
<link rel="stylesheet" href="style.css"></head><body>
<header class="top"><div class="brand"><h1>WorldWar 戰況情報站</h1><p>公開來源整理｜最後更新 ${esc(generated)}（台北）｜每天早晚更新，出事時加開</p></div>
<nav>${NAV[variant]}<a href="briefing.html">圖文簡報</a></nav></header>
${preview ? `<div class="preview-bar">版面預覽 ${variant}｜<a href="preview-g.html">G 戰情指揮中心</a>｜<a href="preview-a.html">A 三欄並排</a>｜<a href="preview-b.html">B 分頁切換</a>｜<a href="preview-c.html">C 戰情室兩欄</a>｜<a href="preview-d.html">D 頭版</a>｜<a href="preview-e.html">E 戰區專頁</a>｜<a href="preview-f.html">F 磚塊儀表板</a>｜<a href="index.html">目前正式版</a></div>` : ''}
${alertBanner}
${LAY.compose(variant, S)}
<footer><p>底圖：Sentinel-2 cloudless 2020 © EOX IT Services GmbH（含修改過的 Copernicus Sentinel 資料），CC BY-NC-SA 4.0；地名標籤 © OpenStreetMap 貢獻者。衛星影像：Copernicus Sentinel-2。</p>
<p>資料來源：中華民國國防部、中國海事局、日本統合幕僚監部、UKMTO、烏克蘭空軍、IODA 與各媒體報導（各項附原文連結）。本站為個人整理，非官方資訊，僅供參考。</p></footer>
<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});(function(){var m=document.getElementById('more'),h=location.hash;if(m&&h&&m.querySelector(h))m.open=true;if(m)m.addEventListener('toggle',function(){document.querySelectorAll('.chart .scroll').forEach(function(e){e.scrollLeft=e.scrollWidth})})})();document.querySelectorAll('.chart .scroll').forEach(e=>{e.scrollLeft=e.scrollWidth})</script>
</body></html>`;
  const chosen = /^[A-G]$/.test(readJson(CONFIG, {}).layout || '') ? readJson(CONFIG, {}).layout : 'A';
  fs.writeFileSync(path.join(OUT, 'index.html'), page(chosen, false));
  require('./site_briefing').buildBriefing(OUT,now);
  for (const v of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) fs.writeFileSync(path.join(OUT, `preview-${v.toLowerCase()}.html`), page(v, true).replace('<link rel="canonical" href="https://bkhotey4.github.io/wordwar-intel/">', '<meta name="robots" content="noindex">'));
  fs.writeFileSync(path.join(OUT, 'style.css'), CSS + '\n' + require('./site_journals').CSS + '\n' + require('./site_timeline').CSS + '\n' + require('./site_digest_weekly').CSS + '\n' + require('./site_prepare').CSS + '\n' + require('./site_accuracy').CSS + '\n' + require('../src/monthly').CSS + '\n' + require('../src/collectors/usni_fleet').CSS + '\n' + require('./site_situation').CSS + '\n' + require('./site_daily_points').CSS + '\n' + require('./site_beats').CSS + '\n' + require('./site_command').CSS + '\n' + require('./site_imint').CSS + '\n' + require('./site_briefs').CSS + '\n' + require('./site_layouts').CSS + '\n.preview-bar{background:#3b2f0a;color:#fde68a;padding:8px 16px;font-size:.92em}.preview-bar a{color:#fff;margin:0 4px}' + '\n' + require('../src/collectors/markets').CSS);
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  // 搜尋引擎：網站地圖與 robots.txt
  const SITE = 'https://bkhotey4.github.io/wordwar-intel/';
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}</loc><lastmod>${new Date(now).toISOString().slice(0, 10)}</lastmod><changefreq>daily</changefreq></url><url><loc>${SITE}journals.html</loc><lastmod>${new Date(now).toISOString().slice(0, 10)}</lastmod><changefreq>daily</changefreq></url><url><loc>${SITE}prepare.html</loc><lastmod>${new Date(now).toISOString().slice(0, 10)}</lastmod><changefreq>weekly</changefreq></url><url><loc>${SITE}monthly.html</loc><lastmod>${new Date(now).toISOString().slice(0, 10)}</lastmod><changefreq>monthly</changefreq></url><url><loc>${SITE}accuracy.html</loc><lastmod>${new Date(now).toISOString().slice(0, 10)}</lastmod><changefreq>weekly</changefreq></url><url><loc>${SITE}digest.html</loc><lastmod>${new Date(now).toISOString().slice(0, 10)}</lastmod><changefreq>weekly</changefreq></url><url><loc>${SITE}timeline.html</loc><lastmod>${new Date(now).toISOString().slice(0, 10)}</lastmod><changefreq>daily</changefreq></url><url><loc>${SITE}archive.html</loc><lastmod>${new Date(now).toISOString().slice(0, 10)}</lastmod><changefreq>daily</changefreq></url></urlset>\n`);
  fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);
  const sitemapFile=path.join(OUT,'sitemap.xml');
  fs.writeFileSync(sitemapFile,fs.readFileSync(sitemapFile,'utf8').replace('</urlset>',`<url><loc>${SITE}briefing.html</loc><lastmod>${new Date(now).toISOString().slice(0,10)}</lastmod><changefreq>daily</changefreq></url></urlset>`));
  const verify = readJson(CONFIG, {}).googleVerification;
  if (verify && /^google[0-9a-f]{16}\.html$/.test(verify)) fs.writeFileSync(path.join(OUT, verify), `google-site-verification: ${verify}`);
  // 機器可讀的看板摘要（不含內部欄位）
  fs.writeFileSync(path.join(OUT, 'data.json'), JSON.stringify({ generatedAt: new Date(now).toISOString(), ruleVersion: board.ruleVersion,
    theaters: board.theaters.map(t => ({ id: t.id, name: t.name, level: t.level, levelName: t.levelName, reason: t.reason,
      triggered: t.triggered.map(i => ({ name: i.name, summary: i.summary, sources: (i.sources || []).map(s => ({ url: s.url, publisher: s.publisher })) })) })),
    reports: feed.reports.slice(0, 8).map(r => ({ id: r.id, title: r.title, theater: r.theater, asOf: r.asOf })) }, null, 1));
  return { assets: assets.length, reports: reports.length, archived: archive.count, journals: journals.length, errors };
}

// 推送：每次建立只有一個提交的新分支後強制推送，GitHub 上只保留最新一版
function push() {
  const cfg = readJson(CONFIG, null);
  if (!cfg?.repo || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/.test(cfg.repo)) throw new Error('research/public_site.json 未設定 repo（https://github.com/<帳號>/<倉庫>.git）');
  const git = (...args) => execFileSync('git', args, { cwd: OUT, stdio: 'pipe', encoding: 'utf8', timeout: 120000, windowsHide: true });
  if (!fs.existsSync(path.join(OUT, '.git'))) git('init', '-q');
  try { git('remote', 'remove', 'origin'); } catch { /* 尚未設定 */ }
  git('remote', 'add', 'origin', cfg.repo);
  git('checkout', '-q', '--orphan', 'publish-tmp');
  git('add', '-A');
  git('-c', 'user.name=WorldWar Bot', '-c', 'user.email=wordwar-bot@users.noreply.github.com', 'commit', '-q', '-m', `更新情報 ${tpe(Date.now())}`);
  try { git('branch', '-D', 'main'); } catch { /* 第一次 */ }
  git('branch', '-m', 'main');
  git('push', '-q', '-f', 'origin', 'main');
  git('gc', '-q', '--prune=now');
  return cfg.repo.replace(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\.git$/, 'https://$1.github.io/$2/');
}

const CSS = `.dash{max-width:1200px;margin:0 auto;padding:12px 16px 24px}.dash>section{margin:18px 0 26px}
.hero .brief{font-size:1.1em;margin:0}
.wgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.wtile{background:var(--panel);border:1px solid var(--line);border-top:5px solid var(--lv);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.wt-head{display:flex;align-items:center;gap:8px}.wt-head .dot{width:10px;height:10px;border-radius:50%;background:var(--lv);flex:none}.wt-name{font-size:1.05em}.wt-trend{margin-left:auto;color:var(--dim)}
.wt-level{display:flex;align-items:baseline;gap:8px}.wt-num{font-size:2.4em;font-weight:800;line-height:1;color:var(--lv)}.wt-lname{font-size:1.25em;font-weight:700;color:var(--lv)}
.wt-why{margin:0;padding-left:18px;font-size:.95em}.wt-none{margin:0;color:var(--dim);font-size:.95em}.wt-calm{margin:0;color:#34d399;font-size:.9em}
.wtile details{font-size:.88em;margin-top:auto}.wtile details summary{color:var(--cyan);cursor:pointer}.wtile details ul{padding-left:18px}
.ngrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}.ncard{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.ncard h3{margin:0 0 8px;font-size:1em;color:var(--dim)}.ncard .kpis{grid-template-columns:1fr 1fr;margin:0}
.cta-card{display:block;padding:16px 18px;border-radius:12px;background:linear-gradient(90deg,rgba(0,229,255,.14),rgba(0,229,255,.04));border:1px solid var(--cyan);color:var(--text);text-decoration:none}.cta-card b{display:block;font-size:1.1em}.cta-card span{color:var(--dim);font-size:.92em}
.more{margin:18px 0;border:1px solid var(--line);border-radius:10px;padding:10px 14px;background:rgba(13,27,46,.5)}.more>summary{cursor:pointer;color:var(--cyan);font-weight:700;padding:4px 0}
.links{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.links a{padding:6px 12px;border:1px solid var(--line);border-radius:999px;color:var(--dim);text-decoration:none;font-size:.92em}.links a:hover{color:var(--cyan)}
@media(max-width:1000px){.wgrid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.wgrid{gap:8px}.wtile{padding:10px}.wt-name{font-size:.95em}.wt-num{font-size:1.9em}.wt-lname{font-size:1.05em}.wt-why,.wt-calm,.wt-none{font-size:.82em}.wt-trend{display:none}}
.alert-banner{margin:12px 20px 0;padding:12px 16px;border-radius:10px;background:#3b0a0a;border:2px solid #ef4444;color:#fee2e2;font-size:1.05em;line-height:1.6}
.alert-banner.lv4{background:#5b0000;animation:abpulse 2s ease-in-out infinite}.alert-banner b{color:#fca5a5;font-size:1.1em}.alert-banner a{color:#fff;font-weight:700;margin-right:14px}
.ab-links{display:block;margin-top:6px}.ab-note{display:block;font-size:.85em;color:#fecaca;margin-top:4px}@keyframes abpulse{50%{border-color:#fff}}@media (prefers-reduced-motion:reduce){.alert-banner.lv4{animation:none}}
:root{--bg:#060d18;--panel:#0d1b2e;--line:#1f3a5a;--text:#e8f1fb;--dim:#93a9c2;--cyan:#00e5ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:"Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif;line-height:1.7}
a{color:var(--cyan)}img{max-width:100%;height:auto;display:block;border-radius:8px;margin:12px 0;border:1px solid var(--line)}
.top{padding:14px 20px 6px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,#0b1a2f,var(--bg));display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:6px 24px}
.brand h1{font-size:clamp(22px,3vw,30px)}
.top h1{margin:0;font-size:clamp(24px,4vw,36px)}.top p{margin:4px 0;color:var(--dim)}
nav{display:flex;gap:14px;overflow-x:auto;white-space:nowrap;padding:6px 0}nav a{text-decoration:none;font-weight:600}
main{min-width:0;padding:0 0 16px}
.layout{max-width:1400px;margin:0 auto;padding:16px;display:grid;grid-template-columns:320px minmax(0,1fr);gap:24px;align-items:start}
.side{position:sticky;top:12px;max-height:calc(100vh - 24px);overflow-y:auto;display:flex;flex-direction:column;gap:14px;padding-right:4px}
.side section{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.side .sh{border:0;padding:0;margin:0 0 8px;font-size:1.05em;color:var(--dim)}
.light{border-left:5px solid var(--lv);padding:6px 0 6px 10px;margin:6px 0}
.lh{display:flex;align-items:center;gap:8px}.lh b{flex:1}.dot{width:10px;height:10px;border-radius:50%;background:var(--lv);box-shadow:0 0 8px var(--lv)}
.light .reason{font-size:.9em;margin:2px 0}.light details{font-size:.9em}.light ul{padding-left:18px}
.side .kpis{grid-template-columns:1fr 1fr;margin:0}.side .kpi b{font-size:1.6em}
.dates{padding-left:18px;margin:0}.quick{display:flex;flex-direction:column;gap:6px}.quick a{text-decoration:none;font-weight:600}
.small{font-size:.85em}
.rgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:14px}.rgrid .report{margin:0}
@media(max-width:960px){.layout{grid-template-columns:1fr}.side{position:static;max-height:none;overflow:visible}.rgrid{grid-template-columns:1fr}}h2{border-left:6px solid var(--cyan);padding-left:12px;margin-top:40px}
section,article{scroll-margin-top:12px}
a.plain{color:inherit;text-decoration:none}a.plain:hover{text-decoration:underline}
.btn-offline{display:inline-block;padding:8px 14px;border-radius:8px;background:var(--cyan);color:#0b1220!important;font-weight:700;text-decoration:none}
.notice{background:#1a1406;border:1px solid #6b5313;padding:12px 16px;border-radius:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.warn{background:var(--panel);border:1px solid var(--line);border-left:6px solid var(--lv);border-radius:10px;padding:14px 16px}
.warn header{display:flex;justify-content:space-between;align-items:center;gap:8px}.warn h3{margin:0}
.badge{background:var(--lv);color:#0b1220;font-weight:700;padding:2px 10px;border-radius:6px;white-space:nowrap}
.reason{color:var(--dim);margin:6px 0}.warn ul{padding-left:18px;margin:6px 0}.calm{color:#86efac}.watch{font-size:.95em}
.report,.theater{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:16px 0}
.report h3,.theater h3{margin:4px 0}.meta,.muted{color:var(--dim);font-size:.92em}
details summary{cursor:pointer;color:var(--cyan);font-weight:600}h4{margin:14px 0 4px}
.kind{display:inline-block;font-size:.8em;font-weight:700;color:#0b1220;padding:0 8px;border-radius:5px;margin-right:8px;background:var(--cyan)}
.k-ANALYSIS{background:#ffd54f}.k-UNCERTAIN{background:#ff8a65}.refs{padding-left:20px}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}
html{color-scheme:dark}
.today{background:linear-gradient(135deg,#0d2238,#0a1626);border:1px solid var(--line);border-radius:12px;padding:14px 18px}
.today h2{margin:0 0 8px;border:0;padding:0;font-size:1.3em}.today .lead{font-size:1.15em;margin:4px 0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0}
.kpi{background:rgba(0,229,255,.06);border-radius:8px;padding:8px 12px}.kpi b{display:block;font-size:1.9em;line-height:1.2}.kpi span{color:var(--dim);font-size:.9em}
.strips{display:grid;gap:8px}.strip{display:grid;grid-template-columns:150px 1fr;align-items:center;gap:10px}
.cells{display:grid;gap:3px}.cell{height:28px;border-radius:4px;color:#0b1220;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;cursor:default}
.chart .scroll{overflow-x:auto}.chart .scroll svg{min-width:640px}.strip .nm{font-weight:600}
.legend{display:flex;gap:14px;flex-wrap:wrap;color:var(--dim);font-size:.9em;margin:8px 0}.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:4px;vertical-align:-1px}
.chart svg{width:100%;height:auto;display:block}.chart table{border-collapse:collapse;font-size:.9em}.chart td,.chart th{padding:2px 10px;border-bottom:1px solid var(--line)}
.tabs input{position:absolute;opacity:0;pointer-events:none}.tabs label{display:inline-block;padding:6px 14px;margin:0 6px 8px 0;border:1px solid var(--line);border-radius:999px;cursor:pointer;color:var(--dim)}
.tabs input:checked+label{background:var(--cyan);color:#0b1220;border-color:var(--cyan);font-weight:700}.tabs input:focus-visible+label{outline:2px solid var(--cyan);outline-offset:2px}
.panel{display:none}
@media(max-width:600px){.strip{grid-template-columns:1fr}}
footer{max-width:1180px;margin:40px auto;padding:16px;color:var(--dim);font-size:.85em;border-top:1px solid var(--line)}`;

if (require.main === module) {
  (async () => {
    const r = await build();
    console.log(JSON.stringify(r));
    if (process.argv.includes('--push')) console.log(`已推送：${push()}`);
  })().catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = { build, push, esc, safeUrl };
