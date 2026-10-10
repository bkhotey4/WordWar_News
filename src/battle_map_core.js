// 戰場圖繪製核心：只用 Canvas 2D API，Node（@napi-rs/canvas）與瀏覽器共用，方便預覽與測試。
// 不做資料抓取；所有圖層都由呼叫端提供，且每個圖層都必須附來源說明（legend / footer）。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BattleMapCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TILE = 256;
  const lonToX = (lon, z) => (lon + 180) / 360 * TILE * 2 ** z;
  const latToY = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z; };

  // 找出能完整容納 bbox 的最大縮放層級
  function fitZoom(bbox, width, height, maxZoom = 12) {
    const [w, s, e, n] = bbox;
    for (let z = maxZoom; z >= 2; z--) {
      if (lonToX(e, z) - lonToX(w, z) <= width && latToY(s, z) - latToY(n, z) <= height) return z;
    }
    return 2;
  }

  function makeView(bbox, width, height, top = 0) {
    const z = fitZoom(bbox, width, height);
    const cx = (lonToX(bbox[0], z) + lonToX(bbox[2], z)) / 2, cy = (latToY(bbox[1], z) + latToY(bbox[3], z)) / 2;
    const ox = cx - width / 2, oy = cy - height / 2;
    const project = (lon, lat) => [lonToX(lon, z) - ox, latToY(lat, z) - oy + top];
    const tiles = [];
    for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + width) / TILE); tx++)
      for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + height) / TILE); ty++)
        if (ty >= 0 && ty < 2 ** z) tiles.push({ z, x: ((tx % 2 ** z) + 2 ** z) % 2 ** z, y: ty, px: tx * TILE - ox, py: ty * TILE - oy + top });
    const centerLat = bbox[1] / 2 + bbox[3] / 2;
    const metersPerPixel = 156543.03392 * Math.cos(centerLat * Math.PI / 180) / 2 ** z;
    return { z, width, height, top, project, tiles, metersPerPixel };
  }

  function wrapText(ctx, text, maxWidth) {
    const lines = [];
    for (const para of String(text || '').split('\n')) {
      let line = '';
      for (const ch of para) {
        if (ctx.measureText(line + ch).width > maxWidth && line) { lines.push(line); line = ''; }
        line += ch;
      }
      lines.push(line);
    }
    return lines;
  }

  function tracePolygons(ctx, view, polygons) {
    ctx.beginPath();
    for (const poly of polygons) for (const ring of poly) {
      ring.forEach(([lon, lat], i) => { const [x, y] = view.project(lon, lat); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
    }
  }

  // 以像素遮罩比較前後兩期控制區，回傳新增／減少的面積（km²）並畫出變化區
  function drawChange(ctx, view, layer, makeCanvas) {
    const { width, height, top } = view;
    const mask = polys => {
      const c = makeCanvas(width, height), g = c.getContext('2d');
      const shifted = { ...view, project: (lon, lat) => { const [x, y] = view.project(lon, lat); return [x, y - top]; } };
      g.fillStyle = '#ff0000'; tracePolygons(g, shifted, polys); g.fill('evenodd');
      return g.getImageData(0, 0, width, height).data;
    };
    const before = mask(layer.before), after = mask(layer.after);
    const out = ctx.getImageData(0, top, width, height);
    let gained = 0, lost = 0;
    for (let i = 0; i < before.length; i += 4) {
      const b = before[i] > 127, a = after[i] > 127;
      if (a === b) continue;
      const color = a ? layer.gainColor : layer.lossColor;
      if (a) gained++; else lost++;
      out.data[i] = color[0]; out.data[i + 1] = color[1]; out.data[i + 2] = color[2]; out.data[i + 3] = 255;
    }
    ctx.putImageData(out, 0, top);
    const km2 = px => Math.round(px * view.metersPerPixel ** 2 / 1e6);
    return { gainedKm2: km2(gained), lostKm2: km2(lost) };
  }

  // 不畫圖，只計算面積變化（供文字段落先用）
  function measureChange(makeCanvas, bbox, before, after, width = 1280, height = 760) {
    const view = makeView(bbox, width, height, 0);
    const mask = polys => { const c = makeCanvas(width, height), g = c.getContext('2d'); g.fillStyle = '#ff0000'; tracePolygons(g, view, polys); g.fill('evenodd'); return g.getImageData(0, 0, width, height).data; };
    const b = mask(before), a = mask(after);
    let gained = 0, lost = 0;
    for (let i = 0; i < b.length; i += 4) { const x = b[i] > 127, y = a[i] > 127; if (y && !x) gained++; else if (x && !y) lost++; }
    const km2 = px => Math.round(px * view.metersPerPixel ** 2 / 1e6);
    return { gainedKm2: km2(gained), lostKm2: km2(lost), metersPerPixel: view.metersPerPixel };
  }
  const planTiles = (bbox, width = 1280, height = 760) => makeView(bbox, width, height, 0).tiles.map(({ z, x, y }) => ({ z, x, y }));

  function drawArrow(ctx, [x1, y1], [x2, y2], color) {
    const a = Math.atan2(y2 - y1, x2 - x1), head = 16;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - head * Math.cos(a) * 0.8, y2 - head * Math.sin(a) * 0.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45));
    ctx.lineTo(x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
  }

  function label(ctx, text, x, y, color = '#ffffff', font = '600 17px') {
    ctx.font = `${font} ${FONT}`; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  const FONT = '"Microsoft JhengHei", "Noto Sans CJK TC", "Noto Sans TC", "PingFang TC", sans-serif';

  // spec: { width, title, paragraph, bbox, mapHeight, layers, legend, footer }
  // tiles: [{z,x,y,image}] 已下載的底圖（可為空，缺底圖時以深色背景繪製）
  function drawBattleMap(makeCanvas, spec, tiles = [], overlayTiles = []) {
    const width = spec.width || 1280, mapHeight = spec.mapHeight || 760, pad = 28;
    const probe = makeCanvas(10, 10).getContext('2d');
    probe.font = `24px ${FONT}`;
    const paraLines = wrapText(probe, spec.paragraph, width - pad * 2);
    const headerHeight = spec.mapOnly ? 0 : 70 + paraLines.length * 34 + 20;
    const footerHeight = spec.mapOnly ? 0 : 58;
    const canvas = makeCanvas(width, headerHeight + mapHeight + footerHeight), ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, width, canvas.height);
    // 標題與文字段落（在圖的上方，跟一般戰況圖貼文相同的版型）
    if (!spec.mapOnly) {
      ctx.fillStyle = '#ffffff'; ctx.font = `bold 32px ${FONT}`; ctx.fillText(spec.title, pad, 48);
      ctx.fillStyle = '#e6edf3'; ctx.font = `24px ${FONT}`;
      paraLines.forEach((l, i) => ctx.fillText(l, pad, 92 + i * 34));
    }

    const view = makeView(spec.bbox, width, mapHeight, headerHeight);
    ctx.fillStyle = '#1b2230'; ctx.fillRect(0, headerHeight, width, mapHeight);
    ctx.save(); ctx.beginPath(); ctx.rect(0, headerHeight, width, mapHeight); ctx.clip();
    for (const t of view.tiles) {
      const img = tiles.find(x => x.z === t.z && x.x === t.x && x.y === t.y)?.image;
      if (img) ctx.drawImage(img, t.px, t.py, TILE, TILE);
    }
    const stats = {};
    const drawOverlay = () => { for (const t of view.tiles) { const img = overlayTiles.find(x => x.z === t.z && x.x === t.x && x.y === t.y)?.image; if (img) ctx.drawImage(img, t.px, t.py, TILE, TILE); } };
    let overlayDone = false;
    for (const layer of spec.layers || []) {
      // 地名／國界疊加層畫在區域圖層之上、點位與箭頭之下
      if (!overlayDone && (layer.type === 'points' || layer.type === 'arrows')) { drawOverlay(); overlayDone = true; }
      if (layer.type === 'polygons') {
        ctx.globalAlpha = layer.alpha ?? 0.45; ctx.fillStyle = layer.fill; tracePolygons(ctx, view, layer.polygons); ctx.fill('evenodd');
        ctx.globalAlpha = 1; if (layer.stroke) { ctx.strokeStyle = layer.stroke; ctx.lineWidth = layer.lineWidth || 1.5; ctx.stroke(); }
      } else if (layer.type === 'change') {
        Object.assign(stats, drawChange(ctx, view, layer, makeCanvas));
      } else if (layer.type === 'line') {
        ctx.strokeStyle = layer.color; ctx.lineWidth = layer.lineWidth || 2.5; ctx.setLineDash(layer.dash || []);
        ctx.beginPath(); layer.coords.forEach(([lon, lat], i) => { const [x, y] = view.project(lon, lat); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
        ctx.setLineDash([]);
        if (layer.label) { const [x, y] = view.project(...layer.coords[layer.labelAt ?? 0]); label(ctx, layer.label, x + 8, y - 8, layer.color); }
      } else if (layer.type === 'heat') {
        // 熱區：事件點的放射狀光暈，疊加越多越亮
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const h of layer.items) {
          const [x, y] = view.project(h.lon, h.lat), r = (layer.radius || 46) * Math.sqrt(h.weight || 1);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, 'rgba(255,90,40,0.55)'); g.addColorStop(0.5, 'rgba(255,60,20,0.22)'); g.addColorStop(1, 'rgba(255,40,0,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      } else if (layer.type === 'arrows') {
        for (const a of layer.items) {
          const from = view.project(...a.from), to = view.project(...a.to);
          drawArrow(ctx, from, to, a.color || layer.color);
          if (a.label) label(ctx, a.label, (from[0] + to[0]) / 2 + 8, (from[1] + to[1]) / 2 - 8, a.color || layer.color, '600 16px');
        }
      } else if (layer.type === 'points') {
        for (const p of layer.items) {
          const [x, y] = view.project(p.lon, p.lat);
          ctx.beginPath(); ctx.arc(x, y, p.radius || layer.radius || 7, 0, Math.PI * 2);
          if (p.hollow) { ctx.strokeStyle = '#000'; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = p.color || layer.color; ctx.lineWidth = 3; ctx.stroke(); } // 空心＝未經多來源證實
          else { ctx.fillStyle = p.color || layer.color; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke(); }
          if (p.label) label(ctx, p.label, x + 10, y + 6, p.labelColor || '#ffffff', '600 16px');
        }
      }
    }
    if (!overlayDone) drawOverlay();
    // 比例尺
    const km = [1, 2, 5, 10, 20, 50, 100, 200, 500].find(k => k * 1000 / view.metersPerPixel > 90) || 500;
    const barPx = km * 1000 / view.metersPerPixel, by = headerHeight + mapHeight - 24;
    ctx.fillStyle = 'rgba(13,17,23,0.75)'; ctx.fillRect(width - barPx - 54, by - 26, barPx + 40, 38);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(width - barPx - 34, by); ctx.lineTo(width - 34, by); ctx.stroke();
    label(ctx, `${km} km`, width - barPx - 34, by - 8, '#ffffff', '15px');
    label(ctx, 'N ↑', width - 64, headerHeight + 34, '#ffffff', 'bold 20px');
    ctx.restore();

    // 圖例
    const legend = spec.legend || [];
    if (legend.length) {
      ctx.font = `16px ${FONT}`;
      const lw = Math.max(...legend.map(l => ctx.measureText(l.text).width)) + 56, lh = legend.length * 26 + 16;
      const lx = 16, ly = headerHeight + mapHeight - lh - 14;
      ctx.fillStyle = 'rgba(13,17,23,0.82)'; ctx.fillRect(lx, ly, lw, lh);
      legend.forEach((l, i) => {
        const y = ly + 22 + i * 26;
        ctx.fillStyle = l.color;
        if (l.shape === 'dot') { ctx.beginPath(); ctx.arc(lx + 20, y - 5, 7, 0, Math.PI * 2); ctx.fill(); }
        else if (l.shape === 'line') { ctx.fillRect(lx + 10, y - 7, 22, 4); }
        else ctx.fillRect(lx + 10, y - 14, 22, 16);
        ctx.fillStyle = '#e6edf3'; ctx.fillText(l.text, lx + 42, y);
      });
    }
    if (!spec.mapOnly) ctx.fillStyle = '#8b98a8', ctx.font = `15px ${FONT}`;
    if (!spec.mapOnly) wrapText(ctx, spec.footer || '', width - pad * 2).slice(0, 2).forEach((l, i) => ctx.fillText(l, pad, headerHeight + mapHeight + 24 + i * 21));
    return { canvas, stats, view: { z: view.z, tiles: view.tiles.map(({ z, x, y }) => ({ z, x, y })) } };
  }

  return { lonToX, latToY, fitZoom, makeView, wrapText, drawBattleMap, measureChange, planTiles, FONT };
});
