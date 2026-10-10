// 戰況海報：組裝各戰區的重點數字、武器、熱區、兵力估計與三大重點，交給 poster_core 繪製。
// 每個數字都取自既有的來源資料；沒有資料就寫「暫無」，不補假數字。
const fs = require('fs');
const path = require('path');
const bm = require('./battle_map');
const pc = require('./poster_core');

const DAY = 86400_000;
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const md = iso => { const d = new Date(new Date(iso).getTime() + 8 * 3600_000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
const TREND = { UP: '↑ 較上週升高', DOWN: '↓ 較上週下降', FLAT: '→ 與上週相同', UNKNOWN: '尚無上週紀錄' };
const ORDER = ['ukraine_front', 'taiwan_strait', 'iran_gulf', 'europe_security', 'middle_east', 'south_china_sea', 'sudan', 'myanmar'];

function forcesFor(theaterId, now) {
  const list = readJson(path.join(__dirname, '../research/force_estimates.json'), { estimates: [] }).estimates || [];
  return list.filter(e => e.theater === theaterId && e.source?.url && e.value)
    .map(e => ({ label: e.label, value: e.value, asOf: e.asOf, source: e.source.publisher.replace(/（.*$/, ''), old: now - Date.parse(e.asOf) > 90 * DAY, url: e.source.url }));
}
function warningPoint(t) {
  if (!t) return { title: '預警判定', text: '尚無資料。' };
  const names = t.triggered.map(bm.shortIndicator).slice(0, 3).join('、');
  return { stat: t.level ? { value: t.level, unit: '級警戒' } : null, title: t.level ? `第 ${t.level} 級 ${t.levelName}` : '無法判定', text: `${t.reason}。${names ? `觸發：${names}。` : ''}${t.nextWatch ? `下一步觀察：${t.nextWatch}` : ''}`, color: pc.levelColor(t.level) };
}

// 各戰區的數據（不含地圖）
function theaterFacts(theaterId, { now, board, taiwanFeed }) {
  const t = board.theaters.find(x => x.id === theaterId);
  const f = { kpis: [], chart: { title: '熱區排行', items: [] }, trend: null, points: [warningPoint(t)], heat: [], sources: [] };
  if (theaterId === 'ukraine_front') {
    const a = require('./collectors/ukraine_air'), cache = a.readCache();
    const r = a.assessUkraineAir(cache, now), series = a.dailySeries(cache.reports || []);
    if (r.latest) {
      f.kpis.push({ label: `${r.latest.date.slice(5).replace('-', '/')} 無人機`, value: r.latest.drones, unit: '架', sub: '烏克蘭空軍公布（交戰方數字）' });
      f.kpis.push({ label: `${r.latest.date.slice(5).replace('-', '/')} 飛彈`, value: r.latest.missiles ?? '—', unit: '枚', sub: '含擊落清單推算的下限' });
    }
    if (r.current7dAvg != null) f.kpis.push({ label: '7 日日均空襲量', value: r.current7dAvg, unit: '架／枚', sub: r.historicalP95 ? `60 日 P95：${r.historicalP95}${r.volumeHigh ? '｜已超標' : ''}` : '', color: r.volumeHigh ? '#f97316' : undefined });
    // 武器：近 7 天依型號加總
    const recent = (cache.reports || []).filter(x => now - Date.parse(x.time) <= 7 * DAY);
    const byModel = {};
    for (const rep of recent) for (const w of rep.weapons?.missilesByType || []) if (w.count) { const k = w.model || w.category; byModel[k] = (byModel[k] || 0) + w.count; }
    const drones7 = recent.reduce((s, x) => s + (x.drones || 0), 0);
    f.chart = { title: '近 7 天武器（烏克蘭空軍通報）', unit: '', items: [{ label: '無人機（Shahed 等）', value: drones7, color: '#ff8a3d' }, ...Object.entries(byModel).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ label: `飛彈：${k}`, value: v, color: '#ff4d4d' }))] };
    f.trend = { title: '近 30 天每日空襲量', values: series.slice(-30).map(d => d.drones + (d.missiles || 0)), caption: `最高 ${Math.max(0, ...series.slice(-30).map(d => d.drones + (d.missiles || 0)))}` };
    // 熱區：DeepState 近 7 天變化地點
    const ds = require('./collectors/deepstate').loadDeepState();
    if (ds) {
      const pts = ds.events.filter(e => e.lat !== null);
      f.heat = pts.map(e => ({ lon: e.lon, lat: e.lat, weight: 1 }));
      const sectors = Object.entries(bm.UA_SECTORS).filter(([k]) => k !== 'overview').map(([k, s]) => ({ label: s.name.replace(/方向$/, ''), value: pts.filter(e => e.lon >= s.bbox[0] && e.lon <= s.bbox[2] && e.lat >= s.bbox[1] && e.lat <= s.bbox[3]).length })).filter(x => x.value).sort((x, y) => y.value - x.value);
      const ru = new Set(ds.events.filter(e => e.side === 'RU').map(e => e.name)).size, ua = new Set(ds.events.filter(e => e.side === 'UA').map(e => e.name)).size;
      f.kpis.push({ label: 'DeepState 近 7 天', value: `${ru}／${ua}`, unit: '處', sub: '俄軍推進／烏軍收復' });
      f.points.push({ stat: { value: ru + ua, unit: '處變化' }, title: '熱區', text: sectors.length ? `戰線變化集中在：${sectors.slice(0, 3).map(x => `${x.label}（${x.value} 處）`).join('、')}。` : 'DeepState 近 7 天沒有附座標的變化地點。' });
      f.hotspots = sectors;
    }
    f.sources.push('烏克蘭空軍', 'DeepStateMap', 'ISW');
  } else if (theaterId === 'taiwan_strait') {
    let feed = taiwanFeed;
    try { feed = feed || require('./taiwan_intel').getTaiwanFeed(now); } catch { /* 無資料庫 */ }
    const o = feed?.latest?.observation;
    if (o) {
      f.kpis.push({ label: `${md(o.periodEnd)} 共機`, value: o.aircraft?.value ?? '—', unit: '架次', sub: o.crossingOrAirspace?.value != null ? `逾越中線及進入空域 ${o.crossingOrAirspace.value} 架次` : '國防部每日通報' });
      f.kpis.push({ label: `${md(o.periodEnd)} 共艦`, value: o.ships?.value ?? '—', unit: '艘', sub: `公務船 ${o.officialVessels?.value ?? '—'} 艘` });
    }
    const hist = (feed?.history || []).filter(h => h.observation?.aircraft?.value != null).slice(0, 30).reverse();
    f.trend = { title: '近 30 天共機架次', values: hist.map(h => h.observation.aircraft.value), caption: hist.length ? `最高 ${Math.max(...hist.map(h => h.observation.aircraft.value))} 架次` : '' };
    f.chart = { title: '近 7 天共機架次（國防部）', unit: '', items: hist.slice(-7).map(h => ({ label: md(h.observation.periodEnd), value: h.observation.aircraft.value })) };
    try {
      const m = require('./collectors/china_msa'), ma = m.assessChinaMsa(m.readCache(), now);
      const zones = m.activeZones(m.readCache(), now);
      f.heat = zones.flatMap(n => n.areas.map(ar => ({ lon: ar.reduce((s, p) => s + p[0], 0) / ar.length, lat: ar.reduce((s, p) => s + p[1], 0) / ar.length, weight: 1.5 })));
      f.kpis.push({ label: '軍事航行警告（7 天）', value: ma.current ?? '—', unit: '則', sub: ma.near?.length ? `${ma.near.length} 則在中線以東` : (ma.historicalP95 != null ? `60 日 P95：${ma.historicalP95}` : '歷史資料累積中'), color: ma.near?.length ? '#ef4444' : undefined });
      const j = require('./collectors/japan_js'), ja = j.assessJapanJs(j.readCache(), now);
      f.kpis.push({ label: '日方公布中國艦機（7 天）', value: ja.current ?? '—', unit: '則', sub: ja.special?.length ? '含航艦或台灣附近通過' : (ja.historicalP95 != null ? `60 日 P95：${ja.historicalP95}` : ''), color: ja.special?.length ? '#f97316' : undefined });
      f.points.push({ stat: ma.current != null ? { value: ma.current + (ja.current || 0), unit: '則前兆公告' } : null, title: '前兆指標', text: ma.status === 'UNAVAILABLE' && ja.status === 'UNAVAILABLE' ? '中國海事局與日本統合幕僚監部資料蒐集中。' : `中國海事局軍事航行警告近 7 天 ${ma.current ?? '—'} 則${ma.near?.length ? `（${ma.near.length} 則在中線以東）` : ''}；日本公布中國艦機動向 ${ja.current ?? '—'} 則${ja.special?.length ? '，含航艦或台灣附近通過' : ''}。` });
    } catch { /* 前兆資料尚未取得 */ }
    f.sources.push('中華民國國防部', '中國海事局', '日本統合幕僚監部');
  } else if (theaterId === 'iran_gulf') {
    const u = require('./collectors/ukmto'), cache = u.readCache(), a = u.assessUkmto(cache, now);
    const inc = (cache.incidents || []).filter(i => u.inGulf(i) && u.hostile(i));
    const d30 = inc.filter(i => now - Date.parse(i.occurredAt) <= 30 * DAY);
    f.kpis.push({ label: '近 7 天船舶遇襲', value: a.current ?? '—', unit: '件', sub: a.historicalP95 != null ? `60 日 P95：${a.historicalP95}` : 'UKMTO 官方通報', color: a.status === 'ABOVE_HISTORICAL_P95' ? '#f97316' : undefined });
    f.kpis.push({ label: '近 30 天船舶遇襲', value: d30.length, unit: '件', sub: a.latest ? `最新 ${md(a.latest.occurredAt)} UKMTO #${a.latest.number}` : '' });
    const weeks = Array.from({ length: 12 }, (_, i) => inc.filter(x => { const t = now - Date.parse(x.occurredAt); return t >= (11 - i) * 7 * DAY && t < (12 - i) * 7 * DAY; }).length);
    f.trend = { title: '近 12 週每週遇襲數', values: weeks, caption: `最高 ${Math.max(...weeks)} 件／週` };
    const byPlace = {}; for (const i of d30) byPlace[i.place] = (byPlace[i.place] || 0) + 1;
    f.chart = { title: '近 30 天遇襲地點（UKMTO）', unit: ' 件', items: Object.entries(byPlace).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ label: k, value: v })) };
    f.heat = d30.filter(i => Number.isFinite(i.lat)).map(i => ({ lon: i.lon, lat: i.lat, weight: 1 }));
    f.points.push({ stat: { value: d30.length, unit: '件／30天' }, title: '海峽航運', text: `近 30 天波灣／荷莫茲／阿曼灣船舶遇襲 ${d30.length} 件，近 7 天 ${a.current ?? '—'} 件。` });
    f.sources.push('UKMTO', '美軍中央司令部', 'Reuters／Al Jazeera');
  }
  // 通用：已覆核事件與比對事件
  const ledger = readJson(path.join(__dirname, '../research/warning_indicators.json'), {});
  const ev = [...(ledger.entries || []), ...(ledger.mapEvents || [])].filter(e => e.theater === theaterId && now - Date.parse(e.observedAt) <= 14 * DAY);
  if (f.kpis.length < 4 && t) f.kpis.push({ label: '觸發中的指標', value: t.triggered.length, unit: `／${t.indicators.length}`, sub: t.unknown.length ? `${t.unknown.length} 項無法判定` : '全部指標皆有資料' });
  if (f.kpis.length < 4) f.kpis.push({ label: '近 14 天已查核事件', value: ev.length, unit: '件', sub: '附來源的覆核紀錄' });
  if (!f.chart.items.length && ev.length) {
    const counts = {}; for (const e of ev) { const k = e.title || (e.summary || '').split(/[，；。]/)[0].slice(0, 16); counts[k] = (counts[k] || 0) + 1; }
    f.chart = { title: '近 14 天已查核事件', unit: '', items: Object.entries(counts).map(([k, v]) => ({ label: k.slice(0, 22), value: v })) };
  }
  for (const e of ev) if (e.location) f.heat.push({ lon: e.location.lon, lat: e.location.lat, weight: 1.2 });
  if (f.points.length < 3) {
    const latest = ev.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
    f.points.push(latest ? { title: `最新事件 ${md(latest.observedAt)}`, text: `${latest.title ? `${latest.title}：` : ''}${latest.summary}` } : { title: '最新事件', text: '近 14 天沒有已查核事件；沒有資料不代表局勢平靜。' });
  }
  if (f.points.length < 3) f.points.push({ title: '下一步觀察', text: t?.nextWatch || '持續追蹤各來源更新。' });
  f.forces = forcesFor(theaterId, now);
  return { t, ...f };
}

function footerText(sources, now) {
  return `資料：${[...new Set(sources)].join('、')}｜${new Date(now + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')}（台北）產生｜預警試行中，等級不是開戰機率；交戰方數字為其自稱`;
}

async function renderTheaterPoster(theaterId, options = {}) {
  const { createCanvas } = require('@napi-rs/canvas');
  const { data, mapCanvas } = await theaterPosterParts(theaterId, options);
  const canvas = pc.drawTheaterPoster((w, h) => createCanvas(w, h), data, mapCanvas);
  return { buffer: await canvas.encode('jpeg', 88), filename: `poster_${theaterId}.jpg`, data };
}
// 海報資料與地圖（不含最後繪製），讓 JPEG 與 PDF 共用
async function theaterPosterParts(theaterId, { now = Date.now(), board, fetchImpl = fetch, taiwanFeed } = {}) {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const makeCanvas = (w, h) => createCanvas(w, h);
  board = board || require('./warning_board').getWarningBoard(now);
  const facts = theaterFacts(theaterId, { now, board, taiwanFeed });
  let mapCanvas = null, mapTitle = '熱區地圖';
  try {
    const spec = await bm.buildSpec(theaterId, { now, board, makeCanvas, taiwanFeed });
    const layers = [...spec.layers];
    const idx = layers.findIndex(l => l.type === 'points' || l.type === 'arrows');
    layers.splice(idx < 0 ? layers.length : idx, 0, { type: 'heat', items: facts.heat });
    const tiles = await bm.loadTiles(spec.bbox, loadImage, fetchImpl, pc.MAP_BOX.w, pc.MAP_BOX.h);
    mapCanvas = require('./battle_map_core').drawBattleMap(makeCanvas, { ...spec, layers, mapOnly: true, width: pc.MAP_BOX.w, mapHeight: pc.MAP_BOX.h }, tiles.satellite, tiles.labels).canvas;
    mapTitle = `熱區地圖｜${spec.title.replace(/^.*?｜/, '')}`;
  } catch (e) { console.warn('[POSTER MAP]', theaterId, e.message); }
  const t = facts.t;
  const data = { title: `${bm.NAMES[theaterId]}｜戰況重點`, subtitle: `${md(new Date(now).toISOString())} 更新・各項數字附出處`, level: t?.level, levelName: t?.levelName, trendText: TREND[t?.trend || 'UNKNOWN'],
    kpis: facts.kpis, chart: facts.chart, trend: facts.trend, forces: facts.forces, points: facts.points, mapTitle, footer: footerText(facts.sources.length ? facts.sources : ['覆核紀錄'], now) };
  return { data, mapCanvas };
}

function globalPosterData({ now = Date.now(), board, taiwanFeed } = {}) {
  board = board || require('./warning_board').getWarningBoard(now);
  const facts = Object.fromEntries(ORDER.map(id => { try { return [id, theaterFacts(id, { now, board, taiwanFeed })]; } catch (e) { return [id, { t: board.theaters.find(x => x.id === id), kpis: [], points: [] }]; } }));
  const tiles = ORDER.map(id => {
    const f = facts[id], t = f.t;
    return { id, name: bm.NAMES[id], level: t?.level, levelName: t?.levelName, trendText: TREND[t?.trend || 'UNKNOWN'], kpis: f.kpis.slice(0, 2), values: f.trend?.values,
      line: t?.triggered?.length ? `觸發：${t.triggered.map(bm.shortIndicator).slice(0, 2).join('、')}` : (f.points[1]?.text || f.points[0]?.text || '').slice(0, 40) };
  });
  const ranked = board.theaters.filter(t => t.level).sort((a, b) => b.level - a.level || ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const top = ranked[0];
  const points = [
    top ? { stat: { value: top.level, unit: '級警戒' }, title: `${bm.NAMES[top.id]}：第 ${top.level} 級`, text: `${top.reason}。${top.triggered.length ? `觸發：${top.triggered.map(bm.shortIndicator).slice(0, 3).join('、')}。` : ''}`, color: pc.levelColor(top.level) } : { title: '預警', text: '各戰區資料不足。' },
    facts.ukraine_front.points[1] ? { stat: facts.ukraine_front.points[1].stat, title: `烏俄｜${facts.ukraine_front.points[1].title}`, text: facts.ukraine_front.points[1].text } : { title: '烏俄', text: '資料累積中。' },
    facts.taiwan_strait.points[1] ? { stat: facts.taiwan_strait.kpis[0] ? { value: facts.taiwan_strait.kpis[0].value, unit: `${facts.taiwan_strait.kpis[0].label.replace(/^\S+\s*/, '')}架次` } : null, title: `台海｜${facts.taiwan_strait.points[1].title}`, text: facts.taiwan_strait.points[1].text } : { title: '台海', text: '資料累積中。' }
  ];
  const sources = ORDER.flatMap(id => facts[id].sources || []);
  return { title: '全球戰況重點', subtitle: `${md(new Date(now).toISOString())} 更新・四大戰區＋其他熱點・各項數字附出處`, points, theaters: tiles, footer: footerText(sources, now) };
}
async function renderGlobalPoster(options = {}) {
  const { createCanvas } = require('@napi-rs/canvas');
  const now = options.now || Date.now();
  const data = globalPosterData({ ...options, now });
  const canvas = pc.drawGlobalPoster((w, h) => createCanvas(w, h), data);
  return { buffer: await canvas.encode('jpeg', 88), filename: 'poster_global.jpg', data };
}
async function posterDiscordPayload(theaterId, options = {}) {
  const { AttachmentBuilder } = require('discord.js');
  const p = theaterId ? await renderTheaterPoster(theaterId, options) : await renderGlobalPoster(options);
  const forces = theaterId ? (p.data.forces || []).map(f => `• 兵力出處：${f.source}（${f.asOf}）<${f.url}>`).join('\n') : '';
  return { content: `**${p.data.title}**${forces ? `\n${forces}` : ''}`.slice(0, 2000), files: [new AttachmentBuilder(p.buffer, { name: p.filename })], embeds: [], allowedMentions: { parse: [] } };
}

module.exports = { theaterFacts, globalPosterData, renderTheaterPoster, theaterPosterParts, renderGlobalPoster, posterDiscordPayload, forcesFor, ORDER };
