// 戰況報導 → 兩張簡報圖卡（重點＋位置圖／衛星影像、完整內容）。Discord 內文字太小時以圖卡為主。
const path = require('path');
const core = require('./report_card_core');
const bm = require('./battle_map');

const HOUR = 3600_000;
const tpe = iso => new Date(Date.parse(iso) + 8 * HOUR);
const md = iso => { const d = tpe(iso); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
const mdhm = iso => { const d = tpe(iso); return `${md(iso)} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const plain = s => String(s || '').replace(/\*\*/g, '').replace(/\s*\n\s*/g, '\n').trim();

// 報導可選填 location：{ lat, lon, label }；會在位置圖上標出（來源所述位置，不是本站定位）
function validLocation(l) {
  return l && Number.isFinite(l.lat) && Number.isFinite(l.lon) && Math.abs(l.lat) <= 85 && Math.abs(l.lon) <= 180 &&
    typeof l.label === 'string' && l.label.trim() && l.label.length <= 30 ? l : null;
}
// 報導可選填 cardPoints：[{ kind, label, text }]，專門給第 1 張的短句；沒有時取各段第一句
function firstSentences(text, max = 90) {
  const parts = plain(text).split(/(?<=[。！？])/);
  let out = parts[0] || '';
  if (out.length < 28 && parts[1]) out += parts[1];
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}
function points(report) {
  const cp = Array.isArray(report.cardPoints) ? report.cardPoints.filter(p => p && typeof p.label === 'string' && typeof p.text === 'string' && p.text.length <= 120) : [];
  if (cp.length) return cp.slice(0, 4);
  return (report.sections || []).slice(0, 4).map(s => ({ kind: s.kind, label: s.label, text: firstSentences(s.text) }));
}

function cardData(report, references) {
  const idx = id => references.findIndex(r => r.id === id) + 1;
  const { outlookText } = require('./strategic_outlook');
  return {
    theaterName: report.coverage ? '全球' : (bm.NAMES[report.theater] || '戰況'),
    kicker: report.coverage ? '全球戰況｜衛星證據與情境推演' : '軍事新聞｜戰況與台海動態',
    title: report.title, asOf: mdhm(report.asOf),
    points: points(report),
    sections: (report.sections || []).map(s => ({ kind: s.kind, label: s.label, text: plain(s.text), refs: s.evidence.map(id => `[${idx(id)}]`).join('') })),
    extra: plain(outlookText(report)) || null,
    refs: references.map((r, i) => { let host = ''; try { host = new URL(r.url).hostname.replace(/^www\./, ''); } catch {} return { n: i + 1, publisher: r.publisher, date: md(r.publishedAt), host }; }),
    footer: `報導與研判分列｜分析 ${mdhm(report.generatedAt)}｜WorldWarNews`
  };
}

const PIC_W = 860, PIC_H = 606;
// 圖片優先順序：報導附的衛星影像 → 報導位置的區域圖 → 戰區熱區圖
async function picture(report, { loadImage, makeCanvas, fetchImpl, now, publicSafe = false }) {
  const { resolveImagery } = require('./strategic_outlook');
  const imagery = resolveImagery(report, require('./satellite_assets').getSatelliteFeed().assets);
  if (imagery.length) {
    const a = imagery[0];
    return { image: await loadImage(path.join(__dirname, '../public', a.file)), title: `衛星影像｜${a.region}`,
      caption: `拍攝 ${String(a.acquiredAt).slice(0, 10)}｜${a.role === 'CONTEXT_ONLY' ? '背景影像，未判讀戰果' : '已覆核觀測'}｜${a.credit || ''}` };
  }
  const loc = validLocation(report.location);
  const core2 = require('./battle_map_core');
  if (loc) {
    const bbox = [loc.lon - 2.4, loc.lat - 1.7, loc.lon + 2.4, loc.lat + 1.7];
    const tiles = await bm.loadTiles(bbox, loadImage, fetchImpl, PIC_W, PIC_H);
    const layers = [];
    if (report.theater === 'taiwan_strait') layers.push({ type: 'line', coords: [[122, 27], [118, 23]], color: '#ffd54f', dash: [12, 8], label: '海峽中線（示意）', labelAt: 0 });
    layers.push({ type: 'points', items: [{ lon: loc.lon, lat: loc.lat, radius: 13, color: '#ff5252', label: loc.label }] });
    const c = core2.drawBattleMap(makeCanvas, { bbox, layers, mapOnly: true, width: PIC_W, mapHeight: PIC_H }, tiles.satellite, tiles.labels).canvas;
    return { image: c, title: `位置示意｜${loc.label}`, caption: '紅點為來源所述位置，非本站定位｜底圖 Sentinel-2 cloudless 2020（EOX），非當日影像' };
  }
  // 公開網頁不重製 DeepState 控制區幾何（其授權未允許轉載），烏俄改不附戰區圖
  if (!bm.MAPS[report.theater] || (publicSafe && report.theater === 'ukraine_front')) return null;
  const board = require('./warning_board').getWarningBoard(now);
  const spec = await bm.buildSpec(report.theater, { now, board, makeCanvas });
  const tiles = await bm.loadTiles(spec.bbox, loadImage, fetchImpl, PIC_W, PIC_H);
  const c = core2.drawBattleMap(makeCanvas, { ...spec, mapOnly: true, width: PIC_W, mapHeight: PIC_H }, tiles.satellite, tiles.labels).canvas;
  return { image: c, title: `戰區熱區｜${bm.NAMES[report.theater]}`, caption: '戰區預警與已覆核事件位置｜底圖 Sentinel-2 cloudless 2020（EOX），非當日影像' };
}

async function renderReportCards(report, { now = Date.now(), fetchImpl = fetch, publicSafe = false, quality = 90 } = {}) {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const makeCanvas = (w, h) => createCanvas(w, h);
  const data = cardData(report, report.references || []);
  let pic = null;
  try { pic = await picture(report, { loadImage, makeCanvas, fetchImpl, now, publicSafe }); } catch (e) { console.warn('[REPORT CARD PICTURE]', report.id, e.message); }
  if (pic) { data.pictureTitle = pic.title; data.pictureCaption = pic.caption; }
  const out = core.drawReportCards(makeCanvas, data, pic?.image || null);
  const buffers = [];
  for (const s of out.slides) buffers.push(await s.encode('jpeg', quality));
  return { buffers, truncated: out.truncated, data };
}

// 以圖卡為主的推播格式：兩張圖卡＋精簡的來源連結（原本的長文字只在圖卡放不下時保留）
async function researchCardPayload(reportId, opts = {}) {
  const rr = require('./research_reports');
  const base = rr.researchDiscordPayload(reportId);
  if (!base.embeds?.length) return base;
  const feed = rr.getResearchFeed();
  const report = reportId ? feed.reports.find(r => r.id === reportId) : feed.reports[0];
  if (!report) return base;
  try {
    const { buffers, truncated } = await renderReportCards(report, opts);
    const cards = buffers.map((b, i) => ({ attachment: b, name: `report_card_${i + 1}.jpg` }));
    const [main, ...rest] = base.embeds;
    const slim = { ...main };
    if (!truncated) slim.description = '👆 重點與完整內容在上方兩張圖卡（點圖可放大）；以下是來源連結。';
    return { ...base, files: [...cards, ...(base.files || [])], embeds: [slim, ...rest], components: require('./push_buttons').buttonsFor(report.theater, { prepare: false }) };
  } catch (e) {
    console.warn('[REPORT CARD]', report.id, e.message);
    return base; // 畫圖失敗時照舊送文字版
  }
}

module.exports = { renderReportCards, researchCardPayload, cardData, firstSentences, validLocation, points };
