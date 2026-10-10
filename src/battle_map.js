// 戰場圖：衛星底圖＋有來源的圖層＋一段中文說明，輸出 JPEG 供 Discord 發送。
// 規則：只畫有出處的資料（控制區、官方事件座標、覆核過的指標紀錄）；無座標的事件只寫進文字，不猜位置。
const fs = require('fs');
const path = require('path');
const core = require('./battle_map_core');

const TILE_DIR = path.join(__dirname, '../research/tile_cache');
const BASEMAPS = {
  satellite: { url: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/${z}/${y}/${x}.jpg`, ext: 'jpg' },
  labels: { url: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/overlay_bright_3857/default/g/${z}/${y}/${x}.png`, ext: 'png' }
};
const BASEMAP_CREDIT = '底圖：Sentinel-2 cloudless 2020 © EOX IT Services（含修改之 Copernicus Sentinel 資料，CC BY-NC-SA 4.0）；地名 © OpenStreetMap contributors';

const UA_SECTORS = {
  overview: { name: '全線概覽', bbox: [31.8, 46.2, 39.9, 51.4] },
  kharkiv_kupiansk: { name: '哈爾科夫—庫皮揚斯克方向', bbox: [36.2, 49.35, 38.3, 50.45] },
  lyman_siversk: { name: '利曼—謝維爾斯克方向', bbox: [37.25, 48.7, 38.75, 49.55] },
  pokrovsk_kostiantynivka: { name: '波克羅夫斯克—康斯坦丁尼夫卡方向', bbox: [36.6, 47.95, 38.2, 48.85] },
  zaporizhzhia: { name: '札波羅熱方向', bbox: [35.0, 47.15, 36.9, 48.05] },
  kherson: { name: '赫爾松—第聶伯河方向', bbox: [32.2, 46.35, 34.3, 47.15] }
};

const MAPS = {
  ukraine_front: { title: '烏俄戰場圖', publicBbox: [28.6, 44.2, 40.2, 52.0],
    places: [{ name: '基輔', lon: 30.52, lat: 50.45 }, { name: '哈爾科夫', lon: 36.23, lat: 49.99 }, { name: '敖德薩', lon: 30.73, lat: 46.48 }, { name: '札波羅熱', lon: 35.14, lat: 47.84 }, { name: '頓內次克', lon: 37.8, lat: 48.0 }, { name: '塞瓦斯托波爾', lon: 33.52, lat: 44.6 }] },
  korea_peninsula: { title: '朝鮮半島事件圖', bbox: [123.5, 33.0, 131.5, 42.6],
    places: [{ name: '平壤', lon: 125.75, lat: 39.03 }, { name: '首爾', lon: 126.98, lat: 37.57 }, { name: '板門店', lon: 126.68, lat: 37.96 }, { name: '元山', lon: 127.44, lat: 39.15 }, { name: '豐溪里', lon: 129.08, lat: 41.28 }, { name: '東倉里', lon: 124.71, lat: 39.66 }, { name: '釜山', lon: 129.08, lat: 35.18 }] },
  taiwan_strait: { title: '台海動態圖', bbox: [117.2, 20.4, 123.8, 26.9],
    places: [{ name: '金門', lon: 118.32, lat: 24.44 }, { name: '馬祖', lon: 119.95, lat: 26.16 }, { name: '澎湖', lon: 119.58, lat: 23.57 }, { name: '臺北', lon: 121.56, lat: 25.04 }, { name: '高雄', lon: 120.30, lat: 22.62 }, { name: '福州', lon: 119.30, lat: 26.08 }, { name: '廈門', lon: 118.09, lat: 24.48 }, { name: '伊巴亞特島', lon: 121.84, lat: 20.78 }] },
  iran_gulf: { title: '荷莫茲海峽船舶事件圖', bbox: [55.0, 25.2, 57.9, 27.5],
    places: [{ name: '阿巴斯港', lon: 56.27, lat: 27.18 }, { name: '格什姆島', lon: 55.9, lat: 26.8 }, { name: '哈薩布', lon: 56.25, lat: 26.18 }, { name: '富查伊拉', lon: 56.33, lat: 25.12 }] },
  europe_security: { title: '歐洲與北約東翼事件圖', bbox: [13.5, 49.0, 28.8, 56.6],
    places: [{ name: '華沙', lon: 21.01, lat: 52.23 }, { name: '加里寧格勒', lon: 20.51, lat: 54.71 }, { name: '明斯克', lon: 27.56, lat: 53.9 }, { name: '維爾紐斯', lon: 25.28, lat: 54.69 }, { name: '蘇瓦烏基走廊', lon: 23.0, lat: 54.1 }] },
  middle_east: { title: '以巴、黎巴嫩與紅海事件圖', bbox: [33.6, 29.2, 37.2, 34.0], places: [{ name: '加薩', lon: 34.45, lat: 31.5 }, { name: '貝魯特', lon: 35.5, lat: 33.89 }, { name: '特拉維夫', lon: 34.78, lat: 32.08 }] },
  sudan: { title: '蘇丹事件圖', bbox: [21.8, 8.6, 38.6, 22.2], places: [{ name: '喀土穆', lon: 32.53, lat: 15.5 }, { name: '法舍爾', lon: 25.35, lat: 13.63 }, { name: '蘇丹港', lon: 37.22, lat: 19.62 }] },
  myanmar: { title: '緬甸事件圖', bbox: [92.2, 15.8, 101.3, 26.8], places: [{ name: '曼德勒', lon: 96.08, lat: 21.97 }, { name: '奈比多', lon: 96.13, lat: 19.75 }, { name: '仰光', lon: 96.16, lat: 16.87 }] },
  south_china_sea: { title: '南海事件圖', bbox: [109.5, 5.5, 121.5, 21.0], places: [{ name: '仁愛礁', lon: 115.87, lat: 9.73 }, { name: '仙賓礁', lon: 116.48, lat: 9.75 }, { name: '黃岩島', lon: 117.75, lat: 15.15 }, { name: '馬尼拉', lon: 120.98, lat: 14.6 }] }
};
const NAMES = { ukraine_front: '烏俄戰爭', taiwan_strait: '台海', iran_gulf: '美伊戰爭與荷莫茲海峽', europe_security: '歐洲與北約東翼', middle_east: '以巴、黎巴嫩與紅海', sudan: '蘇丹', myanmar: '緬甸', south_china_sea: '南海', korea_peninsula: '朝鮮半島' };

async function fetchTile(layer, { z, x, y }, fetchImpl = fetch) {
  const def = BASEMAPS[layer], file = path.join(TILE_DIR, layer, String(z), String(x), `${y}.${def.ext}`);
  try { return fs.readFileSync(file); } catch { /* 快取沒有才下載 */ }
  const res = await fetchImpl(def.url(z, x, y), { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'WordWarNews/2.0 (personal research bot; tiles cached locally)' } });
  if (!res.ok) throw new Error(`tile HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf);
  return buf;
}
async function loadTiles(bbox, loadImage, fetchImpl, width, height) {
  const out = { satellite: [], labels: [] };
  for (const t of core.planTiles(bbox, width, height)) for (const layer of ['satellite', 'labels']) {
    try { out[layer].push({ ...t, image: await loadImage(await fetchTile(layer, t, fetchImpl)) }); } catch { /* 缺圖塊時該處留深色底 */ }
  }
  return out;
}

const inBox = (b, lon, lat) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
const md = iso => { const d = new Date(new Date(iso).getTime() + 8 * 3600_000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
function ledgerLayers(theaterId, bbox, now) {
  let entries = [];
  try { entries = JSON.parse(fs.readFileSync(path.join(__dirname, '../research/warning_indicators.json'), 'utf8')).entries || []; } catch { /* 無紀錄 */ }
  const { validEntry } = require('./warning_board');
  const ok = entries.filter(e => e.theater === theaterId && validEntry(e, now) && now - Date.parse(e.observedAt) <= 14 * 86400_000);
  const points = ok.filter(e => e.location && inBox(bbox, e.location.lon, e.location.lat))
    .map(e => ({ lon: e.location.lon, lat: e.location.lat, label: `${e.location.label}（${md(e.observedAt)}）`, color: e.triggered ? '#ff5252' : '#9e9e9e' }));
  const arrows = ok.filter(e => e.arrow).map(e => ({ from: e.arrow.from, to: e.arrow.to, color: '#ff5252' }));
  return { points, arrows, count: ok.length };
}
const SHORT_INDICATOR = { eu_airspace: '領空遭侵犯', eu_response: '軍方應變升級', eu_reinforcement: '東翼增兵', eu_nato_art4: '北約第4條諮商', eu_belarus: '白俄邊境演習',
    ir_blockade: '海上封鎖持續', ir_shipping: '船舶遇襲偏多', ir_us_strikes: '美軍打擊', ir_gulf_retaliation: '伊朗報復鄰國', ir_oil: '油價劇烈波動', ir_iaea: '核查警訊',
    ua_strike_volume: '空襲量偏高', ua_energy: '能源設施遇襲', ua_front: '戰線變動', ua_mobilization: '動員變化',
    tw_aircraft: '共機偏多', tw_ships: '共艦偏多', tw_crossing: '逾越中線偏多', tw_joint_patrol: '聯合戰備警巡', tw_named_exercise: '具名演習', tw_nav_warning: '航行警告', tw_japan_fleet: '艦隊動態', tw_coast_guard: '海警入限制水域', tw_political_window: '政治敏感期' };
const shortIndicator = i => SHORT_INDICATOR[i.id] || i.name.replace(/（.*$/, '');
function warningSentence(t) {
  if (!t) return '';
  const lv = t.level ? `第 ${t.level} 級 ${t.levelName}` : '無法判定（資料不足）';

  const names = t.triggered.map(shortIndicator);
  return `預警${lv}${names.length ? `，觸發：${names.slice(0, 3).join('、')}${names.length > 3 ? '等' : ''}` : ''}。`;
}
function recentEventsSentence(theaterId, now) {
  let entries = [];
  try { entries = JSON.parse(fs.readFileSync(path.join(__dirname, '../research/warning_indicators.json'), 'utf8')).entries || []; } catch { return ''; }
  const { validEntry } = require('./warning_board');
  const ok = entries.filter(e => e.theater === theaterId && e.triggered && validEntry(e, now) && now - Date.parse(e.observedAt) <= 14 * 86400_000)
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt)).slice(0, 3);
  if (!ok.length) return '';
  const short = e => { const x = e.summary.split(/[；。]/)[0].replace(/^[^：]{0,12}：/, ''); return x.length > 40 ? `${x.slice(0, 40)}…` : x; };
  return `近期事件：${ok.map(e => `${md(e.observedAt)} ${short(e)}`).join('；')}。`;
}
function researchSentence(theaterId, now) {
  try {
    const reports = require('./research_reports').getResearchFeed().reports || [];
    const hits = reports.map(r => ({ r, c: r.coverage?.find(c => c.theater === theaterId) })).filter(x => x.r.theater === theaterId || x.c)
      .map(x => ({ at: x.c?.observedAt || x.r.asOf, text: x.c?.summary || x.r.sections?.[0]?.text })).filter(x => x.text && now - Date.parse(x.at) <= 7 * 86400_000)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    if (!hits.length) return '';
    const t = hits[0].text.length > 110 ? `${hits[0].text.slice(0, 110)}…` : hits[0].text;
    return `研究稿（${md(hits[0].at)}）：${t}`;
  } catch { return ''; }
}

// ── 多來源比對事件（research/warning_indicators.json 的 mapEvents）──
// 與預警指標分開：這些是「畫在圖上的已比對事件」，不影響警戒等級。
const SIDES = { UA: '#40c4ff', ROC: '#40c4ff', PH: '#40c4ff', US: '#40c4ff', RU: '#ff5252', PRC: '#ff5252', IR: '#ff5252', OTHER: '#ffd54f' };
const CONF = { CONFIRMED_MULTI: '多來源一致', SINGLE_SOURCE: '單一來源', DISPUTED: '說法有爭議' };
const KINDS = new Set(['ADVANCE', 'CLAIMED_ADVANCE', 'STRIKE', 'INCIDENT', 'MANEUVER']);
function validMapEvent(e, now = Date.now()) {
  const str = (v, n) => typeof v === 'string' && v.trim().length > 0 && v.length <= n;
  const ll = v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) && Math.abs(v[0]) <= 180 && Math.abs(v[1]) <= 90;
  if (!e || e.reviewed !== true || !MAPS[e.theater] || !/^[a-z0-9_-]{1,100}$/.test(e.id || '')) return false;
  if (!str(e.title, 40) || !str(e.summary, 240) || !str(e.comparison, 240) || !SIDES[e.side] || !KINDS.has(e.kind) || !CONF[e.confidence]) return false;
  const t = Date.parse(e.observedAt); if (!Number.isFinite(t) || t > now) return false;
  const p = e.place; if (!p || !str(p.name, 60) || (p.admin !== undefined && !str(p.admin, 60))) return false;
  if ((p.lat !== undefined || p.lon !== undefined) && !(ll([p.lon, p.lat]) && ['SOURCE_COORDS', 'GAZETTEER', 'DERIVED_FROM_TEXT'].includes(p.basis))) return false;
  if (e.arrow !== undefined && !(e.arrow && ll(e.arrow.from) && ll(e.arrow.to) && (e.arrow.label === undefined || str(e.arrow.label, 30)))) return false;
  if (!Array.isArray(e.sources) || !e.sources.length || e.sources.length > 6) return false;
  const okSrc = e.sources.every(x => x && /^https:\/\//.test(x.url || '') && str(x.publisher, 80) && ['OFFICIAL', 'INDEPENDENT_MEDIA', 'EXTERNAL_ASSESSMENT', 'PARTY_CLAIM'].includes(x.sourceClass) && Number.isFinite(Date.parse(x.publishedAt)));
  if (!okSrc) return false;
  // 「多來源一致」至少兩個不同發布者，且至少一個不是交戰方聲稱
  if (e.confidence === 'CONFIRMED_MULTI' && (new Set(e.sources.map(x => x.publisher.replace(/（.*$/, ''))).size < 2 || e.sources.every(x => x.sourceClass === 'PARTY_CLAIM'))) return false;
  return true;
}
async function mapEventLayers(theaterId, viewBbox, geoBbox, now, { geocodeImpl } = {}) {
  let events = [];
  try { events = JSON.parse(fs.readFileSync(path.join(__dirname, '../research/warning_indicators.json'), 'utf8')).mapEvents || []; } catch { /* 無紀錄 */ }
  events = events.filter(e => e.theater === theaterId && validMapEvent(e, now) && now - Date.parse(e.observedAt) <= 14 * 86400_000)
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  const geocode = geocodeImpl || require('./geocode').geocode;
  const points = [], arrows = [], located = [];
  for (const e of events) {
    let lat = e.place.lat, lon = e.place.lon;
    if (!Number.isFinite(lat)) {
      for (const q of [[e.place.name, e.place.admin].filter(Boolean).join(', '), e.place.name]) {
        try { const g = await geocode(q, theaterId, geoBbox); if (g) { lat = g.lat; lon = g.lon; break; } } catch { break; /* 查不到就只寫文字 */ }
      }
    }
    if (Number.isFinite(lat) && inBox(viewBbox, lon, lat)) {
      points.push({ lon, lat, label: `${e.title} ${md(e.observedAt)}`, color: SIDES[e.side], radius: 7, hollow: e.confidence !== 'CONFIRMED_MULTI' });
      located.push(e.id);
    }
    if (e.arrow) arrows.push({ from: e.arrow.from, to: e.arrow.to, color: SIDES[e.side], label: e.arrow.label });
  }
  const sentence = events.length ? `多來源比對：${events.slice(0, 3).map(e => `${md(e.observedAt)} ${e.title}（${CONF[e.confidence]}）`).join('；')}${events.length > 3 ? `等 ${events.length} 件` : ''}。` : '';
  const links = events.slice(0, 3).flatMap(e => e.sources.slice(0, 2).map(x => ({ title: `${e.title}｜${x.publisher}`, url: x.url })));
  return { points, arrows, sentence, links, count: events.length, unlocated: events.filter(e => !located.includes(e.id)).map(e => e.title) };
}
const MAP_EVENT_LEGEND = [{ color: '#ffffff', text: '實心：多來源一致；空心：單一來源或有爭議', shape: 'dot' }];

// 各戰區：組圖層與文字段落
async function buildSpec(theaterId, ctx) {
  const { now, board, makeCanvas, sector } = ctx;
  const t = board?.theaters?.find(x => x.id === theaterId);
  const base = MAPS[theaterId];
  if (!base) throw new Error(`Unknown theater ${theaterId}`);

  if (theaterId === 'ukraine_front' && ctx.noControl) {
    const pb = { ...base, bbox: base.publicBbox };
    const ledger = ledgerLayers(theaterId, pb.bbox, now);
    const cmp = await mapEventLayers(theaterId, pb.bbox, pb.bbox, now, ctx);
    return { title: '烏俄事件圖', bbox: pb.bbox, sourceLinks: cmp.links, paragraph: `${warningSentence(t) || ''}${cmp.sentence}${recentEventsSentence(theaterId, now)}本圖不含控制區。`,
      layers: [{ type: 'points', items: pb.places.map(p => ({ ...p, label: p.name, color: '#ffffff', radius: 3 })) }, { type: 'arrows', items: ledger.arrows }, { type: 'points', items: ledger.points }, { type: 'arrows', items: cmp.arrows }, { type: 'points', items: cmp.points.map((p, i) => ({ ...p, label: i < 7 && p.label ? (p.label.length > 16 ? p.label.slice(0, 15) + '…' : p.label) : null })) }],
      legend: [{ color: '#ff5252', text: '已覆核事件', shape: 'dot' }], footer: `事件：覆核紀錄與多來源比對（不含控制區）｜${BASEMAP_CREDIT}` };
  }
  if (theaterId === 'ukraine_front') {
    const ds = require('./collectors/deepstate').loadDeepState();
    if (!ds) throw new Error('DeepState 控制區資料尚未取得');
    let key = sector && UA_SECTORS[sector] ? sector : null;
    const changes = {};
    if (ds.occupiedBefore) for (const [k, s] of Object.entries(UA_SECTORS)) if (k !== 'overview') changes[k] = core.measureChange(makeCanvas, s.bbox, ds.occupiedBefore, ds.occupied);
    if (!key) key = Object.entries(changes).sort((a, b) => (b[1].gainedKm2 + b[1].lostKm2) - (a[1].gainedKm2 + a[1].lostKm2)).find(([, c]) => c.gainedKm2 + c.lostKm2 > 0)?.[0] || 'overview';
    const s = UA_SECTORS[key];
    const ch = changes[key] || (ds.occupiedBefore ? core.measureChange(makeCanvas, s.bbox, ds.occupiedBefore, ds.occupied) : null);
    const evs = ds.events.filter(e => e.lat !== null && inBox(s.bbox, e.lon, e.lat));
    const uniq = arr => [...new Map(arr.map(e => [e.name, e])).values()];
    const ru = uniq(ds.events.filter(e => e.side === 'RU')), ua = uniq(ds.events.filter(e => e.side === 'UA'));
    let air = '';
    try { const a = require('./collectors/ukraine_air'); const r = a.assessUkraineAir(a.readCache(), now); if (r.latest) air = `烏克蘭空軍通報 ${r.latest.date.slice(5).replace('-', '/')} 無人機 ${r.latest.drones}、飛彈 ${r.latest.missiles ?? '未明'}（烏方數字）。`; } catch { /* 無資料 */ }
    const cmp = await mapEventLayers('ukraine_front', s.bbox, s.bbox, now, ctx); // 同名村莊很多，只在本圖範圍內找座標
    const range = `${md(ds.state.weekAgo.createdAt)}→${md(ds.state.latest.createdAt)}`;
    const paragraph = [
      `${range} DeepState 更新：俄軍推進 ${ru.length} 處${ru.length ? `（${ru.slice(0, 4).map(e => e.name).join('、')}${ru.length > 4 ? '等' : ''}）` : ''}，烏軍收復 ${ua.length} 處${ua.length ? `（${ua.slice(0, 4).map(e => e.name).join('、')}${ua.length > 4 ? '等' : ''}）` : ''}。`,
      ch ? `本圖範圍控制區比較：俄方新增約 ${ch.gainedKm2} km²、烏方收復約 ${ch.lostKm2} km²（像素估算）。` : '',
      cmp.sentence, air, warningSentence(t)
    ].join('');
    const layers = [
      { type: 'polygons', polygons: ds.occupied, fill: '#d32f2f', stroke: '#ff6e6e', alpha: 0.33 },
      { type: 'polygons', polygons: ds.contested, fill: '#cfcfcf', alpha: 0.35 }
    ];
    if (ds.occupiedBefore) layers.push({ type: 'change', before: ds.occupiedBefore, after: ds.occupied, gainColor: [255, 136, 0], lossColor: [41, 182, 246] });
    layers.push({ type: 'points', items: evs.map(e => ({ lon: e.lon, lat: e.lat, label: cmp.points.length ? null : `${e.name} ${md(e.at)}`, color: e.side === 'RU' ? '#ff5252' : '#40c4ff', radius: 5 })) });
    layers.push({ type: 'arrows', items: cmp.arrows }, { type: 'points', items: cmp.points });
    return { title: `${base.title}｜${s.name}`, paragraph, bbox: s.bbox, layers,
      legend: [{ color: '#d32f2f', text: '俄軍控制（DeepState）' }, { color: '#cfcfcf', text: '狀態不明／爭奪中' }, { color: 'rgb(255,136,0)', text: '近 7 天俄方新增' }, { color: 'rgb(41,182,246)', text: '近 7 天烏方收復' },
        { color: '#ff5252', text: '俄軍推進地點', shape: 'dot' }, { color: '#40c4ff', text: '烏軍收復地點', shape: 'dot' }, ...(cmp.count ? MAP_EVENT_LEGEND : [])],
      footer: `控制區與地點：DeepStateMap（deepstatemap.live，烏克蘭團隊整理，非獨立證實）${cmp.count ? '；比對事件：ISW、交戰方公告等（見訊息內連結）' : ''}｜${BASEMAP_CREDIT}`, sector: key, sourceLinks: cmp.links };
  }

  const ledger = ledgerLayers(theaterId, base.bbox, now);
  const cmp = await mapEventLayers(theaterId, base.bbox, base.bbox, now, ctx);
  const cmpLayers = [{ type: 'arrows', items: cmp.arrows }, { type: 'points', items: cmp.points }];
  const places = { type: 'points', items: (base.places || []).map(p => ({ ...p, label: p.name, color: '#ffffff', radius: 3 })) };

  if (theaterId === 'taiwan_strait') {
    let mnd = '';
    try {
      const feed = ctx.taiwanFeed || require('./taiwan_intel').getTaiwanFeed(now);
      const o = feed.latest?.observation;
      if (o) mnd = `國防部 ${md(o.periodEnd)} 通報（前 24 小時）：共機 ${o.aircraft?.value ?? '未提供'} 架次${o.crossingOrAirspace?.value != null ? `（逾越中線及進入空域 ${o.crossingOrAirspace.value} 架次）` : ''}、共艦 ${o.ships?.value ?? '未提供'} 艘、公務船 ${o.officialVessels?.value ?? '未提供'} 艘。`;
    } catch { /* 資料庫不可用 */ }
    // 前兆：中國海事局軍事禁航區、日本統合幕僚監部公布的通過水道
    let zones = [], zoneText = '', passagePts = [], jsText = '';
    try {
      const m = require('./collectors/china_msa');
      const act = m.activeZones(m.readCache(), now);
      zones = act.flatMap(n => n.areas.map(a => [a]));
      const lbl = act.map(n => { const c = n.areas[0]; const lon = c.reduce((s2, p) => s2 + p[0], 0) / c.length, lat = c.reduce((s2, p) => s2 + p[1], 0) / c.length;
        return { lon, lat, label: `${n.code} ${n.type}${n.validFrom ? ` ${md(n.validFrom)}–${md(n.validTo)}` : ''}`, color: n.nearTaiwan ? '#ff1744' : '#ffab40', radius: 3 }; });
      passagePts.push(...lbl);
      if (act.length) zoneText = `中國海事局軍事航行警告 ${act.length} 則生效或即將生效${act.some(n => n.nearTaiwan) ? '（有區域在中線以東）' : ''}：${act.slice(0, 3).map(n => `${n.code} ${n.type}`).join('、')}。`;
    } catch { /* 無資料 */ }
    try {
      const j = require('./collectors/japan_js');
      const recent = (j.readCache().items || []).filter(i => i.kind !== 'OTHER' && now - Date.parse(`${i.date}T12:00:00+09:00`) <= 7 * 86400_000);
      for (const i of recent) if (i.passage && inBox(base.bbox, i.passage.lon, i.passage.lat)) passagePts.push({ lon: i.passage.lon, lat: i.passage.lat, label: `日方公布：${i.passage.name} ${i.date.slice(5).replace('-', '/')}`, color: '#ff5252', radius: 6, hollow: true });
      if (recent.length) jsText = `日本統合幕僚監部近 7 天公布中國艦艇／軍機動向 ${recent.length} 則${recent.some(i => i.carrier) ? '（含航艦）' : ''}。`;
    } catch { /* 無資料 */ }
    return { title: base.title, bbox: base.bbox, sourceLinks: cmp.links,
      paragraph: `${mnd || '國防部通報尚未取得。'}國防部未公布共機精確位置，圖上不標航跡。${zoneText}${jsText}${cmp.sentence}${warningSentence(t)}${recentEventsSentence(theaterId, now)}`,
      layers: [{ type: 'polygons', polygons: zones, fill: '#ff6d00', stroke: '#ffab40', alpha: 0.35, lineWidth: 2 },
        { type: 'line', coords: [[122, 27], [118, 23]], color: '#ffd54f', dash: [12, 8], label: '海峽中線（示意）', labelAt: 0 }, places, { type: 'points', items: passagePts },
        { type: 'arrows', items: ledger.arrows }, { type: 'points', items: ledger.points }, ...cmpLayers],
      legend: [{ color: '#ffd54f', text: '海峽中線（示意）', shape: 'line' }, { color: '#ff6d00', text: '中國海事局軍事禁航區' }, { color: '#ff5252', text: '中方／已覆核事件', shape: 'dot' }, { color: '#40c4ff', text: '我方／友方事件', shape: 'dot' }, ...(cmp.count ? MAP_EVENT_LEGEND : [])],
      footer: `數字：中華民國國防部｜禁航區：中國海事局航行警告｜艦艇通過：日本統合幕僚監部（水道位置為示意）｜${BASEMAP_CREDIT}` };
  }

  if (theaterId === 'iran_gulf') {
    const u = require('./collectors/ukmto');
    const cache = u.readCache();
    const recent = (cache.incidents || []).filter(i => u.inGulf(i) && u.hostile(i) && now - Date.parse(i.occurredAt) <= 30 * 86400_000 && Number.isFinite(i.lat));
    const week = recent.filter(i => now - Date.parse(i.occurredAt) <= 7 * 86400_000);
    const latest = recent[0];
    const pts = recent.map(i => ({ lon: i.lon, lat: i.lat, label: now - Date.parse(i.occurredAt) <= 7 * 86400_000 ? `#${i.number} ${md(i.occurredAt)}` : null, color: now - Date.parse(i.occurredAt) <= 7 * 86400_000 ? '#ff1744' : '#ffab40', radius: 6 }));
    return { title: base.title, bbox: base.bbox, sourceLinks: cmp.links,
      paragraph: `UKMTO 通報（台北時間）：近 30 天波灣／荷莫茲／阿曼灣船舶遇襲 ${recent.length} 件，近 7 天 ${week.length} 件${latest ? `；最新為 ${md(latest.occurredAt)} ${latest.place}（UKMTO #${latest.number}）` : ''}。${warningSentence(t)}${recentEventsSentence(theaterId, now)}`,
      layers: [places, { type: 'points', items: pts }, { type: 'arrows', items: ledger.arrows }, { type: 'points', items: ledger.points }, ...cmpLayers],
      legend: [{ color: '#ff1744', text: '近 7 天船舶遇襲', shape: 'dot' }, { color: '#ffab40', text: '8–30 天前船舶遇襲', shape: 'dot' }],
      footer: `事件：UKMTO 官方通報（位置為通報座標，日期為台北時間）｜${BASEMAP_CREDIT}` };
  }

  // 其他戰區：地名＋覆核過的事件地點；沒有座標的事件只寫在文字
  return { title: base.title, bbox: base.bbox, sourceLinks: cmp.links,
    paragraph: `${warningSentence(t) || ''}${cmp.sentence}${recentEventsSentence(theaterId, now)}${researchSentence(theaterId, now)}${ledger.points.length || cmp.points.length ? '' : '近 14 天沒有附座標的已覆核事件，圖上只標地名；沒有資料不代表局勢平靜。'}`,
    layers: [places, { type: 'arrows', items: ledger.arrows }, { type: 'points', items: ledger.points }, ...cmpLayers],
    legend: [{ color: '#ff5252', text: '已覆核事件（觸發指標）', shape: 'dot' }, { color: '#9e9e9e', text: '已覆核事件（未觸發）', shape: 'dot' }],
    footer: `事件：research/warning_indicators.json 中附來源的覆核紀錄｜${BASEMAP_CREDIT}` };
}

async function renderBattleMap(theaterId, { sector, now = Date.now(), board, fetchImpl = fetch, taiwanFeed, noControl = false } = {}) {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const makeCanvas = (w, h) => createCanvas(w, h);
  if (!board) board = require('./warning_board').getWarningBoard(now);
  const spec = await buildSpec(theaterId, { now, board, makeCanvas, sector, taiwanFeed, noControl });
  const tiles = await loadTiles(spec.bbox, loadImage, fetchImpl);
  const { canvas } = core.drawBattleMap(makeCanvas, spec, tiles.satellite, tiles.labels);
  const buffer = await canvas.encode('jpeg', 85);
  return { buffer, filename: `battlemap_${theaterId}${spec.sector ? `_${spec.sector}` : ''}.jpg`, title: spec.title, paragraph: spec.paragraph, sourceLinks: spec.sourceLinks || [], tilesLoaded: tiles.satellite.length };
}

async function battleMapDiscordPayload(theaterId, options = {}) {
  const { AttachmentBuilder } = require('discord.js');
  const map = await renderBattleMap(theaterId, options);
  const links = (map.sourceLinks || []).slice(0, 6).map(l => `• ${l.title}：<${l.url}>`).join('\n');
  return { content: `**${map.title}**\n${map.paragraph}${links ? `\n比對來源：\n${links}` : ''}`.slice(0, 2000), files: [new AttachmentBuilder(map.buffer, { name: map.filename })], embeds: [], allowedMentions: { parse: [] } };
}

// 推播用：theaterId 為 null 時畫全部戰區（Discord 單則訊息最多 10 個附件）
async function renderMapFiles(theaterId, options = {}) {
  const { AttachmentBuilder } = require('discord.js');
  const ids = theaterId ? [theaterId] : Object.keys(MAPS);
  const files = [];
  for (const id of ids) {
    try { const m = await renderBattleMap(id, options); files.push(new AttachmentBuilder(m.buffer, { name: m.filename })); }
    catch (e) { console.warn('[BATTLE MAP]', id, e.message); }
  }
  return files.slice(0, 10);
}
// 私訊文字對應戰區
function theaterFromText(text) {
  const rules = [[/台海|臺海|台灣|臺灣|共機|共艦/, 'taiwan_strait'], [/美伊|伊朗|荷莫茲|霍爾木茲|波斯灣/, 'iran_gulf'], [/波蘭|北約|東翼|波羅的海/, 'europe_security'],
    [/以巴|加薩|黎巴嫩|紅海|以色列/, 'middle_east'], [/蘇丹/, 'sudan'], [/緬甸/, 'myanmar'], [/南海|菲律賓|仁愛礁/, 'south_china_sea'], [/烏|俄/, 'ukraine_front']];
  return rules.find(([re]) => re.test(text))?.[1] || 'ukraine_front';
}

module.exports = { shortIndicator, loadTiles, validMapEvent, mapEventLayers, renderMapFiles, theaterFromText, MAPS, UA_SECTORS, NAMES, buildSpec, renderBattleMap, battleMapDiscordPayload, ledgerLayers, fetchTile };
