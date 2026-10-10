// 戰況報導圖卡（1920×1080 簡報風格，兩張）：第 1 張看重點＋位置圖／衛星影像，第 2 張看完整內容。
// Node 與瀏覽器共用；文字全部由報導資料提供，本檔只負責版面。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./poster_core'));
  else root.ReportCardCore = factory(root.PosterCore);
})(typeof self !== 'undefined' ? self : this, function (PC) {
  const { wrap, textBlock, rrect, panel, C, FONT } = PC.helpers;
  const W = 1920, H = 1080, M = 48;
  const KIND = { REPORTED: ['報導', '#40c4ff'], ANALYSIS: ['研判', '#ffd54f'], UNCERTAIN: ['待證', '#ff8a65'], OFFICIAL: ['官方', '#69f0ae'], SCENARIO: ['情境', '#b388ff'] };
  const kindOf = k => KIND[k] || ['重點', C.cyan];

  function bg(ctx) {
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, C.bg1); g.addColorStop(1, C.bg2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }
  function chip(ctx, text, x, y, color, size = 24) {
    ctx.font = `bold ${size}px ${FONT}`; const w = ctx.measureText(text).width + size;
    ctx.fillStyle = color; rrect(ctx, x, y, w, size * 1.6, 6); ctx.fill();
    ctx.fillStyle = '#0b1220'; ctx.fillText(text, x + size / 2, y + size * 1.15);
    return x + w;
  }
  // 頁首：戰區標籤、頁碼、標題（最多兩行）
  function header(ctx, d, page, title, size) {
    bg(ctx);
    ctx.fillStyle = C.cyan; ctx.fillRect(M, 40, 8, 40);
    let x = chip(ctx, d.theaterName || '全球', M + 22, 40, C.cyan, 24);
    ctx.font = `24px ${FONT}`; ctx.fillStyle = C.dim; ctx.fillText(`${d.kicker}　${page}/2`, x + 18, 72);
    ctx.font = `20px ${FONT}`; const t = `資料截至 ${d.asOf}`; ctx.fillText(t, W - M - ctx.measureText(t).width, 72);
    ctx.shadowColor = 'rgba(0,229,255,0.5)'; ctx.shadowBlur = 16;
    const end = textBlock(ctx, title, M, 104 + size, W - M * 2, size * 1.22, 2, `bold ${size}px ${FONT}`, C.text);
    ctx.shadowBlur = 0;
    return end;
  }
  function footerLine(ctx, text) {
    ctx.fillStyle = 'rgba(0,229,255,0.2)'; ctx.fillRect(M, H - 62, W - M * 2, 1);
    textBlock(ctx, text, M, H - 28, W - M * 2, 26, 1, `22px ${FONT}`, C.dim);
  }
  // 圖片以「填滿裁切」放進框內
  function drawCover(ctx, img, x, y, w, h) {
    const s = Math.max(w / img.width, h / img.height), sw = w / s, sh = h / s;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  }

  function slideHighlights(makeCanvas, d, picture) {
    const canvas = makeCanvas(W, H), ctx = canvas.getContext('2d');
    const top = header(ctx, d, 1, d.title, 54) + 22;
    const bodyH = H - 80 - top;
    // 左：位置圖或衛星影像
    const pw = picture ? 900 : 0;
    if (picture) {
      const box = panel(ctx, M, top, pw, bodyH, d.pictureTitle || '位置示意');
      ctx.save(); rrect(ctx, box.x, box.y, box.w, box.h - 44, 6); ctx.clip();
      drawCover(ctx, picture, box.x, box.y, box.w, box.h - 44); ctx.restore();
      textBlock(ctx, d.pictureCaption || '', box.x, box.y + box.h - 12, box.w, 24, 1, `19px ${FONT}`, C.dim);
    }
    // 右：重點（大字）
    const x0 = picture ? M + pw + 28 : M, cw = W - M - x0;
    const pts = d.points.slice(0, 4), gap = 18, ph = (bodyH - gap * (pts.length - 1)) / Math.max(1, pts.length);
    const size = picture ? 30 : 34, lh = Math.round(size * 1.35);
    pts.forEach((p, i) => {
      const y = top + i * (ph + gap), [kname, kcolor] = kindOf(p.kind);
      ctx.fillStyle = 'rgba(10,28,50,0.82)'; rrect(ctx, x0, y, cw, ph, 10); ctx.fill();
      ctx.fillStyle = kcolor; ctx.fillRect(x0, y + 14, 6, ph - 28);
      const cx = chip(ctx, kname, x0 + 24, y + 18, kcolor, 22);
      textBlock(ctx, p.label, cx + 14, y + 50, cw - (cx - x0) - 40, 40, 1, `bold 34px ${FONT}`, C.text);
      const lines = Math.max(1, Math.floor((ph - 78) / lh));
      textBlock(ctx, p.text, x0 + 24, y + 78 + size, cw - 48, lh, lines, `${size}px ${FONT}`, '#d6e4f2');
    });
    footerLine(ctx, `${d.refs.map(r => `[${r.n}] ${r.publisher} ${r.date}`).join('　')}　｜　完整內容見第 2 張`);
    return canvas;
  }

  // 依字級排版：兩欄依序填入，放不下回傳 null
  function layout(ctx, blocks, colW, colH, size) {
    const lh = Math.round(size * 1.45), out = []; let col = 0, y = 0;
    for (const b of blocks) {
      ctx.font = `${size}px ${FONT}`; const lines = wrap(ctx, b.text, colW - 24);
      const h = 50 + lines.length * lh + 26;
      if (y + h > colH) { if (col === 1 || y === 0) return null; col = 1; y = 0; }
      if (y + h > colH) return null;
      out.push({ ...b, lines, col, y, h, lh }); y += h;
    }
    return out;
  }

  function slideDetails(makeCanvas, d) {
    const canvas = makeCanvas(W, H), ctx = canvas.getContext('2d');
    const top = header(ctx, d, 2, '完整內容', 44) + 20;
    const refH = 36 + d.refs.length * 30, colH = H - 80 - top - refH, colW = (W - M * 2 - 28) / 2;
    const blocks = [...d.sections, ...(d.extra ? [{ kind: 'SCENARIO', label: '情境與觀察重點', text: d.extra }] : [])];
    let placed = null, size = 32, truncated = false;
    for (; size >= 19 && !placed; size--) placed = layout(ctx, blocks, colW, colH, size);
    if (!placed) { // 仍放不下：最小字級逐段截斷
      size = 19; truncated = true; const lh = Math.round(size * 1.45), per = Math.max(2, Math.floor((colH * 2 / blocks.length - 76) / lh));
      ctx.font = `${size}px ${FONT}`;
      placed = layout(ctx, blocks.map(b => { const l = wrap(ctx, b.text, colW - 24); return l.length > per ? { ...b, text: l.slice(0, per).join('').replace(/.$/, '…') } : b; }), colW, colH, size) || [];
    }
    for (const b of placed) {
      const x = M + b.col * (colW + 28), y = top + b.y, [kname, kcolor] = kindOf(b.kind);
      ctx.fillStyle = 'rgba(10,28,50,0.82)'; rrect(ctx, x, y, colW, b.h - 12, 8); ctx.fill();
      ctx.fillStyle = kcolor; ctx.fillRect(x, y + 10, 5, b.h - 32);
      const cx = chip(ctx, kname, x + 16, y + 10, kcolor, 18);
      textBlock(ctx, `${b.label}${b.refs ? `　${b.refs}` : ''}`, cx + 12, y + 36, colW - (cx - x) - 24, 30, 1, `bold 26px ${FONT}`, C.text);
      ctx.font = `${size}px ${FONT}`; ctx.fillStyle = '#d6e4f2';
      b.lines.forEach((l, i) => ctx.fillText(l, x + 16, y + 50 + size + i * b.lh));
    }
    // 來源
    const ry = H - 72 - refH;
    ctx.fillStyle = 'rgba(0,229,255,0.2)'; ctx.fillRect(M, ry, W - M * 2, 1);
    ctx.font = `bold 22px ${FONT}`; ctx.fillStyle = C.cyan; ctx.fillText('來源', M, ry + 30);
    d.refs.forEach((r, i) => textBlock(ctx, `[${r.n}] ${r.publisher}｜發布 ${r.date}｜${r.host}`, M + 70, ry + 30 + i * 30, W - M * 2 - 70, 30, 1, `20px ${FONT}`, C.dim));
    footerLine(ctx, `${d.footer}${truncated ? '　｜　部分段落已截短，完整文字與連結見下方訊息' : ''}`);
    return { canvas, truncated };
  }

  function drawReportCards(makeCanvas, d, picture) {
    const s2 = slideDetails(makeCanvas, d);
    return { slides: [slideHighlights(makeCanvas, d, picture), s2.canvas], truncated: s2.truncated };
  }
  return { W, H, KIND, drawReportCards };
});
