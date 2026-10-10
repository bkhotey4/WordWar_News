/**
 * 1920x1080 Taiwan Strait Daily Tactical Map & C4ISR Overwatch Slide Generator (Poster Edition)
 * Features:
 * - Real Taiwan topographic defense map base (taiwan_strategic_targets.jpg)
 * - Large, high-impact poster typography & prominent executive summary callouts
 * - 4 Big Quantified Metric Cards (38 架次, 22 越中線, 13 艘在防, 山東艦編隊)
 * - Tactical vector overlays with large, crisp labels
 * - GlobalFonts registration for zero square box glyphs
 */

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const { taiwanStraitIntel } = require('./taiwan_strait_data');

// Register Windows native fonts to prevent missing glyphs
const FONT_PATH = 'C:\\Windows\\Fonts\\msjhbd.ttc';
if (fs.existsSync(FONT_PATH)) {
  try {
    GlobalFonts.registerFromPath(FONT_PATH, 'CustomJhengHei');
    GlobalFonts.registerFromPath(FONT_PATH, 'Microsoft JhengHei');
  } catch (e) {}
}

const OUTPUT_FILE = path.join(__dirname, '../public/images/taiwan_strait_tactical_map.png');
const BASE_MAP_FILE = path.join(__dirname, '../public/images/taiwan_strategic_targets.jpg');

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

async function generateTaiwanStraitMapSlide() {
  const intel = taiwanStraitIntel;
  const width = 1920;
  const height = 1080;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const fontTitle = 'bold 28px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  const fontHeader = 'bold 18px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  const fontBody = '15px "CustomJhengHei", "Microsoft JhengHei", sans-serif';

  // 1. Dark Tech Background Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#020617');
  bgGrad.addColorStop(0.5, '#070f26');
  bgGrad.addColorStop(1, '#020617');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Tactical Grid Lines
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = 0; y < height; y += 60) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }

  // 3. Top Header Bar (Executive Poster Banner)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1.8;
  drawRoundedRect(ctx, 40, 25, width - 80, 85, 12, true, true);

  // Red Badge
  ctx.fillStyle = '#dc2626';
  drawRoundedRect(ctx, 60, 42, 235, 34, 6, true, false);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 台海作戰全域 C4ISR', 74, 65);

  // Header Title
  ctx.fillStyle = '#f8fafc';
  ctx.font = fontTitle;
  ctx.fillText('台海每日戰術態勢圖：共軍演習、戰備警巡與灰色地帶衝突', 315, 65);

  // Right Status Subtitle
  ctx.fillStyle = '#f87171';
  ctx.font = 'bold 15px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('【中線常態化侵擾 ｜ 灰色地帶登檢隔離 ｜ 空潛立體進逼】', 1160, 50);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '13.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText(`情報時間戳: ${intel.lastUpdated} ｜ 資料庫: 國防部軍事情報通報 ｜ 戰備等級: ${intel.threatLevel}`, 1160, 76);

  // 4. LEFT SECTION: REAL TAIWAN STRAIT TACTICAL MAP (Width: 900px, Height: 920px)
  const mapX = 40;
  const mapY = 130;
  const mapW = 900;
  const mapH = 920;

  ctx.save();
  // Clip map area with rounded corners
  drawRoundedRect(ctx, mapX, mapY, mapW, mapH, 14, false, false);
  ctx.clip();

  // Load and draw real Taiwan military topographic map background
  if (fs.existsSync(BASE_MAP_FILE)) {
    try {
      const baseImg = await loadImage(BASE_MAP_FILE);
      ctx.drawImage(baseImg, 120, 40, baseImg.width - 240, baseImg.height - 80, mapX, mapY, mapW, mapH);
      ctx.fillStyle = 'rgba(2, 6, 23, 0.42)';
      ctx.fillRect(mapX, mapY, mapW, mapH);
    } catch (e) {
      console.error('Error loading base map:', e);
    }
  } else {
    ctx.fillStyle = '#061124';
    ctx.fillRect(mapX, mapY, mapW, mapH);
  }
  ctx.restore();

  // Draw Map Outer Border
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, mapX, mapY, mapW, mapH, 14, false, true);

  // Map Title Tab (Prominent)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  drawRoundedRect(ctx, mapX + 15, mapY + 15, 480, 40, 8, true, true);
  ctx.strokeStyle = '#38bdf8';
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 16.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 台海實體作戰地圖 (TAIWAN STRAIT TACTICAL MAP)', mapX + 28, mapY + 41);

  // --- DRAW TACTICAL OVERLAYS ON REAL MAP ---
  // 1. Median Line (Red dashed line)
  ctx.beginPath();
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
  ctx.lineWidth = 3;
  ctx.moveTo(mapX + 240, mapY + 130);
  ctx.lineTo(mapX + 410, mapY + 700);
  ctx.stroke();
  ctx.setLineDash([]);

  // Median Line Label
  ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
  drawRoundedRect(ctx, mapX + 235, mapY + 400, 240, 30, 6, true, false);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('--- 海峽中線 (MEDIAN LINE) ---', mapX + 248, mapY + 421);

  // 2. Taiwan ADIZ Boundary (Cyan dashed polygon)
  ctx.beginPath();
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
  ctx.lineWidth = 2.5;
  ctx.moveTo(mapX + 360, mapY + 110);
  ctx.lineTo(mapX + 760, mapY + 110);
  ctx.lineTo(mapX + 760, mapY + 800);
  ctx.lineTo(mapX + 260, mapY + 800);
  ctx.lineTo(mapX + 260, mapY + 620);
  ctx.stroke();
  ctx.setLineDash([]);

  // ADIZ Label
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  drawRoundedRect(ctx, mapX + 570, mapY + 120, 180, 28, 5, true, true);
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 13px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('台灣防空識別區 (ADIZ)', mapX + 582, mapY + 139);

  // Helper function for tactical arrow vectors with larger badges
  function drawVector(fromX, fromY, toX, toY, color, text) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3.5;
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - 16 * Math.cos(angle - Math.PI / 6), toY - 16 * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - 16 * Math.cos(angle + Math.PI / 6), toY - 16 * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    if (text) {
      ctx.font = 'bold 13.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
      const textW = ctx.measureText(text).width + 20;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      drawRoundedRect(ctx, (fromX + toX) / 2 - textW / 2, (fromY + toY) / 2 - 16, textW, 28, 5, true, true);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, (fromX + toX) / 2 - textW / 2 + 10, (fromY + toY) / 2 + 4);
    }
  }

  // Tactical Harassment & Blockade Vectors
  drawVector(mapX + 270, mapY + 180, mapX + 470, mapY + 230, '#ef4444', '殲-16 / 空警-500 (逼近台北42浬)');
  drawVector(mapX + 240, mapY + 330, mapX + 390, mapY + 350, '#ef4444', '蘇-30 雙向跨越中線');
  drawVector(mapX + 190, mapY + 440, mapX + 350, mapY + 470, '#c084fc', '俄機 RA-01966 (中線盤旋 37,100ft)');
  drawVector(mapX + 190, mapY + 680, mapX + 380, mapY + 630, '#f97316', '運-8反潛機 / 無偵-7 (空潛通道)');
  drawVector(mapX + 360, mapY + 790, mapX + 660, mapY + 720, '#dc2626', '轟-6K 攜反艦飛彈遠海長航');

  // Naval & Island Bases Tactical Markers (Larger Font)
  const navalUnits = [
    { label: '052D 神盾艦 (中線游弋)', x: mapX + 330, y: mapY + 540, color: '#ef4444' },
    { label: 'CCG 5901 萬噸海警船', x: mapX + 310, y: mapY + 700, color: '#f97316' },
    { label: '山東艦航母編隊 (西太機動)', x: mapX + 735, y: mapY + 680, color: '#dc2626' },
    { label: '龍田前進基地 (24機堡)', x: mapX + 160, y: mapY + 310, color: '#ef4444' }
  ];

  navalUnits.forEach(u => {
    ctx.font = 'bold 13px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    const uw = ctx.measureText(u.label).width + 24;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = u.color;
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, u.x - uw / 2, u.y - 14, uw, 28, 5, true, true);
    ctx.fillStyle = u.color;
    ctx.beginPath(); ctx.arc(u.x - uw / 2 + 12, u.y, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(u.label, u.x - uw / 2 + 22, u.y + 5);
  });

  // Map Bottom Legend (Poster Style, Larger)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.strokeStyle = '#475569';
  drawRoundedRect(ctx, mapX + 15, mapY + mapH - 58, mapW - 30, 46, 8, true, true);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 12.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('圖例:', mapX + 22, mapY + mapH - 29);

  ctx.fillStyle = '#c084fc';
  ctx.fillText('◆ 俄機中線盤旋 ｜ ', mapX + 58, mapY + mapH - 29);
  ctx.fillStyle = '#ef4444';
  ctx.fillText('■ 共機突防 ｜ ', mapX + 195, mapY + mapH - 29);
  ctx.fillStyle = '#f97316';
  ctx.fillText('▲ 灰色滲透 ｜ ', mapX + 300, mapY + mapH - 29);
  ctx.fillStyle = '#10b981';
  ctx.fillText('● 要塞雷達 ｜ ', mapX + 405, mapY + mapH - 29);
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('--- 中線 / ADIZ', mapX + 510, mapY + mapH - 29);

  // 5. RIGHT SECTION: POSTER EXECUTIVE SUMMARY & CARDS (Width: 900px, Height: 920px)
  const rightX = mapX + mapW + 40; // 980px
  const rightW = width - rightX - 40; // 900px

  // ==========================================
  // Zone A: 【今日核心情報摘要 & 4 大量化指標】
  // ==========================================
  const zoneAY = mapY;
  const zoneAH = 236;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1.8;
  drawRoundedRect(ctx, rightX, zoneAY, rightW, zoneAH, 12, true, true);

  // Executive Summary Callout (重點摘要頂部區塊)
  ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.2;
  drawRoundedRect(ctx, rightX + 16, zoneAY + 14, rightW - 32, 92, 8, true, true);

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 16px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 【今日台海戰略核心研判摘要 // EXECUTIVE TAKEAWAY】', rightX + 30, zoneAY + 38);

  ctx.fillStyle = '#c084fc';
  ctx.font = 'bold 14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('• 俄機異常擾台：俄籍飛行器 RA-01966 (FL371/257節) 沿中線於泉州外海盤旋折返，疑以特殊航跡誤導試探空防！', rightX + 30, zoneAY + 64);

  const m = intel.airSeaPatrolMetrics || {};
  const plaTotalNum = ((m.plaAircraftTotal || '').match(/\d+/) || ['38'])[0];
  const plaCrossNum = ((m.plaCrossMedianLine || '').match(/\d+/) || ['22'])[0];
  const plaVesselsNum = ((m.plaVesselsTotal || '').match(/\d+/) || ['13'])[0];

  ctx.fillStyle = '#fde047';
  ctx.fillText(`• 壓迫空防封鎖：單日共機 ${plaTotalNum} 架/越線 ${plaCrossNum} 架；萬噸海警 5901 外海卡位，試探模擬針對天然氣船（LNG）執法隔離。`, rightX + 30, zoneAY + 88);

  // 4 Big Poster Metric Cards (Large numbers)
  const metricCards = [
    { label: '共機出海總數', num: plaTotalNum, unit: '架次', sub: '24H 全海空動態', color: '#ef4444' },
    { label: '逾越海峽中線', num: plaCrossNum, unit: '架次', sub: '跨中線 / 入ADIZ', color: '#dc2626' },
    { label: '在防共艦/海警', num: plaVesselsNum, unit: '艘', sub: '海空圍堵艦船', color: '#f97316' },
    { label: '航母遠海長航', num: '山東艦', unit: '', sub: 'CV-17 西太編隊', color: '#38bdf8' }
  ];

  const mCardW = (rightW - 32 - 36) / 4; // ~208px each
  const mCardH = 104;
  const mCardY = zoneAY + 118;

  metricCards.forEach((mc, idx) => {
    const mx = rightX + 16 + idx * (mCardW + 12);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
    ctx.strokeStyle = mc.color;
    ctx.lineWidth = 1.4;
    drawRoundedRect(ctx, mx, mCardY, mCardW, mCardH, 8, true, true);

    // Label
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 13px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(mc.label, mx + 14, mCardY + 24);

    // Big Number / Text
    ctx.fillStyle = mc.color;
    if (mc.unit) {
      ctx.font = 'bold 36px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
      const numW = ctx.measureText(mc.num).width;
      ctx.fillText(mc.num, mx + 14, mCardY + 68);
      ctx.font = 'bold 15px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
      ctx.fillText(mc.unit, mx + 14 + numW + 8, mCardY + 68);
    } else {
      ctx.font = 'bold 26px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
      ctx.fillText(mc.num, mx + 14, mCardY + 66);
    }

    // Subtitle
    ctx.fillStyle = '#64748b';
    ctx.font = '12px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(mc.sub, mx + 14, mCardY + 92);
  });

  // ==========================================
  // Zone B: 【四大關鍵空海戰區防衛態勢】
  // ==========================================
  const secStartY = zoneAY + zoneAH + 12; // 378px
  const secH = 92;
  const secGap = 10;

  intel.sectors.forEach((sec, idx) => {
    const sy = secStartY + idx * (secH + secGap);
    const accent = idx === 1 ? '#ef4444' : (idx === 0 ? '#f59e0b' : (idx === 2 ? '#ef4444' : '#0284c7'));

    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.4;
    drawRoundedRect(ctx, rightX, sy, rightW, secH, 8, true, true);

    // Accent left stripe
    ctx.fillStyle = accent;
    drawRoundedRect(ctx, rightX, sy, 5, secH, 2, true, false);

    // Title & Threat (Larger Font)
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(`◆ ${sec.name}`, rightX + 18, sy + 27);

    ctx.fillStyle = accent;
    ctx.font = 'bold 14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    const tagW = ctx.measureText(`[${sec.threatLevel}]`).width;
    ctx.fillText(`[${sec.threatLevel}]`, rightX + rightW - tagW - 20, sy + 27);

    // PLA Action (Clear Font)
    ctx.fillStyle = '#fca5a5';
    ctx.font = 'bold 14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText('[共軍動態]', rightX + 18, sy + 54);
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '14.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(sec.plaAction, rightX + 98, sy + 54);

    // ROC Defense (Clear Font)
    ctx.fillStyle = '#93c5fd';
    ctx.font = 'bold 14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText('[國軍部署]', rightX + 18, sy + 78);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(sec.rocDefense, rightX + 98, sy + 78);
  });

  // ==========================================
  // Zone C: 【大陸對台四大灰色地帶作戰模式】
  // ==========================================
  const greyY = secStartY + 4 * (secH + secGap) + 6; // 792px
  const greyH = mapY + mapH - greyY; // ~258px

  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.6;
  drawRoundedRect(ctx, rightX, greyY, rightW, greyH, 10, true, true);

  // Title
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 17px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('【大陸對台四大灰色地帶作戰模式 (GREY-ZONE COERCION)】', rightX + 22, greyY + 30);

  intel.greyZoneTactics.forEach((gz, idx) => {
    const gy = greyY + 60 + idx * 48;

    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 15px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(gz.tactic, rightX + 24, gy);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(gz.desc, rightX + 24, gy + 22);
  });

  // Output buffer and save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(OUTPUT_FILE, buffer);
  console.log(`[TAIWAN STRAIT POSTER SUCCESS] 1920x1080 實體台灣海報地圖已生成至: ${OUTPUT_FILE}`);
}

if (require.main === module) {
  generateTaiwanStraitMapSlide().then(() => {
    console.log('[TAIWAN STRAIT] Directly rendered successfully.');
    process.exit(0);
  }).catch(err => {
    console.error('[TAIWAN STRAIT ERROR]', err);
    process.exit(1);
  });
}

module.exports = {
  generateTaiwanStraitMapSlide,
  OUTPUT_FILE
};

