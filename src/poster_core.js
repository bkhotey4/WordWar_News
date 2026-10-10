// 戰況海報繪製核心（1920×1080 簡報風格）：只用 Canvas 2D API，Node 與瀏覽器共用。
// 所有數字與文字由呼叫端提供並附出處；本檔只負責版面。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PosterCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 1920, H = 1080;
  const FONT = '"Microsoft JhengHei", "Noto Sans CJK TC", "Noto Sans TC", "PingFang TC", sans-serif';
  const NUM = '"Bahnschrift", "DIN Alternate", "Segoe UI", "Microsoft JhengHei", sans-serif';
  const C = { bg1: '#040a14', bg2: '#0b1a2f', grid: 'rgba(0,229,255,0.05)', cyan: '#00e5ff', text: '#e8f1fb', dim: '#8aa0b8', panel: 'rgba(10,28,50,0.82)', line: 'rgba(0,229,255,0.35)' };
  const LEVEL = { 1: ['#22c55e', '常態'], 2: ['#eab308', '升溫'], 3: ['#f97316', '高度警戒'], 4: ['#ef4444', '危機'] };
  const levelColor = l => (LEVEL[l] || ['#94a3b8'])[0];

  function wrap(ctx, text, maxW) {
    const out = [];
    // 避頭點：標點不放在行首，改掛在上一行行尾
    const NO_START = '，。、；：！？）」』》〉,.;:!?)';
    for (const para of String(text || '').split('\n')) { let line = ''; for (const ch of para) { if (ctx.measureText(line + ch).width > maxW && line && !NO_START.includes(ch)) { out.push(line); line = ''; } line += ch; } out.push(line); }
    return out;
  }
  function textBlock(ctx, text, x, y, maxW, lineH, maxLines, font, color) {
    ctx.font = font; ctx.fillStyle = color;
    let lines = wrap(ctx, text, maxW);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/.$/, '…'); }
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
    return y + lines.length * lineH;
  }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  // 科技感面板：半透明底＋角框
  function panel(ctx, x, y, w, h, title, accent = C.cyan) {
    ctx.fillStyle = C.panel; rrect(ctx, x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(0,229,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = accent; ctx.lineWidth = 3; const k = 18;
    for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) { ctx.beginPath(); ctx.moveTo(cx, cy + dy * k); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * k, cy); ctx.stroke(); }
    if (title) { ctx.font = `bold 22px ${FONT}`; ctx.fillStyle = accent; ctx.fillText(title, x + 20, y + 36); ctx.fillStyle = 'rgba(0,229,255,0.25)'; ctx.fillRect(x + 20, y + 46, w - 40, 1); }
    return { x: x + 20, y: y + (title ? 64 : 20), w: w - 40, h: h - (title ? 84 : 40) };
  }
  function background(ctx, title, subtitle, badge) {
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, C.bg1); g.addColorStop(1, C.bg2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // 標題列
    ctx.fillStyle = C.cyan; ctx.fillRect(48, 40, 8, 64);
    ctx.shadowColor = 'rgba(0,229,255,0.6)'; ctx.shadowBlur = 18;
    ctx.font = `bold 56px ${FONT}`; ctx.fillStyle = C.text; ctx.fillText(title, 76, 96);
    ctx.shadowBlur = 0;
    ctx.font = `22px ${FONT}`; ctx.fillStyle = C.dim; ctx.fillText(subtitle, 78, 132);
    if (badge) {
      ctx.font = `bold 34px ${FONT}`; const tw = ctx.measureText(badge.text).width;
      const bx = W - 48 - tw - 60, by = 44;
      ctx.fillStyle = badge.color; ctx.shadowColor = badge.color; ctx.shadowBlur = 24; rrect(ctx, bx, by, tw + 60, 70, 12); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#0b1220'; ctx.fillText(badge.text, bx + 30, by + 48);
      if (badge.sub) { ctx.font = `20px ${FONT}`; ctx.fillStyle = C.dim; const sw = ctx.measureText(badge.sub).width; ctx.fillText(badge.sub, W - 48 - sw, by + 102); }
    }
  }
  function footer(ctx, text) {
    ctx.fillStyle = 'rgba(0,229,255,0.2)'; ctx.fillRect(48, H - 58, W - 96, 1);
    textBlock(ctx, text, 48, H - 30, W - 96, 22, 1, `16px ${FONT}`, C.dim);
  }
  function kpi(ctx, x, y, w, h, k, accent) {
    ctx.fillStyle = 'rgba(0,229,255,0.06)'; rrect(ctx, x, y, w, h, 8); ctx.fill();
    ctx.fillStyle = accent || C.cyan; ctx.fillRect(x, y + 12, 4, h - 24);
    ctx.font = `18px ${FONT}`; ctx.fillStyle = C.dim; ctx.fillText(k.label, x + 18, y + 32);
    ctx.shadowColor = accent || C.cyan; ctx.shadowBlur = 14;
    ctx.font = `bold 52px ${NUM}`; ctx.fillStyle = C.text; ctx.fillText(String(k.value), x + 18, y + 90);
    ctx.shadowBlur = 0;
    const vw = ctx.measureText(String(k.value)).width;
    if (k.unit) { ctx.font = `22px ${FONT}`; ctx.fillStyle = C.dim; ctx.fillText(k.unit, x + 26 + vw, y + 90); }
    if (k.sub) textBlock(ctx, k.sub, x + 18, y + 122, w - 30, 20, 1, `16px ${FONT}`, k.subColor || C.dim);
  }
  function bars(ctx, box, items, unit = '') {
    if (!items.length) { textBlock(ctx, '暫無資料', box.x, box.y + 30, box.w, 26, 1, `20px ${FONT}`, C.dim); return; }
    items = items.slice(0, Math.max(1, Math.floor(box.h / 40))); // 空間不夠時只畫前幾名，避免文字重疊
    const max = Math.max(...items.map(i => i.value), 1), rowH = Math.min(46, box.h / items.length);
    items.forEach((it, i) => {
      const y = box.y + i * rowH;
      ctx.font = `18px ${FONT}`; ctx.fillStyle = C.text; ctx.fillText(it.label, box.x, y + 20);
      const bw = (box.w - 90) * it.value / max;
      const g = ctx.createLinearGradient(box.x, 0, box.x + bw, 0); g.addColorStop(0, 'rgba(0,229,255,0.25)'); g.addColorStop(1, it.color || C.cyan);
      ctx.fillStyle = g; ctx.fillRect(box.x, y + 27, Math.max(bw, 3), 10);
      ctx.font = `bold 20px ${NUM}`; ctx.fillStyle = C.text; ctx.fillText(`${it.value}${unit}${it.note ? ` ${it.note}` : ''}`, box.x + Math.max(bw, 3) + 10, y + 38);
    });
  }
  function spark(ctx, x, y, w, h, values, color) {
    if (values.length < 2) return;
    const max = Math.max(...values), min = Math.min(...values), sx = w / (values.length - 1);
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath();
    values.forEach((v, i) => { const py = y + h - (max === min ? h / 2 : (v - min) / (max - min) * h); i ? ctx.lineTo(x + i * sx, py) : ctx.moveTo(x, py); });
    ctx.stroke();
    ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fillStyle = 'rgba(0,229,255,0.08)'; ctx.fill();
  }
  function keyPoints(ctx, x, y, w, h, points) {
    const cw = (w - 40) / 3;
    points.slice(0, 3).forEach((p, i) => {
      const bx = x + i * (cw + 20), accent = p.color || C.cyan;
      const inner = panel(ctx, bx, y, cw, h, null, accent);
      ctx.font = `bold 40px ${NUM}`; ctx.fillStyle = accent; ctx.fillText(`0${i + 1}`, inner.x, inner.y + 36);
      textBlock(ctx, p.title, inner.x + 66, inner.y + 30, inner.w - 66, 32, 1, `bold 28px ${FONT}`, C.text);
      let textW = inner.w;
      if (p.stat) { // 大數字：一眼看到重點
        ctx.font = `bold 72px ${NUM}`; const sw = ctx.measureText(String(p.stat.value)).width;
        ctx.font = `22px ${FONT}`; const uw = ctx.measureText(p.stat.unit || '').width;
        const sx = inner.x + inner.w - Math.max(sw, uw);
        ctx.shadowColor = accent; ctx.shadowBlur = 20; ctx.font = `bold 72px ${NUM}`; ctx.fillStyle = accent; ctx.fillText(String(p.stat.value), sx, inner.y + 118); ctx.shadowBlur = 0;
        ctx.font = `22px ${FONT}`; ctx.fillStyle = C.dim; ctx.fillText(p.stat.unit || '', sx, inner.y + 148);
        textW = inner.w - Math.max(sw, uw) - 24;
      }
      textBlock(ctx, p.text, inner.x, inner.y + 78, textW, 32, Math.max(1, Math.floor((inner.h - 62) / 32)), `22px ${FONT}`, '#c9d7e6');
    });
  }

  // 單一戰區海報：左地圖、右數據、下方三大重點
  function drawTheaterPoster(makeCanvas, d, mapCanvas) {
    const canvas = makeCanvas(W, H), ctx = canvas.getContext('2d');
    background(ctx, d.title, d.subtitle, d.level ? { text: `第 ${d.level} 級 ${d.levelName}`, color: levelColor(d.level), sub: d.trendText } : { text: '無法判定', color: '#94a3b8', sub: '資料不足' });
    // 地圖＋熱區
    const mx = 48, my = 168, mw = 1060, mh = 500;
    const box = panel(ctx, mx, my, mw, mh, d.mapTitle || '熱區地圖');
    if (mapCanvas) { ctx.save(); rrect(ctx, box.x, box.y, box.w, box.h, 6); ctx.clip(); ctx.drawImage(mapCanvas, 0, 0, mapCanvas.width, mapCanvas.height, box.x, box.y, box.w, box.h); ctx.restore(); }
    else textBlock(ctx, '地圖資料暫時無法取得', box.x + 20, box.y + 40, box.w, 30, 1, `24px ${FONT}`, C.dim);
    // KPI 2×2
    const rx = 1130, rw = 742;
    const kw = (rw - 20) / 2, kh = 140;
    (d.kpis || []).slice(0, 4).forEach((k, i) => kpi(ctx, rx + (i % 2) * (kw + 20), my + Math.floor(i / 2) * (kh + 16), kw, kh, k, k.color));
    // 圖表（武器／熱區排行）
    const chart = panel(ctx, rx, my + 2 * (kh + 16), rw, mh - 2 * (kh + 16), d.chart?.title || '熱區排行');
    bars(ctx, chart, (d.chart?.items || []).slice(0, 5), d.chart?.unit || '');
    // 兵力／其他資訊列
    const fy = my + mh + 16;
    const forces = panel(ctx, mx, fy, mw, 96, null, '#7dd3fc');
    ctx.font = `bold 20px ${FONT}`; ctx.fillStyle = '#7dd3fc'; ctx.fillText('兵力（有出處的估計）', forces.x, forces.y + 10);
    const fl = d.forces?.length ? d.forces.slice(0, 2).map(f => `${f.label}：${f.value}（${f.source}，${f.asOf}${f.old ? '，較舊' : ''}）`).join('\n') : '暫無可靠的公開兵力估計；不自行推算。';
    textBlock(ctx, fl, forces.x, forces.y + 38, forces.w, 25, 2, `18px ${FONT}`, C.text);
    const trend = panel(ctx, rx, fy, rw, 96, null);
    ctx.font = `bold 20px ${FONT}`; ctx.fillStyle = C.cyan; ctx.fillText(d.trend?.title || '趨勢', trend.x, trend.y + 10);
    if (d.trend?.values?.length > 1) { spark(ctx, trend.x, trend.y + 22, trend.w - 180, 36, d.trend.values, C.cyan); ctx.font = `18px ${FONT}`; ctx.fillStyle = C.dim; ctx.fillText(d.trend.caption || '', trend.x + trend.w - 170, trend.y + 56); }
    else textBlock(ctx, '歷史資料累積中', trend.x, trend.y + 50, trend.w, 24, 1, `18px ${FONT}`, C.dim);
    keyPoints(ctx, 48, fy + 112, W - 96, H - 58 - (fy + 112) - 14, d.points || []);
    footer(ctx, d.footer);
    return canvas;
  }

  // 全球海報：三大重點＋各戰區狀態卡
  function drawGlobalPoster(makeCanvas, d) {
    const canvas = makeCanvas(W, H), ctx = canvas.getContext('2d');
    background(ctx, d.title, d.subtitle, null);
    keyPoints(ctx, 48, 168, W - 96, 300, d.points || []);
    const tiles = d.theaters || [];
    const main = tiles.slice(0, 4), cw = (W - 96 - 60) / 4;
    main.forEach((t, i) => {
      const x = 48 + i * (cw + 20), y = 490, h = 330;
      const inner = panel(ctx, x, y, cw, h, null, levelColor(t.level));
      ctx.fillStyle = levelColor(t.level); ctx.fillRect(x, y, cw, 6);
      textBlock(ctx, t.name, inner.x, inner.y + 20, inner.w, 34, 1, `bold 30px ${FONT}`, C.text);
      ctx.font = `bold 26px ${FONT}`; ctx.fillStyle = levelColor(t.level); ctx.fillText(t.level ? `第 ${t.level} 級 ${t.levelName}` : '無法判定', inner.x, inner.y + 64);
      ctx.font = `18px ${FONT}`; ctx.fillStyle = C.dim; ctx.fillText(t.trendText || '', inner.x, inner.y + 92);
      (t.kpis || []).slice(0, 2).forEach((k, j) => {
        const ky = inner.y + 118 + j * 78;
        ctx.font = `17px ${FONT}`; ctx.fillStyle = C.dim; ctx.fillText(k.label, inner.x, ky);
        ctx.font = `bold 40px ${NUM}`; ctx.fillStyle = C.text; ctx.fillText(String(k.value), inner.x, ky + 44);
        const vw = ctx.measureText(String(k.value)).width; ctx.font = `20px ${FONT}`; ctx.fillStyle = C.dim; ctx.fillText(k.unit || '', inner.x + vw + 8, ky + 44);
      });
      if (t.values?.length > 1) spark(ctx, inner.x, inner.y + inner.h - 34, inner.w, 30, t.values, levelColor(t.level));
    });
    const others = tiles.slice(4);
    if (others.length) {
      const inner = panel(ctx, 48, 840, W - 96, 170, '其他戰區');
      const ow = inner.w / others.length;
      others.forEach((t, i) => {
        const x = inner.x + i * ow;
        ctx.fillStyle = levelColor(t.level); ctx.beginPath(); ctx.arc(x + 10, inner.y + 18, 9, 0, Math.PI * 2); ctx.fill();
        ctx.font = `bold 24px ${FONT}`; ctx.fillStyle = C.text; ctx.fillText(t.name, x + 28, inner.y + 26);
        textBlock(ctx, t.line || '', x, inner.y + 60, ow - 24, 24, 2, `18px ${FONT}`, C.dim);
      });
    }
    footer(ctx, d.footer);
    return canvas;
  }

  return { MAP_BOX: { w: 1020, h: 416 }, W, H, drawTheaterPoster, drawGlobalPoster, levelColor, LEVEL, helpers: { wrap, textBlock, rrect, panel, footer, C, FONT, NUM } };
});
