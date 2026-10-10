/**
 * 1920x1080 Asia-Pacific Defense Intelligence Grid Slide Generator (Poster Edition)
 * Features:
 * - High-impact poster typography with prominent Executive Summary Callout
 * - 5 Strategic Sectors across First Island Chain (Taiwan Strait, Miyako, Bashi, Sabina, Korea)
 * - Large, clear font sizing and zero square box glyphs
 */

const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const { apacDefenseGrid } = require('./apac_data');

// Register Windows native fonts to prevent missing glyphs
const FONT_PATH = 'C:\\Windows\\Fonts\\msjhbd.ttc';
if (fs.existsSync(FONT_PATH)) {
  try {
    GlobalFonts.registerFromPath(FONT_PATH, 'CustomJhengHei');
    GlobalFonts.registerFromPath(FONT_PATH, 'Microsoft JhengHei');
  } catch (e) {}
}

const OUTPUT_FILE = path.join(__dirname, '../public/images/apac_theater_dossier.png');

function drawRoundedRect(ctx, x, y, width, height, radius, fill = true, stroke = true) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

async function generateApacSlide() {
  const width = 1920;
  const height = 1080;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#020617');
  bgGrad.addColorStop(0.5, '#0a1329');
  bgGrad.addColorStop(1, '#020617');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Tactical Grid
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = 0; y < height; y += 60) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }

  // Header Bar
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 1.8;
  drawRoundedRect(ctx, 40, 25, width - 80, 85, 12, true, true);

  // Badge
  ctx.fillStyle = '#dc2626';
  drawRoundedRect(ctx, 60, 42, 220, 34, 6, true, false);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 亞太軍事情報網 C4ISR', 74, 65);

  // Title
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 26px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('亞太區域軍事情報分析 // FIRST ISLAND CHAIN STRATEGIC GRID', 305, 65);

  // Telemetry (Right)
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 15px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('【五大關鍵作戰咽喉 ｜ 兵力序列 ORBAT ｜ 第一島鏈多重阻絕】', 1120, 50);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '13.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('情資監控: 美印太司令部 (INDOPACOM) ｜ 日本防衛省統合幕僚監部 ｜ 國防部軍情局', 1120, 76);

  // Prominent Poster Executive Summary Callout (帶出重點摘要)
  ctx.fillStyle = 'rgba(30, 41, 59, 0.92)';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.4;
  drawRoundedRect(ctx, 40, 122, width - 80, 74, 10, true, true);

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 16px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 【第一島鏈戰略情勢核心研判摘要 // THEATER STRATEGIC SUMMARY】', 60, 148);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 14.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('• 戰略圍堵與突破：解放軍以萬噸海警與海空多軸壓迫實施灰色地帶封控；美日菲以「第一島鏈反艦扼止環」展開實體聯防。', 60, 174);

  ctx.fillStyle = '#fde047';
  ctx.fillText('• 兩大前沿高危熱點：南海仙賓礁中菲衝突進入船體碰撞物理對峙；朝俄軍火軸線輸送數百萬砲彈交換俄方先進核導技術。', 980, 174);

  // 5 Sector Grid Layout (Top 3 boxes, Bottom 2 boxes)
  const topY = 210;
  const topBoxW = (width - 80 - 40) / 3; // 586px each
  const topBoxH = 405;

  function renderCard(s, x, y, w, h, borderColor) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.8;
    drawRoundedRect(ctx, x, y, w, h, 10, true, true);
    ctx.fillStyle = borderColor;
    drawRoundedRect(ctx, x, y, 6, h, 3, true, false);

    // Title & Threat (Larger Font)
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(s.name, x + 20, y + 34);

    ctx.fillStyle = borderColor;
    ctx.font = 'bold 14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    const tagW = ctx.measureText(s.threatLevel).width;
    ctx.fillText(s.threatLevel, x + w - tagW - 20, y + 34);

    // Forces (Larger, High-Contrast Bullets)
    let lineY = y + 72;
    const gap = 34;

    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 14.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText('• 解放軍部署: ', x + 20, lineY);
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '14.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(s.keyForces.pla, x + 125, lineY);

    lineY += gap;
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText('• 盟軍聯防陣位: ', x + 20, lineY);
    ctx.fillStyle = '#e0f2fe';
    ctx.font = '14.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(s.keyForces.allied, x + 140, lineY);

    lineY += gap;
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 14.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText('• 戰術博弈焦點: ', x + 20, lineY);
    ctx.fillStyle = '#fef08a';
    ctx.font = '14.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(s.tacticalFocus, x + 140, lineY);

    lineY += gap;
    ctx.fillStyle = '#a7f3d0';
    ctx.font = 'bold 14.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText('• 水道動態指標: ', x + 20, lineY);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(s.metrics, x + 140, lineY);

    lineY += gap + 6;
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText('• 深度情報研判: ' + s.analysis, x + 20, lineY);
  }

  // Row 1: 3 cards
  const colors = ['#ef4444', '#38bdf8', '#dc2626'];
  for (let i = 0; i < 3; i++) {
    const s = apacDefenseGrid.sectors[i];
    renderCard(s, 40 + i * (topBoxW + 20), topY, topBoxW, topBoxH, colors[i]);
  }

  // Row 2: 2 cards (Bottom row)
  const botY = topY + topBoxH + 16;
  const botBoxW = (width - 80 - 20) / 2; // 890px each
  const botBoxH = height - botY - 30; // ~420px
  const botColors = ['#f97316', '#eab308'];

  for (let i = 3; i < 5; i++) {
    const s = apacDefenseGrid.sectors[i];
    renderCard(s, 40 + (i - 3) * (botBoxW + 20), botY, botBoxW, botBoxH, botColors[i - 3]);
  }

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(OUTPUT_FILE, buffer);
  console.log('[APAC POSTER SUCCESS] 亞太軍事情報網海報圖卡已成功生成:', OUTPUT_FILE);
  return OUTPUT_FILE;
}

if (require.main === module) {
  generateApacSlide().then(r => {
    console.log('APAC Poster Generated:', r);
    process.exit(0);
  }).catch(e => {
    console.error('Error generating APAC slide:', e);
    process.exit(1);
  });
}

module.exports = {
  generateApacSlide,
  OUTPUT_FILE
};
