// 每週戰況週報圖卡（1920×1080）：四個戰區各一列，顯示 7 天警戒等級色條、本週 vs 上週關鍵數字、本週重點報導。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./poster_core'));
  else root.WeeklyCore = factory(root.PosterCore);
})(typeof self !== 'undefined' ? self : this, function (PC) {
  const { textBlock, rrect, C, FONT, NUM } = PC.helpers;
  const W = 1920, H = 1080, M = 48;

  function drawWeekly(makeCanvas, d) {
    const canvas = makeCanvas(W, H), ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, C.bg1); g.addColorStop(1, C.bg2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.fillStyle = C.cyan; ctx.fillRect(M, 40, 8, 64);
    ctx.shadowColor = 'rgba(0,229,255,0.6)'; ctx.shadowBlur = 18;
    ctx.font = `bold 56px ${FONT}`; ctx.fillStyle = C.text; ctx.fillText(d.title, M + 28, 96); ctx.shadowBlur = 0;
    ctx.font = `24px ${FONT}`; ctx.fillStyle = C.dim; ctx.fillText(d.subtitle, M + 30, 136);

    // 欄位標題
    const X = { name: M, strip: M + 330, kpi: M + 330 + 7 * 64 + 40, hl: M + 330 + 7 * 64 + 40 + 400 };
    const top = 170, rowH = (H - top - 90) / d.rows.length;
    ctx.font = `20px ${FONT}`; ctx.fillStyle = C.dim;
    ctx.fillText('戰區／目前等級', X.name, top + 4); ctx.fillText('7 天警戒等級', X.strip, top + 4); ctx.fillText('本週 vs 上週', X.kpi, top + 4); ctx.fillText('本週重點', X.hl, top + 4);
    d.rows.forEach((r, i) => {
      const y = top + 20 + i * rowH, h = rowH - 16;
      ctx.fillStyle = C.panel; rrect(ctx, M - 12, y, W - 2 * M + 24, h, 10); ctx.fill();
      const lc = PC.levelColor(r.level);
      ctx.fillStyle = lc; ctx.fillRect(M - 12, y + 12, 6, h - 24);
      textBlock(ctx, r.name, X.name + 10, y + 50, 300, 40, 1, `bold 34px ${FONT}`, C.text);
      ctx.font = `bold 26px ${FONT}`; const badge = r.level ? `第 ${r.level} 級 ${String(r.levelName || '').replace(/（.*）/, '')}` : '無法判定';
      const bw = ctx.measureText(badge).width + 28;
      ctx.fillStyle = lc; rrect(ctx, X.name + 10, y + 70, bw, 42, 8); ctx.fill();
      ctx.fillStyle = '#0b1220'; ctx.fillText(badge, X.name + 24, y + 100);
      // 7 天色條
      r.days.forEach((dd, k) => {
        const cx = X.strip + k * 64;
        ctx.fillStyle = dd.level ? PC.levelColor(dd.level) : 'rgba(148,163,184,0.25)';
        rrect(ctx, cx, y + 36, 54, 54, 6); ctx.fill();
        ctx.font = `bold 26px ${NUM}`; ctx.fillStyle = dd.level ? '#0b1220' : C.dim; ctx.fillText(dd.level ? String(dd.level) : '—', cx + 19, y + 72);
        ctx.font = `17px ${FONT}`; ctx.fillStyle = C.dim; const lw = ctx.measureText(dd.label).width; ctx.fillText(dd.label, cx + 27 - lw / 2, y + 114);
        if (dd.wd) { const ww = ctx.measureText(dd.wd).width; ctx.fillText(dd.wd, cx + 27 - ww / 2, y + 136); }
      });
      // KPI
      (r.kpis || []).slice(0, 2).forEach((k, j) => {
        const ky = y + 42 + j * Math.min(64, (h - 40) / 2);
        ctx.font = `19px ${FONT}`; ctx.fillStyle = C.dim; ctx.fillText(k.label, X.kpi, ky);
        ctx.font = `bold 34px ${NUM}`; ctx.fillStyle = C.text; const v = k.value == null ? '—' : String(k.value); ctx.fillText(v, X.kpi, ky + 36);
        const vw = ctx.measureText(v).width;
        let delta = '';
        if (k.value != null && k.prev != null) { const diff = k.value - k.prev; delta = diff === 0 ? '→ 持平' : `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}（上週 ${k.prev}）`; }
        ctx.font = `20px ${FONT}`; ctx.fillStyle = k.value != null && k.prev != null && k.value > k.prev ? '#f97316' : '#22c55e';
        if (delta) ctx.fillText(delta, X.kpi + vw + 14, ky + 34);
      });
      // 重點
      const hl = r.highlights.length ? r.highlights : ['本週沒有完成查核的報導；沒有資料不代表局勢平靜。'];
      let hy = y + 40;
      for (const t of hl.slice(0, 3)) { hy = textBlock(ctx, `• ${t}`, X.hl, hy, W - M - X.hl, 30, 2, `22px ${FONT}`, '#d6e4f2') + 6; if (hy > y + h - 10) break; }
    });
    ctx.fillStyle = 'rgba(0,229,255,0.2)'; ctx.fillRect(M, H - 62, W - M * 2, 1);
    textBlock(ctx, d.footer, M, H - 28, W - M * 2, 26, 1, `20px ${FONT}`, C.dim);
    return canvas;
  }
  return { drawWeekly, W, H };
});
