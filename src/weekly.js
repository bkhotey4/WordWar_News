// 每週戰況週報：資料彙整、繪圖與週日推播。數字全部取自既有來源快取，沒有資料就寫「—」。
const fs = require('fs');
const path = require('path');
const DAY = 86400_000, HOUR = 3600_000;
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const tpeDate = ms => new Date(ms + 8 * HOUR).toISOString().slice(0, 10);
const md = s => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
const ROWS = [['taiwan_strait', '台海'], ['ukraine_front', '烏俄戰爭'], ['iran_gulf', '美伊與荷莫茲'], ['europe_security', '歐洲與北約東翼']];

// 每天取當天快照的最高等級
function dailyLevels(history, theater, now) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = tpeDate(now - (6 - i) * DAY);
    const snaps = (history.snapshots || []).filter(s => s.theater === theater && tpeDate(Date.parse(s.at)) === date);
    const lv = snaps.map(s => s.level ?? s.rawLevel).filter(Number.isInteger);
    return { date, label: md(date), wd: `週${WEEKDAY[new Date(`${date}T12:00:00+08:00`).getUTCDay()]}`, level: lv.length ? Math.max(...lv) : null };
  });
}
const inWeek = (t, now, w) => { const age = now - t; return age >= w * 7 * DAY && age < (w + 1) * 7 * DAY; };

function kpisFor(theater, now) {
  const k = [];
  try {
    if (theater === 'taiwan_strait') {
      let hist = [];
      try { hist = require('./taiwan_intel').getTaiwanFeed(now).history || []; } catch { /* 無資料庫 */ }
      const sum = w => { const r = hist.filter(h => h.observation?.aircraft?.value != null && inWeek(Date.parse(h.observation.periodEnd), now, w)); return r.length ? r.reduce((s, h) => s + h.observation.aircraft.value, 0) : null; };
      k.push({ label: '共機架次（國防部，7 天合計）', value: sum(0), prev: sum(1) });
      const ev = require('./collectors/pla_joint').readCache()?.events || [];
      const cnt = w => ev.filter(e => e.confirmed && inWeek(Date.parse(e.firstSeen), now, w)).length;
      k.push({ label: '聯合戰備警巡／具名演習', value: cnt(0), prev: cnt(1) });
    } else if (theater === 'ukraine_front') {
      const a = require('./collectors/ukraine_air'), series = a.dailySeries(a.readCache().reports || []);
      const sum = (w, f) => { const r = series.filter(d => inWeek(Date.parse(`${d.date}T12:00:00Z`), now, w)); return r.length ? r.reduce((s, d) => s + f(d), 0) : null; };
      k.push({ label: '無人機（烏克蘭空軍通報）', value: sum(0, d => d.drones || 0), prev: sum(1, d => d.drones || 0) });
      k.push({ label: '飛彈', value: sum(0, d => d.missiles || 0), prev: sum(1, d => d.missiles || 0) });
    } else if (theater === 'iran_gulf') {
      const u = require('./collectors/ukmto'), inc = (u.readCache().incidents || []).filter(i => u.inGulf(i) && u.hostile(i));
      k.push({ label: '船舶遇襲（UKMTO）', value: inc.filter(i => inWeek(Date.parse(i.occurredAt), now, 0)).length, prev: inc.filter(i => inWeek(Date.parse(i.occurredAt), now, 1)).length });
    }
  } catch (e) { /* 單一來源失敗不影響其他列 */ }
  const ledger = readJson(path.join(__dirname, '../research/warning_indicators.json'), {});
  const trig = w => (ledger.entries || []).filter(e => e.theater === theater && e.triggered && inWeek(Date.parse(e.observedAt), now, w)).length;
  if (k.length < 2) k.push({ label: '觸發中的查核指標（筆）', value: trig(0), prev: trig(1) });
  return k;
}

function highlights(theater, now) {
  const reports = readJson(path.join(__dirname, '../research/reports.json'), { reports: [] }).reports || [];
  return reports.filter(r => !r.supersededBy && r.theater === theater && now - Date.parse(r.asOf) <= 7 * DAY)
    .sort((a, b) => Date.parse(b.asOf) - Date.parse(a.asOf)).slice(0, 3).map(r => `${md(tpeDate(Date.parse(r.asOf)))} ${r.title}`);
}

function weeklyData(now = Date.now(), board) {
  board = board || require('./warning_board').getWarningBoard(now);
  const history = readJson(path.join(__dirname, '../research/warning_history.json'), { snapshots: [] });
  const from = tpeDate(now - 6 * DAY), to = tpeDate(now);
  return {
    title: `每週戰況週報｜${md(from)}–${md(to)}`,
    subtitle: '7 天警戒等級、本週與上週比較、本週查核報導（預警試行中，等級不是開戰機率）',
    rows: ROWS.map(([id, name]) => { const t = board.theaters.find(x => x.id === id); return { id, name, level: t?.level ?? null, levelName: t?.levelName || '', days: dailyLevels(history, id, now), kpis: kpisFor(id, now), highlights: highlights(id, now) }; }),
    footer: `資料：國防部、烏克蘭空軍、UKMTO、DeepState、媒體交叉比對｜${new Date(now + 8 * HOUR).toISOString().slice(0, 16).replace('T', ' ')}（台北）產生｜交戰方數字為其自稱`
  };
}

async function renderWeekly(now = Date.now()) {
  const { createCanvas } = require('@napi-rs/canvas');
  const c = require('./weekly_core').drawWeekly((w, h) => createCanvas(w, h), weeklyData(now));
  return c.encode('jpeg', 90);
}
// PDF 用字型：微軟正黑體是 .ttc 字型集，PDF 會整套內嵌（2 種粗細約 22 MB）；
// Noto Sans TC 是 .ttf，只內嵌用到的字（約 0.2 MB）。只在 PDF 頁面換字型，圖片版不變。
const PDF_FONT_FILES = ['C:/Windows/Fonts/NotoSansTC-VF.ttf', path.join(process.env.LOCALAPPDATA || '', 'Microsoft/Windows/Fonts/NotoSansTC-VF.ttf'), '/usr/share/fonts/opentype/noto/NotoSansTC-VF.ttf'];
let pdfFont;
function pdfFontFamily() {
  if (pdfFont !== undefined) return pdfFont;
  const { GlobalFonts } = require('@napi-rs/canvas');
  const file = PDF_FONT_FILES.find(f => { try { return fs.statSync(f).isFile(); } catch { return false; } });
  pdfFont = file && GlobalFonts.registerFromPath(file, 'WWPdfNotoTC') ? 'WWPdfNotoTC' : null;
  return pdfFont;
}
// 把繪圖程式設定的字型名稱換成 PDF 字型，其餘操作原樣轉給 PDF 頁面
function pdfContext(ctx, family) {
  if (!family) return ctx;
  return new Proxy(ctx, {
    set(target, key, value) { target[key] = key === 'font' && typeof value === 'string' ? value.replace(/"Microsoft JhengHei"/g, family) : value; return true; },
    get(target, key) { const v = target[key]; return typeof v === 'function' ? v.bind(target) : v; }
  });
}
// PDF 版：週報＋全球海報＋四大戰區海報，向量頁面（文字可選取、可搜尋）。
// 單一戰區海報失敗（例如地圖圖塊抓不到）時略過該頁並在週報頁註記，不讓整份失敗。
async function renderWeeklyPdf(now = Date.now(), { theaters = ROWS.map(([id]) => id), posterParts = null } = {}) {
  const { PDFDocument } = require('@napi-rs/canvas');
  const poster = require('./poster'), pc = require('./poster_core');
  const board = require('./warning_board').getWarningBoard(now);
  const data = weeklyData(now, board);
  const doc = new PDFDocument({ title: data.title, author: 'WorldWar News', subject: '每週戰況週報（預警試行中，等級不是開戰機率）', creator: 'WorldWar News', producer: 'WorldWar News' });
  const family = pdfFontFamily();
  const page = draw => { draw((w, h) => ({ width: w, height: h, getContext: () => pdfContext(doc.beginPage(w, h), family) })); doc.endPage(); };
  const pages = [];
  const skipped = [];
  const parts = [];
  for (const id of theaters) {
    try {
      const p = await (posterParts || poster.theaterPosterParts)(id, { now, board });
      // 地圖底圖先轉 JPEG 再放進 PDF，否則 PDF 會以未壓縮像素內嵌，一頁就數 MB
      if (p.mapCanvas?.encode) p.mapCanvas = await require('@napi-rs/canvas').loadImage(await p.mapCanvas.encode('jpeg', 82));
      parts.push([id, p]);
    }
    catch (e) { skipped.push(`${id}：${e.message}`); }
  }
  if (skipped.length) data.footer = `${data.footer}｜未附海報：${skipped.join('；')}`.slice(0, 300);
  page(make => require('./weekly_core').drawWeekly(make, data)); pages.push('週報');
  page(make => pc.drawGlobalPoster(make, poster.globalPosterData({ now, board }))); pages.push('全球海報');
  for (const [id, p] of parts) { page(make => pc.drawTheaterPoster(make, p.data, p.mapCanvas)); pages.push(id); }
  return { buffer: doc.close(), filename: `weekly_report_${weekKey(now)}.pdf`, pages, skipped };
}
async function weeklyDiscordPayload(now = Date.now(), { pdf = false } = {}) {
  const buf = await renderWeekly(now);
  const files = [{ attachment: buf, name: 'weekly_report.jpg' }];
  let note = '';
  if (pdf) {
    try { const p = await renderWeeklyPdf(now); files.push({ attachment: p.buffer, name: p.filename }); note = `\n附 PDF（${p.pages.length} 頁：週報、全球與各戰區海報）。`; }
    catch (e) { note = `\nPDF 暫時無法產生：${e.message}`; }
  }
  return { content: `# 📊 每週戰況週報${note}`, files, embeds: [], allowedMentions: { parse: [] } };
}

// 週日（台北）20:00 後送一次；每位訂閱者各自記錄，靜默時段延後者下一輪補送
const STATE = path.join(__dirname, '../research/weekly_state.json');
function weekKey(now) { const d = new Date(now + 8 * HOUR); return tpeDate(now - d.getUTCDay() * DAY); }
async function dispatchWeekly(client, subscribers, { now = Date.now(), file = STATE, shouldDeliver = () => ({ deliver: true }), markDelivered = () => {}, components } = {}) {
  // 週日 20:00 開始送；靜默時段延後的人到週一 12:00 前都能補送（週一仍算同一週的週報）
  const d = new Date(now + 8 * HOUR), sundayEvening = d.getUTCDay() === 0 && d.getUTCHours() >= 20, mondayMorning = d.getUTCDay() === 1 && d.getUTCHours() < 12;
  if (!sundayEvening && !mondayMorning) return [];
  const key = weekKey(mondayMorning ? now - 24 * HOUR : now), state = readJson(file, {});
  const same = state.week === key, sent = new Set(same ? state.sentTo : []), attempts = same ? (state.attempts || {}) : {};
  const eventId = `WEEKLY_${key}`, results = [];
  const todo = subscribers.filter(s => !sent.has(s.userId) && (attempts[s.userId] || 0) < 5).filter(s => {
    const dec = shouldDeliver(s.userId, { level: 'ROUTINE', eventId, code: 'WEEKLY' });
    if (!dec.deliver) results.push({ userId: s.userId, status: 'DEFERRED' });
    return dec.deliver;
  });
  if (!todo.length) return results.filter(r => r.status !== 'DEFERRED');
  const payload = await weeklyDiscordPayload(mondayMorning ? now - 12 * HOUR : now, { pdf: true });
  for (const sub of todo) {
    try { await (await client.users.fetch(sub.userId)).send({ ...payload, ...(components ? { components } : {}) }); markDelivered(sub.userId, eventId); sent.add(sub.userId); results.push({ userId: sub.userId, status: 'SENT' }); }
    catch (e) { attempts[sub.userId] = (attempts[sub.userId] || 0) + 1; results.push({ userId: sub.userId, status: 'FAILED', error: e.message }); }
  }
  const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify({ week: key, sentTo: [...sent], attempts })); fs.renameSync(tmp, file);
  return results;
}

module.exports = { weeklyData, renderWeekly, renderWeeklyPdf, weeklyDiscordPayload, dispatchWeekly, dailyLevels, weekKey };
