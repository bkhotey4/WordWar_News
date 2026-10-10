/**
 * 1920x1080 Military Warfare & Readiness Tactical Slide Generator (Poster Edition)
 * Produces:
 * 1. ukraine_frontline_dossier.png (Pokrovsk, Kursk, Toretsk, Chasiv Yar Frontline Contacts)
 * 2. military_readiness_dossier.png (NATO/Russia Ammo Burn Rate & PLA 3-Stage Mobilization)
 * Features:
 * - Large, high-impact poster typography and prominent Executive Summary Callouts
 * - MicroSoft JhengHei Native Skia GlobalFonts registration
 * - Zero square box glyphs, punchy bullet points
 */

const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const { warfareIntel } = require('./warfare_data');

// Register Windows native fonts to prevent missing glyphs
const FONT_PATH = 'C:\\Windows\\Fonts\\msjhbd.ttc';
if (fs.existsSync(FONT_PATH)) {
  try {
    GlobalFonts.registerFromPath(FONT_PATH, 'CustomJhengHei');
    GlobalFonts.registerFromPath(FONT_PATH, 'Microsoft JhengHei');
  } catch (e) {}
}

const UKRAINE_SLIDE_FILE = path.join(__dirname, '../public/images/ukraine_frontline_dossier.png');
const READINESS_SLIDE_FILE = path.join(__dirname, '../public/images/military_readiness_dossier.png');

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

/**
 * 1. Generate 1920x1080 Ukraine Frontline Tactical SITREP Slide (Poster Edition)
 */
async function generateUkraineFrontlineSlide() {
  const width = 1920;
  const height = 1080;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#020617');
  bgGrad.addColorStop(0.5, '#0b1329');
  bgGrad.addColorStop(1, '#020617');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle grid
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
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.8;
  drawRoundedRect(ctx, 40, 25, width - 80, 85, 12, true, true);

  // Badge
  ctx.fillStyle = '#ef4444';
  drawRoundedRect(ctx, 60, 42, 235, 34, 6, true, false);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 俄烏接觸線實時 SITREP', 74, 65);

  // Title
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 26px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('俄烏前線接觸線戰術態勢研判 // UKRAINE FRONTLINE SITREP', 315, 65);

  // Right Status
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 15px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('【紅軍城樞紐決戰 ｜ 庫斯克機動反擊 ｜ 查西夫雅爾運河防線】', 1240, 50);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '13.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('情報來源: ISW 戰爭研究所 ｜ 烏總參謀部 ｜ DeepState OSINT ｜ FIRMS 熱火', 1240, 76);

  // Prominent Executive Summary Callout (帶出重點摘要)
  ctx.fillStyle = 'rgba(30, 41, 59, 0.92)';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.4;
  drawRoundedRect(ctx, 40, 122, width - 80, 72, 10, true, true);

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 16px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 【俄烏前線接觸線核心戰局研判摘要 // THEATER EXECUTIVE SUMMARY】', 60, 146);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('• 紅軍城決戰：俄軍先頭部隊距紅軍城外圍鐵路僅 6.5 公里，採鉗形攻勢包夾塞利多韋，頓巴斯鐵路動脈告急！', 60, 172);

  ctx.fillStyle = '#fde047';
  ctx.fillText('• 庫斯克與北約邊境：烏軍控制庫斯克突出部；北約東翼波蘭/羅馬尼亞/摩爾多瓦接連遭遇俄無人機與直升機越界擦邊。', 980, 172);

  // 4 Sector Cards (strictly 2x2 grid to fit 1920x1080 canvas)
  const sectors = warfareIntel.frontlineContacts.sectors.slice(0, 4);
  const startY = 206;
  const colW = (width - 80 - 30) / 2; // 885px each col
  const rowH = 385;

  sectors.forEach((sec, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const boxX = 40 + col * (colW + 30);
    const boxY = startY + row * (rowH + 16);

    const accentColor = idx === 0 ? '#ef4444' : (idx === 1 ? '#38bdf8' : (idx === 2 ? '#f59e0b' : '#10b981'));

    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.6;
    drawRoundedRect(ctx, boxX, boxY, colW, rowH, 12, true, true);

    // Accent left stripe
    ctx.fillStyle = accentColor;
    drawRoundedRect(ctx, boxX, boxY, 6, rowH, 3, true, false);

    // Sector Title Badge (Larger)
    ctx.fillStyle = 'rgba(30, 41, 59, 0.92)';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, boxX + 18, boxY + 16, colW - 36, 44, 6, true, true);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(sec.name, boxX + 32, boxY + 44);

    // Status Tag (Larger)
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 13.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    const statusW = ctx.measureText(sec.status).width;
    ctx.fillText(sec.status, boxX + colW - statusW - 30, boxY + 44);

    // Content lines - Poster bullet cards
    let lineY = boxY + 88;

    // Bullet 1: Contact & Distance
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 14.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText('• [當前接觸態勢 / 距離]', boxX + 24, lineY);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(sec.distanceToCity, boxX + 215, lineY);

    // Bullet 2: Russian ORBAT
    lineY += 46;
    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 14.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText('• [俄軍作戰序列 ORBAT]', boxX + 24, lineY);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(sec.ruUnits, boxX + 24, lineY + 22);

    // Bullet 3: Ukrainian Defense & Counter Echelons
    lineY += 52;
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText('• [烏軍守備與反擊梯隊]', boxX + 24, lineY);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(sec.uaUnits, boxX + 24, lineY + 22);

    // Bullet 4: Situation tactical analysis
    lineY += 52;
    ctx.fillStyle = '#86efac';
    ctx.font = 'bold 14.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText('• [戰況深度戰術研判]', boxX + 24, lineY);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '13.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    const textWrap = sec.situation;
    ctx.fillText(textWrap.substring(0, 48), boxX + 24, lineY + 24);
    if (textWrap.length > 48) {
      ctx.fillText(textWrap.substring(48), boxX + 24, lineY + 46);
    }
  });

  // Global bottom verdict
  const botY = height - 64;
  ctx.fillStyle = 'rgba(2, 6, 23, 0.95)';
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 1.2;
  drawRoundedRect(ctx, 40, botY, width - 80, 48, 8, true, true);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 14.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 前線戰局總體評估 (THEATER VERDICT):', 55, botY + 30);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '13.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('頓巴斯戰線進入高強度樞紐奪取階段，俄軍以日均數百米推進並承受裝甲高折損；烏軍庫斯克第二走廊牽制俄軍南線增援，冬季泥濘期將成雙方補給分水嶺！', 380, botY + 30);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(UKRAINE_SLIDE_FILE, buffer);
  console.log('[WARFARE POSTER SUCCESS] 俄烏前線海報圖卡生成成功:', UKRAINE_SLIDE_FILE);
  return UKRAINE_SLIDE_FILE;
}

/**
 * 2. Generate 1920x1080 Military Readiness & Mobilization Slide (Poster Edition)
 */
async function generateMilitaryReadinessSlide() {
  const width = 1920;
  const height = 1080;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#020617');
  bgGrad.addColorStop(0.5, '#0d1527');
  bgGrad.addColorStop(1, '#020617');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Grid
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
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.8;
  drawRoundedRect(ctx, 40, 25, width - 80, 85, 12, true, true);

  // Badge
  ctx.fillStyle = '#d97706';
  drawRoundedRect(ctx, 60, 42, 230, 34, 6, true, false);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 軍事準備與動員儀表板', 74, 65);

  // Title
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 26px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('全球軍事實體整備度與平戰轉換 // READINESS DASHBOARD', 315, 65);

  // Right Status
  ctx.fillStyle = '#fde047';
  ctx.font = 'bold 15px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('【北約 155mm 產能 ｜ 俄軍合約兵動員 ｜ 解放軍三階段動員燈號】', 1230, 50);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '13.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('國防情報智庫: CSIS 華府戰略研究所 ｜ RUSI 英國皇家三軍所 ｜ 國防部戰評', 1230, 76);

  // Prominent Executive Summary Callout (帶出重點摘要)
  ctx.fillStyle = 'rgba(30, 41, 59, 0.92)';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.4;
  drawRoundedRect(ctx, 40, 122, width - 80, 72, 10, true, true);

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 16px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 【全球軍事實體準備與動員燈號核心摘要 // READINESS EXECUTIVE SUMMARY】', 60, 146);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('• 彈藥產能天秤：北約 155mm 年產提至 120 萬發（回補率 68%）；俄軍月招 3 萬合約兵、前線 45% 砲彈依賴平壤供應。', 60, 172);

  ctx.fillStyle = '#fde047';
  ctx.fillText('• 中共三階段動員：目前處於【階段一：常態演訓與物資儲備】；不可逆門檻【階段二：滾裝客輪徵用>20%】尚未觸發。', 980, 172);

  // 3 Vertical Panels
  const panelW = (width - 80 - 40) / 3; // 586px each
  const panelH = 835;
  const startY = 206;

  // Panel 1: NATO Readiness & Production
  const p1X = 40;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.8;
  drawRoundedRect(ctx, p1X, startY, panelW, panelH, 12, true, true);

  // Accent stripe
  ctx.fillStyle = '#38bdf8';
  drawRoundedRect(ctx, p1X, startY, 6, panelH, 3, true, false);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 20px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('■ 北約與美軍軍備整備度 (NATO READINESS)', p1X + 25, startY + 40);

  const natoData = [
    { title: '155mm 砲彈產能提昇', desc: warfareIntel.militaryReadiness.natoReadiness.ammoProductionRate, highlight: '120 萬發/年' },
    { title: '戰備庫存回補率', desc: warfareIntel.militaryReadiness.natoReadiness.usStockpileReplenishment, highlight: '68% 穩步回補' },
    { title: '東翼快速反應防衛兵力', desc: warfareIntel.militaryReadiness.natoReadiness.easternFlankReadiness, highlight: '30 萬官兵 30 天戰備' },
    { title: 'F-16 戰機實戰攔截到位', desc: warfareIntel.militaryReadiness.natoReadiness.f16CombatStatus, highlight: '首批 F-16 執行防空' }
  ];

  let p1Y = startY + 70;
  natoData.forEach(item => {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.72)';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, p1X + 18, p1Y, panelW - 36, 172, 8, true, true);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 16.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText('◆ ' + item.title, p1X + 32, p1Y + 30);

    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText('[進度指標] ' + item.highlight, p1X + 32, p1Y + 58);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(item.desc.substring(0, 34), p1X + 32, p1Y + 92);
    if (item.desc.length > 34) {
      ctx.fillText(item.desc.substring(34), p1X + 32, p1Y + 116);
    }

    p1Y += 188;
  });

  // Panel 2: Russia War Machine & Attrition
  const p2X = p1X + panelW + 20;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1.8;
  drawRoundedRect(ctx, p2X, startY, panelW, panelH, 12, true, true);

  // Accent stripe
  ctx.fillStyle = '#ef4444';
  drawRoundedRect(ctx, p2X, startY, 6, panelH, 3, true, false);

  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 20px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('■ 俄羅斯戰時經濟與動員 (RUSSIAN ATTRITION)', p2X + 25, startY + 40);

  const ruData = [
    { title: '合約兵持續招募速率', desc: warfareIntel.militaryReadiness.russiaMobilization.recruitmentRate, highlight: '30,000 人/月' },
    { title: '戰車裝甲翻新與整修', desc: warfareIntel.militaryReadiness.russiaMobilization.tankRefurbishment, highlight: '月修復 70-80 輛' },
    { title: '外部軍火依賴度 (北韓)', desc: warfareIntel.militaryReadiness.russiaMobilization.foreignAmmoSupply, highlight: '佔前線 45% 砲彈' },
    { title: '防空與巡弋飛彈產能', desc: warfareIntel.militaryReadiness.russiaMobilization.sanctionEvasion, highlight: '月產 110-130 枚' }
  ];

  let p2Y = startY + 70;
  ruData.forEach(item => {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.72)';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, p2X + 18, p2Y, panelW - 36, 172, 8, true, true);

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 16.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText('◆ ' + item.title, p2X + 32, p2Y + 30);

    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText('[戰場指標] ' + item.highlight, p2X + 32, p2Y + 58);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(item.desc.substring(0, 34), p2X + 32, p2Y + 92);
    if (item.desc.length > 34) {
      ctx.fillText(item.desc.substring(34), p2X + 32, p2Y + 116);
    }

    p2Y += 188;
  });

  // Panel 3: PLA 3-Stage Mobilization Radar
  const p3X = p2X + panelW + 20;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.8;
  drawRoundedRect(ctx, p3X, startY, panelW, panelH, 12, true, true);

  // Accent stripe
  ctx.fillStyle = '#f59e0b';
  drawRoundedRect(ctx, p3X, startY, 6, panelH, 3, true, false);

  ctx.fillStyle = '#fde047';
  ctx.font = 'bold 20px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
  ctx.fillText('■ 中共對台三階段軍事動員燈號 (PLA POSTURE)', p3X + 25, startY + 40);

  const plaStages = [
    {
      stage: '階段一：常態演訓與戰略儲備',
      status: '[狀態: 活躍中 (CURRENT)]',
      statusColor: '#22c55e',
      detail: warfareIntel.militaryReadiness.plaThreeStageMobilization.stage1_Status,
      assessment: '灰色地帶警巡常態化，軍工全天候運轉，戰略石油/糧食庫存持續充實。'
    },
    {
      stage: '階段二：民船徵用與交通管制',
      status: '[狀態: 未觸發 (CRITICAL BARRIER)]',
      statusColor: '#f59e0b',
      detail: warfareIntel.militaryReadiness.plaThreeStageMobilization.stage2_Status,
      assessment: '不可逆臨界點：一旦沿海大型滾裝客輪徵用率 > 20% 或東南民航大面積停飛，進入開戰倒數！'
    },
    {
      stage: '階段三：戰地展開與登船集結',
      status: '[狀態: 未觸發 (IMMINENT ATTACK)]',
      statusColor: '#94a3b8',
      detail: warfareIntel.militaryReadiness.plaThreeStageMobilization.stage3_Status,
      assessment: '最後 48-72 小時：野戰醫院前推至登陸港口、通信全頻段無線電靜默、先頭部隊實彈裝船。'
    }
  ];

  let p3Y = startY + 70;
  plaStages.forEach(item => {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.72)';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, p3X + 18, p3Y, panelW - 36, 238, 8, true, true);

    ctx.fillStyle = item.statusColor;
    ctx.font = 'bold 16.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText('◆ ' + item.stage, p3X + 32, p3Y + 30);

    ctx.fillStyle = item.statusColor;
    ctx.font = 'bold 14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(item.status, p3X + 32, p3Y + 58);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText(item.detail.substring(0, 32), p3X + 32, p3Y + 92);
    if (item.detail.length > 32) {
      ctx.fillText(item.detail.substring(32), p3X + 32, p3Y + 116);
    }

    ctx.fillStyle = '#fde047';
    ctx.font = '13.5px "CustomJhengHei", "Microsoft JhengHei", sans-serif';
    ctx.fillText('[情報研判] ' + item.assessment.substring(0, 28), p3X + 32, p3Y + 158);
    if (item.assessment.length > 28) {
      ctx.fillText(item.assessment.substring(28), p3X + 32, p3Y + 182);
    }

    p3Y += 254;
  });

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(READINESS_SLIDE_FILE, buffer);
  console.log('[WARFARE POSTER SUCCESS] 軍事準備與動員海報圖卡生成成功:', READINESS_SLIDE_FILE);
  return READINESS_SLIDE_FILE;
}

async function generateAllWarfareSlides() {
  const front = await generateUkraineFrontlineSlide();
  const ready = await generateMilitaryReadinessSlide();
  return { frontline: front, readiness: ready };
}

if (require.main === module) {
  generateAllWarfareSlides().then(r => {
    console.log('All Warfare Slides Generated:', r);
    process.exit(0);
  }).catch(e => {
    console.error('Error generating warfare slides:', e);
    process.exit(1);
  });
}

module.exports = {
  generateUkraineFrontlineSlide,
  generateMilitaryReadinessSlide,
  generateAllWarfareSlides
};
